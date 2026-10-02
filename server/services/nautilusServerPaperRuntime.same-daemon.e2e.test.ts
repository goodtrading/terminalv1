import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NautilusServerPaperRuntimeManager, type ServerPaperQuoteObservation } from "./nautilusServerPaperRuntime";

const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");

test("real supervisor preserves the same Nautilus daemon and canonical PAPER state across backend disconnect", { timeout: 240_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-n13b-same-daemon-"));
  let sequence = 0;
  const quoteProvider = async (): Promise<ServerPaperQuoteObservation> => {
    const now = Date.now();
    sequence += 1;
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
      sourceAgeMs: 0,
      endpoint: "test://controlled-perp-bbo",
      sequence,
    };
  };
  const options = {
    runtimeRoot,
    registryPath: path.join(root, "sessions.sqlite"),
    prewarmPackage: true,
    allowControlledTestQuotes: true,
    allowOrderAuthorization: true,
    ordersEnabled: true,
    startTimeoutMs: 90_000,
    requestTimeoutMs: 15_000,
    quoteProvider,
  } as const;
  const first = new NautilusServerPaperRuntimeManager(options);
  try {
    const ownerUserId = 991;
    const started = await first.startForUser(ownerUserId);
    first.grantOrderExecution(ownerUserId, started.simulationSessionId);
    const beforeIdentity = await first.lookupForUser(ownerUserId);
    assert.ok(beforeIdentity);
    const beforeSnapshot = await first.readSnapshot(ownerUserId);
    const beforeOrders = await first.readOrders(ownerUserId);
    const beforeFills = await first.readFills(ownerUserId);
    const entry = await first.submitProtectedEntryCommand(ownerUserId, "same-daemon-entry-001", {
      side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "86000",
    });
    assert.equal(entry.command.status, "ACKNOWLEDGED");
    const afterEntrySnapshot = await first.readSnapshot(ownerUserId);
    const afterEntryOrders = await first.readOrders(ownerUserId);
    const afterEntryFills = await first.readFills(ownerUserId);
    assert.equal(afterEntrySnapshot.position.side, "LONG");
    assert.ok(afterEntryOrders.length >= 3);
    assert.ok(afterEntryFills.length >= 1);
    await first.disconnect();

    const second = new NautilusServerPaperRuntimeManager(options);
    try {
      const reattached = await second.startForUser(ownerUserId);
      assert.deepEqual(reattached, { simulationSessionId: started.simulationSessionId, alreadyRunning: true });
      const afterIdentity = await second.lookupForUser(ownerUserId);
      assert.ok(afterIdentity);
      assert.equal(afterIdentity.supervisorEpoch, beforeIdentity.supervisorEpoch);
      assert.equal(afterIdentity.daemonInstanceId, beforeIdentity.daemonInstanceId);
      assert.equal(afterIdentity.daemonPid, beforeIdentity.daemonPid);
      assert.equal(afterIdentity.simulationSessionId, beforeIdentity.simulationSessionId);
      const afterSnapshot = await second.readSnapshot(ownerUserId);
      const afterOrders = await second.readOrders(ownerUserId);
      const afterFills = await second.readFills(ownerUserId);
      assert.deepEqual(afterSnapshot.position, afterEntrySnapshot.position);
      assert.deepEqual(afterOrders, afterEntryOrders);
      assert.deepEqual(afterFills, afterEntryFills);
      second.grantOrderExecution(ownerUserId, started.simulationSessionId);
      assert.equal((await second.submitProtectedEntryCommand(ownerUserId, "same-daemon-entry-001", {
        side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "86000",
      })).created, false);
      await second.stopForUser(ownerUserId);
    } finally {
      await second.dispose();
    }
    assert.equal(beforeSnapshot.position.side, "FLAT");
    assert.equal(beforeOrders.length, 0);
    assert.equal(beforeFills.length, 0);
  } finally {
    await first.disconnect();
    await rm(root, { recursive: true, force: true });
  }
});
