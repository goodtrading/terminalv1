import type { MarketCandle } from "@/lib/marketCandleTypes";

function vol(c: MarketCandle): number {
  return c.volume ?? 0;
}

/** Sort ascending by time; keep last occurrence per duplicate time */
export function sortAndDedupeCandlesByTime(candles: MarketCandle[]): MarketCandle[] {
  if (candles.length <= 1) return candles.slice();
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const out: MarketCandle[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && last.time === c.time) {
      out[out.length - 1] = { ...c };
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

function bucketStart(timeSec: number, timeframeSec: number): number {
  return Math.floor(timeSec / timeframeSec) * timeframeSec;
}

/**
 * Full aggregation from a sorted base series (O(n)).
 * open = first open in bucket, high/low/close/volume per spec.
 */
export function aggregateCandles(baseCandles: MarketCandle[], timeframeSec: number): MarketCandle[] {
  if (baseCandles.length === 0 || timeframeSec <= 0) return [];
  const input = sortAndDedupeCandlesByTime(baseCandles);
  const out: MarketCandle[] = [];

  let b0 = bucketStart(input[0]!.time, timeframeSec);
  let open = input[0]!.open;
  let high = input[0]!.high;
  let low = input[0]!.low;
  let close = input[0]!.close;
  let volume = vol(input[0]!);

  const flush = () => {
    out.push({ time: b0, open, high, low, close, volume });
  };

  for (let i = 1; i < input.length; i++) {
    const c = input[i]!;
    const b = bucketStart(c.time, timeframeSec);
    if (b !== b0) {
      flush();
      b0 = b;
      open = c.open;
      high = c.high;
      low = c.low;
      close = c.close;
      volume = vol(c);
    } else {
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
      close = c.close;
      volume += vol(c);
    }
  }
  flush();
  return out;
}

function mergeIntoLastBucket(last: MarketCandle, c: MarketCandle): MarketCandle {
  return {
    time: last.time,
    open: last.open,
    high: Math.max(last.high, c.high),
    low: Math.min(last.low, c.low),
    close: c.close,
    volume: vol(last) + vol(c),
  };
}

/**
 * Incremental merge: apply new/updated BASE candles into an existing aggregated series.
 * Assumes `newBaseCandles` are the bars that changed (typically 1) at the tail of the base stream.
 * Does not rebuild earlier buckets.
 */
export function appendToAggregated(
  existing: MarketCandle[],
  newBaseCandles: MarketCandle[],
  timeframeSec: number,
): MarketCandle[] {
  if (timeframeSec <= 0) return existing.slice();
  if (newBaseCandles.length === 0) return existing.slice();

  const delta = sortAndDedupeCandlesByTime(newBaseCandles);
  const result = existing.length ? existing.slice() : [];

  for (const c of delta) {
    const b = bucketStart(c.time, timeframeSec);
    const last = result[result.length - 1];
    if (last && last.time === b) {
      result[result.length - 1] = mergeIntoLastBucket(last, c);
    } else if (!last || last.time < b) {
      result.push({
        time: b,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: vol(c),
      });
    }
    // Older buckets than `last` are ignored (live tail assumption).
  }
  return result;
}
