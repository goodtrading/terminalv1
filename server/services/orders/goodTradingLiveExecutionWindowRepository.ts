import { pool } from "../../db";
import {
  createLiveExecutionWindow,
  validateLiveExecutionWindowLimits,
  windowTimestampColumn,
  type LiveExecutionWindow,
  type LiveExecutionWindowLimits,
} from "../../../shared/liveExecutionWindow";

export type LiveExecutionEvidenceRow = Readonly<{
  scopeKey: string;
  accountUid: string;
  environment: "LIVE";
  broker: string;
  source: string;
  marketInstrument: string;
  marketVenue: string;
  marketType: "Spot" | "Perpetual";
  logicalOrderUid: string;
  executionId: string;
  side: string;
  quantity: string;
  price: string;
  feeAmount: string | null;
  feeAsset: string | null;
  feeConflict: boolean;
  sourceTimestamp: string | null;
  observedAt: string;
  clientOrderId: string | null;
  brokerOrderId: string | null;
  windowMembershipTimestamp: string;
}>;

export type LiveExecutionConflict = Readonly<{
  scopeKey: string;
  executionId: string;
  observationCount: number;
}>;

export type LiveExecutionWindowSelection = Readonly<{
  window: LiveExecutionWindow;
  accountUid: string;
  eligibleExecutions: readonly LiveExecutionEvidenceRow[];
  conflicts: readonly LiveExecutionConflict[];
  unavailable: Readonly<{ missingSelectedTimestamp: number }>;
  hasMore: boolean;
  nextCursor: string | null;
}>;

type QueryResult = { rows: Record<string, unknown>[] };
type Query = (text: string, values?: readonly unknown[]) => Promise<QueryResult>;

const scopeExpression = `concat_ws(chr(31), i.goodtrading_account_uid, i.execution_environment, i.execution_broker, i.execution_market_instrument, i.execution_market_venue, i.execution_market_type, i.logical_order_uid, s.execution_id)`;

function requireDatabaseQuery(): Query {
  const database = pool;
  if (!database) throw new Error("DATABASE_UNAVAILABLE");
  return (text, values) => database.query(text, values as unknown[]);
}

function text(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== "string" || row[key] === "") throw new Error(`INVALID_LIVE_EXECUTION_EVIDENCE_${key.toUpperCase()}`);
  return row[key] as string;
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  return row[key] == null ? null : String(row[key]);
}

function mapRow(row: Record<string, unknown>, windowMembershipTimestamp: string): LiveExecutionEvidenceRow {
  const environment = text(row, "execution_environment");
  if (environment !== "LIVE") throw new Error("LIVE_EXECUTION_EVIDENCE_ENVIRONMENT_REQUIRED");
  return {
    scopeKey: text(row, "scope_key"),
    accountUid: text(row, "goodtrading_account_uid"),
    environment: "LIVE",
    broker: text(row, "execution_broker"),
    source: text(row, "source"),
    marketInstrument: text(row, "execution_market_instrument"),
    marketVenue: text(row, "execution_market_venue"),
    marketType: text(row, "execution_market_type") as "Spot" | "Perpetual",
    logicalOrderUid: text(row, "logical_order_uid"),
    executionId: text(row, "execution_id"),
    side: text(row, "side"),
    quantity: text(row, "quantity"),
    price: text(row, "price"),
    feeAmount: nullableText(row, "fee_amount"),
    feeAsset: nullableText(row, "fee_asset"),
    feeConflict: Boolean(row.fee_conflict),
    sourceTimestamp: nullableText(row, "source_timestamp"),
    observedAt: text(row, "observed_at"),
    clientOrderId: nullableText(row, "client_order_id"),
    brokerOrderId: nullableText(row, "broker_order_id"),
    windowMembershipTimestamp,
  };
}

function immutableFacts(row: LiveExecutionEvidenceRow): string {
  return JSON.stringify([
    row.accountUid, row.environment, row.broker, row.marketInstrument, row.marketVenue,
    row.marketType, row.logicalOrderUid, row.executionId, row.side, row.quantity,
    row.price, row.feeAmount, row.feeAsset, row.feeConflict, row.sourceTimestamp,
  ]);
}

function cursorValues(cursor: string | null): { time: string; scopeKey: string } | null {
  if (cursor == null) return null;
  try {
    const parsed = JSON.parse(cursor) as { time?: unknown; scopeKey?: unknown };
    if (typeof parsed.time !== "string" || typeof parsed.scopeKey !== "string") throw new Error("invalid");
    return { time: parsed.time, scopeKey: parsed.scopeKey };
  } catch {
    throw new Error("INVALID_LIVE_EXECUTION_WINDOW_CURSOR");
  }
}

