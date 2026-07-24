/**
 * AI-7.3.4 — Knowledge Distillation & Adaptive Learning contracts.
 * Deterministic only. No OpenAI/LLM/embeddings. Never mutates Brain.
 * Proposals always PENDING / NOT_SAFE_FOR_BRAIN_APPLICATION.
 */
import { z } from "zod";
import { evidenceLensSchema, ALL_EVIDENCE_LENSES } from "./goodTradingAiCriticalCalibration";
import { FORBIDDEN_TRADING_OUTCOME_TOKENS } from "./goodTradingAiDecisionGraph";

export const KNOWLEDGE_DISTILLATION_SCHEMA_VERSION = "1.0" as const;
/** document-v1 = each CC document votes; independent-evidence-v1 = decision units vote. */
export const DISTILLATION_ANALYSIS_VERSIONS = [
  "document-v1",
  "independent-evidence-v1",
] as const;
export type DistillationAnalysisVersion = (typeof DISTILLATION_ANALYSIS_VERSIONS)[number];
export { ALL_EVIDENCE_LENSES };

export const distillationSourceKindSchema = z.enum([
  "HUMAN_REVIEW",
  "CRITICAL_CALIBRATION",
]);
export type DistillationSourceKind = z.infer<typeof distillationSourceKindSchema>;

export const distilledSignalSchema = z.enum([
  "AGREE",
  "DISAGREE",
  "NEEDS_CONDITIONS",
  "NEEDS_MORE_EVIDENCE",
  "DEFER",
  "ADD_NOTE",
  "ANSWER",
  "REVISION",
  "REVEAL_NOTE",
]);
export type DistilledSignal = z.infer<typeof distilledSignalSchema>;

