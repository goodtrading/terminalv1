export interface BingXApiCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface StoredBingXConnection {
  id: string;
  exchange: "bingx";
  label: string;
  apiKeyMasked: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  permissions: {
    readOnly: boolean;
    trading: boolean;
  };
  status: "not_connected" | "checking" | "connected" | "error";
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
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
  permissions: {
    readOnly: boolean;
    trading: boolean;
  };
  status: StoredBingXConnection["status"];
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastError?: string;
}
