import type { PaperOrderIntent, PaperOrderPreview, PaperOrderType } from "./paperTypes";
import { readLeverage, readOrderPrice, readOrderSize } from "./paperNormalize";
import { getPaperState } from "./paperStore";

export function parseIntent(
  body: Partial<PaperOrderIntent>,
): { intent: PaperOrderIntent } | { error: string; code: string } {
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  if (!symbol) return { error: "Symbol is required", code: "PAPER_ORDER_REJECTED" };
  if (body.side !== "long" && body.side !== "short") {
    return { error: "Invalid side (long or short)", code: "PAPER_ORDER_REJECTED" };
  }
  if (body.type !== "market" && body.type !== "limit") {
    return { error: "Invalid order type", code: "PAPER_ORDER_REJECTED" };
  }

  const sizeStr = readOrderSize(body.size);
  if (!sizeStr) return { error: "Invalid size", code: "PAPER_ORDER_REJECTED" };
  const size = Number(sizeStr);
  if (!Number.isFinite(size) || size <= 0) {
    return { error: "Invalid size", code: "PAPER_ORDER_REJECTED" };
  }

  const state = getPaperState();
  const settings = state.settings;
  const leverage = readLeverage(body.leverage, settings.defaultLeverage);
  if (leverage > settings.maxLeverage) {
    return {
      error: `Leverage exceeds paper max (${settings.maxLeverage}x)`,
      code: "PAPER_ORDER_REJECTED",
    };
  }

  if (body.type === "limit") {
    const px = readOrderPrice(body.price);
    if (!px || Number(px) <= 0) {
      return { error: "Limit price is required", code: "PAPER_ORDER_REJECTED" };
    }
  }
  if (body.type === "market" && !settings.allowMarketOrders) {
    return { error: "Market orders disabled in paper settings", code: "PAPER_ORDER_REJECTED" };
  }
  if (body.type === "limit" && !settings.allowLimitOrders) {
    return { error: "Limit orders disabled in paper settings", code: "PAPER_ORDER_REJECTED" };
  }

  return {
    intent: {
      symbol,
      side: body.side,
      type: body.type,
      price: body.type === "limit" ? readOrderPrice(body.price) : undefined,
      size: sizeStr,
      sizeUnit: body.sizeUnit ?? "USDT",
      leverage: String(leverage),
      marginMode:
        body.marginMode === "cross"
          ? "cross"
          : body.marginMode === "isolated"
            ? "isolated"
            : settings.defaultMarginMode,
      reduceOnly: Boolean(body.reduceOnly),
      postOnly: Boolean(body.postOnly),
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
    },
  };
}

export function calculateEstimatedNotional(
  intent: PaperOrderIntent,
  markPrice: number,
): number | null {
  const size = Number(intent.size);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (intent.sizeUnit === "USDT") return size;
  if (intent.sizeUnit === "BTC") return size * markPrice;
  if (intent.sizeUnit === "%") {
    const balance = getPaperState().account.balanceUsdt;
    return (balance * size) / 100;
  }
  return null;
}

export function calculateRequiredMargin(notional: number, leverage: number): number {
  if (leverage <= 0) return notional;
  return notional / leverage;
}

export function estimateFillPrice(
  markPrice: number,
  side: PaperOrderIntent["side"],
  type: PaperOrderType,
  limitPrice?: number,
): number {
  const { slippageBps } = getPaperState().settings;
  if (type === "limit" && limitPrice != null && Number.isFinite(limitPrice)) {
    return limitPrice;
  }
  const slip = slippageBps / 10_000;
  if (side === "long") return markPrice * (1 + slip);
  return markPrice * (1 - slip);
}

export function estimateFeeUsdt(notional: number, type: PaperOrderType): number {
  const { makerFeeBps, takerFeeBps } = getPaperState().settings;
  const bps = type === "market" ? takerFeeBps : makerFeeBps;
  return (notional * bps) / 10_000;
}

export function validatePaperRiskUpdate(
  side: "long" | "short",
  referencePrice: number,
  stopLoss: number | null,
  takeProfit: number | null,
): string | null {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return "Invalid reference price for risk validation";
  }
  if (stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0) {
    if (side === "long" && stopLoss >= referencePrice) {
      return "For a long position, stop loss must be below price.";
    }
    if (side === "short" && stopLoss <= referencePrice) {
      return "For a short position, stop loss must be above price.";
    }
  }
  if (takeProfit != null && Number.isFinite(takeProfit) && takeProfit > 0) {
    if (side === "long" && takeProfit <= referencePrice) {
      return "For a long position, take profit must be above price.";
    }
    if (side === "short" && takeProfit >= referencePrice) {
      return "For a short position, take profit must be below price.";
    }
  }
  return null;
}

