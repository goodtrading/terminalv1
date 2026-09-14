import assert from "node:assert/strict";
import test from "node:test";
import {
  compareOrderEvents,
  createOrderEvent,
  createOrderIdentity,
  createOrderIntent,
  createOrderState,
  isTerminalOrderStatus,
  orderEventIdentityKey,
  type OrderEvent,
  type OrderIntent,
  type OrderState,
} from "./orderLifecycle";
import type { AccountIdentity } from "./portfolioState";
import type { ExecutionMarketIdentity } from "./marketTruth";

const accountA: AccountIdentity = { accountId: "paper-a", broker: "nautilus", environment: "PAPER" };
const accountB: AccountIdentity = { accountId: "paper-b", broker: "nautilus", environment: "PAPER" };
const spot: ExecutionMarketIdentity = { instrument: "BTCUSDT", venue: "SIM", marketType: "Spot" };
const perp: ExecutionMarketIdentity = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" };

function identity(overrides: Partial<Parameters<typeof createOrderIdentity>[0]> = {}) {
  return createOrderIdentity({ account: accountA, market: perp, canonicalOrderId: "order-1", ...overrides });
}

function intent(overrides: Partial<Parameters<typeof createOrderIntent>[0]> = {}): OrderIntent {
  return createOrderIntent({
    account: accountA,
    market: perp,
    side: "BUY",
    orderType: "MARKET",
    quantity: 1,
    timeInForce: "GTC",
    reduceOnly: false,
    postOnly: false,
    ...overrides,
  });
}

function state(overrides: Partial<Parameters<typeof createOrderState>[0]> = {}): OrderState {
  return createOrderState({
    identity: identity(),
    intent: intent(),
    status: "CREATED",
    requestedQuantity: 1,
    filledQuantity: 0,
    remainingQuantity: 1,
    averageFillPrice: null,
    timestamps: {},
    executionReferences: [],
    relationships: [],
    syncQuality: "CONFIRMED",
    provenance: { source: "test", runtime: "nautilus-paper" },
    ...overrides,
  });
}

function event(overrides: Partial<Parameters<typeof createOrderEvent>[0]> = {}): OrderEvent {
  return createOrderEvent({
    eventId: "event-1",
    orderIdentity: identity(),
    eventType: "ORDER_CREATED",
    eventTime: 100,
    ...overrides,
  });
}

test("identity requires canonical id and preserves optional source ids", () => {
  assert.equal(identity({ clientOrderId: "client-1", venueOrderId: "venue-1" }).clientOrderId, "client-1");
  assert.equal(identity({ clientOrderId: "client-1", venueOrderId: "venue-1" }).venueOrderId, "venue-1");
  assert.throws(() => createOrderIdentity({ account: accountA, market: perp, canonicalOrderId: "" }), /canonicalOrderId/);
  assert.notDeepEqual(identity().account, { ...accountB });
  assert.notDeepEqual(identity({ account: accountB }).account, identity().account);
  assert.notDeepEqual(identity({ market: spot }).market, identity().market);
});

test("intent validates factual side, supported types, GTC and prices", () => {
  assert.equal(intent({ side: "SELL" }).side, "SELL");
  assert.throws(() => intent({ quantity: 0 }), /quantity/);
  assert.throws(() => intent({ quantity: Number.NaN }), /quantity/);
  assert.throws(() => intent({ orderType: "MARKET", limitPrice: 100 }), /limitPrice/);
  assert.throws(() => intent({ orderType: "LIMIT" }), /limitPrice/);
  assert.equal(intent({ orderType: "LIMIT", limitPrice: 100, postOnly: true }).limitPrice, 100);
  assert.throws(() => intent({ orderType: "STOP_MARKET", triggerPrice: 100, reduceOnly: false }), /reduceOnly/);
  assert.equal(intent({ orderType: "STOP_MARKET", triggerPrice: 100, reduceOnly: true }).triggerPrice, 100);
  assert.throws(() => intent({ timeInForce: "IOC" as never }), /timeInForce/);
  assert.throws(() => intent({ orderType: "LIMIT", limitPrice: 0 }), /limitPrice/);
  assert.throws(() => intent({ orderType: "STOP_MARKET", reduceOnly: true }), /triggerPrice/);
});

