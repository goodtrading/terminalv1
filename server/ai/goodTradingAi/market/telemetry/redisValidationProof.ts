/**
 * AI-6.4.4b — Persistent RedisValidationProof (schemaVersion 1.0).
 * Stored in Redis under a stable admin key (NOT telemetry latest-only keys).
 * TTL default 7 days — independent of telemetry 10–15s TTL.
 * Written ONLY by authorized real smoke. Status exposes booleans/dates only.
 * mentorEligible is always false and cannot be set true.
 */
import { z } from "zod";
import type { TelemetryRedisClient } from "./redisClient";
import type { LatencyVerdict, SharedRepositoryVerdict } from "./redisSmokeValidation";

export const REDIS_VALIDATION_PROOF_SCHEMA_VERSION = "1.0" as const;

/** Proof TTL: 7 days (documented). Telemetry keys stay 10–15s. */
export const REDIS_VALIDATION_PROOF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const latencyClassSchema = z.enum(["GOOD", "ACCEPTABLE", "HIGH", "NOT_MEASURED"]);
export type LatencyClass = z.infer<typeof latencyClassSchema>;

export const redisValidationProofSchema = z.object({
  schemaVersion: z.literal(REDIS_VALIDATION_PROOF_SCHEMA_VERSION),
  smokeValidated: z.boolean(),
  validatedAtMs: z.number().int().positive(),
  expiresAtMs: z.number().int().positive(),
  smokeId: z.string().min(4).max(64),
  /** Env name only — never URL value. */
  urlEnvName: z.string().min(1).max(64),
  sharedRepository: z.enum([
    "SHARED_REPOSITORY_CONFIRMED",
    "SHARED_REPOSITORY_NOT_CONFIRMED",
    "NOT_MEASURED",
  ]),
  latencyClass: latencyClassSchema,
  latencyVerdict: z.enum(["PASS", "ACCEPTABLE_WITH_WARNING", "FAIL", "NOT_MEASURED"]),
  latencySamples: z.number().int().nonnegative(),
  latencyP50Ms: z.number().nullable(),
  latencyP95Ms: z.number().nullable(),
  latencyP99Ms: z.number().nullable(),
  casConcurrentFinalSequence: z.number().int().nullable(),
  namespaceIsolationOk: z.boolean().nullable(),
  cleanupOk: z.boolean(),
  /** Always false — Mentor must stay disconnected. */
  mentorEligible: z.literal(false),
  proofSource: z.literal("authorized_smoke"),
  notes: z.array(z.string().max(200)).max(12).optional(),
});

export type RedisValidationProof = z.infer<typeof redisValidationProofSchema>;

/** Stable admin key — never uses KEYS/SCAN; never under smoke:{id}: namespace. */
export function buildRedisValidationProofKey(telemetryPrefix: string): string {
  const p = telemetryPrefix.trim() || "gt:ai:telem";
  return `${p}:admin:redis_validation_proof`;
}

export function latencyVerdictToClass(v: LatencyVerdict): LatencyClass {
  switch (v) {
    case "PASS":
      return "GOOD";
    case "ACCEPTABLE_WITH_WARNING":
      return "ACCEPTABLE";
    case "FAIL":
      return "HIGH";
    default:
      return "NOT_MEASURED";
  }
}

export function buildRedisValidationProof(input: {
  smokeId: string;
  urlEnvName: string;
  sharedRepository: SharedRepositoryVerdict;
  latencyVerdict: LatencyVerdict;
  latencySamples: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  casConcurrentFinalSequence: number | null;
  namespaceIsolationOk: boolean | null;
  cleanupOk: boolean;
  smokeValidated: boolean;
  notes?: string[];
  nowMs?: number;
  ttlMs?: number;
}): RedisValidationProof {
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlMs ?? REDIS_VALIDATION_PROOF_TTL_MS;
  const proof: RedisValidationProof = {
    schemaVersion: REDIS_VALIDATION_PROOF_SCHEMA_VERSION,
    smokeValidated: input.smokeValidated === true,
    validatedAtMs: now,
    expiresAtMs: now + ttl,
    smokeId: input.smokeId,
    urlEnvName: input.urlEnvName,
    sharedRepository: input.sharedRepository,
    latencyClass: latencyVerdictToClass(input.latencyVerdict),
    latencyVerdict: input.latencyVerdict,
    latencySamples: input.latencySamples,
    latencyP50Ms: input.latencyP50Ms,
    latencyP95Ms: input.latencyP95Ms,
    latencyP99Ms: input.latencyP99Ms,
    casConcurrentFinalSequence: input.casConcurrentFinalSequence,
    namespaceIsolationOk: input.namespaceIsolationOk,
    cleanupOk: input.cleanupOk,
    mentorEligible: false,
    proofSource: "authorized_smoke",
    notes: input.notes?.slice(0, 12),
  };
  // Force mentorEligible false even if caller tries to forge via cast
  return redisValidationProofSchema.parse({ ...proof, mentorEligible: false });
}

export function serializeRedisValidationProof(proof: RedisValidationProof): string {
  return JSON.stringify(proof);
}

