import type { LiveTradingReadiness } from "./liveTradingReadinessTypes";
import type { LiveOrderPreviewResult } from "./liveOrderPreviewTypes";
import type { LiveOrderSubmitRequest } from "./liveOrderSubmitTypes";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";
import type { LiveTradingGuardResult } from "./liveTradingGuard";
import {
  isApiTradingEnabled,
  isBingxMarketOrdersAllowed,
  isKillSwitchActive,
  isLiveTradingEnabled,
  isOrderSubmitEnabled,
} from "./riskGuard";

export function validateLiveSubmitShape(
  request: LiveOrderSubmitRequest,
): string[] {
  const blockers: string[] = [];
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
  if (!Number.isFinite(request.stopLossPrice) || request.stopLossPrice <= 0) {
    blockers.push("Stop loss is required for live orders.");
  }
  const hasQty =
    request.quantity != null &&
    Number.isFinite(request.quantity) &&
    request.quantity > 0;
  const hasNotional =
    request.notionalUsdt != null &&
    Number.isFinite(request.notionalUsdt) &&
    request.notionalUsdt > 0;
  if (!hasQty && !hasNotional) {
    blockers.push("quantity or notionalUsdt is required");
  }
  return blockers;
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