export async function selectLiveExecutionEvidence(input: Readonly<{
  accountUid: string;
  window: LiveExecutionWindow;
  limits: LiveExecutionWindowLimits;
  cursor?: string | null;
  query?: Query;
}>): Promise<LiveExecutionWindowSelection> {
  const accountUid = input.accountUid.trim();
  if (!accountUid) throw new Error("ACCOUNT_UID_REQUIRED");
  const window = createLiveExecutionWindow(input.window);
  validateLiveExecutionWindowLimits(window, input.limits);
  const query = input.query ?? requireDatabaseQuery();
  const policyColumn = windowTimestampColumn(window.timestampPolicy);
  const cursor = cursorValues(input.cursor ?? null);
  const cursorClause = cursor ? `AND (candidate.membership_time, candidate.scope_key) > ($4::timestamptz, $5::text)` : "";
  const candidateValues = cursor
    ? [accountUid, window.startInclusive, window.endExclusive, cursor.time, cursor.scopeKey, input.limits.pageSize + 1]
    : [accountUid, window.startInclusive, window.endExclusive, input.limits.pageSize + 1];
  const cursorParams = cursor ? "$4/$5" : "not used";
  void cursorParams;
  const candidateResult = await query(`
    WITH candidate AS (
      SELECT ${scopeExpression} AS scope_key, MIN(s.${policyColumn}) AS membership_time
        FROM goodtrading_broker_observation_snapshots s
        JOIN goodtrading_broker_objects o ON o.id = s.broker_object_id
        JOIN goodtrading_order_intents i ON i.id = o.intent_id
       WHERE i.goodtrading_account_uid = $1
         AND i.execution_environment = 'LIVE'
         AND o.classification = 'GT_LINKED'
         AND o.broker_account_identity = i.goodtrading_account_uid
         AND s.execution_id IS NOT NULL
         AND s.side IS NOT NULL AND s.quantity IS NOT NULL AND s.price IS NOT NULL
         AND s.${policyColumn} IS NOT NULL
         AND s.${policyColumn} >= $2::timestamptz
         AND s.${policyColumn} < $3::timestamptz
       GROUP BY ${scopeExpression}
    )
    SELECT scope_key, membership_time::text AS membership_time
      FROM candidate
     WHERE 1=1 ${cursorClause}
     ORDER BY membership_time ASC, scope_key ASC
     LIMIT $${cursor ? 6 : 4}
  `, candidateValues);
  const candidates = candidateResult.rows.map((row) => ({ scopeKey: text(row, "scope_key"), membershipTime: text(row, "membership_time") }));
  const pageCandidates = candidates.slice(0, input.limits.pageSize);
  const hasMore = candidates.length > input.limits.pageSize;
  const unavailableResult = await query(`
    SELECT count(*)::int AS unavailable_count
      FROM goodtrading_broker_observation_snapshots s
      JOIN goodtrading_broker_objects o ON o.id = s.broker_object_id
      JOIN goodtrading_order_intents i ON i.id = o.intent_id
     WHERE i.goodtrading_account_uid = $1
       AND i.execution_environment = 'LIVE'
       AND o.classification = 'GT_LINKED'
       AND o.broker_account_identity = i.goodtrading_account_uid
       AND s.execution_id IS NOT NULL
       AND s.${policyColumn} IS NULL
  `, [accountUid]);
  const missingSelectedTimestamp = Number(unavailableResult.rows[0]?.unavailable_count ?? 0);
  if (!Number.isSafeInteger(missingSelectedTimestamp) || missingSelectedTimestamp < 0) throw new Error("INVALID_LIVE_EXECUTION_UNAVAILABLE_COUNT");
  if (pageCandidates.length === 0) {
    return { window, accountUid, eligibleExecutions: [], conflicts: [], unavailable: { missingSelectedTimestamp }, hasMore: false, nextCursor: null };
  }
  const scopeKeys = pageCandidates.map((candidate) => candidate.scopeKey);
  const evidenceResult = await query(`
    SELECT ${scopeExpression} AS scope_key, i.goodtrading_account_uid, i.execution_environment,
           i.execution_broker, i.execution_market_instrument, i.execution_market_venue,
           i.execution_market_type, i.logical_order_uid, s.execution_id, s.source,
           s.side, s.quantity::text, s.price::text, s.fee_amount, s.fee_asset,
           s.fee_conflict, to_char(timezone('UTC', s.source_timestamp), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS source_timestamp,
           to_char(timezone('UTC', s.observed_at), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,
           s.client_order_id, s.broker_order_id
      FROM goodtrading_broker_observation_snapshots s
      JOIN goodtrading_broker_objects o ON o.id = s.broker_object_id
      JOIN goodtrading_order_intents i ON i.id = o.intent_id
     WHERE i.goodtrading_account_uid = $1
       AND i.execution_environment = 'LIVE'
       AND o.classification = 'GT_LINKED'
       AND o.broker_account_identity = i.goodtrading_account_uid
       AND ${scopeExpression} = ANY($2::text[])
     ORDER BY scope_key ASC, s.observed_at ASC, s.id ASC
  `, [accountUid, scopeKeys]);
  const membershipByScope = new Map(pageCandidates.map((candidate) => [candidate.scopeKey, candidate.membershipTime]));
  const grouped = new Map<string, LiveExecutionEvidenceRow[]>();
  for (const raw of evidenceResult.rows) {
    const scopeKey = text(raw, "scope_key");
    const membershipTime = membershipByScope.get(scopeKey);
    if (!membershipTime) throw new Error("LIVE_EXECUTION_MEMBERSHIP_SCOPE_MISSING");
    const row = mapRow(raw, membershipTime);
    const list = grouped.get(row.scopeKey) ?? [];
    list.push(row);
    grouped.set(row.scopeKey, list);
  }
  const eligibleExecutions: LiveExecutionEvidenceRow[] = [];
  const conflicts: LiveExecutionConflict[] = [];
  for (const candidate of pageCandidates) {
    const rows = grouped.get(candidate.scopeKey) ?? [];
    const first = rows[0];
    if (!first) continue;
    if (rows.some((row) => immutableFacts(row) !== immutableFacts(first))) {
      conflicts.push({ scopeKey: candidate.scopeKey, executionId: first.executionId, observationCount: rows.length });
      continue;
    }
    eligibleExecutions.push(first);
  }
  const last = pageCandidates.at(-1);
  return {
    window,
    accountUid,
    eligibleExecutions,
    conflicts,
    unavailable: { missingSelectedTimestamp },
    hasMore,
    nextCursor: hasMore && last ? JSON.stringify({ time: last.membershipTime, scopeKey: last.scopeKey }) : null,
  };
}
