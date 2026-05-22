import type { BingxCallbackResult, BingxLoginStatusResponse } from "./brokerTypes";
import {
  getLiveTradingEnvFlags,
  isApiConnectionEnabled,
  isBingxMarketOrdersAllowed,
  isKillSwitchActive,
} from "../execution/riskGuard";

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

export function isBingxBrokerLoginAvailable(): boolean {
  return (
    envBool("BINGX_ENABLE_BROKER_LOGIN", false) &&
    Boolean(process.env.BINGX_BROKER_LOGIN_URL?.trim())
  );
}

export function getBingxBrokerLoginUrl(): string | null {
  if (!isBingxBrokerLoginAvailable()) return null;
  return process.env.BINGX_BROKER_LOGIN_URL!.trim();
}

export function isBingxBrokerLoginDemoAvailable(): boolean {
  return envBool("BINGX_ENABLE_BROKER_LOGIN_DEMO", false);
}

export function isBingxLiveTradingEnabled(): boolean {
  return envBool("BINGX_ENABLE_LIVE_TRADING", false);
}

export function getBingxCallbackUrl(): string | null {
  const url = process.env.BINGX_BROKER_CALLBACK_URL?.trim();
  return url || null;
}

export function getBingxLoginStatus(): BingxLoginStatusResponse {
  const brokerLoginAvailable = isBingxBrokerLoginAvailable();
  const brokerLoginUrl = getBingxBrokerLoginUrl();
  const demoAvailable = isBingxBrokerLoginDemoAvailable();
  const liveTradingEnabled = isBingxLiveTradingEnabled();

  const message = brokerLoginAvailable
    ? "BingX broker login is available."
    : "BingX broker login is prepared but not available yet.";

  const flags = getLiveTradingEnvFlags();

  return {
    exchange: "bingx",
    brokerLoginAvailable,
    brokerLoginUrl,
    callbackUrl: getBingxCallbackUrl(),
    demoAvailable,
    liveTradingEnabled,
    apiConnectionEnabled: isApiConnectionEnabled(),
    liveExecutionFlags: {
      liveTradingEnabled: flags.liveTradingEnabled,
      apiTradingEnabled: flags.apiTradingEnabled,
      orderSubmitEnabled: flags.orderSubmitEnabled,
      marketOrdersAllowed: isBingxMarketOrdersAllowed(),
      killSwitchActive: isKillSwitchActive(),
    },
    message,
  };
}

/**
 * Placeholder for official BingX broker login callback.
 * No token processing implemented yet.
 */
export function handleBingxBrokerCallback(
  query: Record<string, string | string[] | undefined>,
): BingxCallbackResult {
  const hasParams = Object.keys(query).length > 0;

  if (!hasParams) {
    return {
      success: false,
      code: "BROKER_CALLBACK_NOT_CONFIGURED",
      message: "BingX broker callback is not configured yet.",
    };
  }

  const redirectUrl = "/?broker=bingx&connection=callback_received";

  return {
    success: true,
    message:
      "Broker login callback received. Official token exchange is not implemented in this phase.",
    redirectUrl,
  };
}
