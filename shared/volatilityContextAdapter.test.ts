import assert from "node:assert/strict";
import test from "node:test";
import { adaptGammaOptionsSnapshot, type GammaOptionsSnapshotInput } from "./gammaOptionsAdapter";
import { adaptVolatilityContext, type VolatilitySnapshotInput } from "./volatilityContextAdapter";
import { composeMarketTruth, type MarketTruthInput } from "./marketTruth";
import type { OrderFlowFeatures } from "./orderFlowFeatures";
import type { OrderFlowState } from "./orderFlowState";

const referenceIdentity = { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" as const };
const executionIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" as const };

function volatilitySnapshot(overrides: Partial<VolatilitySnapshotInput> = {}): VolatilitySnapshotInput {
  return {
    source: "LIVE_DERIBIT",
    snapshotId: "iv-1",
    referenceIdentity,
    eventTime: 1000,
    receiveTime: 1010,
    snapshotTime: 1000,
    calculatedAt: 1020,
    options: [
      { instrument: "BTC-30SEP26-100000-C", ivBid: 0.5, ivAsk: 0.6, ivMark: 0.55, unit: "decimal", provenance: { origin: "RAW", source: "deribit-option-feed" } },
    ],
    ...overrides,
  };
}

function gammaSnapshot(overrides: Partial<GammaOptionsSnapshotInput> = {}): GammaOptionsSnapshotInput {
  return {
    source: "LIVE_DERIBIT",
    snapshotId: "gamma-1",
    referenceIdentity,
    snapshotTime: 1000,
    receiveTime: 1010,
    calculatedAt: 1020,
    totalGex: 10,
    optionsOI: { totalOptionsOI: 100, callOI: 60, putOI: 40 },
    ...overrides,
  };
}

function orderFlowState(): OrderFlowState {
  return {
    identity: executionIdentity,
    book: null,
    bbo: null,
    trades: [],
    liquidityLifecycle: [],
    historicalLiquidity: { latestFrame: null, bookAt: () => null },
    quality: { book: "UNAVAILABLE", trades: "UNAVAILABLE", lifecycle: "UNAVAILABLE", history: "UNAVAILABLE", overall: "VALID" },
    timestamps: { book: { eventTime: null, receiveTime: null }, trades: { oldestEventTime: null, newestEventTime: null, latestReceiveTime: null }, lifecycle: { oldestEventTime: null, newestEventTime: null, latestReceiveTime: null }, history: { latestEventTime: null, latestReceiveTime: null } },
    provenance: { book: null, trades: { source: null, latest: null }, lifecycle: { source: null, latest: null }, history: null },
    consistency: { status: "PARTIAL", bookSequence: null, bookSnapshotId: null, latestTradeId: null, latestLifecycleSequence: null, historySequence: null, capturedAt: 1000 },
    capturedAt: 1000,
  } as unknown as OrderFlowState;
}

function composed(volatility: ReturnType<typeof adaptVolatilityContext>): ReturnType<typeof composeMarketTruth> {
  const gamma = adaptGammaOptionsSnapshot(gammaSnapshot(), { capturedAt: 1100 });
  return composeMarketTruth({
    identity: executionIdentity,
    orderFlow: { state: orderFlowState(), features: {} as OrderFlowFeatures },
    options: { referenceIdentity, referencePrice: null, gamma: gamma.gamma, optionsOpenInterest: gamma.optionsOpenInterest, keyLevels: gamma.levels },
    futuresOpenInterest: null,
    volatility,
    regime: null,
    capturedAt: 1100,
  } as MarketTruthInput);
}

test("reuses N5H.2 OptionsOIContext and keeps it separate from futures OI", () => {
  const gamma = adaptGammaOptionsSnapshot(gammaSnapshot({ optionsOI: { totalOptionsOI: 0, callOI: 0, putOI: 0 } }), { capturedAt: 1100 });
  assert.equal(gamma.optionsOpenInterest?.measurements[0]?.value, 0);
  assert.equal(gamma.futuresOpenInterest, null);
  assert.equal(gamma.quality.optionsOI, "VALID");
  const missing = adaptGammaOptionsSnapshot(gammaSnapshot({ optionsOI: null }), { capturedAt: 1100 });
  assert.equal(missing.optionsOpenInterest, null);
  assert.equal(missing.quality.optionsOI, "UNAVAILABLE");
});

test("futures OI remains explicitly unavailable without fallback or zero", () => {
  const truth = composed(adaptVolatilityContext(volatilitySnapshot(), { capturedAt: 1100 }));
  assert.equal(truth.futuresOpenInterest, null);
  assert.equal(truth.quality.futuresOI, "UNAVAILABLE");
  assert.equal(truth.quality.optionsOI, "VALID");
  assert.notEqual(truth.quality.overall, "VALID");
  assert.equal(JSON.stringify(truth).includes("totalOpenInterest"), false);
});

test("adapts raw ivMark, ivBid and ivAsk without changing decimal scale or unit", () => {
  const context = adaptVolatilityContext(volatilitySnapshot(), { capturedAt: 1100 });
  assert.deepEqual(context?.measurements.map((measurement) => [measurement.reference, measurement.value, measurement.unit, measurement.origin]), [
    ["BTC-30SEP26-100000-C", 0.5, "decimal", "RAW"],
    ["BTC-30SEP26-100000-C", 0.6, "decimal", "RAW"],
    ["BTC-30SEP26-100000-C", 0.55, "decimal", "RAW"],
  ]);
  assert.deepEqual(context?.measurements.map((measurement) => measurement.provenance.identifiers?.measurement), ["ivBid", "ivAsk", "ivMark"]);
});

test("preserves source and OptionsReferenceIdentity, never execution identity", () => {
  for (const source of ["LIVE_DERIBIT", "BOOTSTRAP", "LEGACY_ANALYTICS"] as const) {
    const context = adaptVolatilityContext(volatilitySnapshot({ source }), { capturedAt: 1100 });
    assert.equal(context?.provenance.source, source);
    assert.deepEqual(context?.measurements[0]?.provenance.referenceIdentity, referenceIdentity);
    assert.equal(context?.measurements[0]?.reference, "BTC-30SEP26-100000-C");
    assert.equal(JSON.stringify(context).includes("BTCUSDT"), false);
  }
});

test("preserves explicit aggregate IV only and never invents mean, ATM, term structure, skew or index", () => {
  const context = adaptVolatilityContext(volatilitySnapshot({ options: [{ instrument: "A", ivBid: 0.4, ivAsk: 0.6, unit: "decimal" }, { instrument: "B", ivMark: 0.8, unit: "decimal" }], aggregates: [{ identifier: "upstream_iv_surface", value: 0.7, unit: "decimal", origin: "DERIVED" }] }), { capturedAt: 1100 });
  assert.equal(context?.measurements.length, 4);
  assert.equal(context?.measurements.at(-1)?.value, 0.7);
  assert.equal(context?.measurements.at(-1)?.origin, "DERIVED");
  for (const forbidden of ["mean", "median", "ATM", "termStructure", "skew", "volIndex"]) assert.equal(JSON.stringify(context).includes(forbidden), false, forbidden);
});

test("keeps IV zero distinct from missing and does not create realized volatility", () => {
  const zero = adaptVolatilityContext(volatilitySnapshot({ options: [{ instrument: "A", ivMark: 0, unit: "decimal" }] }), { capturedAt: 1100 });
  assert.equal(zero?.measurements[0]?.value, 0);
  assert.equal(zero?.quality, "VALID");
  const missing = adaptVolatilityContext(volatilitySnapshot({ options: [{ instrument: "A", ivMark: undefined, unit: "decimal" }] }), { capturedAt: 1100 });
  assert.equal(missing, null);
  assert.equal(JSON.stringify(zero).includes("REALIZED"), false);
  assert.equal(JSON.stringify(zero).includes("ATR"), false);
  assert.equal(JSON.stringify(zero).includes("range"), false);
});

test("marks partial coverage and keeps absent volatility unavailable", () => {
  const partial = adaptVolatilityContext(volatilitySnapshot({ options: [{ instrument: "A", ivMark: 0.5, unit: "decimal" }, { instrument: "B", unit: "decimal" }] }), { capturedAt: 1100 });
  assert.equal(partial?.quality, "PARTIAL");
  assert.equal(partial?.measurements[0]?.quality, "PARTIAL");
  assert.equal(adaptVolatilityContext(null, { capturedAt: 1100 }), null);
});

test("uses STALE only with explicit maxAgeMs and preserves timestamps", () => {
  const stale = adaptVolatilityContext(volatilitySnapshot(), { capturedAt: 7000, maxAgeMs: 5000 });
  assert.equal(stale?.quality, "STALE");
  const noPolicy = adaptVolatilityContext(volatilitySnapshot(), { capturedAt: 7000 });
  assert.notEqual(noPolicy?.quality, "STALE");
  assert.equal(noPolicy?.measurements[0]?.timestamps.eventTime, 1000);
  assert.equal(noPolicy?.measurements[0]?.timestamps.receiveTime, 1010);
  assert.equal(noPolicy?.measurements[0]?.timestamps.snapshotTime, 1000);
  assert.equal(noPolicy?.measurements[0]?.timestamps.calculatedAt, 1020);
});

test("preserves per-measurement provenance and does not borrow gamma provenance", () => {
  const context = adaptVolatilityContext(volatilitySnapshot(), { capturedAt: 1100 });
  assert.equal(context?.measurements[0]?.provenance.source, "LIVE_DERIBIT");
  assert.equal(context?.measurements[0]?.provenance.upstream && (context.measurements[0].provenance.upstream as { source: string }).source, "deribit-option-feed");
  assert.equal(context?.provenance.identifiers?.measurement, "volatility");
});

test("composeMarketTruth preserves valid order flow and options OI while volatility/futures remain distinct", () => {
  const truth = composed(adaptVolatilityContext(volatilitySnapshot(), { capturedAt: 1100 }));
  assert.equal(truth.quality.orderFlow, "VALID");
  assert.equal(truth.quality.optionsOI, "VALID");
  assert.equal(truth.quality.volatility, "VALID");
  assert.equal(truth.quality.futuresOI, "UNAVAILABLE");
  assert.equal(truth.options.optionsOpenInterest?.measurements.length, 3);
  const unavailable = composed(null);
  assert.equal(unavailable.quality.orderFlow, "VALID");
  assert.equal(unavailable.quality.volatility, "UNAVAILABLE");
});

test("is defensive, deterministic and exposes no operational volatility semantics", () => {
  const source = volatilitySnapshot();
  const first = adaptVolatilityContext(source, { capturedAt: 1100 });
  const second = adaptVolatilityContext(source, { capturedAt: 1100 });
  assert.deepEqual(first, second);
  first!.measurements[0]!.value = 99;
  assert.equal(source.options?.[0]?.ivBid, 0.5);
  const json = JSON.stringify(first);
  for (const forbidden of ["high volatility", "low volatility", "expansion", "compression", "bullish", "bearish", "LONG", "SHORT", "expected move", "signal", "regime"]) assert.equal(json.includes(forbidden), false, forbidden);
});
