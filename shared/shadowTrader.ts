import { z } from "zod";

export const shadowDirectionSchema = z.enum(["FLAT", "LONG", "SHORT"]);
export type ShadowDirection = z.infer<typeof shadowDirectionSchema>;
export const shadowActionSchema = z.enum(["NO_TRADE", "ENTER_LONG", "ENTER_SHORT", "HOLD", "EXIT"]);
export type ShadowAction = z.infer<typeof shadowActionSchema>;

export type ShadowPosition = { direction: ShadowDirection; quantity: number; entryPrice: number | null; entryTime: string | null; entryDecisionId: string | null; invalidation: number | null; realizedPnl: number };
export type ShadowTrade = { shadowTradeId: string; entryDecisionId: string; exitDecisionId: string | null; direction: "LONG" | "SHORT"; entryTime: string; entryPrice: number; exitTime: string | null; exitPrice: number | null; realizedPnl: number | null; status: "OPEN" | "CLOSED" };

export const shadowSessionStatusSchema = z.enum(["CREATED", "RUNNING", "PAUSED", "STOPPED", "FAILED"]);
export type ShadowSessionStatus = z.infer<typeof shadowSessionStatusSchema>;

export type ShadowEvidence = {
  capturedAt: string;
  instrument: "BTCUSDT";
  venue: "Binance";
  marketType: "Perpetual";
  source: "GoodTrading.buildLiveMarketContext";
  evidenceHash: string;
  bbo: { bid: number | null; ask: number | null; capturedAt: string; quality: "VALID" | "STALE" | "UNAVAILABLE" | "DEGRADED" };
  capabilities: Record<string, { status: string; asOf: string | null; quality: string }>;
};

export type ShadowJournalEntry = {
  decisionId: string; sessionId: string; cycleId: string; requestId: string; timestamp: string; marketCapturedAt: string; instrument: "BTCUSDT"; venue: "Binance"; marketType: "Perpetual";
  action: ShadowAction; thesis: string; keyEvidence: string[]; contradictions: string[]; invalidation: number | null;
  horizon: string; dataLimitations: string[]; provider: string; model: string; evidenceRef: string; evidenceHash: string;
  accepted: boolean; rejectionReason: string | null; positionBefore: ShadowPosition; positionAfter: ShadowPosition; trade: ShadowTrade | null;
};

export type ShadowAuthoritySnapshot = { capturedAt: string; epoch: string; paperSubmit: number; nautilusMutation: number; liveSubmit: number; brokerSubmit: number };
export type ShadowAuthorityAudit = { baseline: ShadowAuthoritySnapshot; final?: ShadowAuthoritySnapshot; delta?: { paperSubmit: number; nautilusMutation: number; liveSubmit: number; brokerSubmit: number } };

export type ShadowTraderMode = "SHADOW" | "PAPER_AUTONOMOUS";
export type ShadowTraderSession = {
  sessionId: string; ownerUserId: number; instrument: "BTCUSDT"; venue?: "Binance"; marketType?: "Perpetual"; startedAt: string; endedAt: string | null;
  mode?: ShadowTraderMode; status: ShadowSessionStatus; provider: string; model: string; quality: "LOW" | "MID" | "HIGH"; cadenceMs: number;
  risk: { maxExposure: number; maxSessionLoss: number; cooldownMs: number; requireInvalidation: boolean };
  riskConfig?: import("./autonomousPaper").PaperRiskConfig; paperSimulationSessionId?: string | null;
  position: ShadowPosition; trades: ShadowTrade[]; journal: ShadowJournalEntry[]; decisionCount: number;
  executionIntentCount?: number; executedOrderCount?: number; lastExecutionAt?: string | null;
  currentCanonicalPaperPosition?: Record<string, unknown> | null; latestExecution?: import("./autonomousPaper").PaperExecutionEvidence | null;
  lastDecisionAt: string | null; lastMarketCapturedAt: string | null; nextEvaluationAt: string | null;
  failureReason: string | null; authorityAudit?: ShadowAuthorityAudit; updatedAt: string;
};

export type ShadowDecisionPayload = {
  action: ShadowAction; thesis: string; keyEvidence: string[]; contradictions: string[]; invalidation: number | null;
  horizon: string; dataLimitations: string[]; targetReference?: number | null;
};
