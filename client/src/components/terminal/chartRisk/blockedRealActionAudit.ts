import { emitTerminalAudit } from "../health/terminalAuditLog";

export type BlockedRealChartAction =
  | "blocked_real_close"
  | "blocked_real_add_sl"
  | "blocked_real_add_tp";

const THROTTLE_MS = 60_000;
const lastEmit = new Map<BlockedRealChartAction, number>();

/** Local audit only — no trading API calls. */
export function emitBlockedRealChartActionAudit(
  action: BlockedRealChartAction,
): void {
  const now = Date.now();
  const last = lastEmit.get(action) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastEmit.set(action, now);

  emitTerminalAudit(
    "security_guard_event",
    "Real trading controls are locked.",
    "warn",
    {
      action,
      exchange: "bingx",
      tradingLocked: true,
      mode: "read-only",
    },
  );
}
