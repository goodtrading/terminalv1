import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptNautilusPaperPortfolio,
  type NautilusAccountSnapshotInput,
  type NautilusFillSnapshotInput,
  type NautilusPortfolioSnapshotInput,
} from "./nautilusPaperPortfolioAdapter";

const account = (): NautilusAccountSnapshotInput => ({
  account_id: "SIM-ACCOUNT-001",
  venue: "SIM",
  account_type: "margin",
  base_currency: "USDT",
  balance_total: 1000,
  balance_free: 900,
  balance_locked: 100,
  equity: 1010,
  realized_pnl: 10,
  unrealized_pnl: 0,
  fees_total: 0,
  timestamp: 1_000,
  instrument: { venue: "SIM", market_type: "perpetual", symbol: "BTCUSDT-PERP" },
});

const position = (overrides: Record<string, unknown> = {}) => ({
  instrument_id: "BTCUSDT.SIM",
  side: "long",
  quantity: 1,
  average_entry_price: 100,
  mark_price: 110,
  realized_pnl: 10,
  unrealized_pnl: 10,
  fees_total: 0,
  opened_at: 800,
  updated_at: 1_000,
  ...overrides,
});

const fill = (overrides: Partial<NautilusFillSnapshotInput> = {}): NautilusFillSnapshotInput => ({
  fill_id: "fill-1",
  client_order_id: "client-1",
  venue_order_id: "venue-1",
  instrument_id: "BTCUSDT.SIM",
  side: "BUY",
  price: 100,
  quantity: 1,
  timestamp: 900,
  fee: 0,
  fee_asset: "USDT",
  liquidity: "MAKER",
  ...overrides,
});

const snapshot = (overrides: Partial<NautilusPortfolioSnapshotInput> = {}): NautilusPortfolioSnapshotInput => ({
  account: account(),
  positions: [position()],
  fills: [fill()],
  ...overrides,
});

