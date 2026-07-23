/**
 * Rule Volatility — feeds Active Learning. No market data.
 */
import type { RuleHistory, RuleVolatility } from "@shared/goodTradingAiKnowledgeEvolution";
import { ruleVolatilitySchema } from "@shared/goodTradingAiKnowledgeEvolution";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function computeVolatilities(histories: RuleHistory[], nowMs = Date.now()): RuleVolatility[] {
  const recentWindowMs = 14 * 24 * 60 * 60 * 1000;
  return histories.map((h) => {
    const reviews = Math.max(1, h.reviewCount);
    const changeRate = clamp01((h.revisions + h.needsConditionsCount) / reviews);
    const exceptionRate = clamp01(h.exceptionCount / reviews);
    const revisionRate = clamp01(h.revisions / reviews);
    const recent = nowMs - h.lastSeenAtMs <= recentWindowMs;
    const recentDisagreementRate = recent
      ? clamp01(h.disagreementCount / reviews)
      : clamp01((h.disagreementCount / reviews) * 0.4);
    const volatilityScore = clamp01(
      0.3 * changeRate + 0.25 * exceptionRate + 0.2 * revisionRate + 0.25 * recentDisagreementRate,
    );
    return ruleVolatilitySchema.parse({
      ruleId: h.ruleId,
      changeRate,
      exceptionRate,
      revisionRate,
      recentDisagreementRate,
      volatilityScore,
      mentorEligible: false,
    });
  });
}