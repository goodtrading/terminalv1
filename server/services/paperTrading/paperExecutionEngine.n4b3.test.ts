import assert from "node:assert/strict";
import test from "node:test";
import { MarketDataGateway } from "../../market-gateway";
import { resolveMarkPrice } from "./paperExecutionEngine";
import type { MarketDataTruth } from "@shared/marketDataTruth";

const validPerpTruth: MarketDataTruth = {
  instrument: "BTCUSDT",
  venue: "Binance",
  marketType: "Perpetual",
  bid: 99,
  ask: 101,
  mid: 100,
  last: 100,
  eventTime: 1_000,
  receiveTime: 1_001,
  source: "websocket",
  sequence: 7,
  quality: "VALID",
};

function withTruth(truth: MarketDataTruth, fn: () => Promise<void>): Promise<void> {
  const originalTruth = MarketDataGateway.getMarketTruth;
  const originalCached = MarketDataGateway.getCachedTicker;
  const originalTicker = MarketDataGateway.getTicker;
  let request: unknown;
  (MarketDataGateway as any).getMarketTruth = (input: unknown) => {
    request = input;
    return truth;
  };
  (MarketDataGateway as any).getCachedTicker = () => {
    throw new Error("legacy ticker must not be called");
  };
  (MarketDataGateway as any).getTicker = async () => {
    throw new Error("legacy ticker must not be called");
  };
  return fn().finally(() => {
    (MarketDataGateway as any).getMarketTruth = originalTruth;
    (MarketDataGateway as any).getCachedTicker = originalCached;
    (MarketDataGateway as any).getTicker = originalTicker;
    void request;
  });
}

test("Paper resolves BTCUSDT from explicit Binance Perpetual truth", async () => {
  await withTruth(validPerpTruth, async () => {
    assert.equal(await resolveMarkPrice(), 100);
  });
});

for (const quality of ["DISCONNECTED", "GAP", "RESYNCING"] as const) {
  test(`Paper rejects Perpetual truth quality=${quality}`, async () => {
    await withTruth({ ...validPerpTruth, quality }, async () => {
      const result = await resolveMarkPrice();
      assert.deepEqual(result, {
        error: "Unable to resolve Perpetual market truth for paper execution.",
        code: "PAPER_MARK_PRICE_UNAVAILABLE",
      });
    });
  });
}
