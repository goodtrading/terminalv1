export interface LiveOrderSubmitRequest {
  exchange: "bingx";
  symbol: string;
  side: "buy" | "sell";
  type: "limit";
  quantity?: number;
  notionalUsdt?: number;
  marginUsdt?: number;
  sizingMode?: "notional" | "margin";
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  leverage?: number;
  reduceOnly?: boolean;
  confirmationText: string;
  previewId?: string;
}

export interface LiveOrderSubmitResult {
  mode: "live";
  exchange: "bingx";
  symbol: string;
  side: "buy" | "sell";
  type: "limit";
  orderSubmitted: boolean;
  orderId?: string;
  clientOrderId?: string;
  status: "submitted" | "blocked" | "failed";
  blockers: string[];
  warnings: string[];
  estimate: {
    entryPrice: number;
    quantity: number;
    notionalUsdt: number;
    maxLossUsdt?: number;
    maxLossAccountPct?: number;
    estimatedFeeUsdt?: number;
  };
  message: string;
}

export const LIVE_LIMIT_CONFIRMATION_TEXT = "CONFIRM LIVE LIMIT";
