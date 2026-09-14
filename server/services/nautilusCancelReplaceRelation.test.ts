import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { createOrderState, type OrderState } from "../../shared/orderLifecycle";
import { adaptNautilusOrderLifecycle, type NautilusOrderIntentSnapshotInput, type NautilusOrderStateSnapshotInput } from "./nautilusOrderLifecycleAdapter";
import { linkCancelReplaceRelation, type CancelReplaceRelationResult } from "./nautilusCancelReplaceRelation";

const RUNTIME = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
const ACCOUNT = { accountId: "SIM-001", broker: "NAUTILUS_PAPER", environment: "PAPER" as const, baseCurrency: "USDT", accountType: "MARGIN" as const };
const MARKET = { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT" };
const EXPECTED_MARKET = { instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "Perpetual" as const };
type WireOrder = NautilusOrderStateSnapshotInput & { instrument: NautilusOrderStateSnapshotInput["instrument"] };
type WireFill = Parameters<typeof adaptNautilusOrderLifecycle>[0]["fills"][number];
type Success = { kind: "SUCCESS"; original: WireOrder; replacement: WireOrder; fills: WireFill[] };
type Failure = { kind: "COMMAND_FAILURE"; message: string; orders: WireOrder[]; fills: WireFill[] };
type Run = Success | Failure;

function runPython(mode: "working" | "partial" | "cancel-failure" | "replacement-failure"): Run {
  if (!existsSync(RUNTIME)) throw new Error(`missing packaged Nautilus runtime: ${RUNTIME}`);
  const code = `
import json
from scripts.nautilus_bridge.simulation_core import SimulationCore
from scripts.nautilus_bridge.contracts import SimulationCoreJsonBoundary
core = SimulationCore(); core.start(); boundary = SimulationCoreJsonBoundary(core)
def fail(exc):
    print(json.dumps({"kind":"COMMAND_FAILURE", "message":str(exc), "orders":[o.to_json_dict() for o in boundary.list_orders()], "fills":[f.to_json_dict() for f in boundary.list_fills()]}, sort_keys=True))
try:
    mode = ${JSON.stringify(mode)}
    if mode == "working":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_limit("BUY", "1", "99", post_only=False, client_order_id="n76-original")
        result = boundary.replace_order({"clientOrderId":"n76-original", "replacementClientOrderId":"n76-replacement", "limitPrice":"98"})
        print(json.dumps({"kind":"SUCCESS", "original":result["originalOrder"], "replacement":result["replacementOrder"], "fills":[f.to_json_dict() for f in boundary.list_fills()]}, sort_keys=True))
    elif mode == "partial":
        core.set_market("100", "102", bid_size="10", ask_size="1", timestamp_ns=1_000_000_000)
        core.submit_limit("BUY", "2", "99", post_only=False, client_order_id="n76-original")
        core.set_market("98", "99", bid_size="10", ask_size="1", timestamp_ns=2_000_000_000)
        result = boundary.replace_order({"clientOrderId":"n76-original", "replacementClientOrderId":"n76-replacement", "limitPrice":"98"})
        core.set_market("97", "98", bid_size="10", ask_size="1", timestamp_ns=3_000_000_000)
        print(json.dumps({"kind":"SUCCESS", "original":result["originalOrder"], "replacement":boundary.get_order("n76-replacement").to_json_dict(), "fills":[f.to_json_dict() for f in boundary.list_fills()]}, sort_keys=True))
    elif mode == "cancel-failure":
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_market("BUY", "1", client_order_id="n76-original")
        boundary.replace_order({"clientOrderId":"n76-original", "replacementClientOrderId":"n76-replacement", "limitPrice":"98"})
    else:
        core.set_market("100", "102", timestamp_ns=1_000_000_000)
        core.submit_limit("BUY", "1", "99", post_only=False, client_order_id="n76-original")
        boundary.replace_order({"clientOrderId":"n76-original", "replacementClientOrderId":"n76-replacement", "limitPrice":"0"})
except Exception as exc:
    fail(exc)
`;
  return JSON.parse(execFileSync(RUNTIME, ["-c", code], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as Run;
}

function intentFrom(order: WireOrder, quantity = order.quantity, price = order.price): NautilusOrderIntentSnapshotInput {
  return { clientOrderId: order.clientOrderId, instrument: order.instrument, side: order.side, orderType: order.orderType, quantity, ...(price === undefined ? {} : { price }), timeInForce: "GTC", reduceOnly: false, postOnly: false };
}
function adapt(order: WireOrder, fills: readonly WireFill[], quantity = order.quantity, price = order.price) {
  return adaptNautilusOrderLifecycle({ accountIdentity: ACCOUNT, intentSnapshot: intentFrom(order, quantity, price), orderSnapshot: order, fills, expectedMarket: EXPECTED_MARKET });
}
function withOwnExecutionReferences(result: ReturnType<typeof adapt>): OrderState {
  return createOrderState({
    ...result.state,
    executionReferences: result.eventStream.events
      .filter((record) => record.event.eventType === "FILL" && record.event.executionReference !== undefined)
      .map((record) => record.event.executionReference!),
  });
}
function link(raw: Success, partial = false): CancelReplaceRelationResult {
  const originalFills = raw.fills.filter((fill) => fill.clientOrderId === raw.original.clientOrderId);
  const replacementFills = raw.fills.filter((fill) => fill.clientOrderId === raw.replacement.clientOrderId);
  const original = withOwnExecutionReferences(adapt(raw.original, originalFills, partial ? "2" : "1", "99"));
  const replacement = withOwnExecutionReferences(adapt(raw.replacement, replacementFills, partial ? "1" : "1", "98"));
  return linkCancelReplaceRelation({ original, replacement, evidence: { operation: "CANCEL_REPLACE", originalClientOrderId: raw.original.clientOrderId, replacementClientOrderId: raw.replacement.clientOrderId } });
}

test("working LIMIT uses explicit CANCEL_REPLACE and creates two authoritative orders", () => {
  const raw = runPython("working");
  assert.equal(raw.kind, "SUCCESS");
  if (raw.kind !== "SUCCESS") return;
  assert.equal(raw.original.status, "CANCELED");
  assert.equal(raw.replacement.status, "ACCEPTED");
  assert.equal(raw.original.clientOrderId, "n76-original");
  assert.equal(raw.replacement.clientOrderId, "n76-replacement");
  assert.notEqual(raw.original.clientOrderId, raw.replacement.clientOrderId);
  assert.equal(raw.original.quantity, "1");
  assert.equal(raw.replacement.quantity, "1");
  assert.equal(raw.original.price, "99");
  assert.equal(raw.replacement.price, "98");
  const result = link(raw);
  assert.equal(result.original.status, "CANCELED");
  assert.equal(result.replacement.status, "ACCEPTED");
  assert.equal(result.original.identity.canonicalOrderId, "n76-original");
  assert.equal(result.replacement.identity.canonicalOrderId, "n76-replacement");
  assert.deepEqual(result.original.identity.account, result.replacement.identity.account);
  assert.deepEqual(result.original.identity.market, result.replacement.identity.market);
  assert.deepEqual(result.original.intent, { ...result.replacement.intent, limitPrice: 99 });
  assert.equal(result.replacement.intent.limitPrice, 98);
  assert.deepEqual(result.original.relationships, [{ relationType: "REPLACED_BY", canonicalOrderId: "n76-replacement" }]);
  assert.deepEqual(result.replacement.relationships, [{ relationType: "REPLACES", canonicalOrderId: "n76-original" }]);
  const originalCanonical = adapt(raw.original, []);
  const replacementCanonical = adapt(raw.replacement, []);
  assert.equal(originalCanonical.eventStream.quality, "PARTIAL");
  assert.equal(replacementCanonical.eventStream.quality, "PARTIAL");
  assert.notEqual(originalCanonical.eventStream, replacementCanonical.eventStream);
});

test("partial original is canceled with factual fill and replacement uses authoritative remaining quantity", () => {
  const raw = runPython("partial");
  assert.equal(raw.kind, "SUCCESS");
  if (raw.kind !== "SUCCESS") return;
  assert.equal(raw.original.status, "CANCELED");
  assert.equal(raw.original.quantity, "2");
  assert.equal(raw.original.filledQuantity, "1");
  assert.equal(raw.original.remainingQuantity, "1");
  assert.equal(raw.original.averageFillPrice, "99.0");
  assert.equal(raw.replacement.quantity, "1");
  assert.equal(raw.replacement.filledQuantity, "1");
  assert.equal(raw.replacement.remainingQuantity, "0");
  assert.equal(raw.fills.length, 2);
  const originalFill = raw.fills.find((fill) => fill.clientOrderId === "n76-original")!;
  const replacementFill = raw.fills.find((fill) => fill.clientOrderId === "n76-replacement")!;
  assert.equal(originalFill.quantity, "1");
  assert.equal(replacementFill.quantity, "1");
  const result = link(raw, true);
  assert.equal(result.original.filledQuantity, 1);
  assert.equal(result.original.remainingQuantity, 1);
  assert.equal(result.original.averageFillPrice, 99);
  assert.equal(result.replacement.requestedQuantity, 1);
  assert.equal(result.replacement.filledQuantity, 1);
  assert.equal(result.replacement.remainingQuantity, 0);
  assert.equal(result.replacement.averageFillPrice, 98);
  assert.equal(result.original.executionReferences.length, 1);
  assert.equal(result.replacement.executionReferences.length, 1);
  assert.notEqual(result.original.executionReferences[0]!.executionId, result.replacement.executionReferences[0]!.executionId);
  assert.deepEqual(result.original.relationships, [{ relationType: "REPLACED_BY", canonicalOrderId: "n76-replacement" }]);
  assert.deepEqual(result.replacement.relationships, [{ relationType: "REPLACES", canonicalOrderId: "n76-original" }]);
});

test("cancel failure prevents replacement and preserves terminal original", () => {
  const raw = runPython("cancel-failure");
  assert.equal(raw.kind, "COMMAND_FAILURE");
  assert.match(raw.message, /only LIMIT/);
  assert.equal(raw.orders.length, 1);
  assert.equal((raw.orders[0] as { clientOrderId: string }).clientOrderId, "n76-original");
  assert.equal((raw.orders[0] as { status: string }).status, "FILLED");
  assert.equal(raw.orders.some((order) => (order as { clientOrderId: string }).clientOrderId === "n76-replacement"), false);
  assert.equal(raw.fills.length, 1);
});

test("replacement submission failure leaves original canceled without false relation", () => {
  const raw = runPython("replacement-failure");
  assert.equal(raw.kind, "COMMAND_FAILURE");
  assert.match(raw.message, /positive price/);
  assert.equal(raw.orders.length, 1);
  assert.equal((raw.orders[0] as { status: string }).status, "CANCELED");
  assert.equal((raw.orders[0] as { clientOrderId: string }).clientOrderId, "n76-original");
  assert.equal(raw.orders.some((order) => (order as { clientOrderId: string }).clientOrderId === "n76-replacement"), false);
  assert.deepEqual(raw.fills, []);
});

test("relationship helper requires explicit evidence, distinct identities and matching scope", () => {
  const raw = runPython("working");
  assert.equal(raw.kind, "SUCCESS");
  if (raw.kind !== "SUCCESS") return;
  const result = link(raw);
  assert.equal(result.evidence.operation, "CANCEL_REPLACE");
  assert.throws(() => linkCancelReplaceRelation({ original: result.original, replacement: result.replacement, evidence: { ...result.evidence, operation: "OTHER" as "CANCEL_REPLACE" } }), /operation/);
  assert.throws(() => linkCancelReplaceRelation({ original: result.original, replacement: { ...result.replacement, identity: { ...result.replacement.identity, canonicalOrderId: result.original.identity.canonicalOrderId, clientOrderId: result.original.identity.clientOrderId } }, evidence: result.evidence }), /distinct/);
  assert.throws(() => linkCancelReplaceRelation({ original: result.original, replacement: { ...result.replacement, identity: { ...result.replacement.identity, account: { ...result.replacement.identity.account, accountId: "other" } } }, evidence: result.evidence }), /scope/);
  assert.throws(() => linkCancelReplaceRelation({ original: { ...result.original, status: "ACCEPTED" }, replacement: result.replacement, evidence: result.evidence }), /CANCELED/);
});

test("linked outputs are defensive, streams stay separate and no REPLACED status/event is fabricated", () => {
  const raw = runPython("working");
  assert.equal(raw.kind, "SUCCESS");
  if (raw.kind !== "SUCCESS") return;
  const result = link(raw);
  const originalCanonical = adapt(raw.original, []);
  const replacementCanonical = adapt(raw.replacement, []);
  assert.notEqual(originalCanonical.eventStream, replacementCanonical.eventStream);
  assert.equal(originalCanonical.eventStream.events.some((record) => ["ORDER_REPLACED", "REPLACE_REQUESTED"].includes(record.event.eventType)), false);
  assert.equal(replacementCanonical.eventStream.events.some((record) => ["ORDER_REPLACED", "REPLACE_REQUESTED"].includes(record.event.eventType)), false);
  const mutable = result.original.relationships as Array<{ canonicalOrderId: string }>;
  mutable[0]!.canonicalOrderId = "tampered";
  assert.equal(result.replacement.relationships[0]!.canonicalOrderId, "n76-original");
  assert.equal(result.original.status === ("REPLACED" as never), false);
});

test("working and partial replacement outputs are deterministic on fresh runtimes", () => {
  const workingA = runPython("working");
  const workingB = runPython("working");
  const partialA = runPython("partial");
  const partialB = runPython("partial");
  assert.deepEqual(workingA, workingB);
  assert.deepEqual(partialA, partialB);
});
