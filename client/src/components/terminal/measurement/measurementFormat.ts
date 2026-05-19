import type { MeasurementMetrics } from "./measurementTypes";

/** BTCUSDT default: 1 pip = 0.01 price unit */
export const BTCUSDT_PIP_SIZE = 0.01;

export function formatPriceDiff(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

export function formatPctDiff(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatPips(pips: number): string {
  const rounded = Math.round(pips);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(rounded)}`;
}

export function formatElapsedDuration(elapsedSec: number): string {
  const abs = Math.abs(elapsedSec);
  if (abs < 60) return `${Math.max(1, Math.round(abs))}s`;
  if (abs < 3600) {
    const m = Math.round(abs / 60);
    return `${m}m`;
  }
  if (abs < 86400) {
    const h = Math.floor(abs / 3600);
    const m = Math.round((abs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(abs / 86400);
  const h = Math.floor((abs % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function formatMeasurementLine1(metrics: MeasurementMetrics): string {
  const { priceDiff, pctDiff, pips } = metrics;
  return `${formatPriceDiff(priceDiff)} (${formatPctDiff(pctDiff)}) ${formatPips(pips)}`;
}

export function formatMeasurementLine2(metrics: MeasurementMetrics): string {
  const barsLabel = metrics.bars === 1 ? "barra" : "barras";
  return `${metrics.bars} ${barsLabel}, ${formatElapsedDuration(metrics.elapsedSec)}`;
}

export function nearestCandleIndex(
  candles: readonly { time: number }[],
  timeSec: number
): number {
  if (candles.length === 0) return 0;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = Number(candles[mid]!.time);
    if (t < timeSec) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const prev = Number(candles[lo - 1]!.time);
    const cur = Number(candles[lo]!.time);
    if (Math.abs(prev - timeSec) < Math.abs(cur - timeSec)) return lo - 1;
  }
  return lo;
}

export function computeMeasurementMetrics(
  startPrice: number,
  endPrice: number,
  startTime: number,
  endTime: number,
  candles: readonly { time: number }[],
  pipSize: number
): MeasurementMetrics {
  const priceDiff = endPrice - startPrice;
  const pctDiff = startPrice !== 0 ? (priceDiff / startPrice) * 100 : 0;
  const pips = pipSize > 0 ? priceDiff / pipSize : 0;
  const startIdx = nearestCandleIndex(candles, startTime);
  const endIdx = nearestCandleIndex(candles, endTime);
  const bars = Math.abs(endIdx - startIdx);
  const elapsedSec = Math.abs(endTime - startTime);
  return {
    priceDiff,
    pctDiff,
    pips,
    bars,
    elapsedSec,
    isPositive: priceDiff >= 0,
  };
}
