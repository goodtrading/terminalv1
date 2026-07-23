import { z } from "zod";
import { decisionPathOutcomeSchema, FORBIDDEN_TRADING_OUTCOME_TOKENS } from "./goodTradingAiDecisionGraph";

export const CRITICAL_CALIBRATION_SCHEMA_VERSION = "1.1" as const;

export const evidenceLensSchema = z.enum([
  "GAMMA", "FLIP", "DEALER", "LIQUIDITY", "SPOOFING", "ABSORPTION", "DELTA", "CVD", "FOOTPRINT",
  "OI", "VOLATILITY", "ACCEPTANCE", "REJECTION", "INVALIDATION", "DATA_QUALITY", "STALENESS", "CONFLICTS", "CONFIDENCE",
]);
export type EvidenceLens = z.infer<typeof evidenceLensSchema>;

export const lensStrengthSchema = z.enum(["ABSENT", "WEAK", "MODERATE", "STRONG"]);
export type LensStrength = z.infer<typeof lensStrengthSchema>;
export const lensPolaritySchema = z.enum(["NEUTRAL", "SUPPORTIVE", "WEAKENING", "INVALIDATING", "CONFLICTING"]);
export type LensPolarity = z.infer<typeof lensPolaritySchema>;
export const lensStateSchema = z.object({
  lens: evidenceLensSchema,
  strength: lensStrengthSchema,
  polarity: lensPolaritySchema,
  note: z.string().max(240).optional(),
});
export type LensState = z.infer<typeof lensStateSchema>;

export const syntheticScenarioSourceSchema = z.literal("SYNTHETIC_BRAIN_STRUCTURE");

/** AI-7.3.1 — empirical validation ladder. Lab default: METHODOLOGICAL | HYPOTHETICAL only. */
export const evidenceStatusSchema = z.enum([
  "METHODOLOGICAL",
  "HYPOTHETICAL",
  "HISTORICALLY_TESTED",
  "FORWARD_VALIDATED",
]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export const AI73_ALLOWED_EVIDENCE_STATUSES = ["METHODOLOGICAL", "HYPOTHETICAL"] as const satisfies readonly EvidenceStatus[];

export const findingClassSchema = z.enum([
  "METHODOLOGY_CONSISTENCY",
  "INTERPRETIVE_DISAGREEMENT",
  "RESEARCH_HYPOTHESIS",
]);
export type FindingClass = z.infer<typeof findingClassSchema>;

export const criticalWarningSchema = z.enum(["EDGE_NOT_EMPIRICALLY_VALIDATED"]);
export type CriticalWarning = z.infer<typeof criticalWarningSchema>;

function forbidTradingTokens(val: unknown, ctx: z.RefinementCtx): void {
  const blob = JSON.stringify(val).toUpperCase();
  for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
    if (new RegExp("\\b" + tok + "\\b").test(blob)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Forbidden trading token: " + tok });
    }
  }
}

