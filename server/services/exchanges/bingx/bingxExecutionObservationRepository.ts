import { pool } from "../../../db";
import type { DurableExecutionObservation } from "./bingxExecutionObservationContext";

function database() { if (!pool) throw new Error("DATABASE_UNAVAILABLE"); return pool; }

export async function findDurableBingXExecutionObservations(executionId: string): Promise<DurableExecutionObservation[]> {
  if (typeof executionId !== "string" || executionId.length === 0) return [];
  const result = await database().query(`SELECT s.execution_id, s.symbol, s.side, s.quantity::text AS quantity, s.price::text AS price, s.observed_at, o.classification FROM goodtrading_broker_observation_snapshots s JOIN goodtrading_broker_objects o ON o.id=s.broker_object_id WHERE s.execution_id=$1 ORDER BY s.observed_at ASC, s.id ASC`, [executionId]);
  return result.rows.map(row => ({ executionId: String(row.execution_id), symbol: String(row.symbol), side: row.side == null ? undefined : String(row.side), quantity: row.quantity == null ? undefined : String(row.quantity), price: row.price == null ? undefined : String(row.price), observedAt: new Date(row.observed_at as string), classification: String(row.classification) as DurableExecutionObservation["classification"] }));
}
