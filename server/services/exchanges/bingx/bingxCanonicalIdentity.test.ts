import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBingXAccountIdentity,
  buildBingXMarketIdentity,
  type BingXCanonicalAccountIdentityInput,
  type BingXCanonicalMarketIdentityInput,
} from "./bingxCanonicalIdentity";
import { adaptNautilusPaperPortfolio, type NautilusPortfolioSnapshotInput } from "../../nautilusPaperPortfolioAdapter";
import { sameCanonicalEconomicMarket } from "../../../../shared/canonicalMarketIdentity";

const liveAccount = (overrides: Partial<BingXCanonicalAccountIdentityInput> = {}) =>
  buildBingXAccountIdentity({
    goodTradingAccountId: "GT-123",
    sourceEnvironment: "LIVE",
    brokerAccountId: " uid-123 ",
    baseCurrency: "USDT",
    source: "fixture",
    ...overrides,
  });

const perpetualMarket = (overrides: Partial<BingXCanonicalMarketIdentityInput> = {}) =>
  buildBingXMarketIdentity({
    brokerSymbol: "BTC-USDT",
    sourceMarketType: "Perpetual",
    canonicalInstrument: "BTCUSDT",
    source: "fixture",
    ...overrides,
  });

test("requires explicit GoodTrading UID and never substitutes broker linkage", () => {
  assert.equal(liveAccount({ goodTradingAccountId: "" }).ok, false);
  const result = liveAccount({ goodTradingAccountId: "GT-123", brokerAccountId: "bingx-native-9" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.accountId, "GT-123");
  assert.equal(result.provenance.goodTradingAccountId, "GT-123");
  assert.equal(result.provenance.brokerNativeAccountId, "bingx-native-9");
  assert.notEqual(result.identity.accountId, result.provenance.brokerNativeAccountId);
});

test("preserves the same GoodTrading UID across conceptual PAPER and BingX scopes", () => {
  const bingx = liveAccount({ goodTradingAccountId: "GT-123", brokerAccountId: "bingx-native-9" });
  const paperAccount = { accountId: "GT-123", broker: "NAUTILUS_PAPER", environment: "PAPER", baseCurrency: "USDT" } as const;
  assert.equal(bingx.ok, true);
  if (bingx.ok) assert.equal(bingx.identity.accountId, paperAccount.accountId);
  assert.notEqual(bingx.ok && bingx.identity.broker, paperAccount.broker);
  assert.notEqual(bingx.ok && bingx.identity.environment, paperAccount.environment);
});
test("maps explicit LIVE account identity to confirmed canonical identity", () => {
  const result = liveAccount();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.identity, {
    accountId: "GT-123",
    broker: "BINGX",
    environment: "LIVE",
    baseCurrency: "USDT",
  });
  assert.equal(result.quality, "CONFIRMED");
  assert.equal(result.executionIdentityReady, true);
  assert.equal(result.provenance.accountIdBasis, "GOODTRADING_ACCOUNT_ID");
  assert.equal(result.provenance.brokerLinkBasis, "BROKER_ACCOUNT_ID");
});

test("rejects TESTNET, DEMO, UNKNOWN, missing environment, and URL inference", () => {
  for (const sourceEnvironment of ["TESTNET", "DEMO", "UNKNOWN"] as const) {
    const result = liveAccount({ sourceEnvironment });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.match(result.code, /ENVIRONMENT/);
    assert.equal(result.executionIdentityReady, false);
  }
  assert.equal(liveAccount({ sourceEnvironment: undefined }).ok, false);
  assert.equal(liveAccount({ sourceEnvironment: "LIVE", sourceUrl: "https://testnet.example" }).ok, true);
});

