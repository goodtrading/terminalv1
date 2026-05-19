import type { SessionTerminalInput } from "./sessionReportTypes";
import { num } from "./sessionReportLevelUtils";

export function isShortGamma(regime: string): boolean {
  return regime.toUpperCase().includes("SHORT");
}

export function isLongGamma(regime: string): boolean {
  return regime.toUpperCase().includes("LONG");
}

export function resolveGammaRegimeLabel(terminal: SessionTerminalInput): string {
  const opts = terminal.options;
  const local = opts?.gammaRegimeLocal;
  if (local === "SHORT GAMMA") return "Short Gamma";
  if (local === "LONG GAMMA") return "Long Gamma";

  const marketRegime = String(terminal.market?.gammaRegime ?? "").toUpperCase();
  if (marketRegime.includes("SHORT")) return "Short Gamma";
  if (marketRegime.includes("LONG")) return "Long Gamma";
  if (marketRegime.includes("TRANSITION") || marketRegime.includes("NEUTRAL")) {
    return "Neutral Gamma";
  }
  return "Unknown";
}

export function structureFromCandles(
  candles: readonly { high: number; low: number; open: number; close: number }[],
) {
  if (!candles.length) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (Number.isFinite(c.high)) high = Math.max(high, c.high);
    if (Number.isFinite(c.low)) low = Math.min(low, c.low);
  }
  const open = candles[0]!.open;
  const last = candles[candles.length - 1]!.close;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(last)) return null;
  const rangePct = low > 0 ? ((high - low) / low) * 100 : null;
  return { high, low, open, last, rangePct };
}

export { num };
