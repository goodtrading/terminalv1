import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  NautilusSimulationCommandError,
  nautilusSimulation,
  type NautilusDiagnosticQuoteWire,
  type NautilusMarketSnapshotAppliedWire,
  type NautilusMarketSnapshotWire,
  type NautilusSimulationAccountWire,
  type NautilusSimulationLifecycleWire,
  type NautilusSimulationOrderIntentWire,
  type NautilusSimulationOrderStateWire,
  type NautilusSimulationPositionWire,
  type NautilusSimulationStatusWire,
  type NautilusQuoteCapabilityWire,
  type NautilusPaperOrderEventEvidenceWire,
} from "./nautilusSimulationBridge";

function enableTauriRuntime() {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = { __TAURI__: {}, __TAURI_INTERNALS__: {} };
  return () => {
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      clearMocks();
    }
    if (hadWindow) {
      (globalThis as { window?: unknown }).window = originalWindow;
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  };
}

function expectedLifecycle(state: NautilusSimulationLifecycleWire["state"], extras?: Partial<NautilusSimulationLifecycleWire>): NautilusSimulationLifecycleWire {
  return {
    state,
    started: state === "RUNNING",
    hasSimulation: state === "RUNNING",
    simulationProtocolVersion: 1,
    ...extras,
  };
}

test("simulation start requests authenticated capability and preserves quoteStream", async () => {
  const restore = enableTauriRuntime();
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const capability: NautilusQuoteCapabilityWire = {
    success: true,
    streamUrl: "wss://example.invalid/ws/nautilus/quotes",
    capabilityToken: "TEST_REDACTED_TOKEN",
    issuedAt: 1700000000000,
    expiresAt: 1700000060000,
    protocolVersion: 1,
    allowedInstrument: "BTCUSDT-PERP",
    allowedMarket: "perpetual",
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: () => "TEST_REDACTED_BEARER",
  } as Storage;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(capability), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    mockIPC((command, payload: unknown) => {
      assert.equal(command, "nautilus_simulation_start");
      assert.deepEqual(payload, { quoteStream: capability });
      return expectedLifecycle("RUNNING");
    });

    await nautilusSimulation.start();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/desktop/nautilus/quote-capability");
    assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer TEST_REDACTED_BEARER");
    assert.equal(calls[0].init?.credentials, "include");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
    restore();
  }
});

test("capability failure prevents simulation start and does not fall back", async () => {
  const restore = enableTauriRuntime();
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const invoked: string[] = [];
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: () => "TEST_REDACTED_BEARER",
  } as Storage;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
  try {
    mockIPC((command) => {
      invoked.push(command);
      return expectedLifecycle("RUNNING");
    });
    await assert.rejects(() => nautilusSimulation.start(), /quote stream capability/i);
    assert.deepEqual(invoked, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
    restore();
  }
});

test("simulation status accepts null bootstrap diagnostics", async () => {
  const restore = enableTauriRuntime();
  try {
    mockIPC(() => ({
      state: "RUNNING",
      started: true,
      hasSimulation: true,
      simulationProtocolVersion: 1,
      quoteStream: null,
      market: null,
    }));
    const status = await nautilusSimulation.status();
    assert.equal(status.quoteStream, undefined);
    assert.equal(status.market, undefined);
  } finally {
    restore();
  }
});

