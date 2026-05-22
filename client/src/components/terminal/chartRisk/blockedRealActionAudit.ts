import { emitTerminalAudit } from "../health/terminalAuditLog";
import type { BlockedRealActionKind } from "./blockedActionHint";

const THROTTLE_MS = 60_000;
const lastEmit = new Map<BlockedRealActionKind, number>();

/** Local audit only — no trading API calls. */
export function emitBlockedRealChartActionAudit(
  action: BlockedRealActionKind,
): void {
  const now = Date.now();
  const last = lastEmit.get(action) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastEmit.set(action, now);

  if (import.meta.env.DEV) {
    console.debug("[security-guard] blocked real chart action", {
      action,
      exchange: "bingx",
      tradingLocked: true,
    });
  }

  emitTerminalAudit(
    "security_guard_event",
    "Blocked real BingX action attempted",
    "warn",
    {
      action,
      exchange: "bingx",
      tradingLocked: true,
      mode: "read-only",
    },
  );
}
