export type LiveOrderPreviewSide = "buy" | "sell";
export type LiveOrderPreviewType = "market" | "limit";

export interface LiveOrderPreviewRequest {
  exchange: "bingx";
  symbol: string;
  side: LiveOrderPreviewSide;
  type: LiveOrderPreviewType;
  quantity?: number;
  notionalUsdt?: number;
  limitPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  leverage?: number;
  reduceOnly?: boolean;
  source?: "manual" | "paper_mirror" | "risk_panel";
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
  message: string;
}

export interface LiveOrderPreviewApiResponse {
  success: boolean;
  preview?: LiveOrderPreviewResult;
  code?: string;
  message?: string;
}