export function validatePaperOrder(
  intent: PaperOrderIntent,
  markPrice: number,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const state = getPaperState();
  const settings = state.settings;

  const leverage = Number(intent.leverage);
  if (leverage > settings.maxLeverage) {
    errors.push(`Leverage exceeds paper max (${settings.maxLeverage}x)`);
  }

  const notional = calculateEstimatedNotional(intent, markPrice);
  if (notional == null || notional <= 0) {
    errors.push("Invalid size or mark price");
    return { valid: false, errors, warnings };
  }

  const fillPrice = estimateFillPrice(
    markPrice,
    intent.side,
    intent.type,
    intent.type === "limit" ? Number(intent.price) : undefined,
  );
  const notionalAtFill = calculateEstimatedNotional(intent, fillPrice) ?? notional;
  const margin = calculateRequiredMargin(notionalAtFill, leverage);
  const fee = estimateFeeUsdt(notionalAtFill, intent.type);
  const account = state.account;

  if (margin + fee > account.availableMarginUsdt) {
    errors.push("Insufficient paper margin for this order (incl. fee)");
  } else if (margin + fee > account.availableMarginUsdt * 0.9) {
    warnings.push("Order uses most of available paper margin");
  }

  if (intent.type === "limit") {
    const px = Number(intent.price);
    if (!Number.isFinite(px) || px <= 0) {
      errors.push("Limit price is required");
    }
  }

  const sl =
    intent.stopLoss != null && intent.stopLoss !== "" ? Number(intent.stopLoss) : null;
  const tp =
    intent.takeProfit != null && intent.takeProfit !== "" ? Number(intent.takeProfit) : null;
  if (sl != null && Number.isFinite(sl) && sl > 0) {
    if (intent.side === "long" && sl >= fillPrice) {
      errors.push("For a long, SL must be below entry.");
    }
    if (intent.side === "short" && sl <= fillPrice) {
      errors.push("For a short, SL must be above entry.");
    }
  }
  if (tp != null && Number.isFinite(tp) && tp > 0) {
    if (intent.side === "long" && tp <= fillPrice) {
      errors.push("For a long, TP must be above entry.");
    }
    if (intent.side === "short" && tp >= fillPrice) {
      errors.push("For a short, TP must be below entry.");
    }
  }

  if (intent.type === "market" && settings.slippageBps > 0) {
    warnings.push(`Est. slippage ${settings.slippageBps} bps on market fill`);
  }
  if (fee > 0) {
    warnings.push(`Est. fee ${fee.toFixed(4)} USDT`);
  }

  warnings.push("Paper trading only — no real funds at risk.");
  warnings.push("Simulated execution — not sent to any exchange.");

  return { valid: errors.length === 0, errors, warnings };
}

export function isPaperRiskLevelError(message: string): boolean {
  return (
    message.startsWith("For a long, SL") ||
    message.startsWith("For a long, TP") ||
    message.startsWith("For a short, SL") ||
    message.startsWith("For a short, TP")
  );
}

export function paperSubmitErrorCode(errors: string[]): string {
  if (errors.length > 0 && errors.every(isPaperRiskLevelError)) {
    return "INVALID_PAPER_RISK_LEVELS";
  }
  return "PAPER_ORDER_REJECTED";
}

export function buildPreview(intent: PaperOrderIntent, markPrice: number): PaperOrderPreview {
  const { warnings } = validatePaperOrder(intent, markPrice);
  const fillPrice = estimateFillPrice(
    markPrice,
    intent.side,
    intent.type,
    intent.type === "limit" ? Number(intent.price) : undefined,
  );
  const notional = calculateEstimatedNotional(intent, fillPrice);
  const leverage = Number(intent.leverage);
  const settings = getPaperState().settings;
  const sl =
    intent.stopLoss != null && intent.stopLoss !== "" ? Number(intent.stopLoss) : null;
  const tp =
    intent.takeProfit != null && intent.takeProfit !== "" ? Number(intent.takeProfit) : null;
  let estimatedRiskUsdt: number | null = null;
  let estimatedRewardUsdt: number | null = null;
  let riskRewardRatio: number | null = null;
  if (sl != null && Number.isFinite(sl) && notional != null && fillPrice > 0) {
    const qty = notional / fillPrice;
    const riskPerUnit =
      intent.side === "long" ? fillPrice - sl : sl - fillPrice;
    if (riskPerUnit > 0) {
      estimatedRiskUsdt = riskPerUnit * qty;
      if (tp != null && Number.isFinite(tp)) {
        const rewardPerUnit =
          intent.side === "long" ? tp - fillPrice : fillPrice - tp;
        if (rewardPerUnit > 0) {
          estimatedRewardUsdt = rewardPerUnit * qty;
          riskRewardRatio =
            estimatedRiskUsdt > 0
              ? Math.round((estimatedRewardUsdt / estimatedRiskUsdt) * 100) / 100
              : null;
        }
      }
    }
  }

  return {
    symbol: intent.symbol,
    side: intent.side,
    type: intent.type,
    size: intent.size,
    sizeUnit: intent.sizeUnit,
    price: intent.type === "limit" ? intent.price : undefined,
    leverage: intent.leverage,
    marginMode: intent.marginMode,
    estimatedNotional: notional,
    estimatedMargin: notional != null ? calculateRequiredMargin(notional, leverage) : null,
    estimatedFee: notional != null ? estimateFeeUsdt(notional, intent.type) : null,
    estimatedSlippageBps: intent.type === "market" ? settings.slippageBps : 0,
    fillPriceEstimate: fillPrice,
    markPrice,
    estimatedRiskUsdt,
    estimatedRewardUsdt,
    riskRewardRatio,
    warnings,
  };
}
