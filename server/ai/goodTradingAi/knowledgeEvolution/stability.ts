/**
 * Rule Stability — NO accuracy / win-rate / market data.
 */
import type { RuleHistory, RuleStability } from "@shared/goodTradingAiKnowledgeEvolution";
import { ruleStabilitySchema } from "@shared/goodTradingAiKnowledgeEvolution";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computeStabilities(histories: RuleHistory[]): RuleStability[] {
  return histories.map((h) => {
    const reviews = Math.max(1, h.reviewCount);
    const repetition = clamp01(h.reviewCount / 8);
    const agreeRatio = h.agreementCount / reviews;
    const disagreeRatio = h.disagreementCount / reviews;
    const consistency = clamp01(0.5 + agreeRatio * 0.5 - disagreeRatio * 0.5);
    const revisionPenalty = clamp01(h.revisions / Math.max(3, reviews));
    const contradictionPenalty = clamp01(h.contradictionCount / reviews);
    const exceptionPenalty = clamp01(h.exceptionCount / reviews);
    const stabilityScore = clamp01(
      0.35 * repetition +
        0.35 * consistency +
        0.1 * (1 - revisionPenalty) +
        0.1 * (1 - contradictionPenalty) +
        0.1 * (1 - exceptionPenalty),
    );
    return ruleStabilitySchema.parse({
      ruleId: h.ruleId,
      repetition,
      consistency,
      revisionPenalty,
      contradictionPenalty,
      exceptionPenalty,
      stabilityScore,
      mentorEligible: false,
    });
  });
}