import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ServerPaperSessionRegistry } from "./serverPaperSessionRegistry";

async function withRegistry(fn: (registry: ServerPaperSessionRegistry) => void): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "gt-n13b-registry-"));
  const registry = new ServerPaperSessionRegistry(path.join(dir, "paper.sqlite"));
  try { fn(registry); } finally { registry.close(); await rm(dir, { recursive: true, force: true }); }
}

const base = { n13bSessionId: "paper-session", decisionId: "decision-1", executionIntentId: "intent-1", idempotencyKey: "key-1", instrument: "BTCUSDT", action: "ENTER_LONG", side: "BUY", quantity: "1", marketCapturedAt: "2026-10-01T00:00:00.000Z", evidenceHash: "hash-1", riskPolicyVersion: "N13B-v1" } as const;

test("autonomous intent reservation is owner and simulation-session scoped", async () => {
  await withRegistry((registry) => {
    const a = registry.reserveAutonomousIntent({ ownerUserId: 1, simulationSessionId: "sim-a", ...base });
    const aReplay = registry.reserveAutonomousIntent({ ownerUserId: 1, simulationSessionId: "sim-a", ...base });
    const b = registry.reserveAutonomousIntent({ ownerUserId: 2, simulationSessionId: "sim-b", ...base });
    const c = registry.reserveAutonomousIntent({ ownerUserId: 1, simulationSessionId: "sim-c", ...base });
    assert.equal(a.created, true); assert.equal(aReplay.created, false); assert.equal(b.created, true); assert.equal(c.created, true);
    assert.equal(a.intent.executionIntentId, aReplay.intent.executionIntentId);
    assert.equal(b.intent.ownerUserId, 2);
    assert.equal(c.intent.simulationSessionId, "sim-c");
  });
});

test("autonomous evidence is append-only and preserves ambiguity before reconciliation", async () => {
  await withRegistry((registry) => {
    registry.reserveAutonomousIntent({ ownerUserId: 1, simulationSessionId: "sim-a", ...base });
    registry.appendAutonomousEvidence({ ownerUserId: 1, simulationSessionId: "sim-a", idempotencyKey: "key-1", status: "INTENT_CREATED", evidence: { ...base, submittedAt: null } });
    registry.appendAutonomousEvidence({ ownerUserId: 1, simulationSessionId: "sim-a", idempotencyKey: "key-1", status: "AMBIGUOUS", evidence: { commandId: "command-1", submittedAt: "2026-10-01T00:00:01.000Z" } });
    registry.appendAutonomousEvidence({ ownerUserId: 1, simulationSessionId: "sim-a", idempotencyKey: "key-1", status: "RECONCILED", evidence: { commandId: "command-1", entryOrderId: "order-1", protectionGroupId: "group-1", reconciliationStatus: "FILLED" } });
    const rows = registry.listAutonomousEvidence(1, "sim-a", "key-1");
    assert.deepEqual(rows.map((row) => row.status), ["INTENT_CREATED", "AMBIGUOUS", "RECONCILED"]);
    assert.equal(rows[1].evidence.commandId, "command-1");
    assert.equal(registry.listAutonomousEvidence(2, "sim-a", "key-1").length, 0);
  });
});
