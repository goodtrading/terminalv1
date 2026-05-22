import type { BingXConnectionMode } from "./bingxConnectionCapability";

export interface BingXApiCredentials {
  apiKey: string;
  apiSecret: string;
}

export type BingXConnectionHealth = "healthy" | "degraded" | "error";

export interface BingXConnectionPermissions {
  readOnly: boolean;
  trading: boolean;
}

export interface StoredBingXConnection {
  id: string;
  userId: number;
  exchange: "bingx";
  label: string;
  apiKeyMasked: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  connectionMode: BingXConnectionMode;
  readOnly: boolean;
  tradingPermissionConfirmed: boolean;
  tradingEnabled: boolean;
  permissions: BingXConnectionPermissions;
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
    liquidationPrice?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }>;
  openOrders: Array<{
    orderId: string;
    symbol: string;
    side: string;
    type: string;
    price?: number;
    triggerPrice?: number;
    stopPrice?: number;
    quantity?: number;
    reduceOnly?: boolean;
    status: string;
  }>;
  updatedAt: string;
}

export interface BingXPublicConnection {
  id: string;
  exchange: "bingx";
  label: string;
  apiKeyMasked: string;
  connectionMode: BingXConnectionMode;
  readOnly: boolean;
  tradingPermissionConfirmed: boolean;
  tradingEnabled: boolean;
  connected: boolean;
  permissions: BingXConnectionPermissions;
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
  mode: BingXConnectionMode;
  connectionMode: BingXConnectionMode;
  apiKeyMasked: string;
  connected: boolean;
  tradingPermissionConfirmed: boolean;
  tradingEnabled: boolean;
  readOnly: boolean;
  permissions: BingXConnectionPermissions;
  label?: string;
  createdAt: string;
  lastValidatedAt?: string;
  lastHealth?: BingXConnectionHealth;
}
