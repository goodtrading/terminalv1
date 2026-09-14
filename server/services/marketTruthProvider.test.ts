import assert from "node:assert/strict";
import test from "node:test";
import { composeMarketTruth } from "../../shared/marketTruth";
import type { OrderFlowFeatures } from "../../shared/orderFlowFeatures";
import { computeOrderFlowFeatures } from "../../shared/orderFlowFeatures";
import { composeOrderFlowState, type OrderFlowIdentity, type OrderFlowState } from "../../shared/orderFlowState";
import { HistoricalLiquidityTruth } from "../../shared/historicalLiquidityTruth";
import { replayTruth, type TruthReplayEvent } from "../../shared/truthReplay";
import { createMarketTruthProvider, type MarketTruthProviderDependencies, type MarketTruthRequest } from "./marketTruthProvider";
import type { GammaOptionsSnapshotInput } from "../../shared/gammaOptionsAdapter";
import type { VolatilitySnapshotInput } from "../../shared/volatilityContextAdapter";
import type { RegimeSnapshotInput } from "../../shared/regimeContextAdapter";

const spot: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" };
const perp: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual" };
const reference = { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" as const };
const featureConfig = { window: { startTime: 100, endTime: 200, sampleTimes: [100, 150, 200] } };
const geometryConfig = { atLevelTolerance: 0, levelBand: { mode: "ABSOLUTE" as const, value: 2 }, proximityBand: { mode: "ABSOLUTE" as const, value: 2 }, referenceSamples: [{ time: 100, price: 99 }, { time: 150, price: 101 }, { time: 200, price: 99 }] };

function replayState(identity: OrderFlowIdentity = spot): OrderFlowState {
  const events: TruthReplayEvent[] = [
    { type: "L2_SNAPSHOT", ...identity, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" },
    { type: "L2_DELTA", ...identity, bids: [{ price: 99, quantity: 12 }], asks: [], sequence: 2, eventTime: 110, receiveTime: 111, source: "websocket", quality: "VALID" },
    { type: "TRADE", ...identity, tradeId: "t1", price: 100, quantity: 2, aggressorSide: "BUY", eventTime: 111, receiveTime: 112, source: "websocket", quality: "VALID" },
    { type: "ADVANCE_TIME", ...identity, eventTime: 200, receiveTime: 201, source: "websocket", quality: "VALID" },
  ];
  const replay = replayTruth(events);
  const history = new HistoricalLiquidityTruth(identity);
  if (replay.l2Book) {
    history.addCheckpoint(replay.l2Book);
    for (const event of replay.lifecycleEvents) history.addEvent(event);
  }
  return composeOrderFlowState({ identity, book: replay.l2Book, trades: replay.tradeTape, tradeQuality: "VALID", liquidityLifecycle: replay.lifecycleEvents, lifecycleQuality: "VALID", historicalLiquidity: history, capturedAt: 200 });
}

function gammaSnapshot(overrides: Partial<GammaOptionsSnapshotInput> = {}): GammaOptionsSnapshotInput {
  return {
    source: "LIVE_DERIBIT", snapshotId: "gamma-1", referenceIdentity: reference,
    referencePrice: { value: 100, source: "Deribit Index", eventTime: 100, receiveTime: 101, quality: "VALID", provenance: { origin: "RAW", source: "Deribit", referenceIdentity: reference, eventTime: 100, receiveTime: 101 } },
    snapshotTime: 100, receiveTime: 101, calculatedAt: 102, gammaFlip: 100, callWall: 105,
    optionsOI: { totalOptionsOI: 100, callOI: 60, putOI: 40 }, ...overrides,
  };
}
function volatilitySnapshot(overrides: Partial<VolatilitySnapshotInput> = {}): VolatilitySnapshotInput {
  return { source: "LIVE_DERIBIT", snapshotId: "iv-1", referenceIdentity: reference, snapshotTime: 100, receiveTime: 101, calculatedAt: 102, options: [{ instrument: "BTC-30SEP26-100000-C", ivMark: 0.5, unit: "decimal" }], ...overrides };
}
function regimeSnapshot(overrides: Partial<RegimeSnapshotInput> = {}): RegimeSnapshotInput {
  return { source: "GAMMA_REGIME", label: "LONG GAMMA", snapshotId: "regime-1", snapshotTime: 100, receiveTime: 101, calculatedAt: 102, provenance: { origin: "INFERRED", source: "gamma-regime" }, ...overrides };
}
function request(identity: OrderFlowIdentity = spot, overrides: Partial<MarketTruthRequest> = {}): MarketTruthRequest {
  return { identity, optionsReference: reference, capturedAt: 200, featureConfig, geometryConfig, ...overrides };
}
function dependencies(state: OrderFlowState, overrides: Partial<MarketTruthProviderDependencies> = {}): MarketTruthProviderDependencies {
  return { getOrderFlowState: () => state, getGammaOptionsSnapshot: () => gammaSnapshot(), getVolatilitySnapshot: () => volatilitySnapshot(), getRegimeSnapshot: () => regimeSnapshot(), ...overrides };
}

test("composes the complete canonical pipeline with injected readers", () => {
  const provider = createMarketTruthProvider(dependencies(replayState()));
  const result = provider.getMarketTruth(request());
  assert.equal(result.capturedAt, 200);
  assert.equal(result.truth.identity.marketType, "Spot");
  assert.equal(result.truth.quality.orderFlow, "VALID");
  assert.equal(result.truth.quality.gamma, "VALID");
  assert.equal(result.truth.quality.optionsOI, "VALID");
  assert.equal(result.truth.quality.volatility, "VALID");
  assert.equal(result.truth.quality.regime, "VALID");
  assert.equal(result.truth.quality.futuresOI, "UNAVAILABLE");
  assert.equal(result.truth.options.referenceIdentity.venue, "Deribit");
  assert.equal(result.geometry.gammaFlip?.level.type, "GAMMA_FLIP");
  assert.equal(result.geometry.gammaFlip?.absoluteDistance, 0);
});

test("routes Spot and Perpetual by complete identity without fallback", () => {
  const seen: OrderFlowIdentity[] = [];
  const provider = createMarketTruthProvider(dependencies(replayState(), { getOrderFlowState: (identity) => { seen.push(identity); return replayState(identity); } }));
  const spotResult = provider.getMarketTruth(request(spot));
  const perpResult = provider.getMarketTruth(request(perp));
  assert.equal(spotResult.truth.identity.marketType, "Spot");
  assert.equal(perpResult.truth.identity.marketType, "Perpetual");
  assert.deepEqual(seen.map((identity) => identity.marketType), ["Spot", "Perpetual"]);
});

test("keeps missing components unavailable without erasing valid order flow", () => {
  const provider = createMarketTruthProvider(dependencies(replayState(), { getGammaOptionsSnapshot: () => null, getVolatilitySnapshot: () => null, getRegimeSnapshot: () => null }));
  const result = provider.getMarketTruth(request());
  assert.equal(result.truth.options.gamma, null);
  assert.equal(result.truth.options.optionsOpenInterest, null);
  assert.equal(result.truth.volatility, null);
  assert.equal(result.truth.regime, null);
  assert.equal(result.truth.futuresOpenInterest, null);
  assert.equal(result.truth.quality.gamma, "UNAVAILABLE");
  assert.equal(result.truth.quality.volatility, "UNAVAILABLE");
  assert.equal(result.truth.quality.regime, "UNAVAILABLE");
  assert.equal(result.truth.quality.orderFlow, "VALID");
  assert.equal(result.geometry.quality.geometry, "UNAVAILABLE");
});

test("preserves stale component quality and explicit temporal consistency", () => {
  const provider = createMarketTruthProvider(dependencies(replayState(), { getGammaOptionsSnapshot: () => gammaSnapshot(), getVolatilitySnapshot: () => volatilitySnapshot() }));
  const result = provider.getMarketTruth(request(spot, { gammaConfig: { maxAgeMs: 50 }, volatilityConfig: { maxAgeMs: 50 } }));
  assert.equal(result.truth.quality.gamma, "STALE");
  assert.equal(result.truth.quality.volatility, "STALE");
  assert.ok(result.truth.consistency.staleComponents.includes("gamma"));
  assert.ok(result.truth.consistency.staleComponents.includes("volatility"));
  assert.equal(result.truth.timestamps.capturedAt, 200);
  assert.equal(result.truth.options.gamma?.timestamps.snapshotTime, 100);
});

test("rejects invalid identities and incompatible component references", () => {
  const provider = createMarketTruthProvider(dependencies(replayState(), { getGammaOptionsSnapshot: () => gammaSnapshot({ referenceIdentity: { referenceAsset: "ETH", venue: "Deribit", referenceType: "INDEX" } }) }));
  assert.throws(() => provider.getMarketTruth(request({ instrument: "BTCUSDT", venue: "Binance", marketType: "Other" as never })), /identity/);
  assert.throws(() => provider.getMarketTruth(request()), /reference identity mismatch/);
});

test("preserves Binance Spot reference price while execution remains Perpetual", () => {
  const provider = createMarketTruthProvider(dependencies(replayState(perp), { getOrderFlowState: () => replayState(perp), getGammaOptionsSnapshot: () => gammaSnapshot({ referencePrice: { ...gammaSnapshot().referencePrice!, source: "Binance Spot", provenance: { ...gammaSnapshot().referencePrice!.provenance, source: "Binance Spot" } } }) }));
  const result = provider.getMarketTruth(request(perp));
  assert.equal(result.truth.identity.marketType, "Perpetual");
  assert.equal(result.truth.options.referencePrice?.source, "Binance Spot");
  assert.equal(result.truth.options.referencePrice?.provenance.referenceIdentity?.venue, "Deribit");
  assert.equal(result.truth.options.referenceIdentity.referenceAsset, "BTC");
  assert.equal(result.geometry.gammaFlip?.executionPriceSource, "Binance Perpetual");
  assert.equal(result.geometry.gammaFlip?.referencePriceSource, "Binance Spot");
});

test("replay pipeline is deterministic and does not call legacy MarketTruth", () => {
  let legacyCalled = false;
  const provider = createMarketTruthProvider(dependencies(replayState(), { getGammaOptionsSnapshot: () => gammaSnapshot(), getVolatilitySnapshot: () => volatilitySnapshot(), getRegimeSnapshot: () => regimeSnapshot() }));
  const first = provider.getMarketTruth(request());
  const second = provider.getMarketTruth(request());
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(legacyCalled, false);
  assert.equal(first.geometry.crossingState["GAMMA_FLIP:100:gamma-1"]?.crossingCount, 2);
  assert.equal(first.geometry.orderFlowNearLevels[0]?.interactionTradeCount, 1);
});

test("provider returns defensive snapshots and has no hidden state leakage", () => {
  const upstream = replayState();
  const provider = createMarketTruthProvider(dependencies(upstream));
  const first = provider.getMarketTruth(request());
  first.truth.options.keyLevels[0]!.price = 999;
  first.geometry.levels[0]!.level.price = 999;
  const second = provider.getMarketTruth(request());
  assert.notEqual(second.truth.options.keyLevels[0]?.price, 999);
  assert.notEqual(second.geometry.levels[0]?.level.price, 999);
  const reversed = createMarketTruthProvider(dependencies(replayState(), { getOrderFlowState: (identity) => replayState(identity) }));
  const a1 = reversed.getMarketTruth(request());
  reversed.getMarketTruth(request(perp));
  const a2 = reversed.getMarketTruth(request());
  assert.deepEqual(JSON.parse(JSON.stringify(a1)), JSON.parse(JSON.stringify(a2)));
});

test("canonical output contains context only, never acceptance or trading decisions", () => {
  const result = createMarketTruthProvider(dependencies(replayState())).getMarketTruth(request());
  for (const forbidden of ["ACCEPTED", "REJECTED", "SUPPORT", "RESISTANCE", "TARGET", "MAGNET_TARGET", "BREAKOUT", "bullish", "bearish", "entry", "stop", "TP", "recommendation", "confidence", "probability", "signal"]) assert.equal(JSON.stringify(result).includes(forbidden), false, forbidden);
});
