import assert from "node:assert/strict";
import test from "node:test";

import {
  paperExecutionPort,
  setPaperExecutionBackend,
  type PaperExecutionPortDependencies,
  type PaperExecutionPortState,
  PaperExecutionPortError,
  activateNautilusPaperBackend,
  deactivateNautilusPaperBackend,
} from "./paperExecutionPort";
import type {
  NautilusEngineBridge,
  NautilusEnginePingWire,
  NautilusEngineStatusWire,
  NautilusEngineVersionWire,
} from "./nautilusEngineBridge";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function makeLegacyDeps(): {
  deps: PaperExecutionPortDependencies;
  fetchCalls: Array<{ path: string; init?: RequestInit & { assertOk?: boolean } }>;
  jsonCalls: Array<{ path: string; init?: RequestInit & { assertOk?: boolean } }>;
} {
  const fetchCalls: Array<{ path: string; init?: RequestInit & { assertOk?: boolean } }> = [];
  const jsonCalls: Array<{ path: string; init?: RequestInit & { assertOk?: boolean } }> = [];

  const deps: PaperExecutionPortDependencies = {
    runtime: { isDesktopApp: () => true },
    legacy: {
      fetch: async (path, init) => {
        fetchCalls.push({ path, init });
        return jsonResponse({ ok: true, path, init }, 200);
      },
      json: async <T>(path, init) => {
        jsonCalls.push({ path, init });
        let data: unknown;
        if (path === "/api/paper/preview") {
          data = { success: true, preview: { path, init } };
        } else if (path === "/api/paper/order") {
          data = { success: true, data: { path, init } };
        } else if (path === "/api/paper/account") {
          data = {
            exchange: "paper",
            balanceUsdt: 999,
            availableMarginUsdt: 500,
            unrealizedPnlUsdt: 1,
            realizedPnlUsdt: 2,
            equityUsdt: 1002,
            updatedAt: "2026-01-01T00:00:00.000Z",
          };
        } else if (path === "/api/paper/position") {
          data = { position: null };
        } else if (path === "/api/paper/orders") {
          data = { orders: [] };
        } else if (path === "/api/paper/settings") {
          data = {
            initialBalanceUsdt: 10_000,
            makerFeeBps: 2,
            takerFeeBps: 5,
            slippageBps: 1,
            maxLeverage: 20,
            defaultLeverage: 5,
            defaultMarginMode: "isolated",
            allowMarketOrders: true,
            allowLimitOrders: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
          };
        } else if (path === "/api/paper/reset") {
          data = { success: true, state: { reset: true } };
        } else if (path.includes("/cancel")) {
          data = { success: true, message: "cancelled" };
        } else {
          data = { ok: true, path, init };
        }
        return { res: jsonResponse(data, 200), data: data as T };
      },
    },
  };

  return { deps, fetchCalls, jsonCalls };
}

function makeEngine(): {
  engine: NautilusEngineBridge;
  calls: string[];
} {
  const calls: string[] = [];
  const status: NautilusEngineStatusWire = {
    state: "HEALTHY",
    pid: 1234,
    service: "nautilus-daemon",
    protocolVersion: 1,
    nautilusVersion: "1.231.0",
    pythonVersion: "3.12.10",
  };
  const engine: NautilusEngineBridge = {
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
      const pong: NautilusEnginePingWire = { pong: true };
      return pong;
    },
    version: async () => {
      calls.push("engine.version");
      const version: NautilusEngineVersionWire = {
        protocolVersion: 1,
        nautilusVersion: "1.231.0",
        pythonVersion: "3.12.10",
        pid: 1234,
      };
      return version;
    },
    stop: async () => {
      calls.push("engine.stop");
      return { ...status, state: "STOPPED" };
    },
  };
  return { engine, calls };
}

