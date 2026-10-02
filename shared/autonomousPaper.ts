import type { ShadowAction, ShadowDirection, ShadowPosition } from "./shadowTrader";

export type AutonomousPaperMode = "PAPER_AUTONOMOUS";
export type PaperExecutionStatus = "NOOP" | "ACKNOWLEDGED" | "REJECTED" | "AMBIGUOUS";
export type PaperBbo = { bid: number; ask: number; capturedAt: string; quality: "VALID" | "STALE" | "UNAVAILABLE" | "DEGRADED"; source?: string; ageMs?: number };
export type PaperRiskConfig = {
  fixedQuantity: string;
  maxExposure: number;
  maxSessionLoss: number;
  cooldownMs: number;
  requireInvalidation: true;
  stopLossDistance?: number;
  takeProfitDistance?: number;
};
export type PaperExecutionIntent = {
  executionIntentId: string;
  decisionId: string;
  sessionId: string;
  simulationSessionId: string;
  ownerUserId: number;
  instrument: "BTCUSDT";
  venue: "Binance";
  marketType: "Perpetual";
  action: Exclude<ShadowAction, "NO_TRADE" | "HOLD">;
  side: "BUY" | "SELL";
  quantity: string;
  referenceBbo: PaperBbo;
  invalidation: number | null;
  stopLoss: string | null;
  takeProfit: string | null;
  reduceOnly: boolean;
  createdAt: string;
  marketCapturedAt: string;
  riskPolicyVersion: "N13B-v1";
  evidenceHash: string;
  idempotencyKey: string;
};
export type PaperExecutionEvidence = {
  status: PaperExecutionStatus;
  reason: string | null;
  executionIntent: PaperExecutionIntent | null;
  simulationSessionId: string;
  orderIds: string[];
  protectionGroupId: string | null;
  response: Record<string, unknown> | null;
  reconciledPosition: Record<string, unknown> | null;
  reconciledOrders: unknown[];
};
export type AutonomousPaperSessionView = {
  mode: AutonomousPaperMode;
  paperSimulationSessionId: string;
  riskConfig: PaperRiskConfig;
  executionIntentCount: number;
  executedOrderCount: number;
  lastExecutionAt: string | null;
  currentCanonicalPaperPosition: Record<string, unknown> | null;
  latestExecution: PaperExecutionEvidence | null;
};
export type PaperPositionForGate = ShadowPosition & { direction: ShadowDirection };
