import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrderEventRecord,
  createOrderEventStream,
  orderEventsMateriallyEqual,
  type CanonicalOrderEventRecord,
  type OrderEventStream,
} from "./orderEventStream";
import { createOrderEvent, createOrderIdentity, createOrderIntent, type OrderEvent, type OrderIdentity } from "./orderLifecycle";
import type { AccountIdentity } from "./portfolioState";
import type { ExecutionMarketIdentity } from "./marketTruth";

const account: AccountIdentity = { accountId: "paper-a", broker: "nautilus", environment: "PAPER" };
const otherAccount: AccountIdentity = { accountId: "paper-b", broker: "nautilus", environment: "PAPER" };
const market: ExecutionMarketIdentity = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" };
const otherMarket: ExecutionMarketIdentity = { instrument: "BTCUSDT", venue: "SIM", marketType: "Spot" };
const identity: OrderIdentity = createOrderIdentity({ account, market, canonicalOrderId: "order-1", clientOrderId: "client-1" });

function baseEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return createOrderEvent({
    eventId: "event-1",
    orderIdentity: identity,
    eventType: "ORDER_CREATED",
    eventTime: 100,
    provenance: { source: "nautilus-paper", runtime: "simulation" },
    ...overrides,
  });
}

function record(event: OrderEvent = baseEvent(), overrides: Partial<CanonicalOrderEventRecord["evidence"]> = {}): CanonicalOrderEventRecord {
  return createOrderEventRecord({
    event,
    evidence: {
      origin: "NATIVE_EVENT",
      quality: "CONFIRMED",
      eventIdOrigin: "NATIVE",
      nativeEventId: event.eventId,
      ...overrides,
    },
  });
}

function stream(records: readonly CanonicalOrderEventRecord[], overrides: Partial<Parameters<typeof createOrderEventStream>[0]> = {}): OrderEventStream {
  return createOrderEventStream({
    orderIdentity: identity,
    records,
    completeness: "COMPLETE",
    provenance: { source: "nautilus-paper", runtime: "simulation" },
    ...overrides,
  });
}

test("creates native, execution-backed and snapshot-derived event evidence", () => {
  const native = record();
  const fill = record(baseEvent({ eventId: "fill-1", eventType: "FILL" }), { origin: "EXECUTION_EVENT" });
  const snapshot = record(baseEvent({ eventId: "cancel-1", eventType: "ORDER_CANCELED", eventTime: 101 }), { origin: "SNAPSHOT_DERIVED", quality: "PARTIAL" });
  assert.equal(native.evidence.origin, "NATIVE_EVENT");
  assert.equal(fill.evidence.origin, "EXECUTION_EVENT");
  assert.equal(snapshot.evidence.origin, "SNAPSHOT_DERIVED");
});

test("tracks event ID origin without generating IDs", () => {
  const derived = record(baseEvent({ eventId: "derived-1" }), { eventIdOrigin: "DETERMINISTIC_DERIVED", derivationPolicy: "NAUTILUS_FILL_EVENT_V1" });
  assert.equal(derived.evidence.eventIdOrigin, "DETERMINISTIC_DERIVED");
  assert.equal(derived.evidence.derivationPolicy, "NAUTILUS_FILL_EVENT_V1");
  assert.throws(() => record(baseEvent({ eventId: "derived-2" }), { eventIdOrigin: "DETERMINISTIC_DERIVED" }), /derivationPolicy/);
  assert.throws(() => record(baseEvent(), { eventIdOrigin: "NATIVE", derivationPolicy: "not-allowed" }), /derivationPolicy/);
});

test("keeps one stream scoped to one account, market and canonical order", () => {
  assert.throws(() => stream([record(baseEvent({ orderIdentity: createOrderIdentity({ ...identity, account: otherAccount }) }))]), /scope/);
  assert.throws(() => stream([record(baseEvent({ orderIdentity: createOrderIdentity({ ...identity, market: otherMarket }) }))]), /scope/);
  assert.throws(() => stream([record(baseEvent({ orderIdentity: createOrderIdentity({ ...identity, canonicalOrderId: "order-2" }) }))]), /scope/);
});

