import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { adaptNautilusOrderLifecycle, type NautilusOrderIntentSnapshotInput, type NautilusOrderStateSnapshotInput } from "./nautilusOrderLifecycleAdapter";

const RUNTIME = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
const ACCOUNT = { accountId: "SIM-001", broker: "NAUTILUS_PAPER", environment: "PAPER" as const, baseCurrency: "USDT", accountType: "MARGIN" as const };
const EXPECTED_MARKET = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" as const };

type WireOrder = NautilusOrderStateSnapshotInput & { instrument: NautilusOrderStateSnapshotInput["instrument"] };
type WireFill = Parameters<typeof adaptNautilusOrderLifecycle>[0]["fills"][number];

type MarketRun = { order: WireOrder; fills: WireFill[] };
type LimitRun = { working: WireOrder; final: WireOrder; fills: WireFill[] };

function runPython(mode: "market" | "limit"): MarketRun | LimitRun {
  if (!existsSync(RUNTIME)) throw new Error(`missing packaged Nautilus runtime: ${RUNTIME}`);
  const code = `
import json
from scripts.nautilus_bridge.simulation_core import SimulationCore
from scripts.nautilus_bridge.contracts import SimulationCoreJsonBoundary
core = SimulationCore()
core.start()
if ${JSON.stringify(mode)} == "market":
    core.set_market("100", "102", timestamp_ns=1_000_000_000)
    core.submit_market("BUY", "1", client_order_id="n74-market")
    boundary = SimulationCoreJsonBoundary(core)
    out = {"order": boundary.get_order("n74-market").to_json_dict(), "fills": [f.to_json_dict() for f in boundary.list_fills()]}
else:
    core.set_market("100", "102", timestamp_ns=1_000_000_000)
    core.submit_limit("BUY", "1", "99", post_only=False, client_order_id="n74-limit")
    boundary = SimulationCoreJsonBoundary(core)
    working = boundary.get_order("n74-limit").to_json_dict()
    core.set_market("98", "99", timestamp_ns=2_000_000_000)
    out = {"working": working, "final": boundary.get_order("n74-limit").to_json_dict(), "fills": [f.to_json_dict() for f in boundary.list_fills()]}
print(json.dumps(out, sort_keys=True))
`;
  return JSON.parse(execFileSync(RUNTIME, ["-c", code], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as MarketRun | LimitRun;
}

function intentFrom(order: WireOrder): NautilusOrderIntentSnapshotInput {
  return {
    clientOrderId: order.clientOrderId,
    instrument: order.instrument,
    side: order.side,
    orderType: order.orderType,
    quantity: order.quantity,
    ...(order.price === undefined ? {} : { price: order.price }),
    ...(order.triggerPrice === undefined ? {} : { triggerPrice: order.triggerPrice }),
    timeInForce: "GTC",
    reduceOnly: false,
    postOnly: false,
  };
}

function adaptOrder(order: WireOrder, fills: readonly WireFill[]) {
  return adaptNautilusOrderLifecycle({ accountIdentity: ACCOUNT, intentSnapshot: intentFrom(order), orderSnapshot: order, fills, expectedMarket: EXPECTED_MARKET });
}

function assertNoImpliedEvents(result: ReturnType<typeof adaptOrder>): void {
  const types = result.eventStream.events.map((record) => record.event.eventType);
  assert.equal(types.includes("ORDER_FILLED"), false);
  assert.equal(types.includes("PARTIAL_FILL"), false);
  assert.equal(types.includes("TRIGGERED"), false);
  assert.equal(types.includes("ORDER_REPLACED"), false);
  assert.equal(result.eventStream.completeness, "PARTIAL");
  assert.equal(result.state.syncQuality, "CONFIRMED");
  assert.equal(result.eventStream.quality, "PARTIAL");
}

test("MARKET real SimulationCore result maps to canonical FILLED state and one FILL", () => {
  const raw = runPython("market") as MarketRun;
  assert.equal(raw.order.status, "FILLED");
  assert.equal(raw.order.filledQuantity, raw.order.quantity);
  assert.equal(raw.order.remainingQuantity, "0");
  assert.equal(raw.order.averageFillPrice, "102.0");
  assert.equal(raw.fills.length, 1);
  const result = adaptOrder(raw.order, raw.fills);
  assert.equal(result.state.status, "FILLED");
  assert.equal(result.state.identity.canonicalOrderId, "n74-market");
  assert.deepEqual(result.state.identity.market, EXPECTED_MARKET);
  assert.deepEqual(result.state.intent, { account: ACCOUNT, market: EXPECTED_MARKET, side: "BUY", orderType: "MARKET", quantity: 1, limitPrice: null, triggerPrice: null, timeInForce: "GTC", reduceOnly: false, postOnly: false, sourceMetadata: {} });
  assert.equal(result.state.requestedQuantity, 1);
  assert.equal(result.state.filledQuantity, 1);
  assert.equal(result.state.remainingQuantity, 0);
  assert.equal(result.state.averageFillPrice, 102);
  assert.equal(result.state.provenance.source, "NAUTILUS_PAPER");
  assert.equal(result.state.provenance.nativeStatus, "FILLED");
  assert.equal(result.state.provenance.nativeOrderType, "MARKET");
  assert.equal(result.eventStream.events.filter((record) => record.event.eventType === "FILL").length, 1);
  const fill = result.eventStream.events.find((record) => record.event.eventType === "FILL")!;
  assert.equal(fill.evidence.origin, "EXECUTION_EVENT");
  assert.equal(fill.evidence.derivationPolicy, "NAUTILUS_FILL_EVENT_V1");
  assert.equal(fill.event.executionReference?.executionId, raw.fills[0]!.fillId);
  assert.equal(fill.event.executionReference?.clientOrderId, "n74-market");
  assert.equal(fill.event.executionReference?.venueOrderId, raw.fills[0]!.venueOrderId);
  assert.equal(fill.event.eventTime, raw.fills[0]!.timestamp);
  assert.equal(result.state.timestamps.createdAt, raw.order.timestamps.createdAt);
  assert.equal(result.state.timestamps.submittedAt, raw.order.timestamps.submittedAt);
  assert.equal(result.state.timestamps.acceptedAt, raw.order.timestamps.acceptedAt);
  assert.equal(result.state.timestamps.updatedAt, raw.order.timestamps.updatedAt);
  assertNoImpliedEvents(result);
});

test("LIMIT real SimulationCore observes ACCEPTED working then FILLED after explicit crossing quote", () => {
  const raw = runPython("limit") as LimitRun;
  assert.equal(raw.working.status, "ACCEPTED");
  assert.equal(raw.working.filledQuantity, "0");
  assert.equal(raw.working.remainingQuantity, raw.working.quantity);
  assert.equal(raw.working.averageFillPrice, undefined);
  assert.equal(raw.final.status, "FILLED");
  assert.equal(raw.final.filledQuantity, raw.final.quantity);
  assert.equal(raw.final.remainingQuantity, "0");
  assert.equal(raw.final.averageFillPrice, "99.0");
  assert.equal(raw.fills.length, 1);
  const working = adaptOrder(raw.working, []);
  const final = adaptOrder(raw.final, raw.fills);
  assert.equal(working.state.status, "ACCEPTED");
  assert.equal(working.state.filledQuantity, 0);
  assert.equal(working.state.remainingQuantity, 1);
  assert.equal(working.state.averageFillPrice, null);
  assert.equal(working.eventStream.events.some((record) => record.event.eventType === "FILL"), false);
  assert.equal(final.state.status, "FILLED");
  assert.equal(final.state.filledQuantity, 1);
  assert.equal(final.state.remainingQuantity, 0);
  assert.equal(final.state.averageFillPrice, 99);
  assert.equal(final.state.identity.canonicalOrderId, working.state.identity.canonicalOrderId);
  assert.equal(final.state.identity.clientOrderId, working.state.identity.clientOrderId);
  assert.deepEqual(final.state.identity.account, working.state.identity.account);
  assert.deepEqual(final.state.identity.market, working.state.identity.market);
  assert.equal(final.state.identity.venueOrderId, working.state.identity.venueOrderId);
  assert.deepEqual(final.state.intent, working.state.intent);
  assert.equal(final.state.intent.limitPrice, 99);
  assert.equal(final.state.intent.reduceOnly, false);
  assert.equal(final.state.intent.postOnly, false);
  assert.equal(final.state.timestamps.createdAt, raw.final.timestamps.createdAt);
  assert.equal(final.state.timestamps.submittedAt, raw.final.timestamps.submittedAt);
  assert.equal(final.state.timestamps.acceptedAt, raw.final.timestamps.acceptedAt);
  assert.equal(final.state.timestamps.updatedAt, raw.final.timestamps.updatedAt);
  assert.equal(final.state.timestamps.canceledAt, undefined);
  assert.equal(final.eventStream.events.filter((record) => record.event.eventType === "FILL").length, 1);
  assertNoImpliedEvents(working);
  assertNoImpliedEvents(final);
});

test("MARKET and LIMIT runs are fresh-instance isolated and deterministic", () => {
  const marketA = runPython("market");
  const marketB = runPython("market");
  const limitA = runPython("limit");
  const limitB = runPython("limit");
  assert.deepEqual(marketA, marketB);
  assert.deepEqual(limitA, limitB);
  const marketCanonicalA = adaptOrder((marketA as MarketRun).order, (marketA as MarketRun).fills);
  const marketCanonicalB = adaptOrder((marketB as MarketRun).order, (marketB as MarketRun).fills);
  const limitCanonicalA = adaptOrder((limitA as LimitRun).final, (limitA as LimitRun).fills);
  const limitCanonicalB = adaptOrder((limitB as LimitRun).final, (limitB as LimitRun).fills);
  assert.deepEqual(marketCanonicalA, marketCanonicalB);
  assert.deepEqual(limitCanonicalA, limitCanonicalB);
  assert.deepEqual(marketCanonicalA.state.identity.market, EXPECTED_MARKET);
  assert.deepEqual(limitCanonicalA.state.identity.market, EXPECTED_MARKET);
});

test("canonical output is defensive and contains no accounting or transition owner", () => {
  const raw = runPython("market") as MarketRun;
  const result = adaptOrder(raw.order, raw.fills);
  const originalEventId = result.eventStream.events[0]?.event.eventId;
  const mutable = result as { state: { provenance: { upstream?: Record<string, unknown> } } };
  if (mutable.state.provenance.upstream) mutable.state.provenance.upstream.injected = true;
  assert.equal(raw.order.metadata, undefined);
  assert.equal(result.eventStream.events[0]?.event.eventId, originalEventId);
  const serialized = JSON.stringify(result);
  for (const forbidden of ["fee", "pnl", "balance", "equity", "position", "transitionOrder", "applyEvent", "OrderStore"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
