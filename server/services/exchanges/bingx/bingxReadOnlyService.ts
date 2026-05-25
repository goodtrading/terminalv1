import { BingXApiError } from "./bingxHttpClient";
import {
  getBalances,
  getOpenOrders,
  getPositions,
  isBingxApiConnectionEnabled,
  type BingXBalanceParseHint,
} from "./bingxAccountService";
import type { BingXConnectionHealth } from "./bingxTypes";
import {
  getConnectionForUser,
  getCredentialsForUser,
  hasEncryptionKey,
  updateConnectionHealthForUser,
  updateConnectionStatusForUser,
} from "./bingxCredentialStore";
import {
  buildRiskOrdersFromNormalized,
  type BingXNormalizedRiskOrder,
} from "./bingxRiskOrders";
import { buildBingXRiskDebugShape } from "./bingxRiskDebug";

export type { BingXNormalizedRiskOrder } from "./bingxRiskOrders";

export type BingXReadOnlyHealth = "healthy" | "degraded" | "error";

export type BingXAccountSyncStatus =
  | "loaded"
  | "unavailable"
  | "empty"
  | "permission_denied"
  | "parser_mismatch";

export interface BingXNormalizedPosition {
  symbol: string;
  side: "long" | "short" | "flat" | "unknown";
  quantity: number;
  entryPrice?: number;
  markPrice?: number;
  liquidationPrice?: number;
  leverage?: number;
  marginMode?: "cross" | "isolated" | "unknown";
  unrealizedPnlUsdt?: number;
  roePct?: number;
  notionalUsdt?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export interface BingXNormalizedOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell" | "unknown";
  type: "market" | "limit" | "stop" | "take_profit" | "unknown";
  status: "open" | "partially_filled" | "unknown";
  price?: number;
  triggerPrice?: number;
  stopPrice?: number;
  quantity?: number;
  reduceOnly?: boolean;
  createdTime?: number;
}

export interface BingXReadOnlySnapshot {
  connectionId: string;
  exchange: "bingx";
  mode: "read-only";
  connected: boolean;
  health: BingXReadOnlyHealth;
  lastSyncTime: number;
  account?: {
    equityUsdt?: number;
    balanceUsdt?: number;
    availableMarginUsdt?: number;
    marginUsedUsdt?: number;
    unrealizedPnlUsdt?: number;
  };
  /** API reachability (positions/orders/balance endpoints). */
  connectionHealth: BingXReadOnlyHealth;
  /** Whether futures balance fields were parsed and exposed. */
  accountSync: {
    status: BingXAccountSyncStatus;
    message?: string;
  };
  positions: BingXNormalizedPosition[];
  openOrders: BingXNormalizedOrder[];
  riskOrders: BingXNormalizedRiskOrder[];
  permissions: {
    read: boolean;
    trade: false;
    withdraw: false;
  };
  warnings: string[];
  error?: {
    code: string;
    message: string;
  };
}

export interface BingXReadOnlyHealthResult {
  success: boolean;
  health: BingXReadOnlyHealth;
  latencyMs: number;
  lastSyncTime: number;
  permissions: {
    read: boolean;
    trade: false;
    withdraw: false;
  };
  warnings: string[];
  error?: {
    code: string;
    message: string;
    safeReason?: string;
  };
}

export type BingXSafeErrorCode =
  | "BINGX_CONNECTION_NOT_FOUND"
  | "BINGX_CREDENTIALS_UNAVAILABLE"
  | "BINGX_ENCRYPTION_KEY_MISSING"
  | "BINGX_API_DISABLED"
  | "BINGX_API_ERROR"
  | "INVALID_API_KEY"
  | "INVALID_SIGNATURE"
  | "INSUFFICIENT_PERMISSION"
  | "IP_RESTRICTED"
  | "TIMEOUT"
  | "UNKNOWN";

const SNAPSHOT_CACHE_MS = 4_000;
const HEALTH_CACHE_MS = 10_000;
const HIGH_LATENCY_MS = 8_000;

const snapshotCache = new Map<string, { at: number; data: BingXReadOnlySnapshot }>();
const healthCache = new Map<string, { at: number; data: BingXReadOnlyHealthResult }>();

function coerceNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeMarginMode(raw: unknown): "cross" | "isolated" | "unknown" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("cross")) return "cross";
  if (s.includes("isol")) return "isolated";
  return "unknown";
}

function normalizeOrderSide(raw: string): BingXNormalizedOrder["side"] {
  const s = raw.toLowerCase();
  if (s.includes("buy") || s.includes("long")) return "buy";
  if (s.includes("sell") || s.includes("short")) return "sell";
  return "unknown";
}

