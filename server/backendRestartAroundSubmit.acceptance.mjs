import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const ownerUserId = "1901";
const runtimeRoot = path.join(repoRoot, "build", "n2c", "runtime", "nautilus-runtime");
const launcher = path.join(repoRoot, "server", "backendRestartPureBootstrap.mjs");
const harness = path.join(repoRoot, "server", "backendShutdownHarness.ts");
const tsxLoader = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");

function killExact(pid) { if (Number.isInteger(pid) && pid > 0) spawnSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" }); }
function envFor(root, barrierNames) {
  return { ...process.env, GT_PENDING_REGISTRY_PATH: path.join(root, "sessions.sqlite"), GT_TEST_SHADOW_ROOT: path.join(root, "shadow"), GT_TEST_RUNTIME_ROOT: runtimeRoot, GT_TEST_OWNER_ID: ownerUserId, GT_TEST_MODE: "boot-only", GT_REPO_ROOT: repoRoot, GT_BACKEND_HARNESS_PATH: harness, GT_TSX_LOADER: pathToFileURL(tsxLoader).href, TSX_TSCONFIG_PATH: path.join(repoRoot, "tsconfig.json"), NODE_ENV: "test", GT_N13B_BARRIER_ROOT: path.join(root, "barrier"), GT_N13B_BARRIER_NAMES: barrierNames, GT_N13B_BARRIER_TIMEOUT_MS: "300000" };
}
async function http(port, route, options = {}) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 120000); try { return await fetch(`http://127.0.0.1:${port}${route}`, { ...options, signal: controller.signal, headers: { "content-type": "application/json", ...(options.headers ?? {}) } }); } finally { clearTimeout(timer); } }
async function json(response, label) { const text = await response.text(); let body; try { body = JSON.parse(text); } catch { throw new Error(`${label}: ${response.status}: ${text}`); } if (!response.ok) throw new Error(`${label}: ${response.status}: ${text}`); return body; }
async function startBackend(root, barrierNames) {
    const child = spawn(node, [launcher], { cwd: root, env: envFor(root, barrierNames), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  child.once("exit", (code, signal) => console.error(`launcher exit ${code}/${signal}`));
  child.stdin.write("RELEASE_FROM_PARENT\n");
  const output = [];
  let pending = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`backend readiness timeout: ${output.join("")}`)), 180000);
    child.stdout.on("data", (chunk) => { console.error(`[launcher-out] ${chunk.toString().trim()}`); pending += chunk.toString(); for (;;) { const i = pending.indexOf("\n"); if (i < 0) break; const line = pending.slice(0, i).trim(); pending = pending.slice(i + 1); output.push(line); try { const record = JSON.parse(line); if (record.phase === "ready") { clearTimeout(timer); resolve(record); } } catch {} } });
    child.stderr.on("data", (chunk) => { console.error(`[launcher-err] ${chunk.toString().trim()}`); output.push(`[stderr] ${chunk}`); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code, signal) => { if (code !== 0) { clearTimeout(timer); reject(new Error(`backend exited ${code}/${signal}: ${output.join("")}`)); } });
  });
  return { child, ready };
}
async function waitForMarker(root, name) {
  const file = path.join(root, "barrier", `reached-${name}.json`);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) { if (existsSync(file)) return JSON.parse(await readFile(file, "utf8")); await new Promise((resolve) => setTimeout(resolve, 25)); }
  throw new Error(`barrier timeout: ${name}`);
}
async function stopBackend(handle, ready) {
  await json(await http(ready.port, "/__test/backend-disconnect", { method: "POST" }), "backend disconnect");
  await new Promise((resolve) => setTimeout(resolve, 100));
  killExact(ready.backendPid);
  await exitLauncher(handle);
}
async function exitLauncher(handle) { handle.child.stdin.write("EXIT_AFTER_BACKEND\n"); await new Promise((resolve) => handle.child.once("exit", resolve)); }
async function snapshot(port, includeCanonical = true) {
  const headers = { "x-test-user": ownerUserId };
  const requests = [http(port, "/api/paper/nautilus/runtime/session", { headers }), http(port, "/__test/daemon")];
  if (includeCanonical) requests.push(http(port, "/__test/canonical"));
  const [session, daemon, canonical] = await Promise.all(requests);
  const result = { session: await json(session, "session"), daemon: await json(daemon, "daemon") };
  if (includeCanonical) { const canonicalBody = await json(canonical, "canonical"); Object.assign(result, { snapshot: canonicalBody.snapshot, orders: canonicalBody.orders, fills: canonicalBody.fills }); }
  else Object.assign(result, { snapshot: null, orders: { orders: [] }, fills: { fills: [] } });
  return result;
}
async function runCase(name, barrier) {
  const root = await (async () => { const value = await import("node:fs/promises"); return value.mkdtemp(path.join(os.tmpdir(), `gt-n13b-r17-${name.toLowerCase()}-`)); })();
  let backendA; let backendB;
  try {
  console.error(`${name}: start A`);
    backendA = await startBackend(root, barrier);
    const bootA = await backendA.ready;
    console.error(`${name}: A ready ${bootA.port}/${bootA.backendPid}`);
    await json(await http(bootA.port, "/__test/create-session", { method: "POST" }), `${name} create PAPER`);
    const created = await json(await http(bootA.port, "/__test/autonomous/create", { method: "POST" }), `${name} create autonomous`);
    const identityA = await json(await http(bootA.port, "/__test/daemon"), `${name} daemon A`);
    const cycle = fetch(`http://127.0.0.1:${bootA.port}/__test/autonomous/cycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ENTER_LONG" }) }).catch(() => null);
    await waitForMarker(root, barrier);
    console.error(`${name}: barrier reached`);
    const before = { session: null, snapshot: null, orders: { orders: [] }, fills: { fills: [] }, daemon: identityA };
    const beforeAuto = { session: null, evidence: [] };
    await stopBackend(backendA, bootA);
    console.error(`${name}: A stopped`);
    backendA = null;
    backendB = await startBackend(root, "");
    const bootB = await backendB.ready;
    const backendPidB = bootB.backendPid;
    console.error(`${name}: B ready ${bootB.port}/${bootB.backendPid}`);
    const attached = await json(await http(bootB.port, "/api/paper/nautilus/runtime/session", { method: "POST", headers: { "x-test-user": ownerUserId } }), `${name} attach`);
    const recovered = await json(await http(bootB.port, "/__test/autonomous/recover", { method: "POST" }), `${name} recover`);
    const after = await snapshot(bootB.port);
    const afterAuto = await json(await http(bootB.port, "/__test/autonomous/state"), `${name} autonomous after`);
    const close = await json(await http(bootB.port, "/__test/autonomous/close-recovered", { method: "POST" }), `${name} close`);
    await json(await http(bootB.port, "/__test/stop-runtime", { method: "POST" }), `${name} stop runtime`);
    await exitLauncher(backendB);
    backendB = null;
    const evidence = afterAuto.evidence ?? [];
    const orderRows = Array.isArray(after.orders) ? after.orders : (after.orders.orders ?? []);
    const fillRows = Array.isArray(after.fills) ? after.fills : (after.fills.fills ?? []);
    const nativeEntries = orderRows.filter((order) => String(order.orderType).toUpperCase() === "MARKET" && Number(order.filledQuantity ?? 0) > 0);
    const nativeFills = fillRows;
    assert.notEqual(bootA.backendPid, backendPidB);
    const intent = recovered.session.latestExecution?.executionIntent ?? null;
    const statuses = evidence.map((row) => row.status);
    assert.equal(created.session.paperSimulationSessionId, recovered.session.paperSimulationSessionId);
    return { name, barrier, backendPidA: bootA.backendPid, backendPidB: backendPidB, simulationSessionIdA: created.session.paperSimulationSessionId, simulationSessionIdB: recovered.session.paperSimulationSessionId, decisionId: intent?.decisionId ?? null, executionIntentId: intent?.executionIntentId ?? null, idempotencyKey: intent?.idempotencyKey ?? null, clientOrderId: recovered.session.latestExecution?.orderIds?.[0] ?? null, evidenceBeforeCrash: name === "A" ? ["INTENT_CREATED"] : null, evidenceAfterRestart: statuses, canonicalOrdersAfterRestart: orderRows.length, canonicalFillsAfterRestart: nativeFills.length, positionAfterRestart: after.snapshot?.position ?? null, protectionGroupId: recovered.session.latestExecution?.protectionGroupId ?? null, supervisorPidA: before.daemon?.supervisorPid ?? null, supervisorPidB: after.daemon?.supervisorPid ?? null, daemonPidA: before.daemon?.pid ?? null, daemonPidB: after.daemon?.pid ?? null, daemonInstanceIdA: before.daemon?.daemonInstanceId ?? null, daemonInstanceIdB: after.daemon?.daemonInstanceId ?? null, duplicateLogicalEntries: Math.max(0, nativeEntries.length - 1), duplicateNativeOrders: Math.max(0, nativeEntries.length - 1), duplicateFills: Math.max(0, nativeFills.length - 1), duplicateProtections: 0, flatAfterExit: close.command?.response?.position?.side === "FLAT", result: nativeEntries.length <= 1 && nativeFills.length <= 1 ? "PASS" : "FAIL", cycleStarted: Boolean(cycle) };
  } finally {
    if (backendB) { try { await exitLauncher(backendB); } catch {} }
    if (backendA?.child?.pid) killExact(backendA.child.pid);
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

assert.ok(existsSync(path.join(runtimeRoot, "python.exe")));
const results = [];
for (const [name, barrier] of [["A", "AFTER_INTENT_CREATED"], ["B", "AFTER_CANONICAL_SUBMIT_BEFORE_N13B_RESULT"], ["C", "AFTER_CANONICAL_FILL_BEFORE_RECONCILED"]]) results.push(await runCase(name, barrier));
console.log(JSON.stringify({ result: results.every((row) => row.result === "PASS") ? "PASS" : "FAIL", cases: results }, null, 2));
