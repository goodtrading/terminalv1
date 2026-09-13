import assert from "node:assert/strict";
import test from "node:test";
import { isPaperExecutionCoreReady, PaperStateController } from "./paperState";
import { setPaperExecutionBackend } from "./paperExecutionPort";

function makeFetcher(calls: string[]) {
  return async (path: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const body = path.endsWith("/account")
      ? { balanceUsdt: 100, equityUsdt: 100 }
      : path.endsWith("/position")
        ? { position: null }
        : path.endsWith("/orders")
          ? { orders: [] }
          : path.endsWith("/settings")
            ? { initialBalanceUsdt: 10000, defaultLeverage: 5 }
            : { trades: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

const legacyRuntime = {
  workspace: "paper" as const,
  backend: "legacy" as const,
  authReady: true,
  authenticated: true,
};

test.beforeEach(() => {
  setPaperExecutionBackend("nautilus");
});

test("PARTIAL with account and position resources is execution-core ready", () => {
  assert.equal(
    isPaperExecutionCoreReady({
      active: true,
      resources: {
        account: "AVAILABLE",
        position: "AVAILABLE",
        orders: "NOT_WIRED",
        trades: "NOT_WIRED",
        settings: "NOT_WIRED",
      },
    }),
    true,
  );
  assert.equal(
    isPaperExecutionCoreReady({
      active: true,
      resources: {
        account: "AVAILABLE",
        position: "NOT_WIRED",
        orders: "NOT_WIRED",
        trades: "NOT_WIRED",
        settings: "NOT_WIRED",
      },
    }),
    false,
  );
});

test("one canonical legacy controller serves multiple consumers", async () => {
  const calls: string[] = [];
  const controller = new PaperStateController(makeFetcher(calls));
  const seen: unknown[] = [];
  controller.subscribe(() => seen.push(controller.getState()));
  controller.subscribe(() => seen.push(controller.getState()));

  controller.setRuntime(legacyRuntime);
  await controller.refresh();
  controller.dispose();

  assert.equal(calls.filter((call) => call.includes("/api/paper/account")).length, 1);
  assert.equal(calls.filter((call) => call.includes("/api/paper/position")).length, 1);
  assert.equal(calls.filter((call) => call.includes("/api/paper/orders")).length, 1);
  assert.equal(calls.filter((call) => call.includes("/api/paper/settings")).length, 1);
  assert.equal(calls.filter((call) => call.includes("/api/paper/trades")).length, 1);
  assert.equal(controller.getState().account?.balanceUsdt, 100);
  assert.ok(seen.length > 0);
});

test("Nautilus workspace has no legacy Paper reads", async () => {
  const calls: string[] = [];
  const controller = new PaperStateController(makeFetcher(calls));

  controller.setRuntime({ ...legacyRuntime, backend: "nautilus" });
  await controller.refresh();

  assert.deepEqual(calls, []);
  assert.equal(controller.getState().source, "nautilus");
  assert.equal(controller.getState().availability, "NOT_WIRED");
  controller.dispose();
});

test("NOT_WIRED empty collections remain unavailable, not a valid empty snapshot", async () => {
  const calls: string[] = [];
  const controller = new PaperStateController(makeFetcher(calls));

  controller.setRuntime({ ...legacyRuntime, backend: "nautilus" });
  const notWired = controller.getState();
  assert.equal(notWired.availability, "NOT_WIRED");
  assert.deepEqual(notWired.orders, []);
  assert.equal(notWired.position, null);
  assert.equal(notWired.account, undefined);

  controller.setRuntime(legacyRuntime);
  await controller.refresh();
  const available = controller.getState();
  assert.equal(available.availability, "AVAILABLE");
  assert.deepEqual(available.orders, []);
  assert.equal(available.position, null);
  assert.notEqual(available.account, undefined);
  controller.dispose();
});

test("workspace and backend transitions stop and resume the single legacy lifecycle", async () => {
  const calls: string[] = [];
  const controller = new PaperStateController(makeFetcher(calls));

  controller.setRuntime(legacyRuntime);
  await controller.refresh();
  const firstReadCount = calls.length;

  controller.setRuntime({ ...legacyRuntime, backend: "nautilus" });
  await controller.refresh();
  assert.equal(calls.length, firstReadCount);

  controller.setRuntime({ ...legacyRuntime, workspace: "bingx" });
  await controller.refresh();
  assert.equal(calls.length, firstReadCount);

  controller.setRuntime(legacyRuntime);
  await controller.refresh();
  assert.equal(calls.length, firstReadCount + 5);
  controller.dispose();
});

test("Nautilus PaperState maps native account and position without legacy HTTP", async () => {
  setPaperExecutionBackend("nautilus");
  const { activateNautilusPaperBackend } = await import("./paperExecutionPort");
  await activateNautilusPaperBackend({
    runtime: { isDesktopApp: () => true },
    engine: {
      start: async () => ({ state: "HEALTHY" }),
      status: async () => ({ state: "HEALTHY" }),
      version: async () => ({ protocolVersion: 1, nautilusVersion: "1.231.0", pythonVersion: "3.12.10", pid: 1 }),
      ping: async () => ({ pong: true }),
      stop: async () => ({ state: "STOPPED" }),
    } as never,
    simulation: {
      start: async () => ({ state: "RUNNING" }),
      status: async () => ({ state: "RUNNING" }),
    } as never,
  });
  const calls: string[] = [];
  const controller = new PaperStateController(
    async (path) => {
      calls.push(path);
      return new Response("unexpected", { status: 500 });
    },
    {
      getAccount: async () => ({
        exchange: "paper",
        balanceUsdt: 900,
        availableMarginUsdt: 800,
        unrealizedPnlUsdt: 12,
        realizedPnlUsdt: 3,
        equityUsdt: 912,
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
      getPosition: async () => ({
        symbol: "BTCUSDT-PERP",
        side: "long",
        quantity: 1,
        entryPrice: 100,
        markPrice: 101,
        leverage: null,
        marginMode: "unknown",
      }),
      getOrders: async () => [],
      getFills: async () => [],
    },
  );
  controller.setRuntime({ ...legacyRuntime, backend: "nautilus" });
  await controller.refresh();
  const state = controller.getState();
  assert.equal(state.account?.balanceUsdt, 900);
  assert.equal(state.position?.quantity, 1);
  assert.equal(state.resources.orders, "AVAILABLE");
  assert.equal(state.resources.trades, "NOT_WIRED");
  assert.equal(state.resources.settings, "NOT_WIRED");
  assert.deepEqual(calls, []);
  controller.dispose();
  setPaperExecutionBackend("legacy");
});

test("PaperState debug snapshot reports local refresh diagnostics without new reads", async () => {
  setPaperExecutionBackend("nautilus");
  const { activateNautilusPaperBackend } = await import("./paperExecutionPort");
  await activateNautilusPaperBackend({
    runtime: { isDesktopApp: () => true },
    engine: {
      start: async () => ({ state: "HEALTHY" }),
      status: async () => ({ state: "HEALTHY" }),
      version: async () => ({ protocolVersion: 1, nautilusVersion: "1.231.0", pythonVersion: "3.12.10", pid: 1 }),
      ping: async () => ({ pong: true }),
      stop: async () => ({ state: "STOPPED" }),
    } as never,
    simulation: {
      start: async () => ({ state: "RUNNING" }),
      status: async () => ({ state: "RUNNING" }),
    } as never,
  });
  let accountReads = 0;
  const controller = new PaperStateController(undefined, {
    getAccount: async () => {
      accountReads += 1;
      return { exchange: "paper", balanceUsdt: 1, availableMarginUsdt: 1, unrealizedPnlUsdt: 0, realizedPnlUsdt: 0, equityUsdt: 1, feesTotal: "0.5", updatedAt: "2026-09-11T00:00:00.000Z" };
    },
    getPosition: async () => null,
    getOrders: async () => [],
    getFills: async () => [],
  });

  const before = controller.getDebugSnapshot();
  assert.equal(accountReads, 0);
  assert.equal(before.refreshStartCount, 0);
  assert.equal(before.refreshEndCount, 0);
  assert.equal(before.fillsCount, 0);

  controller.setRuntime({ ...legacyRuntime, backend: "nautilus" });
  await controller.refresh();
  const after = controller.getDebugSnapshot();
  assert.equal(accountReads, 1);
  assert.equal(after.refreshStartCount, 1);
  assert.equal(after.refreshEndCount, 1);
  assert.equal(after.resources.fills, "AVAILABLE");
  assert.equal(after.feesTotal, "0.5");
  controller.dispose();
  setPaperExecutionBackend("legacy");
});

test("Nautilus lifecycle reconciles availability, transitions, and repeated runtime with one timer", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { activateNautilusPaperBackend } = await import("./paperExecutionPort");
  const calls: string[] = [];
  let reads = 0;
  const controller = new PaperStateController(makeFetcher(calls), {
    getAccount: async () => { reads++; return { exchange: "paper", balanceUsdt: 1, equityUsdt: 1 } as never; },
    getPosition: async () => null,
    getOrders: async () => [],
    getFills: async () => [],
  });
  t.after(() => controller.dispose());
  const runtime = { ...legacyRuntime, backend: "nautilus" as const };
  controller.setRuntime(legacyRuntime);
  await controller.refresh();
  controller.setRuntime(runtime);
  assert.equal(controller.getDebugSnapshot().timerExists, false);
  await activateNautilusPaperBackend({
    runtime: { isDesktopApp: () => true },
    engine: {
      start: async () => ({ state: "HEALTHY" }), status: async () => ({ state: "HEALTHY" }),
      version: async () => ({ protocolVersion: 1, nautilusVersion: "1.231.0", pythonVersion: "3.12.10", pid: 1 }),
      ping: async () => ({ pong: true }),
    } as never,
    simulation: { start: async () => ({ state: "RUNNING" }), status: async () => ({ state: "RUNNING" }) } as never,
  });
  const legacyReads = calls.length;
  controller.setRuntime(runtime);
  await controller.refresh();
  assert.equal(reads, 1, "availability recovery refreshes immediately");
  for (let i = 0; i < 5; i++) controller.setRuntime(runtime);
  t.mock.timers.tick(2500);
  await controller.refresh();
  assert.equal(controller.getDebugSnapshot().tickCount, 1);
  assert.equal(reads, 2);
  assert.equal(calls.length, legacyReads, "no legacy polling in Nautilus");
  assert.equal(controller.getState().availability, "PARTIAL");
  controller.setRuntime(legacyRuntime);
  await controller.refresh();
  assert.equal(controller.getDebugSnapshot().timerExists, false);
  controller.setRuntime(runtime);
  await controller.refresh();
  assert.equal(controller.getDebugSnapshot().timerExists, true, "legacy to available Nautilus starts timer");
  const before = controller.getDebugSnapshot().tickCount;
  t.mock.timers.tick(2500);
  await controller.refresh();
  assert.equal(controller.getDebugSnapshot().tickCount, before + 1);
  setPaperExecutionBackend("nautilus");
  controller.setRuntime(runtime);
  assert.equal(controller.getDebugSnapshot().timerExists, false, "unavailable stops timer");
});