test("sorts independently of insertion order and reports causal certainty separately", () => {
  const a = record(baseEvent({ eventId: "a", eventType: "ORDER_CREATED", eventTime: 100, sourceSequence: 1 }));
  const b = record(baseEvent({ eventId: "b", eventType: "ORDER_ACCEPTED", eventTime: 100, sourceSequence: 2 }));
  const first = stream([b, a]);
  const second = stream([a, b]);
  assert.deepEqual(first.events.map((item) => item.event.eventId), ["a", "b"]);
  assert.deepEqual(first.events, second.events);
  assert.equal(first.ordering, "DETERMINISTIC");
  const noSequence = stream([record(baseEvent({ eventId: "b", eventTime: 100 })), record(baseEvent({ eventId: "a", eventTime: 100 }))]);
  assert.deepEqual(noSequence.events.map((item) => item.event.eventId), ["a", "b"]);
  assert.equal(noSequence.ordering, "PARTIAL");
  assert.equal(noSequence.quality, "PARTIAL");
});

test("uses event time first, sequence second and event id as presentation tie-break", () => {
  const events = [
    record(baseEvent({ eventId: "late", eventTime: 200, sourceSequence: 1 })),
    record(baseEvent({ eventId: "seq-2", eventTime: 100, sourceSequence: 2 })),
    record(baseEvent({ eventId: "seq-1", eventTime: 100, sourceSequence: 1 })),
  ];
  assert.deepEqual(stream(events).events.map((item) => item.event.eventId), ["seq-1", "seq-2", "late"]);
  const lexical = stream([record(baseEvent({ eventId: "z", eventTime: 100 })), record(baseEvent({ eventId: "a", eventTime: 100 }))]);
  assert.deepEqual(lexical.events.map((item) => item.event.eventId), ["a", "z"]);
});

test("detects and retains duplicates without last-write-wins", () => {
  const duplicate = record(baseEvent({ sourceSequence: 1 }));
  const result = stream([duplicate, duplicate]);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.consistency.issues, ["DUPLICATE_EVENT"]);
  assert.deepEqual(result.consistency.duplicateEventIds, ["event-1"]);
});

test("detects conflicts and preserves both conflicting records", () => {
  const first = record(baseEvent({ sourceSequence: 1 }));
  const conflict = record(baseEvent({ eventType: "ORDER_ACCEPTED", sourceSequence: 2 }));
  const result = stream([conflict, first]);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.consistency.issues, ["CONFLICTING_EVENT"]);
  assert.deepEqual(result.consistency.conflictingEventIds, ["event-1"]);
});

test("material equality ignores transport provenance but compares factual event content", () => {
  const first = baseEvent({ provenance: { source: "a", upstream: { noisy: 1 } } });
  const same = baseEvent({ provenance: { source: "b", upstream: { noisy: 2 } } });
  const different = baseEvent({ statusAfter: "ACCEPTED" });
  assert.equal(orderEventsMateriallyEqual(first, same), true);
  assert.equal(orderEventsMateriallyEqual(first, different), false);
});

test("preserves event/status separation and multiple execution references", () => {
  const first = record(baseEvent({ eventId: "fill-a", eventType: "FILL", executionReference: { executionId: "exec-a", eventTime: 101 } }), { origin: "EXECUTION_EVENT" });
  const second = record(baseEvent({ eventId: "fill-b", eventType: "PARTIAL_FILL", executionReference: { executionId: "exec-b", eventTime: 102 } }), { origin: "EXECUTION_EVENT" });
  const terminal = record(baseEvent({ eventId: "filled", eventType: "ORDER_FILLED", eventTime: 103, statusAfter: "FILLED" }));
  const result = stream([terminal, second, first]);
  assert.deepEqual(result.events.map((item) => item.event.eventType), ["FILL", "PARTIAL_FILL", "ORDER_FILLED"]);
  assert.equal(result.events[1]!.event.eventType === "PARTIALLY_FILLED", false);
  assert.equal(result.events[0]!.event.executionReference?.executionId, "exec-a");
  assert.equal(result.events[1]!.event.executionReference?.executionId, "exec-b");
  assert.equal("fee" in result.events[0]!.event, false);
});

