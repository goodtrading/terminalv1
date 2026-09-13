import assert from "node:assert/strict";
import test from "node:test";
import type { PaperFillSnapshot } from "../execution/executionTypes";
import { mapPaperFillsToChartMarkers } from "./paperFillChartMarkers";

function fill(overrides: Partial<PaperFillSnapshot> = {}): PaperFillSnapshot {
  return {
    fillId: "fill-1",
    clientOrderId: "order-1",
    venueOrderId: "SIM-1",
    instrument: "BTCUSDT-PERP",
    venue: "SIM",
    marketType: "perpetual",
    side: "buy",
    price: 100,
    quantity: 0.001,
    timestamp: "2026-09-11T17:23:03.065Z",
    fee: 0.01,
    feeAsset: "USDT",
    liquidity: "TAKER",
    ...overrides,
  };
}

test("maps BUY and SELL fills to compact directional markers", () => {
  const [buy, sell] = mapPaperFillsToChartMarkers([
    fill(),
    fill({ fillId: "fill-2", side: "sell", quantity: 0.002 }),
  ]);

  assert.deepEqual(buy, {
    id: "fill-1",
    time: 1789147383,
    position: "belowBar",
    shape: "arrowUp",
    color: "#22c55e",
    text: "BUY 0.001",
    price: 100,
    side: "buy",
    quantity: 0.001,
    timestampMs: 1789147383065,
    fee: 0.01,
    liquidity: "TAKER",
  });
  assert.equal(sell.id, "fill-2");
  assert.equal(sell.position, "aboveBar");
  assert.equal(sell.shape, "arrowDown");
  assert.equal(sell.text, "SELL 0.002");
});

test("converts canonical fill epoch milliseconds to chart seconds", () => {
  const [marker] = mapPaperFillsToChartMarkers([fill({ timestamp: "2026-09-11T17:23:03.999Z" })]);
  assert.equal(marker.timestampMs, 1789147383999);
  assert.equal(marker.time, 1789147383);
});

test("deduplicates repeated snapshots by fillId without collapsing distinct fills", () => {
  const first = fill();
  const markers = mapPaperFillsToChartMarkers([
    first,
    { ...first },
    fill({ fillId: "fill-2", clientOrderId: first.clientOrderId }),
  ]);

  assert.deepEqual(markers.map((marker) => marker.id), ["fill-1", "fill-2"]);
});

test("maps empty fills to no markers", () => {
  assert.deepEqual(mapPaperFillsToChartMarkers([]), []);
});
