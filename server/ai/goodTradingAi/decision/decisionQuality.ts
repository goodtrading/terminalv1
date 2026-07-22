/**
 * AI-7 — Decision quality categories (NOT win %).
 */
import type {
  DecisionPathOutcome,
  DecisionQualityCategory,
} from "@shared/goodTradingAiDecisionGraph";
import type { DecisionContextTrust } from "@shared/goodTradingAiDecisionGraph";

export function classifyDecisionQuality(params: {
  trust: DecisionContextTrust;
  snapshotStale: boolean;
  primaryOutcome: DecisionPathOutcome | null;
  conflictCount: number;
}): DecisionQualityCategory {
  if (params.trust === "UNTRUSTED_SCENARIO") return "UNTRUSTED_SCENARIO";
  if (params.snapshotStale || params.primaryOutcome === "CONTEXT_STALE") return "STALE_CONTEXT";
  if (
    params.primaryOutcome === "READING_CONFLICTED" ||
    params.conflictCount > 0
  ) {
    return "CONFLICTED";
  }
  if (params.primaryOutcome === "HYPOTHESIS_INVALIDATED") return "INVALIDATED";
  if (
    params.primaryOutcome === "EVIDENCE_INSUFFICIENT" ||
    params.primaryOutcome === "NEEDS_MORE_LENSES" ||
    params.primaryOutcome === "HYPOTHESIS_OPEN"
  ) {
    return "INSUFFICIENT_EVIDENCE";
  }
  if (params.primaryOutcome === "HYPOTHESIS_SUPPORTED") return "WELL_SUPPORTED";
  if (params.primaryOutcome === "HYPOTHESIS_WEAKENED") return "PARTIALLY_SUPPORTED";
  if (params.primaryOutcome === "CONTEXT_UNTRUSTED" || params.primaryOutcome === "GUARD_BLOCKED") {
    return "UNTRUSTED_SCENARIO";
  }
  return "PARTIALLY_SUPPORTED";
}
