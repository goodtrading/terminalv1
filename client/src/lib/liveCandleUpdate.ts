import type { MarketCandle } from "@/lib/marketCandleTypes";

/**
 * Merge a live price tick into the tail of a timeframe series (copy-on-write).
 * - Same bucket as last bar → update high / low / close only (open unchanged).
 * - New bucket after last → append a new bar (open = high = low = close = tick).
 * - Tick older than last bar (clock skew) → return a shallow copy, unchanged.
 */
export function updateLiveCandle(
  existingCandles: MarketCandle[],
  tickPrice: number,
  tickTimeSec: number,
  timeframeSec: number,
): MarketCandle[] {
  if (timeframeSec <= 0 || !Number.isFinite(tickPrice) || !Number.isFinite(tickTimeSec)) {
    return existingCandles.slice();
  }
  const bucket = Math.floor(tickTimeSec / timeframeSec) * timeframeSec;

  if (existingCandles.length === 0) {
    return [
      {
        time: bucket,
        open: tickPrice,
        high: tickPrice,
        low: tickPrice,
        close: tickPrice,
        volume: 0,
      },
    ];
  }

  const next = existingCandles.slice();
  const last = next[next.length - 1]!;

  if (last.time === bucket) {
    next[next.length - 1] = {
      ...last,
      close: tickPrice,
      high: Math.max(last.high, tickPrice),
      low: Math.min(last.low, tickPrice),
    };
  } else if (bucket > last.time) {
    next.push({
      time: bucket,
      open: tickPrice,
      high: tickPrice,
      low: tickPrice,
      close: tickPrice,
      volume: 0,
    });
  }

  return next;
}
