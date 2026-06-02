import { BingXHttpClient, BingXApiError } from "./bingxHttpClient";
import type {
  BingXAccountSnapshot,
  BingXApiCredentials,
  BingXConnectionTestResult,
} from "./bingxTypes";
import { maskApiKey } from "./bingxSigner";
import {
  getConnectionForUser,
  getCredentialsForUser,
  updateConnectionStatusForUser,
} from "./bingxCredentialStore";
import {
  extractOrderRiskPrices,
  extractPositionRiskPrices,
  isBingxRiskDebugEnabled,
  riskRelatedKeys,
} from "./bingxRiskFieldExtractors";
import { logBingxOrderRiskShape, logBingxPositionRiskShape } from "./bingxRiskDebug";

export const BINGX_SWAP_BALANCE_PATH = "/openApi/swap/v3/user/balance";
const BALANCE_PATH = BINGX_SWAP_BALANCE_PATH;
const POSITIONS_PATH = "/openApi/swap/v2/user/positions";
const OPEN_ORDERS_PATH = "/openApi/swap/v2/trade/openOrders";

export type BingXBalanceParseHint = "ok" | "parser_mismatch" | "empty_response";

export interface BingXBalancesResult {
  balances: BingXAccountSnapshot["balances"];
  parseHint: BingXBalanceParseHint;
}

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

function extractBalanceRows(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (r): r is Record<string, unknown> => r != null && typeof r === "object",
    );
  }
  if (typeof data !== "object") return [];

  const root = data as Record<string, unknown>;
  if (Array.isArray(root.balances)) {
    return root.balances.filter(
      (r): r is Record<string, unknown> => r != null && typeof r === "object",
    );
  }
  if (root.balance != null && typeof root.balance === "object") {
    if (Array.isArray(root.balance)) {
      return root.balance.filter(
        (r): r is Record<string, unknown> => r != null && typeof r === "object",
      );
    }
    return [root.balance as Record<string, unknown>];
  }
  return [root];
}

function mapBalanceRow(
  node: Record<string, unknown>,
): BingXAccountSnapshot["balances"][number] | null {
  const asset = String(node.asset ?? node.currency ?? "USDT").toUpperCase();
  const equity = coerceNumber(node.equity);
  const walletBalance = coerceNumber(
    node.balance ?? node.walletBalance ?? node.equity,
  );
  const availableBalance = coerceNumber(
    node.availableMargin ??
      node.availableBalance ??
      node.available ??
      node.maxWithdrawAmount,
  );
  const unrealizedRaw =
    node.unrealizedProfit ?? node.unrealizedPnl ?? node.unrealizedPNL;
  const unrealizedPnl =
    unrealizedRaw != null && String(unrealizedRaw).trim() !== ""
      ? coerceNumber(unrealizedRaw)
      : undefined;

  const hasRecognizedField =
    node.asset != null ||
    node.currency != null ||
    node.equity != null ||
    node.balance != null ||
    node.walletBalance != null ||
    node.availableMargin != null ||
    node.availableBalance != null ||
    node.available != null ||
    unrealizedRaw != null;

  if (!hasRecognizedField) return null;

  const equityValue = equity > 0 || node.equity != null ? equity : walletBalance;

  return {
    asset,
    walletBalance: walletBalance > 0 || node.balance != null ? walletBalance : equityValue,
    equity: equityValue,
    availableBalance,
    unrealizedPnl,
  };
}

function describeBalancePayload(data: unknown): {
  topLevelKeys: string[];
  detectedAccountType: "swap_array" | "swap_object" | "nested_balance" | "unknown" | "empty";
  hasEquity: boolean;
  hasAvailableMargin: boolean;
  hasUnrealizedPnl: boolean;
  rawNumericFields: string[];
  rawRowCount: number;
} {
  const rows = extractBalanceRows(data);
  const topLevelKeys = Array.isArray(data)
    ? [`[array:${data.length}]`]
    : data && typeof data === "object"
      ? Object.keys(data as object)
      : [];

  let detectedAccountType: ReturnType<typeof describeBalancePayload>["detectedAccountType"] =
    "empty";
  if (Array.isArray(data) && data.length > 0) detectedAccountType = "swap_array";
  else if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    if (Array.isArray(root.balances) || Array.isArray(root.balance)) {
      detectedAccountType = "nested_balance";
    } else if (root.asset != null || root.equity != null || root.balance != null) {
      detectedAccountType = "swap_object";
    } else {
      detectedAccountType = "unknown";
    }
  }

  const sample = rows[0] ?? (data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null);

  const numericKeys = new Set<string>();
  if (sample) {
    for (const key of [
      "equity",
      "balance",
      "walletBalance",
      "availableMargin",
      "availableBalance",
      "available",
      "unrealizedProfit",
      "unrealizedPnl",
      "usedMargin",
    ]) {
      const v = sample[key];
      if (v != null && String(v).trim() !== "" && Number.isFinite(Number(v))) {
        numericKeys.add(key);
      }
    }
  }

  return {
    topLevelKeys,
    detectedAccountType,
    hasEquity: numericKeys.has("equity"),
    hasAvailableMargin:
      numericKeys.has("availableMargin") ||
      numericKeys.has("availableBalance") ||
      numericKeys.has("available"),
    hasUnrealizedPnl:
      numericKeys.has("unrealizedProfit") || numericKeys.has("unrealizedPnl"),
    rawNumericFields: [...numericKeys],
    rawRowCount: rows.length,
  };
}