test("simulation lifecycle commands invoke exact Tauri commands with exact args", async () => {
  const restore = enableTauriRuntime();
  const originalFetch = globalThis.fetch;
  const capability: NautilusQuoteCapabilityWire = {
    success: true,
    streamUrl: "wss://example.invalid/ws/nautilus/quotes",
    capabilityToken: "TEST_REDACTED_TOKEN",
    issuedAt: 1700000000000,
    expiresAt: 1700000060000,
    protocolVersion: 1,
    allowedInstrument: "BTCUSDT-PERP",
    allowedMarket: "perpetual",
  };
  globalThis.fetch = async () => new Response(JSON.stringify(capability), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  try {
    const expected = [
      {
        command: "nautilus_simulation_status",
        payload: {},
        result: {
          state: "STOPPED",
          started: false,
          hasSimulation: false,
          simulationProtocolVersion: 1,
        } satisfies NautilusSimulationStatusWire,
      },
      {
        command: "nautilus_simulation_start",
        payload: { quoteStream: capability },
        result: expectedLifecycle("RUNNING", { alreadyRunning: false }),
      },
      {
        command: "nautilus_simulation_start",
        payload: { quoteStream: capability },
        result: expectedLifecycle("RUNNING", { alreadyRunning: true }),
      },
      {
        command: "nautilus_simulation_stop",
        payload: {},
        result: expectedLifecycle("STOPPED", { alreadyStopped: false }),
      },
      {
        command: "nautilus_simulation_reset",
        payload: {},
        result: expectedLifecycle("RUNNING", { reset: true }),
      },
    ] as const;

    mockIPC((command, payload: unknown) => {
      if (command === "nautilus_simulation_list_order_events") return [];
      const next = expected.shift();
      assert.ok(next, `unexpected invoke: ${command}`);
      assert.equal(command, next.command);
      assert.deepEqual(payload, next.payload);
      return next.result;
    });

    assert.deepEqual(await nautilusSimulation.status(), {
      state: "STOPPED",
      started: false,
      hasSimulation: false,
      simulationProtocolVersion: 1,
    });
    assert.deepEqual(await nautilusSimulation.start(), expectedLifecycle("RUNNING", { alreadyRunning: false }));
    assert.deepEqual(await nautilusSimulation.start(), expectedLifecycle("RUNNING", { alreadyRunning: true }));
    assert.deepEqual(await nautilusSimulation.stop(), expectedLifecycle("STOPPED", { alreadyStopped: false }));
    assert.deepEqual(await nautilusSimulation.reset(), expectedLifecycle("RUNNING", { reset: true }));
    assert.equal(expected.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("simulation order commands preserve exact wire shapes and decimal strings", async () => {
  const restore = enableTauriRuntime();
  try {
    const intent: NautilusSimulationOrderIntentWire = {
      clientOrderId: "gt-wire-1",
      instrument: {
        venue: "SIM",
        marketType: "perpetual",
        symbol: "BTCUSDT-PERP",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        exchangeNativeSymbol: "BTCUSDT",
      },
      side: "BUY",
      orderType: "LIMIT",
      quantity: "0.00000001",
      price: "99999.12345678",
      timeInForce: "GTC",
      reduceOnly: false,
      postOnly: false,
    };
    const quote: NautilusDiagnosticQuoteWire = {
      bid: "99999",
      ask: "100001",
      bidSize: "10",
      askSize: "10",
      timestamp: 123456789,
    };
    const marketSnapshot: NautilusMarketSnapshotWire = {
      source: {
        venue: "BINANCE",
        marketType: "perpetual",
        symbol: "BTCUSDT",
      },
      simulationInstrument: {
        venue: "SIM",
        marketType: "perpetual",
        symbol: "BTCUSDT-PERP",
      },
      bid: "99999.50",
      ask: "100000.00",
      bidSize: "12.3",
      askSize: "8.1",
      timestampMs: 123456789,
    };

    const lifecycle = expectedLifecycle("RUNNING");
    const order: NautilusSimulationOrderStateWire = {
      clientOrderId: intent.clientOrderId,
      venueOrderId: "SIM-1-001",
      instrument: intent.instrument,
      side: "BUY",
      orderType: "LIMIT",
      quantity: "0.00000001",
      filledQuantity: "0.00000001",
      remainingQuantity: "0",
      averageFillPrice: "100001.0",
      status: "FILLED",
      timestamps: {
        createdAt: 1,
        updatedAt: 2,
        acceptedAt: 2,
        firstFillAt: 3,
        lastFillAt: 3,
        completedAt: 4,
      },
    };
    const position: NautilusSimulationPositionWire = {
      instrument: intent.instrument,
      side: "LONG",
      quantity: "1",
      averageEntryPrice: "100001.0",
      markPrice: "100000",
      realizedPnl: "-50.0005",
      unrealizedPnl: "-1",
      feesTotal: "50.0005",
      openedAt: 1,
      updatedAt: 2,
    };
    const account: NautilusSimulationAccountWire = {
      accountId: "SIM-001",
      venue: "SIM",
      currency: "USDT",
      equity: "99949.9995",
      balance: "99949.9995",
      availableBalance: "99699.997",
      marginUsed: "250.0025",
      realizedPnl: "-50.0005",
      unrealizedPnl: "-1",
      feesTotal: "50.0005",
      timestamp: 5,
    };

    const evidence: NautilusPaperOrderEventEvidenceWire = {
      eventId: "evt-test-1",
      eventType: "OrderFilled",
      tsEventNs: "1700000000000000001",
      tsInitNs: "1700000000000000002",
      environment: "PAPER",
      source: "NAUTILUS_PAPER",
      quantity: "0.00000001",
      price: "100001.0",
      reduceOnly: false,
      reduceOnlySource: "EVENT_FACTUAL",
      tags: [],
      tagsSource: "EVENT_FACTUAL",
      linkedOrderIds: [],
    };

    const expected = [
      { command: "nautilus_simulation_submit_order", payload: { intent }, result: order },
      { command: "nautilus_simulation_cancel_order", payload: { clientOrderId: "gt-wire-1" }, result: order },
      { command: "nautilus_simulation_get_order", payload: { clientOrderId: "gt-wire-1" }, result: order },
      { command: "nautilus_simulation_get_position", payload: {}, result: position },
      { command: "nautilus_simulation_get_account", payload: {}, result: account },
      {
        command: "nautilus_simulation_inject_quote_diagnostic",
        payload: { quote },
        result: { diagnosticOnly: true, simulationProtocolVersion: 1, state: "RUNNING", quote },
      },
      {
        command: "nautilus_simulation_apply_market_snapshot",
        payload: { snapshot: marketSnapshot },
        result: {
          applied: true,
          sourceVenue: "BINANCE",
          sourceMarketType: "perpetual",
          sourceSymbol: "BTCUSDT",
          simulationVenue: "SIM",
          simulationMarketType: "perpetual",
          simulationSymbol: "BTCUSDT-PERP",
          timestampMs: 123456789,
          controlPlane: "PRODUCTION_LOW_RATE_CONTROL_SNAPSHOT",
        } satisfies NautilusMarketSnapshotAppliedWire,
      },
    ] as const;

    mockIPC((command, payload: unknown) => {
      if (command === "nautilus_simulation_list_order_events") return [evidence];
      if (command === "enqueue_nautilus_evidence_outbox") return { insertedCount: 1, duplicateCount: 0, pendingCount: 1 };
      if (command === "list_nautilus_evidence_outbox") return [];
      if (command === "ack_nautilus_evidence_outbox" || command === "mark_nautilus_evidence_outbox_failure") return undefined;
      const next = expected.shift();
      assert.ok(next, `unexpected invoke: ${command}`);
      assert.equal(command, next.command);
      assert.deepEqual(payload, next.payload);
      return next.result;
    });

    assert.deepEqual(await nautilusSimulation.submitOrder(intent), order);
    assert.deepEqual(await nautilusSimulation.cancelOrder("gt-wire-1"), order);
    assert.deepEqual(await nautilusSimulation.getOrder("gt-wire-1"), order);
    assert.deepEqual(await nautilusSimulation.getPosition(), position);
    assert.deepEqual(await nautilusSimulation.getAccount(), account);
    assert.deepEqual(await nautilusSimulation.injectQuoteDiagnostic(quote), {
      diagnosticOnly: true,
      simulationProtocolVersion: 1,
      state: "RUNNING",
      quote,
    });
    assert.deepEqual(await nautilusSimulation.applyMarketSnapshot(marketSnapshot), {
      applied: true,
      sourceVenue: "BINANCE",
      sourceMarketType: "perpetual",
      sourceSymbol: "BTCUSDT",
      simulationVenue: "SIM",
      simulationMarketType: "perpetual",
      simulationSymbol: "BTCUSDT-PERP",
      timestampMs: 123456789,
      controlPlane: "PRODUCTION_LOW_RATE_CONTROL_SNAPSHOT",
    });
    assert.equal(expected.length, 0);
  } finally {
    restore();
  }
});

test("simulation command errors preserve structure and malformed rejections normalize", async () => {
  const restore = enableTauriRuntime();
  try {
    const structured = {
      category: "SIMULATION",
      code: "order_not_found",
      message: "unknown order id: missing",
      details: { clientOrderId: "missing" },
    };
    const malformed = "boom";
    const expected = [
      { command: "nautilus_simulation_get_order", payload: { clientOrderId: "missing" }, reject: structured },
      { command: "nautilus_simulation_get_position", payload: undefined, reject: malformed },
    ] as const;

    mockIPC((command, payload: unknown) => {
      if (command === "nautilus_simulation_list_order_events") return [];
      const next = expected.shift();
      assert.ok(next, `unexpected invoke: ${command}`);
      assert.equal(command, next.command);
      assert.deepEqual(payload, next.payload);
      throw next.reject;
    });

    await assert.rejects(
      () => nautilusSimulation.getOrder("missing"),
      (error: unknown) => {
        assert.ok(error instanceof NautilusSimulationCommandError);
        assert.equal(error.category, "SIMULATION");
        assert.equal(error.code, "order_not_found");
        assert.equal(error.message, "unknown order id: missing");
        assert.deepEqual(error.details, { clientOrderId: "missing" });
        return true;
      },
    );

    await assert.rejects(
      () => nautilusSimulation.getPosition(),
      (error: unknown) => {
        assert.ok(error instanceof NautilusSimulationCommandError);
        assert.equal(error.category, "TRANSPORT");
        assert.equal(error.code, "native_unavailable");
        assert.match(error.message, /native|tauri/i);
        return true;
      },
    );

    assert.equal(expected.length, 0);
  } finally {
    restore();
  }
});

test("simulation commands reject outside Tauri without invoking native IPC", async () => {
  delete (globalThis as { window?: unknown }).window;

  await assert.rejects(
    () => nautilusSimulation.status(),
    (error: unknown) => {
      assert.ok(error instanceof NautilusSimulationCommandError);
      assert.equal(error.category, "TRANSPORT");
      assert.equal(error.code, "native_unavailable");
      return true;
    },
  );
});
