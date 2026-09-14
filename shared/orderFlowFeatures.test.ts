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
  assert.equal(result.inference.pulling.status, "NOT_DETECTED");
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

test("supports absolute and relative price bands with deterministic intersection depth", () => {
  const absolute = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 101 } } });
  assert.equal(absolute.derived.bidDepth.value, 15);
  assert.equal(absolute.derived.askDepth.value, 8);
  const relative = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, priceBand: { mode: "relativeToMid", minDistance: 0.5, maxDistance: 1 } } });
  assert.equal(relative.derived.bidDepth.value, 15);
  assert.equal(relative.derived.askDepth.value, 8);
  const intersection = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, depthLevels: 1, priceBand: { mode: "absolute", minPrice: 99, maxPrice: 102 } } });
  assert.equal(intersection.derived.bidDepth.value, 15);
  assert.equal(intersection.derived.askDepth.value, 8);
  assert.throws(() => computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 0, maxPrice: 1 } } }), /priceBand/);
});

test("exposes explicit price response and leaves unsampled price range unavailable", () => {
  const result = computeOrderFlowFeatures(makeState(), config);
  assert.equal(result.derived.startMid.value, 100.5);
  assert.equal(result.derived.endMid.value, 100.5);
  assert.equal(result.derived.signedPriceChange.value, 0);
  assert.equal(result.derived.absolutePriceChange.value, 0);
  assert.equal(result.derived.priceRange.value, null);
  const sampled = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, depthLevels: 2, sampleTimes: [300, 100, 200, 200] } });
  assert.deepEqual(sampled.derived.midSeries.value?.map((point) => point.time), [100, 200, 300]);
  assert.equal(sampled.derived.priceRange.value, 0);
});

test("explicit samples preserve missing frames and never synthesize zero", () => {
  const state = makeState();
  const missingHistory = { ...state, historicalLiquidity: { latestFrame: null, bookAt: (_time: number) => null }, quality: { ...state.quality, history: "UNAVAILABLE" as const } };
  const result = computeOrderFlowFeatures(missingHistory, { window: { startTime: 100, endTime: 300, sampleTimes: [200, 100] } });
  assert.deepEqual(result.derived.midSeries.value?.map((point) => point.value), [null, null]);
  assert.equal(result.derived.midSeries.availability, "PARTIAL");
  assert.notEqual(result.derived.midSeries.value?.[0]?.value, 0);
  assert.deepEqual(result.derived.midSeries.evidence[0]?.sampleTimes, [100, 200]);
});

test("measures interactions only inside an explicit price band", () => {
  const result = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 101 } } });
  assert.equal(result.derived.interactionTradeCount.value, 3);
  assert.equal(result.derived.interactionVolume.value, 10);
  assert.equal(result.derived.aggressiveBuyInteractionVolume.value, 5);
  assert.equal(result.derived.aggressiveSellInteractionVolume.value, 5);
  assert.equal(result.derived.firstInteractionTime.value, 150);
  assert.equal(result.derived.lastInteractionTime.value, 250);
  assert.equal(computeOrderFlowFeatures(makeState(), config).derived.interactionTradeCount.value, null);
});

test("measures same-level liquidity reappearance without naming its cause", () => {
  const state = makeState();
  const removal = state.liquidityLifecycle.find((event) => event.eventType === "REMOVE")!;
  const readd = { ...removal, eventType: "ADD" as const, previousQuantity: 0, newQuantity: 4, deltaQuantity: 4, sequence: 3, eventTime: 250, receiveTime: 251 };
  const altered = { ...state, liquidityLifecycle: [removal, readd], quality: { ...state.quality, lifecycle: "VALID" as const } };
  const result = computeOrderFlowFeatures(altered, config);
  assert.deepEqual(result.derived.liquidityReappearance.value, [{ side: "bid", price: 99, reappearanceCount: 1, reappearedQuantity: 4, firstRemovalTime: 200, firstReappearanceTime: 250, delayToReappearance: 50 }]);
  assert.equal("replenishment" in result, false);
});

test("reports observable lifecycle counts, net changes and sequence continuity", () => {
  const result = computeOrderFlowFeatures(makeState(), config);
  assert.equal(result.derived.additionEventCount.value, 0);
  assert.equal(result.derived.removalEventCount.value, 1);
  assert.equal(result.derived.positiveUpdateCount.value, 2);
  assert.equal(result.derived.decreaseCount.value, 0);
  assert.equal(result.derived.removeCount.value, 1);
  assert.equal(result.derived.netLiquidityChange.value, 2);
  assert.equal(result.derived.bidNetLiquidityChange.value, 0);
  assert.equal(result.derived.askNetLiquidityChange.value, 2);
  assert.equal(result.derived.sequenceCoverage.value?.continuity, "CONTIGUOUS");
  assert.equal(result.derived.sequenceCoverage.value?.observedEvents, 1);
});