export const syntheticScenarioSchema = z
  .object({
    id: z.string().min(3).max(96),
    seed: z.string().min(1).max(64),
    source: syntheticScenarioSourceSchema,
    realMarketData: z.literal(false),
    lenses: z.array(lensStateSchema).min(1).max(18),
    narrative: z.string().min(8).max(2400),
    mutationApplied: z.string().max(80).optional(),
    parentScenarioId: z.string().max(96).optional(),
    createdAtMs: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict()
  .superRefine(forbidTradingTokens);
export type SyntheticScenario = z.infer<typeof syntheticScenarioSchema>;

export const mutationKindSchema = z.enum([
  "INVERT_GAMMA", "REMOVE_ABSORPTION", "FLIP_STALE", "DEALER_NEUTRAL", "WALL_REMOVED", "WALL_ACCEPTED",
  "OI_DISAPPEARS", "CVD_INVERTED", "INJECT_CONFLICT", "ADD_NOISE", "MISSING_EVIDENCE", "PARTIAL_EVIDENCE",
  "STRENGTHEN_INVALIDATION", "WEAKEN_CONFIRMATION",
]);
export type MutationKind = z.infer<typeof mutationKindSchema>;

export const disagreementTaxonomySchema = z.enum([
  "LIKELY_CORRECT", "LIKELY_TOO_AGGRESSIVE", "LIKELY_TOO_CONSERVATIVE", "INSUFFICIENT_EVIDENCE",
  "MULTIPLE_VALID_INTERPRETATIONS", "METHODOLOGY_DIFFERENCE", "POTENTIAL_EDGE", "POTENTIAL_BIAS", "UNKNOWN",
]);
export type DisagreementTaxonomy = z.infer<typeof disagreementTaxonomySchema>;

export const criticalFindingKindSchema = z.enum([
  "OVERWEIGHT_LENS", "UNDERWEIGHT_LENS", "INSUFFICIENT_CONFIRMATION", "IGNORED_INVALIDATION",
  "UNRESOLVED_CONFLICT", "UNNECESSARY_PATH", "POTENTIAL_BIAS", "POTENTIAL_EDGE",
  "STALE_DEFINITE", "MISSING_EVIDENCE", "PARTIAL_EVIDENCE",
]);
export type CriticalFindingKind = z.infer<typeof criticalFindingKindSchema>;

export const criticalFindingSchema = z.object({
  id: z.string().min(3).max(80),
  kind: criticalFindingKindSchema,
  findingClass: findingClassSchema,
  evidenceStatus: evidenceStatusSchema,
  lens: evidenceLensSchema.optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  message: z.string().min(4).max(400),
  taxonomyHint: disagreementTaxonomySchema.optional(),
  warnings: z.array(criticalWarningSchema).max(4).default([]),
}).superRefine((f, ctx) => {
  if (f.kind === "POTENTIAL_EDGE" && !f.warnings.includes("EDGE_NOT_EMPIRICALLY_VALIDATED")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "POTENTIAL_EDGE requires EDGE_NOT_EMPIRICALLY_VALIDATED" });
  }
  if (f.kind === "POTENTIAL_EDGE" && f.evidenceStatus !== "HYPOTHETICAL" && f.evidenceStatus !== "METHODOLOGICAL") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "POTENTIAL_EDGE evidenceStatus must be METHODOLOGICAL or HYPOTHETICAL in AI-7.3" });
  }
  if (
    (f.evidenceStatus === "HISTORICALLY_TESTED" || f.evidenceStatus === "FORWARD_VALIDATED") &&
    process.env.GOODTRADING_AI_CRITICAL_CALIBRATION_ALLOW_EMPIRICAL !== "true"
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Empirical evidenceStatus not allowed without explicit future evidence gate" });
  }
});
export type CriticalFinding = z.infer<typeof criticalFindingSchema>;

export const criticalReviewSchema = z.object({
  scenarioId: z.string().min(3).max(96),
  engineOutcome: decisionPathOutcomeSchema.nullable(),
  humanOutcome: decisionPathOutcomeSchema.nullable(),
  findings: z.array(criticalFindingSchema).max(24),
  taxonomy: disagreementTaxonomySchema,
  summary: z.string().min(4).max(600),
  reviewedAtMs: z.number().int().positive(),
  mentorEligible: z.literal(false),
});
export type CriticalReview = z.infer<typeof criticalReviewSchema>;

export const improvementProposalKindSchema = z.enum([
  "RULE_REFINEMENT", "PRIORITY_WEIGHT_CHANGE", "NEW_CONFIRMATION", "NEW_INVALIDATION",
  "RULE_SPLIT", "RULE_MERGE", "REMOVE_DEAD_RULE", "TEMPLATE_IMPROVEMENT",
]);
export type ImprovementProposalKind = z.infer<typeof improvementProposalKindSchema>;
export const improvementProposalStatusSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED"]);
export type ImprovementProposalStatus = z.infer<typeof improvementProposalStatusSchema>;
export const proposalPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type ProposalPriority = z.infer<typeof proposalPrioritySchema>;

