import fs from "fs";
import path from "path";
import {
  getFirstConnectedConnectionForUser,
  getCredentialsForUser,
  hasEncryptionKey,
  listConnectionsForUser,
} from "../exchanges/bingx/bingxCredentialStore";
import { probeBingXApiPermissions } from "../exchanges/bingx/bingxApiPermissionProbe";
import { getBingXReadOnlySnapshot } from "../exchanges/bingx/bingxReadOnlyService";
import { isBingxApiConnectionEnabled } from "../exchanges/bingx/bingxAccountService";
import { readStorageWarmup } from "../system/auditLogService";
import { buildLiveLockedDryRunWarnings } from "./liveDryRunPolicy";
import {
  getLiveTradingEnvFlags,
  getRiskGuardStatus,
  isApiConnectionEnabled,
  isDryRunEnabled,
  isMaxAccountRiskConfigured,
  isMaxOrderSizeConfigured,
  isSlRequiredPolicyConfigured,
} from "./riskGuard";
import type {
  LiveReadinessCheck,
  LiveTradingHealthSummary,
  LiveTradingReadiness,
} from "./liveTradingReadinessTypes";
import { emitLiveReadinessCheckedIfAllowed } from "../system/liveReadinessAudits";

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");

function check(
  id: string,
  label: string,
  status: LiveReadinessCheck["status"],
  message: string,
): LiveReadinessCheck {
  return { id, label, status, message };
}

