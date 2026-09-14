import assert from "node:assert/strict";
import test from "node:test";
import type { GammaContext, MarketLevel, MarketReferencePrice, MarketTruth } from "./marketTruth";
import type { OrderFlowFeatures } from "./orderFlowFeatures";
import type { OrderFlowState } from "./orderFlowState";
import { computeMarketTruthGeometry, type MarketTruthGeometryConfig } from "./marketTruthGeometry";
import { composeMarketTruth } from "./marketTruth";
import { composeOrderFlowState } from "./orderFlowState";
import { computeOrderFlowFeatures } from "./orderFlowFeatures";
import { replayTruth, type TruthReplayEvent } from "./truthReplay";

const execution = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" as const };
const optionsReference = { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" as const };
const referencePrice: MarketReferencePrice = { value: 100, source: "Deribit Index", eventTime: 1000, receiveTime: 1010, quality: "VALID", provenance: { origin: "RAW", source: "deribit", referenceIdentity: optionsReference, eventTime: 1000, receiveTime: 1010, snapshotTime: 1000, calculatedAt: 1000 } };

function level(type: MarketLevel["type"], price: number, extra: Record<string, string | number | null> = {}): MarketLevel {
  return { type, price, referenceIdentity: optionsReference, source: "LIVE_DERIBIT", origin: "DERIVED", calculatedAt: 900, quality: "VALID", provenance: { origin: "DERIVED", source: "LIVE_DERIBIT", referenceIdentity: optionsReference, calculatedAt: 900, identifiers: { snapshotId: "s1", ...extra } } };
}
function state(): OrderFlowState {
  return {
    identity: execution, book: null, bbo: { bid: 99, ask: 101, spread: 2, mid: 100 },
    trades: [
      { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "1", price: 100.5, quantity: 2, aggressorSide: "BUY", eventTime: 1020, receiveTime: 1021, source: "websocket", quality: "VALID", provenance: { tradeId: "1", source: "websocket", eventTime: 1020, receiveTime: 1021 } },
      { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "2", price: 103, quantity: 5, aggressorSide: "SELL", eventTime: 1030, receiveTime: 1031, source: "websocket", quality: "VALID", provenance: { tradeId: "2", source: "websocket", eventTime: 1030, receiveTime: 1031 } },
    ],
    liquidityLifecycle: [{ instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", side: "bid", price: 100, previousQuantity: 1, newQuantity: 3, deltaQuantity: 2, eventType: "ADD", sequence: 1, eventTime: 1020, receiveTime: 1021, quality: "VALID", provenance: { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", source: "websocket", sequence: 1, eventTime: 1020, receiveTime: 1021 } }],
    historicalLiquidity: { latestFrame: null, bookAt: () => null }, quality: { book: "VALID", trades: "VALID", lifecycle: "VALID", history: "VALID", overall: "VALID" },
    timestamps: { book: { eventTime: 1000, receiveTime: 1001 }, trades: { oldestEventTime: 1020, newestEventTime: 1030, latestReceiveTime: 1031 }, lifecycle: { oldestEventTime: 1020, newestEventTime: 1020, latestReceiveTime: 1021 }, history: { latestEventTime: 1000, latestReceiveTime: 1001 } },
    provenance: { book: null, trades: { source: "websocket", latest: null }, lifecycle: { source: "websocket", latest: null }, history: null }, consistency: { status: "CONSISTENT", bookSequence: 1, bookSnapshotId: 1, latestTradeId: "2", latestLifecycleSequence: 1, historySequence: 1, capturedAt: 1100 }, capturedAt: 1100,
  } as unknown as OrderFlowState;
}
function features(): OrderFlowFeatures {
  return { identity: execution, window: { startTime: 1000, endTime: 1100 }, derived: {} as OrderFlowFeatures["derived"], inference: { absorption: { status: "CANDIDATE" }, compression: { status: "CANDIDATE" }, sweep: { status: "CANDIDATE" }, passiveDefense: { status: "CANDIDATE" } } as OrderFlowFeatures["inference"], quality: state().quality, timestamps: state().timestamps, provenance: state().provenance } as OrderFlowFeatures;
}
function truth(levels: readonly MarketLevel[] = [level("GAMMA_FLIP", 100), level("CALL_WALL", 105), level("PUT_WALL", 95)]): MarketTruth {
  return { identity: execution, orderFlow: { state: state(), features: features(), quality: { orderFlow: "VALID", features: "VALID" }, timestamps: { orderFlow: {}, features: {} }, provenance: { orderFlow: { origin: "RAW" }, features: { origin: "DERIVED" } } }, options: { referenceIdentity: optionsReference, referencePrice, gamma: {} as GammaContext, optionsOpenInterest: null, keyLevels: levels }, futuresOpenInterest: null, volatility: null, regime: null, quality: { orderFlow: "VALID", features: "VALID", gamma: "VALID", optionsOI: "UNAVAILABLE", futuresOI: "UNAVAILABLE", volatility: "UNAVAILABLE", regime: "UNAVAILABLE", overall: "PARTIAL" }, timestamps: {} as MarketTruth["timestamps"], provenance: {} as MarketTruth["provenance"], consistency: {} as MarketTruth["consistency"], capturedAt: 1100 } as MarketTruth;
}

