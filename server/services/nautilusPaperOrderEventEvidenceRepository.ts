import type { PoolClient } from "pg";
import { pool } from "../db";
import { validateNautilusPaperOrderEventEvidence, type NautilusPaperOrderEventEvidence } from "./nautilusPaperOrderEventEvidence";

function database() { if (!pool) throw new Error("DATABASE_UNAVAILABLE"); return pool; }

function canonicalPayload(evidence: NautilusPaperOrderEventEvidence): string {
  return JSON.stringify(evidence);
}

type Row = { payload: NautilusPaperOrderEventEvidence; event_id: string; event_type: string; ts_event_ns: string; ts_init_ns: string };
type QueryExecutor = Pick<PoolClient, "query">;
type PersistResult = { evidence: NautilusPaperOrderEventEvidence; inserted: boolean };

async function persistWithExecutor(
  executor: QueryExecutor,
  accountId: string,
  evidenceInput: unknown,
): Promise<PersistResult> {
  if (!accountId.trim()) throw new Error("ACCOUNT_ID_REQUIRED");
  const evidence = validateNautilusPaperOrderEventEvidence(evidenceInput);
  const payload = canonicalPayload(evidence);
  const inserted = await executor.query<Row>(
    `INSERT INTO goodtrading_paper_order_event_evidence
      (account_id, environment, source, event_id, event_type, ts_event_ns, ts_init_ns, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (account_id, environment, source, event_id) DO NOTHING
     RETURNING event_id, event_type, ts_event_ns, ts_init_ns, payload`,
    [accountId, evidence.environment, evidence.source, evidence.eventId, evidence.eventType, evidence.tsEventNs, evidence.tsInitNs, payload],
  );
  if (inserted.rows[0]) return { evidence: validateNautilusPaperOrderEventEvidence(inserted.rows[0].payload), inserted: true };
  const existing = await executor.query<Row>(
    `SELECT event_id, event_type, ts_event_ns, ts_init_ns, payload
       FROM goodtrading_paper_order_event_evidence
      WHERE account_id = $1 AND environment = $2 AND source = $3 AND event_id = $4`,
    [accountId, evidence.environment, evidence.source, evidence.eventId],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("PAPER_ORDER_EVENT_EVIDENCE_READBACK_FAILED");
  const stored = validateNautilusPaperOrderEventEvidence(row.payload);
  if (canonicalPayload(stored) !== payload) throw new Error(`PAPER_ORDER_EVENT_EVIDENCE_CONFLICT eventId=${evidence.eventId}`);
  return { evidence: stored, inserted: false };
}

export async function persistNautilusPaperOrderEventEvidence(
  accountId: string,
  evidenceInput: unknown,
): Promise<PersistResult> {
  const client = await database().connect();
  try {
    return await persistWithExecutor(client, accountId, evidenceInput);
  } finally {
    client.release();
  }
}

export async function persistNautilusPaperOrderEventEvidenceBatch(
  accountId: string,
  evidenceInputs: unknown[],
): Promise<PersistResult[]> {
  if (!accountId.trim()) throw new Error("ACCOUNT_ID_REQUIRED");
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const results: PersistResult[] = [];
    for (const evidenceInput of evidenceInputs) {
      results.push(await persistWithExecutor(client, accountId, evidenceInput));
    }
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listNautilusPaperOrderEventEvidence(accountId: string, clientOrderId?: string) {
  if (!accountId.trim()) throw new Error("ACCOUNT_ID_REQUIRED");
  const result = await database().query<Row>(
    `SELECT event_id, event_type, ts_event_ns, ts_init_ns, payload
       FROM goodtrading_paper_order_event_evidence
      WHERE account_id = $1 AND ($2::text IS NULL OR payload->>'clientOrderId' = $2)
      ORDER BY created_at ASC, event_id ASC`,
    [accountId, clientOrderId ?? null],
  );
  return result.rows.map((row) => validateNautilusPaperOrderEventEvidence(row.payload));
}

export async function countNautilusPaperOrderEventEvidence(accountId: string, eventId: string) {
  const result = await database().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM goodtrading_paper_order_event_evidence
      WHERE account_id = $1 AND environment = 'PAPER' AND source = 'NAUTILUS_PAPER' AND event_id = $2`,
    [accountId, eventId],
  );
  return Number(result.rows[0]?.count ?? "0");
}
