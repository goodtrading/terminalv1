/**
 * AI-7.3.12 — Run Independent Evidence Audit (dry-run analytics; never overwrites KD run).
 */
import type { CalibrationObservation } from "@shared/goodTradingAiCriticalCalibration";
import type { DistillationRunResult } from "@shared/goodTradingAiKnowledgeDistillation";
import {
  independentEvidenceAuditSchema,
  INDEPENDENT_EVIDENCE_AUDIT_SCHEMA,
  type IndependentEvidenceAudit,
} from "@shared/goodTradingAiIndependentEvidence";
import { resolveAllHumanDecisionUnits } from "./resolveHumanDecisionUnit";
import { reclusterDecisionUnits } from "./recluster";
import { auditConflicts, explainDocumentConflictTotal } from "./conflictAudit";
import {
  auditChallenges,
  auditGaps,
  auditProposals,
  recalibrateCompression,
  recalibrateConfidences,
  reassessUtility,
  whyOriginalGapsWere22,
} from "./audits";

export function runIndependentEvidenceAudit(input: {
  sourceRunId: string;
  sourceFingerprint?: string;
  rawObservations: CalibrationObservation[];
  sourceRun: DistillationRunResult;
  auditId?: string;
}): IndependentEvidenceAudit {
  const { documents, units } = resolveAllHumanDecisionUnits(input.rawObservations);
  const clusters = reclusterDecisionUnits({ units, documents });
  const originalConflictTotal = input.sourceRun.conflictHeatmap?.totalConflicts ?? 0;
  const explained = explainDocumentConflictTotal({ documents });
  const { summary: conflictAudit, conflicts } = auditConflicts({
    units,
    documents,
    originalDocumentConflictTotal: originalConflictTotal || explained,
  });
  const confidenceAudit = recalibrateConfidences({
    clusters,
    conflicts,
    unitCount: units.length,
  });
  const compressionAudit = recalibrateCompression({
    documents,
    units,
    clusters,
    originalVariantCount: input.sourceRun.compression?.kinds?.VARIANT,
  });
  const proposalAudit = auditProposals({
    proposals: input.sourceRun.compressedProposals ?? [],
    clusters,
    units,
    documents,
    conflicts,
  });
  const gapAudit = auditGaps({
    units,
    conflicts,
    originalGapCount: input.sourceRun.gaps?.length,
  });
  const challengeAudit = auditChallenges({
    originalChallenges: input.sourceRun.challenges ?? [],
    conflicts,
    clusters,
  });
  const utilityReassessment = reassessUtility({
    clusters,
    conflicts,
    gaps: gapAudit,
    proposals: proposalAudit,
    challengeAudit,
    originalClass: "DISTILLATION_USEFUL",
  });

  const warnings: string[] = [
    "Original run left immutable; this artifact is append-only audit only.",
    "Addenda/revisions do not contribute independentSupportWeight.",
    "LIMITED_HUMAN_SAMPLE — no MATURE label.",
    whyOriginalGapsWere22(input.sourceRun.gaps?.length ?? 22),
    `Doc conflict total ${originalConflictTotal || explained} = Σ C(lensCount,2) over multi-lens docs (not unit-vs-unit).`,
  ].map((w) => w.slice(0, 240));
  if (documents.length !== 39 && input.rawObservations.length) {
    warnings.push(
      `documentObservationCount=${documents.length} (baseline AI-7.3.11 expected 39 when full session loaded).`.slice(
        0,
        240,
      ),
    );
  }
  if (units.length !== 15 && input.rawObservations.length) {
    warnings.push(
      `decisionUnitCount=${units.length} (baseline expected 15 human questions).`.slice(0, 240),
    );
  }

  const cross = clusters.filter((c) => c.supportClass === "CROSS_CASE_REPEATED_PATTERN").length;
  const within = clusters.filter((c) => c.supportClass === "WITHIN_CASE_ENRICHED_OBSERVATION").length;
  const single = clusters.filter((c) => c.supportClass === "SINGLE_CASE_OBSERVATION").length;
  const insuff = clusters.filter((c) => c.supportClass === "INSUFFICIENT_INDEPENDENT_SUPPORT").length;

  return independentEvidenceAuditSchema.parse({
    schema: INDEPENDENT_EVIDENCE_AUDIT_SCHEMA,
    id: input.auditId ?? `ieu_audit_${Date.now()}`,
    sourceRunId: input.sourceRunId,
    sourceFingerprint: input.sourceFingerprint,
    documentObservationCount: documents.length,
    decisionUnitCount: units.length,
    independentSupportMetrics: {
      independentCaseCount: units.length,
      crossCaseRepeatedPatterns: cross,
      withinCaseEnrichments: within,
      weightedIndependentSupport: clusters.reduce((s, c) => s + c.weightedIndependentSupport, 0),
      singleCaseObservations: single,
      insufficientIndependentSupport: insuff,
    },
    clusterAudit: clusters,
    conflictAudit,
    conflicts,
    proposalAudit,
    gapAudit,
    challengeAudit,
    confidenceAudit,
    compressionAudit,
    utilityReassessment,
    warnings: warnings.slice(0, 40),
    createdAtMs: Date.now(),
    brainMutate: false,
    autoApply: false,
    mentorEligible: false,
    containsAnswerText: false,
  });
}
