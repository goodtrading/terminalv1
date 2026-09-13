import assert from "node:assert/strict";
import test from "node:test";

import { MarketDataGateway } from "./market-gateway";

type Row = [number, number, number, number, number, number];

function makeKlineRows(startSec: number, count: number, stepSec: number, base: number): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const timeSec = startSec + i * stepSec;
    const open = base + i;
    return [timeSec * 1000, open, open + 1, open - 1, open + 0.5, 10 + i];
  });
}

function installFetchStub() {
  const originalFetch = globalThis.fetch;
  const minuteRows = makeKlineRows(1_000_000, 600, 60, 100);
  const secondRows = makeKlineRows(2_000_000, 3_000, 1, 1_000);

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const interval = url.searchParams.get("interval");
    const limit = Number(url.searchParams.get("limit") ?? "500");
    const endTime = url.searchParams.get("endTime");
    const end = endTime != null ? Number(endTime) : null;

    const sourceRows = interval === "1s" ? secondRows : minuteRows;
    const step = interval === "1s" ? 1 : 60;
    const chosen = (() => {
      if (end == null || !Number.isFinite(end)) {
        return sourceRows.slice(-limit);
      }
      const endSec = Math.floor(end / 1000);
      const eligible = sourceRows.filter((row) => row[0] / 1000 < endSec);
      return eligible.slice(-limit);
    })();

    return new Response(JSON.stringify(chosen), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("backward pagination returns older candles without overlap", async () => {
  const restore = installFetchStub();
  try {
    const first = await MarketDataGateway.getCandles("BTCUSDT", "1m", 200);
    const oldest = first[0]!.time;
    const second = await MarketDataGateway.getCandles("BTCUSDT", "1m", 200, undefined, oldest * 1000 - 1);

    assert.equal(first.length, 200);
    assert.equal(second.length, 200);
    assert.ok(second[second.length - 1]!.time < oldest);
    assert.equal(new Set(first.map((c) => c.time)).size, first.length);
    assert.equal(new Set(second.map((c) => c.time)).size, second.length);
    assert.equal(first.filter((c) => second.some((d) => d.time === c.time)).length, 0);
  } finally {
    restore();
  }
});

test("15s synthesis keeps OHLC aggregation semantics", async () => {
  const restore = installFetchStub();
  try {
    const candles = await MarketDataGateway.getCandles("BTCUSDT", "15s", 4);
    assert.equal(candles.length, 50);
    assert.ok(candles.every((c, i) => i === 0 || c.time - candles[i - 1]!.time === 15));
    assert.ok(candles.every((c) => c.high >= Math.max(c.open, c.close)));
    assert.ok(candles.every((c) => c.low <= Math.min(c.open, c.close)));
  } finally {
    restore();
  }
});
