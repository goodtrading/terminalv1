import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptNautilusOrderLifecycle,
  type NautilusOrderIntentSnapshotInput,
  type NautilusOrderStateSnapshotInput,
} from "./nautilusOrderLifecycleAdapter";

const account = { accountId: "SIM-001", broker: "NAUTILUS_PAPER", environment: "PAPER" as const, baseCurrency: "USDT", accountType: "MARGIN" as const };
const instrument = { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT" };

function intent(overrides: Partial<NautilusOrderIntentSnapshotInput> = {}): NautilusOrderIntentSnapshotInput {
  return {
    clientOrderId: "client-1",
    instrument,
    side: "BUY",
    orderType: "LIMIT",
    quantity: "2",
    price: "100",
    timeInForce: "GTC",
    reduceOnly: false,
    postOnly: true,
    ...overrides,
  };
}

function state(overrides: Partial<NautilusOrderStateSnapshotInput> = {}): NautilusOrderStateSnapshotInput {
  return {
    clientOrderId: "client-1",
    venueOrderId: "venue-1",
    instrument,
    side: "BUY",
    orderType: "LIMIT",
    quantity: "2",
    filledQuantity: "0",
    remainingQuantity: "2",
    price: "100",
    status: "ACCEPTED",
    timestamps: { createdAt: 10, submittedAt: 20, acceptedAt: 30, updatedAt: 40 },
    snapshotId: "snapshot-1",
    ...overrides,
  };
}

function adapt(intentOverrides: Partial<NautilusOrderIntentSnapshotInput> = {}, stateOverrides: Partial<NautilusOrderStateSnapshotInput> = {}, fills?: Parameters<typeof adaptNautilusOrderLifecycle>[0]["fills"]) {
  return adaptNautilusOrderLifecycle({ accountIdentity: account, intentSnapshot: intent(intentOverrides), orderSnapshot: state(stateOverrides), fills });
}

test("adapts a real-shaped LIMIT ACCEPTED snapshot with explicit account and market scope", () => {
  const result = adapt();
  assert.equal(result.state.identity.account.accountId, "SIM-001");
  assert.equal(result.state.identity.account.environment, "PAPER");
  assert.deepEqual(result.state.identity.market, { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" });
  assert.equal(result.state.identity.canonicalOrderId, "client-1");
  assert.equal(result.state.identity.clientOrderId, "client-1");
  assert.equal(result.state.identity.venueOrderId, "venue-1");
  assert.equal(result.state.syncQuality, "CONFIRMED");
});

test("maps factual LIMIT intent without defaults", () => {
  const result = adapt();
  assert.equal(result.state.intent.orderType, "LIMIT");
  assert.equal(result.state.intent.side, "BUY");
  assert.equal(result.state.intent.quantity, 2);
  assert.equal(result.state.intent.limitPrice, 100);
  assert.equal(result.state.intent.triggerPrice, null);
  assert.equal(result.state.intent.timeInForce, "GTC");
  assert.equal(result.state.intent.reduceOnly, false);
  assert.equal(result.state.intent.postOnly, true);
});

test("maps MARKET without gaining a price and preserves SELL", () => {
  const result = adapt({ side: "SELL", orderType: "MARKET", price: undefined, postOnly: false }, { side: "SELL", orderType: "MARKET", price: undefined });
  assert.equal(result.state.intent.orderType, "MARKET");
  assert.equal(result.state.intent.side, "SELL");
  assert.equal(result.state.intent.limitPrice, null);
});

test("maps STOP_MARKET only with factual reduceOnly true and trigger price", () => {
  const result = adapt({ orderType: "STOP_MARKET", price: undefined, triggerPrice: "95", reduceOnly: true, postOnly: false }, { orderType: "STOP_MARKET", price: undefined, triggerPrice: "95" });
  assert.equal(result.state.intent.orderType, "STOP_MARKET");
  assert.equal(result.state.intent.triggerPrice, 95);
  assert.equal(result.state.intent.reduceOnly, true);
  assert.equal(result.state.intent.postOnly, false);
});

test("maps authoritative quantities and average fill directly", () => {
  const result = adapt({}, { status: "PARTIALLY_FILLED", filledQuantity: "0.75", remainingQuantity: "1.25", averageFillPrice: "101.5" });
  assert.equal(result.state.requestedQuantity, 2);
  assert.equal(result.state.filledQuantity, 0.75);
  assert.equal(result.state.remainingQuantity, 1.25);
  assert.equal(result.state.averageFillPrice, 101.5);
});

test("does not reconstruct state from supplied fills", () => {
  const result = adapt({}, { filledQuantity: "0", remainingQuantity: "2" }, [{ fillId: "fill-1", clientOrderId: "client-1", venueOrderId: "venue-1", instrument, side: "BUY", price: "100", quantity: "2", timestamp: 50 }]);
  assert.equal(result.state.filledQuantity, 0);
  assert.equal(result.state.remainingQuantity, 2);
  assert.equal(result.state.averageFillPrice, null);
});

test("preserves explicit timestamps but does not promote derived timestamps", () => {
  const result = adapt({}, { timestamps: { createdAt: 0, submittedAt: 2, acceptedAt: 3, updatedAt: 999, canceledAt: 8, firstFillAt: 100, lastFillAt: 101, completedAt: 102 } });
  assert.deepEqual(result.state.timestamps, { createdAt: 0, submittedAt: 2, acceptedAt: 3, updatedAt: 999, canceledAt: 8 });
});

test("preserves terminal reason and upstream metadata as provenance", () => {
  const result = adapt({ metadata: { protectionType: "TAKE_PROFIT", tag: "keep" } }, { status: "CANCELED", reason: "user canceled", canceledAt: 50, metadata: { rawTag: "GT_PROTECTION=TAKE_PROFIT" } });
  assert.deepEqual(result.state.terminalReason, { message: "user canceled", source: "NAUTILUS_PAPER" });
  assert.equal((result.state.provenance.upstream as { intentMetadata: { tag: string } }).intentMetadata.tag, "keep");
  assert.equal((result.state.provenance.upstream as { orderMetadata: { rawTag: string } }).orderMetadata.rawTag, "GT_PROTECTION=TAKE_PROFIT");
});

test("derives only explicit snapshot events and never CANCEL_REQUESTED", () => {
  const result = adapt({}, { status: "CANCELED", timestamps: { createdAt: 10, submittedAt: 20, acceptedAt: 30, canceledAt: 40, updatedAt: 99 } });
  assert.deepEqual(result.eventStream.events.map((record) => record.event.eventType), ["ORDER_CREATED", "ORDER_SUBMITTED", "ORDER_ACCEPTED", "ORDER_CANCELED"]);
  assert.ok(result.eventStream.events.every((record) => record.evidence.origin === "SNAPSHOT_DERIVED"));
  assert.equal(result.eventStream.events.some((record) => record.event.eventType === "CANCEL_REQUESTED"), false);
  assert.equal(result.eventStream.completeness, "PARTIAL");
  assert.equal(result.eventStream.quality, "PARTIAL");
});

test("does not backfill terminal events from status or updatedAt", () => {
  for (const status of ["FILLED", "REJECTED", "EXPIRED"] as const) {
    const result = adapt({}, { status, filledQuantity: status === "FILLED" ? "2" : "0", remainingQuantity: status === "FILLED" ? "0" : "2", timestamps: { updatedAt: 99 } });
    assert.equal(result.eventStream.events.length, 0);
    assert.equal(result.eventStream.quality, "UNKNOWN");
  }
});

test("maps multiple fills to distinct execution-backed FILL events", () => {
  const fills = [
    { fillId: "fill-b", clientOrderId: "client-1", venueOrderId: "venue-1", instrument, side: "BUY", price: "101", quantity: "1", timestamp: 60 },
    { fillId: "fill-a", clientOrderId: "client-1", venueOrderId: "venue-1", instrument, side: "BUY", price: "100", quantity: "1", timestamp: 50 },
  ];
  const result = adapt({}, { status: "FILLED", filledQuantity: "2", remainingQuantity: "0", timestamps: {} }, fills);
  assert.deepEqual(result.eventStream.events.map((record) => record.event.eventId), ["nautilus-fill:fill-a", "nautilus-fill:fill-b"]);
  assert.deepEqual(result.eventStream.events.map((record) => record.event.eventType), ["FILL", "FILL"]);
  assert.ok(result.eventStream.events.every((record) => record.evidence.origin === "EXECUTION_EVENT"));
  assert.equal(result.eventStream.events[0]!.event.executionReference!.executionId, "fill-a");
});

test("fill order does not affect canonical stream ordering", () => {
  const a = { fillId: "fill-a", clientOrderId: "client-1", instrument, side: "BUY", price: "100", quantity: "1", timestamp: 50 };
  const b = { fillId: "fill-b", clientOrderId: "client-1", instrument, side: "BUY", price: "101", quantity: "1", timestamp: 60 };
  assert.deepEqual(adapt({}, {}, [a, b]), adapt({}, {}, [b, a]));
});

test("rejects absent intent facts instead of defaulting them", () => {
  assert.throws(() => adapt({ reduceOnly: undefined as never }), /reduceOnly/);
  assert.throws(() => adapt({ postOnly: undefined as never }), /postOnly/);
  assert.throws(() => adapt({ timeInForce: "IOC" }), /timeInForce/);
  assert.throws(() => adapt({ orderType: "STOP_MARKET", price: undefined, triggerPrice: "95", reduceOnly: false, postOnly: false }, { orderType: "STOP_MARKET", price: undefined, triggerPrice: "95" }), /reduceOnly/);
});

test("rejects unsupported and mismatched transport values", () => {
  assert.throws(() => adapt({ orderType: "STOP_LIMIT" }), /order type/);
  assert.throws(() => adapt({}, { status: "UNKNOWN" }), /status/);
  assert.throws(() => adapt({}, { side: "LONG" }), /side/);
  assert.throws(() => adapt({}, { instrument: { ...instrument, marketType: "future" } }), /market type/);
  assert.throws(() => adapt({}, { clientOrderId: "other" }), /clientOrderId/);
  assert.throws(() => adapt({}, { instrument: { ...instrument, symbol: "ETHUSDT-PERP" } }), /market/);
});

test("rejects foreign fills and does not infer account scope", () => {
  assert.throws(() => adapt({}, {}, [{ fillId: "foreign", clientOrderId: "other", instrument, side: "BUY", price: "100", quantity: "1", timestamp: 1 }]), /another clientOrderId/);
  assert.throws(() => adapt({}, {}, [{ fillId: "foreign", clientOrderId: "client-1", instrument: { ...instrument, venue: "OTHER" }, side: "BUY", price: "100", quantity: "1", timestamp: 1 }]), /market/);
});

test("defensively clones input and output", () => {
  const input = { intentSnapshot: intent({ metadata: { nested: { value: 1 } } }), orderSnapshot: state({ metadata: { nested: { value: 2 } } }) };
  const result = adaptNautilusOrderLifecycle({ accountIdentity: account, ...input });
  const output = result.state.provenance.upstream as { intentMetadata: { nested: { value: number } } };
  output.intentMetadata.nested.value = 99;
  assert.equal((input.intentSnapshot.metadata!.nested as { value: number }).value, 1);
  assert.equal((result.state.provenance.upstream as { intentMetadata: { nested: { value: number } } }).intentMetadata.nested.value, 99);
});

test("contains no replacement, OCO, accounting or mutable owner semantics", () => {
  const result = adapt();
  assert.deepEqual(result.state.relationships, []);
  const text = JSON.stringify(result);
  for (const forbidden of ["EconomicFillRecord", "balance", "equity", "pnl", "fee", "OCO", "REPLACES", "REPLACED_BY", "transitionOrder", "applyEvent"]) assert.equal(text.includes(forbidden), false, forbidden);
});
