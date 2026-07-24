/**
 * AI-7.3.12 — Independent Evidence Audit contracts.
 * Distinguishes document observations from human decision units and independent support.
 * Deterministic only. No OpenAI/embeddings. Never mutates Brain.
 */
import { z } from "zod";
import { evidenceLensSchema } from "./goodTradingAiCriticalCalibration";

export const INDEPENDENT_EVIDENCE_AUDIT_SCHEMA = "DistillationIndependentEvidenceAudit/v1" as const;
export const DISTILLATION_ANALYSIS_DOCUMENT_V1 = "document-v1" as const;
export const DISTILLATION_ANALYSIS_INDEPENDENT_V1 = "independent-evidence-v1" as const;

export const documentTypeSchema = z.enum([
  "ANSWER",
  "REVISION",
  "ADDENDUM",
  "POST_REVEAL_NOTE",
]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentObservationSchema = z
  .object({
    observationId: z.string().min(3).max(96),
    documentType: documentTypeSchema,
    sessionId: z.string().min(3).max(96),
    questionId: z.string().min(1).max(96),
    rootAnswerId: z.string().min(3).max(96),
    revisionNumber: z.number().int().nonnegative(),
    createdAtMs: z.number().int().positive(),
    humanConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    supersedesObservationId: z.string().min(3).max(96).optional(),
    supplementsObservationId: z.string().min(3).max(96).optional(),
    activeForCurrentPosition: z.boolean(),
    /** Default false for addenda/revisions/post-reveal. */
    contributesIndependentSupport: z.boolean(),
    hasStructuredConditions: z.boolean(),
    hasConfirmations: z.boolean(),
    hasInvalidations: z.boolean(),
    answerType: z.string().max(40).optional(),
    postRevealAction: z.string().max(40).optional(),
    lensHints: z.array(evidenceLensSchema).max(12),
    textHash: z.string().min(8).max(64),
    textLength: z.number().int().nonnegative(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type DocumentObservation = z.infer<typeof documentObservationSchema>;

export const revisionResolutionSchema = z
  .object({
    unitId: z.string().min(3).max(160),
    originalAnswerId: z.string().min(3).max(96),
    currentAuthorityId: z.string().min(3).max(96),
    supersededObservationIds: z.array(z.string().min(3).max(96)).max(40),
    activeAddendumIds: z.array(z.string().min(3).max(96)).max(40),
    postRevealMetaIds: z.array(z.string().min(3).max(96)).max(40),
    revisionChainLength: z.number().int().nonnegative(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RevisionResolution = z.infer<typeof revisionResolutionSchema>;

export const observationLineageSchema = z
  .object({
    unitId: z.string().min(3).max(160),
    documentIds: z.array(z.string().min(3).max(96)).min(1).max(80),
    rootAnswerId: z.string().min(3).max(96),
    revisionIds: z.array(z.string().min(3).max(96)).max(40),
    addendumIds: z.array(z.string().min(3).max(96)).max(40),
    postRevealIds: z.array(z.string().min(3).max(96)).max(40),
    resolution: revisionResolutionSchema,
    mentorEligible: z.literal(false),
  })
  .strict();
export type ObservationLineage = z.infer<typeof observationLineageSchema>;

export const humanDecisionUnitSchema = z
  .object({
    unitId: z.string().min(3).max(160),
    sessionId: z.string().min(3).max(96),
    questionId: z.string().min(1).max(96),
    originalAnswerId: z.string().min(3).max(96),
    currentResolvedAnswerId: z.string().min(3).max(96),
    activeRevisionIds: z.array(z.string().min(3).max(96)).max(40),
    addendumIds: z.array(z.string().min(3).max(96)).max(40),
    conditionCount: z.number().int().nonnegative(),
    confirmationCount: z.number().int().nonnegative(),
    invalidationCount: z.number().int().nonnegative(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    lenses: z.array(evidenceLensSchema).max(12),
    scenarioFingerprint: z.string().min(4).max(64),
    /** Documentary source count (answer+revisions+addenda). */
    sourceCount: z.number().int().positive(),
    /** Max 1.0 per case — never inflated by addenda/revisions. */
    independentSupportWeight: z.number().min(0).max(1),
    answerType: z.string().max(40).optional(),
    dependsFlag: z.boolean(),
    claimFingerprint: z.string().min(4).max(64),
    claimSummary: z.string().min(4).max(240),
    mentorEligible: z.literal(false),
  })
  .strict();
export type HumanDecisionUnit = z.infer<typeof humanDecisionUnitSchema>;

export const independentSupportUnitSchema = z
  .object({
    supportId: z.string().min(3).max(96),
    decisionUnitId: z.string().min(3).max(160),
    scenarioFingerprint: z.string().min(4).max(64),
    normalizedMethodologyClaim: z.string().min(4).max(240),
    independent: z.boolean(),
    humanOwnerCount: z.number().int().positive(),
    sessionCount: z.number().int().positive(),
    caseCount: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type IndependentSupportUnit = z.infer<typeof independentSupportUnitSchema>;

export const scenarioSimilarityClassSchema = z.enum([
  "DISTINCT",
  "RELATED",
  "METAMORPHIC_VARIANT",
  "DUPLICATE",
]);
export type ScenarioSimilarityClass = z.infer<typeof scenarioSimilarityClassSchema>;

/** Documented internal weights — avoid double-counting, not scientific precision. */
export const SCENARIO_SUPPORT_WEIGHT: Record<ScenarioSimilarityClass, number> = {
  DISTINCT: 1.0,
  RELATED: 0.55,
  METAMORPHIC_VARIANT: 0.25,
  DUPLICATE: 0.0,
};

export const clusterSupportClassSchema = z.enum([
  "CROSS_CASE_REPEATED_PATTERN",
  "WITHIN_CASE_ENRICHED_OBSERVATION",
  "SINGLE_CASE_OBSERVATION",
  "MIXED_CLUSTER",
  "INSUFFICIENT_INDEPENDENT_SUPPORT",
]);
export type ClusterSupportClass = z.infer<typeof clusterSupportClassSchema>;

export const auditedClusterSchema = z
  .object({
    id: z.string().min(3).max(80),
    conceptKey: z.string().min(2).max(160),
    documentMemberCount: z.number().int().nonnegative(),
    decisionUnitMemberCount: z.number().int().nonnegative(),
    independentCaseCount: z.number().int().nonnegative(),
    sessionCount: z.number().int().nonnegative(),
    crossCaseSupportCount: z.number().int().nonnegative(),
    withinCaseClarificationCount: z.number().int().nonnegative(),
    revisionCount: z.number().int().nonnegative(),
    addendumCount: z.number().int().nonnegative(),
    supportClass: clusterSupportClassSchema,
    weightedIndependentSupport: z.number().min(0),
    lenses: z.array(evidenceLensSchema).max(8),
    memberUnitIds: z.array(z.string().min(3).max(160)).max(40),
    mentorEligible: z.literal(false),
  })
  .strict();
export type AuditedCluster = z.infer<typeof auditedClusterSchema>;

export const conflictAuditTypeSchema = z.enum([
  "TRUE_CONTRADICTION",
  "CONDITIONAL_DIFFERENCE",
  "SCALE_DIFFERENCE",
  "SCENARIO_DEPENDENCY",
  "REVISION_HISTORY",
  "ENGINE_DISAGREEMENT",
  "NOT_A_CONFLICT",
]);
export type ConflictAuditType = z.infer<typeof conflictAuditTypeSchema>;

export const auditedConflictSchema = z
  .object({
    conflictId: z.string().min(3).max(80),
    unitA: z.string().min(3).max(160),
    unitB: z.string().min(3).max(160),
    type: conflictAuditTypeSchema,
    independent: z.boolean(),
    resolutionCondition: z.string().min(4).max(240),
    humanConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    requiresQuestion: z.boolean(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type AuditedConflict = z.infer<typeof auditedConflictSchema>;

export const conflictAuditSummarySchema = z
  .object({
    rawCandidatePairs: z.number().int().nonnegative(),
    excludedSameUnitPairs: z.number().int().nonnegative(),
    excludedRevisionPairs: z.number().int().nonnegative(),
    conditionalRelations: z.number().int().nonnegative(),
    trueContradictions: z.number().int().nonnegative(),
    finalConflictCount: z.number().int().nonnegative(),
    /** Explanation of original document-level totalConflicts (e.g. 135). */
    originalDocumentConflictTotal: z.number().int().nonnegative().optional(),
    originalConflictFormula: z.literal(
      "sum over conflictish documents of C(lensCount,2) co-occurrence increments",
    ),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ConflictAuditSummary = z.infer<typeof conflictAuditSummarySchema>;

export const proposalAuditClassSchema = z.enum([
  "SUPPORTED_FOR_FURTHER_REVIEW",
  "NEEDS_MORE_INDEPENDENT_CASES",
  "OVERSTATED_BY_DOCUMENT_COUNT",
  "DUPLICATE_PROPOSAL",
  "UNSUPPORTED",
]);
export type ProposalAuditClass = z.infer<typeof proposalAuditClassSchema>;

export const proposalSupportAuditSchema = z
  .object({
    proposalId: z.string().min(3).max(80),
    documentSupportCount: z.number().int().nonnegative(),
    decisionUnitSupportCount: z.number().int().nonnegative(),
    independentCaseSupportCount: z.number().int().nonnegative(),
    correlatedCaseSupportCount: z.number().int().nonnegative(),
    contradictionCount: z.number().int().nonnegative(),
    sameCaseInflationDetected: z.boolean(),
    impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
    risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    remainsValidAfterAudit: z.boolean(),
    classification: proposalAuditClassSchema,
    statusUnchanged: z.literal("PENDING"),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ProposalSupportAudit = z.infer<typeof proposalSupportAuditSchema>;

export const gapAuditClassSchema = z.enum([
  "TRUE_METHODOLOGY_GAP",
  "LIMITED_SAMPLE_GAP",
  "QUESTION_SET_COVERAGE_GAP",
  "UNRESOLVED_CONDITION",
  "INSUFFICIENT_INVALIDATION_COVERAGE",
  "NOT_A_REAL_GAP",
]);
export type GapAuditClass = z.infer<typeof gapAuditClassSchema>;

export const auditedGapSchema = z
  .object({
    id: z.string().min(3).max(80),
    subject: z.string().min(2).max(160),
    classification: gapAuditClassSchema,
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    detail: z.string().min(4).max(400),
    mentorEligible: z.literal(false),
  })
  .strict();
export type AuditedGap = z.infer<typeof auditedGapSchema>;

export const utilityClassSchema = z.enum([
  "DISTILLATION_USEFUL",
  "DISTILLATION_PARTIALLY_USEFUL",
  "DISTILLATION_NOT_USEFUL",
]);
export type UtilityClass = z.infer<typeof utilityClassSchema>;

export const utilityReassessmentSchema = z
  .object({
    originalClass: utilityClassSchema.optional(),
    auditedClass: utilityClassSchema,
    reason: z.string().min(4).max(400),
    crossCaseRepeatedPatterns: z.number().int().nonnegative(),
    independentSupport: z.number().min(0),
    trueContradictions: z.number().int().nonnegative(),
    usefulGaps: z.number().int().nonnegative(),
    nonredundantProposals: z.number().int().nonnegative(),
    discriminativeChallenges: z.number().int().nonnegative(),
    sampleSafety: z.literal("LIMITED_HUMAN_SAMPLE"),
    hasMature: z.literal(false),
    mentorEligible: z.literal(false),
  })
  .strict();
export type UtilityReassessment = z.infer<typeof utilityReassessmentSchema>;

export const independentEvidenceAuditSchema = z
  .object({
    schema: z.literal(INDEPENDENT_EVIDENCE_AUDIT_SCHEMA),
    id: z.string().min(3).max(96),
    sourceRunId: z.string().min(3).max(96),
    sourceFingerprint: z.string().min(4).max(64).optional(),
    documentObservationCount: z.number().int().nonnegative(),
    decisionUnitCount: z.number().int().nonnegative(),
    independentSupportMetrics: z.object({
      independentCaseCount: z.number().int().nonnegative(),
      crossCaseRepeatedPatterns: z.number().int().nonnegative(),
      withinCaseEnrichments: z.number().int().nonnegative(),
      weightedIndependentSupport: z.number().min(0),
      singleCaseObservations: z.number().int().nonnegative(),
      insufficientIndependentSupport: z.number().int().nonnegative(),
    }),
    clusterAudit: z.array(auditedClusterSchema).max(200),
    conflictAudit: conflictAuditSummarySchema,
    conflicts: z.array(auditedConflictSchema).max(200),
    proposalAudit: z.array(proposalSupportAuditSchema).max(20),
    gapAudit: z.array(auditedGapSchema).max(10),
    challengeAudit: z.object({
      originalChallengeCount: z.number().int().nonnegative(),
      deduplicatedChallengeCount: z.number().int().nonnegative(),
      highInformationChallenges: z.number().int().nonnegative(),
      redundantChallengesRemoved: z.number().int().nonnegative(),
      challengeIds: z.array(z.string().min(3).max(80)).max(5),
    }),
    confidenceAudit: z.object({
      sampleSafety: z.literal("LIMITED_HUMAN_SAMPLE"),
      hasMature: z.literal(false),
      clusterCount: z.number().int().nonnegative(),
      avgScore: z.number().min(0).max(1),
      maxScore: z.number().min(0).max(1),
      minScore: z.number().min(0).max(1),
      scores: z
        .array(
          z.object({
            clusterId: z.string(),
            confidenceScore: z.number().min(0).max(1),
            label: z.enum(["LOW", "MEDIUM", "HIGH_SAMPLE_LIMITED"]),
            independentCaseCount: z.number().int().nonnegative(),
          }),
        )
        .max(200),
    }),
    compressionAudit: z.object({
      documentVariants: z.number().int().nonnegative(),
      crossCaseVariants: z.number().int().nonnegative(),
      sameCaseRedundancies: z.number().int().nonnegative(),
      crossCaseRedundancies: z.number().int().nonnegative(),
      trueEquivalentClaims: z.number().int().nonnegative(),
      conditionalVariants: z.number().int().nonnegative(),
      originalVariantCount: z.number().int().nonnegative().optional(),
    }),
    utilityReassessment: utilityReassessmentSchema,
    warnings: z.array(z.string().min(4).max(240)).max(40),
    createdAtMs: z.number().int().positive(),
    brainMutate: z.literal(false),
    autoApply: z.literal(false),
    mentorEligible: z.literal(false),
    /** No full answer texts stored. */
    containsAnswerText: z.literal(false),
  })
  .strict();
export type IndependentEvidenceAudit = z.infer<typeof independentEvidenceAuditSchema>;
