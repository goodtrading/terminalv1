import assert from "node:assert/strict";
import test from "node:test";

import { mergeHistoricalCandles } from "./chartHistoryMerge";
import type { MarketCandle } from "./marketCandleTypes";

function candle(time: number): MarketCandle {
  return { time, open: time, high: time, low: time, close: time, volume: 1 };
}

test("historical merge preserves a 1000-candle prefix after a short live tail refresh", () => {
  const shortTail = Array.from({ length: 20 }, (_, i) => candle(40_000 + i));
  const x5History = Array.from({ length: 1000 }, (_, i) => candle(10_000 + i * 15));
  const merged = mergeHistoricalCandles(shortTail, x5History, 1500);

  assert.equal(merged.length, 1020);
  assert.equal(merged[0]!.time, 10_000);
  assert.equal(merged[merged.length - 1]!.time, 40_019);
  assert.equal(new Set(merged.map((c) => c.time)).size, 1020);
});

test("historical merge is idempotent for repeated base refresh reapplication", () => {
  const x5History = Array.from({ length: 1000 }, (_, i) => candle(10_000 + i * 15));
  const first = mergeHistoricalCandles([], x5History, 1500);
  const refreshed = mergeHistoricalCandles(first.slice(-20), first, 1500);

  assert.equal(refreshed.length, 1000);
  assert.equal(refreshed[0]!.time, first[0]!.time);
  assert.equal(new Set(refreshed.map((c) => c.time)).size, 1000);
});
