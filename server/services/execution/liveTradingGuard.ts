import {
  BINGX_READ_ONLY_FREEZE_CODE,
  isBingxReadOnlyFreezeActive,
  getLiveTradingEnvFlags,
  isApiTradingEnabled,
  isBingxMarketOrdersAllowed,
  isKillSwitchActive,
  isLiveTradingEnabled,
  isOrderCancelEnabled,
  isOrderSubmitEnabled,
  isPositionCloseEnabled,
} from "./riskGuard";

export type LiveTradingAction =
  | "submit_order"
  | "cancel_order"
  | "close_position"
  | "modify_order";

export type LiveTradingGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "LIVE_TRADING_BLOCKED";
      message: string;
      action: LiveTradingAction;
      blockers: string[];
    };

function buildBlockers(action: LiveTradingAction): string[] {
  const flags = getLiveTradingEnvFlags();
  const blockers: string[] = [];

  if (!flags.liveTradingEnabled) {
    blockers.push("BINGX_ENABLE_LIVE_TRADING=false");
  }
  if (!flags.apiTradingEnabled) {
    blockers.push("BINGX_ENABLE_API_TRADING=false");
  }

  if (action === "submit_order" || action === "modify_order") {
    if (!flags.orderSubmitEnabled) {
      blockers.push("BINGX_ENABLE_ORDER_SUBMIT=false");
    }
  }
  if (action === "cancel_order") {
    if (!flags.orderCancelEnabled) {
      blockers.push("BINGX_ENABLE_ORDER_CANCEL=false");
    }
  }
  if (action === "close_position") {
    if (!flags.positionCloseEnabled) {
      blockers.push("BINGX_ENABLE_POSITION_CLOSE=false");
    }
  }
  if (action === "modify_order" && !flags.orderSubmitEnabled) {
    blockers.push("BINGX_ENABLE_ORDER_SUBMIT=false");
  }

  return blockers;
}

export function checkLiveMarketOrderAllowed(): LiveTradingGuardResult {
  if (!isBingxMarketOrdersAllowed()) {
    return { allowed: true };
  }
  return {
    allowed: false,
    code: "LIVE_TRADING_BLOCKED",
    message:
      "Live market orders are disabled in this phase. Use limit orders only.",
    action: "submit_order",
    blockers: ["BINGX_ALLOW_MARKET_ORDERS=true"],
  };
}

export function checkLiveTradingActionAllowed(
  action: LiveTradingAction,
): LiveTradingGuardResult {
  if (isBingxReadOnlyFreezeActive()) {
    return {
      allowed: false,
      code: "LIVE_TRADING_BLOCKED",
      message: "BingX live execution is frozen during read-only stabilization.",
      action,
      blockers: [BINGX_READ_ONLY_FREEZE_CODE],
    };
  }

  if (isKillSwitchActive()) {
    return {
      allowed: false,
      code: "LIVE_TRADING_BLOCKED",
      message: "Live trading kill switch is active.",
      action,
      blockers: ["LIVE_TRADING_KILL_SWITCH=true"],
    };
  }

  const blockers = buildBlockers(action);
  if (blockers.length === 0) {
    return { allowed: true };
  }

  const actionLabel = action.replace(/_/g, " ");
  return {
    allowed: false,
    code: "LIVE_TRADING_BLOCKED",
    message: `Live ${actionLabel} is blocked by server configuration.`,
    action,
    blockers,
  };
}

/** Throws when live action is not permitted by env flags. */
export function assertLiveTradingAllowed(action: LiveTradingAction): void {
  const result = checkLiveTradingActionAllowed(action);
  if (!result.allowed) {
    const err = new Error(result.message);
    (err as Error & { code: string; blockers: string[]; action: LiveTradingAction }).code =
      result.code;
    (err as Error & { blockers: string[] }).blockers = result.blockers;
    (err as Error & { action: LiveTradingAction }).action = action;
    throw err;
  }
}

/** Convenience for routes — mirrors env flag getters used in readiness. */
export function liveTradingFlagsSnapshot() {
  return {
    live: isLiveTradingEnabled(),
    apiTrading: isApiTradingEnabled(),
    orderSubmit: isOrderSubmitEnabled(),
    orderCancel: isOrderCancelEnabled(),
    positionClose: isPositionCloseEnabled(),
  };
}
