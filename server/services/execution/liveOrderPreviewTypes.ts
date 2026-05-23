export type LiveOrderPreviewSide = "buy" | "sell";
export type LiveOrderPreviewType = "market" | "limit";

export type LiveOrderPreviewSource = "manual" | "paper_mirror" | "risk_panel";

export type LiveOrderSizingMode = "margin" | "notional" | "quantity";

export interface LiveOrderPreviewRequest {
  exchange: "bingx";
  symbol: string;
  side: LiveOrderPreviewSide;
  type: LiveOrderPreviewType;
  quantity?: number;
  notionalUsdt?: number;
  marginUsdt?: number;
  sizingMode?: LiveOrderSizingMode;
  limitPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  leverage?: number;
  reduceOnly?: boolean;
  source?: LiveOrderPreviewSource;
}

export interface LiveOrderPreviewResult {
  mode: "dry_run";
  exchange: "bingx";
  symbol: string;
  side: LiveOrderPreviewSide;
  type: LiveOrderPreviewType;
  orderWouldBeSent: false;
  tradingLocked: true;
  validated: boolean;
  blocked: boolean;
  blockers: string[];
  warnings: string[];
  estimate: {
    entryPrice?: number;
    quantity: number;
    notionalUsdt: number;
    leverage?: number;
    requiredMarginUsdt?: number;
    estimatedFeeUsdt?: number;
    estimatedSlippageUsdt?: number;
    maxLossUsdt?: number;
    maxLossAccountPct?: number;
    takeProfitGainUsdt?: number;
    takeProfitAccountPct?: number;
    liquidationDistancePct?: number;
    rawQuantity?: number;
    normalizedQuantity?: number;
    minQuantity?: number;
    requiredMinNotional?: number;
  };
  risk: {
    hasStopLoss: boolean;
    hasTakeProfit: boolean;
    accountEquityUsdt?: number;
    maxAccountRiskPct: number;
    requireStopLoss: boolean;
    riskGuardPassed: boolean;
  };
  readiness: {
    status: string;
    readyForDryRun: boolean;
    readyForLive: boolean;
  };
  systemHealth?: {
    overallStatus: "healthy" | "degraded" | "error" | "unknown";
    marketDataStatus: "healthy" | "degraded" | "error" | "unknown";
    bingxStatus: "healthy" | "degraded" | "error" | "unknown";
    securityGuardStatus: "healthy" | "degraded" | "error" | "unknown";
    liveTradingStatus: "healthy" | "degraded" | "error" | "unknown";
    blockers: string[];
  };
  symbolRules?: {
    symbol: string;
    minQty: number;
    maxQty: number;
    stepSize: number;
    quantityPrecision: number;
    pricePrecision: number;
    minNotional: number;
    available: boolean;
  };
  liveLimitTestMode?: boolean;
  debug?: {
    liveLimitTestMode: boolean;
    envValue?: string;
    maxOrderNotional?: string;
  };
  nonMarketableCheck?: {
    side: "buy" | "sell";
    limitPrice: number;
    referencePrice: number;
    referencePriceSource: string;
    valid: boolean;
    blocker?: string;
  };
  message: string;
}
