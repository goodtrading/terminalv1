export interface PaperTradingSettings {
  initialBalanceUsdt: number;
  makerFeeBps: number;
  takerFeeBps: number;
  slippageBps: number;
  maxLeverage: number;
  defaultLeverage: number;
  defaultMarginMode: "isolated" | "cross";
  allowMarketOrders: boolean;
  allowLimitOrders: boolean;
  updatedAt: string;
}

export const DEFAULT_PAPER_SETTINGS: PaperTradingSettings = {
  initialBalanceUsdt: 10_000,
  makerFeeBps: 2,
  takerFeeBps: 5,
  slippageBps: 1,
  maxLeverage: 20,
  defaultLeverage: 5,
  defaultMarginMode: "isolated",
  allowMarketOrders: true,
  allowLimitOrders: true,
  updatedAt: new Date().toISOString(),
};

export type PaperOrderSide = "long" | "short";
export type PaperOrderType = "market" | "limit";
export type PaperPositionSide = "long" | "short" | "flat";

export interface PaperAccountState {
  exchange: "paper";
  balanceUsdt: number;
  availableMarginUsdt: number;
  unrealizedPnlUsdt: number;
  realizedPnlUsdt: number;
  equityUsdt: number;
  updatedAt: string;
}

export interface PaperPosition {
  symbol: string;
  side: PaperPositionSide;
  quantity: number;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number;
  leverage: number;
  marginMode: "isolated" | "cross";
  stopLoss?: number | null;
  takeProfit?: number | null;
  openTradeId?: string | null;
}

export interface PaperFill {
  id: string;
  tradeId: string;
  orderId: string;
  symbol: string;
  side: "long" | "short";
  action: "open" | "increase" | "reduce" | "close" | "flip";
  price: number;
  quantity: number;
  notionalUsdt: number;
  feeUsdt: number;
  slippageUsdt: number;
  timestamp: string;
}

export interface PaperTradeLedgerEntry {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: "open" | "closed" | "cancelled" | "rejected";
  entryOrderId?: string;
  exitOrderId?: string;
  entryTime: string;
  exitTime?: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  notionalUsdt: number;
  leverage: number;
  marginMode: "isolated" | "cross";
  stopLoss?: number | null;
  takeProfit?: number | null;
  realizedPnlUsdt: number;
  unrealizedPnlUsdt: number;
  feesUsdt: number;
  rMultiple?: number | null;
  setup?: string;
  tags?: string[];
  mistakes?: string[];
  notes?: string;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  price?: number;
  size: number;
  sizeUnit: "USDT" | "BTC" | "%";
  leverage: number;
  marginMode: "isolated" | "cross";
  reduceOnly: boolean;
  postOnly: boolean;
  stopLoss?: number | null;
  takeProfit?: number | null;
  status: "open" | "filled" | "cancelled" | "rejected";
  createdAt: string;
  filledAt?: string;
}

export type PaperLogType =
  | "submit"
  | "fill"
  | "cancel"
  | "close"
  | "kill_switch"
  | "reject"
  | "stop_loss"
  | "take_profit";

export interface PaperExecutionLogEntry {
  id: string;
  type: PaperLogType;
  message: string;
  timestamp: string;
}

export interface PaperTradingState {
  account: Omit<PaperAccountState, "exchange">;
  position: PaperPosition | null;
  orders: PaperOrder[];
  logs: PaperExecutionLogEntry[];
  settings: PaperTradingSettings;
  fills: PaperFill[];
  tradeLedger: PaperTradeLedgerEntry[];
}

export interface PaperOrderIntent {
  symbol: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  price?: string;
  size: string;
  sizeUnit: "USDT" | "BTC" | "%";
  leverage: string;
  marginMode: "isolated" | "cross";
  reduceOnly: boolean;
  postOnly: boolean;
  stopLoss?: string;
  takeProfit?: string;
}

export interface PaperOrderPreview {
  symbol: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  size: string;
  sizeUnit: "USDT" | "BTC" | "%";
  price?: string;
  leverage: string;
  marginMode: "isolated" | "cross";
  estimatedNotional: number | null;
  estimatedMargin: number | null;
  estimatedFee: number | null;
  estimatedSlippageBps: number | null;
  fillPriceEstimate: number | null;
  markPrice: number | null;
  estimatedRiskUsdt?: number | null;
  estimatedRewardUsdt?: number | null;
  riskRewardRatio?: number | null;
  warnings: string[];
}

export interface ResetPaperAccountOptions {
  resetBalance?: boolean;
  resetOrders?: boolean;
  resetPosition?: boolean;
  resetLogs?: boolean;
  resetSettings?: boolean;
  resetLedger?: boolean;
  resetFills?: boolean;
}
