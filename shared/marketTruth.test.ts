import assert from "node:assert/strict";
import test from "node:test";
import { composeMarketTruth, type GammaContext, type MarketReferencePrice, type MarketTruthInput, type OptionsOIContext, type RegimeContext, type VolatilityContext } from "./marketTruth";
import type { OrderFlowFeatures } from "./orderFlowFeatures";
import type { OrderFlowState } from "./orderFlowState";

const executionSpot = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" as const };
const executionPerp = { instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual" as const };
const optionsReference = { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" as const };

function orderFlowState(identity = executionSpot, quality: OrderFlowState["quality"]["overall"] = "VALID") {
  return {
    identity,
    book: null,
    bbo: null,
    trades: [],
    liquidityLifecycle: [],
    historicalLiquidity: { latestFrame: null, bookAt: () => null },
    quality: { book: "UNAVAILABLE", trades: "UNAVAILABLE", lifecycle: "UNAVAILABLE", history: "UNAVAILABLE", overall: quality },
    timestamps: { book: { eventTime: null, receiveTime: null }, trades: { oldestEventTime: null, newestEventTime: null, latestReceiveTime: null }, lifecycle: { oldestEventTime: null, newestEventTime: null, latestReceiveTime: null }, history: { latestEventTime: null, latestReceiveTime: null } },
    provenance: { book: null, trades: { source: null, latest: null }, lifecycle: { source: null, latest: null }, history: null },
    consistency: { status: "PARTIAL", bookSequence: null, bookSnapshotId: null, latestTradeId: null, latestLifecycleSequence: null, historySequence: null, capturedAt: 1000 },
    capturedAt: 1000,
  } as unknown as OrderFlowState;
}

const features = {} as OrderFlowFeatures;
const gamma: GammaContext = { totalGex: { value: 0, unit: "USD", quality: "VALID", timestamps: { calculatedAt: 900 }, provenance: { origin: "DERIVED", source: "test-gamma" } }, quality: "VALID", timestamps: { calculatedAt: 900 }, provenance: { origin: "DERIVED", source: "test-gamma" } };
const optionsOI: OptionsOIContext = { measurements: [{ kind: "AGGREGATED", value: 0, unit: "contracts", quality: "VALID", timestamps: { eventTime: 800 }, provenance: { origin: "RAW", source: "test-options" } }], quality: "VALID", timestamps: { snapshotTime: 800 }, provenance: { origin: "RAW", source: "test-options" } };
const volatility: VolatilityContext = { measurements: [{ kind: "IMPLIED", value: 0, unit: "decimal", reference: "BTC options", quality: "VALID", timestamps: { eventTime: 800 }, provenance: { origin: "RAW", source: "test-iv" } }], quality: "VALID", timestamps: { snapshotTime: 800 }, provenance: { origin: "RAW", source: "test-iv" } };
const regime: RegimeContext = { label: "range", inputs: { source: "test" }, quality: "VALID", timestamps: { calculatedAt: 850 }, provenance: { origin: "INFERRED", source: "test-regime" } };
const referencePrice: MarketReferencePrice = { value: 100, source: "Deribit index", eventTime: 700, receiveTime: 710, quality: "VALID", provenance: { origin: "RAW", source: "deribit", referenceIdentity: optionsReference } };

function input(overrides: Partial<MarketTruthInput> = {}): MarketTruthInput {
  return { identity: executionSpot, orderFlow: { state: orderFlowState(), features }, options: { referenceIdentity: optionsReference, referencePrice, gamma, optionsOpenInterest: optionsOI, keyLevels: [] }, volatility, regime, capturedAt: 1000, ...overrides };
}

test("rejects incomplete execution identity and preserves Spot/Perpetual distinction", () => {
  assert.throws(() => composeMarketTruth(input({ identity: { ...executionSpot, marketType: undefined as never } })), /identity/);
  const spot = composeMarketTruth(input());
  const perp = composeMarketTruth(input({ identity: executionPerp, orderFlow: { state: orderFlowState(executionPerp), features } }));
  assert.equal(spot.identity.marketType, "Spot");
  assert.equal(perp.identity.marketType, "Perpetual");
  assert.notDeepEqual(spot.identity, perp.identity);
});

test("keeps execution and options reference identities separate", () => {
  const truth = composeMarketTruth(input());
  assert.deepEqual(truth.identity, executionSpot);
  assert.deepEqual(truth.options.referenceIdentity, optionsReference);
  assert.notDeepEqual(truth.identity, truth.options.referenceIdentity);
  assert.equal(truth.options.referencePrice?.provenance.referenceIdentity?.venue, "Deribit");
});

test("preserves reference price source and exposes reference mismatch", () => {
  const mismatched: MarketReferencePrice = { ...referencePrice, provenance: { ...referencePrice.provenance, referenceIdentity: { ...optionsReference, venue: "Other" } } };
  const truth = composeMarketTruth(input({ options: { ...input().options!, referencePrice: mismatched } }));
  assert.equal(truth.options.referencePrice?.source, "Deribit index");
  assert.equal(truth.consistency.referenceMismatch, true);
  assert.equal(truth.consistency.status, "INCONSISTENT");
});

test("derives overall quality without overwriting component quality", () => {
  const stale = composeMarketTruth(input({ options: { ...input().options!, gamma: { ...gamma, quality: "STALE" } } }));
  assert.equal(stale.quality.gamma, "STALE");
  assert.notEqual(stale.quality.overall, "VALID");
  const gap = composeMarketTruth(input({ orderFlow: { state: orderFlowState(executionSpot, "GAP"), features } }));
  assert.equal(gap.quality.orderFlow, "GAP");
  assert.equal(gap.quality.gamma, "VALID");
  assert.notEqual(gap.quality.overall, "VALID");
  const noVol = composeMarketTruth(input({ volatility: null }));
  assert.equal(noVol.quality.volatility, "UNAVAILABLE");
  assert.equal(noVol.quality.orderFlow, "VALID");
});

test("keeps unavailable values distinct from real numeric zero", () => {
  const present = composeMarketTruth(input());
  assert.equal(present.options.gamma?.totalGex?.value, 0);
  assert.equal(present.options.gamma?.quality, "VALID");
  const missing = composeMarketTruth(input({ options: { ...input().options!, gamma: null, optionsOpenInterest: null } }));
  assert.equal(missing.options.gamma, null);
  assert.equal(missing.quality.gamma, "UNAVAILABLE");
  assert.equal(missing.options.optionsOpenInterest, null);
  assert.equal(missing.quality.optionsOI, "UNAVAILABLE");
});

test("preserves component timestamps and computes deterministic ages from capturedAt", () => {
  const truth = composeMarketTruth(input());
  assert.equal(truth.timestamps.capturedAt, 1000);
  assert.equal(truth.consistency.componentAges.gamma, 100);
  assert.equal(truth.consistency.componentAges.optionsOI, 200);
  assert.equal(truth.options.timestamps.optionsOI.snapshotTime, 800);
  assert.equal(truth.options.referencePrice?.eventTime, 700);
  assert.equal(truth.options.referencePrice?.receiveTime, 710);
});

test("marks missing, stale and spread components without claiming atomicity", () => {
  const partial = composeMarketTruth(input({ regime: { ...regime, quality: "PARTIAL" }, futuresOpenInterest: null }));
  assert.equal(partial.quality.regime, "PARTIAL");
  assert.equal(partial.quality.futuresOI, "UNAVAILABLE");
  assert.equal(partial.consistency.status, "PARTIAL");
  assert.ok(partial.consistency.timestampSpread >= 0);
  assert.ok(partial.consistency.missingComponents.includes("futuresOI"));
  assert.ok(partial.consistency.staleComponents.length >= 0);
});

test("returns defensive component snapshots and does not mutate inputs", () => {
  const source = input();
  const truth = composeMarketTruth(source);
  (truth.identity as { instrument: string }).instrument = "MUTATED";
  (truth.options.keyLevels as unknown as Array<{ price: number }>).push({ price: 1 });
  (truth.options.gamma!.totalGex!.value as number) = 99;
  assert.equal(source.identity.instrument, "BTCUSDT");
  assert.equal(source.options!.keyLevels.length, 0);
  assert.equal(source.options!.gamma!.totalGex!.value, 0);
});

test("composes the same explicit inputs deterministically", () => {
  const first = composeMarketTruth(input());
  const second = composeMarketTruth(input());
  const withoutBookAt = (value: ReturnType<typeof composeMarketTruth>) => ({ ...value, orderFlow: { ...value.orderFlow, state: { ...value.orderFlow.state, historicalLiquidity: { latestFrame: value.orderFlow.state.historicalLiquidity.latestFrame } } } });
  assert.deepEqual(withoutBookAt(first), withoutBookAt(second));
  assert.deepEqual(first.orderFlow.state.historicalLiquidity.bookAt(1000), second.orderFlow.state.historicalLiquidity.bookAt(1000));
});

test("does not expose operational direction, signal or probability fields", () => {
  const json = JSON.stringify(composeMarketTruth(input()));
  for (const forbidden of ["LONG", "SHORT", "bullish", "bearish", "entry", "stop", "take profit", "target", "signal", "confidence", "probability"]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
});
