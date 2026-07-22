/**
 * AI-7 — Conflict engine (reuses AI-4 contradiction detector).
 */
import { detectReasoningContradictions } from "../reasoning/contradictionDetector";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import type { ContradictionFinding } from "../reasoning/contradictionDetector";

export function detectDecisionConflicts(params: {
  question: string;
  entries: GoodTradingKnowledgeEntry[];
}): ContradictionFinding[] {
  return detectReasoningContradictions({
    message: params.question,
    entries: params.entries,
  });
}