export const distilledObservationSchema = z
  .object({
    id: z.string().min(3).max(96),
    sourceKind: distillationSourceKindSchema,
    sessionId: z.string().min(3).max(96),
    itemId: z.string().min(1).max(96),
    text: z.string().min(1).max(4000),
    lenses: z.array(evidenceLensSchema).max(12),
    signals: z.array(distilledSignalSchema).max(8),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    createdAtMs: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type DistilledObservation = z.infer<typeof distilledObservationSchema>;

export const ruleClusterSchema = z
  .object({
    id: z.string().min(3).max(80),
    conceptKey: z.string().min(2).max(160),
    canonicalText: z.string().min(4).max(400),
    memberObservationIds: z.array(z.string().min(3).max(96)).min(1).max(200),
    lenses: z.array(evidenceLensSchema).max(8),
    frequency: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RuleCluster = z.infer<typeof ruleClusterSchema>;

export const compressionKindSchema = z.enum([
  "DUPLICATE",
  "VARIANT",
  "REDUNDANT",
  "TOO_SPECIFIC",
  "TOO_GENERAL",
  "EQUIVALENT",
]);
export type CompressionKind = z.infer<typeof compressionKindSchema>;

export const compressionReportSchema = z
  .object({
    totalObservations: z.number().int().nonnegative(),
    totalClusters: z.number().int().nonnegative(),
    compressedCount: z.number().int().nonnegative(),
    kinds: z.record(compressionKindSchema, z.number().int().nonnegative()),
    notes: z.array(z.string().min(4).max(240)).max(40),
    mentorEligible: z.literal(false),
  })
  .strict();
export type CompressionReport = z.infer<typeof compressionReportSchema>;

export const conflictCellSchema = z
  .object({
    lensA: evidenceLensSchema,
    lensB: evidenceLensSchema,
    count: z.number().int().nonnegative(),
    frequency: z.number().min(0).max(1),
    lastSeenAtMs: z.number().int().nonnegative(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  .strict();
export type ConflictCell = z.infer<typeof conflictCellSchema>;

export const conflictHeatmapSchema = z
  .object({
    cells: z.array(conflictCellSchema).max(200),
    totalConflicts: z.number().int().nonnegative(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ConflictHeatmap = z.infer<typeof conflictHeatmapSchema>;

export const coverageCellSchema = z
  .object({
    key: z.string().min(1).max(80),
    kind: z.enum(["LENS", "CONCEPT"]),
    count: z.number().int().nonnegative(),
    coverageRatio: z.number().min(0).max(1),
  })
  .strict();
export type CoverageCell = z.infer<typeof coverageCellSchema>;

export const coverageHeatmapSchema = z
  .object({
    cells: z.array(coverageCellSchema).max(120),
    totalObservations: z.number().int().nonnegative(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type CoverageHeatmap = z.infer<typeof coverageHeatmapSchema>;

export const ruleConfidenceSchema = z
  .object({
    clusterId: z.string().min(3).max(80),
    conceptKey: z.string().min(2).max(160),
    coverage: z.number().min(0).max(1),
    consistency: z.number().min(0).max(1),
    repetition: z.number().min(0).max(1),
    conflictPenalty: z.number().min(0).max(1),
    uncertainty: z.number().min(0).max(1),
    confidenceScore: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RuleConfidence = z.infer<typeof ruleConfidenceSchema>;

export const knowledgeGapKindSchema = z.enum([
  "NEVER_DISCUSSED",
  "LOW_COVERAGE",
  "UNRESOLVED_CONFLICT",
  "AMBIGUOUS_RULE",
  "CONTRADICTORY_RULE",
]);
export type KnowledgeGapKind = z.infer<typeof knowledgeGapKindSchema>;

export const knowledgeGapSchema = z
  .object({
    id: z.string().min(3).max(80),
    kind: knowledgeGapKindSchema,
    subject: z.string().min(2).max(160),
    detail: z.string().min(4).max(400),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    mentorEligible: z.literal(false),
  })
  .strict();
export type KnowledgeGap = z.infer<typeof knowledgeGapSchema>;

export const adaptiveDriverSchema = z.enum([
  "HIGH_CONFLICT",
  "HIGH_UNCERTAINTY",
  "LOW_COVERAGE",
  "LOW_CONFIDENCE",
  "HIGH_INFORMATION_GAIN",
  "RANDOM",
]);
export type AdaptiveDriver = z.infer<typeof adaptiveDriverSchema>;

export const adaptiveQuestionSchema = z
  .object({
    id: z.string().min(3).max(80),
    prompt: z.string().min(8).max(600),
    drivers: z.array(adaptiveDriverSchema).min(1).max(4),
    relatedLenses: z.array(evidenceLensSchema).max(6),
    relatedClusterIds: z.array(z.string().min(3).max(80)).max(8),
    infoGainHint: z.enum(["HIGH", "MEDIUM", "LOW"]),
    hypothesisDiscrimination: z.number().min(0).max(1),
    allowsDepends: z.literal(true),
    mentorEligible: z.literal(false),
  })
  .strict()
  .superRefine((q, ctx) => {
    const upper = q.prompt.toUpperCase();
    for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
      if (new RegExp("\\b" + tok + "\\b").test(upper)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Forbidden trading token in prompt" });
      }
    }
  });
export type AdaptiveQuestion = z.infer<typeof adaptiveQuestionSchema>;

export const challengeKindSchema = z.enum([
  "EVIDENCE_THAT_CHANGES_DECISION",
  "REMOVE_ABSORPTION",
  "DEALER_VS_GAMMA",
  "FULL_INVALIDATION",
  "HEURISTIC_FAILURE",
  "HYPOTHESIS_DISCRIMINATION",
]);
export type ChallengeKind = z.infer<typeof challengeKindSchema>;

export const challengeItemSchema = z
  .object({
    id: z.string().min(3).max(80),
    kind: challengeKindSchema,
    prompt: z.string().min(8).max(600),
    targetClusterId: z.string().min(3).max(80).optional(),
    relatedLenses: z.array(evidenceLensSchema).max(6),
    hypothesisA: z.string().min(4).max(200),
    hypothesisB: z.string().min(4).max(200),
    discriminationScore: z.number().min(0).max(1),
    neverAnswers: z.literal(true),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ChallengeItem = z.infer<typeof challengeItemSchema>;

export const challengeScoreSchema = z
  .object({
    clusterId: z.string().min(3).max(80),
    robustness: z.number().min(0).max(1),
    contradictions: z.number().min(0).max(1),
    exceptions: z.number().min(0).max(1),
    counterexamples: z.number().min(0).max(1),
    humanAgreement: z.number().min(0).max(1),
    reviewCount: z.number().int().nonnegative(),
    /** Composite — NOT accuracy / win rate. */
    challengeScore: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ChallengeScore = z.infer<typeof challengeScoreSchema>;

export const compressedProposalSchema = z
  .object({
    id: z.string().min(3).max(80),
    status: z.literal("PENDING"),
    title: z.string().min(4).max(160),
    reason: z.string().min(4).max(600),
    conditions: z.array(z.string().min(4).max(240)).min(1).max(8),
    affectedSessions: z.array(z.string().min(3).max(96)).max(40),
    affectedRules: z.array(z.string().min(2).max(160)).max(40),
    frequency: z.number().int().positive(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
    risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    autoApply: z.literal(false),
    brainMutate: z.literal(false),
    schemaWarning: z.literal("PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION"),
    safety: z.literal("NOT_SAFE_FOR_BRAIN_APPLICATION"),
    mentorEligible: z.literal(false),
    createdAtMs: z.number().int().positive(),
  })
  .strict();
export type CompressedProposal = z.infer<typeof compressedProposalSchema>;

export const knowledgeEvolutionReportSchema = z
  .object({
    schemaVersion: z.literal(KNOWLEDGE_DISTILLATION_SCHEMA_VERSION),
    generatedAtMs: z.number().int().positive(),
    totalSessions: z.number().int().nonnegative(),
    rulesCovered: z.number().int().nonnegative(),
    repeatedCompressed: z.number().int().nonnegative(),
    highConflictCount: z.number().int().nonnegative(),
    highConfidenceCount: z.number().int().nonnegative(),
    lowConfidenceCount: z.number().int().nonnegative(),
    unusedConcepts: z.array(z.string().min(1).max(80)).max(40),
    nextQuestions: z.array(adaptiveQuestionSchema).max(20),
    topOpportunities: z.array(z.string().min(4).max(240)).max(20),
    mentorEligible: z.literal(false),
    brainMutated: z.literal(false),
    openAi: z.literal(false),
  })
  .strict();
export type KnowledgeEvolutionReport = z.infer<typeof knowledgeEvolutionReportSchema>;

export const distillationRunResultSchema = z
  .object({
    observations: z.array(distilledObservationSchema).max(5000),
    clusters: z.array(ruleClusterSchema).max(500),
    compression: compressionReportSchema,
    conflictHeatmap: conflictHeatmapSchema,
    coverageHeatmap: coverageHeatmapSchema,
    confidences: z.array(ruleConfidenceSchema).max(500),
    gaps: z.array(knowledgeGapSchema).max(200),
    adaptiveQuestions: z.array(adaptiveQuestionSchema).max(40),
    adaptiveQueue: z.array(adaptiveQuestionSchema).max(40),
    challenges: z.array(challengeItemSchema).max(40),
    challengeScores: z.array(challengeScoreSchema).max(500),
    compressedProposals: z.array(compressedProposalSchema).max(20),
    evolution: knowledgeEvolutionReportSchema,
    mentorEligible: z.literal(false),
    brainMutate: z.literal(false),
    autoApply: z.literal(false),
    realMarketData: z.literal(false),
    /**
     * Optional for read-compat with AI-7.3.11 document-v1 runs.
     * New productive runs default to independent-evidence-v1.
     */
    analysisVersion: z.enum(DISTILLATION_ANALYSIS_VERSIONS).optional(),
    documentObservationCount: z.number().int().nonnegative().optional(),
    decisionUnitCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type DistillationRunResult = z.infer<typeof distillationRunResultSchema>;

/** Read helper: missing analysisVersion ⇒ historical document-v1. */
export function resolveDistillationAnalysisVersion(
  run: Pick<DistillationRunResult, "analysisVersion"> | null | undefined,
): DistillationAnalysisVersion {
  return run?.analysisVersion ?? "document-v1";
}