test("adapts the authoritative Nautilus account into canonical Paper state", () => {
  const result = adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.deepEqual(result.portfolio.accountIdentity, {
    accountId: "GT-TEST-001", broker: "NAUTILUS_PAPER", environment: "PAPER", baseCurrency: "USDT", accountType: "MARGIN",
  });
  assert.equal(result.portfolio.accountIdentity.accountId, "GT-TEST-001");
  assert.deepEqual(result.executionIdentity, { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" });
  assert.deepEqual(result.economicIdentity, { baseAsset: "BTC", quoteAsset: "USDT", settlementAsset: "USDT", productType: "Perpetual", contractStyle: "Linear", expiry: null });
  assert.equal(result.portfolio.provenance.executionAccountId, "SIM-ACCOUNT-001");
  assert.notEqual(result.portfolio.accountIdentity.accountId, result.portfolio.provenance.executionAccountId);
  assert.equal(result.portfolio.balances.total.value, 1000);
  assert.equal(result.portfolio.balances.available?.value, 900);
  assert.equal(result.portfolio.balances.locked?.value, 100);
  assert.equal(result.portfolio.balances.marginUsed?.value, null);
  assert.equal(result.portfolio.equity.value, 1010);
  assert.equal(result.portfolio.pnl.realized.value, 10);
  assert.equal(result.portfolio.pnl.unrealized.value, 0);
  assert.equal(result.portfolio.capturedAt, 2_000);
});

test("rejects missing account ID and unsupported market type", () => {
  assert.throws(() => adaptNautilusPaperPortfolio(snapshot({ account: { ...account(), account_id: "" } }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" }));
  assert.throws(() => adaptNautilusPaperPortfolio(snapshot({ account: { ...account(), instrument: { ...account().instrument, market_type: "options" } } }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" }));
});

test("rejects unknown registered market facts without normalization", () => {
  for (const instrument of [
    { venue: "SIM", market_type: "perpetual", symbol: "ETHUSDT" },
    { venue: "SIM", market_type: "perpetual", symbol: "BTCUSDT-FOO" },
    { venue: "UNKNOWN", market_type: "perpetual", symbol: "BTCUSDT-PERP" },
    { venue: "SIM", market_type: "spot", symbol: "BTCUSDT-PERP" },
  ]) {
    assert.throws(() => adaptNautilusPaperPortfolio(snapshot({ account: { ...account(), instrument } }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" }), /MARKET_IDENTITY_UNRESOLVED/);
  }
});

test("does not infer runtime modality from native symbol", () => {
  assert.doesNotThrow(() => adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" }));
});

test("does not reinterpret locked balance as margin, collateral, or maintenance margin", () => {
  const { portfolio } = adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(portfolio.balances.locked?.value, 100);
  assert.equal(portfolio.balances.marginUsed?.value, null);
  assert.equal(portfolio.margin.marginUsed?.value, null);
  assert.equal(portfolio.margin.collateral?.value, null);
  assert.equal(portfolio.margin.maintenanceMargin?.value, null);
  assert.equal(portfolio.quality.margin, "PARTIAL");
});

test("preserves reported equity and never adds realized PnL again", () => {
  const { portfolio } = adaptNautilusPaperPortfolio(snapshot({ account: { ...account(), equity: 1010, realized_pnl: 500, unrealized_pnl: 10 } }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(portfolio.equity.value, 1010);
  assert.equal(portfolio.pnl.realized.value, 500);
});

test("maps factual LONG, SHORT and FLAT invariants without deriving from fills", () => {
  const longResult = adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(longResult.portfolio.positions[0]?.side, "LONG");
  const shortResult = adaptNautilusPaperPortfolio(snapshot({ positions: [position({ side: "short", quantity: 2 })] }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(shortResult.portfolio.positions[0]?.side, "SHORT");
  const flatResult = adaptNautilusPaperPortfolio(snapshot({ positions: [position({ side: "flat", quantity: 0 })] }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(flatResult.portfolio.positions[0]?.side, "FLAT");
  assert.throws(() => adaptNautilusPaperPortfolio(snapshot({ positions: [position({ quantity: -1 })] }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" }));
});

test("maps mark as MARK with incomplete mark provenance and no synthetic mark time", () => {
  const result = adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  const reference = result.portfolio.positions[0]?.referencePrice;
  assert.equal(reference?.value, 110);
  assert.equal(reference?.priceType, "MARK");
  assert.equal(reference?.eventTime, null);
  assert.equal(reference?.receiveTime, undefined);
  assert.equal(reference?.quality, "PARTIAL");
  assert.equal(result.portfolio.positions[0]?.updatedAt, 1_000);
});

test("maps authoritative position economics and provenance without stops or order state", () => {
  const result = adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  const pos = result.portfolio.positions[0]!;
  assert.equal(pos.averageEntryPrice, 100);
  assert.equal(pos.unrealizedPnl.value, 10);
  assert.equal(pos.fees.value, 0);
  assert.deepEqual(pos.provenance.fillIds, undefined);
  assert.equal("stopLoss" in pos, false);
  assert.equal("orderStatus" in pos, false);
});

test("maps Nautilus fill to EconomicFillRecord without calculating portfolio state", () => {
  const result = adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(result.fills.length, 1);
  assert.equal(result.fills[0]?.executionId, "fill-1");
  assert.equal(result.fills[0]?.side, "BUY");
  assert.equal(result.fills[0]?.eventTime, 900);
  assert.equal(result.fills[0]?.receiveTime, undefined);
  assert.equal(result.fills[0]?.fee?.value, 0);
  assert.equal(result.fills[0]?.fee?.currency, "USDT");
  assert.equal(result.fills[0]?.liquidityRole, "MAKER");
  assert.equal(result.portfolio.balances.total.value, 1000);
  assert.equal(result.portfolio.exposure.positionCount.value, null);
  assert.equal(result.portfolio.quality.exposure, "PARTIAL");
});

test("missing account fields remain unavailable rather than zero", () => {
  const result = adaptNautilusPaperPortfolio(snapshot({ account: { ...account(), balance_free: null, equity: null, fees_total: null } }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(result.portfolio.balances.available?.value, null);
  assert.equal(result.portfolio.balances.available?.quality, "UNAVAILABLE");
  assert.equal(result.portfolio.equity.value, null);
  assert.equal(result.portfolio.fees.total.value, null);
  assert.equal(result.portfolio.funding.total.value, null);
});

test("marks duplicate fills as consistency issues without silently deduplicating output", () => {
  const duplicate = fill({ fill_id: "fill-1" });
  const result = adaptNautilusPaperPortfolio(snapshot({ fills: [fill(), duplicate] }), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.equal(result.fills.length, 2);
  assert.equal(result.portfolio.consistency.issues.includes("DUPLICATE_FILL"), true);
});

test("is deterministic, defensive, and exposes no second mutable owner", () => {
  const source = snapshot();
  const first = adaptNautilusPaperPortfolio(source, { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  const second = adaptNautilusPaperPortfolio(source, { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
  assert.deepEqual(first, second);
  (first.portfolio.accountIdentity as { accountId: string }).accountId = "changed";
  (first.fills[0]!.provenance as { source: string }).source = "changed";
  assert.equal(source.account.account_id, "SIM-ACCOUNT-001");
  assert.equal(source.fills?.[0]?.fill_id, "fill-1");
  assert.equal("ingestFill" in first, false);
});

test("requires explicit capturedAt and never imports or uses legacy Paper state", () => {
  assert.throws(() => adaptNautilusPaperPortfolio(snapshot(), { capturedAt: Number.NaN, goodTradingAccountId: "GT-TEST-001" }));
  assert.throws(() => adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "" }));
  assert.equal("orders" in adaptNautilusPaperPortfolio(snapshot(), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" }).portfolio, false);
});
