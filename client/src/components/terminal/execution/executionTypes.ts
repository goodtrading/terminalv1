export type ExchangeId = "bingx" | "binance" | "paper";

export type ExchangeConnectionStatus =
  | "not_connected"
  | "checking"
  | "connected"
  | "error"
  | "coming_soon";

export type BrokerConnectionPhase =
  | "not_connected"
  | "checking"
  | "connecting"
  | "broker_login_unavailable"
  | "connected_demo"
  | "connected"
  | "error";

export type BrokerConnectionMode =
  | "broker_login"
  | "secure_api"
  | "demo"
  | "paper"
  | null;

export interface BrokerSessionState {
  exchange: ExchangeId | null;
  phase: BrokerConnectionPhase;
  connected: boolean;
  demo: boolean;
  connectionMode?: BrokerConnectionMode;
  connectionId?: string;
  apiKeyMasked?: string;
  readOnly?: boolean;
  tradingEnabled?: boolean;
  message?: string;
  brokerLoginUrl?: string | null;
  connectedAt?: string;
  lastError?: string;
}

export interface BingXAccountSnapshot {
  exchange: "bingx";
  connected: boolean;
  apiKeyMasked: string;
  balances: Array<{
    asset: string;
    walletBalance: number;
    availableBalance: number;
    unrealizedPnl?: number;
  }>;
  positions: Array<{
    symbol: string;
    side: "long" | "short" | "flat";
    positionAmt: number;
    entryPrice?: number;
    markPrice?: number;
    unrealizedPnl?: number;
    leverage?: number;
    marginMode?: string;
  }>;
  openOrders: Array<{
    orderId: string;
    symbol: string;
    side: string;
    type: string;
    price?: number;
    quantity?: number;
    status: string;
  }>;
  updatedAt: string;
}

export interface BingXConnectResponse {
  success: boolean;
  connection?: {
    id: string;
    exchange: "bingx";
    status: string;
    apiKeyMasked: string;
    permissions: { readOnly: boolean; trading: boolean };
  };
  warning?: string;
  warnings?: string[];
  code?: string;
  message?: string;
}

export interface BingxLoginStatusResponse {
  exchange: "bingx";
  brokerLoginAvailable: boolean;
  brokerLoginUrl: string | null;
  callbackUrl: string | null;
  demoAvailable: boolean;
  liveTradingEnabled: boolean;
  apiConnectionEnabled?: boolean;
  message: string;
}

export type BrokerHealthStatus =
  | "offline"
  | "ready"
  | "checking"
  | "online"
  | "error"
  | "coming_soon";

export interface ExchangeConnectionState {
  id: ExchangeId;
  name: string;
  status: ExchangeConnectionStatus;
  health: BrokerHealthStatus;
  logoUrl: string;
  rating?: number;
  ratingLabel?: string;
  badge?: string;
  description: string;
  supportsBrokerLogin: boolean;
  supportsReadOnly: boolean;
  supportsTrading: boolean;
  tradingLocked: boolean;
  referralUrl?: string;
  brokerLoginUrl?: string;
  brokerLoginAvailable: boolean;
  demoConnectionAvailable?: boolean;
  connectionPhase?: BrokerConnectionPhase;
  accountMode?: "spot" | "perpetual_futures" | "unknown";
  lastCheck?: string;
  error?: string;
}

export type OrderSide = "long" | "short";
export type OrderType = "market" | "limit";
export type MarginMode = "isolated" | "cross";
export type SizeUnit = "USDT" | "BTC" | "%";

export interface OrderTicketState {
  exchange: ExchangeId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string;
  size: string;
  sizeUnit: SizeUnit;
  leverage: string;
  marginMode: MarginMode;
  reduceOnly: boolean;
  postOnly: boolean;
  stopLoss: string;
  takeProfit: string;
}

export interface ExecutionRiskGuardState {
  liveTradingEnabled: boolean;
  brokerLoginAvailable: boolean;
  brokerSessionRequired?: boolean;
  demoAvailable?: boolean;
  connectedExchange: ExchangeId | null;
  tradingLocked: boolean;
  confirmationRequired: boolean;
  maxNotionalUsdt: number | null;
  maxLeverage: number | null;
  permissions: "locked" | "read_only" | "trading";
}

export interface OrderPreviewSummary {
  exchange: ExchangeId;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  size: string;
  sizeUnit: SizeUnit;
  price?: string;
  leverage: string;
  marginMode: MarginMode;
  estimatedNotional: number | null;
  estimatedMargin?: number | null;
  estimatedFee?: number | null;
  estimatedSlippageBps?: number | null;
  fillPriceEstimate?: number | null;
  markPrice?: number | null;
  estimatedRiskUsdt?: number | null;
  estimatedRewardUsdt?: number | null;
  riskRewardRatio?: number | null;
  warnings: string[];
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

export interface PaperLogEntry {
  id: string;
  type: PaperLogType;
  message: string;
  timestamp: string;
}

export interface PaperTradeLedgerSnapshot {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: "open" | "closed" | "cancelled" | "rejected";
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  realizedPnlUsdt: number;
  unrealizedPnlUsdt: number;
  rMultiple?: number | null;
  entryTime: string;
  exitTime?: string;
}

export interface PaperTradingSettings {
  initialBalanceUsdt: number;
  makerFeeBps: number;
  takerFeeBps: number;
  slippageBps: number;
  maxLeverage: number;
  defaultLeverage: number;
  defaultMarginMode: MarginMode;
  allowMarketOrders: boolean;
  allowLimitOrders: boolean;
  updatedAt: string;
}

export interface PaperAccountSnapshot {
  exchange: "paper";
  balanceUsdt: number;
  availableMarginUsdt: number;
  unrealizedPnlUsdt: number;
  realizedPnlUsdt: number;
  equityUsdt: number;
  updatedAt: string;
}

export interface PaperPositionSnapshot {
  symbol: string;
  side: "long" | "short" | "flat";
  quantity: number;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number;
  leverage: number;
  marginMode: "isolated" | "cross";
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface PaperOrderSnapshot {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: number;
  size: number;
  sizeUnit: SizeUnit;
  leverage: number;
  marginMode: MarginMode;
  status: string;
  createdAt: string;
}
