/**
 * AI-7.3.6 — Knowledge Provenance Engine contracts.
 * Append-only, deterministic, auditable. Never mutates Brain.
 * Proposals stay PENDING. No OpenAI/LLM/embeddings.
 */
import { z } from "zod";
import { stableRuleIdSchema } from "./goodTradingAiKnowledgeEvolution";

export const KNOWLEDGE_PROVENANCE_SCHEMA_VERSION = "1.0" as const;
export { stableRuleIdSchema };
export type StableRuleId = z.infer<typeof stableRuleIdSchema>;

export const provenanceOriginSchema = z.enum([
  "HUMAN_REVIEW",
  "CRITICAL_CALIBRATION",
  "KNOWLEDGE_DISTILLATION",
  "KNOWLEDGE_EVOLUTION",
  "MANUAL_ADMIN",
  "DERIVED",
]);
export type ProvenanceOrigin = z.infer<typeof provenanceOriginSchema>;

export const provenanceRecordSchema = z
  .object({
    stableRuleId: stableRuleIdSchema,
    origin: provenanceOriginSchema,
    createdAtMs: z.number().int().positive(),
    createdBy: z.string().min(2).max(80),
    sourceSession: z.string().min(1).max(96).optional(),
    sourceReview: z.string().min(1).max(96).optional(),
    sourceProposal: z.string().min(1).max(96).optional(),
    currentVersion: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ProvenanceRecord = z.infer<typeof provenanceRecordSchema>;

export const justificationEventKindSchema = z.enum([
  "CREATED",
  "REVIEWED",
  "CHALLENGED",
  "REFINED",
  "EXCEPTION_ADDED",
  "CONTRADICTION_FOUND",
  "REPLACED",
  "MERGED",
  "SPLIT",
  "DEPRECATED",
]);
export type JustificationEventKind = z.infer<typeof justificationEventKindSchema>;

export const rationalePayloadSchema = z
  .object({
    rationale: z.string().min(4).max(800),
    supportingEvidence: z.array(z.string().min(2).max(240)).max(20),
    opposingEvidence: z.array(z.string().min(2).max(240)).max(20),
    conditions: z.array(z.string().min(2).max(240)).max(12),
    assumptions: z.array(z.string().min(2).max(240)).max(12),
    uncertainty: z.enum(["LOW", "MEDIUM", "HIGH"]),
    reviewerNotes: z.string().max(800).optional(),
  })
  .strict();
export type RationalePayload = z.infer<typeof rationalePayloadSchema>;

export const justificationEventSchema = z
  .object({
    id: z.string().min(3).max(96),
    stableRuleId: stableRuleIdSchema,
    kind: justificationEventKindSchema,
    atMs: z.number().int().positive(),
    version: z.number().int().positive(),
    createdBy: z.string().min(2).max(80),
    sourceSession: z.string().min(1).max(96).optional(),
    sourceReview: z.string().min(1).max(96).optional(),
    sourceProposal: z.string().min(1).max(96).optional(),
    rationale: rationalePayloadSchema,
    mentorEligible: z.literal(false),
    appendOnly: z.literal(true),
  })
  .strict();
export type JustificationEvent = z.infer<typeof justificationEventSchema>;

export const lineageRelationSchema = z.enum([
  "parentRule",
  "childRule",
  "mergedFrom",
  "splitInto",
  "supersededBy",
  "relatedRules",
]);
export type LineageRelation = z.infer<typeof lineageRelationSchema>;

export const lineageEdgeSchema = z
  .object({
    id: z.string().min(3).max(96),
    fromRuleId: stableRuleIdSchema,
    toRuleId: stableRuleIdSchema,
    relation: lineageRelationSchema,
    atMs: z.number().int().positive(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type LineageEdge = z.infer<typeof lineageEdgeSchema>;

export const lineageGraphSchema = z
  .object({
    edges: z.array(lineageEdgeSchema).max(5000),
    cyclesBroken: z.number().int().nonnegative(),
    mentorEligible: z.literal(false),
  })
  .strict();
export type LineageGraph = z.infer<typeof lineageGraphSchema>;

export const impactTraceSchema = z
  .object({
    ruleId: stableRuleIdSchema,
    affectedRules: z.array(stableRuleIdSchema).max(80),
    dependencies: z.array(z.string().min(3).max(160)).max(80),
    potentialModificationImpact: z.enum(["LOW", "MEDIUM", "HIGH"]),
    relatedProposalIds: z.array(z.string().min(3).max(96)).max(40),
    detail: z.string().min(4).max(600),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ImpactTrace = z.infer<typeof impactTraceSchema>;

export const proposalContextSchema = z
  .object({
    proposalId: z.string().min(3).max(96),
    status: z.literal("PENDING"),
    relatedRuleIds: z.array(stableRuleIdSchema).max(40),
    origins: z.array(provenanceRecordSchema).max(40),
    historyEvents: z.array(justificationEventSchema).max(200),
    originalReasons: z.array(z.string().min(4).max(400)).max(20),
    relevantEvents: z.array(z.string().min(4).max(240)).max(40),
    dependencies: z.array(z.string().min(3).max(160)).max(40),
    autoApply: z.literal(false),
    brainMutate: z.literal(false),
    safety: z.literal("NOT_SAFE_FOR_BRAIN_APPLICATION"),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ProposalContext = z.infer<typeof proposalContextSchema>;

export const provenanceQueryResultSchema = z
  .object({
    ruleId: stableRuleIdSchema,
    origin: provenanceRecordSchema.nullable(),
    fullEvolution: z.array(justificationEventSchema).max(500),
    revisions: z.array(justificationEventSchema).max(200),
    counterexamples: z.array(justificationEventSchema).max(200),
    derivedRules: z.array(stableRuleIdSchema).max(80),
    supersededRules: z.array(stableRuleIdSchema).max(80),
    mentorEligible: z.literal(false),
  })
  .strict();
export type ProvenanceQueryResult = z.infer<typeof provenanceQueryResultSchema>;

export const provenanceRunResultSchema = z
  .object({
    schemaVersion: z.literal(KNOWLEDGE_PROVENANCE_SCHEMA_VERSION),
    generatedAtMs: z.number().int().positive(),
    registry: z.array(provenanceRecordSchema).max(1000),
    events: z.array(justificationEventSchema).max(10000),
    lineage: lineageGraphSchema,
    timelines: z.record(z.string(), z.array(justificationEventSchema).max(500)),
    impactTraces: z.array(impactTraceSchema).max(500),
    proposalContexts: z.array(proposalContextSchema).max(80),
    mentorEligible: z.literal(false),
    brainMutate: z.literal(false),
    autoApply: z.literal(false),
    realMarketData: z.literal(false),
    openAi: z.literal(false),
  })
  .strict();
export type ProvenanceRunResult = z.infer<typeof provenanceRunResultSchema>;