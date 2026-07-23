/**
 * Challenge Engine — Challenge Me mode.
 * Never answers. Prioritizes hypothesis-discriminating challenges.
 */
import type {
  ChallengeItem,
  ConflictHeatmap,
  RuleCluster,
  RuleConfidence,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { challengeItemSchema } from "@shared/goodTradingAiKnowledgeDistillation";

export function buildChallenges(input: {
  clusters: RuleCluster[];
  confidences: RuleConfidence[];
  conflicts: ConflictHeatmap;
  limit?: number;
}): ChallengeItem[] {
  const limit = input.limit ?? 15;
  const out: ChallengeItem[] = [];
  let i = 0;

  for (const cell of input.conflicts.cells.slice(0, 6)) {
    i++;
    out.push(
      challengeItemSchema.parse({
        id: `ch_${String(i).padStart(3, "0")}`,
        kind: "HYPOTHESIS_DISCRIMINATION",
        prompt: `Challenge: Assume ${cell.lensA}-first is true OR ${cell.lensB}-first is true — what single piece of evidence would force you to abandon one hypothesis?`,
        relatedLenses: [cell.lensA, cell.lensB],
        hypothesisA: `${cell.lensA} dominates ${cell.lensB}`,
        hypothesisB: `${cell.lensB} dominates ${cell.lensA}`,
        discriminationScore: Math.min(1, 0.65 + cell.frequency),
        neverAnswers: true,
        mentorEligible: false,
      }),
    );
  }

  const top = [...input.clusters].sort((a, b) => b.frequency - a.frequency).slice(0, 5);
  for (const c of top) {
    i++;
    out.push(
      challengeItemSchema.parse({
        id: `ch_${String(i).padStart(3, "0")}`,
        kind: "EVIDENCE_THAT_CHANGES_DECISION",
        prompt: `Challenge the rule "${c.canonicalText.slice(0, 140)}": what evidence would change the decision entirely?`,
        targetClusterId: c.id,
        relatedLenses: c.lenses.slice(0, 6),
        hypothesisA: "Rule holds under current conditions",
        hypothesisB: "Rule fails; alternate methodology required",
        discriminationScore: 0.8,
        neverAnswers: true,
        mentorEligible: false,
      }),
    );
    if (c.lenses.includes("ABSORPTION")) {
      i++;
      out.push(
        challengeItemSchema.parse({
          id: `ch_${String(i).padStart(3, "0")}`,
          kind: "REMOVE_ABSORPTION",
          prompt: `Remove ABSORPTION from the reading of "${c.canonicalText.slice(0, 100)}". Does the methodology still hold?`,
          targetClusterId: c.id,
          relatedLenses: c.lenses.slice(0, 6),
          hypothesisA: "Absorption is necessary",
          hypothesisB: "Absorption is optional / misleading",
          discriminationScore: 0.85,
          neverAnswers: true,
          mentorEligible: false,
        }),
      );
    }
  }

  if (input.conflicts.cells.some((c) => (c.lensA === "DEALER" && c.lensB === "GAMMA") || (c.lensA === "GAMMA" && c.lensB === "DEALER")) || true) {
    i++;
    out.push(
      challengeItemSchema.parse({
        id: `ch_${String(i).padStart(3, "0")}`,
        kind: "DEALER_VS_GAMMA",
        prompt: "Challenge: Dealer positioning vs Gamma regime — which hypothesis wins when they conflict, and what invalidates that choice?",
        relatedLenses: ["DEALER", "GAMMA"],
        hypothesisA: "Dealer positioning dominates gamma regime",
        hypothesisB: "Gamma regime dominates dealer positioning",
        discriminationScore: 0.9,
        neverAnswers: true,
        mentorEligible: false,
      }),
    );
  }

  i++;
  out.push(
    challengeItemSchema.parse({
      id: `ch_${String(i).padStart(3, "0")}`,
      kind: "FULL_INVALIDATION",
      prompt: "Challenge: State the full invalidation stack that would force you to abandon the current methodological frame entirely.",
      relatedLenses: ["INVALIDATION"],
      hypothesisA: "Current frame remains valid with patches",
      hypothesisB: "Frame is invalidated; rebuild required",
      discriminationScore: 0.75,
      neverAnswers: true,
      mentorEligible: false,
    }),
  );

  i++;
  out.push(
    challengeItemSchema.parse({
      id: `ch_${String(i).padStart(3, "0")}`,
      kind: "HEURISTIC_FAILURE",
      prompt: "Challenge: Which of your most-used heuristics would fail first in a stale/conflicted context, and what replaces it?",
      relatedLenses: ["STALENESS", "CONFLICTS"],
      hypothesisA: "Heuristic remains robust under staleness",
      hypothesisB: "Heuristic fails; alternate confirmation path required",
      discriminationScore: 0.78,
      neverAnswers: true,
      mentorEligible: false,
    }),
  );

  return out
    .sort((a, b) => b.discriminationScore - a.discriminationScore)
    .slice(0, limit);
}