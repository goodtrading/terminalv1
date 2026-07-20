/**
 * AI-6.4.1 — Compact RedisTelemetryRecord (schemaVersion 1.0).
 * Stores CompactMarketTelemetry + CAS metadata. Latest-only.
 */
import { z } from "zod";
import {
  compactMarketTelemetrySchema,
  TELEMETRY_SCHEMA_VERSION,
  type CompactMarketTelemetry,
  type TelemetryNamespace,
} from "@shared/goodTradingAiMarketTelemetry";
import type { TelemetryStoreEntry } from "./telemetryStore";

export const REDIS_TELEMETRY_RECORD_SCHEMA_VERSION = "1.0" as const;

export const redisTelemetryRecordSchema = z.object({
  schemaVersion: z.literal(REDIS_TELEMETRY_RECORD_SCHEMA_VERSION),
  sequence: z.number().int().nonnegative(),
  ingestedAtMs: z.number().int().positive(),
  expiresAtMs: z.number().int().positive(),
  userId: z.number().int().positive(),
  sessionId: z.string().min(8).max(80),
  symbol: z.string().min(1).max(32),
  namespace: z.enum(["real", "synthetic_debug"]),
  telemetry: compactMarketTelemetrySchema,
});

export type RedisTelemetryRecord = z.infer<typeof redisTelemetryRecordSchema>;

export function entryToRedisRecord(entry: TelemetryStoreEntry): RedisTelemetryRecord {
  return {
    schemaVersion: REDIS_TELEMETRY_RECORD_SCHEMA_VERSION,
    sequence: entry.lastSequence,
    ingestedAtMs: entry.ingestedAtMs,
    expiresAtMs: entry.expiresAtMs,
    userId: entry.userId,
    sessionId: entry.sessionId,
    symbol: entry.symbol.toUpperCase(),
    namespace: entry.namespace,
    telemetry: entry.telemetry,
  };
}

export function redisRecordToEntry(rec: RedisTelemetryRecord): TelemetryStoreEntry {
  return {
    telemetry: rec.telemetry,
    userId: rec.userId,
    sessionId: rec.sessionId,
    symbol: rec.symbol,
    namespace: rec.namespace as TelemetryNamespace,
    ingestedAtMs: rec.ingestedAtMs,
    expiresAtMs: rec.expiresAtMs,
    lastSequence: rec.sequence,
  };
}

export function serializeRedisRecord(rec: RedisTelemetryRecord): string {
  return JSON.stringify(rec);
}

export function parseRedisRecord(raw: string): RedisTelemetryRecord | null {
  try {
    const parsed = redisTelemetryRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function assertTelemetrySchemaVersion(t: CompactMarketTelemetry): void {
  if (t.schemaVersion !== TELEMETRY_SCHEMA_VERSION) {
    throw new Error(`Unsupported telemetry schemaVersion ${t.schemaVersion}`);
  }
}
