import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptGammaOptionsSnapshot,
  type GammaOptionsSnapshotInput,
} from "./gammaOptionsAdapter";

const referenceIdentity = { referenceAsset: "BTC", venue: "Deribit", referenceType: "INDEX" as const };
const referencePrice = { value: 100, source: "Binance Spot", eventTime: 1000, receiveTime: 1010, quality: "VALID" as const, provenance: { origin: "RAW" as const, source: "Binance Spot" } };

function liveSnapshot(overrides: Partial<GammaOptionsSnapshotInput> = {}): GammaOptionsSnapshotInput {
  return {
    source: "LIVE_DERIBIT",
    snapshotId: "live-1",
    referenceIdentity,
    referencePrice,
    snapshotTime: 1000,
    receiveTime: 1010,
    calculatedAt: 1020,
    totalGex: 123,
    gammaFlip: 99,
    callWall: 105,
    putWall: 95,
    gammaMagnets: [98, 102],
    shortGammaZones: [{ start: 97, end: 98 }],
    transitionZones: [{ start: 99, end: 101 }],
    vanna: 12,
    charm: -4,
    dealerHedgeContext: { kind: "MODELLED", value: 7 },
    optionsOI: { totalOptionsOI: 1000, callOI: 600, putOI: 400, concentration: 0.6 },
    ...overrides,
  };
}

test("adapts live values without recalculation and preserves Deribit reference identity", () => {
  const result = adaptGammaOptionsSnapshot(liveSnapshot(), { capturedAt: 1100, maxAgeMs: 5000 });
  assert.deepEqual(result.referenceIdentity, referenceIdentity);
  assert.equal(result.gamma?.totalGex?.value, 123);
  assert.equal(result.gamma?.gammaFlip?.value, 99);
  assert.equal(result.gamma?.callWall?.value, 105);
  assert.equal(result.gamma?.putWall?.value, 95);
  assert.deepEqual(result.gamma?.gammaMagnets?.map((x) => x.value), [98, 102]);
  assert.equal(result.gamma?.vanna?.value, 12);
  assert.equal(result.gamma?.charm?.value, -4);
  assert.equal(result.gamma?.totalGex?.provenance.origin, "DERIVED");
  assert.equal(result.referencePrice?.source, "Binance Spot");
});

test("preserves bootstrap and legacy source semantics without merging provenance", () => {
  const bootstrap = adaptGammaOptionsSnapshot(liveSnapshot({ source: "BOOTSTRAP" }), { capturedAt: 1100 });
  const legacy = adaptGammaOptionsSnapshot(liveSnapshot({ source: "LEGACY_ANALYTICS" }), { capturedAt: 1100 });
  assert.equal(bootstrap.gamma?.provenance.source, "BOOTSTRAP");
  assert.equal(legacy.gamma?.provenance.source, "LEGACY_ANALYTICS");
  assert.notDeepEqual(bootstrap.gamma?.provenance, legacy.gamma?.provenance);
  assert.equal(bootstrap.optionsOpenInterest?.provenance.source, "BOOTSTRAP");
});

test("separates options OI from futures OI and preserves zero versus missing", () => {
  const zero = adaptGammaOptionsSnapshot(liveSnapshot({ optionsOI: { totalOptionsOI: 0, callOI: 0, putOI: 0, concentration: 0 } }), { capturedAt: 1100 });
  assert.equal(zero.optionsOpenInterest?.measurements.find((m) => m.provenance.identifiers?.metric === "totalOptionsOI")?.value, 0);
  assert.equal(zero.futuresOpenInterest, null);
  const missing = adaptGammaOptionsSnapshot(liveSnapshot({ optionsOI: null }), { capturedAt: 1100 });
  assert.equal(missing.optionsOpenInterest, null);
  assert.equal(missing.quality.optionsOI, "UNAVAILABLE");
});

test("preserves gamma zero, null fields and emits levels without operational semantics", () => {
  const result = adaptGammaOptionsSnapshot(liveSnapshot({ totalGex: 0, gammaFlip: null, callWall: null, putWall: null, gammaMagnets: null }), { capturedAt: 1100 });
  assert.equal(result.gamma?.totalGex?.value, 0);
  assert.equal(result.gamma?.gammaFlip?.value, null);
  assert.equal(result.quality.gamma, "VALID");
  assert.equal(result.levels.some((level) => level.type === "GAMMA_MAGNET"), false);
  assert.equal(JSON.stringify(result).includes("target"), false);
  assert.equal(JSON.stringify(result).includes("support"), false);
  assert.equal(JSON.stringify(result).includes("resistance"), false);
});

test("derives STALE only from explicit freshness policy", () => {
  const stale = adaptGammaOptionsSnapshot(liveSnapshot(), { capturedAt: 7000, maxAgeMs: 5000 });
  assert.equal(stale.quality.gamma, "STALE");
  const noPolicy = adaptGammaOptionsSnapshot(liveSnapshot(), { capturedAt: 7000 });
  assert.notEqual(noPolicy.quality.gamma, "STALE");
});

test("returns UNAVAILABLE for no snapshot and PARTIAL for incomplete snapshot", () => {
  const missing = adaptGammaOptionsSnapshot(null, { capturedAt: 1100, maxAgeMs: 5000 });
  assert.equal(missing.gamma, null);
  assert.equal(missing.optionsOpenInterest, null);
  assert.equal(missing.quality.gamma, "UNAVAILABLE");
  assert.equal(missing.quality.optionsOI, "UNAVAILABLE");
  const partial = adaptGammaOptionsSnapshot({ source: "LIVE_DERIBIT", referenceIdentity, snapshotTime: 1000, totalGex: 10 }, { capturedAt: 1100 });
  assert.equal(partial.quality.gamma, "PARTIAL");
});

test("preserves timestamps, snapshot identity and does not inject execution identity", () => {
  const source = liveSnapshot();
  const result = adaptGammaOptionsSnapshot(source, { capturedAt: 1100 });
  assert.equal(result.gamma?.timestamps.snapshotTime, 1000);
  assert.equal(result.gamma?.timestamps.receiveTime, 1010);
  assert.equal(result.gamma?.timestamps.calculatedAt, 1020);
  assert.equal(result.gamma?.provenance.identifiers?.snapshotId, "live-1");
  assert.equal("marketType" in result.referenceIdentity, false);
  assert.equal(JSON.stringify(result).includes("BTCUSDT"), false);
});

test("is deterministic, defensive and does not calculate formulas", () => {
  const source = liveSnapshot();
  const first = adaptGammaOptionsSnapshot(source, { capturedAt: 1100, maxAgeMs: 5000 });
  const second = adaptGammaOptionsSnapshot(source, { capturedAt: 1100, maxAgeMs: 5000 });
  assert.deepEqual(first, second);
  first.levels.push({ ...first.levels[0]! });
  first.optionsOpenInterest!.measurements[0]!.value = 999;
  assert.equal(source.optionsOI?.totalOptionsOI, 1000);
  assert.equal(source.gammaFormula, undefined);
});

test("dealer context is modelled and never RAW", () => {
  const result = adaptGammaOptionsSnapshot(liveSnapshot(), { capturedAt: 1100 });
  assert.notEqual(result.gamma?.provenance.origin, "RAW");
  assert.notEqual(result.gamma?.dealerHedgeContext?.provenance?.origin, "RAW");
});
