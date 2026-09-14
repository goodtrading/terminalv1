import assert from "node:assert/strict";
import test from "node:test";
import { buildBingXAccountIdentity, buildBingXMarketIdentity } from "./bingxCanonicalIdentity";
import {
  buildBingXPortfolioState,
  type BingXPortfolioInput,
} from "./bingxPortfolioAdapter";

const identityResult = buildBingXAccountIdentity({
  sourceEnvironment: "LIVE",
  brokerAccountId: "uid-1",
  baseCurrency: "USDT",
  source: "fixture",
});
assert.equal(identityResult.ok, true);
if (!identityResult.ok) throw new Error("identity fixture invalid");

const marketResult = buildBingXMarketIdentity({
  brokerSymbol: "BTC-USDT",
  sourceMarketType: "Perpetual",
  canonicalInstrument: "BTCUSDT",
  source: "fixture",
});
assert.equal(marketResult.ok, true);
if (!marketResult.ok) throw new Error("market fixture invalid");

const position = (overrides: Partial<NonNullable<BingXPortfolioInput["positions"]>[number]["source"]> = {}) => ({
  source: {
    positionId: "pos-1",
    accountId: "uid-1",
    symbol: "BTC-USDT",
    side: "long" as const,
    quantity: 2,
    entryPrice: 100,
    markPrice: 110,
    unrealizedPnl: 20,
    leverage: 3,
    marginMode: "cross" as const,
    stale: false,
    accountMode: "REAL_BINGX_READ_ONLY" as const,
    source: "BINGX_ACCOUNT_READ_ONLY" as const,
    ...overrides,
  },
  marketIdentity: marketResult.identity,
});

const baseInput = (overrides: Partial<BingXPortfolioInput> = {}): BingXPortfolioInput => ({
  identity: identityResult,
  positionMode: "ONE_WAY",
  balanceSnapshot: {
    asset: "USDT",
    walletBalance: 1000,
    availableBalance: 700,
    equity: 1020,
    reportedEquity: true,
    unrealizedPnl: 20,
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
  },
  positions: [position()],
  capturedAt: 1_700_000_000_000,
  sourceSnapshotId: "snapshot-1",
  ...overrides,
});

test("maps explicit account facts and reuses the N8.1 identity", () => {
  const result = buildBingXPortfolioState(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.state.accountIdentity, identityResult.identity);
  assert.equal(result.state.balances.total.value, 1000);
  assert.equal(result.state.balances.available?.value, 700);
  assert.equal(result.state.equity.value, 1020);
  assert.equal(result.state.pnl.unrealized.value, 20);
  assert.equal(result.state.positions[0]?.quantity, 2);
  assert.equal(result.state.positions[0]?.side, "LONG");
  assert.equal(result.state.positions[0]?.averageEntryPrice, 100);
  assert.equal(result.state.positions[0]?.referencePrice?.value, 110);
  assert.equal(result.state.positions[0]?.referencePrice?.priceType, "MARK");
  const positionUpstream = result.state.positions[0]?.provenance.upstream as Record<string, unknown>;
  assert.equal(positionUpstream.sourcePositionId, "pos-1");
  assert.equal(positionUpstream.brokerSymbol, "BTC-USDT");
  assert.equal(result.state.positions[0]?.provenance.source, "BINGX_ACCOUNT_READ_ONLY");
  assert.equal(result.state.positions[0]?.positionId, "pos-1");
});

test("preserves connection-pseudonym identity as partial and rejects unsupported modes", () => {
  const partial = buildBingXAccountIdentity({
    sourceEnvironment: "LIVE",
    existingConnectionPseudonym: "conn-1",
    baseCurrency: "USDT",
    source: "fixture",
  });
  const result = buildBingXPortfolioState(baseInput({ identity: partial }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.state.quality.overall, "PARTIAL");
  for (const positionMode of ["HEDGE", "UNKNOWN"] as const) {
    const rejected = buildBingXPortfolioState(baseInput({ positionMode }));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "UNSUPPORTED_POSITION_MODE");
  }
});

test("does not promote absent equity or ambiguous realized PnL", () => {
  const result = buildBingXPortfolioState(baseInput({
    balanceSnapshot: {
      ...baseInput().balanceSnapshot,
      equity: undefined,
      reportedEquity: false,
      unrealizedPnl: 0,
    },
    positions: [position({ realizedPnl: 77, unrealizedPnl: 0 })],
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.equity.value, null);
  assert.equal(result.state.equity.quality, "UNAVAILABLE");
  assert.equal(result.state.pnl.realized.value, null);
  assert.equal(result.state.positions[0]?.realizedPnl.value, null);
  assert.equal(result.state.pnl.unrealized.value, 0);
});

test("keeps margin, locked, collateral, maintenance, funding and fees unavailable", () => {
  const result = buildBingXPortfolioState(baseInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.balances.marginUsed, undefined);
  assert.equal(result.state.balances.locked, undefined);
  assert.equal(result.state.balances.collateral, undefined);
  assert.equal(result.state.margin.maintenanceMargin, undefined);
  assert.equal(result.state.funding.total.value, null);
  assert.equal(result.state.fees.total.value, null);
  assert.equal(result.state.funding.total.quality, "UNAVAILABLE");
});

test("maps short positions, zero quantity deterministically, and rejects duplicate markets", () => {
  const short = buildBingXPortfolioState(baseInput({ positions: [position({ positionId: "pos-2", side: "short", quantity: 1 })] }));
  assert.equal(short.ok, true);
  if (short.ok) assert.equal(short.state.positions[0]?.side, "SHORT");

  const zero = buildBingXPortfolioState(baseInput({ positions: [position({ quantity: 0 })] }));
  assert.equal(zero.ok, true);
  if (zero.ok) assert.equal(zero.state.positions.length, 0);

  const duplicate = buildBingXPortfolioState(baseInput({ positions: [position(), position({ positionId: "pos-2" })] }));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "DUPLICATE_MARKET_POSITION");
});

test("requires explicit market identity and does not fabricate position IDs", () => {
  const missingMarket = buildBingXPortfolioState(baseInput({ positions: [{ ...position(), marketIdentity: undefined as never }] }));
  assert.equal(missingMarket.ok, false);
  const missingId = buildBingXPortfolioState(baseInput({ positions: [position({ positionId: "" })] }));
  assert.equal(missingId.ok, false);
});

test("preserves null versus zero, provenance, defensive input, and determinism", () => {
  const input = baseInput({
    balanceSnapshot: { ...baseInput().balanceSnapshot, walletBalance: 0, availableBalance: 0, unrealizedPnl: 0 },
    positions: [position({ unrealizedPnl: 0, markPrice: undefined, entryPrice: undefined })],
  });
  const first = buildBingXPortfolioState(input);
  const second = buildBingXPortfolioState(input);
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.state.balances.total.value, 0);
  assert.equal(first.state.balances.available?.value, 0);
  assert.equal(first.state.pnl.unrealized.value, 0);
  assert.equal(first.state.positions[0]?.referencePrice, null);
  assert.deepEqual(first.state.provenance.snapshotIds, ["snapshot-1"]);
  assert.equal(first.state.quality.overall, "PARTIAL");
  (input.positions[0]!.source as { quantity: number }).quantity = 99;
  assert.equal(first.state.positions[0]?.quantity, 2);
});

test("contains no order, fill, network, repository, or accounting behavior", () => {
  const result = buildBingXPortfolioState(baseInput());
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("order"), false);
  assert.equal(JSON.stringify(result).includes("fill"), false);
});
