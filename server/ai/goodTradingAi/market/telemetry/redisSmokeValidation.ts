/**
 * AI-6.4.2 — In-process smoke validation facts (never invent; only set when smoke ran).
 * Process-local — not persisted; status exposes only when true/measured.
 */

export type LatencyVerdict =
  | "PASS"
  | "ACCEPTABLE_WITH_WARNING"
  | "FAIL"
  | "NOT_MEASURED";

export type SharedRepositoryVerdict =
  | "SHARED_REPOSITORY_CONFIRMED"
  | "SHARED_REPOSITORY_NOT_CONFIRMED"
  | "NOT_MEASURED";

export type RedisSmokeValidationFacts = {
  smokeValidated: boolean;
  smokeId: string | null;
  smokePrefix: string | null;
  sharedRepository: SharedRepositoryVerdict;
  latency: {
    verdict: LatencyVerdict;
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

let facts: RedisSmokeValidationFacts = { ...DEFAULT_FACTS, latency: { ...DEFAULT_FACTS.latency }, notes: [...DEFAULT_FACTS.notes] };

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

/** Latency thresholds for telemetry put (ms). */
export function classifyLatencyP95(p95Ms: number): LatencyVerdict {
  if (p95Ms <= 25) return "PASS";
  if (p95Ms <= 80) return "ACCEPTABLE_WITH_WARNING";
  return "FAIL";
}

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
  latencyVerdict: LatencyVerdict;
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
