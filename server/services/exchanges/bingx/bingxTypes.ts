export interface BingXApiCredentials {
  apiKey: string;
  apiSecret: string;
}

export type BingXConnectionHealth = "healthy" | "degraded" | "error";

export interface StoredBingXConnection {
  id: string;
  userId: number;
  exchange: "bingx";
  label: string;
  apiKeyMasked: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  mode: "read-only";
  tradingEnabled: false;
  permissions: {
    readOnly: true;
    trading: false;
  };
  status: "not_connected" | "checking" | "connected" | "error";
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastValidatedAt?: string;
  lastHealth?: BingXConnectionHealth;
  lastError?: string;
}

export interface BingXConnectionTestResult {
  success: boolean;
  status: "connected" | "error";
  apiKeyMasked?: string;
  accountMode?: "spot" | "swap" | "unknown";
  message: string;
  errorCode?: string;
}

export interface BingXAccountSnapshot {
  exchange: "bingx";
  connected: boolean;
  apiKeyMasked: string;
  balances: Array<{
    asset: string;
    walletBalance: number;
    /** Net asset value from BingX `equity` when present. */
    equity?: number;
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

export interface BingXPublicConnection {
  id: string;
  exchange: "bingx";
  label: string;
  apiKeyMasked: string;
  mode: "read-only";
  readOnly: true;
  tradingEnabled: false;
  connected: boolean;
  permissions: {
    readOnly: true;
    trading: false;
  };
  status: StoredBingXConnection["status"];
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastValidatedAt?: string;
  lastHealth?: BingXConnectionHealth;
  lastError?: string;
}

export interface BingXConnectResponseConnection {
  id: string;
  exchange: "bingx";
  mode: "read-only";
  apiKeyMasked: string;
  connected: boolean;
  tradingEnabled: false;
  readOnly: true;
  label?: string;
  createdAt: string;
  lastValidatedAt?: string;
  lastHealth?: BingXConnectionHealth;
}
