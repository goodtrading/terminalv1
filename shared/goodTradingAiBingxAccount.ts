/**
 * GoodTrading AI-8.0 / BINGX-1 — BingX read-only account contracts.
 * Sanitized trading-activity read model only. No raw exchange payloads.
 * Mentor / learning consumption remains disabled in this phase.
 */
import { z } from "zod";

export const bingxAccountModeSchema = z.enum([
  "REAL_BINGX_READ_ONLY",
  "PAPER_TRADING",
  "SIMULATED",
  "MANUAL",
]);
export type BingxAccountMode = z.infer<typeof bingxAccountModeSchema>;

export const bingxAccountSourceSchema = z.literal("BINGX_ACCOUNT_READ_ONLY");
export type BingxAccountSource = z.infer<typeof bingxAccountSourceSchema>;

export const bingxCompletenessSchema = z.enum([
  "COMPLETE",
  "PARTIAL",
  "DEGRADED",
  "UNAVAILABLE",
]);
export type BingxCompleteness = z.infer<typeof bingxCompletenessSchema>;

export const bingxEventConfidenceSchema = z.enum([
  "CONFIRMED",
  "DERIVED",
  "UNCERTAIN",
]);
export type BingxEventConfidence = z.infer<typeof bingxEventConfidenceSchema>;

export const bingxTradingActionTypeSchema = z.enum([
  "POSITION_OPENED",
  "POSITION_INCREASED",
  "POSITION_REDUCED",
  "POSITION_CLOSED",
  "POSITION_FLIPPED",
  "ORDER_OPENED",
  "ORDER_PARTIALLY_FILLED",
  "ORDER_FILLED",
  "ORDER_CANCELLED_EXTERNALLY",
  "STOP_CHANGED_EXTERNALLY",
  "TAKE_PROFIT_CHANGED_EXTERNALLY",
  "MARGIN_MODE_OBSERVED",
  "LEVERAGE_OBSERVED",
  "ACCOUNT_STATE_UNCERTAIN",
]);
export type BingxTradingActionType = z.infer<typeof bingxTradingActionTypeSchema>;

export const bingxBalanceSnapshotSchema = z.object({
  asset: z.string().min(1).max(32),
  walletBalance: z.number().finite(),
  equity: z.number().finite().optional(),
  availableBalance: z.number().finite(),
  usedMargin: z.number().finite().optional(),
  unrealizedPnl: z.number().finite().optional(),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
});
export type BingxBalanceSnapshot = z.infer<typeof bingxBalanceSnapshotSchema>;

export const bingxPositionSnapshotSchema = z.object({
  positionId: z.string().min(1).max(128),
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(64),
  side: z.enum(["long", "short", "flat", "unknown"]),
  quantity: z.number().finite(),
  entryPrice: z.number().finite().optional(),
  markPrice: z.number().finite().optional(),
  liquidationPrice: z.number().finite().optional(),
  leverage: z.number().finite().optional(),
  marginMode: z.enum(["cross", "isolated", "unknown"]).optional(),
  unrealizedPnl: z.number().finite().optional(),
  realizedPnl: z.number().finite().optional(),
  notional: z.number().finite().optional(),
  stopLossPrice: z.number().finite().optional(),
  takeProfitPrice: z.number().finite().optional(),
  updatedAt: z.string().datetime().optional(),
  stale: z.boolean(),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
});
export type BingxPositionSnapshot = z.infer<typeof bingxPositionSnapshotSchema>;

export const bingxOpenOrderSnapshotSchema = z.object({
  orderId: z.string().min(1).max(128),
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(64),
  side: z.enum(["buy", "sell", "unknown"]),
  type: z.enum([
    "market",
    "limit",
    "stop",
    "take_profit",
    "stop_market",
    "take_profit_market",
    "unknown",
  ]),
  price: z.number().finite().optional(),
  stopPrice: z.number().finite().optional(),
  triggerPrice: z.number().finite().optional(),
  originalQuantity: z.number().finite().optional(),
  executedQuantity: z.number().finite().optional(),
  remainingQuantity: z.number().finite().optional(),
  reduceOnly: z.boolean().optional(),
  status: z.enum([
    "open",
    "partially_filled",
    "filled",
    "cancelled",
    "expired",
    "rejected",
    "unknown",
  ]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  stale: z.boolean(),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
});
export type BingxOpenOrderSnapshot = z.infer<typeof bingxOpenOrderSnapshotSchema>;

export const bingxOrderHistoryItemSchema = z.object({
  orderId: z.string().min(1).max(128),
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(64),
  side: z.enum(["buy", "sell", "unknown"]),
  type: z.string().min(1).max(64),
  status: z.string().min(1).max(64),
  price: z.number().finite().optional(),
  averagePrice: z.number().finite().optional(),
  originalQuantity: z.number().finite().optional(),
  executedQuantity: z.number().finite().optional(),
  reduceOnly: z.boolean().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
});
export type BingxOrderHistoryItem = z.infer<typeof bingxOrderHistoryItemSchema>;

export const bingxFillSnapshotSchema = z.object({
  fillId: z.string().min(1).max(128),
  orderRef: z.string().min(1).max(128).optional(),
  accountId: z.string().min(1).max(64),
  symbol: z.string().min(1).max(64),
  side: z.enum(["buy", "sell", "unknown"]),
  price: z.number().finite(),
  quantity: z.number().finite(),
  fee: z.number().finite().optional(),
  feeAsset: z.string().max(32).optional(),
  realizedPnl: z.number().finite().optional(),
  timestamp: z.string().datetime(),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
});
export type BingxFillSnapshot = z.infer<typeof bingxFillSnapshotSchema>;

export const bingxPermissionsClassificationSchema = z.enum([
  "read_only",
  "trading_capable",
  "unknown",
  "insufficient",
]);
export type BingxPermissionsClassification = z.infer<
  typeof bingxPermissionsClassificationSchema
>;

export const bingxAccountHealthSchema = z.object({
  status: z.enum(["healthy", "degraded", "error", "unavailable"]),
  connected: z.boolean(),
  configured: z.boolean(),
  permissionsClassification: bingxPermissionsClassificationSchema,
  lastValidatedAt: z.string().datetime().optional(),
  lastSyncAt: z.string().datetime().optional(),
  sourceAgeMs: z.number().int().nonnegative().optional(),
  stale: z.boolean(),
  clockDriftMs: z.number().finite().optional(),
  errorCode: z.string().max(128).optional(),
  warnings: z.array(z.string().max(280)).max(32),
});
export type BingxAccountHealth = z.infer<typeof bingxAccountHealthSchema>;

export const bingxSafeConnectionStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  enabled: z.boolean(),
  readOnlyMode: z.literal(true),
  permissionsClassification: bingxPermissionsClassificationSchema,
  lastValidatedAt: z.string().datetime().optional(),
  errorCode: z.string().max(128).optional(),
  apiKeyMasked: z.string().max(64).optional(),
  accountMode: bingxAccountModeSchema,
  mentorEligible: z.literal(false),
  aiConsumptionEnabled: z.literal(false),
});
export type BingxSafeConnectionStatus = z.infer<
  typeof bingxSafeConnectionStatusSchema
