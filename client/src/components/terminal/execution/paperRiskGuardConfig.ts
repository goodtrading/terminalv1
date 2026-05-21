import type { PaperTradingSettings } from "./executionTypes";

/** Paper risk guard policy (simulation only). */
export const PAPER_RISK_GUARD_POLICY = {
  maxRiskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxNotionalUsdt: 500_000,
  liveTradingAllowed: false,
} as const;

export const LIVE_TRADING_LOCKED_MESSAGE =
  "Live trading is locked. Use Paper Trading.";

/** Max leverage from paper settings (defaults to 100 for display/guards). */
export function paperMaxLeverage(settings?: PaperTradingSettings | null): number {
  const v = settings?.maxLeverage;
  if (v != null && Number.isFinite(v) && v >= 1) {
    return Math.min(125, Math.floor(v));
  }
  return 100;
}