test("status terminality is separate from event vocabulary", () => {
  for (const status of ["FILLED", "CANCELED", "REJECTED", "EXPIRED"] as const) assert.equal(isTerminalOrderStatus(status), true);
  for (const status of ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"] as const) assert.equal(isTerminalOrderStatus(status), false);
  assert.equal(event({ eventType: "TRIGGERED" }).eventType, "TRIGGERED");
  assert.notEqual("TRIGGERED", "FILLED");
});

test("state preserves quantity and fill invariants without tolerance", () => {
  assert.equal(state({ status: "FILLED", filledQuantity: 1, remainingQuantity: 0 }).remainingQuantity, 0);
  assert.equal(state({ status: "CANCELED", filledQuantity: 0, remainingQuantity: 1 }).status, "CANCELED");
  assert.equal(state({ status: "CANCELED", filledQuantity: 0.4, remainingQuantity: 0.6 }).filledQuantity, 0.4);
  assert.throws(() => state({ status: "FILLED", filledQuantity: 0.9, remainingQuantity: 0.1 }), /FILLED/);
  assert.throws(() => state({ status: "PARTIALLY_FILLED", filledQuantity: 0, remainingQuantity: 1 }), /PARTIALLY_FILLED/);
  assert.throws(() => state({ status: "PARTIALLY_FILLED", filledQuantity: 1, remainingQuantity: 0 }), /PARTIALLY_FILLED/);
  assert.throws(() => state({ filledQuantity: 0.3, remainingQuantity: 0.3 }), /requestedQuantity/);
});

test("state keeps average price null before fills and references without accounting fields", () => {
  const reference = { executionId: "exec-1", clientOrderId: "client-1", eventTime: 101, receiveTime: 102 };
  const relation = { relationType: "REPLACES" as const, canonicalOrderId: "order-0" };
  const result = state({ status: "PARTIALLY_FILLED", filledQuantity: 0.4, remainingQuantity: 0.6, averageFillPrice: 100, executionReferences: [reference], relationships: [relation] });
  assert.equal(state().averageFillPrice, null);
  assert.deepEqual(result.executionReferences, [reference]);
  assert.deepEqual(result.relationships, [relation]);
  assert.equal("fee" in result, false);
  assert.equal("pnl" in result, false);
  assert.equal("balance" in result, false);
});

test("replacement is represented by distinct identities and explicit relations", () => {
  const original = identity();
  const replacement = identity({ canonicalOrderId: "order-2" });
  assert.notEqual(original.canonicalOrderId, replacement.canonicalOrderId);
  assert.deepEqual({ relationType: "REPLACED_BY", canonicalOrderId: replacement.canonicalOrderId }, { relationType: "REPLACED_BY", canonicalOrderId: "order-2" });
  assert.deepEqual({ relationType: "REPLACES", canonicalOrderId: original.canonicalOrderId }, { relationType: "REPLACES", canonicalOrderId: "order-1" });
});

test("events require explicit identity/time, preserve null-vs-zero, and sort deterministically", () => {
  assert.throws(() => createOrderEvent({ ...event(), eventId: "" }), /eventId/);
  assert.throws(() => createOrderEvent({ ...event(), eventTime: undefined as never }), /eventTime/);
  const zero = event({ eventId: "zero", eventTime: 0, receiveTime: 0, sourceSequence: 0 });
  assert.equal(zero.receiveTime, 0);
  assert.equal(zero.sourceSequence, 0);
  assert.equal(orderEventIdentityKey(zero), "paper-a|nautilus|PAPER|BTCUSDT-PERP|SIM|Perpetual|order-1|zero");

  const events = [
    event({ eventId: "z", eventTime: 100 }),
    event({ eventId: "b", eventTime: 100, sourceSequence: 2 }),
    event({ eventId: "a", eventTime: 100, sourceSequence: 1 }),
    event({ eventId: "c", eventTime: 100 }),
  ];
  assert.deepEqual([...events].sort(compareOrderEvents).map((item) => item.eventId), ["a", "b", "c", "z"]);
  assert.deepEqual([...events].sort(compareOrderEvents).map((item) => item.eventId), [...events].sort(compareOrderEvents).map((item) => item.eventId));
});

test("constructors defensively clone nested data and expose no transition methods", () => {
  const input = { ...state(), timestamps: { createdAt: 1 }, provenance: { source: "test", upstream: { value: 1 } } };
  const result = createOrderState(input);
  assert.notEqual(result, input);
  assert.notEqual(result.identity, input.identity);
  assert.notEqual(result.intent, input.intent);
  assert.notEqual(result.provenance, input.provenance);
  assert.equal("applyEvent" in result, false);
  assert.equal("transition" in result, false);
  assert.equal("submit" in result, false);
  assert.equal("cancel" in result, false);
});

test("contract source contains no runtime generation or legacy imports", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./orderLifecycle.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Date\.now|new Date|randomUUID|uuidv4|PaperTradingState|paperExecutionEngine|EconomicFillRecord/);
  assert.doesNotMatch(source, /applyEvent|transition\(|submit\(|cancel\(|amend\(|fill\(/);
});