function makeSimulation(): {
  simulation: {
    status: () => Promise<{ state: "STOPPED" | "RUNNING" }>;
    start: () => Promise<{ state: "STOPPED" | "RUNNING"; alreadyRunning?: boolean }>;
    stop: () => Promise<{ state: "STOPPED" | "RUNNING"; alreadyStopped?: boolean }>;
    reset: () => Promise<{ state: "STOPPED" | "RUNNING"; reset?: boolean }>;
    listOrders: () => Promise<never[]>;
  };
  calls: string[];
} {
  const calls: string[] = [];
  const simulation = {
    status: async () => {
      calls.push("simulation.status");
      return { state: "RUNNING" as const };
    },
    start: async () => {
      calls.push("simulation.start");
      return { state: "RUNNING" as const, alreadyRunning: true };
    },
    stop: async () => {
      calls.push("simulation.stop");
      return { state: "STOPPED" as const, alreadyStopped: true };
    },
    reset: async () => {
      calls.push("simulation.reset");
      return { state: "RUNNING" as const, reset: true };
    },
    listOrders: async () => [],
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
        filledQuantity: orderIntent.quantity ?? "1",
        remainingQuantity: "0",
        status: "FILLED" as const,
        timestamps: { createdAt: 1_000, updatedAt: 1_000 },
        averageFillPrice: "100000.0",
      };
    },
    getPosition: async () => {
      calls.push("simulation.getPosition");
      return {
        instrument: {
          venue: "SIM",
          marketType: "perpetual",
          symbol: "BTCUSDT-PERP",
          baseAsset: "BTC",
          quoteAsset: "USDT",
          exchangeNativeSymbol: "BTCUSDT",
        },
        side: "LONG" as const,
        quantity: "1",
        realizedPnl: "0",
        unrealizedPnl: "0",
        updatedAt: 1_234,
      };
    },
    getAccount: async () => {
      calls.push("simulation.getAccount");
      return {
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
    },
  };
  return { simulation, calls };
}

function resetPort(): void {
  setPaperExecutionBackend("legacy");
}

test.beforeEach(() => {
  resetPort();
});

test("paper execution port defaults to legacy and preserves legacy HTTP routes", async () => {
  const { deps, fetchCalls, jsonCalls } = makeLegacyDeps();

  assert.equal(paperExecutionPort.getBackend(), "legacy");
  assert.equal(paperExecutionPort.resolveBackend().availability, "AVAILABLE");

  const fetchRes = await paperExecutionPort.paperApiFetch("/api/paper/account", undefined, deps);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchCalls[0], { path: "/api/paper/account", init: {} });
  assert.equal(fetchRes.ok, true);

  const jsonRes = await paperExecutionPort.paperApiJson<{ ok: boolean }>("/api/paper/settings", { method: "GET" }, deps);
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(fetchCalls[1], { path: "/api/paper/settings", init: { method: "GET", assertOk: false } });
  assert.equal(jsonRes.res.ok, true);

  const preview = await paperExecutionPort.previewOrder({
    symbol: "BTC-USDT",
    side: "buy",
    orderType: "market",
  }, deps);
  assert.deepEqual(jsonCalls[0], {
    path: "/api/paper/preview",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: "BTC-USDT",
        side: "buy",
        orderType: "market",
      }),
    },
  });
  assert.deepEqual(preview, { success: true, preview: { path: "/api/paper/preview", init: {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: "BTC-USDT",
      side: "buy",
      orderType: "market",
    }),
  } } });

  await paperExecutionPort.submitOrder(
    {
      symbol: "BTC-USDT",
      side: "buy",
      orderType: "market",
      notionalUSDT: 100,
      qtyBTC: 0.001,
      entryPrice: 100_000,
      leverage: 5,
      marginMode: "isolated",
      reduceOnly: false,
    },
    deps,
  );
  assert.equal(jsonCalls[1]?.path, "/api/paper/order");

  await paperExecutionPort.cancelOrder("gt-1", deps);
  assert.equal(jsonCalls[2]?.path, "/api/paper/orders/gt-1/cancel");

  const account = await paperExecutionPort.getAccount(deps);
  const position = await paperExecutionPort.getPosition(deps);
  const orders = await paperExecutionPort.getOrders(deps);
  const settings = await paperExecutionPort.getSettings(deps);
  const reset = await paperExecutionPort.reset(deps);

  assert.equal(account.exchange, "paper");
  assert.equal(position, null);
  assert.deepEqual(orders, []);
  assert.equal(settings.defaultLeverage, 5);
  assert.deepEqual(reset, { success: true, state: { reset: true } });

  assert.deepEqual(jsonCalls.map((call) => call.path), [
    "/api/paper/preview",
    "/api/paper/order",
    "/api/paper/orders/gt-1/cancel",
    "/api/paper/account",
    "/api/paper/position",
    "/api/paper/orders",
    "/api/paper/settings",
    "/api/paper/reset",
  ]);
});

