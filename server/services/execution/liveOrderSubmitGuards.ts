import type { LiveTradingReadiness } from "./liveTradingReadinessTypes";
import type { LiveOrderPreviewResult } from "./liveOrderPreviewTypes";
import type { LiveOrderSubmitRequest } from "./liveOrderSubmitTypes";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";
import type { LiveTradingGuardResult } from "./liveTradingGuard";
import {
  isApiTradingEnabled,
  isBingxMarketOrdersAllowed,
  isKillSwitchActive,
  isLiveLimitTestMode,
  isLiveTradingEnabled,
  isOrderSubmitEnabled,
} from "./riskGuard";

export function validateLiveSubmitShape(
  request: LiveOrderSubmitRequest,
): string[] {
  const blockers: string[] = [];
  const testMode = isLiveLimitTestMode();

  if (request.exchange !== "bingx") {
    blockers.push("Only BingX exchange is supported.");
  }
  if (request.type !== "limit") {
    blockers.push("Only limit orders are allowed for live submit.");
  }
  if (!request.symbol?.trim()) blockers.push("symbol is required");
  if (request.side !== "buy" && request.side !== "sell") {
    blockers.push("side must be buy or sell");
  }
  if (!Number.isFinite(request.limitPrice) || request.limitPrice <= 0) {
    blockers.push("limitPrice must be > 0");
  }

  // In test mode, SL is optional (warning only)
  if (!testMode) {
    if (!Number.isFinite(request.stopLossPrice) || request.stopLossPrice <= 0) {
      blockers.push("Stop loss is required for live orders.");
    }
  }

  const hasQty =
    request.quantity != null &&
    Number.isFinite(request.quantity) &&
    request.quantity > 0;
  const hasNotional =
    request.notionalUsdt != null &&
    Number.isFinite(request.notionalUsdt) &&
    request.notionalUsdt > 0;
  const hasMargin =
    request.marginUsdt != null &&
    Number.isFinite(request.marginUsdt) &&
    request.marginUsdt > 0;

  if (request.sizingMode === "margin") {
    if (!hasMargin) {
      blockers.push("Margin USDT is required for margin sizing.");
    }
    if (request.leverage == null || !Number.isFinite(request.leverage) || request.leverage <= 0) {
      blockers.push("Leverage is required for margin sizing.");
    }
  } else {
    if (!hasQty && !hasNotional) {
      blockers.push("quantity or notionalUsdt is required");
    }
  }

  return blockers;
}

export function validateNonMarketableOrder(
  side: "buy" | "sell",
  limitPrice: number,
  markPrice?: number,
): string[] {
  const blockers: string[] = [];

  if (markPrice == null || !Number.isFinite(markPrice) || markPrice <= 0) {
    // Cannot validate without mark price - skip non-marketable check
    return blockers;
  }

  console.log("[non-marketable-check-submit]", {
    side,
    limitPrice,
    markPrice,
  });

  if (side === "buy" && limitPrice >= markPrice) {
    blockers.push(`BUY LIMIT ${limitPrice} is marketable at reference ${markPrice}. Use price below spot.`);
  }

  if (side === "sell" && limitPrice <= markPrice) {
    blockers.push(`SELL LIMIT ${limitPrice} is marketable at reference ${markPrice}. Use price above spot.`);
  }

  return blockers;
}

/**
 * Helper to identify critical BingX live blockers vs artificial risk guards.
 * In BingX-like mode, only critical blockers should block; artificial guards become warnings.
 */
export function isCriticalBingXLiveBlocker(message: string): boolean {
  const criticalPatterns = [
    "kill switch",
    "not ready_for_live",
    "not secure api",
    "trading permission",
    "credentials",
    "market order",
    "type must be limit",
    "invalid side",
    "invalid limit price",
    "invalid quantity",
    "invalid margin",
    "invalid leverage",
    "marketable",
    "confirmation",
    "connection",
    "permission",
  ];
  
  // Artificial patterns that should NOT be critical
  const artificialPatterns = [
    "max account risk",
    "account risk",
    "max_order_notional",
    "effective notional",
    "stop loss",
    "sl",
    "symbol rules",
    "quantity validation",
    "minqty",
    "minnotional",
    "risk cap",
    "internal risk",
    "risk guard",
    "bingx minimum order size",
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // If it matches an artificial pattern, it's not critical
  if (artificialPatterns.some((pattern) => lowerMessage.includes(pattern))) {
    return false;
  }
  
  // Otherwise, check if it matches critical patterns
  return criticalPatterns.some((pattern) => lowerMessage.includes(pattern));
}

export function validateLiveSubmitConfirmation(
  request: LiveOrderSubmitRequest,
): string[] {
  if (request.confirmationText.trim() !== LIVE_LIMIT_CONFIRMATION_TEXT) {
    return ["Confirmation text must match exactly: CONFIRM LIVE LIMIT"];
  }
  return [];
}

export function validateLiveSubmitEnvFlags(): string[] {
  const blockers: string[] = [];
  if (!isLiveTradingEnabled()) {
    blockers.push("BINGX_ENABLE_LIVE_TRADING=false");
  }
  if (!isApiTradingEnabled()) {
    blockers.push("BINGX_ENABLE_API_TRADING=false");
  }
  if (!isOrderSubmitEnabled()) {
    blockers.push("BINGX_ENABLE_ORDER_SUBMIT=false");
  }
  if (isBingxMarketOrdersAllowed()) {
    blockers.push("BINGX_ALLOW_MARKET_ORDERS=true");
  }
  if (isKillSwitchActive()) {
    blockers.push("Live trading kill switch is active.");
  }
  return blockers;
}

export function validateLiveSubmitReadiness(
  readiness: Pick<LiveTradingReadiness, "status" | "readyForLive" | "blockers">,
): string[] {
  if (readiness.status === "ready_for_live" && readiness.readyForLive) {
    return [];
  }
  return [
    "Live readiness: not ready_for_live",
    ...readiness.blockers.slice(0, 6),
  ];
}

export function validateLiveSubmitPreviewRisk(
  preview: Pick<LiveOrderPreviewResult, "blocked" | "validated" | "blockers"> & {
    risk: Pick<LiveOrderPreviewResult["risk"], "riskGuardPassed">;
  },
): string[] {
  const testMode = isLiveLimitTestMode();

  // In test mode, relax risk guard checks
  if (testMode) {
    // Only block for truly fatal errors, not artificial risk limits or symbol rules
    const fatalBlockers = preview.blockers.filter((b) =>
      b.includes("kill switch") ||
      b.includes("not ready_for_live") ||
      b.includes("market") ||
      b.includes("connection") ||
      b.includes("credentials") ||
      b.includes("permission") ||
      b.includes("marketable")
    );
    return fatalBlockers;
  }

  if (!preview.blocked && preview.validated && preview.risk.riskGuardPassed) {
    return [];
  }
  return preview.blockers.length
    ? preview.blockers
    : ["Risk guard failed"];
}

export function mergeGuardBlockers(guard: LiveTradingGuardResult): string[] {
  return guard.allowed ? [] : guard.blockers;
}
