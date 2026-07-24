/**
 * AI-7.3.13 — Reassess PENDING proposals after cross-case evidence (status stays PENDING).
 */
import {
  crossCaseProposalReassessmentSchema,
  type CrossCaseProposalClass,
  type CrossCaseProposalReassessment,
} from "@shared/goodTradingAiCrossCaseValidation";
import type { ProposalSupportAudit } from "@shared/goodTradingAiIndependentEvidence";

export function reassessProposalsAfterCrossCase(input: {
  priorProposalAudits: ProposalSupportAudit[];
  /** Distinct independent scenarios supporting each proposal after round (0 until 5/5). */
  distinctScenarioByProposal: Record<string, number>;
  conditionsPreservedByProposal?: Record<string, boolean>;
  invalidationDefinedByProposal?: Record<string, boolean>;
  criticalContradictionByProposal?: Record<string, boolean>;
}): CrossCaseProposalReassessment[] {
  return input.priorProposalAudits.map((p) => {
    const distinct = input.distinctScenarioByProposal[p.proposalId] ?? 0;
    const conditions = input.conditionsPreservedByProposal?.[p.proposalId] ?? false;
    const inval = input.invalidationDefinedByProposal?.[p.proposalId] ?? false;
    const crit = input.criticalContradictionByProposal?.[p.proposalId] ?? false;

    let afterClass: CrossCaseProposalClass = "UNSUPPORTED";
    if (crit) {
      afterClass = "COUNTEREXAMPLE_REQUIRES_REWRITE";
    } else if (
      distinct >= 2 &&
      conditions &&
      inval &&
      !crit &&
      p.independentCaseSupportCount + distinct >= 2
    ) {
      afterClass = "READY_FOR_METHODOLOGY_REVIEW";
    } else if (distinct >= 1 && conditions) {
      afterClass = "SUPPORTED_WITH_SCOPE";
    } else if (distinct >= 1 || p.decisionUnitSupportCount >= 1) {
      afterClass = "NEEDS_MORE_CASES";
    }

    return crossCaseProposalReassessmentSchema.parse({
      proposalId: p.proposalId,
      beforeClass: p.classification,
      afterClass,
      independentCaseSupportCount: p.independentCaseSupportCount,
      distinctScenarioCount: distinct,
      statusUnchanged: "PENDING",
      mentorEligible: false,
    });
  });
}
