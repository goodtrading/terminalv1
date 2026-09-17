import { pool } from "../db";
import type { NautilusPaperExecutionEvidence } from "./nautilusPaperExecutionEvidence";

export type NautilusPaperExecutionEvidenceScope = Readonly<{
  accountId: string;
  sessionId: string;
  evidence: NautilusPaperExecutionEvidence;
}>;

function database() {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  return pool;
}

function requiredScopeText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value;
}

function validateEvidence(scope: NautilusPaperExecutionEvidenceScope): void {
  requiredScopeText(scope.accountId, "accountId");
  requiredScopeText(scope.sessionId, "sessionId");
  const evidence = scope.evidence;
  if (evidence.environment !== "PAPER" || evidence.source !== "NAUTILUS_PAPER") {
    throw new Error("PROVENANCE_NOT_SIMULATED_PAPER");
  }
  requiredScopeText(evidence.executionId, "executionId");
  requiredScopeText(evidence.instrument.venue, "instrument.venue");
  requiredScopeText(evidence.instrument.marketType, "instrument.marketType");
  requiredScopeText(evidence.instrument.symbol, "instrument.symbol");
  if (evidence.side !== "BUY" && evidence.side !== "SELL") throw new Error("INVALID_SIDE");
  if (!Number.isSafeInteger(evidence.eventTime) || evidence.eventTime < 0) throw new Error("INVALID_SIMULATION_EVENT_TIME");
  if (!["MAKER", "TAKER", "UNKNOWN"].includes(evidence.liquidityRole)) throw new Error("INVALID_LIQUIDITY_ROLE");
  if (evidence.fee.quality !== "SIMULATED_CONFIGURED_FEE") throw new Error("INVALID_FEE_QUALITY");
}

type EvidenceRow = {
  account_id: string;
  session_id: string;
  execution_id: string;
  environment: "PAPER";
  source: "NAUTILUS_PAPER";
  instrument_venue: string;
  instrument_market_type: string;
  instrument_symbol: string;
  side: "BUY" | "SELL";
  price: string;
  quantity: string;
  simulation_event_time_ms: string | number;
  fee_amount: string | null;
  fee_asset: string | null;
  fee_quality: "SIMULATED_CONFIGURED_FEE";
  liquidity_role: "MAKER" | "TAKER" | "UNKNOWN";
  order_id: string | null;
  client_order_id: string | null;
};

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`INVALID_${field.toUpperCase()}`);
  return value;
}

function mapRow(row: EvidenceRow): NautilusPaperExecutionEvidence {
  if (row.environment !== "PAPER" || row.source !== "NAUTILUS_PAPER") throw new Error("PROVENANCE_NOT_SIMULATED_PAPER");
  return {
    executionId: text(row.execution_id, "execution_id"),
    environment: "PAPER",
    source: "NAUTILUS_PAPER",
    instrument: {
      venue: text(row.instrument_venue, "instrument_venue"),
      marketType: text(row.instrument_market_type, "instrument_market_type"),
      symbol: text(row.instrument_symbol, "instrument_symbol"),
    },
    side: row.side,
    price: text(row.price, "price"),
    quantity: text(row.quantity, "quantity"),
    eventTime: typeof row.simulation_event_time_ms === "number" ? row.simulation_event_time_ms : Number(row.simulation_event_time_ms),
    fee: { value: row.fee_amount, asset: row.fee_asset, quality: "SIMULATED_CONFIGURED_FEE" },
    liquidityRole: row.liquidity_role,
    orderReferences: {
      clientOrderId: text(row.client_order_id, "client_order_id"),
      ...(row.order_id === null ? {} : { venueOrderId: text(row.order_id, "order_id") }),
    },
  };
}

function sameEvidence(a: NautilusPaperExecutionEvidence, b: NautilusPaperExecutionEvidence): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowParams(accountId: string, sessionId: string, evidence: NautilusPaperExecutionEvidence): unknown[] {
  return [
    accountId,
    sessionId,
    evidence.executionId,
    evidence.environment,
    evidence.source,
    evidence.instrument.venue,
    evidence.instrument.marketType,
    evidence.instrument.symbol,
    evidence.side,
    evidence.price,
    evidence.quantity,
    evidence.eventTime,
    evidence.fee.value,
    evidence.fee.asset,
    evidence.fee.quality,
    evidence.liquidityRole,
    evidence.orderReferences.venueOrderId ?? null,
    evidence.orderReferences.clientOrderId,
  ];
}

const SELECT_COLUMNS = `account_id, session_id, execution_id, environment, source,
  instrument_venue, instrument_market_type, instrument_symbol, side, price, quantity,
  simulation_event_time_ms, fee_amount, fee_asset, fee_quality, liquidity_role,
  order_id, client_order_id`;

export async function persistNautilusPaperExecutionEvidence(
  accountId: string,
  sessionId: string,
  evidence: NautilusPaperExecutionEvidence,
): Promise<NautilusPaperExecutionEvidence> {
  const scope = { accountId, sessionId, evidence };
  validateEvidence(scope);
  const databasePool = database();
  const inserted = await databasePool.query<EvidenceRow>(
    `INSERT INTO goodtrading_paper_execution_evidence
      (account_id, session_id, execution_id, environment, source,
       instrument_venue, instrument_market_type, instrument_symbol, side, price, quantity,
       simulation_event_time_ms, fee_amount, fee_asset, fee_quality, liquidity_role,
       order_id, client_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (account_id, session_id, source, execution_id) DO NOTHING
     RETURNING ${SELECT_COLUMNS}`,
    rowParams(accountId, sessionId, evidence),
  );
  const row = inserted.rows[0] ?? (await databasePool.query<EvidenceRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM goodtrading_paper_execution_evidence
      WHERE account_id = $1 AND session_id = $2 AND source = $3 AND execution_id = $4`,
    [accountId, sessionId, evidence.source, evidence.executionId],
  )).rows[0];
  if (!row) throw new Error("PAPER_EXECUTION_EVIDENCE_READBACK_FAILED");
  const existing = mapRow(row);
  if (!sameEvidence(existing, evidence)) throw new Error("PAPER_EXECUTION_EVIDENCE_CONFLICT");
  return existing;
}

export async function getNautilusPaperExecutionEvidence(
  accountId: string,
  sessionId: string,
  executionId: string,
): Promise<NautilusPaperExecutionEvidence | null> {
  requiredScopeText(accountId, "accountId");
  requiredScopeText(sessionId, "sessionId");
  requiredScopeText(executionId, "executionId");
  const result = await database().query<EvidenceRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM goodtrading_paper_execution_evidence
      WHERE account_id = $1 AND session_id = $2 AND source = 'NAUTILUS_PAPER' AND execution_id = $3`,
    [accountId, sessionId, executionId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listNautilusPaperExecutionEvidence(
  accountId: string,
  sessionId: string,
  clientOrderId?: string,
): Promise<readonly NautilusPaperExecutionEvidence[]> {
  requiredScopeText(accountId, "accountId");
  requiredScopeText(sessionId, "sessionId");
  const result = await database().query<EvidenceRow>(
    `SELECT ${SELECT_COLUMNS}
       FROM goodtrading_paper_execution_evidence
      WHERE account_id = $1 AND session_id = $2 AND source = 'NAUTILUS_PAPER'
        AND ($3::text IS NULL OR client_order_id = $3)
      ORDER BY simulation_event_time_ms ASC, id ASC`,
    [accountId, sessionId, clientOrderId ?? null],
  );
  return result.rows.map(mapRow);
}
