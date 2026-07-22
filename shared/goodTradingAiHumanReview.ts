/**
 * AI-7.2 — Human Methodology Review contracts (blind review).
 * Owner: IGNACIO. Educational only — no trading-side mandate fields. No LLM-as-judge.
 */
import { z } from "zod";
import {
  decisionPathOutcomeSchema,
  decisionQualityCategorySchema,
  FORBIDDEN_TRADING_OUTCOME_TOKENS,
} from "./goodTradingAiDecisionGraph";

export const HUMAN_REVIEW_SCHEMA_VERSION = "1.0" as const;
export const HUMAN_REVIEW_OWNER = "IGNACIO" as const;

export const humanReviewCohortSchema = z.enum([
  "REWORDED_GOLDEN",
  "NEW",
  "AMBIGUOUS",
  "INSUFFICIENT",
  "HOLDOUT",
]);
export type HumanReviewCohort = z.infer<typeof humanReviewCohortSchema>;

export const humanConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type HumanConfidence = z.infer<typeof humanConfidenceSchema>;

/** Structured human answer — forbidden trading mandate fields. */
export const humanDecisionAnswerSchema = z
  .object({
    reviewCaseId: z.string().min(3).max(80),
    owner: z.literal(HUMAN_REVIEW_OWNER),
    primaryOutcome: decisionPathOutcomeSchema,
    quality: decisionQualityCategorySchema.optional(),
    requiredConfirmations: z.array(z.string().min(1).max(160)).max(12),
    triggeredInvalidations: z.array(z.string().min(1).max(160)).max(12),
    confidence: humanConfidenceSchema,
    notes: z.string().max(1200).optional(),
    insufficientEvidence: z.boolean(),
    ambiguousReading: z.boolean(),
    revision: z.number().int().positive(),
    submittedAtMs: z.number().int().positive(),
    /** Content hash of immutable answer body (excludes revision metadata). */
    answerHash: z.string().min(8).max(128),
    mentorEligible: z.literal(false),
  })
  .strict()
  .superRefine((val, ctx) => {
    const blob = JSON.stringify(val).toUpperCase();
    for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
      if (new RegExp(`\\b${tok}\\b`).test(blob)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Forbidden trading token: ${tok}`,
        });
      }
    }
  });
export type HumanDecisionAnswer = z.infer<typeof humanDecisionAnswerSchema>;

/** Blind-safe case view — no expected outcomes, no engine result. */
export const humanBlindCaseViewSchema = z.object({
  id: z.string().min(3).max(80),
  /** Soft cohort label for UI grouping; HOLDOUT shown as STANDARD until reveal. */
  displayCohort: z.enum(["STANDARD", "AMBIGUOUS", "INSUFFICIENT"]),
  scenarioText: z.string().min(1).max(2000),
  scenarioContext: z.string().max(800).optional(),
  lensesHint: z.array(z.string().min(1).max(80)).max(6).optional(),
  orderIndex: z.number().int().nonnegative(),
});
export type HumanBlindCaseView = z.infer<typeof humanBlindCaseViewSchema>;

/** Sealed metadata (server-only until reveal). */
export const humanReviewCaseSealedSchema = z.object({
  id: z.string().min(3).max(80),
  cohort: humanReviewCohortSchema,
  holdout: z.boolean(),
  goldenCaseId: z.string().max(80).optional(),
  /** Expected golden outcomes — never shown pre-submit. */
  goldenExpectOutcomes: z.array(decisionPathOutcomeSchema).min(1).max(8),
  goldenExpectQualities: z.array(decisionQualityCategorySchema).max(8).optional(),
  forceUntrusted: z.boolean().optional(),
  templateIdHint: z.string().max(80).optional(),
  notesInternal: z.string().max(400).optional(),
});
export type HumanReviewCaseSealed = z.infer<typeof humanReviewCaseSealedSchema>;

export const humanReviewCaseSchema = humanReviewCaseSealedSchema.extend({
  scenarioText: z.string().min(1).max(2000),
  scenarioContext: z.string().max(800).optional(),
  lensesHint: z.array(z.string().min(1).max(80)).max(6).optional(),
});
export type HumanReviewCase = z.infer<typeof humanReviewCaseSchema>;

export const threeWayComparisonClassSchema = z.enum([
  "HUMAN_ENGINE_GOLDEN_AGREE",
  "HUMAN_ENGINE_AGREE_GOLDEN_DIFF",
  "HUMAN_GOLDEN_AGREE_ENGINE_DIFF",
  "ENGINE_GOLDEN_AGREE_HUMAN_DIFF",
  "THREE_WAY_SPLIT",
  "HUMAN_INSUFFICIENT_ENGINE_DEFINITE",
  "CIRCULAR_CALIBRATION_SIGNAL",
  "PENDING_HUMAN",
]);
export type ThreeWayComparisonClass = z.infer<typeof threeWayComparisonClassSchema>;

export const disagreementTaxonomyCodeSchema = z.enum([
  "DIS_INVALIDATION_PRIORITY",
  "DIS_OVERREACT_ISOLATED",
  "DIS_ACCEPTANCE_MISSING",
  "DIS_CONTEXT_TRUST",
  "DIS_MULTI_LENS_CONFLICT",
  "DIS_TEMPLATE_MISMATCH",
  "DIS_INSUFFICIENT_VS_DEFINITE",
  "DIS_AMBIGUITY_TOLERANCE",
  "DIS_GOLDEN_STALE",
  "DIS_ENGINE_BUG_SUSPECT",
  "DIS_HUMAN_NOTES_ONLY",
  "DIS_NONE",
]);
export type DisagreementTaxonomyCode = z.infer<typeof disagreementTaxonomyCodeSchema>;

export const methodologyProposalStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);
export type MethodologyProposalStatus = z.infer<typeof methodologyProposalStatusSchema>;

/** Approval never auto-applies — proposals stay PENDING until separate human action. */
export const methodologyChangeProposalSchema = z.object({
  id: z.string().min(3).max(80),
  reviewCaseId: z.string().min(3).max(80),
  status: methodologyProposalStatusSchema,
  taxonomyCodes: z.array(disagreementTaxonomyCodeSchema).max(8),
  comparisonClass: threeWayComparisonClassSchema,
  rationale: z.string().min(1).max(1200),
  suggestedAction: z.enum([
    "REVIEW_GOLDEN",
    "REVIEW_TEMPLATE",
    "REVIEW_ENGINE",
    "KEEP_AS_IS",
    "EXPAND_CASE",
  ]),
  autoApply: z.literal(false),
  brainMutate: z.literal(false),
  createdAtMs: z.number().int().positive(),
  owner: z.literal(HUMAN_REVIEW_OWNER),
});
export type MethodologyChangeProposal = z.infer<typeof methodologyChangeProposalSchema>;

export const humanDecisionComparisonSchema = z.object({
  reviewCaseId: z.string().min(3).max(80),
  humanOutcome: decisionPathOutcomeSchema.nullable(),
  engineOutcome: decisionPathOutcomeSchema.nullable(),
  goldenOutcomes: z.array(decisionPathOutcomeSchema).max(8),
  comparisonClass: threeWayComparisonClassSchema,
  taxonomyCodes: z.array(disagreementTaxonomyCodeSchema).max(8),
  circularCalibrationRisk: z.boolean(),
});
export type HumanDecisionComparison = z.infer<typeof humanDecisionComparisonSchema>;

export const humanDecisionReviewReportSchema = z.object({
  schemaVersion: z.literal(HUMAN_REVIEW_SCHEMA_VERSION),
  generatedAtMs: z.number().int().positive(),
  mentorEligible: z.literal(false),
  totalCases: z.number().int().nonnegative(),
  answeredCount: z.number().int().nonnegative(),
  pendingHumanCount: z.number().int().nonnegative(),
  holdoutAnswered: z.number().int().nonnegative(),
  holdoutPending: z.number().int().nonnegative(),
  agreementRates: z.object({
    humanEngine: z.number().min(0).max(1),
    humanGolden: z.number().min(0).max(1),
    engineGolden: z.number().min(0).max(1),
    threeWay: z.number().min(0).max(1),
  }),
  circularCalibrationSignals: z.number().int().nonnegative(),
  taxonomyCounts: z.record(z.string(), z.number().int().nonnegative()),
  proposalsPending: z.number().int().nonnegative(),
  proposedGates: z.object({
    minHumanCoverage: z.number(),
    maxCircularSignals: z.number(),
    holdoutRequiredBeforeCalibrationAdjust: z.boolean(),
    autoApproveGolden: z.literal(false),
    autoAdjustExpectations: z.literal(false),
  }),
  gatesStatus: z.object({
    infrastructureReady: z.boolean(),
    humanReviewComplete: z.boolean(),
    overall: z.enum(["GO_PARCIAL_INFRASTRUCTURE_READY", "GO", "NO_GO"]),
  }),
  notes: z.array(z.string().max(400)).max(20),
});
export type HumanDecisionReviewReport = z.infer<typeof humanDecisionReviewReportSchema>;