test("paper execution port returns desktop-only when Nautilus is selected on web", async () => {
  const { deps, fetchCalls } = makeLegacyDeps();
  const webDeps: PaperExecutionPortDependencies = {
    ...deps,
    runtime: { isDesktopApp: () => false },
  };
  paperExecutionPort.setBackend("nautilus");

  const res = await paperExecutionPort.paperApiFetch("/api/paper/order", { method: "POST" }, webDeps);
  assert.equal(res.status, 503);
  assert.equal(fetchCalls.length, 0);
  const body = (await res.json()) as { code: string; backend: string };
  assert.equal(body.code, "DESKTOP_ONLY");
  assert.equal(body.backend, "nautilus");

  await assert.rejects(
    paperExecutionPort.submitOrder(
      {
        symbol: "BTC-USDT",
        side: "buy",
        orderType: "market",
        notionalUSDT: 100,
        qtyBTC: 0.001,
        entryPrice: 100_000,
        leverage: 5,
        marginMode: "isolated",
        reduceOnly: false,
      },
      webDeps,
    ),
    (error: unknown) => {
      assert.ok(error instanceof PaperExecutionPortError);
      assert.equal((error as PaperExecutionPortError).code, "DESKTOP_ONLY");
      return true;
    },
  );
});

test("activating Nautilus on desktop drives engine and simulation lifecycle in order", async () => {
  const { engine, calls: engineCalls } = makeEngine();
  const { simulation, calls: simulationCalls } = makeSimulation();
  const deps: PaperExecutionPortDependencies = {
    runtime: { isDesktopApp: () => true },
    engine,
    simulation: simulation as never,
  };

  const activated = await activateNautilusPaperBackend(deps);
  assert.equal(activated.backend, "nautilus");
  assert.equal(activated.availability, "AVAILABLE");
  assert.equal(activated.engine, "RUNNING");
  assert.equal(activated.simulation, "RUNNING");
  assert.deepEqual(engineCalls, [
    "engine.start",
    "engine.status",
    "engine.version",
    "engine.ping",
  ]);
  assert.deepEqual(simulationCalls, ["simulation.start", "simulation.status"]);

  const second = await activateNautilusPaperBackend(deps);
  assert.equal(second.backend, "nautilus");
  assert.equal(second.availability, "AVAILABLE");
  assert.equal(second.engine, "RUNNING");
  assert.equal(second.simulation, "RUNNING");
  assert.deepEqual(engineCalls, [
    "engine.start",
    "engine.status",
    "engine.version",
    "engine.ping",
    "engine.start",
    "engine.status",
    "engine.version",
    "engine.ping",
  ]);
  assert.deepEqual(simulationCalls, [
    "simulation.start",
    "simulation.status",
    "simulation.start",
    "simulation.status",
  ]);
});

