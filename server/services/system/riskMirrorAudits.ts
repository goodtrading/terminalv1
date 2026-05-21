import type { ReadOnlyRiskMirrorSnapshot } from "../riskMirror/riskMirrorTypes";
import { emitRiskMirrorAuditIfAllowed } from "./auditLogService";

const SKIP_WARNING_IDS = new Set([
  "trading_locked",
  "gamma_context_unavailable",
  "liquidity_context_unavailable",
  "liq_unavailable",
  "bingx_sync_degraded",
  "connection_not_found",
]);

function buildSafeMetadata(
  snapshot: ReadOnlyRiskMirrorSnapshot,
  connectionId: string,
  symbol: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const pos = snapshot.position;
  return {
    exchange: "bingx",
    mode: "read-only",
    symbol,
    connectionId,
    scoreStatus: snapshot.score.status,
    scoreConfidence: snapshot.score.confidence,
    tradingLocked: true,
    distanceToLiquidationPct: pos?.distanceToLiquidationPct,
    unrealizedPnlAccountPct: pos?.unrealizedPnlAccountPct,
    ...extra,
  };
}

function throttleKey(
  userId: number,
  connectionId: string,
  symbol: string,
  warningId: string,
): string {
  return `${userId}:${connectionId}:${symbol}:${warningId}`;
}

/** Emit throttled risk mirror audit events (max 1 per key / 60s). */
export async function emitRiskMirrorAuditsFromSnapshot(
  userId: number,
  connectionId: string,
  symbol: string,
  snapshot: ReadOnlyRiskMirrorSnapshot,
): Promise<void> {
  const score = snapshot.score.status;

  if (score === "conflicted") {
    void emitRiskMirrorAuditIfAllowed(
      throttleKey(userId, connectionId, symbol, "score:conflicted"),
      {
        type: "risk_mirror_warning",
        severity: "warning",
        message: `Risk Mirror: real BingX position context is CONFLICTED. Trading remains locked.`,
        metadata: buildSafeMetadata(snapshot, connectionId, symbol, {
          warningId: "score:conflicted",
          warningSeverity: "warning",
        }),
      },
    );
  }

  if (score === "danger") {
    void emitRiskMirrorAuditIfAllowed(
      throttleKey(userId, connectionId, symbol, "score:danger"),
      {
        type: "risk_mirror_error",
        severity: "error",
        message: `Risk Mirror: real BingX position is DANGER. Trading remains locked.`,
        metadata: buildSafeMetadata(snapshot, connectionId, symbol, {
          warningId: "score:danger",
          warningSeverity: "danger",
        }),
      },
    );
  }

  for (const w of snapshot.warnings) {
    if (SKIP_WARNING_IDS.has(w.id)) continue;
    if (w.severity !== "danger" && w.severity !== "warning") continue;

    const auditType =
      w.severity === "danger" ? "risk_mirror_error" : "risk_mirror_warning";
    const severity = w.severity === "danger" ? "error" : "warning";

    void emitRiskMirrorAuditIfAllowed(
      throttleKey(userId, connectionId, symbol, w.id),
      {
        type: auditType,
        severity,
        message: `${w.title}: ${w.message}`,
        metadata: buildSafeMetadata(snapshot, connectionId, symbol, {
          warningId: w.id,
          warningSeverity: w.severity,
        }),
      },
    );
  }
}

export async function emitRiskMirrorServiceErrorIfAllowed(
  userId: number,
  connectionId: string,
  symbol: string,
  errorCode: string,
  safeMessage: string,
): Promise<void> {
  void emitRiskMirrorAuditIfAllowed(
    `${userId}:${connectionId}:${symbol}:error:${errorCode}`,
    {
      type: "risk_mirror_error",
      severity: "error",
      message: safeMessage,
      metadata: {
        exchange: "bingx",
        mode: "read-only",
        symbol,
        connectionId,
        tradingLocked: true,
        source: "risk_mirror",
        errorCode,
      },
    },
  );
}
