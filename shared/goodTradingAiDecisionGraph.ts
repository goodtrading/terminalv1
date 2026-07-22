/**
 * AI-7 — Deterministic Decision Graph contracts (client-safe projection only).
 * NO trading outcomes (BUY/SELL/LONG/SHORT). OpenAI must not build/replace this graph.
 */
import { z } from "zod";

export const DECISION_GRAPH_SCHEMA_VERSION = "1.0" as const;

/** Forbidden as path/node outcomes — educational graph only. */
export const FORBIDDEN_TRADING_OUTCOME_TOKENS = [
  "BUY",
  "SELL",
  "LONG",
  "SHORT",
  "ENTER",
  "EXIT",
  "OPEN_POSITION",
  "CLOSE_POSITION",
  "MARKET_ORDER",
  "LIMIT_ORDER",
] as const;

export const decisionPriorityTierSchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);
export type DecisionPriorityTier = z.infer<typeof decisionPriorityTierSchema>;

export const decisionEvidenceRelationSchema = z.enum([
  "SUPPORTS",
  "WEAKENS",
  "INVALIDATES",
  "NEUTRAL",
  "INSUFFICIENT",
  "CONFLICTS",
]);
export type DecisionEvidenceRelation = z.infer<typeof decisionEvidenceRelationSchema>;

export const decisionNodeKindSchema = z.enum([
  "HYPOTHESIS",
  "CONFIRMATION",
  "INVALIDATION",
  "EVIDENCE",
  "CONFLICT",
  "GUARD",
  "CONCLUSION",
  "CONTEXT",
]);
export type DecisionNodeKind = z.infer<typeof decisionNodeKindSchema>;

export const decisionNodeStateSchema = z.enum([
  "ACTIVE",
  "SUPPORTED",
  "WEAKENED",
  "INVALIDATED",
  "CONFLICTED",
  "BLOCKED",
  "INSUFFICIENT",
  "STALE",
  "SKIPPED",
]);
export type DecisionNodeState = z.infer<typeof decisionNodeStateSchema>;

export const decisionContextTrustSchema = z.enum([
  "UNTRUSTED_SCENARIO",
  "SYNTHETIC_DEBUG",
  "VALIDATED_LIVE",
  "VALIDATED_STUB",
  "NO_MARKET",
]);
export type DecisionContextTrust = z.infer<typeof decisionContextTrustSchema>;

export const decisionQualityCategorySchema = z.enum([
  "WELL_SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "CONFLICTED",
  "INVALIDATED",
  "INSUFFICIENT_EVIDENCE",
  "STALE_CONTEXT",
  "UNTRUSTED_SCENARIO",
]);
export type DecisionQualityCategory = z.infer<typeof decisionQualityCategorySchema>;

/** Allowed educational outcomes — never trading side. */
export const decisionPathOutcomeSchema = z.enum([
  "HYPOTHESIS_OPEN",
  "HYPOTHESIS_SUPPORTED",
  "HYPOTHESIS_WEAKENED",
  "HYPOTHESIS_INVALIDATED",
  "READING_CONFLICTED",
  "EVIDENCE_INSUFFICIENT",
  "CONTEXT_STALE",
  "CONTEXT_UNTRUSTED",
  "GUARD_BLOCKED",
  "NEEDS_MORE_LENSES",
]);
export type DecisionPathOutcome = z.infer<typeof decisionPathOutcomeSchema>;

export const decisionNodeSchema = z.object({
  id: z.string().min(1).max(80),
  kind: decisionNodeKindSchema,
  label: z.string().min(1).max(160),
  priority: decisionPriorityTierSchema,
  state: decisionNodeStateSchema,
  knowledgeId: z.string().min(1).max(80).optional(),
  detail: z.string().max(400).optional(),
});
export type DecisionNode = z.infer<typeof decisionNodeSchema>;

export const decisionEdgeSchema = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  relation: decisionEvidenceRelationSchema,
});
export type DecisionEdge = z.infer<typeof decisionEdgeSchema>;

export const decisionPathSchema = z.object({
  id: z.string().min(1).max(80),
  nodeIds: z.array(z.string().min(1).max(80)).min(1).max(12),
  outcome: decisionPathOutcomeSchema,
  priority: decisionPriorityTierSchema,
  confirmationIds: z.array(z.string().min(1).max(80)).max(12),
  invalidationIds: z.array(z.string().min(1).max(80)).max(12),
  conflictCodes: z.array(z.string().min(1).max(80)).max(12),
});
export type DecisionPath = z.infer<typeof decisionPathSchema>;

/** Full internal graph — never send entire graph to general clients. */
export const decisionGraphInternalSchema = z.object({
  schemaVersion: z.literal(DECISION_GRAPH_SCHEMA_VERSION),
  templateId: z.string().min(1).max(80),
  templateVersion: z.string().min(1).max(40),
  contextTrust: decisionContextTrustSchema,
  quality: decisionQualityCategorySchema,
  nodes: z.array(decisionNodeSchema).max(20),
  edges: z.array(decisionEdgeSchema).max(48),
  paths: z.array(decisionPathSchema).max(2),
  primaryPathId: z.string().min(1).max(80).nullable(),
  contradictions: z.array(z.string().min(1).max(500)).max(12),
  warnings: z.array(z.string().min(1).max(500)).max(20),
  evaluatedAtMs: z.number().int().positive(),
  durationMs: z.number().nonnegative(),
  mentorEligible: z.literal(false),
});
export type DecisionGraphInternal = z.infer<typeof decisionGraphInternalSchema>;

/**
 * Client-safe projection for Mentor optional attach / admin summarize.
 * Caps nodes/paths — never full Brain traversal dump.
 * Rendered pathSummaries ≤2; stepLabels ≤12 total rendered signal.
 */
export const decisionGraphClientSafeSchema = z.object({
  schemaVersion: z.literal(DECISION_GRAPH_SCHEMA_VERSION),
  templateId: z.string().min(1).max(80),
  templateVersion: z.string().min(1).max(40),
  contextTrust: decisionContextTrustSchema,
  quality: decisionQualityCategorySchema,
  primaryOutcome: decisionPathOutcomeSchema.nullable(),
  pathSummaries: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        outcome: decisionPathOutcomeSchema,
        priority: decisionPriorityTierSchema,
        stepLabels: z.array(z.string().min(1).max(160)).max(12),
      }),
    )
    .max(2),
  confirmationLabels: z.array(z.string().min(1).max(160)).max(8),
  invalidationLabels: z.array(z.string().min(1).max(160)).max(8),
  conflictCodes: z.array(z.string().min(1).max(80)).max(8),
  warnings: z.array(z.string().min(1).max(500)).max(12),
  mentorEligible: z.literal(false),
  /** AI-7.1: count of nodes shown in rendered projection (≤12). */
  renderedNodeCount: z.number().int().nonnegative().max(12).optional(),
});
export type DecisionGraphClientSafe = z.infer<typeof decisionGraphClientSafeSchema>;

export function assertNoForbiddenTradingOutcome(text: string): boolean {
  const u = text.toUpperCase();
  return !FORBIDDEN_TRADING_OUTCOME_TOKENS.some((t) => {
    const re = new RegExp(`\\b${t}\\b`, "i");
    return re.test(u);
  });
}