test("activating Nautilus keeps explicit selection but degrades on version mismatch", async () => {
  const calls: string[] = [];
  const deps: PaperExecutionPortDependencies = {
    runtime: { isDesktopApp: () => true },
    engine: {
      status: async () => {
        calls.push("engine.status");
        return { state: "HEALTHY", pid: 1234, nautilusVersion: "1.230.0" } as NautilusEngineStatusWire;
      },
      start: async () => {
        calls.push("engine.start");
        return { state: "HEALTHY", pid: 1234, nautilusVersion: "1.230.0" } as NautilusEngineStatusWire;
      },
      ping: async () => {
        calls.push("engine.ping");
        return { pong: true };
      },
      version: async () => {
        calls.push("engine.version");
        return {
          protocolVersion: 1,
          nautilusVersion: "1.230.0",
          pythonVersion: "3.12.10",
          pid: 1234,
        };
      },
      stop: async () => {
        calls.push("engine.stop");
        return { state: "STOPPED" } as NautilusEngineStatusWire;
      },
    },
    simulation: {
      status: async () => {
        calls.push("simulation.status");
        return { state: "RUNNING" };
      },
      start: async () => {
        calls.push("simulation.start");
        return { state: "RUNNING" };
      },
      stop: async () => {
        calls.push("simulation.stop");
        return { state: "STOPPED" };
      },
      reset: async () => {
        calls.push("simulation.reset");
        return { state: "RUNNING" };
      },
    } as never,
  };

  const activated = await activateNautilusPaperBackend(deps);
  assert.equal(activated.backend, "nautilus");
  assert.equal(activated.availability, "DEGRADED");
  assert.equal(activated.error?.code, "BACKEND_NOT_AVAILABLE");
  assert.equal(activated.simulation, "UNKNOWN");
  assert.deepEqual(calls, ["engine.start", "engine.status", "engine.version", "engine.ping"]);
  assert.equal(paperExecutionPort.getBackend(), "nautilus");
});

test("activation failure preserves the exact failing stage and elapsed time", async () => {
  const stages = [
    "engine.start",
    "engine.status",
    "engine.version",
    "engine.ping",
    "simulation.start",
    "simulation.status",
  ] as const;

  for (const stage of stages) {
    const { engine, calls: engineCalls } = makeEngine();
    const { simulation, calls: simulationCalls } = makeSimulation();
    const failure = new Error(`failure at ${stage}`);
    const failingEngine = { ...engine };
    const failingSimulation = { ...simulation };

    if (stage === "engine.start") failingEngine.start = async () => { throw failure; };
    if (stage === "engine.status") failingEngine.status = async () => { throw failure; };
    if (stage === "engine.version") failingEngine.version = async () => { throw failure; };
    if (stage === "engine.ping") failingEngine.ping = async () => { throw failure; };
    if (stage === "simulation.start") failingSimulation.start = async () => { throw failure; };
    if (stage === "simulation.status") failingSimulation.status = async () => { throw failure; };

    const result = await activateNautilusPaperBackend({
      runtime: { isDesktopApp: () => true },
      engine: failingEngine,
      simulation: failingSimulation as never,
    });
    const details = result.error?.details as {
      activationStage?: string;
      elapsedMs?: number;
      originalError?: { message?: string };
    };
    assert.equal(details.activationStage, stage);
    assert.equal(typeof details.elapsedMs, "number");
    assert.equal(details.originalError?.message, failure.message);
    assert.equal(result.availability, "DEGRADED");

    const allCalls = [...engineCalls, ...simulationCalls];
    assert.equal(allCalls.includes(stage), false);
  }
});

