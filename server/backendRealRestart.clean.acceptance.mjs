import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const startedAt = process.hrtime.bigint();
const elapsedMs = () => Number(process.hrtime.bigint() - startedAt) / 1e6;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const ownerUserId = "1901";
const root = path.join(os.tmpdir(), `gt-n13b-clean-${randomUUID()}`);
const registryPath = path.join(root, "sessions.sqlite");
const launcher = path.join(repoRoot, "server", "backendRestartPureBootstrap.mjs");
const harness = path.join(repoRoot, "server", "backendShutdownHarness.ts");
const tsxLoader = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const runtimeRoot = path.join(repoRoot, "build", "n2c", "runtime", "nautilus-runtime");
const timeline = [];

function fileSnapshot(step) {
  const exists = existsSync(registryPath);
  const info = exists ? statSync(registryPath) : null;
  const result = { step, tMs: elapsedMs(), exists, size: info?.size ?? null, mtimeMs: info?.mtimeMs ?? null };
  timeline.push(result);
  return result;
}
function hashFile(filePath) {
  if (!existsSync(filePath)) return null;
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}
function killTree(pid) {
  if (Number.isInteger(pid) && pid > 0) spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
}
function killExact(pid) {
  if (Number.isInteger(pid) && pid > 0) spawnSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
}
function envFor(mode) {
  return {
    ...process.env,
    GT_PENDING_REGISTRY_PATH: registryPath,
    GT_TEST_SHADOW_ROOT: path.join(root, "shadow"),
    GT_TEST_RUNTIME_ROOT: runtimeRoot,
    GT_TEST_OWNER_ID: ownerUserId,
    GT_TEST_MODE: mode,
    GT_REPO_ROOT: repoRoot,
    GT_BACKEND_HARNESS_PATH: harness,
    GT_TSX_LOADER: pathToFileURL(tsxLoader).href,
    TSX_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.json"),
    GOODTRADING_REGISTRY_TRACE: "1",
    NODE_ENV: "test",
  };
}
async function readJson(response, label) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${label}: HTTP ${response.status}: ${text}`); }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}: ${text}; root=${root}`);
  return body;
}
async function http(port, pathname, options = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
}
function startBackend(mode, expectFresh = true) {
  fileSnapshot(`${mode}_before_spawn`);
  const child = spawn(node, [launcher], { cwd: root, env: envFor(mode), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  timeline.push({ step: `${mode}_spawn_return`, tMs: elapsedMs(), pid: child.pid });
  const output = [];
  let pending = "";
  let backendExitedResolve;
  const backendExited = new Promise((resolve) => { backendExitedResolve = resolve; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${mode} timeout: ${output.join("")}`)), 180_000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString();
      for (;;) {
        const newline = pending.indexOf("\n");
        if (newline < 0) break;
        const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
        output.push(`${line}\n`);
        try {
          const record = JSON.parse(line);
          if (record.phase === "child_pre_import_ready") {
            const snapshot = fileSnapshot(`${mode}_child_pre_import_ready`);
            if (expectFresh && (record.registry?.exists || snapshot.exists)) {
              clearTimeout(timer);
              reject(new Error(`${mode}: registry exists before RELEASE: ${line}; timeline=${JSON.stringify(timeline)}`));
              return;
            }
            if (!expectFresh && !snapshot.exists) {
              clearTimeout(timer);
              reject(new Error(`${mode}: persisted registry disappeared before RELEASE: ${line}; timeline=${JSON.stringify(timeline)}`));
              return;
            }
            child.stdin.write("RELEASE_FROM_PARENT\n");
            timeline.push({ step: `${mode}_release`, tMs: elapsedMs() });
          } else if (record.phase === "ready") {
            clearTimeout(timer);
            fileSnapshot(`${mode}_backend_ready`);
            resolve(record);
          } else if (record.phase === "backend_child_exit") {
            backendExitedResolve(record);
          }
        } catch { /* retain non-JSON diagnostics */ }
      }
    });
    child.stderr.on("data", (chunk) => output.push(`[stderr] ${chunk.toString()}`));
    child.once("exit", (code, signal) => {
      if (code !== 0) { clearTimeout(timer); reject(new Error(`${mode} exited ${code}/${signal}: ${output.join("")}`)); }
    });
  });
  return { child, ready, backendExited, output };
}
async function stopBackend(handle, ready) {
  const response = await http(ready.port, "/__test/backend-shutdown", { method: "POST" });
  await readJson(response, "backend shutdown");
  killExact(ready.backendPid);
  const backendExit = await handle.backendExited;
  assert.ok([0, 1, null].includes(backendExit.code), `backend child shutdown exit ${backendExit.code}/${backendExit.signal}`);
}
async function exitLauncher(handle) {
  handle.child.stdin.write("EXIT_AFTER_BACKEND\n");
  const [code, signal] = await new Promise((resolve) => handle.child.once("exit", (exitCode, exitSignal) => resolve([exitCode, exitSignal])));
  assert.equal(code, 0, `launcher exit ${code}/${signal}`);
}
async function snapshot(port) {
  const headers = { "x-test-user": ownerUserId };
  const [session, state, orders, fills, events, daemon] = await Promise.all([
    http(port, "/api/paper/nautilus/runtime/session", { headers }),
    http(port, "/api/paper/nautilus/runtime/snapshot", { headers }),
    http(port, "/api/paper/nautilus/runtime/orders", { headers }),
    http(port, "/api/paper/nautilus/runtime/fills", { headers }),
    http(port, "/api/paper/nautilus/runtime/events", { headers }),
    http(port, "/__test/daemon"),
  ]);
  return {
    session: await readJson(session, "session snapshot"),
    snapshot: await readJson(state, "canonical snapshot"),
    orders: await readJson(orders, "orders snapshot"),
    fills: await readJson(fills, "fills snapshot"),
    events: await readJson(events, "events snapshot"),
    daemon: await readJson(daemon, "daemon metadata"),
  };
}

async function sessionState(port) {
  return readJson(await http(port, "/api/paper/nautilus/runtime/session", { headers: { "x-test-user": ownerUserId } }), "session state");
}
async function autonomousState(port) {
  return readJson(await http(port, "/__test/autonomous/state"), "autonomous state");
}

await mkdir(root);
const watcher = watch(root, { persistent: false }, (eventType, filename) => timeline.push({ step: `fs_${eventType}_${String(filename)}`, tMs: elapsedMs(), exists: existsSync(registryPath), size: existsSync(registryPath) ? statSync(registryPath).size : null }));
let backendA;
let backendB;
let backendC;
let before;
let after;
try {
  assert.equal(fileSnapshot("pre_spawn_fresh").exists, false);
  backendA = startBackend("boot-only");
  const bootA = await backendA.ready;
  assert.equal(bootA.lifecycle, "UNAVAILABLE");
  const prePostA = await sessionState(bootA.port);
  assert.equal(prePostA.lifecycle, "UNAVAILABLE");
  assert.equal(prePostA.simulationSessionId, null);

  const create = await readJson(await http(bootA.port, "/__test/create-session", { method: "POST" }), "create PAPER session");
  assert.equal(create.lifecycle, "AVAILABLE");
  const sessionA = await readJson(await http(bootA.port, "/api/paper/nautilus/runtime/session", { headers: { "x-test-user": ownerUserId } }), "session after POST");
  assert.equal(sessionA.lifecycle, "AVAILABLE");
  const autoCreate = await readJson(await http(bootA.port, "/__test/autonomous/create", { method: "POST" }), "create autonomous PAPER session");
  const n13bBeforeId = autoCreate.session.sessionId;
  const n13bSimulationId = autoCreate.session.paperSimulationSessionId;
  await readJson(await http(bootA.port, "/__test/autonomous/cycle", { method: "POST", body: JSON.stringify({ action: "ENTER_LONG" }) }), "N13B entry cycle");
  await readJson(await http(bootA.port, "/__test/autonomous/cycle", { method: "POST", body: JSON.stringify({ action: "HOLD" }) }), "N13B hold cycle");
  const n13bPre = await autonomousState(bootA.port);
  assert.equal(n13bPre.session.status, "RUNNING");
  assert.ok(n13bPre.session.decisionCount >= 2);
  const n13bCounts = { decision: n13bPre.session.decisionCount, journal: n13bPre.session.journal.length, intents: n13bPre.session.executionIntentCount };
  before = await snapshot(bootA.port);
  assert.equal(before.snapshot.position.side, "LONG");
  assert.ok(before.orders.orders.length >= 3);
  assert.ok(before.fills.fills.length >= 1);
  const backendPidA = bootA.backendPid;

  await stopBackend(backendA, bootA);
  assert.equal(existsSync(registryPath), true);

  backendB = startBackend("boot-only", false);
  const bootB = await backendB.ready;
  assert.equal(bootB.lifecycle, "AVAILABLE");
  const persistedBeforeAttach = await sessionState(bootB.port);
  assert.equal(persistedBeforeAttach.lifecycle, "AVAILABLE");
  const attach = await readJson(await http(bootB.port, "/api/paper/nautilus/runtime/session", { method: "POST", headers: { "x-test-user": ownerUserId } }), "reattach session");
  assert.equal(attach.lifecycle, "AVAILABLE");
  after = await snapshot(bootB.port);
  assert.notEqual(bootB.backendPid, backendPidA);
  assert.equal(after.session.simulationSessionId, before.session.simulationSessionId);
  assert.equal(after.daemon.supervisorPid, before.daemon.supervisorPid);
  assert.equal(after.daemon.pid, before.daemon.pid);
  assert.equal(after.daemon.daemonInstanceId, before.daemon.daemonInstanceId);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.fills, before.fills);

  const afterRetry = await snapshot(bootB.port);
  assert.deepEqual(afterRetry.snapshot.position, after.snapshot.position);
  assert.deepEqual(afterRetry.orders, after.orders);
  assert.deepEqual(afterRetry.fills, after.fills);
  const n13bAfterRecovery = await autonomousState(bootB.port);
  assert.equal(n13bAfterRecovery.session.sessionId, n13bBeforeId);
  assert.equal(n13bAfterRecovery.session.paperSimulationSessionId, n13bSimulationId);
  assert.equal(n13bAfterRecovery.session.status, "PAUSED");
  assert.equal(n13bAfterRecovery.session.decisionCount, n13bCounts.decision);
  assert.equal(n13bAfterRecovery.session.journal.length, n13bCounts.journal);
  assert.equal(n13bAfterRecovery.session.executionIntentCount, n13bCounts.intents);
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  const n13bAfterWait = await autonomousState(bootB.port);
  assert.equal(n13bAfterWait.session.status, "PAUSED");
  assert.equal(n13bAfterWait.session.decisionCount, n13bCounts.decision);
  await snapshot(bootB.port);
  await readJson(await http(bootB.port, "/__test/autonomous/resume", { method: "POST" }), "N13B explicit resume");
  await readJson(await http(bootB.port, "/__test/autonomous/cycle", { method: "POST", body: JSON.stringify({ action: "HOLD" }) }), "N13B resumed cycle");
  const n13bAfterResume = await autonomousState(bootB.port);
  assert.equal(n13bAfterResume.session.status, "RUNNING");
  assert.ok(n13bAfterResume.session.decisionCount > n13bCounts.decision);
  await readJson(await http(bootB.port, "/__test/autonomous/stop", { method: "POST" }), "N13B explicit stop");
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  const n13bFinal = await autonomousState(bootB.port);
  assert.equal(n13bFinal.session.status, "STOPPED");
  assert.equal(n13bFinal.session.decisionCount, n13bAfterResume.session.decisionCount);

  await exitLauncher(backendA);
  backendA = undefined;
  console.log(JSON.stringify({
    result: "PASS",
    oldHarness: "HARNESS_CONTAMINATED_NONCANONICAL",
    freshBackendBoot: { preSpawn: false, preImport: false, healthReadySessions: "UNAVAILABLE", prePostSessions: "UNAVAILABLE", postPostSessions: "AVAILABLE" },
    backend: { pidA: backendPidA, pidB: bootB.backendPid },
    supervisor: { pidBefore: before.daemon.supervisorPid, pidAfter: after.daemon.supervisorPid, epochBefore: before.daemon.supervisorEpoch ?? null, epochAfter: after.daemon.supervisorEpoch ?? null },
    nautilus: { daemonPidBefore: before.daemon.pid, daemonPidAfter: after.daemon.pid, daemonInstanceIdBefore: before.daemon.daemonInstanceId, daemonInstanceIdAfter: after.daemon.daemonInstanceId },
    session: { before: before.session.simulationSessionId, after: after.session.simulationSessionId },
    canonicalPaper: { before: before.snapshot, after: after.snapshot, ordersBefore: before.orders.orders, ordersAfter: after.orders.orders, fillsBefore: before.fills.fills, fillsAfter: after.fills.fills },
    n13b: { sessionIdBefore: n13bBeforeId, sessionIdAfter: n13bFinal.session.sessionId, simulationSessionIdBefore: n13bSimulationId, simulationSessionIdAfter: n13bFinal.session.paperSimulationSessionId, statusBefore: n13bPre.session.status, statusAfterRecovery: n13bAfterRecovery.session.status, decisionCountBefore: n13bPre.session.decisionCount, decisionCountAfterRecovery: n13bAfterRecovery.session.decisionCount, decisionCountAfterWait: n13bAfterWait.session.decisionCount, decisionCountAfterResume: n13bAfterResume.session.decisionCount, journalCount: n13bFinal.session.journal.length, executionIntentCount: n13bFinal.session.executionIntentCount, autoResume: "NO", reconciliation: "PASS", finalStop: n13bFinal.session.status === "STOPPED" ? "PASS" : "FAIL", gate: "PASS" },
    n13bRestartDurability: "PASS",
    restartAroundSubmit: "NOT_RUN",
    registry: { path: registryPath, size: statSync(registryPath).size, sha256: hashFile(registryPath) },
    timeline,
  }, null, 2));
    await readJson(await http(bootB.port, "/__test/stop-runtime", { method: "POST" }), "explicit PAPER runtime stop");
    await stopBackend(backendB, bootB);
    await exitLauncher(backendB);
    backendB = undefined;
} finally {
  watcher.close();
  if (process.env.KEEP_GT_CLEAN !== "1") {
    for (const handle of [backendC, backendB, backendA]) if (handle?.child?.exitCode == null && handle?.child?.pid) killTree(handle.child.pid);
    for (const pid of new Set([before?.daemon?.supervisorPid, after?.daemon?.supervisorPid, before?.daemon?.pid, after?.daemon?.pid])) killTree(pid);
  }
  if (process.env.KEEP_GT_CLEAN !== "1") await rm(root, { recursive: true, force: true });
  else console.error(`KEEP_GT_CLEAN root=${root} registry=${registryPath}`);
}
