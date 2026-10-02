import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

type Ready = {
  phase: string;
  backendPid: number;
  supervisorPid: number;
  supervisorEpoch: string;
  daemonPid: number;
  daemonInstanceId: string;
  simulationSessionId: string;
  port: number;
  lifecycle: string;
  snapshot: Record<string, unknown>;
  orders: unknown[];
  fills: unknown[];
};

const harnessPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "backendShutdownHarness.ts");
const launcherPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "backendRestartPureBootstrap.mjs");
const tsxLoader = path.resolve("node_modules/tsx/dist/loader.mjs");
const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");
const repoRoot = path.resolve(process.cwd());

function startBackend(root: string, registryPath: string, mode: string): { child: ChildProcess; ready: Promise<Ready> } {
  const child = spawn(process.execPath, [launcherPath], {
    cwd: root,
    env: {
      ...process.env,
      GT_TEST_RUNTIME_ROOT: runtimeRoot,
      GT_PENDING_REGISTRY_PATH: registryPath,
      GT_TEST_OWNER_ID: "1901",
      GT_TEST_MODE: mode,
      GT_REPO_ROOT: repoRoot,
      GT_BACKEND_HARNESS_PATH: harnessPath,
      GT_TSX_LOADER: pathToFileURL(tsxLoader).href,
      GOODTRADING_REGISTRY_TRACE: "1",
      TSX_TSCONFIG_PATH: path.resolve("tsconfig.json"),
      NODE_ENV: "test",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const output: string[] = [];
  let pending = "";
  const ready = new Promise<Ready>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`backend readiness timeout: ${output.join("")}`)), 150_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout?.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      for (;;) {
        const newline = pending.indexOf("\n");
        if (newline < 0) break;
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        output.push(`${line}\n`);
        try {
          const record = JSON.parse(line) as Ready & { phase: string };
          if (record.phase === "child_pre_import_ready") {
            void stat(registryPath).then(() => reject(new Error(`registry appeared before import: ${registryPath}; launcher=${line}`)), () => {
              child.stdin?.write("RELEASE_FROM_PARENT\n");
            });
            continue;
          }
          if (record.phase === "ready") {
            clearTimeout(timer);
            resolve(record);
            return;
          }
        } catch { /* diagnostics retained */ }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => output.push(`[stderr] ${chunk.toString()}`));
    child.once("exit", (code, signal) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error(`backend exited code=${code} signal=${signal}: ${output.join("")}`));
      }
    });
  });
  return { child, ready };
}

async function stopBackend(child: ChildProcess, ready: Ready): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${ready.port}/__test/backend-shutdown`, { method: "POST" });
  assert.equal(response.status, 202);
  const [code] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => child.once("exit", (...args) => resolve(args)));
  assert.equal(code, 0);
}

async function health(ready: Ready): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${ready.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "isolated-paper-backend" });
}

test("real backend process A to B restart preserves supervisor, daemon, and canonical PAPER state", { timeout: 420_000 }, async () => {
  const root = path.join(os.tmpdir(), `gt-n13b-backend-restart-${randomUUID()}`);
  await mkdir(root, { recursive: false });
  const registryPath = path.join(root, "sessions.sqlite");
  let registryBefore: { exists: boolean; size: number | null; mtimeMs: number | null } = { exists: false, size: null, mtimeMs: null };
  try { const info = await stat(registryPath); registryBefore = { exists: true, size: info.size, mtimeMs: info.mtimeMs }; } catch { /* expected fresh path */ }
  assert.equal(registryBefore.exists, false, `registry path unexpectedly existed: ${registryPath}`);
  let backendA: ReturnType<typeof startBackend> | undefined;
  let backendB: ReturnType<typeof startBackend> | undefined;
  let before: Ready | undefined;
  let after: Ready | undefined;
  try {
    backendA = startBackend(root, registryPath, "restart-state");
    before = await backendA.ready;
    await health(before);
    assert.equal(before.lifecycle, "AVAILABLE");
    assert.equal(before.snapshot.position && (before.snapshot.position as Record<string, unknown>).side, "LONG");
    assert.ok(before.orders.length >= 3);
    assert.ok(before.fills.length >= 1);

    await stopBackend(backendA.child, before);
    assert.notEqual(backendA.child.exitCode, null);

    backendB = startBackend(root, registryPath, "run");
    after = await backendB.ready;
    await health(after);
    assert.notEqual(after.backendPid, before.backendPid);
    assert.equal(after.supervisorPid, before.supervisorPid);
    assert.equal(after.supervisorEpoch, before.supervisorEpoch);
    assert.equal(after.daemonPid, before.daemonPid);
    assert.equal(after.daemonInstanceId, before.daemonInstanceId);
    assert.equal(after.simulationSessionId, before.simulationSessionId);
    assert.equal(after.lifecycle, "AVAILABLE");
    assert.deepEqual(after.snapshot, before.snapshot);
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.fills, before.fills);

    console.log(JSON.stringify({
      result: "PASS",
      backendPidBefore: before.backendPid,
      backendPidAfter: after.backendPid,
      supervisorPid: before.supervisorPid,
      supervisorEpoch: before.supervisorEpoch,
      daemonPid: before.daemonPid,
      daemonInstanceId: before.daemonInstanceId,
      simulationSessionId: before.simulationSessionId,
      canonicalStatePreserved: true,
    }));
    await stopBackend(backendB.child, after);
    backendB = undefined;
  } finally {
    for (const pid of new Set([before?.supervisorPid, after?.supervisorPid, before?.daemonPid, after?.daemonPid].filter((value): value is number => Number.isInteger(value) && value > 0))) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }
    for (const child of [backendB?.child, backendA?.child]) {
      if (child && child.exitCode == null && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    }
    await rm(root, { recursive: true, force: true });
  }
});
