import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NautilusServerPaperRuntimeManager } from "./nautilusServerPaperRuntime";
import { ServerPaperSessionRegistry } from "./serverPaperSessionRegistry";

const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");

test("new real daemon starts only after explicit discard and does not inherit session state", { timeout: 120_000 }, async () => {
  assert.ok(existsSync(path.join(runtimeRoot, "python.exe")));
  const directory = await mkdtemp(path.join(os.tmpdir(), "server-paper-discard-runtime-"));
  const registryPath = path.join(directory, "sessions.sqlite");
  const registry = new ServerPaperSessionRegistry(registryPath);
  const ownerUserId = 731;
  const previousRecordId = randomUUID();
  const previousSessionId = "98ab88f2-821b-4098-8275-3b7d0647ac2a";
  const previousReason = "native_request_timeout:simulation.mark_market_data_unavailable";
  registry.reserve(ownerUserId, previousRecordId, 4);
  registry.transition(previousRecordId, "UNRECOVERED", {
    simulationSessionId: previousSessionId,
    accountId: "SIM-001",
    reason: previousReason,
  });
  registry.recordUnrecoveredDiscard({
    recordId: previousRecordId,
    ownerUserId,
    simulationSessionId: previousSessionId,
    reason: previousReason,
    finalOperationalState: "UNRECOVERED",
    position: "UNKNOWN",
    orders: "UNKNOWN",
    daemon: "ABSENT",
  });
  registry.close();

  const manager = new NautilusServerPaperRuntimeManager({
    runtimeRoot,
    prewarmPackage: true,
    maxSessions: 4,
    startTimeoutMs: 90_000,
    requestTimeoutMs: 10_000,
    registryPath,
  });
  try {
    const started = await manager.startForUser(ownerUserId);
    assert.notEqual(started.simulationSessionId, previousSessionId);
    const snapshot = await manager.readSnapshot(ownerUserId);
    assert.equal(snapshot.simulationSessionId, started.simulationSessionId);
    assert.equal(snapshot.account.accountId, "SIM-001");
    assert.equal(snapshot.account.simulationSessionId, started.simulationSessionId);
    assert.equal(snapshot.position.side, "FLAT");
    assert.equal(snapshot.position.simulationSessionId, started.simulationSessionId);
    assert.deepEqual(await manager.readOrders(ownerUserId), []);
    assert.deepEqual(await manager.readFills(ownerUserId), []);
    assert.equal(manager.getLifecycle(ownerUserId).simulationSessionId, started.simulationSessionId);
    assert.equal(manager["getRegistry"]().latest(ownerUserId)?.lifecycle, "AVAILABLE");
    assert.equal(manager["getRegistry"]().isUnrecoveredDiscarded(previousRecordId), true);
    const stopped = await manager.stopForUser(ownerUserId);
    assert.equal(stopped.lifecycle, "TERMINATED");
    assert.equal(manager["getRegistry"]().latest(ownerUserId)?.lifecycle, "TERMINATED");
  } finally {
    await manager.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
