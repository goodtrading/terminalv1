/**
 * Adaptive Question Engine — ONLY HIGH_CONFLICT | HIGH_UNCERTAINTY | LOW_COVERAGE | LOW_CONFIDENCE.
 * Prefer high hypothesis-discrimination info gain.
 */
import type {
  AdaptiveQuestion,
  ConflictHeatmap,
  KnowledgeGap,
  RuleCluster,
  RuleConfidence,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { adaptiveQuestionSchema } from "@shared/goodTradingAiKnowledgeDistillation";
import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";

export function generateAdaptiveQuestions(input: {
  gaps: KnowledgeGap[];
  conflicts: ConflictHeatmap;
  confidences: RuleConfidence[];
  clusters: RuleCluster[];
  limit?: number;
}): AdaptiveQuestion[] {
  const limit = input.limit ?? 20;
  const out: AdaptiveQuestion[] = [];
  let i = 0;

  for (const cell of input.conflicts.cells.filter((c) => c.count >= 1).slice(0, 10)) {
    i++;
    const lenses: EvidenceLens[] = [cell.lensA, cell.lensB];
    out.push(
      adaptiveQuestionSchema.parse({
        id: `aq_${String(i).padStart(3, "0")}`,
        prompt: `When ${cell.lensA} and ${cell.lensB} disagree, which methodological hypothesis should dominate, and what single observation would flip that priority?`,
        drivers: ["HIGH_CONFLICT", "HIGH_INFORMATION_GAIN"],
        relatedLenses: lenses,
        relatedClusterIds: [],
        infoGainHint: "HIGH",
        hypothesisDiscrimination: Math.min(1, 0.55 + cell.frequency),
        allowsDepends: true,
        mentorEligible: false,
      }),
    );
  }

  for (const gap of input.gaps.filter((g) => g.kind === "NEVER_DISCUSSED" || g.kind === "LOW_COVERAGE").slice(0, 8)) {
    i++;
    out.push(
      adaptiveQuestionSchema.parse({
        id: `aq_${String(i).padStart(3, "0")}`,
        prompt: `Lens ${gap.subject} is under-covered. What confirmation and invalidation would you require before trusting a reading that hinges on ${gap.subject}?`,
        drivers: ["LOW_COVERAGE"],
        relatedLenses: [],
        relatedClusterIds: [],
        infoGainHint: "MEDIUM",
        hypothesisDiscrimination: 0.45,
        allowsDepends: true,
        mentorEligible: false,
      }),
    );
  }

  for (const conf of input.confidences.filter((c) => c.confidenceScore < 0.4 || c.uncertainty >= 0.45).slice(0, 8)) {
    i++;
    const cluster = input.clusters.find((c) => c.id === conf.clusterId);
    out.push(
      adaptiveQuestionSchema.parse({
        id: `aq_${String(i).padStart(3, "0")}`,
        prompt: `Rule "${(cluster?.canonicalText ?? conf.conceptKey).slice(0, 120)}" has low confidence. Which competing hypothesis would you adopt if this rule failed once?`,
        drivers: conf.uncertainty >= 0.45 ? ["HIGH_UNCERTAINTY", "LOW_CONFIDENCE"] : ["LOW_CONFIDENCE"],
        relatedLenses: cluster?.lenses.slice(0, 6) ?? [],
        relatedClusterIds: [conf.clusterId],
        infoGainHint: "HIGH",
        hypothesisDiscrimination: 0.7,
        allowsDepends: true,
        mentorEligible: false,
      }),
    );
  }

  return out
    .sort((a, b) => b.hypothesisDiscrimination - a.hypothesisDiscrimination)
    .slice(0, limit);
}