export const improvementProposalSchema = z.object({
  id: z.string().min(3).max(80),
  scenarioId: z.string().min(3).max(96),
  kind: improvementProposalKindSchema,
  status: improvementProposalStatusSchema,
  title: z.string().min(4).max(160),
  reason: z.string().min(4).max(600),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  priority: proposalPrioritySchema,
  conditions: z.array(z.string().min(4).max(240)).min(1).max(8),
  relatedLenses: z.array(evidenceLensSchema).max(8),
  relatedFindingIds: z.array(z.string().min(3).max(80)).max(12),
  supportObservationIds: z.array(z.string().min(3).max(80)).max(32).default([]),
  minSupportRequired: z.number().int().positive().max(20),
  evidenceStatus: evidenceStatusSchema,
  autoApply: z.literal(false),
  brainMutate: z.literal(false),
  createdAtMs: z.number().int().positive(),
  decidedAtMs: z.number().int().positive().optional(),
  decisionNote: z.string().max(600).optional(),
  mentorEligible: z.literal(false),
}).strict().superRefine((p, ctx) => {
  if (p.autoApply !== false || p.brainMutate !== false) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "autoApply/brainMutate must be false" });
  }
  if (p.evidenceStatus === "HISTORICALLY_TESTED" || p.evidenceStatus === "FORWARD_VALIDATED") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Proposals cannot claim empirical validation in AI-7.3" });
  }
});
export type ImprovementProposal = z.infer<typeof improvementProposalSchema>;

export const calibrationQuestionTypeSchema = z.enum([
  "PRIORITY_CHOICE", "CONDITIONAL_PRIORITY", "CONFIRMATION_REQUIREMENT", "INVALIDATION_REQUIREMENT",
  "AMBIGUITY_RESOLUTION", "SCENARIO_COMPARISON", "RULE_SCOPE", "COUNTEREXAMPLE", "CONFLICT_RESOLUTION",
]);
export type CalibrationQuestionType = z.infer<typeof calibrationQuestionTypeSchema>;

export const infoGainBandSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type InfoGainBand = z.infer<typeof infoGainBandSchema>;

export const infoGainScoreComponentsSchema = z.object({
  uncertaintyScore: z.number().min(0).max(1),
  coverageGain: z.number().min(0).max(1),
  ruleImpact: z.number().min(0).max(1),
  templateImpact: z.number().min(0).max(1),
  conflictResolutionValue: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  redundancyPenalty: z.number().min(0).max(1),
  humanEffortPenalty: z.number().min(0).max(1),
  safetyPriority: z.number().min(0).max(1),
});
export type InfoGainScoreComponents = z.infer<typeof infoGainScoreComponentsSchema>;

export const calibrationQuestionSchema = z.object({
  id: z.string().min(3).max(80),
  prompt: z.string().min(8).max(800),
  questionType: calibrationQuestionTypeSchema,
  relatedLenses: z.array(evidenceLensSchema).min(1).max(6),
  infoGainScore: z.number().min(0).max(1),
  scoreComponents: infoGainScoreComponentsSchema,
  expectedInformationGainBand: infoGainBandSchema,
  whyThisQuestion: z.string().min(8).max(400),
  affectedConcepts: z.array(z.string().min(2).max(80)).min(1).max(8),
  affectedTemplates: z.array(z.string().min(2).max(80)).max(8),
  rationale: z.string().min(4).max(400),
  allowsDepends: z.literal(true),
  mentorEligible: z.literal(false),
}).strict().superRefine((q, ctx) => {
  const upper = q.prompt.toUpperCase();
  for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
    if (new RegExp("\\b" + tok + "\\b").test(upper)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Question must not include trading tokens" });
    }
  }
  if (/\bsuggested\s+answer\b/i.test(q.prompt) || /\brespuesta\s+sugerida\b/i.test(q.prompt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Questions must not include suggested answers" });
  }
});
export type CalibrationQuestion = z.infer<typeof calibrationQuestionSchema>;

/** Structured answer kinds for blind calibration UI (AI-7.3.3). */
export const calibrationAnswerTypeSchema = z.enum([
  "PRIORITIZE",
  "REQUIRE_CONFIRMATION",
  "REQUIRE_INVALIDATION",
  "DEPENDS",
  "MULTIPLE_VALID",
  "INSUFFICIENT_EVIDENCE",
]);
export type CalibrationAnswerType = z.infer<typeof calibrationAnswerTypeSchema>;

