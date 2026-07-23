/**
 * AI-7.3.5 — Knowledge Evolution Engine contracts.
 * Deterministic only. No OpenAI/LLM/embeddings. Never mutates Brain.
 * Reports + PENDING proposals only. Never auto-apply.
 */
import { z } from "zod";
import { evidenceLensSchema } from "./goodTradingAiCriticalCalibration";

export const KNOWLEDGE_EVOLUTION_SCHEMA_VERSION = "1.0" as const;

/** Stable rule IDs only — never free-text. Pattern: RULE_<LENSES>_<KIND> */
export const stableRuleIdSchema = z
  .string()
  .regex(/^RULE_[A-Z0-9_]+$/, "Stable RULE_* id required")
  .min(8)
  .max(96);
export type StableRuleId = z.infer<typeof stableRuleIdSchema>;

export const ruleKindSchema = z.enum([
  "PRIORITY",
  "CONFIRMATION",
  "CONFLICT",
  "INVALIDATION",
  "DEPENDENCY",
  "GENERAL",
]);
export type RuleKind = z.infer<typeof ruleKindSchema>;

export const registeredRuleSchema = z
  .object({
    id: stableRuleIdSchema,
    kind: ruleKindSchema,
    label: z.string().min(4).max(160),
    lenses: z.array(evidenceLensSchema).min(1).max(8),
    conceptKey: z.string().min(2).max(160),
    createdAtMs: z.number().int().positive(),
    firstSeenAtMs: z.number().int().positive(),
    lastSeenAtMs: z.number().int().positive(),
    currentVersion: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RegisteredRule = z.infer<typeof registeredRuleSchema>;

export const ruleHistorySchema = z
  .object({
    ruleId: stableRuleIdSchema,
    createdAtMs: z.number().int().positive(),
    firstSeenAtMs: z.number().int().positive(),
    lastSeenAtMs: z.number().int().positive(),
    reviewCount: z.number().int().nonnegative(),
    agreementCount: z.number().int().nonnegative(),
    disagreementCount: z.number().int().nonnegative(),
    deferCount: z.number().int().nonnegative(),
    needsConditionsCount: z.number().int().nonnegative(),
    needsEvidenceCount: z.number().int().nonnegative(),
    revisions: z.number().int().nonnegative(),
    exceptionCount: z.number().int().nonnegative(),
    contradictionCount: z.number().int().nonnegative(),
    currentVersion: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RuleHistory = z.infer<typeof ruleHistorySchema>;

export const ruleStabilitySchema = z
  .object({
    ruleId: stableRuleIdSchema,
    repetition: z.number().min(0).max(1),
    consistency: z.number().min(0).max(1),
    revisionPenalty: z.number().min(0).max(1),
    contradictionPenalty: z.number().min(0).max(1),
    exceptionPenalty: z.number().min(0).max(1),
    stabilityScore: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RuleStability = z.infer<typeof ruleStabilitySchema>;

export const ruleVolatilitySchema = z
  .object({
    ruleId: stableRuleIdSchema,
    changeRate: z.number().min(0).max(1),
    exceptionRate: z.number().min(0).max(1),
    revisionRate: z.number().min(0).max(1),
    recentDisagreementRate: z.number().min(0).max(1),
    volatilityScore: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type RuleVolatility = z.infer<typeof ruleVolatilitySchema>;

export const dependencyRelationSchema = z.enum([
  "requires",
  "supports",
  "invalidates",
  "strengthens",
  "weakens",
  "dependsOn",
]);
export type DependencyRelation = z.infer<typeof dependencyRelationSchema>;

export const dependencyEdgeSchema = z
  .object({
    id: z.string().min(3).max(96),
    fromRuleId: stableRuleIdSchema,
    toRuleId: stableRuleIdSchema,
    relation: dependencyRelationSchema,
    weight: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;

export const dependencyGraphSchema = z
  .object({
    edges: z.array(dependencyEdgeSchema).max(2000),
    cyclesBroken: z.number().int().nonnegative(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type DependencyGraph = z.infer<typeof dependencyGraphSchema>;

export const keystoneScoreSchema = z
  .object({
    ruleId: stableRuleIdSchema,
    dependencyCount: z.number().int().nonnegative(),
    downstreamImpact: z.number().min(0).max(1),
    upstreamImpact: z.number().min(0).max(1),
    keystoneScore: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type KeystoneScore = z.infer<typeof keystoneScoreSchema>;

export const obsoleteKindSchema = z.enum([
  "NEVER_USED",
  "NO_COVERAGE",
  "REPLACED",
  "REDUNDANT",
  "ALWAYS_DEFEATED",
]);
export type ObsoleteKind = z.infer<typeof obsoleteKindSchema>;

export const obsoleteRuleSchema = z
  .object({
    ruleId: stableRuleIdSchema,
    kind: obsoleteKindSchema,
    detail: z.string().min(4).max(400),
    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    mentorEligible: z.literal(false),
    neverDelete: z.literal(true),
  })
  .strict();
export type ObsoleteRule = z.infer<typeof obsoleteRuleSchema>;

export const timelineEventKindSchema = z.enum([
  "CREATED",
  "DISAGREEMENT",
  "EXCEPTION",
  "REVISION",
  "HIGH_STABILITY",
  "MATURE",
  "HIGH_VOLATILITY",
  "KEYSTONE_DETECTED",
  "OBSOLETE_FLAGGED",
]);
export type TimelineEventKind = z.infer<typeof timelineEventKindSchema>;

export const timelineEventSchema = z
  .object({
    id: z.string().min(3).max(96),
    ruleId: stableRuleIdSchema.optional(),
    kind: timelineEventKindSchema,
    atMs: z.number().int().positive(),
    detail: z.string().min(4).max(400),
    mentorEligible: z.literal(false),
  })
  .strict();
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const knowledgeStabilityReportSchema = z
  .object({
    mostStable: z.array(stableRuleIdSchema).max(20),
    leastStable: z.array(stableRuleIdSchema).max(20),
    highestVolatility: z.array(stableRuleIdSchema).max(20),
    mostChallenged: z.array(stableRuleIdSchema).max(20),
    mostConfirmed: z.array(stableRuleIdSchema).max(20),
    neverChallenged: z.array(stableRuleIdSchema).max(40),
    recentlyChanged: z.array(stableRuleIdSchema).max(20),
    mentorEligible: z.literal(false),
  })
  .strict();
export type KnowledgeStabilityReport = z.infer<typeof knowledgeStabilityReportSchema>;

export const adaptivePriorityV2DriverSchema = z.enum([
  "HIGH_VOLATILITY",
  "HIGH_CONFLICT",
  "HIGH_INFORMATION_GAIN",
  "LOW_COVERAGE",
  "LOW_STABILITY",
  "LOW_CONFIDENCE",
  "RANDOM",
]);
export type AdaptivePriorityV2Driver = z.infer<typeof adaptivePriorityV2DriverSchema>;

export const adaptivePriorityItemSchema = z
  .object({
    ruleId: stableRuleIdSchema,
    drivers: z.array(adaptivePriorityV2DriverSchema).min(1).max(4),
    priorityScore: z.number().min(0).max(1),
    reason: z.string().min(4).max(240),
    mentorEligible: z.literal(false),
  })
  .strict();
export type AdaptivePriorityItem = z.infer<typeof adaptivePriorityItemSchema>;

export const knowledgeHealthSchema = z
  .object({
    overallStability: z.number().min(0).max(1),
    overallCoverage: z.number().min(0).max(1),
    overallVolatility: z.number().min(0).max(1),
    ruleDensity: z.number().min(0).max(1),
    dependencyDensity: z.number().min(0).max(1),
    averageRuleAgeMs: z.number().nonnegative(),
    knowledgeGrowth: z.number().min(0).max(1),
    knowledgeChurn: z.number().min(0).max(1),
    mentorEligible: z.literal(false),
  })
  .strict();
export type KnowledgeHealth = z.infer<typeof knowledgeHealthSchema>;

export const rankedProposalSchema = z
  .object({
    id: z.string().min(3).max(80),
    status: z.literal("PENDING"),
    title: z.string().min(4).max(160),
    reason: z.string().min(4).max(600),
    conditions: z.array(z.string().min(4).max(240)).min(1).max(8),
    affectedRuleIds: z.array(stableRuleIdSchema).max(40),
    impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
    stabilityHint: z.number().min(0).max(1),
    dependencyHint: z.number().min(0).max(1),
    coverageHint: z.number().min(0).max(1),
    volatilityHint: z.number().min(0).max(1),
    rankScore: z.number().min(0).max(1),
    autoApply: z.literal(false),
    brainMutate: z.literal(false),
    schemaWarning: z.literal("PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION"),
    safety: z.literal("NOT_SAFE_FOR_BRAIN_APPLICATION"),
    mentorEligible: z.literal(false),
    createdAtMs: z.number().int().positive(),
  })
  .strict();
export type RankedProposal = z.infer<typeof rankedProposalSchema>;

export const knowledgeEvolutionRunResultSchema = z
  .object({
    schemaVersion: z.literal(KNOWLEDGE_EVOLUTION_SCHEMA_VERSION),
    generatedAtMs: z.number().int().positive(),
    rules: z.array(registeredRuleSchema).max(500),
    histories: z.array(ruleHistorySchema).max(500),
    stabilities: z.array(ruleStabilitySchema).max(500),
    volatilities: z.array(ruleVolatilitySchema).max(500),
    dependencyGraph: dependencyGraphSchema,
    keystones: z.array(keystoneScoreSchema).max(500),
    obsolete: z.array(obsoleteRuleSchema).max(200),
    stabilityReport: knowledgeStabilityReportSchema,
    timeline: z.array(timelineEventSchema).max(5000),
    adaptivePriority: z.array(adaptivePriorityItemSchema).max(100),
    health: knowledgeHealthSchema,
    rankedProposals: z.array(rankedProposalSchema).max(40),
    mentorEligible: z.literal(false),
    brainMutate: z.literal(false),
    autoApply: z.literal(false),
    realMarketData: z.literal(false),
    openAi: z.literal(false),
  })
  .strict();
export type KnowledgeEvolutionRunResult = z.infer<typeof knowledgeEvolutionRunResultSchema>;