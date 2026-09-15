import assert from "node:assert/strict";
import test from "node:test";
import {
  sameCanonicalEconomicMarket,
  type CanonicalEconomicMarketIdentity,
  validateCanonicalEconomicMarketIdentity,
} from "../../../shared/canonicalMarketIdentity";
import {
  canonicalMarketRegistrySnapshot,
  resolveCanonicalMarket,
  type CanonicalMarketResolverInput,
} from "./canonicalMarketResolver";

const spot: CanonicalEconomicMarketIdentity = {
  baseAsset: "BTC",
  quoteAsset: "USDT",
  settlementAsset: "USDT",
  productType: "Spot",
  expiry: null,
};
const linear: CanonicalEconomicMarketIdentity = {
  baseAsset: "BTC",
  quoteAsset: "USDT",
  settlementAsset: "USDT",
  productType: "Perpetual",
  contractStyle: "Linear",
  expiry: null,
};
const inverse: CanonicalEconomicMarketIdentity = {
  ...linear,
  contractStyle: "Inverse",
};

const bingx: CanonicalMarketResolverInput = {
  sourceBackend: "BINGX",
  sourceVenue: "BINGX",
  nativeSymbol: "BTC-USDT",
  sourceMarketType: "Perpetual",
};
const nautilus: CanonicalMarketResolverInput = {
  sourceBackend: "NAUTILUS_PAPER",
  sourceVenue: "SIM",
  nativeSymbol: "BTCUSDT",
  sourceMarketType: "Perpetual",
  nativeInstrumentId: "SIM-BTC-001",
};

const nautilusPerp: CanonicalMarketResolverInput = {
  sourceBackend: "NAUTILUS_PAPER",
  sourceVenue: "SIM",
  nativeSymbol: "BTCUSDT-PERP",
  sourceMarketType: "Perpetual",
  nativeInstrumentId: "SIM-BTC-PERP-001",
};

function expectUnresolved(input: CanonicalMarketResolverInput): void {
  const result = resolveCanonicalMarket(input);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "MARKET_IDENTITY_UNRESOLVED");
  assert.equal(result.executionIdentityReady, false);
}

test("accepts valid Spot identity without contractStyle", () => {
  assert.doesNotThrow(() => validateCanonicalEconomicMarketIdentity(spot));
});

test("accepts valid Linear and Inverse perpetual identities", () => {
  assert.doesNotThrow(() => validateCanonicalEconomicMarketIdentity(linear));
  assert.doesNotThrow(() => validateCanonicalEconomicMarketIdentity(inverse));
});

test("rejects invalid canonical identity shapes", () => {
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...spot,
    baseAsset: "",
  }));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...spot,
    quoteAsset: " ",
  }));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...spot,
    settlementAsset: "",
  }));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...spot,
    expiry: "2026-12-31",
  } as never));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...linear,
    contractStyle: "Unknown",
  } as never));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...linear,
    contractStyle: undefined,
  } as never));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...spot,
    contractStyle: "Linear",
  } as never));
  assert.throws(() => validateCanonicalEconomicMarketIdentity({
    ...spot,
    productType: "Future",
  } as never));
});

test("compares canonical economic dimensions only", () => {
  assert.equal(sameCanonicalEconomicMarket(spot, { ...spot }), true);
  assert.equal(sameCanonicalEconomicMarket(linear, { ...linear }), true);
  assert.equal(sameCanonicalEconomicMarket(linear, inverse), false);
  assert.equal(sameCanonicalEconomicMarket(linear, { ...linear, baseAsset: "ETH" }), false);
  assert.equal(sameCanonicalEconomicMarket(linear, { ...linear, quoteAsset: "USD" }), false);
  assert.equal(sameCanonicalEconomicMarket(linear, { ...linear, settlementAsset: "USD" }), false);
  assert.equal(sameCanonicalEconomicMarket(spot, linear), false);
});

test("exact BingX V1 key resolves to canonical Linear perpetual", () => {
  const result = resolveCanonicalMarket(bingx);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.identity, linear);
  assert.deepEqual(result.executionIdentity, {
    instrument: "BTC-USDT",
    venue: "BINGX",
    marketType: "Perpetual",
  });
  assert.equal(result.provenance.metadataSource, "server-owned-v1-registry");
  assert.equal(result.provenance.mappingPolicy, "EXACT_V1_REGISTRY");
  assert.equal(result.executionIdentityReady, true);
});