test("computes signed/absolute/ratio distance and preserves Spot, Deribit identities", () => {
  const result = computeMarketTruthGeometry(truth(), {});
  const call = result.levels.find((x) => x.level.type === "CALL_WALL")!;
  assert.equal(call.signedDistance, -5);
  assert.equal(call.absoluteDistance, 5);
  assert.equal(call.distanceRatio, 0.05);
  assert.equal(call.executionPrice, 100);
  assert.equal(call.executionPriceSource, "Binance Spot");
  assert.equal(call.referencePriceSource, "Deribit Index");
  assert.deepEqual(call.levelReferenceIdentity, optionsReference);
  assert.notDeepEqual(truth().identity, call.levelReferenceIdentity);
});

test("selects nearest level with deterministic type/price tie-break", () => {
  const result = computeMarketTruthGeometry(truth([level("PUT_WALL", 95), level("CALL_WALL", 105), level("GAMMA_FLIP", 105)]), {});
  assert.equal(result.nearestLevel?.level.type, "CALL_WALL");
  assert.equal(result.gammaFlip?.level.type, "GAMMA_FLIP");
});

test("handles zones, inverted bounds, and no target semantics", () => {
  const zone = level("SHORT_GAMMA_ZONE", 110, { end: 90 });
  const result = computeMarketTruthGeometry(truth([zone]), { atLevelTolerance: 0.1 });
  assert.equal(result.levels[0]?.startPrice, 110);
  assert.equal(result.levels[0]?.endPrice, 90);
  assert.equal(result.levels[0]?.relation, "INSIDE_ZONE");
  assert.equal(JSON.stringify(result).includes("target"), false);
  assert.equal(JSON.stringify(result).includes("support"), false);
});

test("requires an explicit compatible reference price and exposes mismatch", () => {
  const missing = computeMarketTruthGeometry({ ...truth(), options: { ...truth().options, referencePrice: null } }, {});
  assert.equal(missing.quality.geometry, "UNAVAILABLE");
  const mismatched = level("GAMMA_FLIP", 100);
  mismatched.referenceIdentity = { referenceAsset: "ETH", venue: "Deribit", referenceType: "INDEX" };
  const result = computeMarketTruthGeometry(truth([mismatched]), {});
  assert.equal(result.levels[0]?.referenceAlignment, "MISMATCH");
  assert.equal(result.levels[0]?.quality, "UNAVAILABLE");
});