export const calibrationObservationKindSchema = z.enum(["ANSWER", "ADDENDUM", "REVISION"]);
export type CalibrationObservationKind = z.infer<typeof calibrationObservationKindSchema>;

export const calibrationPostRevealActionSchema = z.enum([
  "AGREE",
  "DISAGREE",
  "NEEDS_CONDITIONS",
  "NEEDS_MORE_EVIDENCE",
  "DEFER",
  "ADD_NOTE",
]);
export type CalibrationPostRevealAction = z.infer<typeof calibrationPostRevealActionSchema>;

export const calibrationSessionKindSchema = z.enum(["HUMAN", "TECHNICAL"]);
export type CalibrationSessionKind = z.infer<typeof calibrationSessionKindSchema>;

export const calibrationObservationSchema = z.object({
  id: z.string().min(3).max(80),
  sessionId: z.string().min(3).max(80),
  questionId: z.string().min(3).max(80),
  /** Primary free-text answer (UI answerText maps here). */
  humanNote: z.string().min(1).max(2000),
  answerType: calibrationAnswerTypeSchema.optional(),
  conditions: z.array(z.string().min(1).max(240)).max(12).optional(),
  minimumConfirmations: z.array(z.string().min(1).max(240)).max(12).optional(),
  invalidations: z.array(z.string().min(1).max(240)).max(12).optional(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  allowsDepends: z.boolean(),
  observationKind: calibrationObservationKindSchema.default("ANSWER"),
  revisionOf: z.string().min(3).max(80).optional(),
  postRevealAction: calibrationPostRevealActionSchema.optional(),
  createdAtMs: z.number().int().positive(),
  mentorEligible: z.literal(false),
}).strict();
export type CalibrationObservation = z.infer<typeof calibrationObservationSchema>;

export const reportLabelSchema = z.enum([
  "OBSERVED_BY_ENGINE",
  "QUESTION_PENDING",
  "HYPOTHESIS_ONLY",
  "LEARNED_FROM_IGNACIO",
]);
export type ReportLabel = z.infer<typeof reportLabelSchema>;

export const calibrationMetricsSchema = z.object({
  scenarioCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  proposalCount: z.number().int().nonnegative(),
  pendingProposals: z.number().int().nonnegative(),
  acceptedProposals: z.number().int().nonnegative(),
  rejectedProposals: z.number().int().nonnegative(),
  taxonomyDistribution: z.record(disagreementTaxonomySchema, z.number().int().nonnegative()),
  avgFindingsPerReview: z.number().nonnegative(),
  unusedRuleCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  highUncertaintyCount: z.number().int().nonnegative(),
  evidenceStatusDistribution: z.record(evidenceStatusSchema, z.number().int().nonnegative()),
  mentorEligible: z.literal(false),
});
export type CalibrationMetrics = z.infer<typeof calibrationMetricsSchema>;

export const criticalCalibrationReportSchema = z.object({
  schemaVersion: z.literal(CRITICAL_CALIBRATION_SCHEMA_VERSION),
  generatedAtMs: z.number().int().positive(),
  labels: z.array(reportLabelSchema).min(1).max(8),
  learnedSummary: z.array(z.string().min(4).max(400)).max(24),
  weakRules: z.array(z.string().min(2).max(160)).max(32),
  unusedRules: z.array(z.string().min(2).max(160)).max(32),
  ignacioChangeHotspots: z.array(z.string().min(2).max(160)).max(24),
  highUncertaintyScenarios: z.array(z.string().min(3).max(96)).max(48),
  nextQuestions: z.array(calibrationQuestionSchema).max(32),
  metrics: calibrationMetricsSchema,
  mentorEligible: z.literal(false),
  brainMutated: z.literal(false),
});
export type CriticalCalibrationReport = z.infer<typeof criticalCalibrationReportSchema>;

export const TAXONOMY_IDS = disagreementTaxonomySchema.options;
export const MUTATION_KINDS = mutationKindSchema.options;
export const ALL_EVIDENCE_LENSES = evidenceLensSchema.options;
export const QUESTION_TYPES = calibrationQuestionTypeSchema.options;
