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
import {
  buildAccountDataQuality,
  deriveConnectionState,
  filterDisplayOpenOrders,
  mapOpenOrderRow,
  mapPositionRow,
  parseFinancialNumber,
  SNAPSHOT_STALE_MS,
  type BingxConnectionState,
} from "./bingxNormalize";

export type { BingXNormalizedRiskOrder } from "./bingxRiskOrders";

export type BingXReadOnlyHealth = "healthy" | "degraded" | "error";

export type BingXAccountSyncStatus =
  | "loaded"
  | "unavailable"
  | "empty"
  | "permission_denied"
  | "parser_mismatch";

export interface BingXNormalizedPosition {
  id: string;
  symbol: string;
  positionSide?: "LONG" | "SHORT" | "BOTH";
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
  status:
    | "open"
    | "partially_filled"
    | "filled"
    | "cancelled"
    | "expired"
    | "rejected"
    | "unknown";
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
  connectionState: BingxConnectionState;
  health: BingXReadOnlyHealth;
  lastSyncTime: number;
  freshness: {
    lastSyncTime: number;
    ageMs: number;
    stale: boolean;
    staleAfterMs: number;
  };
  dataQuality?: {
    status: "complete" | "partial" | "missing" | "stale";
    missingFields: string[];
    warnings: string[];
  };
  partialFailures?: {
    positions?: string;
    orders?: string;
  };
  positionsUnavailable?: boolean;
  openOrdersUnavailable?: boolean;
  unknownOrders?: BingXNormalizedOrder[];
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

type SnapshotSyncFn = (
  connectionId: string,
  userId: number,
  symbol?: string,
) => Promise<BingXReadOnlySnapshot>;

let snapshotSyncOverride: SnapshotSyncFn | null = null;

/** Test seam — mock upstream BingX sync without HTTP. */
export function __setSnapshotSyncForTests(fn: SnapshotSyncFn | null): void {
  snapshotSyncOverride = fn;
}

export function __getSnapshotCacheMsForTests(): number {
  return SNAPSHOT_CACHE_MS;
}

const snapshotCache = new Map<string, { at: number; data: BingXReadOnlySnapshot }>();
const healthCache = new Map<string, { at: number; data: BingXReadOnlyHealthResult }>();

function buildSnapshotFreshness(lastSyncTime: number, now = Date.now()) {
  const ageMs = Math.max(0, now - lastSyncTime);
  return {
    lastSyncTime,
    ageMs,
    stale: ageMs > SNAPSHOT_STALE_MS,
    staleAfterMs: SNAPSHOT_STALE_MS,
  };
}

function applySnapshotFreshness(
  snapshot: BingXReadOnlySnapshot,
  now = Date.now(),
): BingXReadOnlySnapshot {
  const freshness = buildSnapshotFreshness(snapshot.lastSyncTime, now);
  const authError =
    snapshot.error?.code === "INVALID_API_KEY" ||
    snapshot.error?.code === "INVALID_SIGNATURE" ||
    snapshot.error?.code === "INSUFFICIENT_PERMISSION";
  let connectionState = deriveConnectionState({
    connected: snapshot.connected,
    health: snapshot.health,
    lastSyncTime: snapshot.lastSyncTime,
    now,
    authError,
  });
  if (freshness.stale && snapshot.connected && connectionState === "CONNECTED") {
    connectionState = "STALE";
  }

  let dataQuality = snapshot.dataQuality;
  if (freshness.stale) {
    if (dataQuality) {
      dataQuality = {
        ...dataQuality,
        status: dataQuality.status === "complete" ? "stale" : dataQuality.status,
        warnings: [...dataQuality.warnings, "Snapshot is stale."],
      };
    } else {
      dataQuality = {
        status: "stale",
        missingFields: [],
        warnings: ["Snapshot is stale."],
      };
    }
  }

  return {
    ...snapshot,
    freshness,
    connectionState,
    dataQuality,
  };
}

function emptyReadOnlySnapshot(
  connectionId: string,
  overrides: Partial<BingXReadOnlySnapshot> = {},
): BingXReadOnlySnapshot {
  const now = Date.now();
  const base: BingXReadOnlySnapshot = {
    connectionId,
    exchange: "bingx",
    mode: "read-only",
    connected: false,
    connectionState: "DISCONNECTED",
    health: "error",
    connectionHealth: "error",
    accountSync: { status: "unavailable" },
    lastSyncTime: now,
    freshness: buildSnapshotFreshness(now, now),
    positions: [],
    openOrders: [],
    riskOrders: [],
    permissions: { read: false, trade: false, withdraw: false },
    warnings: [],
  };
  const merged = { ...base, ...overrides };
  return applySnapshotFreshness(merged, now);
}

function logBingXLimitDiagnostic(payload: Record<string, unknown>): void {
  console.debug("[BINGX_LIMIT_DIAG][readonly]", payload);
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
    .map((p) =>
      mapPositionRow(p as unknown as Record<string, unknown>, {
        stopLossPrice: p.stopLossPrice,
        takeProfitPrice: p.takeProfitPrice,
      }),
    )
    .filter((p): p is BingXNormalizedPosition => p != null);
}

function mapOrders(
  rows: Awaited<ReturnType<typeof getOpenOrders>>,
): BingXNormalizedOrder[] {
  logBingXLimitDiagnostic({
    stage: "map_orders_input",
    count: rows.length,
  });

  const mapped = rows
    .map((o) => mapOpenOrderRow(o as unknown as Record<string, unknown>))
    .filter((o): o is NonNullable<typeof o> => o != null);

  const { openOrders, unknownOrders } = filterDisplayOpenOrders(mapped);

  if (unknownOrders.length > 0) {
    logBingXLimitDiagnostic({
      stage: "map_orders_unknown",
      count: unknownOrders.length,
    });
  }

  return openOrders.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    status: o.status,
    price: o.price,
    triggerPrice: o.triggerPrice,
    stopPrice: o.stopPrice,
    quantity: o.quantity,
    reduceOnly: o.reduceOnly,
    createdTime: undefined,
  }));
}

