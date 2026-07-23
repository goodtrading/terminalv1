/**
 * AI-7.3.9 — Postgres JSONB document schema for durable calibration.
 * Parameterized SQL only. No secrets in logs.
 */
import { pool } from "../../../db";

const DDL = `
CREATE TABLE IF NOT EXISTS gt_ai_calibration_docs (
  namespace text NOT NULL,
  collection text NOT NULL,
  id text NOT NULL,
  parent_id text,
  payload jsonb NOT NULL,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  PRIMARY KEY (namespace, collection, id)
);
CREATE INDEX IF NOT EXISTS gt_ai_calibration_docs_parent_idx
  ON gt_ai_calibration_docs (namespace, collection, parent_id);
CREATE INDEX IF NOT EXISTS gt_ai_calibration_docs_updated_idx
  ON gt_ai_calibration_docs (namespace, updated_at_ms DESC);
`;

let ready: Promise<void> | null = null;

export async function ensureCalibrationPostgresSchema(): Promise<void> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  if (!ready) {
    ready = pool.query(DDL).then(() => undefined);
  }
  await ready;
}

export async function upsertDoc(input: {
  namespace: string;
  collection: string;
  id: string;
  parentId?: string | null;
  payload: unknown;
  nowMs?: number;
}): Promise<void> {
  await ensureCalibrationPostgresSchema();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const now = input.nowMs ?? Date.now();
  await pool.query(
    `INSERT INTO gt_ai_calibration_docs
      (namespace, collection, id, parent_id, payload, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (namespace, collection, id) DO UPDATE SET
       parent_id = EXCLUDED.parent_id,
       payload = EXCLUDED.payload,
       updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      input.namespace,
      input.collection,
      input.id,
      input.parentId ?? null,
      JSON.stringify(input.payload),
      now,
      now,
    ],
  );
}

export async function getDoc<T>(
  namespace: string,
  collection: string,
  id: string,
): Promise<T | null> {
  await ensureCalibrationPostgresSchema();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const res = await pool.query(
    `SELECT payload FROM gt_ai_calibration_docs
     WHERE namespace = $1 AND collection = $2 AND id = $3`,
    [namespace, collection, id],
  );
  if (!res.rows[0]) return null;
  return res.rows[0].payload as T;
}

export async function listDocs<T>(
  namespace: string,
  collection: string,
  parentId?: string,
): Promise<T[]> {
  await ensureCalibrationPostgresSchema();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const res = parentId
    ? await pool.query(
        `SELECT payload FROM gt_ai_calibration_docs
         WHERE namespace = $1 AND collection = $2 AND parent_id = $3
         ORDER BY updated_at_ms ASC`,
        [namespace, collection, parentId],
      )
    : await pool.query(
        `SELECT payload FROM gt_ai_calibration_docs
         WHERE namespace = $1 AND collection = $2
         ORDER BY updated_at_ms ASC`,
        [namespace, collection],
      );
  return res.rows.map((r: { payload: T }) => r.payload);
}

export async function listDocIds(namespace: string, collection: string): Promise<string[]> {
  await ensureCalibrationPostgresSchema();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const res = await pool.query(
    `SELECT id FROM gt_ai_calibration_docs
     WHERE namespace = $1 AND collection = $2
     ORDER BY updated_at_ms ASC`,
    [namespace, collection],
  );
  return res.rows.map((r: { id: string }) => r.id);
}

export function resetPostgresSchemaReadyForTests(): void {
  ready = null;
}
