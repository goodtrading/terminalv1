// QUARANTINED: HARNESS_CONTAMINATED_NONCANONICAL.
// R14 observed a pre-import registry side effect only in this orchestrator.
// N13B evidence must use backendRealRestart.clean.acceptance.mjs instead.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const launcherPath = path.join(repoRoot, "server", "backendRestartPureBootstrap.mjs");
const harnessPath = path.join(repoRoot, "server", "backendShutdownHarness.ts");
const tsxLoader = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? path.join(repoRoot, "build", "n2c", "runtime", "nautilus-runtime"));
const ownerUserId = "1901";

const root = path.join(os.tmpdir(), `gt-n13b-backend-restart-${randomUUID()}`);
await mkdir(root);
const registryPath = path.join(root, "sessions.sqlite");
try { await stat(registryPath); throw new Error("registry existed before spawn"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

function startBackend(mode) {
  const child = spawn(node, [launcherPath], {
    cwd: root,
    env: {
      ...process.env,
      GT_PENDING_REGISTRY_PATH: registryPath,
      GT_TEST_RUNTIME_ROOT: runtimeRoot,
      GT_TEST_OWNER_ID: ownerUserId,
      GT_TEST_MODE: mode,
      GT_REPO_ROOT: repoRoot,
      GT_BACKEND_HARNESS_PATH: harnessPath,
      GT_TSX_LOADER: pathToFileURL(tsxLoader).href,
      TSX_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.json"),
      GOODTRADING_REGISTRY_TRACE: "1",
      NODE_ENV: "test",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const lines = [];
  let pending = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`backend timeout: ${lines.join("")}`)), 180_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString();
      for (;;) {
        const index = pending.indexOf("\n");
        if (index < 0) break;
        const line = pending.slice(0, index).trim(); pending = pending.slice(index + 1); lines.push(`${line}\n`);
        try {
          const record = JSON.parse(line);
          if (record.phase === "child_pre_import_ready") {
            if (record.registry?.exists) reject(new Error(`registry exists at pure pre-import: ${line}`));
            else child.stdin.write("RELEASE_FROM_PARENT\n");
          } else if (record.phase === "ready") { clearTimeout(timer); resolve(record); }
        } catch { /* diagnostics */ }
      }
    });
    child.stderr.on("data", (chunk) => lines.push(`[stderr] ${chunk.toString()}`));
    child.once("exit", (code, signal) => { if (code !== 0) { clearTimeout(timer); reject(new Error(`backend exited ${code}/${signal}: ${lines.join("")}`)); } });
  });
  return { child, ready };
}

async function healthy(record) {
  const response = await fetch(`http://127.0.0.1:${record.port}/health`);
  assert.equal(response.status, 200);
}
async function stopBackend(handle, record) {
  const response = await fetch(`http://127.0.0.1:${record.port}/__test/backend-shutdown`, { method: "POST" });
  assert.equal(response.status, 202);
  await new Promise((resolve) => handle.child.once("exit", resolve));
}
function kill(pid) { if (Number.isInteger(pid) && pid > 0) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); }

let a; let b; let before; let after;
try {
  a = startBackend("restart-state");
  before = await a.ready;
  await healthy(before);
  assert.equal(before.lifecycle, "AVAILABLE");
  assert.equal(before.snapshot.position?.side, "LONG");
  assert.ok(before.orders.length >= 3);
  assert.ok(before.fills.length >= 1);
  await stopBackend(a, before);

  b = startBackend("run");
  after = await b.ready;
  await healthy(after);
  assert.notEqual(after.backendPid, before.backendPid);
  assert.equal(after.supervisorPid, before.supervisorPid);
  assert.equal(after.supervisorEpoch, before.supervisorEpoch);
  assert.equal(after.daemonPid, before.daemonPid);
  assert.equal(after.daemonInstanceId, before.daemonInstanceId);
  assert.equal(after.simulationSessionId, before.simulationSessionId);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.fills, before.fills);
  console.log(JSON.stringify({ result: "PASS", registryPath, backendPidBefore: before.backendPid, backendPidAfter: after.backendPid, supervisorPid: before.supervisorPid, supervisorEpoch: before.supervisorEpoch, daemonPid: before.daemonPid, daemonInstanceId: before.daemonInstanceId, simulationSessionId: before.simulationSessionId, canonicalStatePreserved: true }));
  await stopBackend(b, after);
} finally {
  for (const pid of new Set([before?.supervisorPid, after?.supervisorPid, before?.daemonPid, after?.daemonPid])) kill(pid);
  for (const handle of [a, b]) if (handle?.child?.exitCode == null && handle?.child?.pid) kill(handle.child.pid);
  await rm(root, { recursive: true, force: true });
}
