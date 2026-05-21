export type ExchangeId = "bingx" | "binance";

export interface ExchangeStatusItem {
  id: ExchangeId;
  name: string;
  status: "not_connected" | "connected" | "error" | "coming_soon";
  supportsBrokerLogin: boolean;
  supportsTrading: boolean;
  tradingLocked: boolean;
  referralUrl?: string;
  brokerLoginAvailable: boolean;
  brokerLoginUrl?: string | null;
  demoAvailable?: boolean;
  apiConnectionEnabled?: boolean;
  readOnlyConnected?: boolean;
  apiKeyMasked?: string | null;
}

export interface ExchangeStatusResponse {
  exchanges: ExchangeStatusItem[];
}

export interface ExecutionStatusResponse {
  liveTradingEnabled: boolean;
  connectedExchange: ExchangeId | null;
  brokerLoginAvailable: boolean;
  brokerSessionRequired: boolean;
  demoAvailable: boolean;
  tradingLocked: boolean;
  permissions: "locked" | "read_only" | "trading";
  riskGuard: {
    maxNotionalUsdt: number | null;
    maxLeverage: number | null;
    confirmationRequired: boolean;
    tradingLocked: boolean;
  };
}

export interface OrderIntent {
  exchange: ExchangeId;
  symbol: string;
  side: "long" | "short";
  type: "market" | "limit";
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

export interface OrderPreviewResult {
  exchange: ExchangeId;
  symbol: string;
  side: "long" | "short";
  type: "market" | "limit";
  size: string;
  sizeUnit: "USDT" | "BTC" | "%";
  price?: string;
  leverage: string;
  marginMode: "isolated" | "cross";
  estimatedNotional: number | null;
  warnings: string[];
}

export interface ExecutionErrorResponse {
  success: false;
  code: string;
  message: string;
}
