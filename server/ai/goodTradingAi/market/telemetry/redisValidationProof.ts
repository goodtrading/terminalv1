/**
 * AI-6.4.4g — Persistent RedisValidationProof (schemaVersion 2.0).
 * Separates correctness (functional) from performance (honest HIGH ≠ PASS).
 * Reads legacy schema 1.0; writes only 2.0.
 * mentorEligible is always false and cannot be set true.
 * Never claims Redis is "fast"; HIGH → VALIDATED_WITH_PERFORMANCE_WARNING.
 */
import { z } from "zod";
import type { TelemetryRedisClient } from "./redisClient";
import type { SharedRepositoryVerdict } from "./redisSmokeValidation";
import {
  REDIS_PERFORMANCE_THRESHOLDS_VERSION,
  performancePassedForVerdict,
  type PerformanceVerdict,
} from "./redisPerformancePolicy";

export const REDIS_VALIDATION_PROOF_SCHEMA_VERSION = "2.0" as const;
export const REDIS_VALIDATION_PROOF_SCHEMA_VERSION_LEGACY = "1.0" as const;

/** Proof TTL: 7 days (documented). Telemetry keys stay 10–15s. */
export const REDIS_VALIDATION_PROOF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CorrectnessVerdict = "PASS" | "FAIL" | "NOT_MEASURED";

export type ValidationStatus =
  | "VALIDATED"
  | "VALIDATED_WITH_PERFORMANCE_WARNING"
  | "VALIDATION_FAILED"
  | "NOT_VALIDATED";

/** @deprecated Prefer PerformanceVerdict — kept for status/legacy field names. */
export type LatencyClass = PerformanceVerdict;
export type LatencyVerdict =
  | "PASS"
  | "ACCEPTABLE_WITH_WARNING"
  | "FAIL"
  | "NOT_MEASURED"
  | PerformanceVerdict;

export const latencyClassSchema = z.enum([
  "GOOD",
  "ACCEPTABLE",
  "HIGH",
  "FAIL",
  "NOT_MEASURED",
]);

const correctnessSchema = z.object({
  verdict: z.enum(["PASS", "FAIL", "NOT_MEASURED"]),
  connectOk: z.boolean(),
  casOk: z.boolean(),
  concurrentFinalSequence: z.number().int().nullable(),
  namespaceIsolationOk: z.boolean().nullable(),
  sharedRepository: z.enum([
    "SHARED_REPOSITORY_CONFIRMED",
    "SHARED_REPOSITORY_NOT_CONFIRMED",
    "NOT_MEASURED",
  ]),
  cleanupOk: z.boolean(),
});

