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

function stateFromReplay(events: readonly TruthReplayEvent[], identity: OrderFlowIdentity, capturedAt: number) {
  const replay = replayTruth(events);
  assert.equal(replay.l2Book?.instrument, identity.instrument);
  assert.equal(replay.l2Book?.marketType, identity.marketType);
  assert.ok(replay.l2Book);
  const history = new HistoricalLiquidityTruth(identity);
  const initialSnapshot = events.find((event) => event.type === "L2_SNAPSHOT" || event.type === "RESNAPSHOT");
  assert.ok(initialSnapshot);
  history.addCheckpoint({
    ...replay.l2Book,
    bids: initialSnapshot.bids,
    asks: initialSnapshot.asks,
    sequence: initialSnapshot.sequence,
    snapshotId: initialSnapshot.snapshotId ?? initialSnapshot.sequence,
    eventTime: initialSnapshot.eventTime,
    receiveTime: initialSnapshot.receiveTime,
    source: initialSnapshot.source,
    quality: initialSnapshot.quality,
    provenance: { ...replay.l2Book.provenance, source: initialSnapshot.source, snapshotId: initialSnapshot.snapshotId ?? initialSnapshot.sequence, sequence: initialSnapshot.sequence, eventTime: initialSnapshot.eventTime, receiveTime: initialSnapshot.receiveTime },
  });
  for (const event of replay.lifecycleEvents) history.addEvent(event);
  return {
    replay,
    state: composeOrderFlowState({
      identity,
      book: replay.l2Book,
      trades: replay.tradeTape,
      tradeQuality: "VALID",
      liquidityLifecycle: replay.lifecycleEvents,
      lifecycleQuality: "VALID",
      historicalLiquidity: history,
      capturedAt,
    }),
  };
}

function replayInferenceParity(events: readonly TruthReplayEvent[], identity: OrderFlowIdentity, capturedAt: number, config: OrderFlowFeatureConfig, feature: keyof ReturnType<typeof computeOrderFlowFeatures>["inference"]) {
  const first = computeOrderFlowFeatures(stateFromReplay(events, identity, capturedAt).state, config);
  const second = computeOrderFlowFeatures(stateFromReplay(events, identity, capturedAt).state, config);
  const firstInference = first.inference[feature];
  const secondInference = second.inference[feature];
  assert.equal(firstInference.status, "CANDIDATE");
  assert.deepEqual(
    { status: firstInference.status, evidence: firstInference.evidence, quality: firstInference.quality, window: firstInference.window, provenance: firstInference.provenance },
    { status: secondInference.status, evidence: secondInference.evidence, quality: secondInference.quality, window: secondInference.window, provenance: secondInference.provenance },
  );
  return { inference: firstInference, replay: stateFromReplay(events, identity, capturedAt).replay };
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
  const result = computeOrderFlowFeatures(makeState(), { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } });
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

test("N5G.4 detects absorption only with aggression, limited progress and passive persistence", () => {
  const state = makeState();
  const result = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 300] }, inference: { absorption: { enabled: true, minAggressiveVolume: 1, maxPriceProgress: 1, minPassivePersistenceMs: 0, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } });
  assert.equal(result.inference.absorption.status, "CANDIDATE");
  assert.equal(result.inference.absorption.evidence.some((item) => item.metric === "passiveSide" && item.value === "ASK"), true);
});

test("N5G.4 detects a multi-price sweep and rejects a single price", () => {
  const state = makeState();
  const trades = [100.1, 100.4, 100.8].map((price, index) => ({ ...state.trades[0]!, tradeId: `s${index}`, price, quantity: 2, aggressorSide: "BUY" as const, eventTime: 120 + index * 20 }));
  const result = computeOrderFlowFeatures({ ...state, trades }, { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } }, inference: { sweep: { enabled: true, maxDurationMs: 100, minPriceLevels: 3, minAggressiveVolume: 5, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } });
  assert.equal(result.inference.sweep.status, "CANDIDATE");
  assert.equal(result.inference.sweep.evidence.some((item) => item.metric === "distinctPriceLevels" && item.value === 3), true);
  const single = computeOrderFlowFeatures({ ...state, trades: [trades[0]!] }, { window: { startTime: 100, endTime: 300 }, inference: { sweep: { enabled: true, maxDurationMs: 100, minPriceLevels: 2, minAggressiveVolume: 1 } } });
  assert.equal(single.inference.sweep.status, "NOT_DETECTED");
});