function normalizeOrderType(raw: string): BingXNormalizedOrder["type"] {
  const s = raw.toLowerCase();
  if (s.includes("limit")) return "limit";
  if (s.includes("market")) return "market";
  if (s.includes("stop") && !s.includes("profit")) return "stop";
  if (s.includes("profit") || s.includes("tp")) return "take_profit";
  return "unknown";
}

export function mapBingXErrorToSafe(err: unknown): {
  code: BingXSafeErrorCode;
  message: string;
  safeReason: string;
} {
  if (err instanceof BingXApiError) {
    const msg = (err.message || "").toLowerCase();
    const code = err.code.toLowerCase();

    if (code === "bingx_timeout" || msg.includes("timed out") || msg.includes("timeout")) {
      return {
        code: "TIMEOUT",
        message: "BingX API timeout. Try again later.",
        safeReason: "Request timed out",
      };
    }
    if (
      msg.includes("signature") ||
      msg.includes("sign") ||
      code.includes("signature")
    ) {
      return {
        code: "INVALID_SIGNATURE",
        message: "Invalid BingX API signature. Check API secret.",
        safeReason: "Signature validation failed",
      };
    }
    if (
      msg.includes("api key") ||
      msg.includes("apikey") ||
      msg.includes("invalid key") ||
      code.includes("100001")
    ) {
      return {
        code: "INVALID_API_KEY",
        message: "Invalid BingX API key.",
        safeReason: "API key rejected",
      };
    }
    if (
      msg.includes("permission") ||
      msg.includes("not authorized") ||
      msg.includes("forbidden")
    ) {
      return {
        code: "INSUFFICIENT_PERMISSION",
        message:
          "Connected, but this API key does not have account read permissions for futures.",
        safeReason: "Insufficient futures read permissions",
      };
    }
    if (msg.includes("ip") && (msg.includes("restrict") || msg.includes("whitelist"))) {
      return {
        code: "IP_RESTRICTED",
        message: "BingX rejected the request because of IP restrictions.",
        safeReason: "IP restriction",
      };
    }
    return {
      code: "BINGX_API_ERROR",
      message: "Could not sync BingX read-only account.",
      safeReason: err.message.slice(0, 120) || "API error",
    };
  }

  if (err instanceof Error) {
    if (err.message === "BINGX_CREDENTIAL_ENCRYPTION_KEY_MISSING") {
      return {
        code: "BINGX_ENCRYPTION_KEY_MISSING",
        message: "Server encryption key missing. Cannot decrypt stored credentials.",
        safeReason: "Encryption key not configured",
      };
    }
  }

  return {
    code: "UNKNOWN",
    message: "Unexpected BingX read-only sync error.",
    safeReason: "Unexpected error",
  };
}

function mapPositions(
  rows: Awaited<ReturnType<typeof getPositions>>,
): BingXNormalizedPosition[] {
  return rows
    .filter((p) => p.side !== "flat" && p.positionAmt > 0)
    .map((p) => {
      const qty = p.positionAmt;
      const entry = p.entryPrice;
      const mark = p.markPrice;
      const notional =
        mark != null && mark > 0 ? qty * mark : entry != null && entry > 0 ? qty * entry : undefined;
      let roePct: number | undefined;
      if (p.unrealizedPnl != null && notional != null && notional > 0) {
        roePct = (p.unrealizedPnl / notional) * 100;
      }
      return {
        symbol: p.symbol,
        side: p.side === "long" || p.side === "short" ? p.side : "unknown",
        quantity: qty,
        entryPrice: entry,
        markPrice: mark,
        liquidationPrice: p.liquidationPrice,
        leverage: p.leverage,
        marginMode: normalizeMarginMode(p.marginMode),
        unrealizedPnlUsdt: p.unrealizedPnl,
        roePct: roePct != null && Number.isFinite(roePct) ? Math.round(roePct * 100) / 100 : undefined,
        notionalUsdt: notional,
        stopLossPrice: p.stopLossPrice,
        takeProfitPrice: p.takeProfitPrice,
      };
    });
}

