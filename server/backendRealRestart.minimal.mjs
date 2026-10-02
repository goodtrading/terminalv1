// R14 control only: PURE_JS_PREIMPORT. Canonical A→B acceptance is
// server/backendRealRestart.clean.acceptance.mjs.

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const t0 = process.hrtime.bigint();
const now = () => Number(process.hrtime.bigint() - t0) / 1e6;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(os.tmpdir(), `gt-n13b-r14-${randomUUID()}`);
const registryPath = path.join(root, "sessions.sqlite");
const launcher = path.join(repoRoot, "server", "backendRestartPureBootstrap.mjs");
const events = [];
function snapshot(step) { events.push({ step, tMs: now(), exists: existsSync(registryPath), size: existsSync(registryPath) ? statSync(registryPath).size : null }); }
await mkdir(root);
snapshot("after_mkdir");
const watcher = watch(root, { persistent: false }, (eventType, filename) => { events.push({ step: `fs_${eventType}_${String(filename)}`, tMs: now(), exists: existsSync(registryPath), size: existsSync(registryPath) ? statSync(registryPath).size : null }); });
const env = { ...process.env, GT_PENDING_REGISTRY_PATH: registryPath, GT_TEST_RUNTIME_ROOT: path.join(repoRoot, "build", "n2c", "runtime", "nautilus-runtime"), GT_TEST_OWNER_ID: "1901", GT_TEST_MODE: "restart-state", GT_REPO_ROOT: repoRoot, GT_BACKEND_HARNESS_PATH: path.join(repoRoot, "server", "backendShutdownHarness.ts"), GT_TSX_LOADER: pathToFileURL(path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs")).href, GOODTRADING_REGISTRY_TRACE: "1", NODE_ENV: "test", TSX_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.json") };
snapshot("before_spawn");
const child = spawn(process.execPath, [launcher], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
events.push({ step: "spawn_return", tMs: now(), childPid: child.pid });
let pending = "";
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout ${JSON.stringify(events)}`)), 30_000);
  child.stdout.on("data", (chunk) => {
    pending += chunk.toString();
    for (;;) {
      const i = pending.indexOf("\n"); if (i < 0) break;
      const line = pending.slice(0, i).trim(); pending = pending.slice(i + 1);
      events.push({ step: "stdout", tMs: now(), line });
      try { const record = JSON.parse(line); if (record.phase === "child_pre_import_ready") { snapshot("child_pre_import_ready"); clearTimeout(timer); resolve(record); } } catch { }
    }
  });
  child.stderr.on("data", (chunk) => events.push({ step: "stderr", tMs: now(), line: chunk.toString() }));
  child.once("exit", (code, signal) => { if (code !== 0) { clearTimeout(timer); reject(new Error(`exit ${code}/${signal} ${JSON.stringify(events)}`)); } });
});
const record = await ready;
assert.equal(record.registry?.exists, false, `pure preimport contaminated: ${JSON.stringify(record)}`);
child.kill();
await new Promise((resolve) => child.once("exit", resolve));
watcher.close();
console.log(JSON.stringify({ root, registryPath, record, events }, null, 2));
await rm(root, { recursive: true, force: true });
