import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { nautilusSimulation } from "./nautilusSimulationBridge";

const instrument = { venue: "SIM", marketType: "perpetual" as const, symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT" };
const order = { clientOrderId: "close-1", instrument, side: "SELL", orderType: "MARKET", quantity: "0.5", filledQuantity: "0.5", remainingQuantity: "0", status: "FILLED", timestamps: {} };

test("canonical closePosition invokes native MARKET close with optional exact quantity", async () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = { __TAURI__: {}, __TAURI_INTERNALS__: {} };
  try {
    const calls: unknown[] = [];
    mockIPC((command, payload) => {
      calls.push({ command, payload });
      if (command === "nautilus_simulation_list_order_events") return [];
      return order;
    });
    await assert.rejects(
      () => nautilusSimulation.closePosition(instrument, "0.5"),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "NAUTILUS_EVIDENCE_EMPTY_AFTER_MUTATION");
        return true;
      },
    );
    assert.deepEqual(calls, [
      { command: "nautilus_simulation_close_position", payload: { instrument, quantity: "0.5" } },
      { command: "nautilus_simulation_list_order_events", payload: {} },
    ]);
  } finally {
    clearMocks();
    if (hadWindow) (globalThis as { window?: unknown }).window = originalWindow;
    else delete (globalThis as { window?: unknown }).window;
  }
});
