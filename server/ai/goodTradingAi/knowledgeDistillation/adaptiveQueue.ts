/**
 * Adaptive Queue priority:
 * HIGH_CONFLICT → HIGH_INFORMATION_GAIN → LOW_COVERAGE → LOW_CONFIDENCE → RANDOM
 */
import type { AdaptiveDriver, AdaptiveQuestion } from "@shared/goodTradingAiKnowledgeDistillation";

const PRIORITY: AdaptiveDriver[] = [
  "HIGH_CONFLICT",
  "HIGH_INFORMATION_GAIN",
  "LOW_COVERAGE",
  "LOW_CONFIDENCE",
  "RANDOM",
];

function driverRank(drivers: AdaptiveDriver[]): number {
  let best = PRIORITY.length;
  for (const d of drivers) {
    const idx = PRIORITY.indexOf(d);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best;
}

export function buildAdaptiveQueue(questions: AdaptiveQuestion[], limit = 20): AdaptiveQuestion[] {
  const withRandom = questions.map((q, i) =>
    q.drivers.length === 0
      ? q
      : q,
  );
  // Tie-break: higher hypothesisDiscrimination first within same driver rank
  return [...withRandom]
    .sort((a, b) => {
      const ra = driverRank(a.drivers);
      const rb = driverRank(b.drivers);
      if (ra !== rb) return ra - rb;
      return b.hypothesisDiscrimination - a.hypothesisDiscrimination;
    })
    .slice(0, limit);
}