function mapUnknownOrders(
  rows: Awaited<ReturnType<typeof getOpenOrders>>,
): BingXNormalizedOrder[] {
  const mapped = rows
    .map((o) => mapOpenOrderRow(o as unknown as Record<string, unknown>))
    .filter((o): o is NonNullable<typeof o> => o != null);
  const { unknownOrders } = filterDisplayOpenOrders(mapped);
  return unknownOrders.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    status: "unknown" as const,
    price: o.price,
    triggerPrice: o.triggerPrice,
    stopPrice: o.stopPrice,
    quantity: o.quantity,
    reduceOnly: o.reduceOnly,
  }));
}

function buildAccountFromBalances(
  balances: Awaited<ReturnType<typeof getBalances>>["balances"],
  parseHint: BingXBalanceParseHint,
): {
  account?: BingXReadOnlySnapshot["account"];
  accountSync: BingXReadOnlySnapshot["accountSync"];
  dataQuality: NonNullable<BingXReadOnlySnapshot["dataQuality"]>;
} {
  if (parseHint === "parser_mismatch") {
    return {
      accountSync: {
        status: "parser_mismatch",
        message:
          "Connected, but balance data could not be parsed. Report this if your futures wallet has funds.",
      },
      dataQuality: buildAccountDataQuality({ parseHint: "parser_mismatch" }),
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
      dataQuality: buildAccountDataQuality({}),
    };
  }

  const balanceParsed = parseFinancialNumber(primary.walletBalance);
  const availableParsed = parseFinancialNumber(primary.availableBalance);
  const equityParsed = parseFinancialNumber(primary.equity ?? primary.walletBalance);
  const unrealizedParsed =
    primary.unrealizedPnl != null
      ? parseFinancialNumber(primary.unrealizedPnl)
      : { present: false, valid: false, value: null };

  const balanceUsdt = balanceParsed.valid ? balanceParsed.value ?? undefined : undefined;
  const availableMarginUsdt = availableParsed.valid ? availableParsed.value ?? undefined : undefined;
  const equityUsdt = equityParsed.valid ? equityParsed.value ?? undefined : undefined;
  const unrealizedPnlUsdt = unrealizedParsed.valid ? unrealizedParsed.value ?? undefined : undefined;

  const marginUsedUsdt =
    equityUsdt != null && availableMarginUsdt != null
      ? Math.max(0, equityUsdt - availableMarginUsdt)
      : undefined;

  const dataQuality = buildAccountDataQuality({
    equity: equityUsdt,
    balance: balanceUsdt,
    availableMargin: availableMarginUsdt,
    unrealizedPnl: unrealizedPnlUsdt,
    parseHint,
  });

  const allZero =
    equityUsdt === 0 &&
    availableMarginUsdt === 0 &&
    balanceUsdt === 0 &&
    (unrealizedPnlUsdt == null || unrealizedPnlUsdt === 0);

  const accountSync: BingXReadOnlySnapshot["accountSync"] =
    allZero && balanceParsed.valid && equityParsed.valid
      ? { status: "empty", message: "Futures wallet balance is zero." }
      : dataQuality.status === "missing"
        ? {
            status: "unavailable",
            message: "Balance fields missing from BingX response.",
          }
        : { status: "loaded" };

  return {
    account: {
      equityUsdt,
      balanceUsdt,
      availableMarginUsdt,
      marginUsedUsdt,
      unrealizedPnlUsdt,
    },
    accountSync,
    dataQuality,
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
    return emptyReadOnlySnapshot(connectionId, {
      error: {
        code: "BINGX_API_DISABLED",
        message: "BingX API connection is disabled on the server.",
      },
    });
  }

  const check = assertConnection(connectionId, userId);
  if (!check.ok) {
    return emptyReadOnlySnapshot(connectionId, {
      error: { code: check.code, message: check.message },
    });
  }

  const credentials = getCredentialsForUser(check.connectionId, check.userId)!;
  const warnings: string[] = [];
  let connectionHealth: BingXReadOnlyHealth = "healthy";

  let account: BingXReadOnlySnapshot["account"];
  let accountSync: BingXReadOnlySnapshot["accountSync"] = { status: "unavailable" };
  let dataQuality: NonNullable<BingXReadOnlySnapshot["dataQuality"]> = {
    status: "missing",
    missingFields: [],
    warnings: [],
  };
  try {
    const balanceResult = await getBalances(credentials);
    const built = buildAccountFromBalances(
      balanceResult.balances,
      balanceResult.parseHint,
    );
    account = built.account;
    accountSync = built.accountSync;
    dataQuality = built.dataQuality;
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
    return emptyReadOnlySnapshot(check.connectionId, {
      connectionState: mapped.code === "INVALID_API_KEY" || mapped.code === "INVALID_SIGNATURE"
        ? "UNAUTHORIZED"
        : "ERROR",
      accountSync: {
        status: accountSyncStatus,
        message: mapped.message,
      },
      error: { code: mapped.code, message: mapped.message },
    });
  }

  const sym = symbol?.trim();
  let positions: BingXNormalizedPosition[] = [];
  let openOrders: BingXNormalizedOrder[] = [];
  let unknownOrders: BingXNormalizedOrder[] = [];
  let positionsUnavailable = false;
  let openOrdersUnavailable = false;
  const partialFailures: BingXReadOnlySnapshot["partialFailures"] = {};
  let rawOrders: Awaited<ReturnType<typeof getOpenOrders>> = [];

  try {
    positions = mapPositions(await getPositions(credentials, sym));
  } catch {
    connectionHealth = "degraded";
    positionsUnavailable = true;
    partialFailures.positions = "BINGX_SNAPSHOT_PARTIAL";
    warnings.push("Positions could not be loaded.");
  }

  try {
    rawOrders = await getOpenOrders(credentials, sym);
    openOrders = mapOrders(rawOrders);
    unknownOrders = mapUnknownOrders(rawOrders);
    logBingXLimitDiagnostic({
      stage: "snapshot_open_orders",
      symbol: sym ?? null,
      count: openOrders.length,
      unknown: unknownOrders.length,
    });
  } catch {
    connectionHealth = "degraded";
    openOrdersUnavailable = true;
    partialFailures.orders = "BINGX_SNAPSHOT_PARTIAL";
    warnings.push("Open orders could not be loaded.");
  }

  const syncTime = Date.now();
  const freshness = {
    lastSyncTime: syncTime,
    ageMs: 0,
    stale: false,
    staleAfterMs: SNAPSHOT_STALE_MS,
  };

  const health: BingXReadOnlyHealth =
    accountSync.status === "loaded" && connectionHealth === "healthy"
      ? "healthy"
      : accountSync.status === "loaded"
        ? connectionHealth
        : "degraded";

  if (dataQuality.status === "partial" || dataQuality.status === "missing") {
    dataQuality = { ...dataQuality, status: health === "healthy" ? "partial" : dataQuality.status };
  }

  updateConnectionHealthForUser(
    check.connectionId,
    check.userId,
    health as BingXConnectionHealth,
  );

  const riskOrders = buildRiskOrdersFromNormalized(positions, openOrders);
  const connectionState = deriveConnectionState({
    connected: true,
    health,
    lastSyncTime: syncTime,
    now: syncTime,
  });

  return {
    connectionId: check.connectionId,
    exchange: "bingx",
    mode: "read-only",
    connected: true,
    connectionState,
    health,
    connectionHealth,
    accountSync,
    lastSyncTime: syncTime,
    freshness,
    dataQuality,
    partialFailures: Object.keys(partialFailures).length ? partialFailures : undefined,
    positionsUnavailable,
    openOrdersUnavailable,
    account,
    positions,
    openOrders,
    unknownOrders: unknownOrders.length ? unknownOrders : undefined,
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
    return applySnapshotFreshness(cached.data, now);
  }

  const data = snapshotSyncOverride
    ? await snapshotSyncOverride(connectionId, userId, symbol)
    : await syncSnapshotCore(connectionId, userId, symbol);
  const fresh = applySnapshotFreshness(data, now);
  snapshotCache.set(cacheKey, { at: now, data: fresh });
  return fresh;
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
    health = "degraded";
    warnings.push(
      "API connected but futures balance was not loaded. Check read permissions or account type.",
    );
  }

  const latencyMs = Date.now() - started;
  if (latencyMs > HIGH_LATENCY_MS) {
    health = "degraded";
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

export function __applySnapshotFreshnessForTests(
  snapshot: BingXReadOnlySnapshot,
  now = Date.now(),
): BingXReadOnlySnapshot {
  return applySnapshotFreshness(snapshot, now);
}

export function clearBingXReadOnlyCache(connectionId?: string, userId?: number): void {
  if (!connectionId && userId == null) {
    snapshotCache.clear();
    healthCache.clear();
    return;
  }
  for (const key of Array.from(snapshotCache.keys())) {
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
