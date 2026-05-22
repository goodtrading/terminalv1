import type { BingXPermissionProbe } from "./bingxApiPermissionProbe";
import type { StoredBingXConnection } from "./bingxTypes";
import {
  getLiveTradingEnvFlags,
  isApiTradingEnabled,
  isKillSwitchActive,
  isLiveTradingEnabled,
  isOrderSubmitEnabled,
} from "../../execution/riskGuard";

export type BingXConnectionMode = "read-only" | "secure-api";

export type BingXConnectionPermissions = {
  readOnly: boolean;
  trading: boolean;
};

export function resolveConnectionModeFromProbe(
  probe: Pick<BingXPermissionProbe, "tradePermission">,
): BingXConnectionMode {
  return probe.tradePermission === "confirmed" ? "secure-api" : "read-only";
}

export function tradingPermissionConfirmedFromProbe(
  probe: Pick<BingXPermissionProbe, "tradePermission">,
): boolean {
  return probe.tradePermission === "confirmed";
}

export function resolveConnectionCapability(
  probe: BingXPermissionProbe,
): {
  connectionMode: BingXConnectionMode;
  readOnly: boolean;
  tradingPermissionConfirmed: boolean;
  permissions: BingXConnectionPermissions;
  tradingEnabled: boolean;
} {
  const tradingPermissionConfirmed = tradingPermissionConfirmedFromProbe(probe);
  const connectionMode = resolveConnectionModeFromProbe(probe);
  const readOnly = !tradingPermissionConfirmed;
  const flags = getLiveTradingEnvFlags();

  const tradingEnabled =
    tradingPermissionConfirmed &&
    flags.liveTradingEnabled &&
    flags.apiTradingEnabled &&
    flags.orderSubmitEnabled &&
    !isKillSwitchActive();

  return {
    connectionMode,
    readOnly,
    tradingPermissionConfirmed,
    permissions: {
      readOnly,
      trading: tradingPermissionConfirmed,
    },
    tradingEnabled,
  };
}

/** Recompute tradingEnabled from stored permission + current env flags. */
export function resolveTradingEnabledFromStored(
  row: Pick<StoredBingXConnection, "tradingPermissionConfirmed">,
): boolean {
  if (!row.tradingPermissionConfirmed) return false;
  return (
    isLiveTradingEnabled() &&
    isApiTradingEnabled() &&
    isOrderSubmitEnabled() &&
    !isKillSwitchActive()
  );
}

export function normalizeStoredConnectionFields(
  raw: StoredBingXConnection,
): StoredBingXConnection {
  const tradingPermissionConfirmed =
    raw.tradingPermissionConfirmed ??
    (raw.permissions?.trading === true || raw.mode === "secure-api");
  const connectionMode: BingXConnectionMode =
    raw.connectionMode ??
    (tradingPermissionConfirmed ? "secure-api" : "read-only");
  const readOnly = raw.readOnly ?? !tradingPermissionConfirmed;

  return {
    ...raw,
    connectionMode,
    tradingPermissionConfirmed,
    readOnly,
    permissions: {
      readOnly,
      trading: tradingPermissionConfirmed,
    },
    tradingEnabled: resolveTradingEnabledFromStored({
      tradingPermissionConfirmed,
    }),
  };
}

export function isReadOnlyBingXConnection(
  conn: Pick<
    StoredBingXConnection,
    "connectionMode" | "readOnly" | "tradingPermissionConfirmed"
  >,
): boolean {
  const row = normalizeStoredConnectionFields(conn as StoredBingXConnection);
  return row.readOnly || row.connectionMode === "read-only";
}