test("N5G.4 maps passive defense sides without actor or direction labels", () => {
  const state = makeState();
  const result = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 300] }, inference: { passiveDefense: { enabled: true, minAggressiveVolume: 1, maxPriceExcursion: 1, minPassivePersistenceMs: 0, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } });
  assert.equal(result.inference.passiveDefense.status, "CANDIDATE");
  assert.equal(result.inference.passiveDefense.evidence.some((item) => item.metric === "passiveSide" && item.value === "ASK"), true);
  assert.equal("bullish" in result.inference.passiveDefense, false);
});

test("N5G.4 compares explicit earlier and later windows for aggressive exhaustion", () => {
  const state = makeState();
  const result = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } }, inference: { aggressiveExhaustion: { enabled: true, earlier: { startTime: 100, endTime: 199 }, later: { startTime: 200, endTime: 300 }, minVolumeDrop: 1, minVelocityDrop: 1, maxPriceProgress: 1, minOppositePersistenceMs: 0, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } });
  assert.equal(result.inference.aggressiveExhaustion.status, "CANDIDATE");
  assert.equal(result.inference.aggressiveExhaustion.evidence.some((item) => item.metric === "earlierVolume"), true);
});

test("N5G.4R closes sweep replay parity end-to-end", () => {
  const events: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 100, quantity: 20 }], asks: [{ price: 101, quantity: 20 }, { price: 102, quantity: 20 }, { price: 103, quantity: 20 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, quality: "VALID", source: "rest" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "s-3", price: 100.8, quantity: 2, aggressorSide: "BUY", eventTime: 120, receiveTime: 121, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "s-1", price: 101.2, quantity: 2, aggressorSide: "BUY", eventTime: 120, receiveTime: 122, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "s-2", price: 101.8, quantity: 2, aggressorSide: "BUY", eventTime: 140, receiveTime: 141, quality: "VALID", source: "websocket" },
    { type: "ADVANCE_TIME", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", eventTime: 300, receiveTime: 301, quality: "VALID", source: "websocket" },
  ];
  const config: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } }, inference: { sweep: { enabled: true, maxDurationMs: 100, minPriceLevels: 3, minAggressiveVolume: 5, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } };
  const { inference, replay } = replayInferenceParity(events, spot, 300, config, "sweep");
  assert.equal(inference.status, "CANDIDATE");
  assert.deepEqual(replay.tradeTape.map((trade) => trade.tradeId), ["s-1", "s-3", "s-2"]);
  assert.equal(replay.tradeTape.every((trade) => trade.aggressorSide === "BUY"), true);
});

test("N5G.4R closes passive defense replay parity end-to-end", () => {
  const events: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 99, quantity: 20 }], asks: [{ price: 101, quantity: 10 }, { price: 102, quantity: 10 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, quality: "VALID", source: "rest" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [], asks: [{ price: 101, quantity: 5 }], sequence: 2, eventTime: 200, receiveTime: 201, quality: "VALID", source: "websocket" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [], asks: [{ price: 101, quantity: 10 }], sequence: 3, eventTime: 250, receiveTime: 251, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "pd-1", price: 100.8, quantity: 6, aggressorSide: "BUY", eventTime: 220, receiveTime: 221, quality: "VALID", source: "websocket" },
    { type: "ADVANCE_TIME", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", eventTime: 300, receiveTime: 301, quality: "VALID", source: "websocket" },
  ];
  const config: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 250, 300] }, inference: { passiveDefense: { enabled: true, minAggressiveVolume: 5, maxPriceExcursion: 1, minPassivePersistenceMs: 0, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } };
  const { inference } = replayInferenceParity(events, spot, 300, config, "passiveDefense");
  assert.equal(inference.status, "CANDIDATE");
  assert.equal(inference.evidence.some((item) => item.metric === "passiveSide" && item.value === "ASK"), true);
});

