/**
 * AI-8.1.1 — Sanitized TradeDecisionExport/v1.
 * Never commit export artifacts to git. No secrets / raw BingX / full MS/DG.
 */
import type { TradeDecision } from "@shared/goodTradingAiDecisionContext";

export const TRADE_DECISION_EXPORT_VERSION = "TradeDecisionExport/v1" as const;

export type TradeDecisionExportV1 = {
  schemaVersion: typeof TRADE_DECISION_EXPORT_VERSION;
  exportedAt: string;
  decisionId: string;
  userId: number;
  accountId: string;
  symbol: string;
  positionSide: string;
  accountMode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  context: TradeDecision["context"];
  timeline: TradeDecision["timeline"];
  journal: TradeDecision["journal"];
  mentorEligible: false;
  brainMutate: false;
  learning: false;
  autoApply: false;
};

export function buildTradeDecisionExport(
  decision: TradeDecision,
  nowIso = new Date().toISOString(),
): TradeDecisionExportV1 {
  const positionSide =
    (decision as TradeDecision & { positionSide?: string }).positionSide ?? "unknown";
  return {
    schemaVersion: TRADE_DECISION_EXPORT_VERSION,
    exportedAt: nowIso,
    decisionId: decision.decisionId,
    userId: decision.userId,
    accountId: decision.accountId,
    symbol: decision.symbol,
    positionSide,
    accountMode: decision.accountMode,
    status: decision.status,
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
    closedAt: decision.closedAt,
    context: structuredClone(decision.context),
    timeline: structuredClone(decision.timeline),
    journal: structuredClone(decision.journal),
    mentorEligible: false,
    brainMutate: false,
    learning: false,
    autoApply: false,
  };
}

export function assertExportSanitized(exportDoc: TradeDecisionExportV1): void {
  const dump = JSON.stringify(exportDoc);
  if (/apiSecret|api_secret|privateKey|Authorization|Bearer\s/i.test(dump)) {
    throw new Error("EXPORT_CONTAINS_SECRET_PATTERN");
  }
  if (/"rawPayload"|"rawBingx"|"orderBook"|openai|bookmap/i.test(dump)) {
    throw new Error("EXPORT_CONTAINS_FORBIDDEN_PAYLOAD");
  }
}
