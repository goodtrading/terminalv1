import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { adaptNautilusOrderLifecycle, type NautilusFillSnapshotInput, type NautilusOrderIntentSnapshotInput, type NautilusOrderStateSnapshotInput } from "./nautilusOrderLifecycleAdapter";
import { linkCancelReplaceRelation } from "./nautilusCancelReplaceRelation";

const RUNTIME = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
const ACCOUNT = { accountId: "SIM-001", broker: "NAUTILUS_PAPER", environment: "PAPER" as const, baseCurrency: "USDT", accountType: "MARGIN" as const };
const MARKET = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" as const };
const INSTRUMENT = { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT" };

type Order = NautilusOrderStateSnapshotInput;
type Fill = NautilusFillSnapshotInput;
type RawReplay = { orders: Record<string, Order>; fills: Fill[]; failure?: { kind: "COMMAND_FAILURE"; message: string; orders: Order[] } };
type Scenario = "market" | "limit" | "partialCancel" | "cancel" | "failure" | "replace" | "partialReplace" | "stop" | "tp" | "slFirst" | "tpFirst";

function runPython(scenario: Scenario): RawReplay {
  assert.ok(existsSync(RUNTIME), `missing packaged Nautilus runtime: ${RUNTIME}`);
  const code = `
import json
from scripts.nautilus_bridge.simulation_core import SimulationCore
from scripts.nautilus_bridge.contracts import SimulationCoreJsonBoundary
instrument = ${JSON.stringify(INSTRUMENT)}
core = SimulationCore(); core.start(); boundary = SimulationCoreJsonBoundary(core)
def clean(v):
    if isinstance(v, dict): return {str(k): clean(x) for k,x in v.items()}
    if isinstance(v, list): return [clean(x) for x in v]
    return str(v) if type(v).__name__ == "Decimal" else v
def snap(i): return boundary.get_order(i).to_json_dict()
def fills(): return [f.to_json_dict() for f in boundary.list_fills()]
def emit(ids): print(json.dumps({"orders":{i:snap(i) for i in ids},"fills":fills()}, sort_keys=True, default=str))
def open_long():
    core.set_market("100", "102", timestamp_ns=1_000_000_000)
    core.submit_market("BUY", "2", client_order_id="entry")
def protections():
    boundary.submit_order({"clientOrderId":"sl","instrument":instrument,"side":"SELL","orderType":"STOP_MARKET","quantity":"2","triggerPrice":"90","timeInForce":"GTC","reduceOnly":True,"postOnly":False})
    boundary.submit_order({"clientOrderId":"tp","instrument":instrument,"side":"SELL","orderType":"LIMIT","quantity":"2","price":"110","timeInForce":"GTC","reduceOnly":True,"postOnly":False,"metadata":{"protectionType":"TAKE_PROFIT"}})
try:
    mode = ${JSON.stringify(scenario)}
    if mode == "market":
        core.set_market("100", "102", timestamp_ns=1_000_000_000); core.submit_market("BUY", "1", client_order_id="market"); emit(["market"])
    elif mode == "limit":
        core.set_market("100", "102", timestamp_ns=1_000_000_000); core.submit_limit("BUY", "1", "99", client_order_id="limit"); core.set_market("98", "99", timestamp_ns=2_000_000_000); emit(["limit"])
    elif mode == "partialCancel":
        core.set_market("100", "102", bid_size="10", ask_size="1", timestamp_ns=1_000_000_000); core.submit_limit("BUY", "2", "99", client_order_id="partial"); core.set_market("98", "99", bid_size="10", ask_size="1", timestamp_ns=2_000_000_000); core.cancel("partial"); emit(["partial"])
    elif mode == "cancel":
        core.set_market("100", "102", timestamp_ns=1_000_000_000); core.submit_limit("BUY", "1", "99", client_order_id="cancel"); core.cancel("cancel"); core.set_market("98", "99", timestamp_ns=2_000_000_000); emit(["cancel"])
    elif mode == "failure":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        try: core.submit_market("BUY", "0", client_order_id="invalid")
        except Exception as exc:
            print(json.dumps({"orders":{},"fills":[],"failure":{"kind":"COMMAND_FAILURE","message":str(exc),"orders":[]}}, sort_keys=True)); core.shutdown(); raise SystemExit
    elif mode == "replace":
        core.set_market("100", "102", timestamp_ns=1_000_000_000); core.submit_limit("BUY", "1", "99", client_order_id="original"); result=boundary.replace_order({"clientOrderId":"original","replacementClientOrderId":"replacement","limitPrice":"98"}); print(json.dumps({"orders":{"original":result["originalOrder"],"replacement":result["replacementOrder"]},"fills":fills()}, sort_keys=True, default=str)); core.shutdown(); raise SystemExit
    elif mode == "partialReplace":
        core.set_market("100", "102", bid_size="10", ask_size="1", timestamp_ns=1_000_000_000); core.submit_limit("BUY", "2", "99", client_order_id="original"); core.set_market("98", "99", bid_size="10", ask_size="1", timestamp_ns=2_000_000_000); result=boundary.replace_order({"clientOrderId":"original","replacementClientOrderId":"replacement","limitPrice":"98"}); print(json.dumps({"orders":{"original":result["originalOrder"],"replacement":result["replacementOrder"]},"fills":fills()}, sort_keys=True, default=str)); core.shutdown(); raise SystemExit
    elif mode == "stop":
        open_long(); boundary.submit_order({"clientOrderId":"sl","instrument":instrument,"side":"SELL","orderType":"STOP_MARKET","quantity":"2","triggerPrice":"90","timeInForce":"GTC","reduceOnly":True,"postOnly":False}); core.set_market("91", "93", timestamp_ns=2_000_000_000); emit(["sl"]); core.set_market("90", "92", timestamp_ns=3_000_000_000); emit(["sl"])
    elif mode == "tp":
        open_long(); boundary.submit_order({"clientOrderId":"tp","instrument":instrument,"side":"SELL","orderType":"LIMIT","quantity":"2","price":"110","timeInForce":"GTC","reduceOnly":True,"postOnly":False,"metadata":{"protectionType":"TAKE_PROFIT"}}); core.set_market("109", "111", timestamp_ns=2_000_000_000); emit(["tp"]); core.set_market("110", "112", timestamp_ns=3_000_000_000); emit(["tp"])
    else:
        open_long(); protections()
        if mode == "slFirst": core.set_market("90", "92", timestamp_ns=2_000_000_000)
        else: core.set_market("110", "112", timestamp_ns=2_000_000_000)
        emit(["sl","tp"])
    core.shutdown()
except SystemExit: pass
`;
  const output = execFileSync(RUNTIME, ["-c", code], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(output[output.length - 1]!) as RawReplay;
}

function intentFor(order: Order): NautilusOrderIntentSnapshotInput {
  const protective = order.protectionType !== undefined || order.orderType === "STOP_MARKET";
  return {
    clientOrderId: order.clientOrderId, instrument: order.instrument, side: order.side, orderType: order.orderType,
    quantity: order.quantity, ...(order.price === undefined ? {} : { price: order.price }), ...(order.triggerPrice === undefined ? {} : { triggerPrice: order.triggerPrice }),
    timeInForce: "GTC", reduceOnly: protective, postOnly: false,
    ...(order.protectionType === undefined ? {} : { metadata: { protectionType: order.protectionType } }),
  };
}
function canonical(raw: RawReplay, ids = Object.keys(raw.orders).sort()): unknown {
  if (raw.failure) return raw.failure;
  const adapted = ids.map((id) => adaptNautilusOrderLifecycle({ accountIdentity: ACCOUNT, intentSnapshot: intentFor(raw.orders[id]!), orderSnapshot: raw.orders[id]!, fills: raw.fills.filter((fill) => fill.clientOrderId === id), expectedMarket: MARKET }));
  const replacement = ids.length === 2 && ids.includes("original") && ids.includes("replacement")
    ? linkCancelReplaceRelation({ original: adapted[0]!.state, replacement: adapted[1]!.state, evidence: { operation: "CANCEL_REPLACE", originalClientOrderId: "original", replacementClientOrderId: "replacement" } })
    : undefined;
  return { states: (replacement ? [replacement.original, replacement.replacement] : adapted.map((item) => item.state)).sort((a, b) => a.identity.canonicalOrderId.localeCompare(b.identity.canonicalOrderId)), streams: adapted.map((item) => item.eventStream).sort((a, b) => a.orderIdentity.canonicalOrderId.localeCompare(b.orderIdentity.canonicalOrderId)) };
}
function replay(scenario: Scenario): unknown { return canonical(runPython(scenario)); }
function assertCommon(result: any): void {
  for (const state of result.states) { assert.equal(state.syncQuality, "CONFIRMED"); assert.ok(["MARKET","LIMIT","STOP_MARKET"].includes(state.intent.orderType)); }
  for (const stream of result.streams) { assert.equal(stream.quality, "PARTIAL"); assert.equal(stream.completeness, "PARTIAL"); }
}

test("N7.8 deterministic replay covers MARKET, LIMIT, partial cancel and working cancel", () => {
  for (const scenario of ["market","limit","partialCancel","cancel"] as const) {
    const first = replay(scenario) as any; const second = replay(scenario) as any; assert.deepEqual(first, second); assertCommon(first);
  }
  const market = replay("market") as any; assert.equal(market.states[0].status, "FILLED"); assert.equal(market.states[0].filledQuantity, 1); assert.equal(market.states[0].remainingQuantity, 0);
  const partial = replay("partialCancel") as any; assert.equal(partial.states[0].status, "CANCELED"); assert.equal(partial.states[0].filledQuantity, 1); assert.equal(partial.states[0].remainingQuantity, 1); assert.equal(partial.states[0].averageFillPrice, 99); assert.equal(partial.states[0].eventStream, undefined);
  const canceled = replay("cancel") as any; assert.equal(canceled.states[0].status, "CANCELED"); assert.equal(canceled.states[0].filledQuantity, 0); assert.equal(canceled.states[0].remainingQuantity, 1); assert.equal(canceled.states[0].averageFillPrice, null); assert.equal(canceled.states[0].relationships.length, 0);
});

test("N7.8 command failures remain outside canonical lifecycle", () => {
  const raw = runPython("failure"); assert.equal(raw.failure?.kind, "COMMAND_FAILURE"); assert.match(raw.failure!.message, /quantity must be positive/); assert.deepEqual(raw.failure!.orders, []); assert.equal(canonical(raw), raw.failure);
});

test("N7.8 deterministic replay preserves explicit CANCEL_REPLACE and partial remaining quantity", () => {
  for (const scenario of ["replace","partialReplace"] as const) {
    const first = replay(scenario) as any; const second = replay(scenario) as any; assert.deepEqual(first, second); assertCommon(first); assert.equal(first.states[0].relationships[0].relationType, "REPLACED_BY"); assert.equal(first.states[1].relationships[0].relationType, "REPLACES"); assert.equal(first.states.some((state: any) => state.status === "REPLACED"), false); assert.equal(first.streams.every((stream: any) => stream.events.every((record: any) => !["ORDER_REPLACED","REPLACE_REQUESTED"].includes(record.event.eventType))), true);
  }
  const partial = replay("partialReplace") as any; const original = partial.states.find((state: any) => state.identity.clientOrderId === "original"); const replacement = partial.states.find((state: any) => state.identity.clientOrderId === "replacement"); assert.equal(original.status, "CANCELED"); assert.equal(original.filledQuantity, 1); assert.equal(original.remainingQuantity, 1); assert.equal(replacement.requestedQuantity, 1); assert.equal(replacement.filledQuantity, 0); assert.equal(replacement.averageFillPrice, null);
});

test("N7.8 deterministic replay preserves STOP, TP and both protective reconciliation directions", () => {
  const stop = replay("stop") as any; const tp = replay("tp") as any; assertCommon(stop); assertCommon(tp); assert.equal(stop.states[0].status, "FILLED"); assert.equal(stop.states[0].intent.orderType, "STOP_MARKET"); assert.equal(stop.states[0].intent.triggerPrice, 90); assert.equal(stop.states[0].intent.reduceOnly, true); assert.equal(tp.states[0].status, "FILLED"); assert.equal(tp.states[0].intent.orderType, "LIMIT"); assert.equal(tp.states[0].intent.reduceOnly, true);
  for (const scenario of ["slFirst","tpFirst"] as const) { const first = replay(scenario) as any; const second = replay(scenario) as any; assert.deepEqual(first, second); assertCommon(first); assert.equal(first.states.length, 2); assert.equal(first.states.some((state: any) => state.status === "FILLED"), true); assert.equal(first.states.some((state: any) => state.status === "CANCELED"), true); assert.equal(first.states.every((state: any) => state.relationships.length === 0), true); assert.equal(first.streams.every((stream: any) => stream.events.every((record: any) => !["TRIGGERED","OCO_SIBLING_CANCELED"].includes(record.event.eventType))), true); }
});

test("N7.8 replay is isolated from scenario execution order and preserves the final capability boundary", () => {
  const forward = ["market","limit","partialCancel","cancel","replace","stop","tp","slFirst","tpFirst"] as const; const reverse = [...forward].reverse();
  const forwardResults = Object.fromEntries(forward.map((scenario) => [scenario, replay(scenario)])); const reverseResults = Object.fromEntries(reverse.map((scenario) => [scenario, replay(scenario)]));
  assert.deepEqual(forwardResults, reverseResults);
  assert.equal(JSON.stringify(forwardResults).includes("OCO_SIBLING"), false);
  assert.equal(JSON.stringify(forwardResults).includes("TRIGGERED"), false);
});
