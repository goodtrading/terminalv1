import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests, requireSaasAuth } from "../middleware/saasAuth";
import {
  createNautilusServerPaperRuntimeRouter,
} from "./nautilusServerPaperRuntime.routes";
import { NautilusServerPaperRuntimeManager, type ServerPaperQuoteObservation } from "../services/nautilusServerPaperRuntime";

const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");

function assertLoadedPackageEvidence(manager: NautilusServerPaperRuntimeManager, ownerUserId: number) {
  const sessions = (manager as unknown as {
    sessions: Map<number, { nautilusVersion: string | null; runtimeModules: Record<string, { path: string; sha256: string }> | null }>;
  }).sessions;
  const runtime = sessions.get(ownerUserId);
  assert.ok(runtime);
  assert.equal(runtime.nautilusVersion, "1.231.0");
  assert.ok(runtime.runtimeModules);
  for (const name of ["daemon", "contracts", "simulation_core", "simulation_service", "quote_stream"]) {
    const module = runtime.runtimeModules[name];
    assert.ok(module, `daemon health manifest must include ${name}`);
    const relative = path.relative(runtimeRoot, module.path);
    assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${name} must be loaded from the final package`);
    const actualHash = createHash("sha256").update(readFileSync(module.path)).digest("hex");
    assert.equal(actualHash, module.sha256, `${name} hash must match the file actually imported by the daemon`);
  }
  assert.equal(path.resolve(runtime.runtimeModules.daemon.path), path.resolve(runtimeRoot, "daemon.py"));
}

async function jsonRequest(baseUrl: string, route: string, userId?: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(userId ? { "x-test-user": userId } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

test("authenticated Web API starts isolated Nautilus processes and reads owner-scoped snapshots", { timeout: 180_000 }, async () => {
  assert.ok(existsSync(path.join(runtimeRoot, "python.exe")), "packaged Nautilus Python runtime is required");
  assert.ok(existsSync(path.join(runtimeRoot, "daemon.py")), "packaged Nautilus daemon is required");
  const registryDir = await mkdtemp(path.join(tmpdir(), "gt-n3d5-sessions-"));

  const manager = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    prewarmPackage: true,
    maxSessions: 2,
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
    registryPath: path.join(registryDir, "sessions.sqlite"),
  });
  const app = express();
  __setSaasAuthResolverForTests((req) => {
    const raw = req.header("x-test-user");
    return raw && /^\d+$/.test(raw)
      ? { id: Number(raw), email: `paper-${raw}@example.invalid`, role: "user" }
      : null;
  });
  app.use(express.json());
  app.use("/api/paper/nautilus/runtime", createNautilusServerPaperRuntimeRouter({
    manager,
    authenticate: requireSaasAuth,
    enabled: true,
  }));
  let server: Server | undefined;
  try {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const root = "/api/paper/nautilus/runtime";

    assert.equal((await jsonRequest(baseUrl, `${root}/session`)).status, 401, "unauthenticated request must not start a daemon");
    assert.equal((await jsonRequest(baseUrl, `${root}/snapshot`, "303")).status, 503, "another user cannot read a session that they do not own");

    const [startA, repeatedStartA, startB] = await Promise.all([
      jsonRequest(baseUrl, `${root}/session`, "101", "POST"),
      jsonRequest(baseUrl, `${root}/session`, "101", "POST"),
      jsonRequest(baseUrl, `${root}/session`, "202", "POST"),
    ]);
    assert.equal(startA.status, 201, JSON.stringify(startA.body));
    assert.equal(startB.status, 201, JSON.stringify(startB.body));
    assert.equal(repeatedStartA.body.simulationSessionId, startA.body.simulationSessionId);
    assert.equal(startA.body.lifecycle, "AVAILABLE");
    assert.equal(startB.body.lifecycle, "AVAILABLE");
    assert.notEqual(startA.body.simulationSessionId, startB.body.simulationSessionId)
    assertLoadedPackageEvidence(manager, 101)
    assertLoadedPackageEvidence(manager, 202);

    const [repeatA, snapshotA, snapshotB, statusA, statusB] = await Promise.all([
      jsonRequest(baseUrl, `${root}/session`, "101", "POST"),
      jsonRequest(baseUrl, `${root}/snapshot`, "101"),
      jsonRequest(baseUrl, `${root}/snapshot`, "202"),
      jsonRequest(baseUrl, `${root}/session`, "101"),
      jsonRequest(baseUrl, `${root}/session`, "202"),
    ]);
    assert.equal(repeatA.status, 200);
    assert.equal(repeatA.body.alreadyRunning, true);
    assert.equal(repeatA.body.simulationSessionId, startA.body.simulationSessionId);
    assert.equal(snapshotA.status, 200, JSON.stringify(snapshotA.body));
    assert.equal(snapshotB.status, 200, JSON.stringify(snapshotB.body));
    assert.equal(snapshotA.body.simulationSessionId, startA.body.simulationSessionId);
    assert.equal(snapshotB.body.simulationSessionId, startB.body.simulationSessionId);
    assert.equal(snapshotA.body.account.simulationSessionId, startA.body.simulationSessionId);
    assert.equal(snapshotA.body.position.simulationSessionId, startA.body.simulationSessionId);
    assert.equal(snapshotB.body.account.simulationSessionId, startB.body.simulationSessionId);
    assert.equal(snapshotB.body.position.simulationSessionId, startB.body.simulationSessionId);
    assert.equal(snapshotA.body.account.accountId, "SIM-001");
    assert.equal(snapshotB.body.account.accountId, "SIM-001", "same local account label may exist only inside distinct processes");
    assert.equal(snapshotA.body.position.side, "FLAT");
    assert.equal(snapshotB.body.position.side, "FLAT");
    assert.equal(statusA.body.lifecycle, "AVAILABLE");
    assert.equal(statusB.body.lifecycle, "AVAILABLE");
    assert.equal(statusA.body.simulationSessionId, startA.body.simulationSessionId);
    assert.equal(statusB.body.simulationSessionId, startB.body.simulationSessionId);
    const capacity = await jsonRequest(baseUrl, `${root}/session`, "303", "POST");
    assert.equal(capacity.status, 429);

    const stopA = await jsonRequest(baseUrl, `${root}/session`, "101", "DELETE");
    assert.equal(stopA.status, 200, JSON.stringify(stopA.body));
    assert.equal(stopA.body.lifecycle, "TERMINATED");
    assert.equal(stopA.body.simulationSessionId, startA.body.simulationSessionId);
    assert.equal((await jsonRequest(baseUrl, `${root}/snapshot`, "101")).status, 503);
    assert.equal((await jsonRequest(baseUrl, `${root}/snapshot`, "202")).status, 200, "stopping A must not affect B");
  } finally {
    __setSaasAuthResolverForTests(null);
    await manager.dispose();
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await rm(registryDir, { recursive: true, force: true });
  }
});

test("server PAPER router stays disabled unless explicitly enabled", async () => {
  const manager = new NautilusServerPaperRuntimeManager({ runtimeRoot });
  const app = express();
  __setSaasAuthResolverForTests((req) => {
    const raw = req.header("x-test-user");
    return raw ? { id: Number(raw), email: `paper-${raw}@example.invalid`, role: "user" } : null;
  });
  app.use("/runtime", createNautilusServerPaperRuntimeRouter({ manager, authenticate: requireSaasAuth, enabled: false }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await jsonRequest(`http://127.0.0.1:${address.port}`, "/runtime/session", "101", "POST");
    assert.equal(response.status, 503);
    assert.equal(response.body.code, "NAUTILUS_SERVER_PAPER_DISABLED");
    assert.deepEqual(manager.getLifecycle(101), {
      lifecycle: "UNAVAILABLE", simulationSessionId: null, accountId: null, reason: "no_server_paper_session",
    });
  } finally {
    __setSaasAuthResolverForTests(null);
    await manager.dispose();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("enabled server PAPER router still blocks order submission when the execution gate is off", async () => {
  const manager = new NautilusServerPaperRuntimeManager({ runtimeRoot });
  const app = express();
  __setSaasAuthResolverForTests((req) => {
    const raw = req.header("x-test-user");
    return raw ? { id: Number(raw), email: `paper-${raw}@example.invalid`, role: "user" } : null;
  });
  app.use(express.json());
  app.use("/runtime", createNautilusServerPaperRuntimeRouter({ manager, authenticate: requireSaasAuth, enabled: true, ordersEnabled: false }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await jsonRequest(`http://127.0.0.1:${address.port}`, "/runtime/orders", "707", "POST", {
      side: "BUY", orderType: "MARKET", quantity: "0.001", reduceOnly: false,
    }, { "Idempotency-Key": "must-not-submit-01" });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, "PAPER_ORDER_SUBMISSION_DISABLED");
    const protectedResponse = await jsonRequest(`http://127.0.0.1:${address.port}`, "/runtime/protected-entries", "707", "POST", {
      side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "88000",
    }, { "Idempotency-Key": "must-not-submit-protected-01" });
    assert.equal(protectedResponse.status, 503);
    assert.equal(protectedResponse.body.code, "PAPER_ORDER_SUBMISSION_DISABLED");
    assert.deepEqual(manager.getLifecycle(707), {
      lifecycle: "UNAVAILABLE", simulationSessionId: null, accountId: null, reason: "no_server_paper_session",
    }, "disabled order route must not start a daemon as a side effect");
  } finally {
    __setSaasAuthResolverForTests(null);
    await manager.dispose();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("daemon loss and supervisor restart preserve UNRECOVERED without adopting a process", { timeout: 120_000 }, async () => {
  const registryDir = await mkdtemp(path.join(tmpdir(), "gt-n3d5-restart-"));
  const registryPath = path.join(registryDir, "sessions.sqlite");
  const managerA = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    registryPath,
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
  });
  try {
    const first = await managerA.startForUser(404);
    const sessions = (managerA as unknown as { sessions: Map<number, { supervisorMetadata: Record<string, unknown>; exitPromise: Promise<void> }> }).sessions;
    const child = sessions.get(404);
    assert.ok(child);
    const daemonPid = Number(child.supervisorMetadata.daemonPid);
    assert.ok(Number.isInteger(daemonPid) && daemonPid > 0);
    spawnSync("taskkill", ["/PID", String(daemonPid), "/T", "/F"], { stdio: "ignore" });
    await child.exitPromise;
    assert.equal(managerA.getLifecycle(404).lifecycle, "UNRECOVERED");
    managerA.closeRegistry();

    const managerB = new NautilusServerPaperRuntimeManager({
      runtimeRoot,
      registryPath,
      startTimeoutMs: 90_000,
      requestTimeoutMs: 10_000,
    });
    try {
      const afterRestart = managerB.getLifecycle(404);
      assert.equal(afterRestart.lifecycle, "UNRECOVERED");
      assert.equal(afterRestart.simulationSessionId, first.simulationSessionId);
      await assert.rejects(managerB.startForUser(404), (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "PAPER_RUNTIME_UNRECOVERED",
      );
    } finally {
      await managerB.dispose();
    }
  } finally {
    await managerA.dispose();
    await rm(registryDir, { recursive: true, force: true });
  }
});

test("authenticated PAPER order API uses a fresh controlled BBO and confirms Nautilus OCO to FLAT", { timeout: 180_000 }, async () => {
  const registryDir = await mkdtemp(path.join(tmpdir(), "gt-n3d5-e2e-"));
  let quoteSequence = 0;
  let currentPrices = { bid: "85000", ask: "85001" };
  let feedUpdateListener: ((quote: ServerPaperQuoteObservation | null, reason?: string) => void) | null = null;
  const controlledQuote = (): ServerPaperQuoteObservation => {
    const observedAtMs = Date.now();
    quoteSequence += 1;
    return {
      source: "CONTROLLED_TEST_PERP_BBO",
      symbol: "BTCUSDT",
      marketType: "perpetual",
      bid: currentPrices.bid,
      ask: currentPrices.ask,
      bidSize: "5",
      askSize: "5",
      sourceTimestampMs: observedAtMs,
      observedAtMs,
      sourceAgeMs: 0,
      endpoint: "test://controlled-perp-bbo",
      sequence: quoteSequence,
    };
  };
  let runtime!: NautilusServerPaperRuntimeManager;
  runtime = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    allowOrderAuthorization: true,
    ordersEnabled: true,
    allowControlledTestQuotes: true,
    registryPath: path.join(registryDir, "sessions.sqlite"),
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
    quoteProvider: async () => controlledQuote(),
    subscribeQuoteUpdates: (listener) => {
      feedUpdateListener = listener;
      return () => { feedUpdateListener = null; };
    },
  });
  __setSaasAuthResolverForTests((req) => {
    const raw = req.header("x-test-user");
    return raw ? { id: Number(raw), email: `paper-${raw}@example.invalid`, role: "user" } : null;
  });
  const app = express();
  app.use(express.json());
  app.use("/runtime", createNautilusServerPaperRuntimeRouter({ manager: runtime, authenticate: requireSaasAuth, enabled: true, ordersEnabled: true }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const start = await jsonRequest(baseUrl, "/runtime/session", "808", "POST");
    assert.equal(start.status, 201, JSON.stringify(start.body));
    runtime.grantOrderExecution(808, start.body.simulationSessionId);
    assertLoadedPackageEvidence(runtime, 808);
    const initialSnapshot = await jsonRequest(baseUrl, "/runtime/snapshot", "808");
    assert.equal(initialSnapshot.status, 200);
    assert.equal(initialSnapshot.body.position.side, "FLAT");

    const entryIntent = { side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "88000" };
    const [entryA, entryB] = await Promise.all([
      jsonRequest(baseUrl, "/runtime/protected-entries", "808", "POST", entryIntent, { "Idempotency-Key": "protected-entry-command-001" }),
      jsonRequest(baseUrl, "/runtime/protected-entries", "808", "POST", entryIntent, { "Idempotency-Key": "protected-entry-command-001" }),
    ]);
    if (entryA.status !== 201) {
      const commandAfterFailure = await jsonRequest(baseUrl, "/runtime/protected-entries/protected-entry-command-001", "808");
      assert.fail(JSON.stringify({ response: entryA.body, command: commandAfterFailure.body }));
    }
    assert.ok([200, 201].includes(entryB.status));
    assert.equal(entryA.body.protected, true);
    assert.equal(entryA.body.result.state, "PROTECTED");
    assert.equal(entryA.body.result.simulationSessionId, start.body.simulationSessionId);
    assert.equal(entryA.body.result.entry.status, "FILLED");
    assert.equal(entryA.body.result.protections.stopLoss.status, "ACCEPTED");
    assert.equal(entryA.body.result.protections.takeProfit.status, "ACCEPTED");
    const entryOrder = entryA.body.result.entry as Record<string, unknown>;
    const stopOrderResult = entryA.body.result.protections.stopLoss as Record<string, unknown>;
    const takeOrderResult = entryA.body.result.protections.takeProfit as Record<string, unknown>;
    assert.equal(entryB.body.result.entry.clientOrderId, entryOrder.clientOrderId);
    const conflictingReplay = await jsonRequest(baseUrl, "/runtime/protected-entries", "808", "POST", {
      ...entryIntent, quantity: "0.002",
    }, { "Idempotency-Key": "protected-entry-command-001" });
    assert.equal(conflictingReplay.status, 409);
    assert.equal(conflictingReplay.body.code, "PAPER_IDEMPOTENCY_CONFLICT");
    const legacyUnprotectedEntry = await jsonRequest(baseUrl, "/runtime/orders", "808", "POST", {
      side: "BUY", orderType: "MARKET", quantity: "0.001", reduceOnly: false,
    }, { "Idempotency-Key": "legacy-unprotected-01" });
    assert.equal(legacyUnprotectedEntry.status, 409);
    assert.equal(legacyUnprotectedEntry.body.code, "PAPER_PROTECTED_ENTRY_REQUIRED");
    const afterEntry = await jsonRequest(baseUrl, "/runtime/snapshot", "808");
    assert.equal(afterEntry.body.position.side, "LONG");
    assert.equal(afterEntry.body.position.quantity, "0.001");
    assert.equal(afterEntry.body.position.simulationSessionId, start.body.simulationSessionId);

    const groupId = entryA.body.result.protectionGroupId;
    const positionId = stopOrderResult.positionId;
    assert.equal(typeof positionId, "string");
    assert.ok(positionId.length > 0);
    for (const protection of [stopOrderResult, takeOrderResult]) {
      assert.equal(protection.simulationSessionId, start.body.simulationSessionId);
      assert.equal(protection.positionId, positionId);
      assert.equal(protection.protectionGroupId, groupId);
      assert.equal(protection.status, "ACCEPTED");
    }

    const beforeTrigger = await jsonRequest(baseUrl, "/runtime/market/status", "808");
    assert.equal(beforeTrigger.body.marketData.sourceAvailable, true);
    assert.equal(beforeTrigger.body.marketData.marketDataSource, "CONTROLLED_TEST_PERP_BBO");
    assert.equal(beforeTrigger.body.protectionEvaluation.state, "QUOTE_FRESH");
    await new Promise((resolve) => setTimeout(resolve, 3_100));
    const staleProtectionStatus = await jsonRequest(baseUrl, "/runtime/market/status", "808");
    assert.equal(staleProtectionStatus.body.marketData.sourceAvailable, false);
    assert.equal(staleProtectionStatus.body.protectionEvaluation.state, "SUSPENDED_FEED_UNAVAILABLE");
    assert.equal(staleProtectionStatus.body.protectionEvaluation.activeProtectionOrders.length, 2);
    assert.ok(staleProtectionStatus.body.protectionEvaluation.activeProtectionOrders.every((order: Record<string, unknown>) => order.status === "ACCEPTED"));
    assert.equal((await jsonRequest(baseUrl, "/runtime/snapshot", "808")).body.position.side, "LONG", "stale feed must not fabricate a fill or close");
    assert.ok(feedUpdateListener);
    feedUpdateListener!(null, "controlled_feed_disconnect");
    const disconnectedStatus = await jsonRequest(baseUrl, "/runtime/market/status", "808");
    assert.equal(disconnectedStatus.body.marketData.sourceAvailable, false);
    assert.equal(disconnectedStatus.body.marketData.reason, "controlled_feed_disconnect");
    assert.equal(disconnectedStatus.body.protectionEvaluation.state, "SUSPENDED_FEED_UNAVAILABLE");
    currentPrices = { bid: "88001", ask: "88002" };
    const recoveredQuote = controlledQuote();
    feedUpdateListener!(recoveredQuote);
    const recoveredStatus = await jsonRequest(baseUrl, "/runtime/market/status", "808");
    assert.equal(recoveredStatus.body.marketData.sourceAvailable, true);
    assert.equal(recoveredStatus.body.marketData.marketDataSource, "CONTROLLED_TEST_PERP_BBO");
    assert.equal(recoveredStatus.body.marketData.sourceTimestampMs, recoveredQuote.sourceTimestampMs);
    assert.equal(Number(recoveredStatus.body.market.bestBid), Number(recoveredQuote.bid));

    await runtime.reconcileProtections(808);
    const finalSnapshot = await jsonRequest(baseUrl, "/runtime/snapshot", "808");
    const finalOrdersResponse = await jsonRequest(baseUrl, "/runtime/orders", "808");
    const fillsResponse = await jsonRequest(baseUrl, "/runtime/fills", "808");
    const eventsResponse = await jsonRequest(baseUrl, "/runtime/events", "808");
    assert.equal(finalSnapshot.body.position.side, "FLAT");
    const orders = finalOrdersResponse.body.orders as Array<Record<string, unknown>>;
    const stopOrder = orders.find((order) => order.clientOrderId === stopOrderResult.clientOrderId);
    const takeProfitOrder = orders.find((order) => order.clientOrderId === takeOrderResult.clientOrderId);
    assert.ok(stopOrder);
    assert.ok(takeProfitOrder);
    assert.equal(takeProfitOrder.status, "FILLED");
    assert.ok(["CANCELED", "CANCELLED"].includes(String(stopOrder.status)));
    const fills = fillsResponse.body.fills as Array<Record<string, unknown>>;
    const fillForEntry = fills.filter((fill) => fill.clientOrderId === entryOrder.clientOrderId);
    const fillForTp = fills.filter((fill) => fill.clientOrderId === takeOrderResult.clientOrderId);
    assert.equal(fillForEntry.length, 1);
    assert.equal(fillForTp.length, 1);
    const events = eventsResponse.body.events as Array<Record<string, unknown>>;
    assert.ok(events.some((event) => event.eventType === "OrderFilled" && event.clientOrderId === takeOrderResult.clientOrderId));
    assert.ok(events.some((event) => event.clientOrderId === stopOrderResult.clientOrderId && /cancel/i.test(String(event.eventType))));
  } finally {
    __setSaasAuthResolverForTests(null);
    await runtime.dispose();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(registryDir, { recursive: true, force: true });
  }
});

test("stale server BBO blocks order creation before Nautilus receives an order", { timeout: 120_000 }, async () => {
  const registryDir = await mkdtemp(path.join(tmpdir(), "gt-n3d5-stale-"));
  const runtime = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    allowOrderAuthorization: true,
    ordersEnabled: true,
    allowControlledTestQuotes: true,
    registryPath: path.join(registryDir, "sessions.sqlite"),
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
    quoteProvider: async () => {
      const observedAtMs = Date.now();
      return {
        source: "CONTROLLED_TEST_PERP_BBO",
        symbol: "BTCUSDT",
        marketType: "perpetual",
        bid: "85000",
        ask: "85001",
        bidSize: "5",
        askSize: "5",
        sourceTimestampMs: observedAtMs,
        observedAtMs,
        sourceAgeMs: 3_001,
        endpoint: "test://controlled-perp-bbo",
      };
    },
  });
  __setSaasAuthResolverForTests((req) => {
    const raw = req.header("x-test-user");
    return raw ? { id: Number(raw), email: `paper-${raw}@example.invalid`, role: "user" } : null;
  });
  const app = express();
  app.use(express.json());
  app.use("/runtime", createNautilusServerPaperRuntimeRouter({ manager: runtime, authenticate: requireSaasAuth, enabled: true, ordersEnabled: true }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const start = await jsonRequest(baseUrl, "/runtime/session", "909", "POST");
    assert.equal(start.status, 201, JSON.stringify(start.body));
    runtime.grantOrderExecution(909, start.body.simulationSessionId);
    assertLoadedPackageEvidence(runtime, 909);
    const rejected = await jsonRequest(baseUrl, "/runtime/protected-entries", "909", "POST", {
      side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "88000",
    }, { "Idempotency-Key": "stale-bbo-entry-01" });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, "PAPER_MARKET_QUOTE_STALE");
    assert.deepEqual((await jsonRequest(baseUrl, "/runtime/orders", "909")).body.orders, []);
    assert.equal((await jsonRequest(baseUrl, "/runtime/snapshot", "909")).body.position.side, "FLAT");
  } finally {
    __setSaasAuthResolverForTests(null);
    await runtime.dispose();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(registryDir, { recursive: true, force: true });
  }
});

test("protected entry reports incomplete protection and blocks retry after TP submission failure", { timeout: 180_000 }, async () => {
  const registryDir = await mkdtemp(path.join(tmpdir(), "gt-n3d5-protection-fail-"));
  let sequence = 0;
  const runtime = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    allowOrderAuthorization: true,
    ordersEnabled: true,
    allowControlledTestQuotes: true,
    registryPath: path.join(registryDir, "sessions.sqlite"),
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
    quoteProvider: async () => {
      const observedAtMs = Date.now();
      return {
        source: "CONTROLLED_TEST_PERP_BBO", symbol: "BTCUSDT", marketType: "perpetual",
        bid: "85000", ask: "85001", bidSize: "5", askSize: "5",
        sourceTimestampMs: observedAtMs, observedAtMs, sourceAgeMs: 0,
        endpoint: "test://controlled-perp-bbo", sequence: ++sequence,
      };
    },
    protectedEntryBeforeLeg: (leg) => {
      if (leg === "TAKE_PROFIT") throw new Error("isolated_native_take_profit_submit_timeout");
    },
  });
  __setSaasAuthResolverForTests((req) => req.header("x-test-user") === "811"
    ? { id: 811, email: "paper-811@example.invalid", role: "user" }
    : null);
  const app = express();
  app.use(express.json());
  app.use("/runtime", createNautilusServerPaperRuntimeRouter({ manager: runtime, authenticate: requireSaasAuth, enabled: true, ordersEnabled: true }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const start = await jsonRequest(baseUrl, "/runtime/session", "811", "POST");
    assert.equal(start.status, 201, JSON.stringify(start.body));
    runtime.grantOrderExecution(811, start.body.simulationSessionId);
    const intent = { side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "88000" };
    const failed = await jsonRequest(baseUrl, "/runtime/protected-entries", "811", "POST", intent, { "Idempotency-Key": "protected-failure-001" });
    assert.equal(failed.status, 409);
    assert.equal(failed.body.code, "PAPER_PROTECTED_ENTRY_INCOMPLETE");
    assert.equal(failed.body.protected, undefined, "failure response must never claim protection");
    const command = await jsonRequest(baseUrl, "/runtime/protected-entries/protected-failure-001", "811");
    assert.equal(command.body.status, "AMBIGUOUS");
    assert.equal(command.body.protected, false);
    assert.equal(command.body.result.state, "PROTECTION_INCOMPLETE");
    assert.equal(command.body.result.protections.stopLoss.status, "ACCEPTED");
    assert.equal(command.body.result.protections.takeProfit, null);
    const snapshot = await jsonRequest(baseUrl, "/runtime/snapshot", "811");
    assert.equal(snapshot.body.position.side, "LONG");
    assert.equal(snapshot.body.position.quantity, "0.001");
    const orders = await jsonRequest(baseUrl, "/runtime/orders", "811");
    assert.equal(orders.body.orders.length, 2, "entry and only the accepted SL should exist");
    const repeated = await jsonRequest(baseUrl, "/runtime/protected-entries", "811", "POST", intent, { "Idempotency-Key": "protected-failure-001" });
    assert.equal(repeated.status, 409);
    assert.equal(repeated.body.code, "PAPER_PROTECTED_ENTRY_AMBIGUOUS");
    const retryNewKey = await jsonRequest(baseUrl, "/runtime/protected-entries", "811", "POST", intent, { "Idempotency-Key": "protected-failure-002" });
    assert.equal(retryNewKey.status, 409);
    assert.equal(retryNewKey.body.code, "PAPER_ENTRY_BLOCKED_UNPROTECTED_POSITION");
    assert.equal((await jsonRequest(baseUrl, "/runtime/orders", "811")).body.orders.length, 2, "no automatic or manual duplicate legs were created");
    assert.equal((await jsonRequest(baseUrl, "/runtime/fills", "811")).body.fills.length, 1, "the single entry fill must not be duplicated by retries");
  } finally {
    __setSaasAuthResolverForTests(null);
    await runtime.dispose();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(registryDir, { recursive: true, force: true });
  }
});
