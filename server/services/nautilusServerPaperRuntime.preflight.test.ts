import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NautilusServerPaperRuntimeManager } from "./nautilusServerPaperRuntime";

const runtimeRoot = process.env.GT_N3D5_ISOLATED_RUNTIME;

test("cold package preflight warms imports before the unchanged 60s daemon health deadline", {
  timeout: 240_000,
  skip: !runtimeRoot || !existsSync(path.join(runtimeRoot, "python.exe")),
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-paper-cold-preflight-"));
  const registryPath = path.join(root, "sessions.sqlite");
  const manager = new NautilusServerPaperRuntimeManager({
    runtimeRoot: runtimeRoot!,
    registryPath,
    maxSessions: 1,
    startTimeoutMs: 60_000,
    requestTimeoutMs: 5_000,
    prewarmPackage: true,
  });
  try {
    const preflight = (manager as unknown as { packagePrewarm: Promise<void> }).packagePrewarm;
    assert.ok(preflight, "development server manager should start one package preflight");
    await preflight;
    assert.equal(existsSync(registryPath), false, "preflight must not reserve a session or create an operational registry");

    const started = await manager.startForUser(731);
    assert.equal(started.alreadyRunning, false);
    assert.ok(started.simulationSessionId);
    const [snapshot, orders, fills] = await Promise.all([
      manager.readSnapshot(731),
      manager.readOrders(731),
      manager.readFills(731),
    ]);
    assert.equal(snapshot.simulationSessionId, started.simulationSessionId);
    assert.equal(snapshot.account.accountId, "SIM-001");
    assert.equal(Number(snapshot.account.balance), 100_000);
    assert.equal(snapshot.position.side, "FLAT");
    assert.equal(orders.length, 0);
    assert.equal(fills.length, 0);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
