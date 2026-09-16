import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../db";
import {
  createBrokerIdentity,
  createReconciliationRunInput,
  type BrokerIdentity,
  type BrokerObservationClassification,
  type BrokerObservationSnapshot,
  type ReconciliationResult,
  type ReconciliationRunInput,
} from "../../../shared/durableOrderReconciliation";

function database() { if (!pool) throw new Error("DATABASE_UNAVAILABLE"); return pool; }
function id(prefix: string) { return `${prefix}-${randomUUID()}`; }
function json(value: unknown) { return JSON.stringify(value ?? null); }

export type ReconciliationRun = Readonly<Record<string, unknown>>;
export type BrokerObject = Readonly<{ id: string; brokerAccountIdentity: string; classification: BrokerObservationClassification; attemptId: string | null; intentId: string | null }>;
export type BrokerIdentityConflict = Error & { code: "BROKER_IDENTITY_CONFLICT" };

function conflict(message: string): BrokerIdentityConflict { const error = new Error(message) as BrokerIdentityConflict; error.code = "BROKER_IDENTITY_CONFLICT"; return error; }

async function runQuery<T>(query: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try { await client.query("BEGIN"); const value = await query(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

export async function createReconciliationRun(input: ReconciliationRunInput): Promise<ReconciliationRun> {
  const run = createReconciliationRunInput(input);
  const result = await database().query(`INSERT INTO goodtrading_order_reconciliation_runs (id,attempt_id,intent_id,logical_order_uid,run_key,run_status,started_at,absence_proven,retry_authorized,queried_sources) VALUES ($1,$2,$3,$4,$5,'STARTED',$6,false,false,$7::jsonb) RETURNING *`, [run.id, run.attemptId, run.intentId, run.logicalOrderUid, run.runKey, run.startedAt, json(run.queriedSources)]);
  return result.rows[0] as ReconciliationRun;
}

async function complete(idValue: string, resultValue: ReconciliationResult, extra: { sourceStatuses?: unknown; sourceErrorCodes?: unknown; conflictReasons?: unknown; queryWindowMetadata?: unknown } = {}): Promise<ReconciliationRun> {
  const result = await database().query(`UPDATE goodtrading_order_reconciliation_runs SET run_status='COMPLETED',completed_at=now(),result=$2,source_statuses=$3::jsonb,source_error_codes=$4::jsonb,conflict_reasons=$5::jsonb,query_window_metadata=$6::jsonb WHERE id=$1 AND run_status='STARTED' RETURNING *`, [idValue, resultValue, json(extra.sourceStatuses ?? {}), json(extra.sourceErrorCodes ?? []), json(extra.conflictReasons ?? []), json(extra.queryWindowMetadata ?? {})]);
  if (result.rowCount !== 1) throw new Error("RECONCILIATION_RUN_COMPLETION_REJECTED");
  return result.rows[0] as ReconciliationRun;
}
export const completeReconciliationMatched = (id: string, extra?: Parameters<typeof complete>[2]) => complete(id, "MATCHED", extra);
export const completeReconciliationConflict = (id: string, extra?: Parameters<typeof complete>[2]) => complete(id, "CONFLICT", extra);
export const completeReconciliationNoMatch = (id: string, extra?: Parameters<typeof complete>[2]) => complete(id, "NO_MATCH_IN_OBSERVED_WINDOW", extra);
export const completeReconciliationUnresolved = (id: string, extra?: Parameters<typeof complete>[2]) => complete(id, "UNRESOLVED", extra);

export async function getReconciliationRunByAttemptAndKey(attemptId: string, runKey: string): Promise<ReconciliationRun | null> {
  const result = await database().query("SELECT * FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1 AND run_key=$2", [attemptId, runKey]);
  return (result.rows[0] as ReconciliationRun | undefined) ?? null;
}

export async function getLatestReconciliationForAttempt(attemptId: string): Promise<ReconciliationRun | null> { const result = await database().query("SELECT * FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1 ORDER BY created_at DESC LIMIT 1", [attemptId]); return (result.rows[0] as ReconciliationRun | undefined) ?? null; }

export async function findBrokerObjectByReliableIdentity(account: string, identity: BrokerIdentity): Promise<BrokerObject | null> { const safe = createBrokerIdentity(identity); const result = await database().query("SELECT o.* FROM goodtrading_broker_objects o JOIN goodtrading_broker_identity_aliases a ON a.broker_object_id=o.id WHERE a.broker_account_identity=$1 AND a.identity_kind=$2 AND a.identity_value=$3", [account, safe.kind, safe.value]); return result.rows[0] ? mapObject(result.rows[0]) : null; }
function mapObject(row: Record<string, unknown>): BrokerObject { return { id: String(row.id), brokerAccountIdentity: String(row.broker_account_identity), classification: String(row.classification) as BrokerObservationClassification, attemptId: row.attempt_id == null ? null : String(row.attempt_id), intentId: row.intent_id == null ? null : String(row.intent_id) }; }

export async function findOrCreateBrokerObjectByReliableIdentities(input: { brokerAccountIdentity: string; identities: BrokerIdentity[]; classification?: BrokerObservationClassification; brokerObjectId?: string }): Promise<BrokerObject> {
  if (!input.identities.length) throw new Error("EXTERNAL_OBSERVATION_IDENTITY_INSUFFICIENT");
  const identities = input.identities.map(createBrokerIdentity);
  for (let attempt = 0; attempt < 2; attempt++) try {
    return await runQuery(async (client) => {
      // A SELECT ... FOR UPDATE cannot lock a missing alias row. Serialize the
      // account-scoped identity set first so two observers cannot create
      // different objects before either alias is visible to the other.
      const lockKeys = identities
        .map(identity => `${input.brokerAccountIdentity}:${identity.kind}:${identity.value}`)
        .sort();
      for (const lockKey of lockKeys) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lockKey]);
      }
      const found = await client.query("SELECT o.* FROM goodtrading_broker_objects o WHERE o.id IN (SELECT a.broker_object_id FROM goodtrading_broker_identity_aliases a WHERE a.broker_account_identity=$1 AND a.identity_kind = ANY($2::text[]) AND a.identity_value = ANY($3::text[])) FOR UPDATE", [input.brokerAccountIdentity, identities.map(x => x.kind), identities.map(x => x.value)]);
      const objects = found.rows.map(mapObject); const ids = new Set(objects.map(x => x.id));
      if (ids.size > 1) throw conflict("multiple reliable identities resolve to different broker objects");
      const object = objects[0] ?? { id: input.brokerObjectId ?? id("BROKER-OBJ"), brokerAccountIdentity: input.brokerAccountIdentity, classification: input.classification ?? "BROKER_OBSERVED_ONLY", attemptId: null, intentId: null };
      if (!objects.length) await client.query("INSERT INTO goodtrading_broker_objects (id,broker_account_identity,classification) VALUES ($1,$2,$3)", [object.id, object.brokerAccountIdentity, object.classification]);
      for (const identity of identities) await client.query("INSERT INTO goodtrading_broker_identity_aliases (id,broker_object_id,broker_account_identity,identity_kind,identity_value,precision_trusted) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (broker_account_identity,identity_kind,identity_value) DO NOTHING", [id("BROKER-ALIAS"), object.id, input.brokerAccountIdentity, identity.kind, identity.value, identity.precisionTrusted ?? true]);
      return object;
    });
  } catch (error) { if ((error as { code?: string }).code === "23505" && attempt === 0) continue; throw error; }
  throw new Error("BROKER_OBJECT_IDENTITY_RETRY_EXHAUSTED");
}

