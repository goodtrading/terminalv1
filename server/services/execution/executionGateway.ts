import type {
  ExecutionStatusResponse,
  ExchangeStatusResponse,
  OrderIntent,
  OrderPreviewResult,
} from "./executionTypes";
import {
  checkLiveTradingEnabled,
  getBingxReferralUrl,
  getBrokerLoginUrl,
  getRiskGuardStatus,
  isBrokerLoginAvailable,
  isApiConnectionEnabled,
  isBrokerLoginDemoAvailable,
  isLiveTradingEnabled,
  validateOrderIntent,
} from "./riskGuard";
import { getFirstConnectedConnection } from "../exchanges/bingx/bingxCredentialStore";

export function getExchangeStatus(): ExchangeStatusResponse {
  const brokerLoginAvailable = isBrokerLoginAvailable();
  const brokerLoginUrl = getBrokerLoginUrl();
  const referralUrl = getBingxReferralUrl();
  const apiConnected = getFirstConnectedConnection();

  return {
    exchanges: [
      {
        id: "bingx",
        name: "BingX",
        status: apiConnected ? "connected" : "not_connected",
        supportsBrokerLogin: true,
        supportsTrading: true,
        tradingLocked: true,
        referralUrl,
        brokerLoginAvailable,
        brokerLoginUrl,
        demoAvailable: isBrokerLoginDemoAvailable(),
        apiConnectionEnabled: isApiConnectionEnabled(),
        readOnlyConnected: Boolean(apiConnected),
        apiKeyMasked: apiConnected?.apiKeyMasked ?? null,
      },
      {
        id: "binance",
        name: "Binance",
        status: "coming_soon",
        supportsBrokerLogin: false,
        supportsTrading: false,
        tradingLocked: true,
        brokerLoginAvailable: false,
        brokerLoginUrl: null,
      },
    ],
  };
}

export function getExecutionStatus(): ExecutionStatusResponse {
  const rg = getRiskGuardStatus();
  const apiConnected = getFirstConnectedConnection();
  const readOnly = Boolean(apiConnected);
  return {
    liveTradingEnabled: rg.liveTradingEnabled,
    connectedExchange: readOnly ? "bingx" : null,
    brokerLoginAvailable: rg.brokerLoginAvailable,
    brokerSessionRequired: true,
    demoAvailable: isBrokerLoginDemoAvailable(),
    tradingLocked: true,
    permissions: readOnly ? "read_only" : "locked",
    riskGuard: {
      maxNotionalUsdt: rg.maxNotionalUsdt,
      maxLeverage: rg.maxLeverage,
      confirmationRequired: rg.confirmationRequired,
      tradingLocked: rg.tradingLocked,
    },
  };
}

function parseEstimatedNotional(intent: OrderIntent): number | null {
  const size = Number(intent.size);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (intent.sizeUnit === "USDT") return size;
  if (intent.sizeUnit === "BTC") {
    const px = intent.price ? Number(intent.price) : null;
    if (px != null && Number.isFinite(px)) return size * px;
    return null;
  }
  return null;
}

export function previewOrder(intent: Partial<OrderIntent>): {
  success: true;
  preview: OrderPreviewResult;
} | { success: false; errors: string[] } {
  const validation = validateOrderIntent(intent);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const full = intent as OrderIntent;
  const warnings: string[] = [
    "Live trading is disabled.",
    "Broker login is required before execution.",
  ];
  const rg = getRiskGuardStatus();
  if (rg.maxNotionalUsdt != null) {
    const est = parseEstimatedNotional(full);
    if (est != null && est > rg.maxNotionalUsdt) {
      warnings.push(`Estimated notional exceeds max ${rg.maxNotionalUsdt} USDT.`);
    }
  }

  return {
    success: true,
    preview: {
      exchange: full.exchange,
      symbol: full.symbol,
      side: full.side,
      type: full.type,
      size: full.size,
      sizeUnit: full.sizeUnit,
      price: full.price,
      leverage: full.leverage,
      marginMode: full.marginMode,
      estimatedNotional: parseEstimatedNotional(full),
      warnings,
    },
  };
}

export function submitOrder(_intent: Partial<OrderIntent>) {
  const blocked = checkLiveTradingEnabled();
  if (blocked) {
    return { success: false as const, ...blocked };
  }
  return {
    success: false as const,
    code: "LIVE_TRADING_DISABLED",
    message: "Live trading is disabled. Broker execution is not enabled yet.",
  };
}

export function killSwitch() {
  const blocked = checkLiveTradingEnabled();
  if (blocked) {
    return { success: false as const, ...blocked };
  }
  return {
    success: false as const,
    code: "LIVE_TRADING_DISABLED",
    message: "Kill switch is prepared but live execution is disabled.",
  };
}
