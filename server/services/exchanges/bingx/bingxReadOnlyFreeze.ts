function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return v === "true" || v === "1";
}

/** Phase B1: when active (default), all BingX write paths are blocked server-side. */
export function isBingxReadOnlyFreezeActive(): boolean {
  const raw = process.env.BINGX_READ_ONLY_FREEZE;
  if (raw == null || raw === "") return true;
  return raw.trim().toLowerCase() !== "false";
}

export const BINGX_READ_ONLY_FREEZE_CODE = "BINGX_READ_ONLY_FREEZE_ACTIVE";

export function bingxReadOnlyFreezeMessage(): string {
  return "BingX live execution is frozen during read-only stabilization.";
}

export function bingxReadOnlyFreezeBlockers(): string[] {
  return isBingxReadOnlyFreezeActive() ? [BINGX_READ_ONLY_FREEZE_CODE] : [];
}

/** Throws-style result for write guards. */
export function assertBingxWriteNotFrozen():
  | { ok: true }
  | { ok: false; code: typeof BINGX_READ_ONLY_FREEZE_CODE; message: string; blockers: string[] } {
  if (!isBingxReadOnlyFreezeActive()) {
    return { ok: true };
  }
  return {
    ok: false,
    code: BINGX_READ_ONLY_FREEZE_CODE,
    message: bingxReadOnlyFreezeMessage(),
    blockers: [BINGX_READ_ONLY_FREEZE_CODE],
  };
}

export function isBingxWriteActionBlocked(action: string): boolean {
  if (!isBingxReadOnlyFreezeActive()) return false;
  const writeActions = new Set([
    "submit_order",
    "cancel_order",
    "close_position",
    "modify_order",
    "set_leverage",
    "set_margin_mode",
  ]);
  return writeActions.has(action);
}

export function getBingxReadOnlyFreezeSnapshot() {
  return {
    active: isBingxReadOnlyFreezeActive(),
    code: BINGX_READ_ONLY_FREEZE_CODE,
    message: bingxReadOnlyFreezeMessage(),
    envValue: process.env.BINGX_READ_ONLY_FREEZE ?? "(unset → default true)",
    liveTradingEnv: envBool("BINGX_ENABLE_LIVE_TRADING", false),
    orderSubmitEnv: envBool("BINGX_ENABLE_ORDER_SUBMIT", false),
  };
}
