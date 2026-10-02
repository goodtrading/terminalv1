import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests, requireSaasAuth } from "../middleware/saasAuth";
import { NautilusServerPaperRuntimeManager, type ServerPaperQuoteObservation } from "../services/nautilusServerPaperRuntime";
import { createNautilusServerPaperRuntimeRouter } from "./nautilusServerPaperRuntime.routes";

const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");

async function request(base: string, route: string, userId: number, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { "x-test-user": String(userId), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

test("server PAPER execution authorization is exact-session, default-deny and idempotent with real isolated daemons", { timeout: 240_000 }, async () => {
  assert.ok(existsSync(path.join(runtimeRoot, "python.exe")), "isolated packaged Nautilus Python is required");
  assert.ok(existsSync(path.join(runtimeRoot, "daemon.py")), "isolated packaged Nautilus daemon is required");
  const dir = await mkdtemp(path.join(tmpdir(), "gt-n3d5-session-auth-"));
  let stale = false;
  let quoteSequence = 0;
  const quoteProvider = async (): Promise<ServerPaperQuoteObservation> => {
    const now = Date.now();
    quoteSequence += 1;
    return {
      source: "CONTROLLED_TEST_PERP_BBO",
      symbol: "BTCUSDT",
      marketType: "perpetual",
      bid: "85000",
      ask: "85001",
      bidSize: "5",
      askSize: "5",
      sourceTimestampMs: now,
      observedAtMs: now,
      sourceAgeMs: stale ? 3_001 : 0,
      endpoint: "test://controlled-perp-bbo",
      sequence: quoteSequence,
    };
  };
  const manager = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    prewarmPackage: true,
    registryPath: path.join(dir, "sessions.sqlite"),
    maxSessions: 3,
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
    allowControlledTestQuotes: true,
    allowOrderAuthorization: true,
    ordersEnabled: true,
    quoteProvider,
  });
  const app = express();
  app.use(express.json());
  __setSaasAuthResolverForTests((req) => {
    const raw = req.header("x-test-user");
    return raw && /^\d+$/.test(raw) ? { id: Number(raw), email: `paper-${raw}@example.invalid`, role: "user" } : null;
  });
  app.use("/runtime", createNautilusServerPaperRuntimeRouter({ manager, authenticate: requireSaasAuth, enabled: true, ordersEnabled: true }));
  let server: Server | undefined;

  try {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;

    const startA = await request(base, "/runtime/session", 51, "POST");
    const startOther = await request(base, "/runtime/session", 52, "POST");
    assert.equal(startA.status, 201, JSON.stringify(startA.body));
    assert.equal(startOther.status, 201, JSON.stringify(startOther.body));
    const sessionA = String(startA.body.simulationSessionId);
    assert.notEqual(sessionA, startOther.body.simulationSessionId);
    const foreignIdentityProbe = await request(base, `/runtime/snapshot?userId=51&simulationSessionId=${encodeURIComponent(sessionA)}`, 52);
    assert.equal(foreignIdentityProbe.status, 200);
    assert.equal(foreignIdentityProbe.body.simulationSessionId, startOther.body.simulationSessionId, "query-supplied owner/session must not select another runtime");
    assert.equal((await request(base, "/runtime/session", 51)).body.executionAuthorization.authorized, false);

    const protectedIntent = { side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "88000" };
    const selfGrantAttempt = await request(base, "/runtime/protected-entries", 51, "POST", {
      ...protectedIntent, userId: 51, simulationSessionId: sessionA, ordersEnabled: true,
    }, { "Idempotency-Key": "browser-self-grant-01" });
    assert.equal(selfGrantAttempt.status, 403, JSON.stringify(selfGrantAttempt.body));
    assert.equal((await request(base, "/runtime/session", 51)).body.executionAuthorization.authorized, false);
    assert.equal((await request(base, "/runtime/protected-entries", 52, "POST", protectedIntent, { "Idempotency-Key": "foreign-user-try-01" })).status, 403);
    await assert.rejects(
      Promise.resolve().then(() => manager.grantOrderExecution(52, sessionA)),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "PAPER_SESSION_OWNERSHIP_MISMATCH",
    );

    assert.deepEqual(manager.grantOrderExecution(51, sessionA), { authorized: true, simulationSessionId: sessionA });
    assert.equal((await request(base, "/runtime/session", 51)).body.orderSubmissionEnabled, true);
    assert.equal((await request(base, "/runtime/session", 52)).body.orderSubmissionEnabled, false);
    const changedPermissionPayload = await request(base, "/runtime/protected-entries", 51, "POST", {
      ...protectedIntent, userId: 51, simulationSessionId: sessionA, ordersEnabled: true,
    }, { "Idempotency-Key": "browser-identity-spoof-01" });
    assert.equal(changedPermissionPayload.status, 400, JSON.stringify(changedPermissionPayload.body));
    const replayKey = "same-session-order-001";
    const [first, duplicate] = await Promise.all([
      request(base, "/runtime/protected-entries", 51, "POST", protectedIntent, { "Idempotency-Key": replayKey }),
      request(base, "/runtime/protected-entries", 51, "POST", protectedIntent, { "Idempotency-Key": replayKey }),
    ]);
    assert.ok([200, 201].includes(first.status), JSON.stringify(first.body));
    assert.ok([200, 201].includes(duplicate.status), JSON.stringify(duplicate.body));
    assert.equal(first.body.protected, true, JSON.stringify(first.body));
    assert.equal(first.body.result.state, "PROTECTED");
    assert.equal(duplicate.body.result.entry.clientOrderId, first.body.result.entry.clientOrderId);
    const snapshotA = await request(base, "/runtime/snapshot", 51);
    const ordersA = await request(base, "/runtime/orders", 51);
    const fillsA = await request(base, "/runtime/fills", 51);
    assert.equal(snapshotA.body.position.simulationSessionId, sessionA);
    assert.equal(snapshotA.body.position.side, "LONG");
    assert.equal(snapshotA.body.position.quantity, "0.001");
    assert.equal(ordersA.body.orders.length, 3);
    assert.equal(fillsA.body.fills.length, 1);
    const entry = first.body.result.entry;
    const stopLoss = first.body.result.protections.stopLoss;
    const takeProfit = first.body.result.protections.takeProfit;
    assert.equal(stopLoss.status, "ACCEPTED");
    assert.equal(takeProfit.status, "ACCEPTED");
    assert.equal(stopLoss.positionId, takeProfit.positionId);
    assert.equal(stopLoss.protectionGroupId, takeProfit.protectionGroupId);
    assert.equal(stopLoss.positionId, entry.positionId);
    assert.equal(entry.status, "FILLED");
    const protectionEvents = (await request(base, "/runtime/events", 51)).body.events as Array<Record<string, unknown>>;
    for (const protection of [stopLoss, takeProfit]) {
      assert.ok(protectionEvents.some((event) => event.clientOrderId === protection.clientOrderId && event.reduceOnly === true),
        `native event evidence must confirm reduceOnly for ${String(protection.clientOrderId)}`);
    }

    const manualClose = await request(base, "/runtime/close-position", 51, "POST", {}, { "Idempotency-Key": "manual-close-order-001" });
    if (![200, 201].includes(manualClose.status)) {
      const closeDiagnostic = await request(base, "/runtime/close-position/manual-close-order-001", 51);
      const snapshotDiagnostic = await request(base, "/runtime/snapshot", 51);
      const ordersDiagnostic = await request(base, "/runtime/orders", 51);
      assert.fail(JSON.stringify({ manualClose: manualClose.body, closeDiagnostic: closeDiagnostic.body, snapshot: snapshotDiagnostic.body, orders: ordersDiagnostic.body }));
    }
    assert.equal(manualClose.body.closed, true, JSON.stringify(manualClose.body));
    assert.equal(manualClose.body.result.order.status, "FILLED");
    assert.equal((await request(base, "/runtime/snapshot", 51)).body.position.side, "FLAT");
    const ordersAfterClose = (await request(base, "/runtime/orders", 51)).body.orders as Array<Record<string, unknown>>;
    assert.ok(["CANCELED", "CANCELLED"].includes(String(ordersAfterClose.find((order) => order.clientOrderId === stopLoss.clientOrderId)?.status)));
    assert.ok(["CANCELED", "CANCELLED"].includes(String(ordersAfterClose.find((order) => order.clientOrderId === takeProfit.clientOrderId)?.status)));
    assert.equal(ordersAfterClose.filter((order) => ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(String(order.status).toUpperCase())).length, 0);
    assert.equal((await request(base, "/runtime/fills", 51)).body.fills.length, 2);
    const closeReplay = await request(base, "/runtime/close-position", 51, "POST", {}, { "Idempotency-Key": "manual-close-order-001" });
    assert.equal(closeReplay.status, 200);
    assert.equal(closeReplay.body.result.order.clientOrderId, manualClose.body.result.order.clientOrderId);

    manager.revokeOrderExecution(51, sessionA);
    assert.equal((await request(base, "/runtime/session", 51)).body.executionAuthorization.authorized, false);
    await request(base, "/runtime/session", 51, "DELETE");
    const startB = await request(base, "/runtime/session", 51, "POST");
    assert.equal(startB.status, 201, JSON.stringify(startB.body));
    const sessionB = String(startB.body.simulationSessionId);
    assert.notEqual(sessionB, sessionA);
    assert.equal((await request(base, "/runtime/session", 51)).body.executionAuthorization.authorized, false);
    assert.equal((await request(base, "/runtime/protected-entries", 51, "POST", protectedIntent, { "Idempotency-Key": "new-session-no-grant" })).status, 403);
    assert.throws(() => manager.grantOrderExecution(51, sessionA), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "PAPER_SESSION_OWNERSHIP_MISMATCH");

    manager.grantOrderExecution(51, sessionB);
    stale = true;
    const staleAttempt = await request(base, "/runtime/protected-entries", 51, "POST", protectedIntent, { "Idempotency-Key": "stale-feed-blocked-01" });
    assert.equal(staleAttempt.status, 409);
    assert.equal(staleAttempt.body.code, "PAPER_MARKET_QUOTE_STALE");
    assert.deepEqual((await request(base, "/runtime/orders", 51)).body.orders, []);
    assert.equal((await request(base, "/runtime/snapshot", 51)).body.position.side, "FLAT");

    const childRecords = (manager as unknown as { sessions: Map<number, { child: { kill(): void }; supervisorMetadata: Record<string, unknown>; exitPromise: Promise<void> }> }).sessions;
    const daemonB = childRecords.get(51);
    assert.ok(daemonB);
    const daemonPid = Number(daemonB.supervisorMetadata.daemonPid);
    assert.ok(Number.isInteger(daemonPid) && daemonPid > 0);
    spawnSync("taskkill", ["/PID", String(daemonPid), "/T", "/F"], { stdio: "ignore" });
    await daemonB.exitPromise;
    assert.equal(manager.getLifecycle(51).lifecycle, "UNRECOVERED");
    assert.deepEqual(manager.getOrderExecutionAuthorization(51), { authorized: false, simulationSessionId: sessionB });
    assert.equal((await request(base, "/runtime/protected-entries", 51, "POST", protectedIntent, { "Idempotency-Key": "lost-session-denied" })).status, 403);
    assert.equal((await request(base, "/runtime/session", 52)).body.executionAuthorization.authorized, false);
  } finally {
    __setSaasAuthResolverForTests(null);
    await manager.dispose();
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("server execution grant remains disabled by default even if a caller knows a user ID", () => {
  const manager = new NautilusServerPaperRuntimeManager({ runtimeRoot });
  try {
    assert.deepEqual(manager.getOrderExecutionAuthorization(71), { authorized: false, simulationSessionId: null });
    assert.throws(() => manager.grantOrderExecution(71, "known-but-not-owned-session"), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "PAPER_ORDER_AUTHORIZATION_UNAVAILABLE");
  } finally {
    manager.closeRegistry();
  }
});
