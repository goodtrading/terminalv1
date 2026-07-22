/**
 * AI-7 — Evidence hierarchy rules.
 * STALE cannot SUPPORTS. UNTRUSTED cannot elevate live claims.
 */
import type { DecisionEvidenceRelation } from "@shared/goodTradingAiDecisionGraph";
import type { DecisionContextTrust } from "@shared/goodTradingAiDecisionGraph";

export type EvidenceApplyInput = {
  proposed: DecisionEvidenceRelation;
  trust: DecisionContextTrust;
  stale: boolean;
};

/**
 * Normalize proposed relation under trust/staleness constraints.
 */
export function applyEvidenceHierarchy(input: EvidenceApplyInput): DecisionEvidenceRelation {
  if (input.stale && input.proposed === "SUPPORTS") {
    return "INSUFFICIENT";
  }
  if (
    (input.trust === "UNTRUSTED_SCENARIO" || input.trust === "NO_MARKET") &&
    input.proposed === "SUPPORTS"
  ) {
    // Hypothetical may weakly inform but not fully support a live-grade reading
    return input.trust === "UNTRUSTED_SCENARIO" ? "NEUTRAL" : "INSUFFICIENT";
  }
  return input.proposed;
}

export function relationStrength(r: DecisionEvidenceRelation): number {
  switch (r) {
    case "INVALIDATES":
      return -3;
    case "CONFLICTS":
      return -2;
    case "WEAKENS":
      return -1;
    case "INSUFFICIENT":
      return 0;
    case "NEUTRAL":
      return 0;
    case "SUPPORTS":
      return 1;
  }
}