export function parseRedisValidationProof(raw: string): RedisValidationProof | null {
  try {
    const parsed = redisValidationProofSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.mentorEligible !== false) return null;
    if (Date.now() > parsed.data.expiresAtMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeRedisValidationProof(
  client: TelemetryRedisClient,
  telemetryPrefix: string,
  proof: RedisValidationProof,
): Promise<{ ok: boolean; keyNameOnly: string; reason?: string }> {
  const keyNameOnly = "admin:redis_validation_proof";
  let safe: RedisValidationProof;
  try {
    safe = redisValidationProofSchema.parse({ ...proof, mentorEligible: false });
  } catch {
    return { ok: false, keyNameOnly, reason: "proof schema validation failed" };
  }
  if (!safe.smokeValidated) {
    return { ok: false, keyNameOnly, reason: "smokeValidated must be true to persist" };
  }
  // Force mentorEligible false at write boundary (cannot be forged true).
  safe = { ...safe, mentorEligible: false };
  const ttlMs = Math.max(1_000, Math.floor(safe.expiresAtMs - Date.now()));
  // Prefer EX (seconds) for multi-day TTL — more portable across Redis builds than huge PX.
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  const payload = serializeRedisValidationProof(safe);
  const key = buildRedisValidationProofKey(telemetryPrefix);

  // SET without PX, then EXPIRE — avoids PX overflow / client option quirks on long TTLs.
  const setResult = await client.set(key, payload);
  if (setResult !== "OK") {
    return { ok: false, keyNameOnly, reason: "redis SET did not return OK" };
  }
  const expired = await client.expire(key, ttlSec);
  if (!expired) {
    // Key may exist without TTL — refuse to claim persistence without bounded TTL.
    await client.del(key);
    return { ok: false, keyNameOnly, reason: "redis EXPIRE failed after SET" };
  }
  const raw = await client.get(key);
  if (!raw || !parseRedisValidationProof(raw)) {
    return { ok: false, keyNameOnly, reason: "proof readback failed after write" };
  }
  const pttl = await client.pttl(key);
  // Allow clock skew; require roughly day-scale TTL (not telemetry 10–15s).
  if (pttl < 60_000) {
    return { ok: false, keyNameOnly, reason: "proof TTL too short after write" };
  }
  return { ok: true, keyNameOnly };
}

export async function readRedisValidationProof(
  client: TelemetryRedisClient,
  telemetryPrefix: string,
): Promise<RedisValidationProof | null> {
  const key = buildRedisValidationProofKey(telemetryPrefix);
  const raw = await client.get(key);
  if (!raw) return null;
  return parseRedisValidationProof(raw);
}

/** Status projection — booleans + dates only; never full proof blob / Redis key / secrets. */
export function redisValidationProofForStatus(proof: RedisValidationProof | null): {
  smokeValidated: boolean;
  proofPresent: boolean;
  proofExpired: boolean;
  validatedAtMs: number | null;
  expiresAtMs: number | null;
  sharedRepository: SharedRepositoryVerdict | "NOT_MEASURED";
  latencyClass: LatencyClass;
  latencyVerdict: LatencyVerdict;
  casOk: boolean | null;
  namespaceIsolationOk: boolean | null;
  mentorEligible: false;
  urlEnvName: string | null;
  proofSource: "authorized_smoke" | null;
} {
  if (!proof) {
    return {
      smokeValidated: false,
      proofPresent: false,
      proofExpired: false,
      validatedAtMs: null,
      expiresAtMs: null,
      sharedRepository: "NOT_MEASURED",
      latencyClass: "NOT_MEASURED",
      latencyVerdict: "NOT_MEASURED",
      casOk: null,
      namespaceIsolationOk: null,
      mentorEligible: false,
      urlEnvName: null,
      proofSource: null,
    };
  }
  const expired = Date.now() > proof.expiresAtMs;
  return {
    smokeValidated: !expired && proof.smokeValidated === true,
    proofPresent: true,
    proofExpired: expired,
    validatedAtMs: proof.validatedAtMs,
    expiresAtMs: proof.expiresAtMs,
    sharedRepository: proof.sharedRepository,
    latencyClass: proof.latencyClass,
    latencyVerdict: proof.latencyVerdict,
    casOk: proof.casConcurrentFinalSequence === 13,
    namespaceIsolationOk: proof.namespaceIsolationOk,
    mentorEligible: false,
    urlEnvName: proof.urlEnvName,
    proofSource: proof.proofSource,
  };
}

/**
 * Best-effort load of persistent proof for status.
 * Uses Redis URL if present; never throws secrets; returns null on failure.
 */
export async function loadRedisValidationProofForStatus(): Promise<RedisValidationProof | null> {
  try {
    const { loadRedisTelemetryConfig } = await import("./redisConfig");
    const { createRealRedisClient } = await import("./redisClient");
    const cfg = loadRedisTelemetryConfig();
    const client = await createRealRedisClient(cfg);
    try {
      return await readRedisValidationProof(client, cfg.prefix);
    } finally {
      await client.quit();
    }
  } catch {
    return null;
  }
}
