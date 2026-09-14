import assert from "node:assert/strict";
import test from "node:test";
import { derivePortfolioAggregates, type PortfolioAggregateConfig, type PositionExposure } from "./portfolioAggregates";
import type { PortfolioState, PositionState } from "./portfolioState";

const policy: PortfolioAggregateConfig = { notionalPolicy: { mode: "LINEAR_QUANTITY_TIMES_PRICE", currency: "USDT" } };
const account = { accountId: "SIM-001", broker: "NAUTILUS_PAPER", environment: "PAPER" as const, baseCurrency: "USDT", accountType: "MARGIN" as const };
const market = (instrument = "BTCUSDT", marketType: "Perpetual" | "Spot" = "Perpetual") => ({ instrument, venue: "SIM", marketType });

function position(overrides: Partial<PositionState> = {}): PositionState {
  return {
    accountIdentity: account,
    marketIdentity: market(),
    positionId: "position-1",
    side: "LONG",
    quantity: 2,
    averageEntryPrice: 90,
    referencePrice: { value: 100, priceType: "MARK", source: "NAUTILUS_PAPER", eventTime: 900, quality: "VALID", provenance: { source: "NAUTILUS_PAPER", accountId: account.accountId } },
    realizedPnl: { value: 0, currency: "USDT", unit: "USDT", quality: "VALID", timestamps: { snapshotTime: 1000 }, provenance: { source: "NAUTILUS_PAPER" }, basis: "NET" },
    unrealizedPnl: { value: 20, currency: "USDT", unit: "USDT", quality: "VALID", timestamps: { snapshotTime: 1000 }, provenance: { source: "NAUTILUS_PAPER" }, basis: "GROSS_PRICE_PNL" },
    fees: { value: 0, currency: "USDT", unit: "USDT", quality: "VALID", timestamps: { snapshotTime: 1000 }, provenance: { source: "NAUTILUS_PAPER" } },
    openedAt: 800,
    updatedAt: 1000,
    quality: "VALID",
    provenance: { source: "NAUTILUS_PAPER", accountId: account.accountId, marketIdentity: market() },
    ...overrides,
  };
}

function portfolio(positions: readonly PositionState[] = [position()]): PortfolioState {
  const component = (value: number | null, quality: "VALID" | "UNAVAILABLE" = value === null ? "UNAVAILABLE" : "VALID") => ({ value, currency: "USDT", unit: "USDT", quality, timestamps: { snapshotTime: 1000 }, provenance: { source: "NAUTILUS_PAPER" } });
  return {
    accountIdentity: account,
    balances: { total: component(100000), available: component(100000), locked: component(0), marginUsed: component(null) },
    equity: component(100000),
    positions,
    pnl: { realized: { ...component(0), basis: "NET" }, unrealized: { ...component(0), basis: "GROSS_PRICE_PNL" } },
    fees: { total: component(0) },
    funding: { total: component(null) },
    margin: { available: component(100000), locked: component(0), marginUsed: component(null), collateral: component(null), maintenanceMargin: component(null) },
    exposure: { positionCount: { value: null, unit: "count", quality: "UNAVAILABLE", timestamps: { snapshotTime: null }, provenance: { source: "NAUTILUS_PAPER" } } },
    quality: { balances: "VALID", equity: "VALID", positions: "VALID", realizedPnl: "VALID", unrealizedPnl: "VALID", fees: "VALID", funding: "UNAVAILABLE", margin: "PARTIAL", exposure: "PARTIAL", overall: "PARTIAL" },
    timestamps: { snapshotTime: 1000, capturedAt: 2000 },
    provenance: { source: "NAUTILUS_PAPER", accountId: account.accountId },
    consistency: { status: "CONSISTENT", issues: [] },
    capturedAt: 2000,
  } as PortfolioState;
}

function derive(positions: readonly PositionState[], config: PortfolioAggregateConfig = policy) {
  return derivePortfolioAggregates(portfolio(positions), config);
}

test("empty valid portfolio exposes factual zero aggregates", () => {
  const result = derive([]);
  assert.deepEqual([result.positionCount.value, result.grossNotional.value, result.netNotional.value], [0, 0, 0]);
  assert.equal(result.positionCount.quality, "VALID");
  assert.equal(result.grossNotional.quality, "VALID");
});

test("linear LONG and SHORT use explicit reference price with signed net", () => {
  const long = derive([position()]);
  const short = derive([position({ positionId: "short-1", side: "SHORT" })]);
  assert.deepEqual([long.positionCount.value, long.grossNotional.value, long.netNotional.value], [1, 200, 200]);
  assert.deepEqual([short.positionCount.value, short.grossNotional.value, short.netNotional.value], [1, 200, -200]);
  assert.equal(long.grossExposure.value, 200);
  assert.equal(long.netExposure.value, 200);
});