test("deactivating Nautilus stops simulation before engine and requires explicit legacy switch", async () => {
  const { engine, calls: engineCalls } = makeEngine();
  const { simulation, calls: simulationCalls } = makeSimulation();
  const deps: PaperExecutionPortDependencies = {
    runtime: { isDesktopApp: () => true },
    engine,
    simulation: simulation as never,
  };

  await activateNautilusPaperBackend(deps);
  const deactivated = await deactivateNautilusPaperBackend(deps);
  assert.equal(deactivated.backend, "nautilus");
  assert.equal(deactivated.availability, "UNAVAILABLE");
  assert.deepEqual(simulationCalls.slice(-1)[0], "simulation.stop");
  assert.deepEqual(engineCalls.slice(-1)[0], "engine.stop");

  const idxStop = simulationCalls.indexOf("simulation.stop");
  const idxEngineStop = engineCalls.indexOf("engine.stop");
  assert.ok(idxStop >= 0);
  assert.ok(idxEngineStop >= 0);

  paperExecutionPort.setBackend("legacy");
  const state = paperExecutionPort.getState();
  assert.equal(state.backend, "legacy");
  assert.equal(state.availability, "AVAILABLE");
});

test("Nautilus MARKET submit routes through the market adapter and preserves string inputs", async () => {
  const { deps: legacyDeps, fetchCalls, jsonCalls } = makeLegacyDeps();
  const { engine } = makeEngine();
  const { simulation } = makeSimulation();
  const snapshotCalls: Array<unknown> = [];
  const deps: PaperExecutionPortDependencies = {
    ...legacyDeps,
    runtime: { isDesktopApp: () => true },
    engine,
    simulation: simulation as never,
    marketSnapshotProvider: {
      getSnapshot: async (context, providerDeps) => {
        snapshotCalls.push({ context, providerDeps });
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
          timestampMs: 1_000,
          freshness: { ageMs: 250, staleAfterMs: 3000, stale: false },
        };
      },
    } as never,
    clientOrderIdFactory: () => "gt-paper-fixed-1",
    nowMs: () => 1_500,
    fetch: async () => {
      throw new Error("unexpected fetch in Nautilus market path");
    },
  };

  await activateNautilusPaperBackend(deps);
  const result = await paperExecutionPort.submitOrder(
    {
      symbol: "BTC-USDT",
      chartSymbol: "BTCUSDT",
      side: "buy",
      orderType: "market",
      notionalUSDT: 100,
      qtyBTC: 0.00000001,
      entryPrice: null,
      leverage: 5,
      marginMode: "isolated",
      reduceOnly: false,
      quantityText: "0.00000001",
    },
    deps,
  );

  assert.equal((result as { backend: string }).backend, "nautilus");
  assert.equal((result as { order: { clientOrderId: string; quantity: string; status: string } }).order.clientOrderId, "gt-paper-fixed-1");
  assert.equal((result as { order: { clientOrderId: string; quantity: string; status: string } }).order.quantity, "0.00000001");
  assert.equal((result as { order: { clientOrderId: string; quantity: string; status: string } }).order.status, "FILLED");
  assert.equal((result as { pricingContext: { mode: string } }).pricingContext.mode, "PROXY_BBO_SNAPSHOT");
  assert.equal(snapshotCalls.length, 1);
  assert.equal(fetchCalls.length, 0);
  assert.equal(jsonCalls.length, 0);
});

test("Nautilus MARKET submit requires quantityText and rejects numeric fallback", async () => {
  const { deps: legacyDeps, fetchCalls, jsonCalls } = makeLegacyDeps();
  const { engine } = makeEngine();
  const { simulation } = makeSimulation();
  const snapshotCalls: Array<unknown> = [];
  const deps: PaperExecutionPortDependencies = {
    ...legacyDeps,
    runtime: { isDesktopApp: () => true },
    engine,
    simulation: simulation as never,
    marketSnapshotProvider: {
      getSnapshot: async (context, providerDeps) => {
        snapshotCalls.push({ context, providerDeps });
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
          timestampMs: 1_000,
          freshness: { ageMs: 250, staleAfterMs: 3000, stale: false },
        };
      },
    } as never,
  };

  await activateNautilusPaperBackend(deps);
  await assert.rejects(
    paperExecutionPort.submitOrder(
      {
        symbol: "BTC-USDT",
        chartSymbol: "BTCUSDT",
        side: "buy",
        orderType: "market",
        notionalUSDT: 100,
        qtyBTC: 0.00000001,
        entryPrice: null,
        leverage: 5,
        marginMode: "isolated",
        reduceOnly: false,
      },
      deps,
    ),
    (error: unknown) => {
      assert.ok(error instanceof PaperExecutionPortError);
      assert.equal((error as PaperExecutionPortError).code, "NAUTILUS_DECIMAL_QUANTITY_REQUIRED");
      return true;
    },
  );
  assert.equal(snapshotCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
  assert.equal(jsonCalls.length, 0);
});