function logBingXAccountSync(payload: Record<string, unknown>): void {
  if (!isBingxRiskDebugEnabled()) return;
  console.debug("[BingX Account Sync]", payload);
}

function logBingXLimitDiagnostic(payload: Record<string, unknown>): void {
  console.debug("[BINGX_LIMIT_DIAG][account]", payload);
}

function mapBalance(data: unknown): BingXBalancesResult {
  const rows = extractBalanceRows(data);
  const balances: BingXAccountSnapshot["balances"] = [];

  for (const row of rows) {
    const mapped = mapBalanceRow(row);
    if (mapped) balances.push(mapped);
  }

  if (
    balances.length === 0 &&
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
  ) {
    const mapped = mapBalanceRow(data as Record<string, unknown>);
    if (mapped) balances.push(mapped);
  }

  const parseHint: BingXBalanceParseHint =
    rows.length > 0 && balances.length === 0
      ? "parser_mismatch"
      : rows.length === 0 && balances.length === 0
        ? "empty_response"
        : "ok";

  return { balances, parseHint };
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

      const risk = extractPositionRiskPrices(p);
      if (isBingxRiskDebugEnabled()) {
        logBingxPositionRiskShape(p, risk);
        logBingXAccountSync({
          kind: "position_row_shape",
          symbol: String(p.symbol ?? ""),
          side,
          keys: Object.keys(p),
          riskRelatedKeys: riskRelatedKeys(Object.keys(p)),
          extractedStopLossPrice: risk.stopLossPrice ?? null,
          extractedTakeProfitPrice: risk.takeProfitPrice ?? null,
        });
      }

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
        liquidationPrice:
          coerceNumber(
            p.liquidationPrice ?? p.liqPrice ?? p.liquidation ?? p.liquidationPx,
          ) || undefined,
        stopLossPrice: risk.stopLossPrice,
        takeProfitPrice: risk.takeProfitPrice,
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

  logBingXLimitDiagnostic({
    stage: "raw_open_orders",
    raw: data,
    beforeMapCount: list.length,
  });

  return list
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const risk = extractOrderRiskPrices(o);
      if (isBingxRiskDebugEnabled()) {
        logBingxOrderRiskShape(o, risk);
        logBingXAccountSync({
          kind: "open_order_row_shape",
          symbol: String(o.symbol ?? ""),
          type: String(o.type ?? o.orderType ?? ""),
          side: String(o.side ?? o.positionSide ?? ""),
          keys: Object.keys(o),
          riskRelatedKeys: riskRelatedKeys(Object.keys(o)),
          extractedTriggerPrice: risk.triggerPrice ?? null,
          extractedStopPrice: risk.stopPrice ?? null,
        });
      }

      const price = coerceNumber(o.price) || undefined;
      const mapped = {
        orderId: String(o.orderId ?? o.orderID ?? o.id ?? ""),
        symbol: String(o.symbol ?? ""),
        side: String(o.side ?? o.positionSide ?? ""),
        type: String(o.type ?? o.orderType ?? ""),
        price: price || undefined,
        triggerPrice: risk.triggerPrice,
        stopPrice: risk.stopPrice,
        quantity: coerceNumber(o.quantity ?? o.origQty ?? o.qty) || undefined,
        reduceOnly: Boolean(
          o.reduceOnly ?? o.isReduceOnly ?? o.closePosition ?? o.onlyReduce,
        ),
        status: String(o.status ?? "open"),
      };
      logBingXLimitDiagnostic({
        stage: "mapped_open_order_row",
        orderId: mapped.orderId,
        symbol: mapped.symbol,
        type: mapped.type,
        status: mapped.status,
        price: mapped.price ?? null,
      });
      return mapped;
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
): Promise<BingXBalancesResult> {
  const client = new BingXHttpClient(credentials);
  try {
    const data = await client.signedGet<unknown>(BALANCE_PATH);
    const shape = describeBalancePayload(data);
    const { balances, parseHint } = mapBalance(data);
    logBingXAccountSync({
      endpoint: BALANCE_PATH,
      accountType: "swap_perpetual",
      httpStatus: 200,
      ok: true,
      topLevelKeys: shape.topLevelKeys,
      detectedAccountType: shape.detectedAccountType,
      hasEquity: shape.hasEquity,
      hasAvailableMargin: shape.hasAvailableMargin,
      hasUnrealizedPnl: shape.hasUnrealizedPnl,
      rawNumericFields: shape.rawNumericFields,
      rawRowCount: shape.rawRowCount,
      parsedRowCount: balances.length,
      parseHint,
    });
    return { balances, parseHint };
  } catch (err) {
    const httpStatus = err instanceof BingXApiError ? err.httpStatus : undefined;
    logBingXAccountSync({
      endpoint: BALANCE_PATH,
      accountType: "swap_perpetual",
      httpStatus,
      ok: false,
      topLevelKeys: [],
      detectedAccountType: "unknown",
      hasEquity: false,
      hasAvailableMargin: false,
      hasUnrealizedPnl: false,
      errorCode: err instanceof BingXApiError ? err.code : "UNKNOWN",
    });
    throw err;
  }
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

function mergeOpenOrdersById(
  primary: BingXAccountSnapshot["openOrders"],
  secondary: BingXAccountSnapshot["openOrders"],
): BingXAccountSnapshot["openOrders"] {
  const seen = new Set(primary.map((o) => o.orderId));
  const out = [...primary];
  for (const o of secondary) {
    if (!o.orderId || seen.has(o.orderId)) continue;
    seen.add(o.orderId);
    out.push(o);
  }
  return out;
}

/** Open orders for symbol; when symbol set, also merges account-wide open orders (SL/TP often only in one list). */
export async function getOpenOrders(
  credentials: BingXApiCredentials,
  symbol?: string,
): Promise<BingXAccountSnapshot["openOrders"]> {
  const client = new BingXHttpClient(credentials);
  const params = symbol ? { symbol } : {};
  try {
    const data = await client.signedGet<unknown>(OPEN_ORDERS_PATH, params);
    const scoped = mapOpenOrders(data);
    logBingXLimitDiagnostic({
      stage: "scoped_open_orders_mapped",
      symbol,
      afterMapCount: scoped.length,
      orders: scoped.map((o) => ({
        orderId: o.orderId,
        symbol: o.symbol,
        type: o.type,
        status: o.status,
        price: o.price ?? null,
      })),
    });
    if (!symbol?.trim()) return scoped;
    try {
      const allData = await client.signedGet<unknown>(OPEN_ORDERS_PATH, {});
      const accountWide = mapOpenOrders(allData);
      const merged = mergeOpenOrdersById(scoped, accountWide);
      logBingXLimitDiagnostic({
        stage: "merged_open_orders_mapped",
        symbol,
        scopedCount: scoped.length,
        accountWideCount: accountWide.length,
        afterMapCount: merged.length,
        orders: merged.map((o) => ({
          orderId: o.orderId,
          symbol: o.symbol,
          type: o.type,
          status: o.status,
          price: o.price ?? null,
        })),
      });
      if (isBingxRiskDebugEnabled()) {
        logBingXAccountSync({
          kind: "open_orders_merge",
          symbol,
          scopedCount: scoped.length,
          allCount: accountWide.length,
          mergedCount: merged.length,
        });
      }
      return merged;
    } catch {
      return scoped;
    }
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
  userId: number,
  symbol?: string,
): Promise<BingXAccountSnapshot> {
  const row = getConnectionForUser(connectionId, userId);
  if (!row || row.status !== "connected") {
    throw new BingXApiError("Connection not found or not active", "CONNECTION_NOT_FOUND", 400);
  }

  const credentials = getCredentialsForUser(connectionId, userId);
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
    const [balanceResult, positions, openOrders] = await Promise.all([
      getBalances(credentials),
      getPositions(credentials, sym),
      getOpenOrders(credentials, sym).catch(() => [] as BingXAccountSnapshot["openOrders"]),
    ]);
    const balances = balanceResult.balances;

    updateConnectionStatusForUser(connectionId, userId, "connected");

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
    updateConnectionStatusForUser(connectionId, userId, "error", msg);
    throw err;
  }
}