test("detects explicit crossings and observable re-crossings without interpolation", () => {
  const result = computeMarketTruthGeometry(truth(), { atLevelTolerance: 0, referenceSamples: [{ time: 1, price: 99 }, { time: 2, price: 101 }, { time: 3, price: 99 }, { time: 4, price: 101 }] });
  const state = Object.values(result.crossingState).find((x) => x.crossingCount === 3)!;
  assert.equal(state.crossingCount, 3);
  assert.equal(state.reCrossingCount, 2);
  assert.equal(state.crossings[0]?.fromSide, "BELOW");
  assert.equal(state.crossings[0]?.toSide, "ABOVE");
  assert.equal(state.crossings[0]?.observedCrossingTime, 2);
  assert.equal(result.crossings.some((x) => "acceptanceState" in x), false);
});

test("same-side samples do not cross and missing samples are not invented", () => {
  const result = computeMarketTruthGeometry(truth(), { referenceSamples: [{ time: 1, price: 99 }, { time: 4, price: 101 }] });
  assert.equal(result.crossings.length, 1);
  const noSamples = computeMarketTruthGeometry(truth(), {});
  assert.equal(noSamples.quality.crossings, "UNAVAILABLE");
});

test("counts residence only from explicit usable samples", () => {
  const result = computeMarketTruthGeometry(truth(), { proximityBand: { mode: "ABSOLUTE", value: 2 }, referenceSamples: [{ time: 1, price: 99 }, { time: 2, price: 100 }, { time: 3, price: 103 }, { time: 4, price: 101 }] });
  const residence = result.residence.find((x) => x.level.type === "GAMMA_FLIP")!;
  assert.equal(residence.samplesNearLevel, 3);
  assert.equal(residence.totalUsableSamples, 4);
  assert.equal(residence.presenceRatioNearLevel, 0.75);
  assert.equal(residence.observedResidenceSpan, 3);
});

test("observes order flow near level and references N5G candidates without relabeling", () => {
  const result = computeMarketTruthGeometry(truth(), { levelBand: { mode: "ABSOLUTE", value: 2 } });
  const near = result.orderFlowNearLevels.find((x) => x.level.type === "GAMMA_FLIP")!;
  assert.equal(near.interactionTradeCount, 1);
  assert.equal(near.interactionVolume, 2);
  assert.equal(near.buyInteractionVolume, 2);
  assert.equal(near.liquidityAdded, 2);
  assert.equal(near.absorptionStatus, "CANDIDATE");
  assert.equal(near.compressionStatus, "CANDIDATE");
  assert.equal(near.sweepStatus, "CANDIDATE");
  assert.equal(near.passiveDefenseStatus, "CANDIDATE");
  for (const forbidden of ["ACCEPTED", "REJECTED", "HELD", "FAILED", "TARGETED"]) assert.equal(JSON.stringify(near).includes(forbidden), false);
});

test("preserves quality independently, including stale gamma and missing trade coverage", () => {
  const staleLevel = level("GAMMA_FLIP", 100); staleLevel.quality = "STALE";
  const stale = computeMarketTruthGeometry(truth([staleLevel]), {});
  assert.equal(stale.levels[0]?.quality, "STALE");
  const missingTrades = state(); missingTrades.quality = { ...missingTrades.quality, trades: "UNAVAILABLE" };
  const result = computeMarketTruthGeometry({ ...truth(), orderFlow: { ...truth().orderFlow, state: missingTrades } }, { levelBand: { mode: "ABSOLUTE", value: 2 } });
  assert.equal(result.orderFlowNearLevels[0]?.interactionTradeCount, null);
  assert.equal(result.orderFlowNearLevels[0]?.quality, "PARTIAL");
});

