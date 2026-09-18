import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  NautilusSimulationCommandError,
  nautilusSimulation,
  type NautilusSimulationInstrumentWire,
  type NautilusSimulationOrderIntentWire,
  type NautilusSimulationOrderStateWire,
} from "./nautilusSimulationBridge";

function enableTauriRuntime() {
  (globalThis as { window: unknown }).window = { __TAURI__: {}, __TAURI_INTERNALS__: {} };
}

const instrument: NautilusSimulationInstrumentWire = {
  venue: "SIM",
  marketType: "perpetual",
  symbol: "BTCUSDT-PERP",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  exchangeNativeSymbol: "BTCUSDT",
};

const intent = {
  clientOrderId: "empty-evidence-order",
  instrument,
  side: "BUY",
  orderType: "LIMIT",
  quantity: "0.123456789",
  price: "123456.12345678",
  timeInForce: "GTC",
  reduceOnly: false,
  postOnly: false,
} as NautilusSimulationOrderIntentWire;

const order = {
  clientOrderId: "empty-evidence-order",
  venueOrderId: "SIM-EMPTY-1",
  instrument,
  side: "BUY",
  orderType: "LIMIT",
  quantity: "0.123456789",
  filledQuantity: "0",
  remainingQuantity: "0.123456789",
  status: "ACCEPTED",
  timestamps: { createdAt: 1, updatedAt: 2 },
} as NautilusSimulationOrderStateWire;

async function assertEmptyEvidence(
  operation: () => Promise<unknown>,
  nativeCommand: string,
): Promise<void> {
  const calls: string[] = [];
  mockIPC((command) => {
    calls.push(command);
    if (command === nativeCommand) {
      if (command === "nautilus_simulation_replace_order") {
        return { operation: "CANCEL_REPLACE", originalOrder: order, replacementOrder: order };
      }
      return order;
    }
    if (command === "nautilus_simulation_list_order_events") return [];
    assert.fail(`unexpected native command: ${command}`);
  });
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof NautilusSimulationCommandError);
    assert.equal(error.code, "NAUTILUS_EVIDENCE_EMPTY_AFTER_MUTATION");
    assert.match(error.message, /simulationMutation=SUCCEEDED/);
    assert.match(error.message, /localEvidenceDurability=NOT_COMMITTED/);
    return true;
  });
  assert.deepEqual(calls, [nativeCommand, "nautilus_simulation_list_order_events"]);
}

test("all factual mutation paths fail closed when native success yields empty evidence", async () => {
  enableTauriRuntime();
  try {
    await assertEmptyEvidence(
      () => nautilusSimulation.submitOrder(intent),
      "nautilus_simulation_submit_order",
    );
    clearMocks();
    await assertEmptyEvidence(
      () => nautilusSimulation.closePosition(instrument, "0.123456789"),
      "nautilus_simulation_close_position",
    );
    clearMocks();
    await assertEmptyEvidence(
      () => nautilusSimulation.cancelOrder(intent.clientOrderId),
      "nautilus_simulation_cancel_order",
    );
    clearMocks();
    await assertEmptyEvidence(
      () => nautilusSimulation.replaceOrder(intent.clientOrderId, "replacement-empty", "123456.12345678"),
      "nautilus_simulation_replace_order",
    );
  } finally {
    clearMocks();
    delete (globalThis as { window?: unknown }).window;
  }
});