test("Nautilus LIMIT submit uses native order path without snapshot fetch", async () => {
  const { deps: legacyDeps, fetchCalls, jsonCalls } = makeLegacyDeps();
  const { engine } = makeEngine();
  const { simulation } = makeSimulation();
  const snapshotCalls: Array<unknown> = [];
  const deps: PaperExecutionPortDependencies = {
    ...legacyDeps,
    runtime: { isDesktopApp: () => true },
    engine,
    simulation: simulation as never,
    marketSnapshotProvider: {
      getSnapshot: async () => {
        snapshotCalls.push(true);
        throw new Error("limit must not fetch snapshot");
      },
    } as never,
  };

  paperExecutionPort.setBackend("nautilus");
  const order = await paperExecutionPort.submitOrder(
    {
      symbol: "BTC-USDT",
      chartSymbol: "BTCUSDT",
      side: "buy",
      orderType: "limit",
      notionalUSDT: 100,
      qtyBTC: 0.001,
      quantityText: "0.001",
      entryPrice: 99_900,
      price: 99_900,
      leverage: 5,
      marginMode: "isolated",
      reduceOnly: false,
    },
    deps,
  );
  assert.equal((order as { status: string }).status, "FILLED");
  assert.equal(snapshotCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
  assert.equal(jsonCalls.length, 0);
});

test("Nautilus MARKET submit reports backend-not-ready without fetching a snapshot", async () => {
  const { deps: legacyDeps, fetchCalls, jsonCalls } = makeLegacyDeps();
  const { engine } = makeEngine();
  const { simulation } = makeSimulation();
  let engineRunning = true;
  const snapshotCalls: Array<unknown> = [];
  const deps: PaperExecutionPortDependencies = {
    ...legacyDeps,
    runtime: { isDesktopApp: () => true },
    engine: {
      ...engine,
      status: async () => ({
        state: engineRunning ? "HEALTHY" : "STOPPED",
        pid: 1234,
        service: "nautilus-daemon",
        protocolVersion: 1,
        nautilusVersion: "1.231.0",
        pythonVersion: "3.12.10",
      }),
    },
    simulation: simulation as never,
    marketSnapshotProvider: {
      getSnapshot: async (context, providerDeps) => {
        snapshotCalls.push({ context, providerDeps });
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
          timestampMs: 1_000,
          freshness: { ageMs: 250, staleAfterMs: 3000, stale: false },
        };
      },
    } as never,
  };

  await activateNautilusPaperBackend(deps);
  engineRunning = false;
  await assert.rejects(
    paperExecutionPort.submitOrder(
      {
        symbol: "BTC-USDT",
        chartSymbol: "BTCUSDT",
        side: "buy",
        orderType: "market",
        notionalUSDT: 100,
        qtyBTC: 0.001,
        entryPrice: 100_000,
        leverage: 5,
        marginMode: "isolated",
        reduceOnly: false,
        quantityText: "0.001",
      },
      deps,
    ),
    (error: unknown) => {
      assert.ok(error instanceof PaperExecutionPortError);
      assert.equal((error as PaperExecutionPortError).code, "NAUTILUS_BACKEND_NOT_READY");
      return true;
    },
  );
  assert.equal(snapshotCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
  assert.equal(jsonCalls.length, 0);
});