test("valid zero interaction is distinct from unavailable interaction", () => {
  const noTrades = state(); noTrades.trades = [];
  const valid = computeMarketTruthGeometry({ ...truth(), orderFlow: { ...truth().orderFlow, state: noTrades } }, { levelBand: { mode: "ABSOLUTE", value: 2 } });
  assert.equal(valid.orderFlowNearLevels[0]?.interactionTradeCount, 0);
  const unavailable = state(); unavailable.quality = { ...unavailable.quality, trades: "UNAVAILABLE" };
  const missing = computeMarketTruthGeometry({ ...truth(), orderFlow: { ...truth().orderFlow, state: unavailable } }, { levelBand: { mode: "ABSOLUTE", value: 2 } });
  assert.equal(missing.orderFlowNearLevels[0]?.interactionTradeCount, null);
});

test("is defensive and deterministic", () => {
  const config: MarketTruthGeometryConfig = { atLevelTolerance: 0.1, levelBand: { mode: "RATIO", value: 0.03 }, proximityBand: { mode: "ABSOLUTE", value: 2 }, referenceSamples: [{ time: 1, price: 99 }, { time: 2, price: 101 }] };
  const source = truth(); const first = computeMarketTruthGeometry(source, config); const second = computeMarketTruthGeometry(source, config);
  assert.deepEqual(first, second);
  first.levels[0]!.level.provenance.identifiers!.snapshotId = "mutated";
  assert.equal(source.options.keyLevels[0]!.provenance.identifiers?.snapshotId, "s1");
  for (const forbidden of ["ACCEPTED", "REJECTED", "SUPPORT", "RESISTANCE", "MAGNET_TARGET", "BREAKOUT", "LONG", "SHORT", "bullish", "bearish", "entry", "stop", "TP", "recommendation", "confidence", "probability"]) assert.equal(JSON.stringify(first).includes(forbidden), false, forbidden);
});

test("replay to OrderFlowState to features to MarketTruth preserves geometry deterministically", () => {
  const replayEvents: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", ...execution, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" },
    { type: "L2_DELTA", ...execution, bids: [{ price: 99, quantity: 12 }], asks: [], sequence: 2, eventTime: 110, receiveTime: 111, source: "websocket", quality: "VALID" },
    { type: "TRADE", ...execution, tradeId: "r1", price: 100, quantity: 2, aggressorSide: "BUY", eventTime: 111, receiveTime: 112, source: "websocket", quality: "VALID" },
    { type: "ADVANCE_TIME", ...execution, eventTime: 200, receiveTime: 201, source: "websocket", quality: "VALID" },
  ];
  const run = () => {
    const replay = replayTruth(replayEvents);
    const state = composeOrderFlowState({ identity: execution, book: replay.l2Book, trades: replay.tradeTape, tradeQuality: "VALID", liquidityLifecycle: replay.lifecycleEvents, lifecycleQuality: "VALID", historicalLiquidity: null, capturedAt: 200 });
    const features = computeOrderFlowFeatures(state, { window: { startTime: 100, endTime: 200, sampleTimes: [100, 150, 200] } });
    const marketTruth = composeMarketTruth({ identity: execution, orderFlow: { state, features }, options: { referenceIdentity: optionsReference, referencePrice, gamma: {} as GammaContext, optionsOpenInterest: null, keyLevels: [level("GAMMA_FLIP", 100)] }, futuresOpenInterest: null, volatility: null, regime: null, capturedAt: 200 });
    return computeMarketTruthGeometry(marketTruth, { levelBand: { mode: "ABSOLUTE", value: 1 }, atLevelTolerance: 0, proximityBand: { mode: "ABSOLUTE", value: 1 }, referenceSamples: [{ time: 100, price: 99 }, { time: 150, price: 101 }, { time: 200, price: 99 }] });
  };
  const first = run(); const second = run();
  assert.deepEqual(first, second);
  assert.equal(first.gammaFlip?.absoluteDistance, 0);
  assert.equal(first.crossingState["GAMMA_FLIP:100:s1"]?.crossingCount, 2);
  assert.equal(first.orderFlowNearLevels[0]?.interactionTradeCount, 1);
});