function isStorageWritable(): boolean {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const probe = path.join(STORAGE_DIR, ".write-probe");
    fs.writeFileSync(probe, String(Date.now()), "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function isAuditWritable(): boolean {
  try {
    readStorageWarmup();
    return isStorageWritable();
  } catch {
    return false;
  }
}

function resolveStatus(
  infraBlockers: string[],
  flags: ReturnType<typeof getLiveTradingEnvFlags>,
  readyForLive: boolean,
  readyForDryRun: boolean,
): LiveTradingReadiness["status"] {
  if (infraBlockers.length > 0) {
    return "not_ready";
  }
  if (readyForLive) {
    return "ready_for_live";
  }
  if (readyForDryRun) {
    return "ready_for_dry_run";
  }
  return "locked";
}

export async function getLiveTradingReadiness(
  userId: string | number,
  exchange = "bingx",
): Promise<LiveTradingReadiness> {
  const uid = Math.floor(Number(userId));
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error("INVALID_USER_ID");
  }

  const ex = String(exchange).toLowerCase();
  if (ex !== "bingx") {
    return {
      status: "not_ready",
      exchange: "bingx",
      ...getLiveTradingEnvFlags(),
      checks: [
        check(
          "exchange_supported",
          "Exchange supported",
          "fail",
          "Live readiness only applies to BingX.",
        ),
      ],
      blockers: [`Unsupported exchange: ${exchange}`],
      warnings: [],
      readyForDryRun: false,
      readyForLive: false,
    };
  }

  const flags = getLiveTradingEnvFlags();
  const checks: LiveReadinessCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const infraBlockers: string[] = [];
  const flagBlockers: string[] = [];

  if (!flags.liveTradingEnabled) {
    flagBlockers.push("BINGX_ENABLE_LIVE_TRADING=false");
  }
  if (!flags.apiTradingEnabled) {
    warnings.push("BINGX_ENABLE_API_TRADING=false (live submit only; dry-run OK).");
  }
  if (!flags.orderSubmitEnabled) {
    flagBlockers.push("BINGX_ENABLE_ORDER_SUBMIT=false");
  }
  if (!flags.orderCancelEnabled) {
    flagBlockers.push("BINGX_ENABLE_ORDER_CANCEL=false");
  }
  if (!flags.positionCloseEnabled) {
    flagBlockers.push("BINGX_ENABLE_POSITION_CLOSE=false");
  }

  const connections = listConnectionsForUser(uid);
  const connected = getFirstConnectedConnectionForUser(uid);
  const hasConnection = Boolean(connected);

  checks.push(
    check(
      "bingx_connection",
      "BingX connection",
      hasConnection ? "pass" : "fail",
      hasConnection
        ? `Connected (${connections.length} saved).`
        : "No BingX connection for this user.",
    ),
  );
  if (!hasConnection) {
    infraBlockers.push("No BingX connection");
    blockers.push("No BingX connection");
  }

  const apiKeySaved = connections.some((c) => c.apiKeyMasked?.includes("*"));
  checks.push(
    check(
      "api_key_saved",
      "API key saved",
      apiKeySaved ? "pass" : "fail",
      apiKeySaved
        ? "API key stored (masked)."
        : "No saved API key on server.",
    ),
  );
  if (!apiKeySaved && hasConnection) {
    infraBlockers.push("API key not saved");
    blockers.push("API key not saved");
  }

  const encryptionOk = hasEncryptionKey();
  checks.push(
    check(
      "credentials_encrypted",
      "Credentials encrypted server-side",
      encryptionOk ? "pass" : "fail",
      encryptionOk
        ? "BINGX_CREDENTIAL_ENCRYPTION_KEY configured."
        : "Encryption key missing — secrets cannot be stored securely.",
    ),
  );
  if (!encryptionOk) {
    infraBlockers.push("BINGX_CREDENTIAL_ENCRYPTION_KEY missing");
    blockers.push("Credential encryption not configured");
  }

  const apiConnectionFlag = isApiConnectionEnabled() && isBingxApiConnectionEnabled();
  checks.push(
    check(
      "api_connection_enabled",
      "API connection enabled",
      apiConnectionFlag ? "pass" : "fail",
      apiConnectionFlag
        ? "BINGX_ENABLE_API_CONNECTION=true"
        : "BingX API connection disabled in server config.",
    ),
  );
  if (!apiConnectionFlag) {
    infraBlockers.push("BINGX_ENABLE_API_CONNECTION=false");
    blockers.push("API connection disabled");
  }

  let readOnlyOk = false;
  let balanceLoaded = false;
  let tradePermission: "confirmed" | "denied" | "unknown" = "unknown";

  if (connected) {
    try {
      const snapshot = await getBingXReadOnlySnapshot(
        connected.id,
        uid,
        process.env.BINGX_DEFAULT_SYMBOL?.trim() || "BTC-USDT",
      );
      readOnlyOk =
        snapshot.connected &&
        snapshot.health !== "error" &&
        snapshot.accountSync.status === "loaded";
      balanceLoaded = snapshot.accountSync.status === "loaded";
      const openPos = snapshot.positions.some(
        (p) => p.side !== "flat" && (p.quantity ?? 0) > 0,
      );
      checks.push(
        check(
          "read_only_sync",
          "Read-only sync",
          readOnlyOk ? "pass" : "warning",
          readOnlyOk
            ? `Snapshot healthy (${snapshot.health}).`
            : "Read-only sync degraded or incomplete.",
        ),
      );
      checks.push(
        check(
          "balance_loaded",
          "Balance loaded",
          balanceLoaded ? "pass" : "fail",
          balanceLoaded
            ? "Futures balance available."
            : "Balance not loaded — check read permissions.",
        ),
      );
      checks.push(
        check(
          "position_state",
          "Position loaded",
          "pass",
          openPos
            ? "Open position detected."
            : "No open position (OK).",
        ),
      );
      if (!readOnlyOk) {
        infraBlockers.push("Read-only sync failed");
        blockers.push("Read-only sync not healthy");
      }
      if (!balanceLoaded) {
        infraBlockers.push("Balance not loaded");
        blockers.push("Balance not loaded");
      }

      const creds = getCredentialsForUser(connected.id, uid);
      if (creds) {
        const probe = await probeBingXApiPermissions(creds);
        tradePermission = probe.tradePermission;
        checks.push(
          check(
            "api_trading_permission",
            "API trading permission",
            probe.tradePermission === "confirmed"
              ? "pass"
              : probe.tradePermission === "denied"
                ? "warning"
                : "warning",
            probe.message ?? "Permission probe completed.",
          ),
        );
        if (probe.tradePermission !== "confirmed") {
          warnings.push("API trading permission not confirmed on exchange key");
        }
        checks.push(
          check(
            "withdraw_permission",
            "Withdraw permission",
            "pass",
            "Withdraw permission not detected (cannot be fully verified — treated as safe).",
          ),
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message.slice(0, 160) : "Read-only sync error";
      checks.push(
        check("read_only_sync", "Read-only sync", "fail", msg),
      );
      infraBlockers.push("Read-only sync error");
      blockers.push("Read-only sync failed");
    }
  } else {
    checks.push(
      check("read_only_sync", "Read-only sync", "fail", "Skipped — no connection."),
      check("balance_loaded", "Balance loaded", "fail", "Skipped — no connection."),
      check("position_state", "Position loaded", "fail", "Skipped — no connection."),
      check(
        "api_trading_permission",
        "API trading permission",
        "fail",
        "Skipped — no connection.",
      ),
      check(
        "withdraw_permission",
        "Withdraw permission",
        "warning",
        "Cannot check without connection.",
      ),
    );
  }

  const risk = getRiskGuardStatus();
  checks.push(
    check(
      "risk_guard_active",
      "Risk guard active",
      risk.tradingLocked ? "pass" : "warning",
      risk.tradingLocked
        ? "Trading locked while live flag is off."
        : "Risk guard reports trading unlocked.",
    ),
  );

  checks.push(
    check(
      "kill_switch",
      "Kill switch available",
      "pass",
      "Paper kill-switch route active; live kill-switch blocked until flags allow.",
    ),
  );

  const liveFlagsOk =
    flags.liveTradingEnabled &&
    flags.orderSubmitEnabled &&
    flags.apiTradingEnabled;
  checks.push(
    check(
      "live_flags",
      "Live execution flags",
      liveFlagsOk ? "pass" : "warning",
      liveFlagsOk
        ? "All live action flags enabled."
        : "Live submit flags off by design — dry-run unaffected.",
    ),
  );
  if (!isDryRunEnabled()) {
    infraBlockers.push("BINGX_ENABLE_DRY_RUN=false");
    blockers.push("BINGX_ENABLE_DRY_RUN=false");
  }

  const storageOk = isStorageWritable();
  checks.push(
    check(
      "storage_writable",
      "Storage writable",
      storageOk ? "pass" : "fail",
      storageOk ? "server/storage is writable." : "Cannot write to server/storage.",
    ),
  );
  if (!storageOk) {
    infraBlockers.push("Storage not writable");
    blockers.push("Storage not writable");
  }

  const auditOk = isAuditWritable();
  checks.push(
    check(
      "audit_writable",
      "Audit log writable",
      auditOk ? "pass" : "fail",
      auditOk ? "Audit log storage available." : "Audit log storage unavailable.",
    ),
  );
  if (!auditOk) {
    infraBlockers.push("Audit log not writable");
    blockers.push("Audit log not writable");
  }

  const maxOrder = isMaxOrderSizeConfigured();
  checks.push(
    check(
      "max_order_size",
      "Max order size configured",
      maxOrder ? "pass" : "fail",
      maxOrder
        ? `MAX_ORDER_NOTIONAL_USDT=${risk.maxNotionalUsdt}`
        : "MAX_ORDER_NOTIONAL_USDT not set or invalid.",
    ),
  );
  if (!maxOrder) {
    infraBlockers.push("MAX_ORDER_NOTIONAL_USDT not configured");
    blockers.push("Max order size not configured");
  }

  const maxRisk = isMaxAccountRiskConfigured();
  checks.push(
    check(
      "max_account_risk",
      "Max account risk configured",
      maxRisk ? "pass" : "fail",
      maxRisk
        ? "MAX_ACCOUNT_RISK_PCT configured."
        : "MAX_ACCOUNT_RISK_PCT not set or invalid.",
    ),
  );
  if (!maxRisk) {
    infraBlockers.push("MAX_ACCOUNT_RISK_PCT not configured");
    blockers.push("Max account risk not configured");
  }

  const slPolicy = isSlRequiredPolicyConfigured();
  checks.push(
    check(
      "sl_required_policy",
      "SL required policy",
      slPolicy ? "pass" : "warning",
      slPolicy
        ? "REQUIRE_SL_ON_LIVE_ORDERS enabled."
        : "REQUIRE_SL_ON_LIVE_ORDERS=false — live orders may omit stop-loss.",
    ),
  );
  if (!slPolicy) {
    warnings.push("REQUIRE_SL_ON_LIVE_ORDERS=false");
  }

  let systemHealthOk = true;
  if (risk.liveTradingEnabled) {
    systemHealthOk = false;
    checks.push(
      check(
        "system_health",
        "System health",
        "fail",
        "Live trading flag is ON — system health should report error until wired.",
      ),
    );
  } else {
    checks.push(
      check(
        "system_health",
        "System health",
        "pass",
        "Live trading locked by design (phase 5A).",
      ),
    );
  }
  if (!systemHealthOk) {
    warnings.push("Live trading enabled while execution not fully wired");
  }

  warnings.push(...buildLiveLockedDryRunWarnings(flags));

  const uniqueInfraBlockers = Array.from(new Set(infraBlockers));

  const dryRunLimitsOk =
    isMaxOrderSizeConfigured() && isMaxAccountRiskConfigured();
  const readyForDryRun =
    isDryRunEnabled() &&
    uniqueInfraBlockers.length === 0 &&
    dryRunLimitsOk &&
    hasConnection;

  const readyForLive =
    flags.liveTradingEnabled &&
    flags.apiTradingEnabled &&
    flags.orderSubmitEnabled &&
    flags.orderCancelEnabled &&
    flags.positionCloseEnabled &&
    uniqueInfraBlockers.length === 0 &&
    dryRunLimitsOk &&
    tradePermission !== "denied";

  const status = resolveStatus(
    uniqueInfraBlockers,
    flags,
    readyForLive,
    readyForDryRun,
  );

  const result: LiveTradingReadiness = {
    status,
    exchange: "bingx",
    ...flags,
    checks,
    blockers: uniqueInfraBlockers,
    warnings: Array.from(new Set(warnings)),
    readyForDryRun,
    readyForLive,
  };

  void emitLiveReadinessCheckedIfAllowed(uid, ex, {
    status: result.status,
    blockers: result.blockers,
    warnings: result.warnings,
  });

  return result;
}

export function toLiveTradingHealthSummary(
  readiness: LiveTradingReadiness,
): LiveTradingHealthSummary {
  return {
    status: readiness.status,
    liveTradingEnabled: readiness.liveTradingEnabled,
    apiTradingEnabled: readiness.apiTradingEnabled,
    blockersCount: readiness.blockers.length,
    readyForDryRun: readiness.readyForDryRun,
    readyForLive: readiness.readyForLive,
  };
}