export async function linkBrokerObjectToAttempt(input: { brokerObjectId: string; brokerAccountIdentity: string; attemptId: string; intentId: string }): Promise<BrokerObject> {
  return runQuery(async (client) => {
    const result = await client.query("UPDATE goodtrading_broker_objects SET classification='GT_LINKED',attempt_id=$3,intent_id=$4 WHERE id=$1 AND broker_account_identity=$2 AND attempt_id IS NULL AND intent_id IS NULL RETURNING *", [input.brokerObjectId, input.brokerAccountIdentity, input.attemptId, input.intentId]);
    if (result.rowCount === 1) return mapObject(result.rows[0]);
    const current = await client.query("SELECT * FROM goodtrading_broker_objects WHERE id=$1 FOR UPDATE", [input.brokerObjectId]);
    if (!current.rows[0]) throw new Error("BROKER_OBJECT_NOT_FOUND");
    const object = mapObject(current.rows[0]); if (object.attemptId === input.attemptId && object.intentId === input.intentId) return object; throw new Error("BROKER_OBJECT_LINKAGE_REASSIGNMENT_REJECTED");
  });
}

export async function recordBrokerObservationIfNew(input: { brokerObjectId: string; snapshot: BrokerObservationSnapshot }): Promise<boolean> {
  const s = input.snapshot;
  return runQuery(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${input.brokerObjectId}:${s.source}:${s.clientOrderId ?? ""}:${s.brokerOrderId ?? ""}:${s.executionId ?? ""}`]);
    const existing = await client.query(`SELECT 1 FROM goodtrading_broker_observation_snapshots WHERE broker_object_id=$1 AND source=$2 AND client_order_id IS NOT DISTINCT FROM $3 AND broker_order_id IS NOT DISTINCT FROM $4 AND execution_id IS NOT DISTINCT FROM $5 AND symbol=$6 AND side IS NOT DISTINCT FROM $7 AND quantity IS NOT DISTINCT FROM $8::numeric AND price IS NOT DISTINCT FROM $9::numeric AND raw_broker_status IS NOT DISTINCT FROM $10 LIMIT 1`, [input.brokerObjectId, s.source, s.clientOrderId ?? null, s.brokerOrderId ?? null, s.executionId ?? null, s.symbol, s.side ?? null, s.quantity ?? null, s.price ?? null, s.rawBrokerStatus ?? null]);
    if (existing.rows[0]) return false;
    await client.query(`INSERT INTO goodtrading_broker_observation_snapshots (id,broker_object_id,source,client_order_id,broker_order_id,broker_order_id_precision_trusted,execution_id,symbol,side,quantity,price,raw_broker_status,source_timestamp,observed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [id("BROKER-SNAPSHOT"), input.brokerObjectId, s.source, s.clientOrderId ?? null, s.brokerOrderId ?? null, s.brokerOrderIdPrecisionTrusted, s.executionId ?? null, s.symbol, s.side ?? null, s.quantity ?? null, s.price ?? null, s.rawBrokerStatus ?? null, s.sourceTimestamp ?? null, s.observedAt]);
    return true;
  });
}

