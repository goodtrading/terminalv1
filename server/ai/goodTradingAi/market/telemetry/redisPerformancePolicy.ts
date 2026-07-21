/**
 * AI-6.4.4g — RedisPerformancePolicy v1 (versioned).
 * ACTIVE thresholds are documentary + used for classification.
 * PROPOSED thresholds require human approval before becoming ACTIVE.
 * Never silently raise ACTIVE to force GO.
 */
export const REDIS_PERFORMANCE_THRESHOLDS_VERSION = "redis-performance-v1" as const;

/** What the classifier measures (post AI-6.4.4f atomic put = 1 RTT). */
export type RedisPerformanceMetricLayer =
  | "command_rtt"
  | "repo_put_async"
  | "repo_get_async"
  | "e2e_put_get_remove";

export type RedisPerformanceThresholdBand = {
  /** p95 ≤ this → GOOD */
  goodMaxMs: number;
  /** p95 ≤ this → ACCEPTABLE; above → HIGH (success+slow, not functional FAIL) */
  acceptableMaxMs: number;
};

/**
 * ACTIVE baseline (human-approved for AI-6.4.x).
 * Applies to successful measured putAsync wall-clock p95 unless noted.
 * HIGH means correct Redis ops with elevated latency — never "PASS".
 */
export const REDIS_PERFORMANCE_POLICY_V1_ACTIVE: {
  version: typeof REDIS_PERFORMANCE_THRESHOLDS_VERSION;
  status: "ACTIVE";
  layers: Record<RedisPerformanceMetricLayer, RedisPerformanceThresholdBand>;
  notes: string[];
} = {
  version: REDIS_PERFORMANCE_THRESHOLDS_VERSION,
  status: "ACTIVE",
  layers: {
    command_rtt: { goodMaxMs: 25, acceptableMaxMs: 80 },
    repo_put_async: { goodMaxMs: 25, acceptableMaxMs: 80 },
    repo_get_async: { goodMaxMs: 25, acceptableMaxMs: 80 },
    e2e_put_get_remove: { goodMaxMs: 80, acceptableMaxMs: 250 },
  },
  notes: [
    "GOOD/ACCEPTABLE/HIGH classify successful samples only.",
    "Performance FAIL is reserved for timeout/errors/unmeasured — not high RTT.",
    "138ms private RTT → HIGH under ACTIVE putAsync band — do not reclassify as GOOD.",
  ],
};

/**
 * PROPOSED only — NOT ACTIVE. Do not apply in classifiers without human approval.
 * Example future bands acknowledging private-network floors; left inactive on purpose.
 */
export const REDIS_PERFORMANCE_POLICY_V1_PROPOSED: {
  version: "redis-performance-v1-proposed";
  status: "PROPOSED_NOT_ACTIVE";
  layers: Record<RedisPerformanceMetricLayer, RedisPerformanceThresholdBand>;
  requiresHumanApproval: true;
  notes: string[];
} = {
  version: "redis-performance-v1-proposed",
  status: "PROPOSED_NOT_ACTIVE",
  requiresHumanApproval: true,
  layers: {
    command_rtt: { goodMaxMs: 50, acceptableMaxMs: 150 },
    repo_put_async: { goodMaxMs: 50, acceptableMaxMs: 150 },
    repo_get_async: { goodMaxMs: 50, acceptableMaxMs: 150 },
    e2e_put_get_remove: { goodMaxMs: 150, acceptableMaxMs: 450 },
  },
  notes: [
    "Proposed for Railway private floors ~100–150ms — NOT applied.",
    "Human must approve before swapping ACTIVE.",
  ],
};

export type PerformanceVerdict =
  | "GOOD"
  | "ACCEPTABLE"
  | "HIGH"
  | "FAIL"
  | "NOT_MEASURED";

/**
 * Classify successful p95 against ACTIVE repo_put_async band.
 * Never returns FAIL for high latency alone — use FAIL only when caller marks measurement failure.
 */
export function classifyPerformanceP95(
  p95Ms: number,
  opts?: { measurementFailed?: boolean; layer?: RedisPerformanceMetricLayer },
): PerformanceVerdict {
  if (opts?.measurementFailed) return "FAIL";
  if (!Number.isFinite(p95Ms) || p95Ms < 0) return "NOT_MEASURED";
  const layer = opts?.layer ?? "repo_put_async";
  const band = REDIS_PERFORMANCE_POLICY_V1_ACTIVE.layers[layer];
  if (p95Ms <= band.goodMaxMs) return "GOOD";
  if (p95Ms <= band.acceptableMaxMs) return "ACCEPTABLE";
  return "HIGH";
}

/** performancePassed is true only for GOOD or ACCEPTABLE — never HIGH. */
export function performancePassedForVerdict(v: PerformanceVerdict): boolean {
  return v === "GOOD" || v === "ACCEPTABLE";
}
