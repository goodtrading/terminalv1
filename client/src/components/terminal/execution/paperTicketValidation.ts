import {
  DEFAULT_CHART_SYMBOL,
  DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  EXECUTION_MAPPING_MISSING_MESSAGE,
  resolveExecutionSymbolForChart,
} from "./executionContext";
import { PAPER_NO_PRICE_MESSAGE } from "./paperEntryPrice";
import {
  LIVE_TRADING_LOCKED_MESSAGE,
  PAPER_RISK_GUARD_POLICY,
  paperMaxLeverage,
} from "./paperRiskGuardConfig";
import type { PaperTradingSettings } from "./executionTypes";
import {
  buildPaperSubmitRiskPayload,
  validatePaperTicketRisk,
} from "./paperRiskValidation";

export type PaperTicketOrderType = "market" | "limit";

export interface PaperTicketValidateInput {
  side: "long" | "short";
  orderType: PaperTicketOrderType;
  notionalUsdt: number;
  qtyBtc: number;
  leverage: number;
  estimatedEntryPrice: number | null;
  limitPrice: number | null;
  stopLossRaw: string;
  takeProfitRaw: string;
  positionNotional: number | null;
  settings?: PaperTradingSettings | null;
  liveTradingEnabled?: boolean;
  attemptLive?: boolean;
}

export function validatePaperTicketOrder(
  input: PaperTicketValidateInput,
): string | null {
  if (input.attemptLive || input.liveTradingEnabled) {
    return LIVE_TRADING_LOCKED_MESSAGE;
  }

  const ctx = DEFAULT_TERMINAL_EXECUTION_CONTEXT;
  const executionSymbol = resolveExecutionSymbolForChart(DEFAULT_CHART_SYMBOL);
  if (!executionSymbol) {
    return EXECUTION_MAPPING_MISSING_MESSAGE;
  }
  if (ctx.executionMarketType !== "perpetual") {
    return "Only BingX perpetual execution is supported.";
  }
  if (ctx.executionExchange !== "bingx") {
    return "Only BingX is configured as the execution venue.";
  }

  if (!Number.isFinite(input.notionalUsdt) || input.notionalUsdt <= 0) {
    return "Enter a valid size in USDT.";
  }
  if (!Number.isFinite(input.qtyBtc) || input.qtyBtc <= 0) {
    return "Qty BTC must be greater than zero.";
  }
  if (!Number.isFinite(input.leverage) || input.leverage <= 0) {
    return "Leverage must be greater than zero.";
  }

  const maxLev = paperMaxLeverage(input.settings);
  if (input.leverage > maxLev) {
    return `Leverage exceeds paper max (${maxLev}x).`;
  }

  const risk = buildPaperSubmitRiskPayload(
    input.stopLossRaw,
    input.takeProfitRaw,
  );
  if (risk.error) return risk.error;

  const ref =
    input.orderType === "limit"
      ? input.limitPrice
      : input.estimatedEntryPrice;

  if (input.orderType === "limit") {
    if (ref == null || ref <= 0) {
      return "Limit orders require a positive limit price.";
    }
  } else if (ref == null || ref <= 0) {
    return PAPER_NO_PRICE_MESSAGE;
  }

  if (
    input.positionNotional != null &&
    input.positionNotional > PAPER_RISK_GUARD_POLICY.maxNotionalUsdt
  ) {
    return `Notional exceeds max ${PAPER_RISK_GUARD_POLICY.maxNotionalUsdt.toLocaleString()} USDT.`;
  }

  return null;
}

/** Optional SL/TP direction check — use on submit, not for button enable. */
export function validatePaperTicketRiskLevels(
  input: Pick<
    PaperTicketValidateInput,
    "side" | "orderType" | "estimatedEntryPrice" | "limitPrice" | "stopLossRaw" | "takeProfitRaw"
  >,
): string | null {
  const risk = buildPaperSubmitRiskPayload(
    input.stopLossRaw,
    input.takeProfitRaw,
  );
  if (risk.error) return risk.error;

  const ref =
    input.orderType === "limit"
      ? input.limitPrice
      : input.estimatedEntryPrice;

  if (ref == null || ref <= 0) return null;

  return validatePaperTicketRisk(
    input.side,
    ref,
    risk.stopLoss,
    risk.takeProfit,
  );
}
