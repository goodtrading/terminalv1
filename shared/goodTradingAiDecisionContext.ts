/**
 * GoodTrading AI-8.1 — Decision Context Recorder contracts.
 * Joins Market Snapshot + Decision Graph + TraderActionContext (BingX RO)
 * into immutable DecisionContext → TradeDecision → Timeline + Journal.
 *
 * Record-only. No Mentor / Brain / learning / OpenAI / KD / KE / KP wiring.
 * Refs + summaries only — never full payloads or raw BingX dumps.
 */
import { z } from "zod";
import { bingxAccountModeSchema } from "./goodTradingAiBingxAccount";

export const DECISION_CONTEXT_SCHEMA_VERSION = "1.0" as const;

export const decisionContextFreshnessSchema = z.enum([
  "FRESH",
  "STALE",
  "DEGRADED",
  "UNCERTAIN",
  "MISSING",
]);
export type DecisionContextFreshness = z.infer<
  typeof decisionContextFreshnessSchema
>;

export const decisionTimelineEventTypeSchema = z.enum([
  "OPEN",
  "ADD",
  "REDUCE",
  "EXIT",
  "STOP_HIT",
  "TP_HIT",
  "MANUAL_CLOSE",
  "PARTIAL",
]);
export type DecisionTimelineEventType = z.infer<
  typeof decisionTimelineEventTypeSchema
>;

export const POSITION_EVENTS_FOR_DECISION = [
  "POSITION_OPENED",
  "POSITION_INCREASED",
  "POSITION_REDUCED",
  "POSITION_CLOSED",
] as const;
export type PositionEventForDecision =
  (typeof POSITION_EVENTS_FOR_DECISION)[number];

/** Market lens summaries only — never full MarketSnapshot payload. */
export const decisionMarketSummariesSchema = z.object({
  gammaRegime: z.string().max(120).nullable(),
  dealerRegime: z.string().max(120).nullable(),
  liquidityRegime: z.string().max(120).nullable(),
  absorption: z.string().max(80).nullable(),
  spoof: z.string().max(80).nullable(),
  oi: z.string().max(160).nullable(),
  cvd: z.string().max(160).nullable(),
  footprint: z.string().max(160).nullable(),
});
export type DecisionMarketSummaries = z.infer<
  typeof decisionMarketSummariesSchema
>;

/** Decision-state summaries from Decision Graph (labels only). */
export const decisionStateSummarySchema = z.object({
  hypothesis: z.string().max(280).nullable(),
  confirmations: z.array(z.string().max(160)).max(8),
  invalidations: z.array(z.string().max(160)).max(8),
  confidence: z.number().min(0).max(1).nullable(),
  evidenceQuality: z.string().max(80).nullable(),
  dataFreshness: decisionContextFreshnessSchema,
});
export type DecisionStateSummary = z.infer<typeof decisionStateSummarySchema>;

/**
 * Frozen DecisionContext — immutable after creation.
 * Normalized refs + summaries only.
 */
export const decisionContextSchema = z.object({
  schemaVersion: z.literal(DECISION_CONTEXT_SCHEMA_VERSION),
  decisionId: z.string().uuid(),
  createdAt: z.string().datetime(),
  symbol: z.string().min(1).max(64),
  accountMode: bingxAccountModeSchema,
  traderActionEventId: z.string().min(1).max(128),
  marketSnapshotId: z.string().max(80).nullable(),
  decisionGraphId: z.string().max(120).nullable(),
  traderActionContextId: z.string().max(128).nullable(),
  decisionState: decisionStateSummarySchema,
  market: decisionMarketSummariesSchema,
  mentorEligible: z.literal(false),
  brainMutate: z.literal(false),
  learning: z.literal(false),
  autoApply: z.literal(false),
});
export type DecisionContext = z.infer<typeof decisionContextSchema>;

export const decisionTimelineEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  decisionId: z.string().uuid(),
  type: decisionTimelineEventTypeSchema,
  at: z.string().datetime(),
  symbol: z.string().min(1).max(64),
  traderActionEventId: z.string().min(1).max(128),
  summary: z.string().min(1).max(280),
  /** Optional frozen context id for this instant (immutable). */
  contextId: z.string().uuid().optional(),
  accountMode: bingxAccountModeSchema,
  mentorEligible: z.literal(false),
  brainMutate: z.literal(false),
  learning: z.literal(false),
  autoApply: z.literal(false),
});
export type DecisionTimelineEvent = z.infer<typeof decisionTimelineEventSchema>;