test("does not backfill lifecycle from a terminal snapshot", () => {
  const terminal = record(baseEvent({ eventId: "terminal", eventType: "ORDER_FILLED", eventTime: 300, statusAfter: "FILLED" }), { origin: "SNAPSHOT_DERIVED", quality: "PARTIAL" });
  const result = stream([terminal], { completeness: "PARTIAL" });
  assert.deepEqual(result.events.map((item) => item.event.eventType), ["ORDER_FILLED"]);
  assert.equal(result.events.some((item) => item.event.eventType === "ORDER_CREATED"), false);
  assert.equal(result.completeness, "PARTIAL");
  assert.equal(result.quality, "PARTIAL");
});

test("preserves partial and unknown stream metadata without changing status", () => {
  const partial = stream([record(baseEvent({ eventId: "cancel", eventType: "ORDER_CANCELED", statusAfter: "CANCELED" }), { origin: "SNAPSHOT_DERIVED", quality: "PARTIAL" })], { completeness: "PARTIAL" });
  const unknown = stream([], { completeness: "UNKNOWN" });
  assert.equal(partial.quality, "PARTIAL");
  assert.equal(unknown.quality, "UNKNOWN");
  assert.equal(partial.events[0]!.event.statusAfter, "CANCELED");
});

test("preserves zero timestamps/sequences and defensively clones every nested layer", () => {
  const input = record(baseEvent({ eventTime: 0, receiveTime: 0, sourceSequence: 0, executionReference: { executionId: "exec-0", eventTime: 0, receiveTime: 0 }, reason: { code: "C", message: "cancel" } }));
  const result = stream([input], { provenance: { source: "source", sourceRangeStart: 0, sourceRangeEnd: 0, sourceCursor: "cursor-0" } });
  assert.equal(result.events[0]!.event.receiveTime, 0);
  assert.equal(result.events[0]!.event.sourceSequence, 0);
  assert.equal(result.events[0]!.evidence.nativeSequence, undefined);
  assert.equal(result.provenance.sourceRangeStart, 0);
  assert.equal(result.provenance.sourceRangeEnd, 0);
  assert.notEqual(result.events[0], input);
  assert.notEqual(result.events[0]!.event, input.event);
  assert.notEqual(result.events[0]!.evidence, input.evidence);
});

test("event records require explicit event evidence and stream has no mutable owner", () => {
  assert.throws(() => createOrderEventRecord({ event: baseEvent(), evidence: { origin: "NATIVE_EVENT", quality: "CONFIRMED", eventIdOrigin: "NATIVE" } }), /nativeEventId/);
  assert.throws(() => createOrderEvent({ ...baseEvent(), eventId: "" }), /eventId/);
  assert.throws(() => createOrderEvent({ ...baseEvent(), eventTime: undefined as never }), /eventTime/);
  const result = stream([record()]);
  assert.equal("append" in result, false);
  assert.equal("applyEvent" in result, false);
  assert.equal("transition" in result, false);
});

test("contract source has no runtime, accounting, UI or legacy dependency", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./orderEventStream.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Date\.now|new Date|randomUUID|uuid4|simulation_core|nautilusSimulationBridge|PaperTradingState|EconomicFillRecord|fee|pnl|balance|equity/iu);
  assert.doesNotMatch(source, /append\(|applyEvent|transitionOrder|submitOrder|cancelOrder|projectMutableState/);
});
