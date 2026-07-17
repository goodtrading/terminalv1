/**
 * GoodTrading AI Calibration Lab — shared contracts (AI-2.1).
 * Client-safe types only. No full knowledge corpus.
 */
import { z } from "zod";

export const calibrationDecisionSchema = z.enum([
  "APPROVED",
  "APPROVED_WITH_CHANGES",
  "REJECTED",
  "NEEDS_MORE_CONTEXT",
  "SKIPPED",
]);
export type CalibrationDecision = z.infer<typeof calibrationDecisionSchema>;

export const calibrationDomainSchema = z.enum([
  "constitution",
  "liquidity",
  "order_flow",
  "gamma",
  "delta_cvd_oi",
  "execution_risk",
  "compound_setup",
]);
export type CalibrationDomain = z.infer<typeof calibrationDomainSchema>;

export const calibrationDifficultySchema = z.enum(["basic", "intermediate", "advanced"]);
export type CalibrationDifficulty = z.infer<typeof calibrationDifficultySchema>;

export const calibrationCaseSchema = z.object({
  id: z.string().min(1).max(80),
  domain: calibrationDomainSchema,
  difficulty: calibrationDifficultySchema,
  title: z.string().min(1).max(160),
  question: z.string().min(1).max(2000),
  context: z.string().min(1).max(4000),
  tags: z.array(z.string().min(1).max(40)).max(12),
  relatedConceptHints: z.array(z.string().min(1).max(80)).max(12).optional(),
});
export type CalibrationCase = z.infer<typeof calibrationCaseSchema>;

export const calibrationAiSnapshotSchema = z.object({
  summary: z.string().min(1).max(4000),
  observations: z
    .array(
      z.object({
        id: z.string().max(80),
        title: z.string().max(160),
        kind: z.string().max(40),
      }),
    )
    .max(20),
  knowledgeReferences: z
    .array(
      z.object({
        id: z.string().max(80),
        title: z.string().max(160),
        kind: z.string().max(40),
        category: z.string().max(40),
      }),
    )
    .max(20),
  coverage: z.enum(["high", "medium", "limited"]),
  intent: z.string().max(40),
  warnings: z.array(z.string().max(500)).max(20),
  registryVersion: z.string().max(80),
  generatedAt: z.string().datetime(),
});
export type CalibrationAiSnapshot = z.infer<typeof calibrationAiSnapshotSchema>;

export const calibrationReviewInputSchema = z
  .object({
    caseId: z.string().min(1).max(80),
    decision: calibrationDecisionSchema,
    ignacioAnswer: z.string().trim().max(8000).optional().default(""),
    corrections: z.string().trim().max(4000).optional().default(""),
    missingContext: z.string().trim().max(2000).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
  })
  .strict();
export type CalibrationReviewInput = z.infer<typeof calibrationReviewInputSchema>;

export const calibrationReviewSchema = calibrationReviewInputSchema.extend({
  id: z.string().min(1).max(80),
  reviewedByUserId: z.number().int().positive(),
  reviewedByEmail: z.string().email().max(200).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
  registryVersion: z.string().max(80),
  aiSnapshot: calibrationAiSnapshotSchema,
  proposalIds: z.array(z.string().max(80)).max(20).optional(),
});
export type CalibrationReview = z.infer<typeof calibrationReviewSchema>;

export const proposalChangeTypeSchema = z.enum([
  "UPDATE_ENTRY",
  "CREATE_ENTRY",
  "CREATE_EVAL",
  "UPDATE_SETUP",
  "MANUAL_EDITORIAL_REVIEW_REQUIRED",
]);
export type ProposalChangeType = z.infer<typeof proposalChangeTypeSchema>;

export const proposalFieldChangeSchema = z.object({
  field: z.string().min(1).max(80),
  before: z.string().max(4000).nullable(),
  after: z.string().max(4000),
});
export type ProposalFieldChange = z.infer<typeof proposalFieldChangeSchema>;

export const knowledgeChangeProposalSchema = z.object({
  id: z.string().min(1).max(80),
  caseId: z.string().min(1).max(80),
  reviewId: z.string().min(1).max(80),
  changeType: proposalChangeTypeSchema,
  targetEntryId: z.string().max(80).optional(),
  risk: z.enum(["LOW", "MEDIUM", "HIGH_RISK"]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "APPLIED", "DRY_RUN_ONLY"]),
  reason: z.string().min(1).max(2000),
  fieldChanges: z.array(proposalFieldChangeSchema).max(40),
  associatedEvalIds: z.array(z.string().max(80)).min(1).max(10),
  createdAt: z.string().datetime(),
  reviewed: z.boolean(),
});
export type KnowledgeChangeProposal = z.infer<typeof knowledgeChangeProposalSchema>;

export const goldenCaseSchema = z.object({
  id: z.string().min(1).max(80),
  sourceReviewId: z.string().min(1).max(80),
  sourceCaseId: z.string().min(1).max(80),
  reasoningPoints: z.array(z.string().max(500)).max(20),
  requiredConcepts: z.array(z.string().max(80)).max(20),
  requiredPrinciples: z.array(z.string().max(80)).max(20),
  forbiddenClaims: z.array(z.string().max(200)).max(20),
  createdAt: z.string().datetime(),
});
export type GoodTradingGoldenCase = z.infer<typeof goldenCaseSchema>;

export const calibrationMetricsSchema = z.object({
  totalCases: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  approvedWithChanges: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  needsContext: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  pendingProposals: z.number().int().nonnegative(),
  goldenCount: z.number().int().nonnegative(),
  limitedCoverageCases: z.number().int().nonnegative(),
  domainCoverage: z.record(z.number().int().nonnegative()),
  mostCorrectedEntryIds: z.array(z.string()).max(20),
  mostUsedPrincipleIds: z.array(z.string()).max(20),
  generatedAt: z.string().datetime(),
});
export type CalibrationMetrics = z.infer<typeof calibrationMetricsSchema>;