function mapOrders(
  rows: Awaited<ReturnType<typeof getOpenOrders>>,
): BingXNormalizedOrder[] {
  return rows.map((o) => {
    const type = normalizeOrderType(o.type);
    const trigger = o.triggerPrice ?? o.stopPrice;
    const limitPrice = o.price;
    const typeLower = (o.type ?? "").toLowerCase();
    const isConditional =
      type === "stop" ||
      type === "take_profit" ||
      /stop|take_profit|trigger|trailing|tpsl|conditional|plan/.test(typeLower);
    const effectivePrice = isConditional
      ? trigger ?? limitPrice
      : limitPrice ?? trigger;
    return {
      id: o.orderId,
      symbol: o.symbol,
      side: normalizeOrderSide(o.side),
      type,
      status:
        o.status.toLowerCase().includes("partial")
          ? "partially_filled"
          : o.status.toLowerCase().includes("open") ||
              o.status.toLowerCase().includes("new") ||
              o.status === ""
            ? "open"
            : "unknown",
      price: effectivePrice,
      triggerPrice: trigger,
      stopPrice: o.stopPrice,
      quantity: o.quantity,
      reduceOnly: o.reduceOnly,
      createdTime: undefined,
    };
  });
}

function finiteOrUndefined(n: number): number | undefined {
  return Number.isFinite(n) ? n : undefined;
}

function buildAccountFromBalances(
  balances: Awaited<ReturnType<typeof getBalances>>["balances"],
  parseHint: BingXBalanceParseHint,
): {
  account?: BingXReadOnlySnapshot["account"];
  accountSync: BingXReadOnlySnapshot["accountSync"];
} {
  if (parseHint === "parser_mismatch") {
    return {
      accountSync: {
        status: "parser_mismatch",
        message:
          "Connected, but balance data could not be parsed. Report this if your futures wallet has funds.",
      },
    };
  }

  const primary = balances.find((b) => b.asset === "USDT") ?? balances[0];
  if (!primary) {
    return {
      accountSync: {
        status: "unavailable",
        message:
          "Connected, but account balance is unavailable. Check futures read permissions or account type.",
      },
    };
  }

  const balanceUsdt = coerceNumber(primary.walletBalance);
  const availableMarginUsdt = coerceNumber(primary.availableBalance);
  const equityUsdt = coerceNumber(primary.equity ?? primary.walletBalance);
  const unrealizedPnlUsdt =
    primary.unrealizedPnl != null ? coerceNumber(primary.unrealizedPnl) : 0;
  const marginUsedUsdt = Math.max(0, equityUsdt - availableMarginUsdt);

  const accountSync: BingXReadOnlySnapshot["accountSync"] =
    equityUsdt === 0 &&
    availableMarginUsdt === 0 &&
    balanceUsdt === 0 &&
    unrealizedPnlUsdt === 0
      ? { status: "empty", message: "Futures wallet balance is zero." }
      : { status: "loaded" };

  return {
    account: {
      equityUsdt: finiteOrUndefined(equityUsdt),
      balanceUsdt: finiteOrUndefined(balanceUsdt),
      availableMarginUsdt: finiteOrUndefined(availableMarginUsdt),
      marginUsedUsdt: finiteOrUndefined(marginUsedUsdt),
      unrealizedPnlUsdt: finiteOrUndefined(unrealizedPnlUsdt),
    },
    accountSync,
  };
}

function assertConnection(
  connectionId: string,
  userId: number,
): {
  ok: true;
  connectionId: string;
  userId: number;
} | { ok: false; code: BingXSafeErrorCode; message: string } {
  const id = connectionId?.trim();
  if (!id || id === "session-only" || id === "ephemeral") {
    return {
      ok: false,
      code: "BINGX_CONNECTION_NOT_FOUND",
      message: "BingX connection not found.",
    };
  }
  const row = getConnectionForUser(id, userId);
  if (!row) {
    return {
      ok: false,
      code: "BINGX_CONNECTION_NOT_FOUND",
      message: "BingX connection not found.",
    };
  }
  if (!hasEncryptionKey()) {
    return {
      ok: false,
      code: "BINGX_ENCRYPTION_KEY_MISSING",
      message: "Server encryption key missing. Cannot load stored credentials.",
    };
  }
  const credentials = getCredentialsForUser(id, userId);
  if (!credentials) {
    return {
      ok: false,
      code: "BINGX_CREDENTIALS_UNAVAILABLE",
      message: "Unable to load BingX credentials for this connection.",
    };
  }
  return { ok: true, connectionId: id, userId };
}

