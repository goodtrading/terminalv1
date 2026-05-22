import { getLiveTradingEnvFlags, isDryRunEnabled } from "./riskGuard";

export type LiveEnvFlags = ReturnType<typeof getLiveTradingEnvFlags>;

const LIVE_ONLY_BLOCKER_MARKERS = [
  "BINGX_ENABLE_LIVE_TRADING",
  "BINGX_ENABLE_ORDER_SUBMIT",
  "BINGX_ENABLE_ORDER_CANCEL",
  "BINGX_ENABLE_POSITION_CLOSE",
] as const;

/** True when a blocker string refers to live-submit env flags (not dry-run infra). */
export function isLiveOnlyEnvBlocker(message: string): boolean {
  return LIVE_ONLY_BLOCKER_MARKERS.some((m) => message.includes(m));
}

export function filterDryRunInfraBlockers(blockers: string[]): string[] {
  return blockers.filter((b) => !isLiveOnlyEnvBlocker(b));
}

/** Warnings for UI — live off by design; dry-run may still be enabled. */
export function buildLiveLockedDryRunWarnings(flags: LiveEnvFlags): string[] {
  const warnings: string[] = [];
  if (!flags.liveTradingEnabled) {
    warnings.push("Live execution locked (BINGX_ENABLE_LIVE_TRADING=false).");
  }
  if (!flags.orderSubmitEnabled) {
    warnings.push("Live order submit disabled by design.");
  }
  if (!flags.orderCancelEnabled) {
    warnings.push("Live order cancel disabled by design.");
  }
  if (!flags.positionCloseEnabled) {
    warnings.push("Live position close disabled by design.");
  }
  if (!flags.apiTradingEnabled) {
    warnings.push(
      "BINGX_ENABLE_API_TRADING=false — permission probe limited; read-only sync still allowed.",
    );
  }
  if (isDryRunEnabled()) {
    warnings.push("Dry-run preview enabled — no orders sent to BingX.");
  }
  return warnings;
}
