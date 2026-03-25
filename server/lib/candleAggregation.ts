/**
 * OHLCV aggregation for building higher-timeframe bars from finer candles.
 * Assumes `input` is sorted ascending by `time` (open time in seconds).
 */

export type OhlcvCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * Bucket open time: floor(time / bucketSec) * bucketSec (UTC seconds).
 */
export function aggregateOhlcvCandles(input: OhlcvCandle[], bucketSec: number): OhlcvCandle[] {
  if (input.length === 0 || bucketSec <= 0) return [];
  const out: OhlcvCandle[] = [];

  let bucketStart = Math.floor(input[0]!.time / bucketSec) * bucketSec;
  let open = input[0]!.open;
  let high = input[0]!.high;
  let low = input[0]!.low;
  let close = input[0]!.close;
  let volume = input[0]!.volume;

  const flush = () => {
    out.push({
      time: bucketStart,
      open,
      high,
      low,
      close,
      volume,
    });
  };

  for (let i = 1; i < input.length; i++) {
    const c = input[i]!;
    const b = Math.floor(c.time / bucketSec) * bucketSec;
    if (b !== bucketStart) {
      flush();
      bucketStart = b;
      open = c.open;
      high = c.high;
      low = c.low;
      close = c.close;
      volume = c.volume;
    } else {
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
      close = c.close;
      volume += c.volume;
    }
  }
  flush();
  return out;
}
