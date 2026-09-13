import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../components/terminal/execution/executionContext";
import {
  createNautilusPaperMarketAdapter,
  NautilusPaperMarketAdapterError,
  type NautilusPaperBackendState,
} from "./nautilusPaperMarketAdapter";
import type {
  NautilusEngineBridge,
  NautilusEngineStatusWire,
} from "./nautilusEngineBridge";
import type {
  NautilusSimulationAccountWire,
  NautilusSimulationPositionWire,
  NautilusSimulationStatusWire,
} from "./nautilusSimulationBridge";

function approvedSnapshot(timestampMs = 1_000) {
  return {
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
    timestampMs,
    freshness: {
      ageMs: 1000,
      staleAfterMs: 3000,
      stale: false,
    },
  } as const;
}

function makeReadyBackendState(): NautilusPaperBackendState {
  return {
    backend: "nautilus",
    availability: "AVAILABLE",
    engine: "RUNNING",
    simulation: "RUNNING",
  };
}

function makeEngine(statusState: NautilusEngineStatusWire["state"] = "HEALTHY"): {
  engine: NautilusEngineBridge;
  calls: string[];
} {
  const calls: string[] = [];
  const status: NautilusEngineStatusWire = {
    state: statusState,
    pid: 1234,
    service: "nautilus-daemon",
    protocolVersion: 1,
    nautilusVersion: "1.231.0",
    pythonVersion: "3.12.10",
  };
  return {
    calls,
    engine: {
      status: async () => {
        calls.push("engine.status");
        return status;
      },
      start: async () => {
        calls.push("engine.start");
        return status;
      },
      ping: async () => {
        calls.push("engine.ping");
        return { pong: true };
      },
      version: async () => {
        calls.push("engine.version");
        return {
          protocolVersion: 1,
          nautilusVersion: "1.231.0",
          pythonVersion: "3.12.10",
          pid: 1234,
        };
      },
      stop: async () => {
        calls.push("engine.stop");
        return { ...status, state: "STOPPED" };
      },
    },
  };
}

function makeSimulation(params?: {
  orderStatus?: "FILLED" | "ACCEPTED";
  position?: NautilusSimulationPositionWire;
  account?: NautilusSimulationAccountWire;
  status?: NautilusSimulationStatusWire["state"];
}) {
  const calls: string[] = [];
  const state = params?.status ?? "RUNNING";
  const orderStatus = params?.orderStatus ?? "FILLED";
  const position: NautilusSimulationPositionWire = params?.position ?? {
    instrument: {
      venue: "SIM",
      marketType: "perpetual",
      symbol: "BTCUSDT-PERP",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      exchangeNativeSymbol: "BTCUSDT",
    },
    side: "FLAT",
    quantity: "0",
    realizedPnl: "0",
    unrealizedPnl: "0",
    updatedAt: 1_234,
  };
  const account: NautilusSimulationAccountWire = params?.account ?? {
    accountId: "SIM-001",
    venue: "SIM",
    currency: "USDT",
    equity: "1000",
    balance: "1000",
    availableBalance: "1000",
    realizedPnl: "0",
    unrealizedPnl: "0",
    timestamp: 1_234,
  };
  return {
    calls,
    simulation: {
      status: async () => {
        calls.push("simulation.status");
        return { state } as NautilusSimulationStatusWire;
      },
      start: async () => {
        calls.push("simulation.start");
        return { state };
      },
      stop: async () => {
        calls.push("simulation.stop");
        return { state: "STOPPED" as const };
      },
      reset: async () => {
        calls.push("simulation.reset");
        return { state: "RUNNING" as const };
      },
      applyMarketSnapshot: async (snapshot: unknown) => {
        calls.push("simulation.applyMarketSnapshot");
        return {
          applied: true,
          sourceVenue: (snapshot as { source?: { venue?: string } }).source?.venue ?? "BINANCE",
          sourceMarketType: (snapshot as { source?: { marketType?: string } }).source?.marketType ?? "perpetual",
          sourceSymbol: (snapshot as { source?: { symbol?: string } }).source?.symbol ?? "BTCUSDT",
          simulationVenue: "SIM",
          simulationMarketType: "perpetual",
          simulationSymbol: "BTCUSDT-PERP",
          timestampMs: (snapshot as { timestampMs?: number }).timestampMs ?? 1_000,
        };
      },
      submitOrder: async (intent: unknown) => {
        calls.push("simulation.submitOrder");
        const orderIntent = intent as { clientOrderId?: string; side?: string; quantity?: string };
        return {
          clientOrderId: orderIntent.clientOrderId ?? "gt-paper-test",
          instrument: {
            venue: "SIM",
            marketType: "perpetual",
            symbol: "BTCUSDT-PERP",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            exchangeNativeSymbol: "BTCUSDT",
          },
          side: (orderIntent.side ?? "BUY") as "BUY" | "SELL",
          orderType: "MARKET" as const,
          quantity: orderIntent.quantity ?? "1",
          filledQuantity: orderStatus === "FILLED" ? (orderIntent.quantity ?? "1") : "0",
          remainingQuantity: orderStatus === "FILLED" ? "0" : (orderIntent.quantity ?? "1"),
          status: orderStatus,
          timestamps: { createdAt: 1_000, updatedAt: 1_000 },
          averageFillPrice: orderStatus === "FILLED" ? "100000.00" : undefined,
        };
      },
      getPosition: async () => {
        calls.push("simulation.getPosition");
        return position;
      },
      getAccount: async () => {
        calls.push("simulation.getAccount");
        return account;
      },
    },
  };
}

