import assert from "node:assert/strict";
import test from "node:test";

import { getCanonicalProtectiveOrders, isWorkingPaperLimitOrder, mapApiPaperPosition, mapPaperChartOverlay, toWorkingPaperChartOrders, validateProtectiveDrag } from "./paperTradeOverlayHelpers";

const base = {
  type: "limit",
  price: 76500,
};

function paperOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1", symbol: "BTCUSDT-PERP", side: "long" as const, type: "limit" as const,
    price: 76500, size: 1, sizeUnit: "BTC" as const, leverage: 1, marginMode: "isolated" as const,
    status: "ACCEPTED", createdAt: new Date(0).toISOString(), ...overrides,
  };
}

test("position projection preserves unavailable quantity and uPnL as unavailable", () => {
  const raw = {
    symbol: "BTCUSDT-PERP",
    side: "long" as const,
    quantity: 0,
    entryPrice: 100,
    markPrice: null,
    leverage: null,
    marginMode: "unknown" as const,
  };
  assert.equal(mapApiPaperPosition(raw), null);
  const mapped = mapPaperChartOverlay({ ...raw, quantity: 1 }, undefined);
  assert.equal(mapped?.unrealizedPnlUsdt, undefined);
});

test("working protective orders project to interactive canonical kinds", () => {
  const result = toWorkingPaperChartOrders([
    paperOrder({ protectionType: "STOP_LOSS", type: "market", price: null, triggerPrice: 76000 }),
    paperOrder({ id: "client-2", protectionType: "TAKE_PROFIT", price: 77000 }),
    paperOrder({ id: "client-3" }),
  ]);
  assert.deepEqual(result.map(({ kind, clientOrderId, price, draggable, cancelable }) => ({ kind, clientOrderId, price, draggable, cancelable })), [
    { kind: "STOP_LOSS", clientOrderId: "client-1", price: 76000, draggable: true, cancelable: true },
    { kind: "TAKE_PROFIT", clientOrderId: "client-2", price: 77000, draggable: true, cancelable: true },
    { kind: "LIMIT", clientOrderId: "client-3", price: 76500, draggable: false, cancelable: true },
  ]);
});

test("terminal and empty-partial orders never project", () => {
  assert.equal(toWorkingPaperChartOrders([
    paperOrder({ status: "CANCELED" }),
    paperOrder({ id: "filled", status: "FILLED" }),
    paperOrder({ id: "empty", status: "PARTIALLY_FILLED", remainingQuantity: "0" }),
  ]).length, 0);
});

test("canonical resting LIMIT statuses are working", () => {
  for (const status of ["CREATED", "SUBMITTED", "ACCEPTED", "CANCEL_PENDING"]) {
    assert.equal(isWorkingPaperLimitOrder({ ...base, status }), true, status);
  }
});

test("canonical ACCEPTED LIMIT remains visible when only orderType is uppercase", () => {
  assert.equal(isWorkingPaperLimitOrder({
    ...base,
    price: null,
    limitPrice: 76500,
    type: "LIMIT",
    orderType: "LIMIT",
    status: "ACCEPTED",
  }), true);
});

test("partially filled LIMIT remains working only with remaining quantity", () => {
  assert.equal(
    isWorkingPaperLimitOrder({ ...base, status: "PARTIALLY_FILLED", remainingQuantity: "0.001" }),
    true,
  );
  assert.equal(
    isWorkingPaperLimitOrder({ ...base, status: "PARTIALLY_FILLED", remainingQuantity: "0" }),
    false,
  );
});

test("terminal LIMIT statuses are not working", () => {
  for (const status of ["FILLED", "CANCELED", "REJECTED", "EXPIRED"]) {
    assert.equal(isWorkingPaperLimitOrder({ ...base, status }), false, status);
  }
});

test("legacy open LIMIT remains supported", () => {
  assert.equal(isWorkingPaperLimitOrder({ ...base, status: "open" }), true);
});

test("non-LIMIT and invalid prices are not working", () => {
  assert.equal(isWorkingPaperLimitOrder({ ...base, type: "market", status: "ACCEPTED" }), false);
  assert.equal(isWorkingPaperLimitOrder({ ...base, price: 0, status: "ACCEPTED" }), false);
  assert.equal(isWorkingPaperLimitOrder({ ...base, price: null, status: "ACCEPTED" }), false);
});

test("protective selection requires explicit canonical protectionType", () => {
  const baseOrder = {
    id: "x", symbol: "BTCUSDT", side: "sell" as const, type: "limit" as const,
    price: 101, size: 1, sizeUnit: "BTC" as const, leverage: 1,
    marginMode: "cross" as const, status: "ACCEPTED", createdAt: "now",
  };
  const selected = getCanonicalProtectiveOrders([
    baseOrder,
    { ...baseOrder, id: "sl", orderType: "STOP_MARKET", triggerPrice: 99, protectionType: "STOP_LOSS" },
    { ...baseOrder, id: "tp", protectionType: "TAKE_PROFIT" },
    { ...baseOrder, id: "cancelled", protectionType: "STOP_LOSS", status: "CANCELED" },
  ]);
  assert.deepEqual(selected.STOP_LOSS.map((o) => o.id), ["sl"]);
  assert.deepEqual(selected.TAKE_PROFIT.map((o) => o.id), ["tp"]);
});

test("protective drag validates both sides against the reference price", () => {
  assert.equal(validateProtectiveDrag("long", "STOP_LOSS", 99, 100), null);
  assert.notEqual(validateProtectiveDrag("long", "STOP_LOSS", 101, 100), null);
  assert.equal(validateProtectiveDrag("long", "TAKE_PROFIT", 101, 100), null);
  assert.notEqual(validateProtectiveDrag("long", "TAKE_PROFIT", 99, 100), null);
  assert.equal(validateProtectiveDrag("short", "STOP_LOSS", 101, 100), null);
  assert.notEqual(validateProtectiveDrag("short", "STOP_LOSS", 99, 100), null);
  assert.equal(validateProtectiveDrag("short", "TAKE_PROFIT", 99, 100), null);
  assert.notEqual(validateProtectiveDrag("short", "TAKE_PROFIT", 101, 100), null);
});
