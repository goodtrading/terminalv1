import type { FootprintLevel } from "@/lib/footprintTypes";

/** Imbalance from aggressive-buy vs aggressive-sell pressure at the level. */
export type FootprintImbalanceSide = "buy-imbalance" | "sell-imbalance" | "none";

/**
 * Classify imbalance using configurable ratio (ask/bid or bid/ask).
 * One-sided levels count as imbalance on the active side.
 */
export function levelImbalanceSide(level: FootprintLevel, ratio: number): FootprintImbalanceSide {
  const b = level.bidVolume;
  const a = level.askVolume;
  if (a > 0 && b > 0) {
    if (a / b >= ratio) return "buy-imbalance";
    if (b / a >= ratio) return "sell-imbalance";
    return "none";
  }
  if (a > 0 && b <= 0) return "buy-imbalance";
  if (b > 0 && a <= 0) return "sell-imbalance";
  return "none";
}

export type FootprintIndexRange = { start: number; end: number };

/** Consecutive rows with the same imbalance side (excluding `none`). */
export function findStackedImbalanceRanges(
  sides: FootprintImbalanceSide[],
  minConsecutive: number,
): FootprintIndexRange[] {
  const out: FootprintIndexRange[] = [];
  let i = 0;
  while (i < sides.length) {
    const s = sides[i];
    if (s === "none") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < sides.length && sides[j + 1] === s) j++;
    if (j - i + 1 >= minConsecutive) out.push({ start: i, end: j });
    i = j + 1;
  }
  return out;
}

/** Row background: muted cool = more ask (buy taker), warm = more bid (sell taker). */
export function rowDominanceFill(askPct: number): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const neutral = { r: 120, g: 135, b: 158, a: 0.045 };
  const askLean = { r: 62, g: 124, b: 156, a: 0.095 };
  const bidLean = { r: 150, g: 98, b: 88, a: 0.088 };
  if (!Number.isFinite(askPct)) return neutral;
  const bias = askPct - 0.5;
  if (Math.abs(bias) < 0.06) return neutral;
  const t = Math.min(1, (Math.abs(bias) - 0.06) / 0.44);
  if (bias > 0) return lerpRgba(neutral, askLean, t);
  return lerpRgba(neutral, bidLean, t);
}

function lerpRgba(
  a: { r: number; g: number; b: number; a: number },
  b: { r: number; g: number; b: number; a: number },
  t: number,
): { r: number; g: number; b: number; a: number } {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

export function rgbaString(c: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a.toFixed(3)})`;
}

/** Delta strip intensity 0..1 from level delta vs total volume. */
export function deltaStripAlpha(level: FootprintLevel): number {
  const t = level.totalVolume;
  if (t <= 0) return 0;
  return Math.min(1, Math.abs(level.delta) / t);
}
