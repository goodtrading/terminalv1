/**
 * Coverage Heatmap — per lens/concept counts (structured metrics).
 */
import type {
  CoverageHeatmap,
  DistilledObservation,
  RuleCluster,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { coverageHeatmapSchema, ALL_EVIDENCE_LENSES } from "@shared/goodTradingAiKnowledgeDistillation";

export function buildCoverageHeatmap(
  observations: DistilledObservation[],
  clusters: RuleCluster[],
): CoverageHeatmap {
  const total = Math.max(1, observations.length);
  const lensCounts = new Map<string, number>();
  for (const lens of ALL_EVIDENCE_LENSES) lensCounts.set(lens, 0);
  for (const o of observations) {
    for (const lens of o.lenses) {
      lensCounts.set(lens, (lensCounts.get(lens) ?? 0) + 1);
    }
  }
  const cells = [
    ...[...lensCounts.entries()].map(([key, count]) => ({
      key,
      kind: "LENS" as const,
      count,
      coverageRatio: count / total,
    })),
    ...clusters.slice(0, 40).map((c) => ({
      key: c.conceptKey.slice(0, 80),
      kind: "CONCEPT" as const,
      count: c.frequency,
      coverageRatio: c.frequency / total,
    })),
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, 120);

  return coverageHeatmapSchema.parse({
    cells,
    totalObservations: observations.length,
    mentorEligible: false,
  });
}