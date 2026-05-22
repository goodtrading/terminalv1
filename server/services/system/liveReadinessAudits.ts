import { emitAuditEvent } from "./auditLogService";
import type { LiveReadinessStatus } from "../execution/liveTradingReadinessTypes";
import type { LiveTradingAction } from "../execution/liveTradingGuard";

const READINESS_CHECK_THROTTLE_MS = 30_000;
const readinessLastEmit = new Map<string, number>();

function throttleKey(userId: number, exchange: string): string {
  return `${userId}:${exchange}`;
}

export async function emitLiveReadinessCheckedIfAllowed(
  userId: number,
  exchange: string,
  payload: {
    status: LiveReadinessStatus;
    blockers: string[];
    warnings: string[];
  },
): Promise<void> {
  const key = throttleKey(userId, exchange);
  const now = Date.now();
  const last = readinessLastEmit.get(key) ?? 0;
  if (now - last < READINESS_CHECK_THROTTLE_MS) return;
  readinessLastEmit.set(key, now);

  await emitAuditEvent({
    userId,
    type: "live_readiness_checked",
    severity: payload.blockers.length > 0 ? "warning" : "info",
    message: `Live trading readiness: ${payload.status}`,
    metadata: {
      exchange,
      status: payload.status,
      blockers: payload.blockers.slice(0, 12),
      warnings: payload.warnings.slice(0, 8),
    },
  });
}

export async function emitLiveReadinessFailed(
  userId: number,
  exchange: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_readiness_failed",
    severity: "error",
    message: message.slice(0, 500),
    metadata: { exchange, ...metadata },
  });
}

export async function emitLiveGuardBlocked(
  userId: number | undefined,
  action: LiveTradingAction,
  blockers: string[],
): Promise<void> {
  await emitAuditEvent({
    userId,
    type: "live_guard_blocked",
    severity: "warning",
    message: `Live guard blocked: ${action.replace(/_/g, " ")}`,
    metadata: {
      exchange: "bingx",
      action,
      blockers: blockers.slice(0, 8),
      status: "locked",
    },
  });
}