test("uses a stable connection pseudonym only as partial read-only identity", () => {
  const result = liveAccount({ brokerAccountId: undefined, existingConnectionPseudonym: "conn-a" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.accountId, "GT-123");
  assert.equal(result.quality, "PARTIAL");
  assert.equal(result.executionIdentityReady, false);
  assert.equal(result.provenance.accountIdBasis, "GOODTRADING_ACCOUNT_ID");
  assert.equal(result.provenance.brokerLinkBasis, "CONNECTION_PSEUDONYM");
  assert.equal(result.provenance.connectionPseudonymBasis, "conn-a");
  assert.equal(result.provenance.brokerNativeAccountId, undefined);
});

test("does not merge different connection pseudonyms", () => {
  const a = liveAccount({ brokerAccountId: undefined, existingConnectionPseudonym: "conn-a" });
  const b = liveAccount({ brokerAccountId: undefined, existingConnectionPseudonym: "conn-b" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.identity.accountId, "GT-123");
  assert.equal(b.identity.accountId, "GT-123");
  assert.notEqual(a.provenance.connectionPseudonymBasis, b.provenance.connectionPseudonymBasis);
});

test("requires explicit base currency and does not infer it from a symbol", () => {
  assert.equal(liveAccount({ baseCurrency: "" }).ok, false);
  assert.equal(liveAccount({ baseCurrency: undefined }).ok, false);
});

test("only preserves account type when explicitly factual", () => {
  const margin = liveAccount({ accountType: "MARGIN", accountTypeSource: "BingX Swap account context" });
  assert.equal(margin.ok, true);
  if (margin.ok) assert.equal(margin.identity.accountType, "MARGIN");
  const unknown = liveAccount({ accountType: undefined });
  assert.equal(unknown.ok, true);
  if (unknown.ok) assert.equal(unknown.identity.accountType, undefined);
});

test("maps perpetual market identity and preserves broker symbol provenance", () => {
  const result = perpetualMarket();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.identity, { instrument: "BTC-USDT", venue: "BINGX", marketType: "Perpetual" });
  assert.deepEqual(result.economicIdentity, { baseAsset: "BTC", quoteAsset: "USDT", settlementAsset: "USDT", productType: "Perpetual", contractStyle: "Linear", expiry: null });
  assert.equal(result.provenance.brokerSymbol, "BTC-USDT");
  assert.equal(result.provenance.mappingPolicy, "EXACT_V1_REGISTRY");
  assert.equal(result.provenance.metadataSource, "server-owned-v1-registry");
});

test("keeps Spot and Perpetual distinct and rejects unknown symbols", () => {
  const spot = buildBingXMarketIdentity({
    brokerSymbol: "BTC-USDT",
    sourceMarketType: "Spot",
    canonicalInstrument: "BTCUSDT",
    source: "fixture",
  });
  const perp = perpetualMarket();
  assert.equal(spot.ok, false);
  assert.equal(perp.ok, true);
  if (!perp.ok) return;
  assert.equal(perp.identity.marketType, "Perpetual");

  const unknown = buildBingXMarketIdentity({
    brokerSymbol: "UNKNOWN-USDT",
    sourceMarketType: "Perpetual",
    canonicalInstrument: undefined,
    source: "fixture",
  });
  assert.equal(unknown.ok, false);
});

test("resolves the same economic market across factual BingX and Nautilus adapter boundaries", () => {
  const bingx = perpetualMarket({ canonicalInstrument: "ETH-FAKE" });
  const paperInput: NautilusPortfolioSnapshotInput = {
    account: {
      account_id: "SIM-ACCOUNT-001", venue: "SIM", account_type: "margin", base_currency: "USDT",
      balance_total: 1, timestamp: 1_000,
      instrument: { venue: "SIM", market_type: "perpetual", symbol: "BTCUSDT-PERP" },
    },
    positions: [],
    fills: [],
  };
  const paper = adaptNautilusPaperPortfolio(paperInput, { capturedAt: 2_000, goodTradingAccountId: "GT-SAME-001" });
  assert.equal(bingx.ok, true);
  if (!bingx.ok) return;
  assert.equal(sameCanonicalEconomicMarket(bingx.economicIdentity, paper.economicIdentity), true);
  assert.notDeepEqual(bingx.identity, paper.executionIdentity);
  assert.deepEqual(bingx.identity, { instrument: "BTC-USDT", venue: "BINGX", marketType: "Perpetual" });
  assert.deepEqual(paper.executionIdentity, { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" });
  assert.equal(paper.portfolio.provenance.accountId, "GT-SAME-001");
});

test("returns deterministic defensive results without credential or environment access", () => {
  const first = liveAccount();
  const second = liveAccount();
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("apiSecret"), false);
  assert.equal(JSON.stringify(first).includes("apiKey"), false);
  assert.equal(JSON.stringify(first).includes("signature"), false);

  const market = perpetualMarket();
  assert.equal(market.ok, true);
  if (market.ok) {
    const provenance = market.provenance as Record<string, unknown>;
    provenance.brokerSymbol = "MUTATED";
    const again = perpetualMarket();
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.provenance.brokerSymbol, "BTC-USDT");
  }
});
