import assert from "node:assert/strict";
import test from "node:test";
import {
  composePortfolioState,
  type AccountIdentity,
  type PortfolioState,
} from "./portfolioState";
import type { ExecutionMarketIdentity } from "./marketTruth";

const paperAccount: AccountIdentity = {
  accountId: "paper-account-a",
  broker: "nautilus-paper",
  environment: "PAPER",
  baseCurrency: "USDT",
  accountType: "MARGIN",
};

const spot: ExecutionMarketIdentity = {
  instrument: "BTCUSDT",
  venue: "Binance",
  marketType: "Spot",
};

const perpetual: ExecutionMarketIdentity = {
  instrument: "BTCUSDT",
  venue: "Binance",
  marketType: "Perpetual",
};

function validInput(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    accountIdentity: paperAccount,
    balances: {
      total: { value: 0, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      available: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "test" } },
      locked: { value: 10, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      marginUsed: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "test" } },
    },
    equity: { value: 0, currency: "USDT", quality: "VALID", timestamps: { snapshotTime: 10 }, provenance: { source: "test" } },
    positions: [],
    pnl: {
      realized: { value: 0, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      unrealized: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "test" } },
    },
    fees: { total: { value: 0, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } } },
    funding: { total: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } } },
    margin: {
      available: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      locked: { value: 10, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      marginUsed: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      collateral: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      maintenanceMargin: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
    },
    exposure: {
      positionCount: { value: 0, unit: "count", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      grossNotional: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      netNotional: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      grossExposure: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      netExposure: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
    },
    quality: {
      balances: "VALID", equity: "VALID", positions: "VALID", realizedPnl: "VALID",
      unrealizedPnl: "UNAVAILABLE", fees: "VALID", funding: "UNAVAILABLE", margin: "PARTIAL",
      exposure: "PARTIAL", overall: "PARTIAL",
    },
    timestamps: { capturedAt: 100, snapshotTime: 90 },
    provenance: { source: "test", broker: "nautilus-paper", accountId: paperAccount.accountId },
    consistency: { status: "CONSISTENT", issues: [] },
    capturedAt: 100,
    ...overrides,
  };
}

test("exports the canonical market identity and valid paper account identity", () => {
  const state = validInput();
  assert.equal(state.accountIdentity.environment, "PAPER");
  assert.equal(state.accountIdentity.accountId, "paper-account-a");
  assert.equal(state.positions.length, 0);
  assert.equal(spot.marketType, "Spot");
});

test("rejects incomplete account identity", () => {
  assert.throws(() => composePortfolioState({ ...validInput(), accountIdentity: { ...paperAccount, accountId: "" } }));
  assert.throws(() => composePortfolioState({ ...validInput(), accountIdentity: { ...paperAccount, broker: "" } }));
  assert.throws(() => composePortfolioState({ ...validInput(), accountIdentity: { ...paperAccount, baseCurrency: "" } }));
  assert.throws(() => composePortfolioState({ ...validInput(), accountIdentity: { ...paperAccount, environment: "" as never } }));
});

test("preserves null versus valid zero and does not double count realized PnL", () => {
  const state = composePortfolioState(validInput());
  assert.equal(state.balances.total.value, 0);
  assert.equal(state.balances.available.value, null);
  assert.equal(state.pnl.realized.value, 0);
  assert.equal(state.pnl.unrealized.value, null);
  assert.equal(state.equity.value, 0);
});

test("preserves distinct market and account identity", () => {
  const state = validInput({
    positions: [{
      accountIdentity: paperAccount,
      marketIdentity: spot,
      positionId: "paper-account-a:BTCUSDT:Spot",
      side: "LONG",
      quantity: 1,
      averageEntryPrice: 100,
      referencePrice: null,
      realizedPnl: { value: 0, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      unrealizedPnl: { value: null, currency: "USDT", quality: "UNAVAILABLE", timestamps: {}, provenance: { source: "none" } },
      fees: { value: 0, currency: "USDT", quality: "VALID", timestamps: {}, provenance: { source: "test" } },
      openedAt: 1,
      updatedAt: 2,
      quality: "UNAVAILABLE",
      provenance: { source: "test", eventIds: ["fill-1"] },
    }],
  });
  const result = composePortfolioState(state);
  assert.notDeepEqual(result.positions[0]?.marketIdentity, perpetual);
  assert.notDeepEqual(result.accountIdentity, { ...paperAccount, accountId: "paper-account-b" });
  assert.equal(result.positions[0]?.quantity, 1);
});

test("requires explicit reference price metadata for usable unrealized PnL", () => {
  const reference = { value: 101, priceType: "MARK" as const, source: "nautilus", eventTime: 3, quality: "VALID" as const, provenance: { source: "nautilus" } };
  const state = validInput({ pnl: { ...validInput().pnl, unrealized: { value: 1, currency: "USDT", quality: "VALID", timestamps: { eventTime: 3 }, provenance: { source: "nautilus" } } } });
  state.positions.push({
    accountIdentity: paperAccount, marketIdentity: spot, positionId: "p1", side: "LONG", quantity: 1,
    averageEntryPrice: 100, referencePrice: reference, realizedPnl: state.pnl.realized,
    unrealizedPnl: state.pnl.unrealized, fees: state.fees.total, openedAt: 1, updatedAt: 2,
    quality: "VALID", provenance: { source: "nautilus" },
  });
  assert.equal(composePortfolioState(state).positions[0]?.referencePrice?.priceType, "MARK");
  assert.equal(composePortfolioState(validInput()).pnl.unrealized.quality, "UNAVAILABLE");
});

test("preserves quality, timestamps, provenance, consistency, and does not auto-repair", () => {
  const input = validInput({
    quality: { ...validInput().quality, balances: "STALE", overall: "PARTIAL" },
    consistency: { status: "INCONSISTENT", issues: ["EQUITY_MISMATCH"] },
    timestamps: { capturedAt: 123, eventTime: 1, receiveTime: 2, snapshotTime: 3, calculatedAt: 4, updatedAt: 5 },
    provenance: { source: "nautilus", identifiers: { snapshotId: "s1" } },
  });
  const result = composePortfolioState(input);
  assert.equal(result.quality.balances, "STALE");
  assert.equal(result.consistency.status, "INCONSISTENT");
  assert.deepEqual(result.consistency.issues, ["EQUITY_MISMATCH"]);
  assert.equal(result.timestamps.capturedAt, 123);
  assert.equal(result.provenance.identifiers?.snapshotId, "s1");
});

test("defensively clones nested output and is deterministic", () => {
  const input = validInput();
  const first = composePortfolioState(input);
  const second = composePortfolioState(input);
  assert.deepEqual(first, second);
  (first.balances.total as { value: number | null }).value = 999;
  first.consistency.issues.push("SEQUENCE_ISSUE");
  assert.equal(input.balances.total.value, 0);
  assert.deepEqual(input.consistency.issues, []);
});

test("portfolio snapshot has no order lifecycle or strategy fields", () => {
  const state = validInput();
  assert.equal("orders" in state, false);
  assert.equal("openOrders" in state, false);
  assert.equal("signals" in state, false);
  assert.equal("strategy" in state, false);
});
