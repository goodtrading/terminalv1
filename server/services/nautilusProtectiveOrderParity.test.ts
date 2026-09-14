import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  adaptNautilusOrderLifecycle,
  type NautilusFillSnapshotInput,
  type NautilusOrderIntentSnapshotInput,
  type NautilusOrderStateSnapshotInput,
} from "./nautilusOrderLifecycleAdapter";

const RUNTIME = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
const ACCOUNT = {
  accountId: "SIM-001",
  broker: "NAUTILUS_PAPER",
  environment: "PAPER" as const,
  baseCurrency: "USDT",
  accountType: "MARGIN" as const,
};
const MARKET = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" as const };

type WireOrder = NautilusOrderStateSnapshotInput;
type WireFill = NautilusFillSnapshotInput;
type RuntimeResult = {
  orders: Record<string, WireOrder>;
  fills: WireFill[];
  position: Record<string, unknown> | null;
  errors?: Record<string, string>;
};

function runPython(mode: "stop" | "tp" | "slFirst" | "tpFirst" | "invalid"): RuntimeResult {
  assert.ok(existsSync(RUNTIME), `missing packaged Nautilus runtime: ${RUNTIME}`);
  const code = `
import json
from scripts.nautilus_bridge.simulation_core import SimulationCore
from scripts.nautilus_bridge.contracts import SimulationCoreJsonBoundary

instrument = {"venue":"SIM", "marketType":"perpetual", "symbol":"BTCUSDT-PERP", "baseAsset":"BTC", "quoteAsset":"USDT", "exchangeNativeSymbol":"BTCUSDT"}
core = SimulationCore()
core.start()
core.set_market("99999", "100001", timestamp_ns=1_000_000_000)
boundary = SimulationCoreJsonBoundary(core)

def snapshot(order_id):
    return boundary.get_order(order_id).to_json_dict()

def fills():
    return [fill.to_json_dict() for fill in boundary.list_fills()]

def submit_stop(order_id="sl", quantity="0.002", trigger="99900", side="SELL"):
    return boundary.submit_order({"clientOrderId":order_id,"instrument":instrument,"side":side,"orderType":"STOP_MARKET","quantity":quantity,"triggerPrice":trigger,"timeInForce":"GTC","reduceOnly":True,"postOnly":False})

def submit_tp(order_id="tp", quantity="0.002", price="100100", side="SELL"):
    return boundary.submit_order({"clientOrderId":order_id,"instrument":instrument,"side":side,"orderType":"LIMIT","quantity":quantity,"price":price,"timeInForce":"GTC","reduceOnly":True,"postOnly":False,"metadata":{"protectionType":"TAKE_PROFIT"}})

def open_long():
    boundary.submit_order({"clientOrderId":"entry","instrument":instrument,"side":"BUY","orderType":"MARKET","quantity":"0.002","timeInForce":"GTC","reduceOnly":False,"postOnly":False})

errors = {}
if ${JSON.stringify(mode)} == "invalid":
    for name, fn in {
        "noPosition": lambda: submit_stop("no-position"),
        "wrongSide": lambda: (open_long(), submit_stop("wrong-side", side="BUY")),
        "oversize": lambda: (open_long(), submit_stop("oversize", quantity="0.003")),
        "falseReduceOnly": lambda: (open_long(), core.submit_stop_market("SELL", "0.001", "99900", reduce_only=False, client_order_id="false-reduce")),
    }.items():
        try:
            fn()
        except Exception as exc:
            errors[name] = str(exc)
    print(json.dumps({"orders":{order.clientOrderId: order.to_json_dict() for order in boundary.list_orders()},"fills":fills(),"position":core.get_position(),"errors":errors}, sort_keys=True, default=str))
    core.shutdown()
else:
    open_long()
    if ${JSON.stringify(mode)} == "stop":
        submit_stop()
        before = snapshot("sl")
        core.set_market("99901", "99903", timestamp_ns=2_000_000_000)
        pretrigger = snapshot("sl")
        core.set_market("99900", "99902", timestamp_ns=3_000_000_000)
        print(json.dumps({"orders":{"slBefore":before,"slPretrigger":pretrigger,"sl":snapshot("sl")},"fills":fills(),"position":core.get_position()}, sort_keys=True, default=str))
    elif ${JSON.stringify(mode)} == "tp":
        submit_tp()
        working = snapshot("tp")
        core.set_market("100100", "100102", timestamp_ns=2_000_000_000)
        print(json.dumps({"orders":{"tpWorking":working,"tp":snapshot("tp")},"fills":fills(),"position":core.get_position()}, sort_keys=True, default=str))
    else:
        submit_stop()
        submit_tp()
        if ${JSON.stringify(mode)} == "slFirst":
            core.set_market("99900", "99902", timestamp_ns=2_000_000_000)
        else:
            core.set_market("100100", "100102", timestamp_ns=2_000_000_000)
        print(json.dumps({"orders":{"sl":snapshot("sl"),"tp":snapshot("tp")},"fills":fills(),"position":core.get_position()}, sort_keys=True, default=str))
    core.shutdown()
`;
  return JSON.parse(execFileSync(RUNTIME, ["-c", code], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as RuntimeResult;
}

function intentFor(order: WireOrder): NautilusOrderIntentSnapshotInput {
  return {
    clientOrderId: order.clientOrderId,
    instrument: order.instrument,
    side: order.side,
    orderType: order.orderType,
    quantity: order.quantity,
    ...(order.price === undefined ? {} : { price: order.price }),
    ...(order.triggerPrice === undefined ? {} : { triggerPrice: order.triggerPrice }),
    timeInForce: "GTC",
    reduceOnly: true,
    postOnly: false,
    metadata: order.protectionType === undefined ? {} : { protectionType: order.protectionType },
  };
}

function adapt(order: WireOrder, fills: readonly WireFill[]) {
  return adaptNautilusOrderLifecycle({
    accountIdentity: ACCOUNT,
    intentSnapshot: intentFor(order),
    orderSnapshot: order,
    fills,
    expectedMarket: MARKET,
  });
}

function fillsFor(fills: readonly WireFill[], clientOrderId: string): WireFill[] {
  return fills.filter((fill) => fill.clientOrderId === clientOrderId);
}

function assertNoSyntheticProtectionEvents(result: ReturnType<typeof adapt>): void {
  const types = result.eventStream.events.map((record) => record.event.eventType);
  assert.equal(types.includes("TRIGGERED"), false);
  assert.equal(types.includes("OCO_SIBLING_CANCELED"), false);
  assert.equal(types.includes("ORDER_REPLACED"), false);
  assert.equal(result.state.syncQuality, "CONFIRMED");
  assert.equal(result.eventStream.quality, "PARTIAL");
  assert.equal(result.eventStream.completeness, "PARTIAL");
}

function assertStableIdentity(before: ReturnType<typeof adapt>, after: ReturnType<typeof adapt>): void {
  assert.deepEqual(after.state.identity, before.state.identity);
  assert.deepEqual(after.state.intent, before.state.intent);
}

test("STOP_LOSS is a factual reduce-only STOP_MARKET that rests, preserves metadata, then executes", () => {
  const raw = runPython("stop");
  const before = adapt(raw.orders.slBefore!, []);
  const pretrigger = adapt(raw.orders.slPretrigger!, []);
  const final = adapt(raw.orders.sl!, fillsFor(raw.fills, "sl"));

  assert.equal(raw.position, null);
  assert.equal(raw.orders.slBefore!.status, "ACCEPTED");
  assert.equal(raw.orders.slPretrigger!.status, "ACCEPTED");
  assert.equal(raw.orders.sl!.status, "FILLED");
  assert.equal(raw.orders.sl!.orderType, "STOP_MARKET");
  assert.equal(raw.orders.sl!.triggerPrice, "99900");
  assert.equal(raw.orders.sl!.protectionType, "STOP_LOSS");
  assert.equal(raw.orders.sl!.filledQuantity, raw.orders.sl!.quantity);
  assert.equal(raw.orders.sl!.remainingQuantity, "0");
  assert.equal(raw.orders.slBefore!.filledQuantity, "0");
  assert.equal(raw.orders.slBefore!.remainingQuantity, raw.orders.slBefore!.quantity);
  assert.equal(raw.orders.slBefore!.averageFillPrice, undefined);
  assert.equal(fillsFor(raw.fills, "sl").length, 1);
  assert.equal(fillsFor(raw.fills, "sl")[0]!.clientOrderId, "sl");

  assert.equal(before.state.status, "ACCEPTED");
  assert.equal(before.state.intent.orderType, "STOP_MARKET");
  assert.equal(before.state.intent.side, "SELL");
  assert.equal(before.state.intent.triggerPrice, 99900);
  assert.equal(before.state.intent.reduceOnly, true);
  assert.equal(before.state.intent.timeInForce, "GTC");
  assert.equal(before.state.intent.sourceMetadata.protectionType, "STOP_LOSS");
  assert.equal(before.state.filledQuantity, 0);
  assert.equal(before.state.remainingQuantity, 0.002);
  assert.equal(before.state.averageFillPrice, null);
  assert.equal(before.eventStream.events.some((record) => record.event.eventType === "FILL"), false);

  assertStableIdentity(before, pretrigger);
  assertStableIdentity(before, final);
  assert.equal(final.state.status, "FILLED");
  assert.equal(final.state.filledQuantity, 0.002);
  assert.equal(final.state.remainingQuantity, 0);
  assert.equal(final.state.averageFillPrice, 99900);
  assert.equal(final.eventStream.events.filter((record) => record.event.eventType === "FILL").length, 1);
  assert.equal(final.eventStream.events.find((record) => record.event.eventType === "FILL")!.event.executionReference!.clientOrderId, "sl");
  assertNoSyntheticProtectionEvents(before);
  assertNoSyntheticProtectionEvents(final);
});

test("invalid protective submissions are command failures with no rejected lifecycle fabricated", () => {
  const raw = runPython("invalid");
  assert.equal(raw.fills.length, 1);
  for (const id of ["no-position", "wrong-side", "oversize", "false-reduce"]) assert.equal(raw.orders[id], undefined);
  assert.equal(raw.orders.entry!.status, "FILLED");
  assert.ok(raw.position !== null);
  assert.match(raw.errors!.noPosition!, /open position/);
  assert.match(raw.errors!.wrongSide!, /side must reduce/);
  assert.match(raw.errors!.oversize!, /exceeds open position/);
  assert.match(raw.errors!.falseReduceOnly!, /must be reduce-only/);
  assert.notEqual(raw.errors!.noPosition!, "ORDER_REJECTED");
  assert.notEqual(raw.errors!.wrongSide!, "REJECTED");
});

test("TAKE_PROFIT remains an ordinary reduce-only LIMIT and fills through normal matching", () => {
  const raw = runPython("tp");
  const working = adapt(raw.orders.tpWorking!, []);
  const final = adapt(raw.orders.tp!, fillsFor(raw.fills, "tp"));

  assert.equal(raw.orders.tpWorking!.status, "ACCEPTED");
  assert.equal(raw.orders.tpWorking!.orderType, "LIMIT");
  assert.equal(raw.orders.tpWorking!.price, "100100");
  assert.equal(raw.orders.tpWorking!.protectionType, "TAKE_PROFIT");
  assert.equal(raw.orders.tpWorking!.filledQuantity, "0");
  assert.equal(raw.orders.tpWorking!.remainingQuantity, raw.orders.tpWorking!.quantity);
  assert.equal(raw.orders.tp!.status, "FILLED");
  assert.equal(fillsFor(raw.fills, "tp").length, 1);

  assert.equal(working.state.status, "ACCEPTED");
  assert.equal(working.state.intent.orderType, "LIMIT");
  assert.equal(working.state.intent.limitPrice, 100100);
  assert.equal(working.state.intent.reduceOnly, true);
  assert.equal(working.state.intent.sourceMetadata.protectionType, "TAKE_PROFIT");
  assert.equal(working.state.averageFillPrice, null);
  assert.equal(working.eventStream.events.some((record) => record.event.eventType === "FILL"), false);
  assertStableIdentity(working, final);
  assert.equal(final.state.status, "FILLED");
  assert.equal(final.state.filledQuantity, 0.002);
  assert.equal(final.state.remainingQuantity, 0);
  assert.equal(final.state.averageFillPrice, 100100);
  assert.equal(final.eventStream.events.filter((record) => record.event.eventType === "FILL").length, 1);
  assertNoSyntheticProtectionEvents(working);
  assertNoSyntheticProtectionEvents(final);
});

test("SL and TP coexist with distinct identities and SL-first protective reconciliation cancels TP", () => {
  const raw = runPython("slFirst");
  const sl = adapt(raw.orders.sl!, fillsFor(raw.fills, "sl"));
  const tp = adapt(raw.orders.tp!, fillsFor(raw.fills, "tp"));

  assert.equal(raw.orders.sl!.status, "FILLED");
  assert.equal(raw.orders.tp!.status, "CANCELED");
  assert.equal(fillsFor(raw.fills, "sl").length, 1);
  assert.equal(fillsFor(raw.fills, "sl")[0]!.clientOrderId, "sl");
  assert.equal(raw.position, null);
  assert.notEqual(raw.orders.sl!.clientOrderId, raw.orders.tp!.clientOrderId);
  assert.notEqual(raw.orders.sl!.venueOrderId, raw.orders.tp!.venueOrderId);
  assert.equal(raw.orders.tp!.protectionType, "TAKE_PROFIT");
  assert.equal(raw.orders.tp!.filledQuantity, "0");
  assert.equal(raw.orders.tp!.remainingQuantity, raw.orders.tp!.quantity);
  assert.ok(raw.orders.tp!.timestamps.canceledAt !== undefined);

  assert.equal(sl.state.intent.sourceMetadata.protectionType, "STOP_LOSS");
  assert.equal(tp.state.intent.sourceMetadata.protectionType, "TAKE_PROFIT");
  assert.equal(sl.state.relationships.length, 0);
  assert.equal(tp.state.relationships.length, 0);
  assert.equal(tp.state.status, "CANCELED");
  assert.equal(tp.state.averageFillPrice, null);
  assert.equal(tp.eventStream.events.some((record) => record.event.eventType === "ORDER_CANCELED"), true);
  assert.equal(tp.eventStream.events.some((record) => record.event.eventType === "OCO_SIBLING_CANCELED"), false);
  assertNoSyntheticProtectionEvents(sl);
  assertNoSyntheticProtectionEvents(tp);
});

test("TP-first protective reconciliation cancels SL without inventing native OCO identity", () => {
  const raw = runPython("tpFirst");
  const sl = adapt(raw.orders.sl!, fillsFor(raw.fills, "sl"));
  const tp = adapt(raw.orders.tp!, fillsFor(raw.fills, "tp"));

  assert.equal(raw.orders.tp!.status, "FILLED");
  assert.equal(raw.orders.sl!.status, "CANCELED");
  assert.equal(fillsFor(raw.fills, "tp").length, 1);
  assert.equal(fillsFor(raw.fills, "tp")[0]!.clientOrderId, "tp");
  assert.equal(raw.position, null);
  assert.equal(sl.state.status, "CANCELED");
  assert.equal(tp.state.status, "FILLED");
  assert.equal(sl.state.relationships.length, 0);
  assert.equal(tp.state.relationships.length, 0);
  assert.equal(sl.state.intent.sourceMetadata.protectionType, "STOP_LOSS");
  assert.equal(tp.state.intent.sourceMetadata.protectionType, "TAKE_PROFIT");
  assert.equal(sl.eventStream.events.some((record) => record.event.eventType === "ORDER_CANCELED"), true);
  assert.equal(sl.eventStream.events.some((record) => record.event.eventType === "OCO_SIBLING_CANCELED"), false);
  assertNoSyntheticProtectionEvents(sl);
  assertNoSyntheticProtectionEvents(tp);
});

test("protective scenarios are isolated and deterministic across fresh runtimes", () => {
  const stopA = runPython("stop");
  const stopB = runPython("stop");
  const tpA = runPython("tp");
  const tpB = runPython("tp");
  const slFirstA = runPython("slFirst");
  const slFirstB = runPython("slFirst");
  assert.deepEqual(stopA, stopB);
  assert.deepEqual(tpA, tpB);
  assert.deepEqual(slFirstA, slFirstB);
});