test("nautilus paper market adapter executes MARKET buy with explicit proxy pricing context", async () => {
  const engine = makeEngine();
  const simulation = makeSimulation();
  const nowMs = (() => {
    const values = [1_500, 1_600, 1_700];
    return () => values.shift() ?? 1_700;
  })();
  const fetchCalls: Array<unknown> = [];
  const adapter = createNautilusPaperMarketAdapter({
    engine: engine.engine,
    simulation: simulation.simulation,
    nowMs,
    fetch: async (...args: unknown[]) => {
      fetchCalls.push(args);
      return new Response(JSON.stringify({ ok: true }));
    },
    snapshotProvider: {
      getSnapshot: async () => approvedSnapshot(1_000),
    },
  });

  const result = await adapter.submitMarketOrder(makeReadyBackendState(), {
    clientOrderId: "gt-paper-fixed-1",
    executionContext: DEFAULT_TERMINAL_EXECUTION_CONTEXT,
    side: "BUY",
    quantity: "1",
    reduceOnly: false,
  });

  assert.equal(result.backend, "nautilus");
  assert.equal(result.order.clientOrderId, "gt-paper-fixed-1");
  assert.equal(result.order.status, "FILLED");
  assert.equal(result.order.averageFillPrice, "100000.00");
  assert.equal(result.position.side, "FLAT");
  assert.equal(result.account.accountId, "SIM-001");
  assert.deepEqual(result.pricingContext, {
    mode: "PROXY_BBO_SNAPSHOT",
    sourceVenue: "BINANCE",
    sourceMarketType: "perpetual",
    sourceSymbol: "BTCUSDT",
    executionVenue: "bingx",
    executionMarketType: "perpetual",
    executionSymbol: "BTC-USDT",
    simulationVenue: "SIM",
    simulationMarketType: "perpetual",
    simulationSymbol: "BTCUSDT-PERP",
    snapshotTimestampMs: 1_000,
    snapshotFreshnessAgeMs: 1000,
    snapshotStaleAfterMs: 3000,
  });
  assert.deepEqual(engine.calls, ["engine.status"]);
  assert.deepEqual(simulation.calls, [
    "simulation.status",
    "simulation.applyMarketSnapshot",
    "simulation.submitOrder",
    "simulation.getPosition",
    "simulation.getAccount",
  ]);
  assert.equal(fetchCalls.length, 0);
});

test("nautilus paper market adapter maps SELL and preserves quantity strings", async () => {
  const engine = makeEngine();
  const simulation = makeSimulation({
    position: {
      instrument: {
        venue: "SIM",
        marketType: "perpetual",
        symbol: "BTCUSDT-PERP",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        exchangeNativeSymbol: "BTCUSDT",
      },
      side: "SHORT",
      quantity: "0.00000001",
      realizedPnl: "0",
      unrealizedPnl: "0",
      updatedAt: 1_234,
    },
    account: {
      accountId: "SIM-001",
      venue: "SIM",
      currency: "USDT",
      equity: "1000",
      balance: "1000",
      availableBalance: "1000",
      realizedPnl: "0",
      unrealizedPnl: "0",
      timestamp: 1_234,
    },
  });
  const adapter = createNautilusPaperMarketAdapter({
    engine: engine.engine,
    simulation: simulation.simulation,
    snapshotProvider: {
      getSnapshot: async () => ({
        ...approvedSnapshot(1_000),
        bid: "99999.12345678",
        ask: "99999.12345679",
        bidSize: "12.3",
        askSize: "8.1",
      }),
    },
    nowMs: () => 1_500,
  });

  const result = await adapter.submitMarketOrder(makeReadyBackendState(), {
    clientOrderId: "gt-paper-fixed-sell-1",
    executionContext: DEFAULT_TERMINAL_EXECUTION_CONTEXT,
    side: "SELL",
    quantity: "0.00000001",
    reduceOnly: true,
  });

  assert.equal(result.order.side, "SELL");
  assert.equal(result.order.quantity, "0.00000001");
  assert.equal(result.order.clientOrderId, "gt-paper-fixed-sell-1");
  assert.equal(result.pricingContext.sourceSymbol, "BTCUSDT");
  assert.equal(result.position.quantity, "0.00000001");
});

