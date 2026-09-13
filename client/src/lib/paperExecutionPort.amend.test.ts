import assert from "node:assert/strict";
import test from "node:test";
import {
  paperExecutionPort,
  setPaperExecutionBackend,
  PaperExecutionPortError,
} from "./paperExecutionPort";

const instrument = {
  venue: "SIM",
  marketType: "perpetual" as const,
  symbol: "BTCUSDT-PERP",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  exchangeNativeSymbol: "BTCUSDT",
};

function order(status: string, remainingQuantity = "1") {
  return {
    clientOrderId: "orig-1",
    venueOrderId: "SIM-1",
    instrument,
    side: "BUY" as const,
    orderType: "LIMIT" as const,
    quantity: "1",
    filledQuantity: remainingQuantity === "1" ? "0" : "0.4",
    remainingQuantity,
    price: "100",
    status,
    timestamps: { createdAt: 1, updatedAt: 1 },
  };
}

function deps(current: ReturnType<typeof order>, replacement = order("ACCEPTED")) {
  const calls: string[] = [];
  const simulation = {
    listOrders: async () => { calls.push("list_orders"); return [current]; },
    replaceOrder: async (id: string, replacementId: string, price: string) => {
      calls.push(`replace:${id}:${replacementId}:${price}`);
      return {
        operation: "CANCEL_REPLACE" as const,
        originalOrder: { ...current, status: "CANCELED" as const },
        replacementOrder: { ...replacement, clientOrderId: replacementId, quantity: current.remainingQuantity, remainingQuantity: current.remainingQuantity, price },
      };
    },
  } as any;
  return { calls, deps: { runtime: { isDesktopApp: () => true }, simulation, clientOrderIdFactory: () => "replacement-1" } };
}

test("Nautilus accepted LIMIT amend uses cancel-replace and preserves identity fields", async () => {
  setPaperExecutionBackend("nautilus");
  const fixture = deps(order("ACCEPTED"));
  const result = await paperExecutionPort.amendOrder({ clientOrderId: "orig-1", limitPrice: 101 }, fixture.deps);
  assert.equal(result.operation, "CANCEL_REPLACE");
  assert.equal(result.originalOrder.id, "orig-1");
  assert.equal(result.replacementOrder.id, "replacement-1");
  assert.equal(result.replacementOrder.price, 101);
  assert.deepEqual(fixture.calls, ["list_orders", "replace:orig-1:replacement-1:101"]);
  setPaperExecutionBackend("legacy");
});

test("partially filled amend submits only remaining quantity", async () => {
  setPaperExecutionBackend("nautilus");
  const fixture = deps(order("PARTIALLY_FILLED", "0.6"));
  await paperExecutionPort.amendOrder({ clientOrderId: "orig-1", limitPrice: 99 }, fixture.deps);
  assert.deepEqual(fixture.calls, ["list_orders", "replace:orig-1:replacement-1:99"]);
  setPaperExecutionBackend("legacy");
});

test("terminal order is rejected locally and never canceled", async () => {
  setPaperExecutionBackend("nautilus");
  const fixture = deps(order("FILLED", "0"));
  await assert.rejects(
    paperExecutionPort.amendOrder({ clientOrderId: "orig-1", limitPrice: 101 }, fixture.deps),
    (error: unknown) => error instanceof PaperExecutionPortError && fixture.calls.length === 1,
  );
  setPaperExecutionBackend("legacy");
});

test("failed native replacement rejects without fake replacement state", async () => {
  setPaperExecutionBackend("nautilus");
  const fixture = deps(order("ACCEPTED"));
  fixture.deps.simulation.replaceOrder = async () => { throw new Error("native replace failed"); };
  await assert.rejects(
    paperExecutionPort.amendOrder({ clientOrderId: "orig-1", limitPrice: 101 }, fixture.deps),
    (error: unknown) => error instanceof PaperExecutionPortError && /cancel-replace was not confirmed/.test(error.message),
  );
  assert.deepEqual(fixture.calls, ["list_orders"]);
  setPaperExecutionBackend("legacy");
});
