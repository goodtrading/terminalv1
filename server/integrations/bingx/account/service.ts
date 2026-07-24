import type {
  BingxAccountSnapshot,
  BingxSafeConnectionStatus,
  BingxPermissionsClassification,
} from "../../../../shared/goodTradingAiBingxAccount";
import {
  getConnectionForUser,
  getCredentialsForUser,
  listConnectionsForUser,
} from "../../../services/exchanges/bingx/bingxCredentialStore";
import { BingxAccountTransport, withBoundedBackoff } from "./transport";
import { BINGX_PATHS } from "./allowlist";
import {
  normalizeBalances,
  normalizeFills,
  normalizeOpenOrders,
  normalizeOrderHistory,
  normalizePositions,
  toPublicFill,
  toPublicOrder,
} from "./normalizers";
import { pseudonymizeId } from "./redact";
import { reconcileAccountSnapshots } from "./reconciliation";
import {
  deriveCompleteness,
  getCachedSnapshot,
  setCachedSnapshot,
} from "./readModel";
import { appendTimelineEvents } from "./timeline";
import {
  isBingxAccountEnabled,
  isBingxReadOnlyMode,
  BINGX_ACCOUNT_FILLS_CAP,
  BINGX_ACCOUNT_HISTORY_CAP,
} from "./flags";
import { BingxAccountError } from "./errors";
import { timed, recordBingxLatency } from "./metrics";
import { logBingxAccount } from "./observability";
import { isolateRealSnapshot } from "./isolation";
import { assertAiBoundaryDisabled } from "./aiBoundary";

function userSalt(userId: number): string {
  return `u${userId}`;
}

export function getSafeConnectionStatus(
  userId: number,
  connectionId?: string,
): BingxSafeConnectionStatus {
  assertAiBoundaryDisabled();
  const enabled = isBingxAccountEnabled();
  const connections = listConnectionsForUser(userId);
  const conn = connectionId
    ? getConnectionForUser(connectionId, userId)
    : connections[0] ?? null;

  let permissionsClassification: BingxPermissionsClassification = "unknown";
  if (conn) {
    if (conn.readOnly && !conn.permissions.trading) {
      permissionsClassification = "read_only";
    } else if (conn.permissions.trading) {
      permissionsClassification = "trading_capable";
    } else if (conn.status === "error") {
      permissionsClassification = "insufficient";
    }
  }

  return {
    configured: Boolean(conn),
    connected: conn?.status === "connected",
    enabled,
    readOnlyMode: true,
    permissionsClassification,
    lastValidatedAt: conn?.lastValidatedAt,
    errorCode: conn?.lastError,
    apiKeyMasked: conn?.apiKeyMasked,
    accountMode: "REAL_BINGX_READ_ONLY",
    mentorEligible: false,
    aiConsumptionEnabled: false,
  };
}

async function fetchSlice<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await withBoundedBackoff(fn, { maxAttempts: 2 });
    return { ok: true, data };
  } catch (err) {
    const code =
      err instanceof BingxAccountError ? err.code : "BINGX_TRANSPORT_ERROR";
    logBingxAccount("slice_failed", { label, code });
    return { ok: false, error: code };
  }
}

