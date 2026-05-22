import { assertNotChartVenue } from "@shared/execution/executionGuards";
import type { OrderIntent } from "./executionTypes";

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

function envNumber(key: string): number | null {
  const v = process.env[key];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function getBingxReferralUrl(): string {
  return (
    process.env.BINGX_REFERRAL_URL?.trim() ||
    "https://bingx.com/es/partner/Goodtradingacademy"
  );
}

export function isBrokerLoginAvailable(): boolean {
  const enabled = envBool("BINGX_ENABLE_BROKER_LOGIN", false);
  const url = process.env.BINGX_BROKER_LOGIN_URL?.trim();
  return enabled && Boolean(url);
}

export function getBrokerLoginUrl(): string | null {
  if (!isBrokerLoginAvailable()) return null;
  return process.env.BINGX_BROKER_LOGIN_URL!.trim();
}

export function isLiveTradingEnabled(): boolean {
  return envBool("BINGX_ENABLE_LIVE_TRADING", false);
}

export function isBrokerLoginDemoAvailable(): boolean {
  return envBool("BINGX_ENABLE_BROKER_LOGIN_DEMO", false);
}

export function isApiConnectionEnabled(): boolean {
  return envBool("BINGX_ENABLE_API_CONNECTION", true);
}

export function isApiTradingEnabled(): boolean {
  return envBool("BINGX_ENABLE_API_TRADING", false);
}

export function isOrderSubmitEnabled(): boolean {
  return envBool("BINGX_ENABLE_ORDER_SUBMIT", false);
}

export function isOrderCancelEnabled(): boolean {
  return envBool("BINGX_ENABLE_ORDER_CANCEL", false);
}

export function isPositionCloseEnabled(): boolean {
  return envBool("BINGX_ENABLE_POSITION_CLOSE", false);
}

/** Phase 5B: internal dry-run preview (never submits to exchange). */
export function isDryRunEnabled(): boolean {
  return envBool("BINGX_ENABLE_DRY_RUN", true);
}

export function getLiveTradingEnvFlags() {
  return {
    liveTradingEnabled: isLiveTradingEnabled(),
    apiTradingEnabled: isApiTradingEnabled(),
    orderSubmitEnabled: isOrderSubmitEnabled(),
    orderCancelEnabled: isOrderCancelEnabled(),
    positionCloseEnabled: isPositionCloseEnabled(),
  };
}

export function isMaxOrderSizeConfigured(): boolean {
  const n = envNumber("MAX_ORDER_NOTIONAL_USDT");
  return n != null && n > 0;
}

export function isMaxAccountRiskConfigured(): boolean {
  const n = envNumber("MAX_ACCOUNT_RISK_PCT");
  return n != null && n > 0;
}

export function isSlRequiredPolicyConfigured(): boolean {
  return envBool("REQUIRE_SL_ON_LIVE_ORDERS", true);
}

export function getRiskGuardStatus() {
  return {
    maxNotionalUsdt: envNumber("MAX_ORDER_NOTIONAL_USDT"),
    maxLeverage: envNumber("MAX_LEVERAGE"),
    confirmationRequired: envBool("REQUIRE_ORDER_CONFIRMATION", true),
    tradingLocked: !isLiveTradingEnabled(),
    liveTradingEnabled: isLiveTradingEnabled(),
    brokerLoginAvailable: isBrokerLoginAvailable(),
  };
}

export function validateOrderIntent(intent: Partial<OrderIntent>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!intent.exchange) errors.push("exchange is required");
  if (intent.exchange === "binance") {
    errors.push(
      "Binance is chart-only; orders must use the configured execution venue (BingX perpetual)",
    );
  }
  const chartVenue = assertNotChartVenue(intent.exchange, undefined);
  if (!chartVenue.ok) errors.push(chartVenue.message);
  if (!intent.symbol?.trim()) errors.push("symbol is required");
  if (!intent.side || !["long", "short"].includes(intent.side)) {
    errors.push("side must be long or short");
  }
  if (!intent.type || !["market", "limit"].includes(intent.type)) {
    errors.push("type must be market or limit");
  }
  if (!intent.size?.trim()) errors.push("size is required");
  if (intent.type === "limit" && !intent.price?.trim()) {
    errors.push("price is required for limit orders");
  }
  if (!envBool("ALLOW_MARKET_ORDERS", false) && intent.type === "market") {
    errors.push("market orders are disabled in configuration");
  }
  return { valid: errors.length === 0, errors };
}

export function checkLiveTradingEnabled(): ExecutionError | null {
  if (!isLiveTradingEnabled()) {
    return {
      code: "LIVE_TRADING_DISABLED",
      message: "Live trading is disabled. Broker execution is not enabled yet.",
    };
  }
  return null;
}

type ExecutionError = { code: string; message: string };

export function requireConfirmation(): boolean {
  return envBool("REQUIRE_ORDER_CONFIRMATION", true);
}