test("N5G.4R closes aggressive exhaustion replay parity end-to-end", () => {
  const events: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 99, quantity: 20 }], asks: [{ price: 101, quantity: 20 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, quality: "VALID", source: "rest" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 99, quantity: 21 }], asks: [], sequence: 2, eventTime: 150, receiveTime: 151, quality: "VALID", source: "websocket" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [], asks: [{ price: 101, quantity: 19 }], sequence: 3, eventTime: 180, receiveTime: 181, quality: "VALID", source: "websocket" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 99, quantity: 20 }], asks: [], sequence: 4, eventTime: 250, receiveTime: 251, quality: "VALID", source: "websocket" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [], asks: [{ price: 101, quantity: 20 }], sequence: 5, eventTime: 260, receiveTime: 261, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "ae-1", price: 100.5, quantity: 10, aggressorSide: "BUY", eventTime: 120, receiveTime: 121, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "ae-2", price: 100.5, quantity: 8, aggressorSide: "BUY", eventTime: 140, receiveTime: 141, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "ae-3", price: 100.5, quantity: 1, aggressorSide: "BUY", eventTime: 220, receiveTime: 221, quality: "VALID", source: "websocket" },
    { type: "ADVANCE_TIME", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", eventTime: 300, receiveTime: 301, quality: "VALID", source: "websocket" },
  ];
  const config: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } }, inference: { aggressiveExhaustion: { enabled: true, earlier: { startTime: 100, endTime: 199 }, later: { startTime: 200, endTime: 300 }, minVolumeDrop: 1, minVelocityDrop: 1, maxPriceProgress: 1, minOppositePersistenceMs: 0, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } };
  const { inference } = replayInferenceParity(events, spot, 300, config, "aggressiveExhaustion");
  assert.equal(inference.status, "CANDIDATE");
  assert.equal(inference.evidence.some((item) => item.metric === "earlierVolume" && item.value === 18), true);
});
test("N5G.4 fails closed for missing history and preserves candidate replay parity", () => {
  const state = makeState();
  const absorptionConfig: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 300] }, inference: { absorption: { enabled: true, minAggressiveVolume: 1, maxPriceProgress: 1, minPassivePersistenceMs: 0, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 } } } };
  const candidate = computeOrderFlowFeatures(state, absorptionConfig);
  assert.equal(candidate.inference.absorption.status, "CANDIDATE");
  assert.deepEqual(candidate.inference, computeOrderFlowFeatures(state, absorptionConfig).inference);
  const missingHistory = { ...state, historicalLiquidity: { latestFrame: null, bookAt: (_time: number) => null }, quality: { ...state.quality, history: "UNAVAILABLE" as const } };
  const unavailable = computeOrderFlowFeatures(missingHistory, absorptionConfig);
  assert.notEqual(unavailable.inference.absorption.status, "CANDIDATE");
  assert.ok(["PARTIAL", "UNAVAILABLE"].includes(unavailable.inference.absorption.status));
});

test("N5G.5 compression requires contained sampled price, repeated interaction and passive persistence", () => {
  const state = makeState();
  const result = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 300] }, inference: { compression: { enabled: true, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, minDurationMs: 150, maxObservedPriceRange: 1, minInteractionCount: 2, minInteractionVolume: 5, minPassiveQuantity: 1, minPassivePersistenceMs: 0 } } });
  assert.equal(result.inference.compression.status, "CANDIDATE");
  assert.equal((result.inference.compression as typeof result.inference.compression & { passiveSide?: string }).passiveSide, "BOTH");
  assert.equal(result.inference.compression.evidence.some((item) => item.metric === "observedPriceRange" && item.value === 0), true);
  assert.equal("bullishCompression" in result.inference.compression, false);
});

test("N5G.5 compression is not inferred from range, liquidity or interaction alone", () => {
  const state = makeState();
  const base = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 300] }, inference: { compression: { enabled: true, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, minDurationMs: 150, maxObservedPriceRange: 1, minInteractionCount: 2, minPassiveQuantity: 1, minPassivePersistenceMs: 0 } } } as const;
  assert.equal(computeOrderFlowFeatures({ ...state, liquidityLifecycle: [] }, base).inference.compression.status, "UNAVAILABLE");
  assert.equal(computeOrderFlowFeatures({ ...state, trades: [] }, base).inference.compression.status, "UNAVAILABLE");
  assert.equal(computeOrderFlowFeatures(state, { ...base, inference: { compression: { ...base.inference.compression, minInteractionCount: 99 } } }).inference.compression.status, "NOT_DETECTED");
});