test("offsetting positions keep gross nonzero while net cancels", () => {
  const result = derive([position({ positionId: "long", side: "LONG" }), position({ positionId: "short", side: "SHORT" })]);
  assert.equal(result.grossNotional.value, 400);
  assert.equal(result.netNotional.value, 0);
  assert.equal(result.grossNotional.quality, "VALID");
});

test("count is independent from missing or stale reference prices", () => {
  const missing = derive([position({ referencePrice: null })]);
  const stale = derive([position({ referencePrice: { ...position().referencePrice!, quality: "STALE" } })]);
  assert.equal(missing.positionCount.value, 1);
  assert.equal(missing.positionCount.quality, "VALID");
  assert.equal(missing.grossNotional.value, null);
  assert.equal(missing.grossNotional.quality, "UNAVAILABLE");
  assert.equal(stale.grossNotional.value, 200);
  assert.equal(stale.grossNotional.quality, "STALE");
});

test("partial coverage remains partial and never becomes zero", () => {
  const result = derive([position({ positionId: "priced" }), position({ positionId: "missing", referencePrice: null })]);
  assert.equal(result.positionCount.value, 2);
  assert.equal(result.grossNotional.value, 200);
  assert.equal(result.netNotional.quality, "PARTIAL");
  assert.equal(result.grossNotional.quality, "PARTIAL");
  assert.ok(result.consistency.issues.includes("MISSING_REFERENCE_PRICE"));
});

test("missing or unsupported policy is unavailable without hidden defaults", () => {
  const missing = derive([position()], {});
  const unsupported = derive([position()], { notionalPolicy: { mode: "LINEAR_QUANTITY_TIMES_PRICE", currency: "" } });
  assert.equal(missing.positionCount.value, 1);
  assert.equal(missing.grossNotional.value, null);
  assert.equal(missing.grossNotional.currency, null);
  assert.equal(unsupported.netNotional.value, null);
  assert.equal(unsupported.netNotional.quality, "UNAVAILABLE");
});

test("incompatible configured currencies are not summed or FX-converted", () => {
  const result = derive([position({ positionId: "usdt", marketIdentity: market("BTCUSDT") }), position({ positionId: "usd", marketIdentity: market("ETHUSD") })], { notionalPolicy: { ...policy.notionalPolicy!, currencyByMarket: { "BTCUSDT:SIM:Perpetual": "USDT", "ETHUSD:SIM:Perpetual": "USD" } } });
  assert.equal(result.positionCount.value, 2);
  assert.equal(result.grossNotional.value, null);
  assert.equal(result.grossNotional.quality, "PARTIAL");
  assert.ok(result.consistency.issues.includes("INCOMPATIBLE_AGGREGATE_CURRENCY"));
});

test("FLAT is not open exposure and Spot/Perpetual identities remain distinct", () => {
  const flat = derive([position({ side: "FLAT", quantity: 0 })]);
  const spot = derive([position({ marketIdentity: market("BTCUSDT", "Spot") })]);
  assert.equal(flat.positionCount.value, 0);
  assert.equal(flat.grossNotional.value, 0);
  assert.equal(spot.positionExposures[0]?.marketIdentity.marketType, "Spot");
});

test("preserves account economics, provenance, capturedAt and deterministic ordering", () => {
  const source = portfolio([position({ positionId: "z" }), position({ positionId: "a", side: "SHORT" })]);
  const before = JSON.stringify(source);
  const first = derivePortfolioAggregates(source, policy);
  const second = derivePortfolioAggregates(source, policy);
  assert.deepEqual(first, second);
  assert.equal(first.positionExposures[0]?.positionId, "a");
  assert.equal(first.positionExposures[0]?.provenance.upstream && typeof first.positionExposures[0].provenance.upstream, "object");
  assert.equal(first.timestamps.capturedAt, 2000);
  assert.equal(JSON.stringify(source), before);
  (first.positionExposures as PositionExposure[]).reverse();
  assert.equal(source.pnl.realized.value, 0);
});

test("aggregate derivation never changes authoritative accounting fields", () => {
  const source = portfolio([position()]);
  const before = JSON.stringify({ balances: source.balances, equity: source.equity, pnl: source.pnl, fees: source.fees, funding: source.funding });
  derivePortfolioAggregates(source, policy);
  assert.equal(JSON.stringify({ balances: source.balances, equity: source.equity, pnl: source.pnl, fees: source.fees, funding: source.funding }), before);
});
