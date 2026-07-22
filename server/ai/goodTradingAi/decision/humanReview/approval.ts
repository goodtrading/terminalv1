/**
 * AI-7.2 — Methodology change proposals from three-way comparison.
 * Never auto-approves golden. Always PENDING + autoApply:false + brainMutate:false.
 */
import { randomUUID } from "node:crypto";
import {
  HUMAN_REVIEW_OWNER,
  type HumanDecisionComparison,
  type MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";

function suggestAction(
  comparison: HumanDecisionComparison,
): MethodologyChangeProposal["suggestedAction"] {
  switch (comparison.comparisonClass) {
    case "HUMAN_ENGINE_AGREE_GOLDEN_DIFF":
    case "CIRCULAR_CALIBRATION_SIGNAL":
      return "REVIEW_GOLDEN";
    case "HUMAN_GOLDEN_AGREE_ENGINE_DIFF":
      return "REVIEW_ENGINE";
    case "HUMAN_INSUFFICIENT_ENGINE_DEFINITE":
      return "EXPAND_CASE";
    case "ENGINE_GOLDEN_AGREE_HUMAN_DIFF":
      return "KEEP_AS_IS";
    case "THREE_WAY_SPLIT":
      return "REVIEW_TEMPLATE";
    case "HUMAN_ENGINE_GOLDEN_AGREE":
    case "PENDING_HUMAN":
    default:
      return "KEEP_AS_IS";
  }
}

/**
 * Creates a PENDING proposal. Never auto-approves golden expectations.
 * autoApply and brainMutate are sealed false.
 */
export function createMethodologyProposalFromComparison(
  comparison: HumanDecisionComparison,
  opts?: { rationale?: string; nowMs?: number; id?: string },
): MethodologyChangeProposal {
  const rationale =
    opts?.rationale ??
    `Three-way class ${comparison.comparisonClass}; taxonomy=${comparison.taxonomyCodes.join(",")}`;

  return {
    id: opts?.id ?? `prop_${randomUUID().slice(0, 12)}`,
    reviewCaseId: comparison.reviewCaseId,
    status: "PENDING",
    taxonomyCodes: comparison.taxonomyCodes.slice(0, 8),
    comparisonClass: comparison.comparisonClass,
    rationale: rationale.slice(0, 1200),
    suggestedAction: suggestAction(comparison),
    autoApply: false,
    brainMutate: false,
    createdAtMs: opts?.nowMs ?? Date.now(),
    owner: HUMAN_REVIEW_OWNER,
  };
}
