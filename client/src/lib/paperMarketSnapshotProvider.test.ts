import assert from "node:assert/strict";
import test from "node:test";

import {
  getPaperMarketSnapshot,
  PaperMarketSnapshotProviderError,
  paperMarketSnapshotProvider,
} from "./paperMarketSnapshotProvider";

function makeFetch(response: unknown, status = 200) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
  return { fetch, calls };
}

test("production market snapshot provider returns a typed decimal-string perp snapshot", async () => {
  const { fetch, calls } = makeFetch({
    exchange: "binance-perp",
    market: "perp",
    bids: [["99999.50", "12.3"]],
    asks: [["100000.00", "8.1"]],
    timestamp: 123456789,
  });

  const snapshot = await getPaperMarketSnapshot(undefined, {
    fetch,
    nowMs: () => 123457789,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/orderbook/raw?symbol=BTCUSDT&market=perp");
  assert.deepEqual(snapshot, {
    source: {
      venue: "BINANCE",
      marketType: "perpetual",
      symbol: "BTCUSDT",
    },
    simulationInstrument: {
      venue: "SIM",
      marketType: "perpetual",
      symbol: "BTCUSDT-PERP",
    },
    bid: "99999.50",
    ask: "100000.00",
    bidSize: "12.3",
    askSize: "8.1",
    timestampMs: 123456789,
    freshness: {
      ageMs: 1000,
      staleAfterMs: 3000,
      stale: false,
    },
  });
  assert.equal(snapshot.bid, "99999.50");
  assert.equal(snapshot.ask, "100000.00");
  assert.equal(snapshot.bidSize, "12.3");
  assert.equal(snapshot.askSize, "8.1");
  assert.equal(snapshot.timestampMs, 123456789);
  assert.equal(snapshot.freshness.stale, false);
  assert.equal(paperMarketSnapshotProvider.getSnapshot, getPaperMarketSnapshot);
});

test("production market snapshot provider rejects wrong venue mapping before fetching", async () => {
  const { fetch, calls } = makeFetch({});
  await assert.rejects(
    () =>
      getPaperMarketSnapshot(
        {
          chartExchange: "binance",
          chartMarketType: "spot",
          chartSymbol: "ETHUSDT",
          executionExchange: "bingx",
          executionMarketType: "perpetual",
          executionSymbol: "ETH-USDT",
        },
        { fetch },
      ),
    (error: unknown) => {
      assert.ok(error instanceof PaperMarketSnapshotProviderError);
      assert.equal(error.code, "MARKET_SOURCE_MISMATCH");
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test("production market snapshot provider rejects invalid BBO values", async () => {
  const { fetch } = makeFetch({
    exchange: "binance-perp",
    market: "perp",
    bids: [["100001", "12.3"]],
    asks: [["100000", "8.1"]],
    timestamp: 123456789,
  });
  await assert.rejects(
    () =>
      getPaperMarketSnapshot(undefined, {
        fetch,
        nowMs: () => 123457789,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PaperMarketSnapshotProviderError);
      assert.equal(error.code, "INVALID_BBO");
      return true;
    },
  );
});

test("production market snapshot provider rejects stale snapshots with the existing BBO threshold", async () => {
  const { fetch } = makeFetch({
    exchange: "binance-perp",
    market: "perp",
    bids: [["99999.50", "12.3"]],
    asks: [["100000.00", "8.1"]],
    timestamp: 1000,
  });
  await assert.rejects(
    () =>
      getPaperMarketSnapshot(undefined, {
        fetch,
        nowMs: () => 5000,
      }),
    (error: unknown) => {
      assert.ok(error instanceof PaperMarketSnapshotProviderError);
      assert.equal(error.code, "SNAPSHOT_STALE");
      return true;
    },
  );
});
