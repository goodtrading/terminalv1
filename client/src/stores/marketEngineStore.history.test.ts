import assert from "node:assert/strict";
import test from "node:test";

import { mergeHistoricalCandles } from "@/lib/chartHistoryMerge";
import type { MarketCandle } from "@/lib/marketCandleTypes";

function candle(time: number): MarketCandle {
  return { time, open: time, high: time, low: time, close: time, volume: 1 };
}

test("historical 15s merge preserves the x5 prefix across refresh reapplication", () => {
  const liveTail = Array.from({ length: 20 }, (_, i) => candle(20_000 + i));
  const x5History = Array.from({ length: 1000 }, (_, i) => candle(10_000 + i * 15));

  const first = mergeHistoricalCandles(liveTail, x5History);
  assert.equal(first.length, 1000);
  assert.equal(first[0]!.time, 10_000);
  assert.equal(first[first.length - 1]!.time, 10_000 + 999 * 15);

  const refreshed = mergeHistoricalCandles(first.slice(-20), first);
  assert.equal(refreshed.length, 1000);
  assert.equal(refreshed[0]!.time, 10_000);
  assert.equal(new Set(refreshed.map((c) => c.time)).size, 1000);
});
