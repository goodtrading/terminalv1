/**
 * AI-7.3.13 — Cross-Case Methodology Validation Round contracts.
 * Deterministic. No OpenAI. Never mutates Brain. Never stores full answerText.
 */
import { z } from "zod";
import { evidenceLensSchema, calibrationQuestionTypeSchema } from "./goodTradingAiCriticalCalibration";
import { scenarioSimilarityClassSchema } from "./goodTradingAiIndependentEvidence";

export const CROSS_CASE_VALIDATION_AUDIT_SCHEMA = "CrossCaseValidationAudit/v1" as const;
export const CROSS_CASE_QUESTION_CAP = 5 as const;

export const crossCaseHypothesisKindSchema = z.enum([
  "LENS_PRIORITY",
  "MIN_CONFIRMATION",
  "INVALIDATION",
  "CONFLICT_RESOLUTION",
  "SCOPE_COUNTEREXAMPLE",
]);
export type CrossCaseHypothesisKind = z.infer<typeof crossCaseHypothesisKindSchema>;

export const hypothesisSupportClassSchema = z.enum([
  "CROSS_CASE_SUPPORTED",
  "SUPPORTED_WITH_CONDITIONS",
  "SCENARIO_SPECIFIC",
  "COUNTEREXAMPLE_FOUND",
  "CONTRADICTED",
  "STILL_UNRESOLVED",
]);
export type HypothesisSupportClass = z.infer<typeof hypothesisSupportClassSchema>;

export const crossCaseProposalClassSchema = z.enum([
  "READY_FOR_METHODOLOGY_REVIEW",
  "NEEDS_MORE_CASES",
  "SUPPORTED_WITH_SCOPE",
  "COUNTEREXAMPLE_REQUIRES_REWRITE",
  "UNSUPPORTED",
]);
export type CrossCaseProposalClass = z.infer<typeof crossCaseProposalClassSchema>;

export const neutralityClassSchema = z.enum([
  "BLIND_SAFE",
  "POTENTIALLY_LEADING",
  "DUPLICATE_SCENARIO",
  "LOW_INFORMATION",
]);
export type NeutralityClass = z.infer<typeof neutralityClassSchema>;

export const crossCaseHypothesisSchema = z
  .object({
    id: z.string().min(3).max(80),
    kind: crossCaseHypothesisKindSchema,
    sourceChallengeId: z.string().min(3).max(80),
    relatedLenses: z.array(evidenceLensSchema).min(1).max(6),
    /** Internal only — never sent in blind packets. */
    internalClaim: z.string().min(8).max(240),
    mentorEligible: z.literal(false),
  })
  .strict();
export type CrossCaseHypothesis = z.infer<typeof crossCaseHypothesisSchema>;

export const crossCaseQuestionDraftSchema = z
  .object({
    questionId: z.string().min(3).max(80),
    questionType: calibrationQuestionTypeSchema,
    prompt: z.string().min(8).max(800),
    scenarioFacts: z.array(z.string().min(4).max(240)).min(2).max(8),
    relatedLenses: z.array(evidenceLensSchema).min(1).max(6),
    targetHypothesisId: z.string().min(3).max(80),
    sourceChallengeId: z.string().min(3).max(80),
    sourceAuditId: z.string().min(3).max(96),
    relationToOriginal: scenarioSimilarityClassSchema,
    variedDimensions: z.array(z.string().min(2).max(40)).min(2).max(8),
    allowsDepends: z.literal(true),
    allowsConditions: z.literal(true),
    confidenceOptions: z.tuple([z.literal("LOW"), z.literal("MEDIUM"), z.literal("HIGH")]),
    neutralityClass: neutralityClassSchema,
    mentorEligible: z.literal(false),
  })
  .strict();
export type CrossCaseQuestionDraft = z.infer<typeof crossCaseQuestionDraftSchema>;

export const hypothesisResultSchema = z
  .object({
    hypothesisId: z.string().min(3).max(80),
    classification: hypothesisSupportClassSchema,
    independentCaseCount: z.number().int().nonnegative(),
    distinctScenarioCount: z.number().int().nonnegative(),
    relatedScenarioCount: z.number().int().nonnegative(),
    conditionsPreserved: z.boolean(),
    counterexampleFound: z.boolean(),
    detail: z.string().min(4).max(400),
    mentorEligible: z.literal(false),
  })
  .strict();
export type HypothesisResult = z.infer<typeof hypothesisResultSchema>;

export const crossCaseProposalReassessmentSchema = z
  .object({
    proposalId: z.string().min(3).max(80),
    beforeClass: z.string().min(4).max(80),
    afterClass: crossCaseProposalClassSchema,
    independentCaseSupportCount: z.number().int().nonnegative(),
    distinctScenarioCount: z.number().int().nonnegative(),
    statusUnchanged: z.literal("PENDING"),
    mentorEligible: z.literal(false),
  })
  .strict();
export type CrossCaseProposalReassessment = z.infer<typeof crossCaseProposalReassessmentSchema>;

export const crossCaseValidationAuditSchema = z
  .object({
    schema: z.literal(CROSS_CASE_VALIDATION_AUDIT_SCHEMA),
    id: z.string().min(3).max(96),
    sourceRunId: z.string().min(3).max(96),
    sourceIndependentAuditId: z.string().min(3).max(96),
    sourceSessionIds: z.array(z.string().min(3).max(96)).min(1).max(10),
    decisionUnitCount: z.number().int().nonnegative(),
    documentObservationCount: z.number().int().nonnegative(),
    distinctScenarioCount: z.number().int().nonnegative(),
    relatedScenarioCount: z.number().int().nonnegative(),
    crossCaseRepeatedPatterns: z.number().int().nonnegative(),
    conditionalVariants: z.number().int().nonnegative(),
    trueContradictions: z.number().int().nonnegative(),
    hypotheses: z.array(crossCaseHypothesisSchema).max(5),
    hypothesisResults: z.array(hypothesisResultSchema).max(5),
    proposalReassessment: z.array(crossCaseProposalReassessmentSchema).max(20),
    gaps: z.array(z.string().min(4).max(240)).max(20),
    challenges: z.array(z.string().min(3).max(80)).max(5),
    warnings: z.array(z.string().min(4).max(240)).max(40),
    createdAtMs: z.number().int().positive(),
    brainMutate: z.literal(false),
    autoApply: z.literal(false),
    mentorEligible: z.literal(false),
    containsAnswerText: z.literal(false),
  })
  .strict();
export type CrossCaseValidationAudit = z.infer<typeof crossCaseValidationAuditSchema>;
