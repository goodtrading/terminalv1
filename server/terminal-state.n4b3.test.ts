import assert from "node:assert/strict";
import test from "node:test";
import { MarketDataGateway } from "./market-gateway";
import { getGammaSpotReference } from "./gammaMarketReference";

test("Gamma reference requests explicit Binance Spot truth", () => {
  const originalTruth = MarketDataGateway.getMarketTruth;
  let request: unknown;
  (MarketDataGateway as any).getMarketTruth = (input: unknown) => {
    request = input;
    return {
      instrument: "BTCUSDT",
      venue: "Binance",
      marketType: "Spot",
      bid: 99,
      ask: 101,
      mid: 100,
      last: 100,
      eventTime: 1,
      receiveTime: 2,
      source: "websocket",
      sequence: 3,
      quality: "VALID",
    };
  };

  try {
    assert.equal(getGammaSpotReference(), 100);
    assert.deepEqual(request, {
      instrument: "BTCUSDT",
      venue: "Binance",
      marketType: "Spot",
    });
  } finally {
    (MarketDataGateway as any).getMarketTruth = originalTruth;
  }
});

test("Gamma reference rejects degraded Spot truth without fallback", () => {
  const originalTruth = MarketDataGateway.getMarketTruth;
  (MarketDataGateway as any).getMarketTruth = () => ({
    instrument: "BTCUSDT",
    venue: "Binance",
    marketType: "Spot",
    bid: 99,
    ask: 101,
    mid: 100,
    last: 100,
    eventTime: null,
    receiveTime: 2,
    source: "rest",
    sequence: 1,
    quality: "DISCONNECTED",
  });

  try {
    assert.equal(getGammaSpotReference(), null);
  } finally {
    (MarketDataGateway as any).getMarketTruth = originalTruth;
  }
});
