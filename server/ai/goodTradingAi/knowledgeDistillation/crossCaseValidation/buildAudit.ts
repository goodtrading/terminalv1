/**
 * AI-7.3.13 — Build / persist CrossCaseValidationAudit/v1 (append-only, no answer text).
 */
import {
  CROSS_CASE_VALIDATION_AUDIT_SCHEMA,
  crossCaseValidationAuditSchema,
  type CrossCaseHypothesis,
  type CrossCaseValidationAudit,
  type HypothesisResult,
  type CrossCaseProposalReassessment,
} from "@shared/goodTradingAiCrossCaseValidation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";

export function buildCrossCaseValidationAudit(input: {
  id?: string;
  sourceRunId: string;
  sourceIndependentAuditId: string;
  sourceSessionIds: string[];
  decisionUnitCount: number;
  documentObservationCount: number;
  distinctScenarioCount: number;
  relatedScenarioCount: number;
  crossCaseRepeatedPatterns: number;
  conditionalVariants: number;
  trueContradictions: number;
  hypotheses: CrossCaseHypothesis[];
  hypothesisResults: HypothesisResult[];
  proposalReassessment: CrossCaseProposalReassessment[];
  gaps?: string[];
  challenges?: string[];
  warnings?: string[];
  nowMs?: number;
}): CrossCaseValidationAudit {
  return crossCaseValidationAuditSchema.parse({
    schema: CROSS_CASE_VALIDATION_AUDIT_SCHEMA,
    id: input.id ?? `ccv_audit_${Date.now()}`,
    sourceRunId: input.sourceRunId,
    sourceIndependentAuditId: input.sourceIndependentAuditId,
    sourceSessionIds: input.sourceSessionIds,
    decisionUnitCount: input.decisionUnitCount,
    documentObservationCount: input.documentObservationCount,
    distinctScenarioCount: input.distinctScenarioCount,
    relatedScenarioCount: input.relatedScenarioCount,
    crossCaseRepeatedPatterns: input.crossCaseRepeatedPatterns,
    conditionalVariants: input.conditionalVariants,
    trueContradictions: input.trueContradictions,
    hypotheses: input.hypotheses,
    hypothesisResults: input.hypothesisResults,
    proposalReassessment: input.proposalReassessment,
    gaps: input.gaps ?? [],
    challenges: input.challenges ?? [],
    warnings: input.warnings ?? [],
    createdAtMs: input.nowMs ?? Date.now(),
    brainMutate: false,
    autoApply: false,
    mentorEligible: false,
    containsAnswerText: false,
  });
}

export function assertOriginalArtifactsIntact(input: {
  sourceRunFingerprintBefore: string | undefined;
  sourceRunFingerprintAfter: string | undefined;
  sourceAudit: Pick<IndependentEvidenceAudit, "id" | "schema" | "containsAnswerText">;
}): void {
  if (input.sourceRunFingerprintBefore !== input.sourceRunFingerprintAfter) {
    throw new Error("ORIGINAL_RUN_MUTATED");
  }
  if (input.sourceAudit.schema !== "DistillationIndependentEvidenceAudit/v1") {
    throw new Error("SOURCE_AUDIT_SCHEMA_MISMATCH");
  }
  if (input.sourceAudit.containsAnswerText !== false) {
    throw new Error("SOURCE_AUDIT_CONTAINS_ANSWER_TEXT");
  }
}