async function syncSnapshotCore(
  connectionId: string,
  userId: number,
  symbol?: string,
): Promise<BingXReadOnlySnapshot> {
  if (!isBingxApiConnectionEnabled()) {
    return {
      connectionId,
      exchange: "bingx",
      mode: "read-only",
      connected: false,
      health: "error",
      connectionHealth: "error",
      accountSync: { status: "unavailable" },
      lastSyncTime: Date.now(),
      positions: [],
      openOrders: [],
      riskOrders: [],
      permissions: { read: false, trade: false, withdraw: false },
      warnings: [],
      error: {
        code: "BINGX_API_DISABLED",
        message: "BingX API connection is disabled on the server.",
      },
    };
  }

  const check = assertConnection(connectionId, userId);
  if (!check.ok) {
    return {
      connectionId,
      exchange: "bingx",
      mode: "read-only",
      connected: false,
      health: "error",
      connectionHealth: "error",
      accountSync: { status: "unavailable" },
      lastSyncTime: Date.now(),
      positions: [],
      openOrders: [],
      riskOrders: [],
      permissions: { read: false, trade: false, withdraw: false },
      warnings: [],
      error: { code: check.code, message: check.message },
    };
  }

  const credentials = getCredentialsForUser(check.connectionId, check.userId)!;
  const warnings: string[] = [];
  let connectionHealth: BingXReadOnlyHealth = "healthy";

  let account: BingXReadOnlySnapshot["account"];
  let accountSync: BingXReadOnlySnapshot["accountSync"] = { status: "unavailable" };
  try {
    const balanceResult = await getBalances(credentials);
    const built = buildAccountFromBalances(
      balanceResult.balances,
      balanceResult.parseHint,
    );
    account = built.account;
    accountSync = built.accountSync;
    if (accountSync.status !== "loaded" && accountSync.message) {
      warnings.push(accountSync.message);
    }
    updateConnectionStatusForUser(check.connectionId, check.userId, "connected");
  } catch (err) {
    const mapped = mapBingXErrorToSafe(err);
    updateConnectionStatusForUser(
      check.connectionId,
      check.userId,
      "error",
      mapped.message,
    );
    const accountSyncStatus: BingXAccountSyncStatus =
      mapped.code === "INSUFFICIENT_PERMISSION" ? "permission_denied" : "unavailable";
    return {
      connectionId: check.connectionId,
      exchange: "bingx",
      mode: "read-only",
      connected: false,
      health: "error",
      connectionHealth: "error",
      accountSync: {
        status: accountSyncStatus,
        message: mapped.message,
      },
      lastSyncTime: Date.now(),
      positions: [],
      openOrders: [],
      riskOrders: [],
      permissions: { read: false, trade: false, withdraw: false },
      warnings: [],
      error: { code: mapped.code, message: mapped.message },
    };
  }

  const sym = symbol?.trim();
  let positions: BingXNormalizedPosition[] = [];
  let openOrders: BingXNormalizedOrder[] = [];

  try {
    positions = mapPositions(await getPositions(credentials, sym));
  } catch {
    connectionHealth = "degraded";
    warnings.push("Positions could not be loaded.");
  }

  try {
    openOrders = mapOrders(await getOpenOrders(credentials, sym));
  } catch {
    connectionHealth = "degraded";
    warnings.push("Open orders could not be loaded.");
  }

  const health: BingXReadOnlyHealth =
    accountSync.status === "loaded" && connectionHealth === "healthy"
      ? "healthy"
      : accountSync.status === "loaded"
        ? connectionHealth
        : connectionHealth === "error"
          ? "error"
          : "degraded";

  updateConnectionHealthForUser(
    check.connectionId,
    check.userId,
    health as BingXConnectionHealth,
  );

  const riskOrders = buildRiskOrdersFromNormalized(positions, openOrders);

  return {
    connectionId: check.connectionId,
    exchange: "bingx",
    mode: "read-only",
    connected: true,
    health,
    connectionHealth,
    accountSync,
    lastSyncTime: Date.now(),
    account,
    positions,
    openOrders,
    riskOrders,
    permissions: { read: true, trade: false, withdraw: false },
    warnings,
  };
}

export async function getBingXReadOnlyRiskDebugShape(
  connectionId: string,
  userId: number,
  symbol?: string,
): Promise<
  | { ok: true; shape: Awaited<ReturnType<typeof buildBingXRiskDebugShape>> }
  | { ok: false; code: string; message: string }
> {
  const check = assertConnection(connectionId, userId);
  if (!check.ok) {
    return { ok: false, code: check.code, message: check.message };
  }
  const credentials = getCredentialsForUser(check.connectionId, check.userId)!;
  const shape = await buildBingXRiskDebugShape(credentials, symbol);
  return { ok: true, shape };
}

export async function getBingXReadOnlySnapshot(
  connectionId: string,
  userId: number,
  symbol?: string,
  options?: { bypassCache?: boolean },
): Promise<BingXReadOnlySnapshot> {
  const cacheKey = `${userId}:${connectionId}:${symbol ?? "all"}`;
  const cached = snapshotCache.get(cacheKey);
  const now = Date.now();
  if (!options?.bypassCache && cached && now - cached.at < SNAPSHOT_CACHE_MS) {
    return cached.data;
  }

  const data = await syncSnapshotCore(connectionId, userId, symbol);
  snapshotCache.set(cacheKey, { at: now, data });
  return data;
}