const performanceSchema = z.object({
  verdict: latencyClassSchema,
  /** Never true for HIGH — HIGH is success+slow, not approved performance. */
  performancePassed: z.boolean(),
  samples: z.number().int().nonnegative(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  p99Ms: z.number().nullable(),
  thresholdsVersion: z.literal(REDIS_PERFORMANCE_THRESHOLDS_VERSION),
});

const securitySchema = z.object({
  mentorEligible: z.literal(false),
  noSilentMemoryFallback: z.literal(true),
});

const metadataSchema = z.object({
  smokeId: z.string().min(4).max(64),
  validatedAtMs: z.number().int().positive(),
  expiresAtMs: z.number().int().positive(),
  urlEnvName: z.string().min(1).max(64),
  proofSource: z.literal("authorized_smoke"),
  validationStatus: z.enum([
    "VALIDATED",
    "VALIDATED_WITH_PERFORMANCE_WARNING",
    "VALIDATION_FAILED",
    "NOT_VALIDATED",
  ]),
  /** True when correctness PASS and proof is eligible to represent validation. */
  smokeValidated: z.boolean(),
  notes: z.array(z.string().max(200)).max(12).optional(),
});

export const redisValidationProofSchema = z.object({
  schemaVersion: z.literal(REDIS_VALIDATION_PROOF_SCHEMA_VERSION),
  correctness: correctnessSchema,
  performance: performanceSchema,
  security: securitySchema,
  metadata: metadataSchema,
  /** Flat mirror for status/UI — always false. */
  mentorEligible: z.literal(false),
});

export type RedisValidationProof = z.infer<typeof redisValidationProofSchema>;

/** Stable admin key — never uses KEYS/SCAN; never under smoke:{id}: namespace. */
export function buildRedisValidationProofKey(telemetryPrefix: string): string {
  const p = telemetryPrefix.trim() || "gt:ai:telem";
  return `${p}:admin:redis_validation_proof`;
}

export function deriveValidationStatus(input: {
  correctness: CorrectnessVerdict;
  performance: PerformanceVerdict;
}): ValidationStatus {
  if (input.correctness !== "PASS") {
    return input.correctness === "NOT_MEASURED" ? "NOT_VALIDATED" : "VALIDATION_FAILED";
  }
  if (input.performance === "HIGH" || input.performance === "FAIL") {
    // FAIL performance with PASS correctness is unusual; still warn, not full VALIDATED.
    return "VALIDATED_WITH_PERFORMANCE_WARNING";
  }
  if (input.performance === "NOT_MEASURED") {
    return "VALIDATED_WITH_PERFORMANCE_WARNING";
  }
  return "VALIDATED";
}

/** Map legacy LatencyVerdict / PerformanceVerdict → PerformanceVerdict. */
export function toPerformanceVerdict(v: LatencyVerdict | PerformanceVerdict): PerformanceVerdict {
  switch (v) {
    case "PASS":
    case "GOOD":
      return "GOOD";
    case "ACCEPTABLE_WITH_WARNING":
    case "ACCEPTABLE":
      return "ACCEPTABLE";
    case "HIGH":
      return "HIGH";
    case "FAIL":
      // Legacy 1.0 used FAIL for high latency; treat as HIGH when migrating measured proofs.
      return "HIGH";
    default:
      return "NOT_MEASURED";
  }
}

/** @deprecated Use toPerformanceVerdict / classifyPerformanceP95. */
export function latencyVerdictToClass(v: LatencyVerdict): LatencyClass {
  return toPerformanceVerdict(v);
}

export function buildRedisValidationProof(input: {
  smokeId: string;
  urlEnvName: string;
  sharedRepository: SharedRepositoryVerdict;
  correctnessVerdict: CorrectnessVerdict;
  connectOk: boolean;
  casOk: boolean;
  performanceVerdict: PerformanceVerdict;
  latencySamples: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  casConcurrentFinalSequence: number | null;
  namespaceIsolationOk: boolean | null;
  cleanupOk: boolean;
  /** Must be true to persist; means correctness PASS + gates. */
  smokeValidated: boolean;
  notes?: string[];
  nowMs?: number;
  ttlMs?: number;
  /** @deprecated Use performanceVerdict */
  latencyVerdict?: LatencyVerdict;
}): RedisValidationProof {
  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlMs ?? REDIS_VALIDATION_PROOF_TTL_MS;
  const performanceVerdict = input.performanceVerdict;
  const correctnessVerdict = input.correctnessVerdict;
  const validationStatus = deriveValidationStatus({
    correctness: correctnessVerdict,
    performance: performanceVerdict,
  });
  const performancePassed = performancePassedForVerdict(performanceVerdict);

  const proof: RedisValidationProof = {
    schemaVersion: REDIS_VALIDATION_PROOF_SCHEMA_VERSION,
    correctness: {
      verdict: correctnessVerdict,
      connectOk: input.connectOk,
      casOk: input.casOk,
      concurrentFinalSequence: input.casConcurrentFinalSequence,
      namespaceIsolationOk: input.namespaceIsolationOk,
      sharedRepository: input.sharedRepository,
      cleanupOk: input.cleanupOk,
    },
    performance: {
      verdict: performanceVerdict,
      performancePassed,
      samples: input.latencySamples,
      p50Ms: input.latencyP50Ms,
      p95Ms: input.latencyP95Ms,
      p99Ms: input.latencyP99Ms,
      thresholdsVersion: REDIS_PERFORMANCE_THRESHOLDS_VERSION,
    },
    security: {
      mentorEligible: false,
      noSilentMemoryFallback: true,
    },
    metadata: {
      smokeId: input.smokeId,
      validatedAtMs: now,
      expiresAtMs: now + ttl,
      urlEnvName: input.urlEnvName,
      proofSource: "authorized_smoke",
      validationStatus,
      smokeValidated: input.smokeValidated === true && correctnessVerdict === "PASS",
      notes: input.notes?.slice(0, 12),
    },
    mentorEligible: false,
  };
  return redisValidationProofSchema.parse({ ...proof, mentorEligible: false });
}

export function serializeRedisValidationProof(proof: RedisValidationProof): string {
  return JSON.stringify(proof);
}

/** Legacy 1.0 flat schema (read-only migrate). */
const legacyProofSchema = z.object({
  schemaVersion: z.literal("1.0"),
  smokeValidated: z.boolean(),
  validatedAtMs: z.number().int().positive(),
  expiresAtMs: z.number().int().positive(),
  smokeId: z.string().min(4).max(64),
  urlEnvName: z.string().min(1).max(64),
  sharedRepository: z.enum([
    "SHARED_REPOSITORY_CONFIRMED",
    "SHARED_REPOSITORY_NOT_CONFIRMED",
    "NOT_MEASURED",
  ]),
  latencyClass: z.enum(["GOOD", "ACCEPTABLE", "HIGH", "NOT_MEASURED"]),
  latencyVerdict: z.enum(["PASS", "ACCEPTABLE_WITH_WARNING", "FAIL", "NOT_MEASURED"]),
  latencySamples: z.number().int().nonnegative(),
  latencyP50Ms: z.number().nullable(),
  latencyP95Ms: z.number().nullable(),
  latencyP99Ms: z.number().nullable(),
  casConcurrentFinalSequence: z.number().int().nullable(),
  namespaceIsolationOk: z.boolean().nullable(),
  cleanupOk: z.boolean(),
  mentorEligible: z.literal(false),
  proofSource: z.literal("authorized_smoke"),
  notes: z.array(z.string().max(200)).max(12).optional(),
});

function migrateLegacyProof(legacy: z.infer<typeof legacyProofSchema>): RedisValidationProof {
  // Legacy FAIL latency class/verdict meant high RTT, not functional failure.
  const performanceVerdict = toPerformanceVerdict(
    legacy.latencyClass === "HIGH" || legacy.latencyVerdict === "FAIL"
      ? "HIGH"
      : legacy.latencyVerdict,
  );
  const correctnessVerdict: CorrectnessVerdict = legacy.smokeValidated ? "PASS" : "FAIL";
  return buildRedisValidationProof({
    smokeId: legacy.smokeId,
    urlEnvName: legacy.urlEnvName,
    sharedRepository: legacy.sharedRepository,
    correctnessVerdict,
    connectOk: legacy.smokeValidated,
    casOk: legacy.casConcurrentFinalSequence === 13,
    performanceVerdict,
    latencySamples: legacy.latencySamples,
    latencyP50Ms: legacy.latencyP50Ms,
    latencyP95Ms: legacy.latencyP95Ms,
    latencyP99Ms: legacy.latencyP99Ms,
    casConcurrentFinalSequence: legacy.casConcurrentFinalSequence,
    namespaceIsolationOk: legacy.namespaceIsolationOk,
    cleanupOk: legacy.cleanupOk,
    smokeValidated: legacy.smokeValidated,
    notes: [
      ...(legacy.notes ?? []),
      "Migrated in-memory from schema 1.0 (read path)",
    ].slice(0, 12),
    nowMs: legacy.validatedAtMs,
    ttlMs: Math.max(1, legacy.expiresAtMs - legacy.validatedAtMs),
  });
}

export function parseRedisValidationProof(raw: string): RedisValidationProof | null {
  try {
    const json = JSON.parse(raw) as { schemaVersion?: string; mentorEligible?: unknown };
    if (json.mentorEligible !== false) return null;

    if (json.schemaVersion === "2.0") {
      const parsed = redisValidationProofSchema.safeParse(json);
      if (!parsed.success) return null;
      if (parsed.data.mentorEligible !== false) return null;
      if (parsed.data.security.mentorEligible !== false) return null;
      if (Date.now() > parsed.data.metadata.expiresAtMs) return null;
      return parsed.data;
    }

    if (json.schemaVersion === "1.0") {
      const legacy = legacyProofSchema.safeParse(json);
      if (!legacy.success) return null;
      if (Date.now() > legacy.data.expiresAtMs) return null;
      return migrateLegacyProof(legacy.data);
    }

    return null;
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
    safe = redisValidationProofSchema.parse({
      ...proof,
      mentorEligible: false,
      security: { ...proof.security, mentorEligible: false },
    });
  } catch {
    return { ok: false, keyNameOnly, reason: "proof schema validation failed" };
  }

  if (safe.schemaVersion !== "2.0") {
    return { ok: false, keyNameOnly, reason: "only schema 2.0 may be written" };
  }
  if (safe.correctness.verdict !== "PASS") {
    return { ok: false, keyNameOnly, reason: "correctness must be PASS to persist" };
  }
  if (!safe.metadata.smokeValidated) {
    return { ok: false, keyNameOnly, reason: "smokeValidated must be true to persist" };
  }
  if (safe.mentorEligible !== false || safe.security.mentorEligible !== false) {
    return { ok: false, keyNameOnly, reason: "mentorEligible must be false" };
  }
  if (safe.performance.verdict === "HIGH" && safe.performance.performancePassed === true) {
    return { ok: false, keyNameOnly, reason: "HIGH must not set performancePassed=true" };
  }
  // Force honesty on HIGH
  if (safe.performance.verdict === "HIGH") {
    safe = {
      ...safe,
      performance: { ...safe.performance, performancePassed: false },
      metadata: {
        ...safe.metadata,
        validationStatus: "VALIDATED_WITH_PERFORMANCE_WARNING",
      },
      mentorEligible: false,
    };
  }

  const ttlMs = Math.max(1_000, Math.floor(safe.metadata.expiresAtMs - Date.now()));
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  const payload = serializeRedisValidationProof(safe);
  const key = buildRedisValidationProofKey(telemetryPrefix);

  const setResult = await client.set(key, payload);
  if (setResult !== "OK") {
    return { ok: false, keyNameOnly, reason: "redis SET did not return OK" };
  }
  const expired = await client.expire(key, ttlSec);
  if (!expired) {
    await client.del(key);
    return { ok: false, keyNameOnly, reason: "redis EXPIRE failed after SET" };
  }
  const raw = await client.get(key);
  if (!raw || !parseRedisValidationProof(raw)) {
    return { ok: false, keyNameOnly, reason: "proof readback failed after write" };
  }
  const pttl = await client.pttl(key);
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

export type RedisValidationProofStatus = {
  smokeValidated: boolean;
  proofPresent: boolean;
  proofExpired: boolean;
  schemaVersion: "2.0" | "1.0" | null;
  validatedAtMs: number | null;
  expiresAtMs: number | null;
  sharedRepository: SharedRepositoryVerdict | "NOT_MEASURED";
  validationStatus: ValidationStatus;
  correctnessVerdict: CorrectnessVerdict;
  performanceVerdict: PerformanceVerdict;
  performancePassed: boolean;
  /** @deprecated alias of performanceVerdict for older UI */
  latencyClass: LatencyClass;
  /** @deprecated mapped legacy name */
  latencyVerdict: LatencyVerdict;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  casOk: boolean | null;
  namespaceIsolationOk: boolean | null;
  mentorEligible: false;
  urlEnvName: string | null;
  proofSource: "authorized_smoke" | null;
  thresholdsVersion: string | null;
  badges: {
    redisValidated: boolean;
    performanceWarning: boolean;
    fullyReady: false;
  };
  warnings: string[];
  blockers: string[];
};

export function redisValidationProofForStatus(
  proof: RedisValidationProof | null,
): RedisValidationProofStatus {
  const empty: RedisValidationProofStatus = {
    smokeValidated: false,
    proofPresent: false,
    proofExpired: false,
    schemaVersion: null,
    validatedAtMs: null,
    expiresAtMs: null,
    sharedRepository: "NOT_MEASURED",
    validationStatus: "NOT_VALIDATED",
    correctnessVerdict: "NOT_MEASURED",
    performanceVerdict: "NOT_MEASURED",
    performancePassed: false,
    latencyClass: "NOT_MEASURED",
    latencyVerdict: "NOT_MEASURED",
    latencyP50Ms: null,
    latencyP95Ms: null,
    latencyP99Ms: null,
    casOk: null,
    namespaceIsolationOk: null,
    mentorEligible: false,
    urlEnvName: null,
    proofSource: null,
    thresholdsVersion: null,
    badges: {
      redisValidated: false,
      performanceWarning: false,
      fullyReady: false,
    },
    warnings: [],
    blockers: ["REDIS_NOT_VALIDATED"],
  };

  if (!proof) return empty;

  const expired = Date.now() > proof.metadata.expiresAtMs;
  const validationStatus = expired ? "NOT_VALIDATED" : proof.metadata.validationStatus;
  const smokeValidated =
    !expired &&
    proof.metadata.smokeValidated === true &&
    proof.correctness.verdict === "PASS";
  const performanceVerdict = proof.performance.verdict;
  const performancePassed =
    smokeValidated && performancePassedForVerdict(performanceVerdict);
  const performanceWarning =
    smokeValidated &&
    (validationStatus === "VALIDATED_WITH_PERFORMANCE_WARNING" ||
      performanceVerdict === "HIGH" ||
      !performancePassed);

  const warnings: string[] = [];
  const blockers: string[] = [];
  if (performanceWarning) {
    warnings.push("REDIS_HIGH_LATENCY");
    blockers.push("REDIS_PERFORMANCE_NOT_APPROVED");
  }
  if (!smokeValidated) {
    blockers.push("REDIS_NOT_VALIDATED");
  }
  blockers.push("MENTOR_INTEGRATION_NOT_ENABLED");

  return {
    smokeValidated,
    proofPresent: true,
    proofExpired: expired,
    schemaVersion: "2.0",
    validatedAtMs: proof.metadata.validatedAtMs,
    expiresAtMs: proof.metadata.expiresAtMs,
    sharedRepository: proof.correctness.sharedRepository,
    validationStatus,
    correctnessVerdict: proof.correctness.verdict,
    performanceVerdict,
    performancePassed: performancePassed && performanceVerdict !== "HIGH",
    latencyClass: performanceVerdict,
    latencyVerdict: performanceVerdict,
    latencyP50Ms: proof.performance.p50Ms,
    latencyP95Ms: proof.performance.p95Ms,
    latencyP99Ms: proof.performance.p99Ms,
    casOk: proof.correctness.concurrentFinalSequence === 13,
    namespaceIsolationOk: proof.correctness.namespaceIsolationOk,
    mentorEligible: false,
    urlEnvName: proof.metadata.urlEnvName,
    proofSource: proof.metadata.proofSource,
    thresholdsVersion: proof.performance.thresholdsVersion,
    badges: {
      redisValidated: smokeValidated,
      performanceWarning,
      fullyReady: false,
    },
    warnings,
    blockers,
  };
}

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
