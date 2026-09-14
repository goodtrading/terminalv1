import assert from "node:assert/strict";
import test from "node:test";
import { composeMarketTruth } from "./marketTruth";
import type { OrderFlowFeatures } from "./orderFlowFeatures";
import type { OrderFlowState } from "./orderFlowState";
import { adaptRegimeContext, type RegimeSnapshotInput } from "./regimeContextAdapter";

const executionIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" as const };

function snapshot(overrides: Partial<RegimeSnapshotInput> = {}): RegimeSnapshotInput {
  return {
    source: "GAMMA_REGIME",
    label: "LONG GAMMA",
    inputs: { gammaReference: "totalGex", classifierInput: { value: 10 } },
    classifier: "gamma-regime",
    classifierVersion: "v1",
    snapshotId: "regime-1",
    eventTime: 1000,
    receiveTime: 1010,
    snapshotTime: 1000,
    calculatedAt: 1020,
    provenance: { origin: "INFERRED", source: "gamma-regime-upstream", identifiers: { upstreamId: "u1" } },
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

test("maps gamma regime labels and preserves sourceLabel", () => {
  const cases = [["LONG GAMMA", "POSITIVE_GAMMA"], ["SHORT GAMMA", "NEGATIVE_GAMMA"], ["NEUTRAL", "NEUTRAL_GAMMA"]] as const;
  for (const [sourceLabel, label] of cases) {
    const result = adaptRegimeContext(snapshot({ label: sourceLabel }), { capturedAt: 1100 });
    assert.equal(result?.label, label);
    assert.equal(result?.inputs.sourceLabel, sourceLabel);
    assert.equal(result?.provenance.origin, "INFERRED");
  }
});

test("maps explicit AI-6 context labels without importing classifier semantics", () => {
  const cases = [["positive_gamma", "POSITIVE_GAMMA"], ["negative_gamma", "NEGATIVE_GAMMA"], ["transition", "TRANSITION"], ["range", "RANGE"], ["trend_attempt", "TREND_ATTEMPT"], ["unclear", "UNCLEAR"]] as const;
  for (const [sourceLabel, label] of cases) {
    const result = adaptRegimeContext(snapshot({ source: "AI6_REGIME", label: sourceLabel }), { capturedAt: 1100 });
    assert.equal(result?.label, label);
    assert.equal(result?.inputs.sourceLabel, sourceLabel);
  }
});

test("does not reverse-map directional gammaLiveAdapter labels", () => {
  for (const label of ["bullish", "bearish", "neutral", "mixed"]) {
    assert.equal(adaptRegimeContext(snapshot({ source: "GAMMA_LIVE_ADAPTER", label }), { capturedAt: 1100 }), null);
  }
});

test("distinguishes missing, unknown, and real neutral gamma", () => {
  assert.equal(adaptRegimeContext(null, { capturedAt: 1100 }), null);
  assert.equal(adaptRegimeContext(snapshot({ label: undefined }), { capturedAt: 1100 }), null);
  assert.equal(adaptRegimeContext(snapshot({ label: "mystery" }), { capturedAt: 1100 }), null);
  const neutral = adaptRegimeContext(snapshot({ label: "NEUTRAL" }), { capturedAt: 1100 });
  assert.equal(neutral?.label, "NEUTRAL_GAMMA");
  assert.equal(neutral?.quality, "VALID");
});

test("preserves inputs, provenance and all timestamps without copying operational fields", () => {
  const result = adaptRegimeContext(snapshot({ inputs: { gammaStrength: "moderate", confidence: 0.9, narrative: "ignore" }, provenance: { origin: "INFERRED", source: "upstream", identifiers: { confidence: 0.8 } } }), { capturedAt: 1100 });
  assert.equal(result?.inputs.gammaStrength, "moderate");
  assert.equal("confidence" in result!.inputs, false);
  assert.equal("narrative" in result!.inputs, false);
  assert.equal(result?.timestamps.eventTime, 1000);
  assert.equal(result?.timestamps.receiveTime, 1010);
  assert.equal(result?.timestamps.snapshotTime, 1000);
  assert.equal(result?.timestamps.calculatedAt, 1020);
  assert.equal(result?.provenance.source, "GAMMA_REGIME");
  assert.equal(result?.provenance.identifiers?.snapshotId, "regime-1");
  assert.equal(result?.provenance.identifiers?.sourceLabel, "LONG GAMMA");
});

test("uses only explicit freshness and preserves partial metadata quality", () => {
  const stale = adaptRegimeContext(snapshot(), { capturedAt: 7000, maxAgeMs: 5000 });
  assert.equal(stale?.quality, "STALE");
  const noPolicy = adaptRegimeContext(snapshot(), { capturedAt: 7000 });
  assert.notEqual(noPolicy?.quality, "STALE");
  const partial = adaptRegimeContext(snapshot({ provenance: null, calculatedAt: null }), { capturedAt: 1100 });
  assert.equal(partial?.quality, "PARTIAL");
  const explicitPartial = adaptRegimeContext(snapshot({ quality: "PARTIAL" }), { capturedAt: 1100 });
  assert.equal(explicitPartial?.quality, "PARTIAL");
});

test("composeMarketTruth preserves regime quality and does not erase valid components", () => {
  const regime = adaptRegimeContext(snapshot(), { capturedAt: 1100 });
  const gamma = { quality: "VALID" as const, timestamps: { calculatedAt: 900 }, provenance: { origin: "DERIVED" as const, source: "gamma" } };
  const truth = composeMarketTruth({
    identity: executionIdentity,
    orderFlow: { state: orderFlowState(), features: {} as OrderFlowFeatures },
    options: { referenceIdentity: { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" }, referencePrice: null, gamma, optionsOpenInterest: null, keyLevels: [] },
    futuresOpenInterest: null,
    volatility: null,
    regime,
    capturedAt: 1100,
  });
  assert.equal(truth.regime?.label, "POSITIVE_GAMMA");
  assert.equal(truth.quality.regime, "VALID");
  assert.equal(truth.quality.orderFlow, "VALID");
  assert.equal(truth.quality.gamma, "VALID");
  const unavailable = composeMarketTruth({
    identity: executionIdentity,
    orderFlow: { state: orderFlowState(), features: {} as OrderFlowFeatures },
    options: { referenceIdentity: { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" }, referencePrice: null, gamma, optionsOpenInterest: null, keyLevels: [] },
    futuresOpenInterest: null,
    volatility: null,
    regime: null,
    capturedAt: 1100,
  });
  assert.equal(unavailable.regime, null);
  assert.equal(unavailable.quality.regime, "UNAVAILABLE");
  assert.equal(unavailable.quality.orderFlow, "VALID");
  assert.equal(unavailable.quality.gamma, "VALID");
});

test("is defensive, deterministic, and has no operational regime semantics", () => {
  const source = snapshot();
  const first = adaptRegimeContext(source, { capturedAt: 1100 });
  const second = adaptRegimeContext(source, { capturedAt: 1100 });
  assert.deepEqual(first, second);
  first!.inputs.gammaReference = "mutated";
  assert.equal(source.inputs?.gammaReference, "totalGex");
  const json = JSON.stringify(first);
  for (const forbidden of ["bullish", "bearish", "confidence", "probability", "recommendation", "expected move", "LONG signal", "SHORT signal", "entry", "stop", "target"]) assert.equal(json.includes(forbidden), false, forbidden);
  assert.equal(json.includes("LONG GAMMA"), true);
});