export async function recordBrokerObservation(input: { brokerObjectId: string; snapshot: BrokerObservationSnapshot }): Promise<Record<string, unknown>> {
  const s = input.snapshot; const result = await database().query(`INSERT INTO goodtrading_broker_observation_snapshots (id,broker_object_id,source,client_order_id,broker_order_id,broker_order_id_precision_trusted,execution_id,symbol,side,quantity,price,raw_broker_status,source_timestamp,observed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [id("BROKER-SNAPSHOT"), input.brokerObjectId, s.source, s.clientOrderId ?? null, s.brokerOrderId ?? null, s.brokerOrderIdPrecisionTrusted, s.executionId ?? null, s.symbol, s.side ?? null, s.quantity ?? null, s.price ?? null, s.rawBrokerStatus ?? null, s.sourceTimestamp ?? null, s.observedAt]); return result.rows[0] as Record<string, unknown>;
}

export async function persistMatchedReconciliation(input: { runId: string; brokerAccountIdentity: string; identities: BrokerIdentity[]; attemptId: string; intentId: string; snapshot: BrokerObservationSnapshot; snapshots?: BrokerObservationSnapshot[] }): Promise<BrokerObject> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await persistMatchedReconciliationOnce(input); }
    catch (error) { if ((error as { code?: string }).code === "23505" && attempt === 0) continue; throw error; }
  }
  throw new Error("MATCHED_RECONCILIATION_RETRY_EXHAUSTED");
}

async function persistMatchedReconciliationOnce(input: { runId: string; brokerAccountIdentity: string; identities: BrokerIdentity[]; attemptId: string; intentId: string; snapshot: BrokerObservationSnapshot; snapshots?: BrokerObservationSnapshot[] }): Promise<BrokerObject> {
  return runQuery(async (client) => {
    const runState = await client.query("SELECT run_status,result FROM goodtrading_order_reconciliation_runs WHERE id=$1 FOR UPDATE", [input.runId]);
    if (!runState.rows[0]) throw new Error("RECONCILIATION_RUN_NOT_FOUND");
    if (runState.rows[0].run_status === "COMPLETED") {
      if (runState.rows[0].result !== "MATCHED") throw new Error("RECONCILIATION_RUN_IMMUTABLE");
      const completedObject = await client.query("SELECT o.* FROM goodtrading_broker_objects o WHERE o.id IN (SELECT a.broker_object_id FROM goodtrading_broker_identity_aliases a WHERE a.broker_account_identity=$1 AND a.identity_kind=ANY($2::text[]) AND a.identity_value=ANY($3::text[]))", [input.brokerAccountIdentity, input.identities.map(x => createBrokerIdentity(x).kind), input.identities.map(x => createBrokerIdentity(x).value)]);
      if (!completedObject.rows[0]) throw new Error("MATCHED_BROKER_OBJECT_NOT_FOUND");
      return mapObject(completedObject.rows[0]);
    }
    const found = await client.query("SELECT o.* FROM goodtrading_broker_objects o WHERE o.id IN (SELECT a.broker_object_id FROM goodtrading_broker_identity_aliases a WHERE a.broker_account_identity=$1 AND a.identity_kind=ANY($2::text[]) AND a.identity_value=ANY($3::text[])) FOR UPDATE", [input.brokerAccountIdentity, input.identities.map(x => createBrokerIdentity(x).kind), input.identities.map(x => createBrokerIdentity(x).value)]);
    const ids = new Set(found.rows.map(row => String(row.id))); if (ids.size > 1) throw conflict("multiple reliable identities resolve to different broker objects");
    const object = ids.size === 1 ? mapObject(found.rows[0]) : await createObjectInTransaction(client, input);
    if (object.attemptId && (object.attemptId !== input.attemptId || object.intentId !== input.intentId)) throw new Error("BROKER_OBJECT_LINKAGE_REASSIGNMENT_REJECTED");
    if (!object.attemptId) { const linked = await client.query("UPDATE goodtrading_broker_objects SET classification='GT_LINKED',attempt_id=$2,intent_id=$3 WHERE id=$1 AND attempt_id IS NULL AND intent_id IS NULL RETURNING *", [object.id, input.attemptId, input.intentId]); if (linked.rowCount !== 1) throw new Error("BROKER_OBJECT_LINKAGE_REASSIGNMENT_REJECTED"); }
    for (const identity of input.identities.map(createBrokerIdentity)) await client.query("INSERT INTO goodtrading_broker_identity_aliases (id,broker_object_id,broker_account_identity,identity_kind,identity_value,precision_trusted) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [id("BROKER-ALIAS"), object.id, input.brokerAccountIdentity, identity.kind, identity.value, identity.precisionTrusted ?? true]);
    const snapshots = [input.snapshot, ...(input.snapshots ?? [])];
    for (const s of snapshots) await client.query("INSERT INTO goodtrading_broker_observation_snapshots (id,broker_object_id,source,client_order_id,broker_order_id,broker_order_id_precision_trusted,execution_id,symbol,side,quantity,price,raw_broker_status,source_timestamp,observed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)", [id("BROKER-SNAPSHOT"), object.id, s.source, s.clientOrderId ?? null, s.brokerOrderId ?? null, s.brokerOrderIdPrecisionTrusted, s.executionId ?? null, s.symbol, s.side ?? null, s.quantity ?? null, s.price ?? null, s.rawBrokerStatus ?? null, s.sourceTimestamp ?? null, s.observedAt]);
    const completed = await client.query("UPDATE goodtrading_order_reconciliation_runs SET run_status='COMPLETED',completed_at=now(),result='MATCHED' WHERE id=$1 AND run_status='STARTED'", [input.runId]);
    if (completed.rowCount !== 1) throw new Error("RECONCILIATION_RUN_COMPLETION_REJECTED");
    return { ...object, classification: "GT_LINKED", attemptId: input.attemptId, intentId: input.intentId };
  });
}
async function createObjectInTransaction(client: PoolClient, input: { brokerAccountIdentity: string; identities: BrokerIdentity[] }): Promise<BrokerObject> { const object = { id: id("BROKER-OBJ"), brokerAccountIdentity: input.brokerAccountIdentity, classification: "BROKER_OBSERVED_ONLY" as const, attemptId: null, intentId: null }; await client.query("INSERT INTO goodtrading_broker_objects (id,broker_account_identity,classification) VALUES ($1,$2,$3)", [object.id, object.brokerAccountIdentity, object.classification]); for (const identity of input.identities.map(createBrokerIdentity)) await client.query("INSERT INTO goodtrading_broker_identity_aliases (id,broker_object_id,broker_account_identity,identity_kind,identity_value,precision_trusted) VALUES ($1,$2,$3,$4,$5,$6)", [id("BROKER-ALIAS"), object.id, input.brokerAccountIdentity, identity.kind, identity.value, identity.precisionTrusted ?? true]); return object; }

export async function listAttemptsRequiringReconciliation(cutoff?: Date): Promise<Record<string, unknown>[]> { const result = await database().query("SELECT a.*, i.logical_order_uid, i.goodtrading_account_uid FROM goodtrading_order_submission_attempts a JOIN goodtrading_order_intents i ON i.id=a.intent_id WHERE a.transport_state IN ('UNKNOWN_SUBMISSION_OUTCOME','RECONCILIATION_REQUIRED') OR (a.transport_state='SUBMISSION_STARTED' AND a.started_at <= COALESCE($1::timestamptz, now() - interval '60 seconds')) ORDER BY a.started_at NULLS FIRST", [cutoff ?? null]); return result.rows as Record<string, unknown>[]; }

export async function listRecoveryCandidates(cutoff = new Date(Date.now() - 60_000), limit = 25): Promise<Record<string, unknown>[]> { const result = await database().query("SELECT a.*, i.logical_order_uid, i.goodtrading_account_uid, ga.user_id FROM goodtrading_order_submission_attempts a JOIN goodtrading_order_intents i ON i.id=a.intent_id JOIN goodtrading_accounts ga ON ga.account_uid=i.goodtrading_account_uid WHERE a.transport_state IN ('UNKNOWN_SUBMISSION_OUTCOME','RECONCILIATION_REQUIRED') OR (a.transport_state='SUBMISSION_STARTED' AND a.started_at <= $1) ORDER BY a.started_at NULLS FIRST LIMIT $2", [cutoff, Math.min(Math.max(limit, 0), 25)]); return result.rows.map((row) => ({ attemptId: String(row.id), intentId: String(row.intent_id), logicalOrderUid: String(row.logical_order_uid), userId: Number(row.user_id), transportState: String(row.transport_state), startedAt: row.started_at == null ? null : new Date(row.started_at) })); }

export async function getLatestCompletedReconciliationForAttempt(attemptId: string): Promise<{ id: string; result: string; completedAt: Date } | null> { const result = await database().query("SELECT id,result,completed_at FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1 AND run_status='COMPLETED' ORDER BY completed_at DESC, id DESC LIMIT 1", [attemptId]); const row = result.rows[0] as Record<string, unknown> | undefined; return row ? { id: String(row.id), result: String(row.result), completedAt: row.completed_at as Date } : null; }

export async function claimReconciliationAttempt(attemptId: string, runKey: string, intentId: string, logicalOrderUid: string): Promise<{ claimed: boolean; run: ReconciliationRun }> { return runQuery(async (client) => { await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [attemptId]); const existing = await client.query("SELECT * FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1 AND run_key=$2", [attemptId, runKey]); if (existing.rows[0]) return { claimed: false, run: existing.rows[0] as ReconciliationRun }; const run = createReconciliationRunInput({ attemptId, intentId, logicalOrderUid, runKey, queriedSources: [] }); const inserted = await client.query("INSERT INTO goodtrading_order_reconciliation_runs (id,attempt_id,intent_id,logical_order_uid,run_key,run_status,started_at,absence_proven,retry_authorized) VALUES ($1,$2,$3,$4,$5,'STARTED',$6,false,false) RETURNING *", [run.id, attemptId, intentId, logicalOrderUid, runKey, run.startedAt]); return { claimed: true, run: inserted.rows[0] as ReconciliationRun }; }); }
