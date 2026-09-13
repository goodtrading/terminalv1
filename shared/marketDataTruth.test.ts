import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketDataTruth,
  deriveMarketDataQuality,
  shouldAcceptMarketDataUpdate,
  usableMarketDataPrice,
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

test("REST cannot overwrite a newer live WebSocket update", () => {
  assert.equal(
    shouldAcceptMarketDataUpdate(
      { source: "websocket", eventTime: 2_000, receiveTime: 2_010, sequence: 20 },
      { source: "rest", eventTime: null, receiveTime: 2_020, sequence: 19 },
    ),
    false,
  );
});

test("out-of-order producer events are rejected", () => {
  assert.equal(
    shouldAcceptMarketDataUpdate(
      { source: "websocket", eventTime: 2_000, receiveTime: 2_010, sequence: 20 },
      { source: "websocket", eventTime: 1_999, receiveTime: 2_020, sequence: 19 },
    ),
    false,
  );
});

test("Perpetual bootstrap cannot be VALID before synchronized WebSocket data", () => {
  assert.equal(
    deriveMarketDataQuality({
      connected: true,
      hasBbo: true,
      ageMs: 1,
      marketType: "Perpetual",
      syncState: "BOOTSTRAPPING",
    }),
    "RESYNCING",
  );
});

test("disconnected remains disconnected even with a cached BBO", () => {
  assert.equal(
    deriveMarketDataQuality({ connected: false, hasBbo: true, ageMs: 1, marketType: "Perpetual" }),
    "DISCONNECTED",
  );
});
test("Spot liquidity price cannot come from Perpetual truth", () => {
  const spot = buildMarketDataTruth({ ...base, marketType: "Spot", last: 100 });
  const perp = buildMarketDataTruth({ ...base, marketType: "Perpetual", last: 200 });
  assert.equal(usableMarketDataPrice(spot), 100);
  assert.equal(usableMarketDataPrice(perp), 200);
  assert.notEqual(usableMarketDataPrice(spot), usableMarketDataPrice(perp));
});
test("REST never overwrites fresh WebSocket even with a higher sequence", () => {
  assert.equal(
    shouldAcceptMarketDataUpdate(
      { source: "websocket", eventTime: 2_000, receiveTime: 2_010, sequence: 20 },
      { source: "rest", eventTime: null, receiveTime: 2_020, sequence: 21 },
    ),
    false,
  );
});

test("crossed or incomplete BBO cannot remain VALID", () => {
  const crossed = buildMarketDataTruth({ ...base, marketType: "Spot", bid: 102, ask: 102 });
  const incomplete = buildMarketDataTruth({ ...base, marketType: "Spot", ask: null });
  assert.equal(crossed.mid, null);
  assert.equal(crossed.quality, "PARTIAL");
  assert.equal(incomplete.mid, null);
  assert.equal(incomplete.quality, "PARTIAL");
});

test("sequence ordering takes precedence over receive time", () => {
  assert.equal(
    shouldAcceptMarketDataUpdate(
      { source: "websocket", eventTime: 2_000, receiveTime: 2_100, sequence: 20 },
      { source: "websocket", eventTime: 1_000, receiveTime: 2_200, sequence: 19 },
    ),
    false,
  );
});

test("stale truth is not usable as a fresh consumer price", () => {
  const stale = buildMarketDataTruth({ ...base, marketType: "Spot", quality: "STALE" });
  assert.equal(usableMarketDataPrice(stale), null);
});
test("requires explicit market identity and does not provide Spot/Perp fallback", () => {
  assert.throws(() => buildMarketDataTruth({ ...base, marketType: undefined as never }));
});
