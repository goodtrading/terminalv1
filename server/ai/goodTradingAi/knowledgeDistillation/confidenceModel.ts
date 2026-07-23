/**
 * Confidence Model — coverage/consistency/repetition/conflicts/uncertainty.
 * NO win rate.
 */
import type {
  ConflictHeatmap,
  DistilledObservation,
  RuleCluster,
  RuleConfidence,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { ruleConfidenceSchema } from "@shared/goodTradingAiKnowledgeDistillation";

export function computeRuleConfidences(input: {
  observations: DistilledObservation[];
  clusters: RuleCluster[];
  conflictHeatmap: ConflictHeatmap;
}): RuleConfidence[] {
  const total = Math.max(1, input.observations.length);
  const conflictLens = new Set(
    input.conflictHeatmap.cells.flatMap((c) => [c.lensA, c.lensB]),
  );
  return input.clusters.map((c) => {
    const members = input.observations.filter((o) => c.memberObservationIds.includes(o.id));
    const coverage = Math.min(1, members.length / Math.max(3, total * 0.05));
    const signalAgree = members.filter((m) => m.signals.includes("AGREE")).length;
    const signalDisagree = members.filter((m) => m.signals.includes("DISAGREE")).length;
    const consistency =
      members.length === 0
        ? 0
        : Math.max(0, 1 - signalDisagree / members.length) *
          (0.5 + 0.5 * (signalAgree / members.length || 0.5));
    const repetition = Math.min(1, (c.frequency - 1) / 5);
    const conflictPenalty = c.lenses.some((l) => conflictLens.has(l)) ? 0.35 : 0.05;
    const uncertainty =
      members.filter((m) =>
        m.signals.some((s) => s === "NEEDS_MORE_EVIDENCE" || s === "DEFER" || s === "NEEDS_CONDITIONS"),
      ).length / Math.max(1, members.length);
    const confidenceScore = Math.max(
      0,
      Math.min(
        1,
        0.28 * coverage +
          0.28 * consistency +
          0.22 * repetition -
          0.2 * conflictPenalty -
          0.18 * uncertainty +
          0.15,
      ),
    );
    return ruleConfidenceSchema.parse({
      clusterId: c.id,
      conceptKey: c.conceptKey,
      coverage,
      consistency,
      repetition,
      conflictPenalty,
      uncertainty,
      confidenceScore,
      mentorEligible: false,
    });
  });
}