test("does not infer from isolated REMOVE, UPDATE or single ADD", () => {
  const result = computeOrderFlowFeatures(makeState(), { ...config, inference: {
    replenishment: { enabled: true, maxReappearanceDelayMs: 100, correlationWindowMs: 100 },
    pulling: { enabled: true, correlationWindowMs: 100, maxObservedAggressionToRemovalRatio: 0.5 },
    stacking: { enabled: true, minLevels: 2, minAddedQuantity: 1 },
    liquidityVacuum: { enabled: true, maxDepth: 1, minSpread: 2, minDepthReductionRatio: 0.5, },
  } });
  assert.equal(result.inference.replenishment.status, "NOT_DETECTED");
  assert.equal(result.inference.pulling.status, "NOT_DETECTED");
  assert.equal(result.inference.stacking.status, "NOT_DETECTED");
  assert.equal(result.inference.liquidityVacuum.status, "UNAVAILABLE");
});

test("produces a replenishment candidate only with reappearance and compatible observed aggression", () => {
  const state = makeState();
  const removal = state.liquidityLifecycle.find((event) => event.eventType === "REMOVE")!;
  const readd = { ...removal, eventType: "ADD" as const, previousQuantity: 0, newQuantity: 4, deltaQuantity: 4, sequence: 3, eventTime: 250, receiveTime: 251 };
  const altered = { ...state, liquidityLifecycle: [removal, readd] };
  const result = computeOrderFlowFeatures(altered, { window: { startTime: 100, endTime: 300, depthLevels: 2, priceBand: { mode: "absolute", minPrice: 98, maxPrice: 101 } }, inference: { replenishment: { enabled: true, maxReappearanceDelayMs: 100, correlationWindowMs: 100, minRemovedQuantity: 1, minReappearedQuantity: 1 } } });

  assert.equal(result.inference.replenishment.status, "CANDIDATE");
  assert.equal(result.inference.replenishment.evidence.some((item) => item.metric === "observedAggressiveVolume"), true);
  assert.equal(result.inference.replenishment.quality, "VALID");
});

test("produces a pulling candidate only when observed aggression is below explicit policy", () => {
  const state = makeState();
  const altered = { ...state, trades: [{ ...state.trades.find((trade) => trade.aggressorSide === "SELL")!, price: 99 }] };
  const result = computeOrderFlowFeatures(altered, { window: { startTime: 100, endTime: 300, depthLevels: 2, priceBand: { mode: "absolute", minPrice: 98, maxPrice: 101 } }, inference: { pulling: { enabled: true, correlationWindowMs: 100, maxObservedAggressionToRemovalRatio: 0.75, minRemovedQuantity: 1, priceBand: { mode: "absolute", minPrice: 98, maxPrice: 101 } } } });

  assert.equal(result.inference.pulling.status, "CANDIDATE");
  assert.equal(result.inference.pulling.evidence.some((item) => item.metric === "observedAggressionToRemovalRatio"), true);
  assert.equal(result.inference.pulling.evidence.some((item) => item.metric === "cancel"), false);
});

test("requires multiple same-side levels for stacking and preserves side evidence", () => {
  const state = makeState();
  const base = state.liquidityLifecycle.find((event) => event.eventType === "UPDATE" && event.side === "bid")!;
  const second = { ...base, price: 98, sequence: 3, eventTime: 250, receiveTime: 251, previousQuantity: 0, newQuantity: 3, deltaQuantity: 3, eventType: "ADD" as const };
  const altered = { ...state, liquidityLifecycle: [...state.liquidityLifecycle, second] };
  const result = computeOrderFlowFeatures(altered, { window: { startTime: 100, endTime: 300, depthLevels: 2, priceBand: { mode: "absolute", minPrice: 98, maxPrice: 101 } }, inference: { stacking: { enabled: true, minLevels: 2, minAddedQuantity: 7 } } });
  assert.equal(result.inference.stacking.status, "CANDIDATE");
  assert.equal(result.inference.stacking.evidence.some((item) => item.metric === "side" && item.value === "bid"), true);
});

test("degraded trades cannot produce replenishment or pulling candidates", () => {
  const state = makeState(spot, { tradeQuality: "STALE" });
  const result = computeOrderFlowFeatures(state, { ...config, inference: {
    replenishment: { enabled: true, maxReappearanceDelayMs: 100, correlationWindowMs: 100 },
    pulling: { enabled: true, correlationWindowMs: 100, maxObservedAggressionToRemovalRatio: 0.5 },
  } });
  assert.notEqual(result.inference.replenishment.status, "CANDIDATE");
  assert.notEqual(result.inference.pulling.status, "CANDIDATE");
  assert.ok(["PARTIAL", "UNAVAILABLE"].includes(result.inference.replenishment.status));
});
