import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperChartOrderBar } from "./PaperChartOrderBar";
import { getCanonicalProtectiveOrders, isWorkingPaperLimitOrder, toWorkingPaperChartOrders } from "./paperTradeOverlayHelpers";
import type { PaperOrderSnapshot } from "../execution/executionTypes";
for (const kind of ["STOP_LOSS", "TAKE_PROFIT"] as const) {
  test(`${kind} has one canonical bar, no generic limit projection or backend badge`, () => {
    const order: PaperOrderSnapshot = { id: "client-order", symbol: "BTCUSDT-PERP", side: "short", type: kind === "STOP_LOSS" ? "market" : "limit", price: 100, triggerPrice: 100, protectionType: kind, size: 0.001, sizeUnit: "BTC", leverage: 1, marginMode: "isolated", status: "ACCEPTED", createdAt: "" };
    assert.equal(isWorkingPaperLimitOrder(order), false);
    assert.equal(getCanonicalProtectiveOrders([order, order])[kind].length, 1);
    const model = toWorkingPaperChartOrders([order])[0];
    const html = renderToStaticMarkup(React.createElement(PaperChartOrderBar, { model, y: 50, chartWidth: 800, chartHeight: 400, onPointerDown: () => {}, onCancel: () => {} }));
    assert.equal((html.match(/data-chart-order-label="client-order"/g) ?? []).length, 1);
    assert.equal((html.match(/role="slider"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /PAPER|NAUTILUS|BINANCE|BINGX|background-color/);
    assert.match(html, /0.001000 BTC/);
    assert.equal(model.clientOrderId, order.id);
    for (const status of ["FILLED", "CANCELED", "EXPIRED", "REJECTED"]) {
      assert.equal(getCanonicalProtectiveOrders([{ ...order, status }])[kind].length, 0);
      assert.equal(toWorkingPaperChartOrders([{ ...order, status }]).length, 0);
    }
  });
}

test("native protective primitives stay unique and terminal cleanup survives two refreshes", async () => {
  const { reconcileProtectivePriceLines } = await import("./protectivePriceLines");
  const active = new Set<unknown>();
  const series = { createPriceLine: (options: unknown) => { const line = { options, applyOptions(next: unknown) { this.options = next; } }; active.add(line); return line as never; }, removePriceLine: (line: unknown) => { assert.ok(active.delete(line)); } };
  const refs = new Map();
  const specs = new Map([ ["SL:client-sl", { price: 100, title: "SL", color: "#f59e0b" }], ["TP:client-tp", { price: 110, title: "TP", color: "#34d399" }] ]);
  reconcileProtectivePriceLines(series, refs, specs, 2);
  const original = refs.get("TP:client-tp");
  specs.get("TP:client-tp")!.price = 115;
  reconcileProtectivePriceLines(series, refs, specs, 2);
  assert.equal(refs.get("TP:client-tp"), original, "drag updates the existing primitive");
  assert.equal(active.size, 2);
  assert.equal(refs.size, 2);
  reconcileProtectivePriceLines(series, refs, new Map(), 2);
  reconcileProtectivePriceLines(series, refs, new Map(), 2);
  assert.equal(active.size, 0);
  assert.equal(refs.size, 0);
});

test("protective label displays NET instead of BTC price and is absent beyond viewport", () => {
  const model = { id: "p", clientOrderId: "p", kind: "STOP_LOSS" as const, price: 77200, side: "long" as const, quantity: 0.001, draggable: true, cancelable: true, source: { size: 0.001, sizeUnit: "BTC" } as PaperOrderSnapshot };
  const props = { model, y: 50, chartWidth: 800, chartHeight: 400, projectedNet: -0.123, projectedNetPct: -0.0615, onCancel: () => {} };
  const html = renderToStaticMarkup(React.createElement(PaperChartOrderBar, props));
  assert.match(html, /-0\.061% NET/);
  assert.doesNotMatch(html, /77,200/);
  for (const y of [-20, 420]) assert.equal(renderToStaticMarkup(React.createElement(PaperChartOrderBar, { ...props, y })), "");
});
