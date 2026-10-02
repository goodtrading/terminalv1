import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { ServerPaperSessionRegistry } from "./serverPaperSessionRegistry";

test("explicit discard preserves UNRECOVERED history and permits a distinct session", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "server-paper-discard-"));
  const registry = new ServerPaperSessionRegistry(path.join(root, "sessions.sqlite"));
  const oldRecordId = randomUUID();
  const oldSessionId = "98ab88f2-821b-4098-8275-3b7d0647ac2a";
  const reason = "native_request_timeout:simulation.mark_market_data_unavailable";
  try {
    registry.reserve(731, oldRecordId, 4);
    registry.transition(oldRecordId, "UNRECOVERED", {
      simulationSessionId: oldSessionId,
      accountId: "SIM-001",
      reason,
    });
    const discard = registry.recordUnrecoveredDiscard({
      recordId: oldRecordId,
      ownerUserId: 731,
      simulationSessionId: oldSessionId,
      reason,
      finalOperationalState: "UNRECOVERED",
      position: "UNKNOWN",
      orders: "UNKNOWN",
      daemon: "ABSENT",
    });
    assert.equal(discard.finalOperationalState, "UNRECOVERED");
    assert.equal(registry.latest(731)?.lifecycle, "UNRECOVERED");
    assert.equal(registry.isUnrecoveredDiscarded(oldRecordId), true);

    const newRecordId = randomUUID();
    const newSessionId = randomUUID();
    registry.reserve(731, newRecordId, 4);
    registry.transition(newRecordId, "AVAILABLE", { simulationSessionId: newSessionId, accountId: "SIM-001" });
    assert.equal(registry.latest(731)?.recordId, newRecordId);
    assert.notEqual(registry.latest(731)?.simulationSessionId, oldSessionId);
    assert.equal(registry.isUnrecoveredDiscarded(oldRecordId), true);
  } finally {
    registry.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("pre-identity startup cleanup uncertainty stays UNRECOVERED with null identity and unknown state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "server-paper-startup-evidence-"));
  const registryPath = path.join(root, "sessions.sqlite");
  const recordId = randomUUID();
  try {
    const registry = new ServerPaperSessionRegistry(registryPath);
    registry.reserve(731, recordId, 4);
    registry.transition(recordId, "UNRECOVERED", { reason: "daemon_start_cleanup_unconfirmed" });
    const evidence = registry.recordUnrecoveredStartupAttempt({
      recordId,
      ownerUserId: 731,
      simulationSessionId: null,
      lifecycle: "UNRECOVERED",
      position: "UNKNOWN",
      orders: "UNKNOWN",
      permissions: "NONE",
      commands: "NONE_SENT",
      reason: "daemon_start_cleanup_unconfirmed",
      cleanupConfirmed: false,
    });
    assert.equal(evidence.simulationSessionId, null);
    assert.equal(evidence.lifecycle, "UNRECOVERED");
    assert.equal(registry.latest(731)?.lifecycle, "UNRECOVERED");
    assert.equal(registry.latest(731)?.simulationSessionId, null);
    assert.equal(registry.isUnrecoveredDiscarded(recordId), true);
    assert.throws(() => registry.recordUnrecoveredStartupAttempt({
      recordId,
      ownerUserId: 731,
      simulationSessionId: null,
      lifecycle: "UNRECOVERED",
      position: "FLAT" as never,
      orders: "UNKNOWN",
      permissions: "NONE",
      commands: "NONE_SENT",
      reason: "daemon_start_cleanup_unconfirmed",
      cleanupConfirmed: false,
    }));
    registry.close();
    const reopened = new ServerPaperSessionRegistry(registryPath);
    try {
      assert.equal(reopened.latest(731)?.lifecycle, "UNRECOVERED");
      assert.equal(reopened.latest(731)?.simulationSessionId, null);
      assert.equal(reopened.isUnrecoveredDiscarded(recordId), true);
      assert.equal(reopened.reserve(731, randomUUID(), 4).lifecycle, "STARTING");
    } finally { reopened.close(); }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