test("exact Nautilus V1 key resolves to the same economic identity", () => {
  const result = resolveCanonicalMarket(nautilus);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.identity, linear);
  assert.deepEqual(result.executionIdentity, {
    instrument: "BTCUSDT",
    venue: "SIM",
    marketType: "Perpetual",
  });
  assert.equal(result.provenance.nativeInstrumentId, "SIM-BTC-001");
});

test("exact factual Nautilus BTCUSDT-PERP key preserves native execution identity", () => {
  const result = resolveCanonicalMarket(nautilusPerp);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.identity, linear);
  assert.deepEqual(result.executionIdentity, {
    instrument: "BTCUSDT-PERP",
    venue: "SIM",
    marketType: "Perpetual",
  });
  assert.equal(result.provenance.nativeSymbol, "BTCUSDT-PERP");
  assert.equal(result.provenance.metadataSource, "server-owned-v1-registry");
  assert.equal(result.provenance.mappingPolicy, "EXACT_V1_REGISTRY");
});

test("BingX and Nautilus share economics but retain different execution identities", () => {
  const bingxResult = resolveCanonicalMarket(bingx);
  const nautilusResult = resolveCanonicalMarket(nautilus);
  assert.equal(bingxResult.ok, true);
  assert.equal(nautilusResult.ok, true);
  if (!bingxResult.ok || !nautilusResult.ok) return;
  assert.equal(sameCanonicalEconomicMarket(bingxResult.identity, nautilusResult.identity), true);
  assert.notDeepEqual(bingxResult.executionIdentity, nautilusResult.executionIdentity);
  assert.notEqual(bingxResult.provenance.nativeSymbol, nautilusResult.provenance.nativeSymbol);
});

test("runtime modality may confirm or contradict registry configuration", () => {
  assert.equal(resolveCanonicalMarket({ ...bingx, runtimeContractStyle: "Linear" }).ok, true);
  const result = resolveCanonicalMarket({ ...bingx, runtimeContractStyle: "Inverse" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "MARKET_IDENTITY_UNRESOLVED");
});

test("unknown keys fail closed without symbol heuristics", () => {
  expectUnresolved({ ...bingx, nativeSymbol: "ETH-USDT" });
  expectUnresolved({ ...bingx, nativeSymbol: "BTC-USD" });
  expectUnresolved({ ...bingx, sourceMarketType: "Spot" });
  expectUnresolved({ ...nautilus, nativeSymbol: "ETHUSDT" });
  expectUnresolved({ ...bingx, sourceVenue: "SIM" });
  expectUnresolved({ ...bingx, sourceBackend: "UNKNOWN" } as never);
  expectUnresolved({ ...bingx, nativeSymbol: "BTC/USDT" });
  expectUnresolved({ ...bingx, nativeSymbol: "btC-uSdT" });
  expectUnresolved({ ...bingx, nativeSymbol: "BTCUSDT-PERPX" });
});

test("registry snapshot is defensive and canonical target is not caller-injectable", () => {
  const before = canonicalMarketRegistrySnapshot();
  assert.equal(before.length, 3);
  const first = before[0];
  assert.ok(first);
  if (!first) return;
  (first.identity as { baseAsset: string }).baseAsset = "ETH";
  const after = canonicalMarketRegistrySnapshot();
  assert.equal(after[0]?.identity.baseAsset, "BTC");

  const input = { ...bingx };
  const result = resolveCanonicalMarket(input);
  assert.equal(result.ok, true);
  assert.deepEqual(input, bingx);
  if (!result.ok) return;
  (result.identity as { baseAsset: string }).baseAsset = "ETH";
  const again = resolveCanonicalMarket(bingx);
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.identity.baseAsset, "BTC");
});

test("resolution is deterministic", () => {
  const first = resolveCanonicalMarket(nautilus);
  const second = resolveCanonicalMarket(nautilus);
  assert.deepEqual(first, second);
});
