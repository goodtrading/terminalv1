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
      return order;
    });
    const result = await nautilusSimulation.closePosition(instrument, "0.5");
    assert.equal(result.quantity, "0.5");
    assert.deepEqual(calls, [{ command: "nautilus_simulation_close_position", payload: { instrument, quantity: "0.5" } }]);
  } finally {
    clearMocks();
    if (hadWindow) (globalThis as { window?: unknown }).window = originalWindow;
    else delete (globalThis as { window?: unknown }).window;
  }
});