/**
 * Automatic Decision Journal — data-only, never subjective conclusions.
 */
export const decisionJournalSchema = z.object({
  decisionId: z.string().uuid(),
  initialHypothesis: z.string().max(280).nullable(),
  confirmationsPresent: z.array(z.string().max(160)).max(8),
  invalidationsPresent: z.array(z.string().max(160)).max(8),
  /** Append-only factual change notes observed during the trade. */
  changesDuringTrade: z.array(z.string().max(280)).max(64),
  howItEnded: z.string().max(280).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  observedPnl: z.number().finite().nullable(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  mentorEligible: z.literal(false),
  brainMutate: z.literal(false),
  learning: z.literal(false),
  autoApply: z.literal(false),
});
export type DecisionJournal = z.infer<typeof decisionJournalSchema>;

export const tradeDecisionStatusSchema = z.enum([
  "OPEN",
  "ACTIVE",
  "CLOSED",
]);
export type TradeDecisionStatus = z.infer<typeof tradeDecisionStatusSchema>;

/**
 * TradeDecision — stable UUID for the trade lifecycle.
 * DecisionContext is frozen at first capture; never recalculated.
 */
export const decisionPositionSideSchema = z.enum(["long", "short", "unknown"]);
export type DecisionPositionSide = z.infer<typeof decisionPositionSideSchema>;

export const tradeDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  userId: z.number().int().positive(),
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(64),
  /** Hedge-aware side — LONG ≠ SHORT same symbol. */
  positionSide: decisionPositionSideSchema.default("unknown"),
  accountMode: bingxAccountModeSchema,
  status: tradeDecisionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  /** Frozen at creation — never mutated. */
  context: decisionContextSchema,
  timeline: z.array(decisionTimelineEventSchema).max(200),
  journal: decisionJournalSchema,
  mentorEligible: z.literal(false),
  brainMutate: z.literal(false),
  learning: z.literal(false),
  autoApply: z.literal(false),
});
export type TradeDecision = z.infer<typeof tradeDecisionSchema>;

export const decisionContextStorageHealthStatusSchema = z.enum([
  "DURABLE_READY",
  "DEGRADED",
  "UNSAFE_MEMORY",
  "UNAVAILABLE",
  "RECORDER_DISABLED",
]);
export type DecisionContextStorageHealthStatus = z.infer<
  typeof decisionContextStorageHealthStatusSchema
>;

export const DECISION_CONTEXT_UI_BADGES = [
  "READ ONLY",
  "NOT CONNECTED TO AI",
] as const;

export const DECISION_CONTEXT_STORAGE_BADGES = [
  "DURABLE_READY",
  "DEGRADED",
  "UNSAFE_MEMORY",
  "UNAVAILABLE",
  "RECORDER_DISABLED",
] as const;

export function canUseDecisionContextForMentor(): false {
  return false;
}

export function canUseDecisionContextForLearning(): false {
  return false;
}

export function canMutateBrainFromDecisionContext(): false {
  return false;
}

export function canAutoApplyDecisionContext(): false {
  return false;
}

/**
 * Map BingX position trading-action → decision timeline type.
 * AI-8.1.1: never invent MANUAL_CLOSE; STOP/TP only with explicit EVIDENCE token.
 * Prefer classifyPositionTimelineEvent for confidence + evidence codes.
 */
export function mapPositionEventToTimelineType(
  type: PositionEventForDecision,
  hint?: string | null,
): DecisionTimelineEventType {
  const h = (hint ?? "").toUpperCase();
  if (type === "POSITION_OPENED") return "OPEN";
  if (type === "POSITION_INCREASED") return "ADD";
  if (type === "POSITION_REDUCED") {
    if (h.includes("PARTIAL")) return "PARTIAL";
    return "REDUCE";
  }
  // POSITION_CLOSED — weak keywords alone → EXIT (not STOP/TP/MANUAL)
  if (h.includes("EVIDENCE_STOP") || h.includes("STOP_HIT_EVIDENCE")) return "STOP_HIT";
  if (h.includes("EVIDENCE_TP") || h.includes("TP_HIT_EVIDENCE")) return "TP_HIT";
  // Never invent MANUAL_CLOSE
  return "EXIT";
}

export function isPositionEventForDecision(
  type: string,
): type is PositionEventForDecision {
  return (POSITION_EVENTS_FOR_DECISION as readonly string[]).includes(type);
}
