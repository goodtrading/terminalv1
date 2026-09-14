import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { adaptNautilusOrderLifecycle, type NautilusOrderIntentSnapshotInput, type NautilusOrderStateSnapshotInput } from "./nautilusOrderLifecycleAdapter";
import { isTerminalOrderStatus } from "../../shared/orderLifecycle";

const RUNTIME = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
const ACCOUNT = { accountId: "SIM-001", broker: "NAUTILUS_PAPER", environment: "PAPER" as const, baseCurrency: "USDT", accountType: "MARGIN" as const };
const MARKET = { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT" };
const EXPECTED_MARKET = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" as const };

type WireOrder = NautilusOrderStateSnapshotInput & { instrument: NautilusOrderStateSnapshotInput["instrument"] };
type WireFill = Parameters<typeof adaptNautilusOrderLifecycle>[0]["fills"][number];
type Outcome = { kind: "COMMAND_FAILURE"; message: string; orders: unknown[] } | { kind: "ORDER_EXISTS"; order: WireOrder; fills: WireFill[] } | { kind: "PARTIAL_CANCEL"; partial: WireOrder; canceled: WireOrder; fills: WireFill[] };

function runPython(mode: "partial-cancel" | "cancel" | "terminal-cancel" | "already-canceled" | "unknown-cancel" | "invalid-quantity"): Outcome {
  if (!existsSync(RUNTIME)) throw new Error(`missing packaged Nautilus runtime: ${RUNTIME}`);
  const code = `
import json
from scripts.nautilus_bridge.simulation_core import SimulationCore, SimulationCoreError
from scripts.nautilus_bridge.contracts import SimulationCoreJsonBoundary
core = SimulationCore()
core.start()
boundary = SimulationCoreJsonBoundary(core)

def clean(value):
    if isinstance(value, dict): return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, list): return [clean(v) for v in value]
    return str(value) if type(value).__name__ == "Decimal" else value

def fail(exc):
    print(json.dumps({"kind": "COMMAND_FAILURE", "message": str(exc), "orders": [o.to_json_dict() for o in boundary.list_orders()]}, sort_keys=True))

try:
    mode = ${JSON.stringify(mode)}
    if mode == "partial-cancel":
        core.set_market("100", "102", bid_size="10", ask_size="1", timestamp_ns=1_000_000_000)
        core.submit_limit("BUY", "2", "99", post_only=False, client_order_id="n75-partial")
        core.set_market("98", "99", bid_size="10", ask_size="1", timestamp_ns=2_000_000_000)
        partial = boundary.get_order("n75-partial").to_json_dict()
        canceled = core.cancel("n75-partial")
        canceled = boundary.get_order("n75-partial").to_json_dict()
        print(json.dumps({"kind": "PARTIAL_CANCEL", "partial": partial, "canceled": canceled, "fills": [f.to_json_dict() for f in boundary.list_fills()]}, sort_keys=True))
    elif mode == "cancel":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_limit("BUY", "1", "99", post_only=False, client_order_id="n75-cancel")
        canceled = core.cancel("n75-cancel")
        core.set_market("98", "99", timestamp_ns=2_000_000_000)
        print(json.dumps({"kind": "ORDER_EXISTS", "order": boundary.get_order("n75-cancel").to_json_dict(), "fills": [f.to_json_dict() for f in boundary.list_fills()]}, sort_keys=True))
    elif mode == "terminal-cancel":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_market("BUY", "1", client_order_id="n75-filled")
        core.cancel("n75-filled")
    elif mode == "already-canceled":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_limit("BUY", "1", "99", post_only=False, client_order_id="n75-already")
        core.cancel("n75-already")
        core.cancel("n75-already")
    elif mode == "unknown-cancel":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.cancel("n75-unknown")
    elif mode == "invalid-quantity":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_market("BUY", "0", client_order_id="n75-invalid")
except Exception as exc:
    fail(exc)
`;
  return JSON.parse(execFileSync(RUNTIME, ["-c", code], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as Outcome;
}

function intentFrom(order: WireOrder): NautilusOrderIntentSnapshotInput {
  return { clientOrderId: order.clientOrderId, instrument: order.instrument, side: order.side, orderType: order.orderType, quantity: order.quantity, ...(order.price === undefined ? {} : { price: order.price }), timeInForce: "GTC", reduceOnly: false, postOnly: false };
}
function adapt(order: WireOrder, fills: readonly WireFill[]) {
  return adaptNautilusOrderLifecycle({ accountIdentity: ACCOUNT, intentSnapshot: intentFrom(order), orderSnapshot: order, fills, expectedMarket: EXPECTED_MARKET });
}
function assertTerminalSafety(result: ReturnType<typeof adapt>): void {
  assert.equal(result.state.syncQuality, "CONFIRMED");
  assert.equal(result.eventStream.quality, "PARTIAL");
  assert.equal(result.eventStream.completeness, "PARTIAL");
  assert.equal(result.eventStream.events.some((record) => ["CANCEL_REQUESTED", "ORDER_REJECTED", "ORDER_FILLED", "PARTIAL_FILL"].includes(record.event.eventType)), false);
}

 test("capability audit proves real partial fill and partial-fill cancel", () => {
  const raw = runPython("partial-cancel");
  assert.equal(raw.kind, "PARTIAL_CANCEL");
  if (raw.kind !== "PARTIAL_CANCEL") return;
  assert.equal(raw.partial.status, "PARTIALLY_FILLED");
  assert.equal(raw.partial.quantity, "2");
  assert.equal(raw.partial.filledQuantity, "1");
  assert.equal(raw.partial.remainingQuantity, "1");
  assert.equal(raw.partial.averageFillPrice, "99.0");
  assert.equal(raw.canceled.status, "CANCELED");
  assert.equal(raw.canceled.filledQuantity, "1");
  assert.equal(raw.canceled.remainingQuantity, "1");
  assert.equal(raw.canceled.averageFillPrice, "99.0");
  assert.equal(raw.fills.length, 1);
  const partial = adapt(raw.partial, raw.fills);
  const canceled = adapt(raw.canceled, raw.fills);
  assert.equal(partial.state.status, "PARTIALLY_FILLED");
  assert.equal(partial.state.filledQuantity, 1);
  assert.equal(partial.state.remainingQuantity, 1);
  assert.equal(partial.state.averageFillPrice, 99);
  assert.equal(partial.eventStream.events.filter((record) => record.event.eventType === "FILL").length, 1);
  assert.equal(canceled.state.status, "CANCELED");
  assert.equal(canceled.state.filledQuantity, 1);
  assert.equal(canceled.state.remainingQuantity, 1);
  assert.equal(canceled.state.averageFillPrice, 99);
  assert.equal(canceled.state.identity.canonicalOrderId, partial.state.identity.canonicalOrderId);
  assert.deepEqual(canceled.state.intent, partial.state.intent);
  assert.equal(canceled.eventStream.events.filter((record) => record.event.eventType === "FILL").length, 1);
  assert.equal(canceled.eventStream.events.some((record) => record.event.eventType === "ORDER_CANCELED"), true);
  assertTerminalSafety(partial);
  assertTerminalSafety(canceled);
});

test("working LIMIT cancel is authoritative and remains canceled after a crossing quote", () => {
  const raw = runPython("cancel");
  assert.equal(raw.kind, "ORDER_EXISTS");
  if (raw.kind !== "ORDER_EXISTS") return;
  assert.equal(raw.order.status, "CANCELED");
  assert.equal(raw.order.filledQuantity, "0");
  assert.equal(raw.order.remainingQuantity, "1");
  assert.equal(raw.fills.length, 0);
  const result = adapt(raw.order, raw.fills);
  assert.equal(result.state.status, "CANCELED");
  assert.equal(result.state.filledQuantity, 0);
  assert.equal(result.state.remainingQuantity, 1);
  assert.equal(result.state.averageFillPrice, null);
  assert.equal(result.state.timestamps.canceledAt, 1000);
  assert.equal(result.eventStream.events.filter((record) => record.event.eventType === "ORDER_CANCELED").length, 1);
  assert.equal(result.eventStream.events.find((record) => record.event.eventType === "ORDER_CANCELED")!.evidence.origin, "SNAPSHOT_DERIVED");
  assertTerminalSafety(result);
});

test("filled order cancel is command failure and preserves FILLED", () => {
  const raw = runPython("terminal-cancel");
  assert.equal(raw.kind, "COMMAND_FAILURE");
  assert.match(raw.message, /already filled/);
  assert.equal(raw.orders.length, 1);
  assert.equal((raw.orders[0] as { status: string }).status, "FILLED");
});

test("already canceled and unknown order cancel are command failures with distinct order existence", () => {
  const canceled = runPython("already-canceled");
  const unknown = runPython("unknown-cancel");
  assert.equal(canceled.kind, "COMMAND_FAILURE");
  assert.match(canceled.message, /already canceled/);
  assert.equal(unknown.kind, "COMMAND_FAILURE");
  assert.match(unknown.message, /unknown order id/);
  assert.deepEqual(unknown.orders, []);
});

test("invalid submission is command failure with no rejected order or event", () => {
  const raw = runPython("invalid-quantity");
  assert.equal(raw.kind, "COMMAND_FAILURE");
  assert.match(raw.message, /quantity must be positive/);
  assert.deepEqual(raw.orders, []);
});

test("native rejection capability is not proven and is not fabricated", () => {
  const modes: Array<"terminal-cancel" | "already-canceled" | "unknown-cancel" | "invalid-quantity"> = ["terminal-cancel", "already-canceled", "unknown-cancel", "invalid-quantity"];
  const outcomes = modes.map(runPython);
  assert.equal(outcomes.every((outcome) => outcome.kind === "COMMAND_FAILURE"), true);
  assert.equal(outcomes.some((outcome) => outcome.kind === "ORDER_EXISTS" && outcome.order.status === "REJECTED"), false);
});

test("terminal classification uses N7.1 helper and partial remains non-terminal", () => {
  assert.equal(isTerminalOrderStatus("FILLED"), true);
  assert.equal(isTerminalOrderStatus("CANCELED"), true);
  assert.equal(isTerminalOrderStatus("REJECTED"), true);
  assert.equal(isTerminalOrderStatus("PARTIALLY_FILLED"), false);
  assert.equal(isTerminalOrderStatus("ACCEPTED"), false);
});

test("partial and cancel scenarios are deterministic across fresh runtimes", () => {
  const first = runPython("partial-cancel");
  const second = runPython("partial-cancel");
  assert.deepEqual(first, second);
  const cancelFirst = runPython("cancel");
  const cancelSecond = runPython("cancel");
  assert.deepEqual(cancelFirst, cancelSecond);
});

test("adapter output contains no accounting or second lifecycle owner", () => {
  const raw = runPython("partial-cancel");
  assert.equal(raw.kind, "PARTIAL_CANCEL");
  if (raw.kind !== "PARTIAL_CANCEL") return;
  const result = adapt(raw.canceled, raw.fills);
  assert.deepEqual(result.state.relationships, []);
  const serialized = JSON.stringify(result);
  for (const forbidden of ["fee", "pnl", "balance", "equity", "position", "transitionOrder", "applyEvent", "OrderStore", "replaceOrder"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});