test("nautilus paper market adapter rejects snapshot source mismatches before submit", async () => {
  const engine = makeEngine();
  const simulation = makeSimulation();
  const adapter = createNautilusPaperMarketAdapter({
    engine: engine.engine,
    simulation: simulation.simulation,
    snapshotProvider: {
      getSnapshot: async () => ({
        ...approvedSnapshot(1_000),
        source: {
          venue: "KRAKEN",
          marketType: "spot",
          symbol: "BTCUSD",
        },
      }),
    },
    nowMs: () => 1_500,
  });

  await assert.rejects(
    adapter.submitMarketOrder(makeReadyBackendState(), {
      clientOrderId: "gt-paper-mismatch",
      executionContext: DEFAULT_TERMINAL_EXECUTION_CONTEXT,
      side: "BUY",
      quantity: "1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof NautilusPaperMarketAdapterError);
      assert.equal((error as NautilusPaperMarketAdapterError).code, "MARKET_SOURCE_MISMATCH");
      return true;
    },
  );
  assert.deepEqual(simulation.calls, ["simulation.status"]);
});

test("nautilus paper market adapter rejects stale snapshots before submit", async () => {
  const engine = makeEngine();
  const simulation = makeSimulation();
  const calls: string[] = [];
  const adapter = createNautilusPaperMarketAdapter({
    engine: engine.engine,
    simulation: simulation.simulation,
    snapshotProvider: {
      getSnapshot: async () => approvedSnapshot(1_000),
    },
    nowMs: () => 5_100,
  });

  await assert.rejects(
    adapter.submitMarketOrder(makeReadyBackendState(), {
      clientOrderId: "gt-paper-stale-1",
      executionContext: DEFAULT_TERMINAL_EXECUTION_CONTEXT,
      side: "BUY",
      quantity: "1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof NautilusPaperMarketAdapterError);
      assert.equal((error as NautilusPaperMarketAdapterError).code, "SNAPSHOT_STALE_BEFORE_SUBMIT");
      return true;
    },
  );
  assert.deepEqual(simulation.calls, ["simulation.status", "simulation.applyMarketSnapshot"]);
  assert.deepEqual(calls, []);
});

test("nautilus paper market adapter rejects unsupported execution context before fetching snapshot", async () => {
  const engine = makeEngine();
  const simulation = makeSimulation();
  let fetched = false;
  const adapter = createNautilusPaperMarketAdapter({
    engine: engine.engine,
    simulation: simulation.simulation,
    snapshotProvider: {
      getSnapshot: async () => {
        fetched = true;
        return approvedSnapshot(1_000);
      },
    },
    nowMs: () => 1_500,
  });

  await assert.rejects(
    adapter.submitMarketOrder(makeReadyBackendState(), {
      clientOrderId: "gt-paper-wrong-context",
      executionContext: {
        chartExchange: "kraken",
        chartMarketType: "spot",
        chartSymbol: "BTCUSDT",
        executionExchange: "bingx",
        executionMarketType: "perpetual",
        executionSymbol: "BTC-USDT",
      },
      side: "BUY",
      quantity: "1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof NautilusPaperMarketAdapterError);
      assert.equal((error as NautilusPaperMarketAdapterError).code, "UNSUPPORTED_NAUTILUS_PAPER_CONTEXT");
      return true;
    },
  );
  assert.equal(fetched, false);
  assert.deepEqual(simulation.calls, []);
});

test("nautilus paper market adapter returns market-order-not-filled when terminal state is not FILLED", async () => {
  const engine = makeEngine();
  const simulation = makeSimulation({ orderStatus: "ACCEPTED" });
  const adapter = createNautilusPaperMarketAdapter({
    engine: engine.engine,
    simulation: simulation.simulation,
    snapshotProvider: {
      getSnapshot: async () => approvedSnapshot(1_000),
    },
    nowMs: () => 1_500,
  });

  await assert.rejects(
    adapter.submitMarketOrder(makeReadyBackendState(), {
      clientOrderId: "gt-paper-notfilled",
      executionContext: DEFAULT_TERMINAL_EXECUTION_CONTEXT,
      side: "BUY",
      quantity: "1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof NautilusPaperMarketAdapterError);
      assert.equal((error as NautilusPaperMarketAdapterError).code, "MARKET_ORDER_NOT_FILLED");
      return true;
    },
  );
  assert.deepEqual(simulation.calls, [
    "simulation.status",
    "simulation.applyMarketSnapshot",
    "simulation.submitOrder",
  ]);
});
