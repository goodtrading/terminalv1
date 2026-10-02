import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NautilusServerPaperRuntimeManager, type ServerPaperQuoteObservation } from "./nautilusServerPaperRuntime";

const runtimeRoot = process.env.GT_N3D5_ISOLATED_RUNTIME;

function controlledQuote(sequence: number, bid: string): ServerPaperQuoteObservation {
  const now = Date.now();
  return {
    source: "CONTROLLED_TEST_PERP_BBO",
    symbol: "BTCUSDT",
    marketType: "perpetual",
    bid,
    ask: String(Number(bid) + 1),
    bidSize: "1",
    askSize: "1",
    sourceTimestampMs: now,
    observedAtMs: now,
    sourceAgeMs: 1,
    endpoint: "test://controlled-perp-bbo",
    sequence,
  };
}

async function waitUntil<T>(read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for isolated PAPER feed transition.");
}

test("packaged daemon survives repeated stale-feed RPCs and applies fresh quotes again", {
  timeout: 240_000,
  skip: !runtimeRoot || !existsSync(path.join(runtimeRoot, "python.exe")),
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-paper-feed-recovery-"));
  let publish: ((observation: ServerPaperQuoteObservation | null, reason?: string) => void) | undefined;
  const manager = new NautilusServerPaperRuntimeManager({
    runtimeRoot: runtimeRoot!,
    registryPath: path.join(root, "server-paper-sessions.sqlite"),
    maxSessions: 1,
    startTimeoutMs: 60_000,
    requestTimeoutMs: 5_000,
    prewarmPackage: true,
    allowControlledTestQuotes: true,
    subscribeQuoteUpdates: (listener) => { publish = listener; return () => { publish = undefined; }; },
  });

  try {
    const started = await manager.startForUser(731);
    const sessionId = started.simulationSessionId;
    assert.ok(sessionId);
    assert.ok(publish);

    publish!(null, "no_quote_received");
    const noInitialQuote = await waitUntil(
      () => manager.readRuntimeStatus(731),
      (status) => (status.marketData as Record<string, unknown> | undefined)?.reason === "no_quote_received",
    );
    assert.equal(noInitialQuote.state, "RUNNING");
    assert.equal(noInitialQuote.simulationSessionId, sessionId);

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      publish!(controlledQuote(cycle * 2 - 1, String(84_000 + cycle * 10)));
      const fresh = await waitUntil(
        () => manager.readRuntimeStatus(731),
        (status) => (status.marketData as Record<string, unknown> | undefined)?.sourceAvailable === true,
      );
      assert.equal(fresh.simulationSessionId, sessionId);

      await new Promise((resolve) => setTimeout(resolve, 3_100));
      const stale = await manager.readRuntimeStatus(731);
      assert.equal((stale.marketData as Record<string, unknown>).sourceAvailable, false);
      assert.equal((stale.marketData as Record<string, unknown>).reason, "quote_stale");

      publish!(null, "controlled_quote_expired");
      const unavailable = await waitUntil(
        () => manager.readRuntimeStatus(731),
        (status) => (status.marketData as Record<string, unknown> | undefined)?.reason === "controlled_quote_expired",
      );
      assert.equal(unavailable.state, "RUNNING");
      assert.equal(unavailable.simulationSessionId, sessionId);

      const [snapshot, orders] = await Promise.all([
        manager.readSnapshot(731),
        manager.readOrders(731),
      ]);
      assert.equal(snapshot.simulationSessionId, sessionId);
      assert.equal(snapshot.position.side, "FLAT");
      assert.equal(Number(snapshot.position.quantity), 0);
      assert.deepEqual(orders, []);
      assert.equal((await manager.readRuntimeStatus(731)).state, "RUNNING");

      publish!(controlledQuote(cycle * 2, String(84_000 + cycle * 10 + 1)));
      const recovered = await waitUntil(
        () => manager.readRuntimeStatus(731),
        (status) => (status.marketData as Record<string, unknown> | undefined)?.sourceAvailable === true,
      );
      assert.equal(recovered.simulationSessionId, sessionId);
      assert.equal(((recovered.marketData as Record<string, unknown>).reason), null);
    }
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("a late unavailable-marker acknowledgement does not kill the daemon or corrupt the next RPC", {
  timeout: 60_000,
  skip: !runtimeRoot || !existsSync(path.join(runtimeRoot, "python.exe")),
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-paper-late-marker-"));
  let publishDelayed: ((observation: ServerPaperQuoteObservation | null, reason?: string) => void) | undefined;
  const daemonScriptPath = path.join(root, "delayed-marker-daemon.py");
  const delayedDaemon = String.raw`
import hashlib, json, os, sys, time
from pathlib import Path
root = Path("{{RUNTIME_ROOT}}")
modules = {}
for name, rel in {"daemon":"goodtrading/daemon.py", "contracts":"goodtrading/contracts.py", "simulation_core":"goodtrading/simulation_core.py", "simulation_service":"goodtrading/simulation_service.py", "quote_stream":"goodtrading/quote_stream.py"}.items():
    p = root / rel
    modules[name] = {"path": str(p.resolve()), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
session_id = "late-marker-test-session"
for line in sys.stdin:
    req = json.loads(line)
    op = req.get("op")
    if op == "simulation.mark_market_data_unavailable":
        time.sleep(0.25)
        result = {"markedUnavailable": True, "reason": (req.get("params") or {}).get("reason")}
    elif op == "health":
        result = {"status":"healthy", "nautilusVersion":"1.231.0", "runtimeModules":modules}
    elif op == "simulation.start":
        result = {"state":"RUNNING", "simulationSessionId":session_id, "sessionLifecycle":"ACTIVE"}
    elif op == "simulation.get_account":
        result = {"accountId":"SIM-001", "balance":"100000", "simulationSessionId":session_id}
    elif op == "simulation.get_position":
        result = {"side":"FLAT", "quantity":"0", "simulationSessionId":session_id}
    elif op == "simulation.status":
        result = {"state":"RUNNING", "simulationSessionId":session_id, "marketData":{"sourceAvailable":False,"reason":"quote_stale"}}
    elif op == "simulation.list_orders":
        result = []
    elif op == "shutdown":
        print(json.dumps({"id":req.get("id"),"ok":True,"result":{"shutdown":True}}, separators=(",", ":")), flush=True)
        break
    else:
        result = {}
    print(json.dumps({"id":req.get("id"),"ok":True,"result":result}, separators=(",", ":")), flush=True)
`.replace("{{RUNTIME_ROOT}}", runtimeRoot!.replace(/\\/g, "/"));
  await writeFile(daemonScriptPath, delayedDaemon);
  const manager = new NautilusServerPaperRuntimeManager({
    runtimeRoot: runtimeRoot!,
    daemonScriptPath,
    registryPath: path.join(root, "server-paper-sessions.sqlite"),
    maxSessions: 1,
    startTimeoutMs: 5_000,
    requestTimeoutMs: 100,
    subscribeQuoteUpdates: (listener) => { publishDelayed = listener; return () => { publishDelayed = undefined; }; },
  });
  try {
    const started = await manager.startForUser(732);
    publishDelayed!(null, "controlled_quote_expired");
    await new Promise((resolve) => setTimeout(resolve, 350));
    const status = await manager.readRuntimeStatus(732);
    assert.equal(status.simulationSessionId, started.simulationSessionId);
    assert.equal(status.state, "RUNNING");
    assert.equal(manager.getLifecycle(732).lifecycle, "AVAILABLE");
    assert.equal((await manager.readSnapshot(732)).position.side, "FLAT");
    assert.deepEqual(await manager.readOrders(732), []);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
