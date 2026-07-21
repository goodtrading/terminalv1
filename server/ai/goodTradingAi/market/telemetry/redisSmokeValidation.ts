/**
 * AI-6.4.2 / 6.4.4g — In-process smoke validation facts (never invent; only set when smoke ran).
 * Process-local — not persisted; status exposes only when true/measured.
 * Correctness ≠ performance: HIGH latency does not fail correctness.
 */
import {
  classifyPerformanceP95,
  type PerformanceVerdict,
} from "./redisPerformancePolicy";

export type CorrectnessVerdict = "PASS" | "FAIL" | "NOT_MEASURED";

export type ValidationStatus =
  | "VALIDATED"
  | "VALIDATED_WITH_PERFORMANCE_WARNING"
  | "VALIDATION_FAILED"
  | "NOT_VALIDATED";

/** @deprecated Prefer PerformanceVerdict (GOOD/ACCEPTABLE/HIGH). */
export type LatencyVerdict =
  | "PASS"
  | "ACCEPTABLE_WITH_WARNING"
  | "FAIL"
  | "NOT_MEASURED"
  | PerformanceVerdict;

export type { PerformanceVerdict };

export type SharedRepositoryVerdict =
  | "SHARED_REPOSITORY_CONFIRMED"
  | "SHARED_REPOSITORY_NOT_CONFIRMED"
  | "NOT_MEASURED";

export type RedisSmokeValidationFacts = {
  smokeValidated: boolean;
  smokeId: string | null;
  smokePrefix: string | null;
  sharedRepository: SharedRepositoryVerdict;
  correctnessVerdict: CorrectnessVerdict;
  performanceVerdict: PerformanceVerdict;
  validationStatus: ValidationStatus;
  performancePassed: boolean;
  latency: {
    /** Performance verdict (GOOD/ACCEPTABLE/HIGH/…) */
    verdict: PerformanceVerdict;
    samples: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
  };
  casConcurrentFinalSequence: number | null;
  namespaceIsolationOk: boolean | null;
  healthIndependent: true;
  measuredAtMs: number | null;
  notes: string[];
};

const DEFAULT_FACTS: RedisSmokeValidationFacts = {
  smokeValidated: false,
  smokeId: null,
  smokePrefix: null,
  sharedRepository: "NOT_MEASURED",
  correctnessVerdict: "NOT_MEASURED",
  performanceVerdict: "NOT_MEASURED",
  validationStatus: "NOT_VALIDATED",
  performancePassed: false,
  latency: {
    verdict: "NOT_MEASURED",
    samples: 0,
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
  },
  casConcurrentFinalSequence: null,
  namespaceIsolationOk: null,
  healthIndependent: true,
  measuredAtMs: null,
  notes: ["Smoke not run in this process — facts default NOT_MEASURED / false"],
};

let facts: RedisSmokeValidationFacts = {
  ...DEFAULT_FACTS,
  latency: { ...DEFAULT_FACTS.latency },
  notes: [...DEFAULT_FACTS.notes],
};

export function getRedisSmokeValidationFacts(): RedisSmokeValidationFacts {
  return {
    ...facts,
    latency: { ...facts.latency },
    notes: [...facts.notes],
  };
}

export function resetRedisSmokeValidationFactsForTests(): void {
  facts = {
    ...DEFAULT_FACTS,
    latency: { ...DEFAULT_FACTS.latency },
    notes: [...DEFAULT_FACTS.notes],
  };
}

export function setRedisSmokeValidationFacts(
  next: Partial<RedisSmokeValidationFacts> & {
    latency?: Partial<RedisSmokeValidationFacts["latency"]>;
  },
): RedisSmokeValidationFacts {
  facts = {
    ...facts,
    ...next,
    latency: { ...facts.latency, ...(next.latency ?? {}) },
    notes: next.notes ?? facts.notes,
    healthIndependent: true,
  };
  return getRedisSmokeValidationFacts();
}

/**
 * @deprecated Use classifyPerformanceP95 — maps to legacy LatencyVerdict names.
 * HIGH latency returns FAIL here only for backward-compat callers; prefer performance API.
 */
export function classifyLatencyP95(p95Ms: number): LatencyVerdict {
  const p = classifyPerformanceP95(p95Ms);
  if (p === "GOOD") return "PASS";
  if (p === "ACCEPTABLE") return "ACCEPTABLE_WITH_WARNING";
  if (p === "HIGH") return "FAIL";
  return p;
}

export { classifyPerformanceP95 };

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[idx]!;
}

/** Status projection — omit inventing true; only expose measured flags honestly. */
export function redisSmokeFactsForStatus(): {
  smokeValidated: boolean;
  sharedRepository: SharedRepositoryVerdict;
  correctnessVerdict: CorrectnessVerdict;
  performanceVerdict: PerformanceVerdict;
  validationStatus: ValidationStatus;
  performancePassed: boolean;
  latencyVerdict: PerformanceVerdict;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  latencySamples: number;
  casConcurrentFinalSequence: number | null;
  namespaceIsolationOk: boolean | null;
  smokeId: string | null;
  measuredAtMs: number | null;
} {
  const f = getRedisSmokeValidationFacts();
  return {
    smokeValidated: f.smokeValidated === true,
    sharedRepository: f.sharedRepository,
    correctnessVerdict: f.correctnessVerdict,
    performanceVerdict: f.performanceVerdict,
    validationStatus: f.validationStatus,
    performancePassed: f.performancePassed === true,
    latencyVerdict: f.latency.verdict,
    latencyP50Ms: f.latency.p50Ms,
    latencyP95Ms: f.latency.p95Ms,
    latencyP99Ms: f.latency.p99Ms,
    latencySamples: f.latency.samples,
    casConcurrentFinalSequence: f.casConcurrentFinalSequence,
    namespaceIsolationOk: f.namespaceIsolationOk,
    smokeId: f.smokeValidated ? f.smokeId : null,
    measuredAtMs: f.smokeValidated ? f.measuredAtMs : null,
  };
}
