/**
 * Knowledge Stability Report aggregates.
 */
import type {
  KnowledgeStabilityReport,
  RuleHistory,
  RuleStability,
  RuleVolatility,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { knowledgeStabilityReportSchema } from "@shared/goodTradingAiKnowledgeEvolution";

export function buildStabilityReport(input: {
  histories: RuleHistory[];
  stabilities: RuleStability[];
  volatilities: RuleVolatility[];
  nowMs?: number;
}): KnowledgeStabilityReport {
  const now = input.nowMs ?? Date.now();
  const recentMs = 7 * 24 * 60 * 60 * 1000;
  const byStab = [...input.stabilities].sort((a, b) => b.stabilityScore - a.stabilityScore);
  const byVol = [...input.volatilities].sort((a, b) => b.volatilityScore - a.volatilityScore);
  const byChallenge = [...input.histories].sort(
    (a, b) => b.disagreementCount + b.exceptionCount - (a.disagreementCount + a.exceptionCount),
  );
  const byConfirm = [...input.histories].sort((a, b) => b.agreementCount - a.agreementCount);
  const neverChallenged = input.histories
    .filter((h) => h.disagreementCount === 0 && h.exceptionCount === 0 && h.revisions === 0)
    .map((h) => h.ruleId)
    .slice(0, 40);
  const recentlyChanged = input.histories
    .filter((h) => now - h.lastSeenAtMs <= recentMs && (h.revisions > 0 || h.disagreementCount > 0))
    .sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs)
    .map((h) => h.ruleId)
    .slice(0, 20);

  return knowledgeStabilityReportSchema.parse({
    mostStable: byStab.slice(0, 20).map((s) => s.ruleId),
    leastStable: byStab.slice().reverse().slice(0, 20).map((s) => s.ruleId),
    highestVolatility: byVol.slice(0, 20).map((s) => s.ruleId),
    mostChallenged: byChallenge.slice(0, 20).map((h) => h.ruleId),
    mostConfirmed: byConfirm.slice(0, 20).map((h) => h.ruleId),
    neverChallenged,
    recentlyChanged,
    mentorEligible: false,
  });
}