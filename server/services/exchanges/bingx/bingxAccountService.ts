import { BingXHttpClient, BingXApiError } from "./bingxHttpClient";
import type {
  BingXAccountSnapshot,
  BingXApiCredentials,
  BingXConnectionTestResult,
} from "./bingxTypes";
import { maskApiKey } from "./bingxSigner";
import {
  getConnection,
  getCredentials,
  updateConnectionStatus,
} from "./bingxCredentialStore";

const BALANCE_PATH = "/openApi/swap/v3/user/balance";
const POSITIONS_PATH = "/openApi/swap/v2/user/positions";
const OPEN_ORDERS_PATH = "/openApi/swap/v2/trade/openOrders";

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

export function isBingxApiConnectionEnabled(): boolean {
  return envBool("BINGX_ENABLE_API_CONNECTION", true);
}

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function mapBalance(data: unknown): BingXAccountSnapshot["balances"] {
  const balances: BingXAccountSnapshot["balances"] = [];
  if (!data || typeof data !== "object") return balances;

  const root = data as Record<string, unknown>;
  const balanceNode =
    root.balance && typeof root.balance === "object"
      ? (root.balance as Record<string, unknown>)
      : root;

  const asset = String(balanceNode.asset ?? "USDT");
  const walletBalance = coerceNumber(
    balanceNode.balance ?? balanceNode.equity ?? balanceNode.walletBalance,
  );
  const availableBalance = coerceNumber(
    balanceNode.availableMargin ?? balanceNode.availableBalance ?? balanceNode.available,
  );
  const unrealizedPnl = coerceNumber(
    balanceNode.unrealizedProfit ?? balanceNode.unrealizedPnl ?? balanceNode.unrealizedPNL,
  );

  if (walletBalance !== 0 || availableBalance !== 0) {
    balances.push({
      asset,
      walletBalance,
      availableBalance,
      unrealizedPnl: unrealizedPnl || undefined,
    });
  }

  return balances;
}

function mapPositions(data: unknown): BingXAccountSnapshot["positions"] {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const p = row as Record<string, unknown>;
      const amt = coerceNumber(p.positionAmt ?? p.positionAmount ?? p.amount);
      const sideRaw = String(p.positionSide ?? p.side ?? "").toLowerCase();
      let side: "long" | "short" | "flat" = "flat";
      if (sideRaw.includes("long") || amt > 0) side = "long";
      else if (sideRaw.includes("short") || amt < 0) side = "short";
      if (Math.abs(amt) < 1e-12) side = "flat";

      return {
        symbol: String(p.symbol ?? ""),
        side,
        positionAmt: Math.abs(amt),
        entryPrice: coerceNumber(p.avgPrice ?? p.entryPrice) || undefined,
        markPrice: coerceNumber(p.markPrice) || undefined,
        unrealizedPnl:
          coerceNumber(p.unrealizedProfit ?? p.unrealizedPnl) || undefined,
        leverage: coerceNumber(p.leverage) || undefined,
        marginMode: p.isolated ? "isolated" : p.marginMode ? String(p.marginMode) : undefined,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null && p.symbol.length > 0);
}

function mapOpenOrders(data: unknown): BingXAccountSnapshot["openOrders"] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { orders?: unknown }).orders)
      ? (data as { orders: unknown[] }).orders
      : [];

  return list
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      return {
        orderId: String(o.orderId ?? o.orderID ?? o.id ?? ""),
        symbol: String(o.symbol ?? ""),
        side: String(o.side ?? o.positionSide ?? ""),
        type: String(o.type ?? o.orderType ?? ""),
        price: coerceNumber(o.price) || undefined,
        quantity: coerceNumber(o.quantity ?? o.origQty ?? o.qty) || undefined,
        status: String(o.status ?? "open"),
      };
    })
    .filter((o): o is NonNullable<typeof o> => o != null && o.orderId.length > 0);
}

export async function testConnection(
  credentials: BingXApiCredentials,
): Promise<BingXConnectionTestResult> {
  if (!isBingxApiConnectionEnabled()) {
    return {
      success: false,
      status: "error",
      message: "BingX API connection is disabled in server configuration.",
      errorCode: "BINGX_API_DISABLED",
    };
  }

  try {
    const client = new BingXHttpClient(credentials);
    await client.signedGet(BALANCE_PATH);
    return {
      success: true,
      status: "connected",
      apiKeyMasked: maskApiKey(credentials.apiKey),
      accountMode: "swap",
      message: "BingX API connection verified (read-only).",
    };
  } catch (err) {
    const message =
      err instanceof BingXApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Connection test failed";
    return {
      success: false,
      status: "error",
      apiKeyMasked: maskApiKey(credentials.apiKey),
      message,
      errorCode: err instanceof BingXApiError ? err.code : "BINGX_TEST_FAILED",
    };
  }
}

export async function getBalances(
  credentials: BingXApiCredentials,
): Promise<BingXAccountSnapshot["balances"]> {
  const client = new BingXHttpClient(credentials);
  const data = await client.signedGet<unknown>(BALANCE_PATH);
  return mapBalance(data);
}

export async function getPositions(
  credentials: BingXApiCredentials,
  symbol?: string,
): Promise<BingXAccountSnapshot["positions"]> {
  const client = new BingXHttpClient(credentials);
  const params = symbol ? { symbol } : {};
  const data = await client.signedGet<unknown>(POSITIONS_PATH, params);
  return mapPositions(data);
}

export async function getOpenOrders(
  credentials: BingXApiCredentials,
  symbol?: string,
): Promise<BingXAccountSnapshot["openOrders"]> {
  const client = new BingXHttpClient(credentials);
  const params = symbol ? { symbol } : {};
  try {
    const data = await client.signedGet<unknown>(OPEN_ORDERS_PATH, params);
    return mapOpenOrders(data);
  } catch (err) {
    if (err instanceof BingXApiError && err.code.includes("BINGX")) {
      throw err;
    }
    throw new BingXApiError(
      "Open orders endpoint unavailable",
      "BINGX_ENDPOINT_NOT_CONFIRMED",
    );
  }
}

export async function getAccountSnapshot(
  connectionId: string,
  symbol?: string,
): Promise<BingXAccountSnapshot> {
  const row = getConnection(connectionId);
  if (!row || row.status !== "connected") {
    throw new BingXApiError("Connection not found or not active", "CONNECTION_NOT_FOUND", 400);
  }

  const credentials = getCredentials(connectionId);
  if (!credentials) {
    throw new BingXApiError(
      "Unable to decrypt stored credentials",
      "CREDENTIAL_DECRYPT_FAILED",
      500,
    );
  }

  const sym =
    symbol?.trim() ||
    process.env.BINGX_DEFAULT_SYMBOL?.trim() ||
    "BTC-USDT";

  try {
    const [balances, positions, openOrders] = await Promise.all([
      getBalances(credentials),
      getPositions(credentials, sym),
      getOpenOrders(credentials, sym).catch(() => [] as BingXAccountSnapshot["openOrders"]),
    ]);

    updateConnectionStatus(connectionId, "connected");

    return {
      exchange: "bingx",
      connected: true,
      apiKeyMasked: row.apiKeyMasked,
      balances,
      positions,
      openOrders,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Account sync failed";
    updateConnectionStatus(connectionId, "error", msg);
    throw err;
  }
}
