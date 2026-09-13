import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketDataTruth,
  deriveMarketDataQuality,
  type MarketDataTruth,
} from "./marketDataTruth.ts";

const base = {
  instrument: "BTCUSDT",
  venue: "Binance" as const,
  bid: 100,
  ask: 102,
  last: 101,
  eventTime: 1_000,
  receiveTime: 1_025,
  source: "websocket" as const,
  sequence: 42,
  quality: "VALID" as const,
};

test("keeps Spot and Perpetual as independent objects", () => {
  const spot = buildMarketDataTruth({ ...base, marketType: "Spot" });
  const perp = buildMarketDataTruth({ ...base, marketType: "Perpetual" });
  assert.notStrictEqual(spot, perp);
  assert.equal(spot.marketType, "Spot");
  assert.equal(perp.marketType, "Perpetual");
});

test("disconnected producer wins over cached BBO", () => {
  assert.equal(
    deriveMarketDataQuality({
      connected: false,
      hasBbo: true,
      ageMs: 1,
      marketType: "Spot",
    }),
    "DISCONNECTED",
  );
});
test("derives mid only from a valid bid/ask pair", () => {
  assert.equal(buildMarketDataTruth({ ...base, marketType: "Spot" }).mid, 101);
  assert.equal(buildMarketDataTruth({ ...base, marketType: "Spot", ask: null }).mid, null);
});

test("does not substitute receiveTime for missing producer eventTime", () => {
  const truth = buildMarketDataTruth({ ...base, marketType: "Spot", eventTime: null });
  assert.equal(truth.eventTime, null);
  assert.equal(truth.receiveTime, 1_025);
});

test("preserves producer eventTime when it is present", () => {
  const truth = buildMarketDataTruth({ ...base, marketType: "Perpetual", eventTime: 987_654 });
  assert.equal(truth.eventTime, 987_654);
});
test("preserves event and receive timestamps independently", () => {
  const truth = buildMarketDataTruth({ ...base, marketType: "Spot" });
  assert.equal(truth.eventTime, 1_000);
  assert.equal(truth.receiveTime, 1_025);
});

test("preserves REST/WS source and sequence/null", () => {
  const rest = buildMarketDataTruth({ ...base, marketType: "Spot", source: "rest", sequence: null });
  assert.equal(rest.source, "rest");
  assert.equal(rest.sequence, null);
});

for (const quality of ["DISCONNECTED", "GAP", "RESYNCING"] as const) {
  test(`preserves quality=${quality} without degrading to VALID`, () => {
    const truth: MarketDataTruth = buildMarketDataTruth({ ...base, marketType: "Perpetual", quality });
    assert.equal(truth.quality, quality);
    assert.notEqual(truth.quality, "VALID");
  });
}

test("requires explicit market identity and does not provide Spot/Perp fallback", () => {
  assert.throws(() => buildMarketDataTruth({ ...base, marketType: undefined as never }));
});