export async function getBingXReadOnlyHealth(
  connectionId: string,
  userId: number,
  options?: { bypassCache?: boolean },
): Promise<BingXReadOnlyHealthResult> {
  const cacheKey = `${userId}:${connectionId}`;
  const cached = healthCache.get(cacheKey);
  const now = Date.now();
  if (!options?.bypassCache && cached && now - cached.at < HEALTH_CACHE_MS) {
    return cached.data;
  }

  const started = Date.now();
  const base = {
    permissions: { read: true, trade: false as const, withdraw: false as const },
    warnings: [] as string[],
  };

  if (!isBingxApiConnectionEnabled()) {
    const result: BingXReadOnlyHealthResult = {
      success: false,
      health: "error",
      latencyMs: 0,
      lastSyncTime: now,
      ...base,
      permissions: { read: false, trade: false, withdraw: false },
      error: {
        code: "BINGX_API_DISABLED",
        message: "BingX API is disabled.",
        safeReason: "API disabled in configuration",
      },
    };
    healthCache.set(cacheKey, { at: now, data: result });
    return result;
  }

  const check = assertConnection(connectionId, userId);
  if (!check.ok) {
    const result: BingXReadOnlyHealthResult = {
      success: false,
      health: "error",
      latencyMs: 0,
      lastSyncTime: now,
      ...base,
      permissions: { read: false, trade: false, withdraw: false },
      error: {
        code: check.code,
        message: check.message,
        safeReason: check.message,
      },
    };
    healthCache.set(cacheKey, { at: now, data: result });
    return result;
  }

  const credentials = getCredentialsForUser(check.connectionId, check.userId)!;
  const warnings: string[] = [];
  let health: BingXReadOnlyHealth = "healthy";
  let accountOk = false;
  let positionsOk = false;
  let ordersOk = false;

  let balanceLoaded = false;
  try {
    const balanceResult = await getBalances(credentials);
    accountOk = true;
    balanceLoaded =
      balanceResult.parseHint === "ok" && balanceResult.balances.length > 0;
  } catch (err) {
    const mapped = mapBingXErrorToSafe(err);
    const latencyMs = Date.now() - started;
    const result: BingXReadOnlyHealthResult = {
      success: false,
      health: "error",
      latencyMs,
      lastSyncTime: now,
      permissions: { read: false, trade: false, withdraw: false },
      warnings: [],
      error: {
        code: mapped.code,
        message: mapped.message,
        safeReason: mapped.safeReason,
      },
    };
    healthCache.set(cacheKey, { at: now, data: result });
    return result;
  }

  try {
    await getPositions(credentials);
    positionsOk = true;
  } catch {
    warnings.push("Positions endpoint unavailable.");
  }

  try {
    await getOpenOrders(credentials);
    ordersOk = true;
  } catch {
    warnings.push("Open orders endpoint unavailable.");
  }

  if (!positionsOk || !ordersOk) {
    health = "degraded";
  }
  if (!balanceLoaded) {
    health = health === "error" ? "error" : "degraded";
    warnings.push(
      "API connected but futures balance was not loaded. Check read permissions or account type.",
    );
  }

  const latencyMs = Date.now() - started;
  if (latencyMs > HIGH_LATENCY_MS) {
    health = health === "error" ? "error" : "degraded";
    warnings.push(`High API latency (${latencyMs}ms).`);
  }

  updateConnectionHealthForUser(
    check.connectionId,
    check.userId,
    health as BingXConnectionHealth,
  );

  const result: BingXReadOnlyHealthResult = {
    success: accountOk,
    health,
    latencyMs,
    lastSyncTime: now,
    permissions: { read: true, trade: false, withdraw: false },
    warnings,
  };

  healthCache.set(cacheKey, { at: now, data: result });
  return result;
}

export function clearBingXReadOnlyCache(connectionId?: string, userId?: number): void {
  if (!connectionId && userId == null) {
    snapshotCache.clear();
    healthCache.clear();
    return;
  }
  for (const key of snapshotCache.keys()) {
    if (connectionId && key.includes(`:${connectionId}:`)) {
      snapshotCache.delete(key);
      continue;
    }
    if (userId != null && key.startsWith(`${userId}:`)) {
      snapshotCache.delete(key);
    }
  }
  if (userId != null && connectionId) {
    healthCache.delete(`${userId}:${connectionId}`);
  }
}