export async function refreshBingxAccountSnapshot(args: {
  userId: number;
  connectionId: string;
  symbol?: string;
}): Promise<BingxAccountSnapshot> {
  assertAiBoundaryDisabled();
  if (!isBingxAccountEnabled()) {
    throw new BingxAccountError(
      "BingX account integration disabled",
      "BINGX_ACCOUNT_DISABLED",
    );
  }
  if (!isBingxReadOnlyMode()) {
    // Still enforce read-only adapter behavior; flag should stay true.
    logBingxAccount("warn_read_only_flag_off", {});
  }

  const started = Date.now();
  const { userId, connectionId, symbol } = args;
  const conn = getConnectionForUser(connectionId, userId);
  if (!conn) {
    throw new BingxAccountError(
      "Connection not found",
      "BINGX_CONNECTION_NOT_FOUND",
    );
  }
  const credentials = getCredentialsForUser(connectionId, userId);
  if (!credentials) {
    throw new BingxAccountError(
      "Credentials unavailable",
      "BINGX_ACCOUNT_NOT_CONFIGURED",
    );
  }

  const transport = new BingxAccountTransport(credentials);
  const salt = userSalt(userId);
  const accountId = pseudonymizeId("account", connectionId, salt);
  const previous = getCachedSnapshot(userId, connectionId);

  const params = symbol ? { symbol } : {};

  const balanceRes = await timed("fetch_balance_ms", () =>
    fetchSlice("balance", () =>
      transport.privateGet<unknown>(BINGX_PATHS.BALANCE, {}),
    ),
  );
  const positionsRes = await timed("fetch_positions_ms", () =>
    fetchSlice("positions", () =>
      transport.privateGet<unknown>(BINGX_PATHS.POSITIONS, params),
    ),
  );
  const openOrdersRes = await timed("fetch_orders_ms", () =>
    fetchSlice("openOrders", () =>
      transport.privateGet<unknown>(BINGX_PATHS.OPEN_ORDERS, params),
    ),
  );
  const historyRes = await timed("fetch_orders_ms", () =>
    fetchSlice("history", () =>
      transport.privateGet<unknown>(BINGX_PATHS.ALL_ORDERS, {
        ...params,
        limit: BINGX_ACCOUNT_HISTORY_CAP,
      }),
    ),
  );
  const fillsRes = await timed("fetch_fills_ms", () =>
    fetchSlice("fills", () =>
      transport.privateGet<unknown>(BINGX_PATHS.ALL_FILLS, {
        ...params,
        limit: BINGX_ACCOUNT_FILLS_CAP,
      }),
    ),
  );

  const completeness = deriveCompleteness({
    balanceOk: balanceRes.ok,
    positionsOk: positionsRes.ok,
    openOrdersOk: openOrdersRes.ok,
    historyOk: historyRes.ok,
    fillsOk: fillsRes.ok,
  });

  const capturedAt = new Date().toISOString();
  const stale = completeness !== "COMPLETE";
  const warnings: string[] = [];
  if (!balanceRes.ok) warnings.push(`balance:${balanceRes.error}`);
  if (!positionsRes.ok) warnings.push(`positions:${positionsRes.error}`);
  if (!openOrdersRes.ok) warnings.push(`openOrders:${openOrdersRes.error}`);
  if (!historyRes.ok) warnings.push(`history:${historyRes.error}`);
  if (!fillsRes.ok) warnings.push(`fills:${fillsRes.error}`);

  const balances = balanceRes.ok ? normalizeBalances(balanceRes.data) : [];
  const positions = positionsRes.ok
    ? normalizePositions(positionsRes.data, accountId, salt, stale)
    : [];
  const privateOrders = openOrdersRes.ok
    ? normalizeOpenOrders(openOrdersRes.data, accountId, salt, stale)
    : [];
  const openOrders = privateOrders.map(toPublicOrder);
  const recentOrders = historyRes.ok
    ? normalizeOrderHistory(historyRes.data, accountId, salt)
    : [];
  const privateFills = fillsRes.ok
    ? normalizeFills(fillsRes.data, accountId, salt)
    : [];
  const recentFills = privateFills.map(toPublicFill);

  const healthStatus =
    completeness === "UNAVAILABLE"
      ? "unavailable"
      : completeness === "DEGRADED"
        ? "degraded"
        : warnings.length
          ? "degraded"
          : "healthy";

  let permissionsClassification: BingxPermissionsClassification =
    conn.readOnly && !conn.permissions.trading
      ? "read_only"
      : conn.permissions.trading
        ? "trading_capable"
        : "unknown";

  const partialSnapshot = {
    accountId,
    positions,
    openOrders,
    recentFills,
    capturedAt,
    completeness,
  };

  const reconciliationVersion = (previous?.reconciliation?.version ?? 0) + 1;
  const reconciliation = timedSync("reconcile_ms", () =>
    reconcileAccountSnapshots(
      previous,
      partialSnapshot,
      reconciliationVersion,
    ),
  );

  appendTimelineEvents(userId, accountId, reconciliation.events);

  const snapshot: BingxAccountSnapshot = isolateRealSnapshot({
    accountId,
    connectionId,
    exchange: "bingx",
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
    completeness,
    health: {
      status: healthStatus,
      connected: healthStatus !== "unavailable",
      configured: true,
      permissionsClassification,
      lastValidatedAt: conn.lastValidatedAt ?? capturedAt,
      lastSyncAt: capturedAt,
      sourceAgeMs: 0,
      stale,
      clockDriftMs: transport.getLastClockDriftMs(),
      errorCode: warnings[0],
      warnings,
    },
    balances,
    positions,
    openOrders,
    recentOrders,
    recentFills,
    capturedAt,
    sourceAgeMs: 0,
    reconciliation,
    mentorEligible: false,
    aiConsumptionEnabled: false,
    canUseForMentor: false,
    canUseForLearning: false,
  });

  setCachedSnapshot(userId, connectionId, snapshot);

  // AI-8.1 — Decision Context Recorder (record-only; flags false; no Mentor/Brain)
  try {
    const { recordFromBingxReconciliation } = await import(
      "../../../ai/goodTradingAi/decisionContext"
    );
    await recordFromBingxReconciliation({ userId, snapshot });
  } catch (err) {
    logBingxAccount("decision_context_record_failed", {
      code: err instanceof Error ? err.message.slice(0, 80) : "unknown",
    });
  }

  const totalMs = Date.now() - started;
  recordBingxLatency("refresh_total_ms", totalMs);
  logBingxAccount("refresh_done", {
    userId,
    connectionId: pseudonymizeId("connection", connectionId, salt),
    completeness,
    positionCount: positions.length,
    openOrderCount: openOrders.length,
    fillCount: recentFills.length,
    eventCount: reconciliation.events.length,
    totalMs,
  });

  return snapshot;
}

function timedSync<T>(key: "reconcile_ms" | "normalize_ms", fn: () => T): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    recordBingxLatency(key, Date.now() - start);
  }
}

export async function getBingxAccountSnapshot(args: {
  userId: number;
  connectionId: string;
  bypassCache?: boolean;
  symbol?: string;
}): Promise<BingxAccountSnapshot> {
  if (!isBingxAccountEnabled()) {
    throw new BingxAccountError(
      "BingX account integration disabled",
      "BINGX_ACCOUNT_DISABLED",
    );
  }
  if (!args.bypassCache) {
    const cached = getCachedSnapshot(args.userId, args.connectionId);
    if (cached) {
      const age = Date.now() - Date.parse(cached.capturedAt);
      return {
        ...cached,
        sourceAgeMs: Number.isFinite(age) ? Math.max(0, age) : cached.sourceAgeMs,
        health: {
          ...cached.health,
          sourceAgeMs: Number.isFinite(age) ? Math.max(0, age) : undefined,
          stale: Number.isFinite(age) ? age > 30_000 : cached.health.stale,
        },
      };
    }
  }
  return refreshBingxAccountSnapshot(args);
}