>;

export const bingxTradingActionEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
  type: bingxTradingActionTypeSchema,
  confidence: bingxEventConfidenceSchema,
  symbol: z.string().max(64).optional(),
  /** Hedge-aware position side when known from reconciliation. */
  positionSide: z.enum(["long", "short", "unknown"]).optional(),
  summary: z.string().min(1).max(280),
  capturedAt: z.string().datetime(),
  exchangeTimestamp: z.string().datetime().optional(),
  accountId: z.string().min(1).max(64),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
  mentorEligible: z.literal(false),
  aiConsumptionEnabled: z.literal(false),
  reconciliationVersion: z.number().int().nonnegative(),
});
export type BingxTradingActionEvent = z.infer<typeof bingxTradingActionEventSchema>;

export const bingxReconciliationResultSchema = z.object({
  version: z.number().int().nonnegative(),
  previousCapturedAt: z.string().datetime().optional(),
  currentCapturedAt: z.string().datetime(),
  events: z.array(bingxTradingActionEventSchema).max(500),
  uncertain: z.boolean(),
  notes: z.array(z.string().max(280)).max(32),
});
export type BingxReconciliationResult = z.infer<
  typeof bingxReconciliationResultSchema
>;

export const bingxAccountSnapshotSchema = z.object({
  accountId: z.string().min(1).max(64),
  connectionId: z.string().min(1).max(128).optional(),
  exchange: z.literal("bingx"),
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
  completeness: bingxCompletenessSchema,
  health: bingxAccountHealthSchema,
  balances: z.array(bingxBalanceSnapshotSchema).max(64),
  positions: z.array(bingxPositionSnapshotSchema).max(200),
  openOrders: z.array(bingxOpenOrderSnapshotSchema).max(500),
  recentOrders: z.array(bingxOrderHistoryItemSchema).max(200),
  recentFills: z.array(bingxFillSnapshotSchema).max(500),
  capturedAt: z.string().datetime(),
  sourceAgeMs: z.number().int().nonnegative(),
  reconciliation: bingxReconciliationResultSchema.optional(),
  mentorEligible: z.literal(false),
  aiConsumptionEnabled: z.literal(false),
  canUseForMentor: z.literal(false),
  canUseForLearning: z.literal(false),
});
export type BingxAccountSnapshot = z.infer<typeof bingxAccountSnapshotSchema>;

/** Future AI-safe context — not wired to chat / MarketSnapshot / Decision Graph. */
export const traderActionContextSchema = z.object({
  accountMode: bingxAccountModeSchema,
  source: bingxAccountSourceSchema,
  currentExposure: z
    .object({
      positionCount: z.number().int().nonnegative(),
      grossNotional: z.number().finite().optional(),
      netUnrealizedPnl: z.number().finite().optional(),
    })
    .optional(),
  positionState: z.array(bingxPositionSnapshotSchema).max(50).optional(),
  recentActionEvents: z.array(bingxTradingActionEventSchema).max(50).optional(),
  openRiskSummary: z
    .object({
      openOrderCount: z.number().int().nonnegative(),
      hasStopObserved: z.boolean().optional(),
      hasTakeProfitObserved: z.boolean().optional(),
    })
    .optional(),
  lastConfirmedActionAt: z.string().datetime().optional(),
  dataQuality: bingxCompletenessSchema,
  stalenessMs: z.number().int().nonnegative().optional(),
  mentorEligible: z.literal(false),
  aiConsumptionEnabled: z.literal(false),
  canUseBingxAccountForMentor: z.literal(false),
  canUseBingxActionsForLearning: z.literal(false),
});
export type TraderActionContext = z.infer<typeof traderActionContextSchema>;

export const BINGX_UI_BADGES = [
  "BINGX REAL",
  "READ ONLY",
  "NOT CONNECTED TO AI",
] as const;

export function canUseBingxAccountForMentor(): false {
  return false;
}

export function canUseBingxActionsForLearning(): false {
  return false;
}
