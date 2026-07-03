/**
 * Phase B1 — BingX normalization unit tests (fixtures only, no HTTP).
 * Run: npm run test:bingx-normalize
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountDataQuality,
  buildPositionId,
  classifyOrderStatus,
  deriveConnectionState,
  filterDisplayOpenOrders,
  mapOpenOrderRow,
  mapPositionRow,
  parseFinancialNumber,
  SNAPSHOT_STALE_MS,
} from "./bingxNormalize";

test("balance — valid numeric string", () => {
  const r = parseFinancialNumber("123.45");
  assert.equal(r.valid, true);
  assert.equal(r.value, 123.45);
});

test("balance — real zero", () => {
  const r = parseFinancialNumber("0");
  assert.equal(r.valid, true);
  assert.equal(r.value, 0);
});

test("balance — empty field", () => {
  const r = parseFinancialNumber("");
  assert.equal(r.present, false);
  assert.equal(r.valid, false);
});

test("balance — NaN string", () => {
  const r = parseFinancialNumber("not-a-number");
  assert.equal(r.present, true);
  assert.equal(r.valid, false);
});

test("balance — missing field", () => {
  const r = parseFinancialNumber(undefined);
  assert.equal(r.present, false);
  assert.equal(r.valid, false);
});

test("balance — negative PnL preserved", () => {
  const r = parseFinancialNumber("-12.5");
  assert.equal(r.valid, true);
  assert.equal(r.value, -12.5);
});

test("balance — partial data quality", () => {
  const q = buildAccountDataQuality({ equity: 100, balance: undefined });
  assert.equal(q.status, "partial");
  assert.ok(q.missingFields.includes("balanceUsdt"));
});

test("orders — WORKING is open", () => {
  assert.equal(classifyOrderStatus("WORKING").lifecycle, "open");
});

test("orders — ACTIVE is open", () => {
  assert.equal(classifyOrderStatus("ACTIVE").lifecycle, "open");
});

test("orders — PENDING is open", () => {
  assert.equal(classifyOrderStatus("PENDING").lifecycle, "open");
});

test("orders — NEW is open", () => {
  assert.equal(classifyOrderStatus("NEW").lifecycle, "open");
});

test("orders — PARTIALLY_FILLED is open", () => {
  assert.equal(classifyOrderStatus("PARTIALLY_FILLED").lifecycle, "open");
});

test("orders — FILLED is terminal", () => {
  assert.equal(classifyOrderStatus("FILLED").lifecycle, "terminal");
});

test("orders — CANCELED is terminal", () => {
  assert.equal(classifyOrderStatus("CANCELED").lifecycle, "terminal");
});

test("orders — CANCELLED is terminal", () => {
  assert.equal(classifyOrderStatus("CANCELLED").lifecycle, "terminal");
});

test("orders — REJECTED is terminal", () => {
  assert.equal(classifyOrderStatus("REJECTED").lifecycle, "terminal");
});

test("orders — EXPIRED is terminal", () => {
  assert.equal(classifyOrderStatus("EXPIRED").lifecycle, "terminal");
});

test("orders — unknown status is not open", () => {
  const c = classifyOrderStatus("MYSTERY_STATUS");
  assert.equal(c.lifecycle, "unknown");
  assert.equal(c.status, "unknown");
});

test("orders — terminal rows filtered from open list", () => {
  const rows = [
    mapOpenOrderRow({ orderId: "1", symbol: "BTC-USDT", side: "BUY", type: "LIMIT", status: "WORKING" }),
    mapOpenOrderRow({ orderId: "2", symbol: "BTC-USDT", side: "BUY", type: "LIMIT", status: "FILLED" }),
    mapOpenOrderRow({ orderId: "3", symbol: "BTC-USDT", side: "BUY", type: "LIMIT", status: "WEIRD" }),
  ].filter(Boolean);
  const { openOrders, unknownOrders, terminalFilteredCount } = filterDisplayOpenOrders(rows as NonNullable<(typeof rows)[0]>[]);
  assert.equal(openOrders.length, 1);
  assert.equal(unknownOrders.length, 1);
  assert.equal(terminalFilteredCount, 1);
});

test("positions — one-way LONG", () => {
  const p = mapPositionRow({
    symbol: "BTC-USDT",
    positionAmt: "0.01",
    positionSide: "LONG",
    avgPrice: "50000",
    markPrice: "50100",
    unrealizedProfit: "1.5",
    marginMode: "cross",
  });
  assert.ok(p);
  assert.equal(p!.side, "long");
  assert.equal(p!.quantity, 0.01);
});

test("positions — one-way SHORT via negative amt", () => {
  const p = mapPositionRow({
    symbol: "ETH-USDT",
    positionAmt: "-2",
    avgPrice: "3000",
  });
  assert.ok(p);
  assert.equal(p!.side, "short");
});

test("positions — hedge LONG and SHORT without key collision", () => {
  const long = mapPositionRow({
    symbol: "BTC-USDT",
    positionAmt: "1",
    positionSide: "LONG",
    marginMode: "cross",
  });
  const short = mapPositionRow({
    symbol: "BTC-USDT",
    positionAmt: "1",
    positionSide: "SHORT",
    marginMode: "cross",
  });
  assert.ok(long && short);
  assert.notEqual(long!.id, short!.id);
});

test("positions — zero quantity filtered", () => {
  const p = mapPositionRow({ symbol: "BTC-USDT", positionAmt: "0" });
  assert.equal(p, null);
});

test("positions — missing liquidation price allowed", () => {
  const p = mapPositionRow({ symbol: "BTC-USDT", positionAmt: "1", positionSide: "LONG" });
  assert.ok(p);
  assert.equal(p!.liquidationPrice, undefined);
});

test("positions — cross and isolated margin modes", () => {
  const cross = mapPositionRow({ symbol: "BTC-USDT", positionAmt: "1", marginMode: "CROSSED" });
  const iso = mapPositionRow({ symbol: "BTC-USDT", positionAmt: "1", isolated: true });
  assert.equal(cross!.marginMode, "cross");
  assert.equal(iso!.marginMode, "isolated");
});

test("positions — negative PnL", () => {
  const p = mapPositionRow({
    symbol: "BTC-USDT",
    positionAmt: "1",
    unrealizedProfit: "-3.25",
  });
  assert.equal(p!.unrealizedPnlUsdt, -3.25);
});

test("positions — stable id uses exchange id when present", () => {
  const id = buildPositionId({
    symbol: "BTC-USDT",
    positionSide: "LONG",
    side: "long",
    exchangePositionId: "pos-123",
  });
  assert.equal(id, "bingx:pos-123");
});

test("snapshot — balance ok + degraded health", () => {
  const state = deriveConnectionState({
    connected: true,
    health: "degraded",
    lastSyncTime: Date.now(),
  });
  assert.equal(state, "DEGRADED");
});

test("snapshot — stale connection state", () => {
  const state = deriveConnectionState({
    connected: true,
    health: "healthy",
    lastSyncTime: Date.now() - SNAPSHOT_STALE_MS - 1000,
  });
  assert.equal(state, "STALE");
});
