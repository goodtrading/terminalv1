/**
 * Challenge Score per rule — robustness/contradictions/exceptions/counterexamples/
 * humanAgreement/reviewCount. NO accuracy / win rate.
 */
import type {
  ChallengeScore,
  DistilledObservation,
  RuleCluster,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { challengeScoreSchema } from "@shared/goodTradingAiKnowledgeDistillation";

export function scoreChallenges(input: {
  clusters: RuleCluster[];
  observations: DistilledObservation[];
}): ChallengeScore[] {
  return input.clusters.map((c) => {
    const members = input.observations.filter((o) => c.memberObservationIds.includes(o.id));
    const reviewCount = members.length;
    const agree = members.filter((m) => m.signals.includes("AGREE")).length;
    const disagree = members.filter((m) => m.signals.includes("DISAGREE")).length;
    const needs = members.filter((m) =>
      m.signals.some((s) => s === "NEEDS_CONDITIONS" || s === "NEEDS_MORE_EVIDENCE"),
    ).length;
    const defer = members.filter((m) => m.signals.includes("DEFER")).length;
    const humanAgreement = reviewCount === 0 ? 0.5 : agree / reviewCount;
    const contradictions = reviewCount === 0 ? 0 : disagree / reviewCount;
    const exceptions = reviewCount === 0 ? 0 : needs / reviewCount;
    const counterexamples = reviewCount === 0 ? 0 : Math.min(1, (disagree + defer) / reviewCount);
    const robustness = Math.max(
      0,
      Math.min(1, 0.55 * humanAgreement + 0.25 * Math.min(1, reviewCount / 5) - 0.2 * contradictions - 0.15 * counterexamples),
    );
    const challengeScore = Math.max(
      0,
      Math.min(
        1,
        0.3 * robustness +
          0.2 * (1 - contradictions) +
          0.15 * (1 - exceptions) +
          0.15 * (1 - counterexamples) +
          0.1 * humanAgreement +
          0.1 * Math.min(1, reviewCount / 8),
      ),
    );
    return challengeScoreSchema.parse({
      clusterId: c.id,
      robustness,
      contradictions,
      exceptions,
      counterexamples,
      humanAgreement,
      reviewCount,
      challengeScore,
      mentorEligible: false,
    });
  });
}