test("N5G.5 compression preserves sample range semantics and fails closed on missing frames", () => {
  const state = makeState();
  const config: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [300, 100, 200, 200] }, inference: { compression: { enabled: true, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, minDurationMs: 150, maxObservedPriceRange: 1, minInteractionCount: 2, minPassiveQuantity: 1, minPassivePersistenceMs: 0 } } };
  const result = computeOrderFlowFeatures(state, config);
  assert.equal(result.inference.compression.status, "CANDIDATE");
  assert.equal(result.inference.compression.evidence.some((item) => item.metric === "sampleCount" && item.value === 3), true);
  const missing = { ...state, historicalLiquidity: { latestFrame: null, bookAt: (_time: number) => null }, quality: { ...state.quality, history: "UNAVAILABLE" as const } };
  assert.notEqual(computeOrderFlowFeatures(missing, config).inference.compression.status, "CANDIDATE");
});

test("N5G.5 compression supports BID, ASK and BOTH passive sides", () => {
  const state = makeState();
  const common = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 200, 300] }, inference: { compression: { enabled: true, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, minDurationMs: 150, maxObservedPriceRange: 1, minInteractionCount: 2, minPassivePersistenceMs: 0 } } } as const;
  const both = computeOrderFlowFeatures(state, common);
  assert.equal((both.inference.compression as typeof both.inference.compression & { passiveSide?: string }).passiveSide, "BOTH");
  const bidOnly = computeOrderFlowFeatures({ ...state, liquidityLifecycle: state.liquidityLifecycle.filter((event) => event.side === "bid") }, common);
  assert.equal((bidOnly.inference.compression as typeof bidOnly.inference.compression & { passiveSide?: string }).passiveSide, "BID");
  const askOnly = computeOrderFlowFeatures({ ...state, liquidityLifecycle: state.liquidityLifecycle.filter((event) => event.side === "ask") }, common);
  assert.equal((askOnly.inference.compression as typeof askOnly.inference.compression & { passiveSide?: string }).passiveSide, "ASK");
});

test("N5G.5 compression replay parity is end-to-end and deeply deterministic", () => {
  const events: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, quality: "VALID", source: "rest" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 100, quantity: 12 }], asks: [], sequence: 2, eventTime: 150, receiveTime: 151, quality: "VALID", source: "websocket" },
    { type: "L2_DELTA", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", bids: [{ price: 100, quantity: 10 }], asks: [], sequence: 3, eventTime: 200, receiveTime: 201, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "c-1", price: 100.5, quantity: 3, aggressorSide: "BUY", eventTime: 160, receiveTime: 161, quality: "VALID", source: "websocket" },
    { type: "TRADE", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "c-2", price: 100.5, quantity: 3, aggressorSide: "SELL", eventTime: 220, receiveTime: 221, quality: "VALID", source: "websocket" },
    { type: "ADVANCE_TIME", instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", eventTime: 300, receiveTime: 301, quality: "VALID", source: "websocket" },
  ];
  const config: OrderFlowFeatureConfig = { window: { startTime: 100, endTime: 300, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, sampleTimes: [100, 150, 200, 300] }, inference: { compression: { enabled: true, priceBand: { mode: "absolute", minPrice: 100, maxPrice: 102 }, minDurationMs: 150, maxObservedPriceRange: 1, minInteractionCount: 2, minInteractionVolume: 5, minPassiveQuantity: 1, minPassivePersistenceMs: 0 } } };
  const replayFeature = () => {
    const replay = replayTruth(events);
    assert.ok(replay.l2Book);
    const history = new HistoricalLiquidityTruth(spot);
    const snapshot = events[0]!;
    history.addCheckpoint({ ...replay.l2Book, bids: snapshot.bids, asks: snapshot.asks, sequence: snapshot.sequence, snapshotId: snapshot.snapshotId, eventTime: snapshot.eventTime, receiveTime: snapshot.receiveTime, source: snapshot.source, quality: snapshot.quality, provenance: { ...replay.l2Book.provenance, source: snapshot.source, snapshotId: snapshot.snapshotId, sequence: snapshot.sequence, eventTime: snapshot.eventTime, receiveTime: snapshot.receiveTime } });
    for (const event of replay.lifecycleEvents) history.addEvent(event);
    const state = composeOrderFlowState({ identity: spot, book: replay.l2Book, trades: replay.tradeTape, tradeQuality: "VALID", liquidityLifecycle: replay.lifecycleEvents, lifecycleQuality: "VALID", historicalLiquidity: history, capturedAt: 300 });
    return computeOrderFlowFeatures(state, config).inference.compression;
  };
  const first = replayFeature();
  const second = replayFeature();
  assert.equal(first.status, "CANDIDATE");
  assert.deepEqual(first, second);
});
