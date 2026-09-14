import assert from "node:assert/strict";
import test from "node:test";
import {
  compareEconomicFills,
  createEconomicFill,
  economicFillIdentityKey,
  economicFillsEqual,
  type EconomicFillInput,
} from "./economicFill";
import type { AccountIdentity } from "./portfolioState";
import type { ExecutionMarketIdentity } from "./marketTruth";

const accountA: AccountIdentity = { accountId: "paper-a", broker: "nautilus-paper", environment: "PAPER", baseCurrency: "USDT", accountType: "MARGIN" };
const accountB: AccountIdentity = { ...accountA, accountId: "paper-b" };
const spot: ExecutionMarketIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" };
const perp: ExecutionMarketIdentity = { ...spot, marketType: "Perpetual" };

function input(overrides: Partial<EconomicFillInput> = {}): EconomicFillInput {
  return {
    executionId: "exec-1",
    accountIdentity: accountA,
    marketIdentity: spot,
    side: "BUY",
    quantity: 1,
    price: 100,
    fee: { value: 0, currency: "USDT", quality: "VALID", provenance: { source: "test" } },
    liquidityRole: "MAKER",
    eventTime: 1_000,
    provenance: { source: "test", broker: "nautilus-paper", executionId: overrides.executionId ?? "exec-1", ...(overrides.provenance ?? {}) },
    ...overrides,
  };
}

test("creates valid factual BUY and SELL executions without open/close semantics", () => {
  assert.equal(createEconomicFill(input()).side, "BUY");
  assert.equal(createEconomicFill(input({ executionId: "exec-2", side: "SELL" })).side, "SELL");
  const record = createEconomicFill(input());
  assert.equal("action" in record, false);
  assert.equal("orderStatus" in record, false);
  assert.equal("positionAfter" in record, false);
});

test("requires stable upstream execution identity and valid account/market identity", () => {
  for (const executionId of ["", "   "]) assert.throws(() => createEconomicFill(input({ executionId })));
  assert.throws(() => createEconomicFill(input({ accountIdentity: { ...accountA, accountId: "" } })));
  assert.throws(() => createEconomicFill(input({ marketIdentity: { ...spot, instrument: "" } })));
  assert.throws(() => createEconomicFill(input({ side: "LONG" as never })));
});

test("rejects non-positive or non-finite quantity, price, and event time", () => {
  for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => createEconomicFill(input({ quantity })));
  for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => createEconomicFill(input({ price })));
  for (const eventTime of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => createEconomicFill(input({ eventTime })));
});

test("preserves execution timestamps without fallback and accepts receive time zero", () => {
  const record = createEconomicFill(input({ eventTime: 0, receiveTime: 0 }));
  assert.equal(record.eventTime, 0);
  assert.equal(record.receiveTime, 0);
  assert.notEqual(record.eventTime, undefined);
});

test("preserves fee/slippage availability and liquidity without inference", () => {
  const zero = createEconomicFill(input({ fee: { value: 0, currency: "USDT", quality: "VALID", provenance: { source: "test" } }, slippage: { value: 0, currency: "USDT", quality: "VALID", provenance: { source: "test" } }, liquidityRole: "TAKER" }));
  assert.equal(zero.fee?.value, 0);
  assert.equal(zero.slippage?.value, 0);
  assert.equal(zero.liquidityRole, "TAKER");
  const unavailable = createEconomicFill(input({ fee: { value: null, currency: null, quality: "UNAVAILABLE", provenance: { source: "unknown" } }, slippage: undefined, liquidityRole: "UNKNOWN" }));
  assert.equal(unavailable.fee?.value, null);
  assert.equal(unavailable.slippage, undefined);
  assert.equal(unavailable.liquidityRole, "UNKNOWN");
});

test("preserves optional order references and source sequence zero", () => {
  const record = createEconomicFill(input({ sourceSequence: 0, orderReferences: { clientOrderId: "client-1", venueOrderId: "venue-1" } }));
  assert.equal(record.sourceSequence, 0);
  assert.deepEqual(record.orderReferences, { clientOrderId: "client-1", venueOrderId: "venue-1" });
});

test("identity key scopes equal execution IDs by account and complete market", () => {
  const a = createEconomicFill(input());
  const b = createEconomicFill(input({ accountIdentity: accountB }));
  const c = createEconomicFill(input({ marketIdentity: perp }));
  assert.notEqual(economicFillIdentityKey(a), economicFillIdentityKey(b));
  assert.notEqual(economicFillIdentityKey(a), economicFillIdentityKey(c));
  assert.equal(economicFillIdentityKey(a), economicFillIdentityKey(createEconomicFill(input())));
});

test("detects exact duplicates and does not resolve conflicting duplicates", () => {
  const a = createEconomicFill(input());
  const duplicate = createEconomicFill(input());
  const conflict = createEconomicFill(input({ price: 101 }));
  assert.equal(economicFillsEqual(a, duplicate), true);
  assert.equal(economicFillsEqual(a, conflict), false);
  assert.equal(economicFillIdentityKey(a), economicFillIdentityKey(conflict));
});

test("orders chronologically, then present sequence, then execution ID", () => {
  const late = createEconomicFill(input({ executionId: "z", eventTime: 2_000 }));
  const early = createEconomicFill(input({ executionId: "a", eventTime: 1_000 }));
  const sequenceTwo = createEconomicFill(input({ executionId: "b", eventTime: 3_000, sourceSequence: 2 }));
  const sequenceOne = createEconomicFill(input({ executionId: "c", eventTime: 3_000, sourceSequence: 1 }));
  const noSequence = createEconomicFill(input({ executionId: "a", eventTime: 3_000 }));
  assert.deepEqual([late, early].sort(compareEconomicFills).map((f) => f.executionId), ["a", "z"]);
  assert.deepEqual([sequenceTwo, noSequence, sequenceOne].sort(compareEconomicFills).map((f) => f.executionId), ["c", "b", "a"]);
  assert.equal(compareEconomicFills(createEconomicFill(input({ executionId: "a", eventTime: 4 })), createEconomicFill(input({ executionId: "b", eventTime: 4 }))) < 0, true);
});

test("defensively clones records and has no accounting side effects", () => {
  const source = input({ provenance: { source: "test", identifiers: { raw: "x" } } });
  const record = createEconomicFill(source);
  const second = createEconomicFill(source);
  assert.deepEqual(record, second);
  (record.provenance as { identifiers: Record<string, string> }).identifiers.raw = "changed";
  (record.accountIdentity as { accountId: string }).accountId = "changed";
  assert.equal(source.provenance.identifiers?.raw, "x");
  assert.equal(source.accountIdentity.accountId, "paper-a");
  assert.equal("balance" in record, false);
  assert.equal("realizedPnl" in record, false);
  assert.equal("unrealizedPnl" in record, false);
});

test("preserves no symbol-only identity and supports one order with multiple executions", () => {
  const first = createEconomicFill(input({ executionId: "exec-1", orderReferences: { clientOrderId: "same-order" } }));
  const second = createEconomicFill(input({ executionId: "exec-2", orderReferences: { clientOrderId: "same-order" }, eventTime: 2_000 }));
  assert.notEqual(economicFillIdentityKey(first), economicFillIdentityKey(second));
  assert.equal(first.marketIdentity.marketType, "Spot");
  assert.equal(second.orderReferences?.clientOrderId, "same-order");
});
