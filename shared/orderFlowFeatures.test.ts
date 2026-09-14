import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "./canonicalL2Book";
import { CanonicalTradeTape } from "./canonicalTradeTape";
import { LiquidityLifecycleProjector } from "./liquidityLifecycle";
import { HistoricalLiquidityTruth } from "./historicalLiquidityTruth";
import { composeOrderFlowState, type OrderFlowCompositionInput, type OrderFlowIdentity } from "./orderFlowState";
import { computeOrderFlowFeatures, type OrderFlowFeatureConfig } from "./orderFlowFeatures";
import { replayTruth, type TruthReplayEvent } from "./truthReplay";

const spot: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" };
const perp: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual" };
const config: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, depthLevels: 2 } };

function makeState(identity = spot, options: { tradeQuality?: "VALID" | "STALE" | "UNAVAILABLE"; lifecycleQuality?: "VALID" | "PARTIAL" | "UNAVAILABLE"; history?: boolean } = {}) {
  const owner = new CanonicalL2BookOwner(identity);
  const first = owner.applySnapshot({ bids: [{ price: 100, quantity: 10 }, { price: 99, quantity: 5 }], asks: [{ price: 101, quantity: 8 }, { price: 102, quantity: 4 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" });
  const second = owner.applyDelta({ bids: [{ price: 100, quantity: 15 }, { price: 99, quantity: 0 }], asks: [{ price: 102, quantity: 6 }], sequence: 2, eventTime: 200, receiveTime: 201, source: "websocket", quality: "VALID", ...(identity.marketType === "Perpetual" ? { firstUpdateId: 2, previousUpdateId: 1 } : {}) }).book;
  const tape = new CanonicalTradeTape(identity);
  for (const trade of [
    { tradeId: "2", price: 100.5, quantity: 3, aggressorSide: "SELL" as const, eventTime: 150, receiveTime: 151 },
    { tradeId: "1", price: 100.5, quantity: 5, aggressorSide: "BUY" as const, eventTime: 150, receiveTime: 152 },
    { tradeId: "3", price: 100.5, quantity: 2, aggressorSide: "SELL" as const, eventTime: 250, receiveTime: 251 },
  ]) tape.ingest({ ...trade, instrument: identity.instrument, venue: identity.venue, marketType: identity.marketType, source: "websocket", quality: "VALID" });
  const projector = new LiquidityLifecycleProjector();
  const lifecycle = projector.project(first, second);
  const history = options.history === false ? null : new HistoricalLiquidityTruth(identity);
  if (history) { history.addCheckpoint(first); for (const event of lifecycle) history.addEvent(event); }
  const input: OrderFlowCompositionInput = { identity, book: second, trades: tape.getTrades(), tradeQuality: options.tradeQuality ?? "VALID", liquidityLifecycle: lifecycle, lifecycleQuality: options.lifecycleQuality ?? "VALID", historicalLiquidity: history, capturedAt: 300 };
  return composeOrderFlowState(input);
}

test("computes deterministic trade metrics and velocities per second", () => {
  const result = computeOrderFlowFeatures(makeState(), config);
  assert.deepEqual(result.derived.totalVolume.value, 10);
  assert.equal(result.derived.aggressiveBuyVolume.value, 5);
  assert.equal(result.derived.aggressiveSellVolume.value, 5);
  assert.equal(result.derived.delta.value, 0);
  assert.deepEqual(result.derived.cvd.value, [5, 2, 0]);
  assert.equal(result.derived.tradeCount.value, 3);
  assert.equal(result.derived.tradeVelocity.value, 15);
  assert.equal(result.derived.volumeVelocity.value, 50);
  assert.equal(result.derived.aggressiveBuyVelocity.value, 25);
  assert.equal(result.derived.aggressiveSellVelocity.value, 25);
});

test("filters trades by explicit time window and orders ties by tradeId", () => {
  const result = computeOrderFlowFeatures(makeState(), { window: { startTime: 149, endTime: 151, depthLevels: 2 } });
  assert.equal(result.derived.tradeCount.value, 2);
  assert.equal(result.derived.aggressiveBuyVolume.value, 5);
  assert.equal(result.derived.aggressiveSellVolume.value, 3);
  assert.deepEqual(result.derived.cvd.value, [5, 2]);
});

test("keeps book and trade imbalance separate and respects depth", () => {
  const result = computeOrderFlowFeatures(makeState(), config);
  assert.equal(result.derived.bookImbalance.value, (15 - 14) / 29);
  assert.equal(result.derived.tradeImbalance.value, 0);
  assert.equal(result.derived.bookImbalance.evidence[0]?.source, "book");
  assert.equal(result.derived.tradeImbalance.evidence[0]?.source, "trades");
});

test("distinguishes real zero from unavailable trades", () => {
  const zero = computeOrderFlowFeatures(makeState(), config);
  assert.equal(zero.derived.delta.availability, "AVAILABLE");
  assert.equal(zero.derived.delta.value, 0);
  const missing = computeOrderFlowFeatures(makeState(), config);
  (missing as { derived: typeof missing.derived }).derived;
  const unavailable = computeOrderFlowFeatures(makeState(), config);
  assert.equal(unavailable.derived.delta.value, 0);
  const noTrades = makeState();
  const empty = { ...noTrades, trades: [], quality: { ...noTrades.quality, trades: "UNAVAILABLE" as const } };
  const absent = computeOrderFlowFeatures(empty, config);
  assert.equal(absent.derived.totalVolume.value, null);
  assert.equal(absent.derived.totalVolume.availability, "UNAVAILABLE");
});

test("computes observable lifecycle rates without economic labels", () => {
  const result = computeOrderFlowFeatures(makeState(), config);
  assert.equal(result.derived.liquidityAdded.value, 7);
  assert.equal(result.derived.liquidityRemoved.value, 5);
  assert.equal(result.derived.liquidityAddRate.value, 35);
  assert.equal(result.derived.liquidityRemoveRate.value, 25);
  assert.equal(result.derived.persistence.availability, "AVAILABLE");
  assert.equal("pulling" in result, false);
  assert.equal("score" in result, false);
});

test("quality gates components independently and preserves identity", () => {
  const state = makeState(spot, { tradeQuality: "STALE", history: false });
  const bookGap = { ...state, book: { ...state.book!, quality: "GAP" as const }, quality: { ...state.quality, book: "GAP" as const } };
  const result = computeOrderFlowFeatures(bookGap, config);
  assert.equal(result.identity.marketType, "Spot");
  assert.equal(result.derived.bookImbalance.value, null);
  assert.equal(result.derived.tradeImbalance.availability, "PARTIAL");
  assert.equal(result.derived.liquidityAdded.value, 7);
  assert.equal(result.derived.persistence.value, null);
});

test("rejects non-positive duration and requires explicit book scope", () => {
  assert.throws(() => computeOrderFlowFeatures(makeState(), { window: { startTime: 2, endTime: 2, depthLevels: 2 } }), /duration/);
  const noScope = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300 } });
  assert.equal(noScope.derived.bookImbalance.value, null);
  assert.equal(noScope.derived.bookImbalance.availability, "UNAVAILABLE");
});

test("is deterministic and output mutation does not alter state", () => {
  const state = makeState(perp);
  const first = computeOrderFlowFeatures(state, config);
  const second = computeOrderFlowFeatures(state, config);
  assert.deepEqual(first, second);
  (first.derived.totalVolume as { value: number | null }).value = 999;
  assert.equal(computeOrderFlowFeatures(state, config).derived.totalVolume.value, 10);
});

test("preserves provenance and source timestamps without using capturedAt", () => {
  const state = makeState();
  const result = computeOrderFlowFeatures(state, config);
  assert.equal(result.derived.totalVolume.evidence[0]?.source, "trades");
  assert.equal(result.derived.totalVolume.evidence[0]?.provenance, state.provenance.trades);
  assert.equal(result.timestamps.book.eventTime, 200);
  assert.equal(result.timestamps.book.receiveTime, 201);
  assert.notEqual(result.timestamps.book.receiveTime, 300);
  (result.provenance.book as { source: "websocket" }).source = "rest";
  assert.equal(state.provenance.book?.source, "websocket");
});

test("degraded trade, lifecycle and history components fail closed independently", () => {
  const state = makeState(spot, { tradeQuality: "STALE", lifecycleQuality: "UNAVAILABLE", history: false });
  const result = computeOrderFlowFeatures(state, config);
  assert.equal(result.derived.totalVolume.availability, "PARTIAL");
  assert.equal(result.derived.tradeVelocity.availability, "PARTIAL");
  assert.equal(result.derived.liquidityAdded.availability, "UNAVAILABLE");
  assert.equal(result.derived.liquidityRemoveRate.availability, "UNAVAILABLE");
  assert.equal(result.derived.persistence.availability, "UNAVAILABLE");
});

test("replay to state to features is deterministic for Spot and Perpetual", () => {
  const events: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, quality: "VALID", source: "rest" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 100, quantity: 12 }], asks: [], sequence: 2, eventTime: 150, receiveTime: 151, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "1", price: 100.5, quantity: 2, aggressorSide: "BUY", eventTime: 150, receiveTime: 152, quality: "VALID", source: "websocket" },
    { type: "ADVANCE_TIME", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", eventTime: 200, receiveTime: 201, quality: "VALID", source: "websocket" },
  ];
  const first = replayTruth(events);
  const second = replayTruth(events);
  assert.deepEqual(first, second);
  assert.equal(first.l2Book?.marketType, "Spot");
  assert.equal(first.tradeTape[0]?.aggressorSide, "BUY");
  const history = new HistoricalLiquidityTruth(spot);
  history.addCheckpoint(first.l2Book!);
  for (const event of first.lifecycleEvents) history.addEvent(event);
  const state = composeOrderFlowState({ identity: spot, book: first.l2Book, trades: first.tradeTape, tradeQuality: "VALID", liquidityLifecycle: first.lifecycleEvents, lifecycleQuality: "VALID", historicalLiquidity: history, capturedAt: 200 });
  const features1 = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 200, depthLevels: 1 } });
  const features2 = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 200, depthLevels: 1 } });
  assert.deepEqual(features1, features2);
  assert.equal(features1.identity.marketType, "Spot");
});
