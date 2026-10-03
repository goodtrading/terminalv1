import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { NautilusServerPaperRuntimeManager } from "./nautilusServerPaperRuntime";

const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");
const supervisorScriptPath = path.resolve("scripts/nautilus_bridge/supervisor.py");

test("supervised PAPER survives backend disconnect and reattaches by persisted identity", { timeout: 60_000, skip: !existsSync(path.join(runtimeRoot, "python.exe")) }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-n13b-supervisor-client-"));
  const daemonScriptPath = path.join(root, "fake-daemon.py");
  const moduleManifest: Record<string, { path: string; sha256: string }> = {};
  for (const [name, relative] of Object.entries({ daemon: "daemon.py", contracts: "goodtrading/contracts.py", simulation_core: "goodtrading/simulation_core.py", simulation_service: "goodtrading/simulation_service.py", quote_stream: "goodtrading/quote_stream.py" })) {
    const modulePath = path.join(runtimeRoot, relative);
    moduleManifest[name] = { path: modulePath, sha256: createHash("sha256").update(await readFile(modulePath)).digest("hex") };
  }
  const fakeSource = `import json,sys\nsession='supervised-test-session'\nfor line in sys.stdin:\n r=json.loads(line); op=r.get('op')\n if op=='health': x={'status':'healthy','protocolVersion':1,'nautilusVersion':'1.231.0','runtimeVersion':'fake-runtime','pythonVersion':'fake-python','runtimeModules':${JSON.stringify(moduleManifest)}}\n elif op=='simulation.start': x={'simulationSessionId':session,'sessionLifecycle':'ACTIVE'}\n elif op=='simulation.status': x={'simulationSessionId':session,'state':'RUNNING'}\n elif op=='simulation.stop': x={'simulationSessionId':session,'sessionLifecycle':'STOPPED'}\n elif op=='shutdown': x={'shutdown':True}\n else: x={'simulationSessionId':session}\n print(json.dumps({'id':r.get('id'),'ok':True,'result':x}),flush=True)\n if op=='shutdown': break\n`;
  await writeFile(daemonScriptPath, fakeSource);
  const registryPath = path.join(root, "sessions.sqlite");
  const options = { runtimeRoot, daemonScriptPath, supervisorScriptPath, registryPath, startTimeoutMs: 10_000, requestTimeoutMs: 2_000, maxSessions: 1 };
  const first = new NautilusServerPaperRuntimeManager(options);
  try {
    const started = await first.startForUser(731);
    const metadata = await first.lookupForUser(731);
    assert.equal(started.alreadyRunning, false);
    assert.equal(metadata?.ownerUserId, 731);
    assert.equal(metadata?.simulationSessionId, started.simulationSessionId);
    assert.ok(metadata?.supervisorEpoch);
    assert.ok(metadata?.daemonInstanceId);
    assert.ok(metadata?.daemonPid);
    assert.equal(metadata?.protocolVersion, 1);
    assert.equal(metadata?.runtimeVersion, "fake-runtime");
    await first.disconnect();

    const second = new NautilusServerPaperRuntimeManager(options);
    try {
      const attached = await second.startForUser(731);
      assert.deepEqual(attached, { simulationSessionId: started.simulationSessionId, alreadyRunning: true });
      assert.equal((await second.readRuntimeStatus(731)).simulationSessionId, started.simulationSessionId);
      assert.equal((await second.stopForUser(731)).lifecycle, "TERMINATED");
    } finally {
      await second.dispose();
    }
  } finally {
    await first.disconnect();
    await rm(root, { recursive: true, force: true });
  }
});

test("cold startup uses a dedicated bounded startup deadline", { timeout: 20_000, skip: !existsSync(path.join(runtimeRoot, "python.exe")) }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-n13b-startup-deadline-"));
  const daemonScriptPath = path.join(root, "slow-daemon.py");
  const moduleManifest: Record<string, { path: string; sha256: string }> = {};
  for (const [name, relative] of Object.entries({ daemon: "daemon.py", contracts: "goodtrading/contracts.py", simulation_core: "goodtrading/simulation_core.py", simulation_service: "goodtrading/simulation_service.py", quote_stream: "goodtrading/quote_stream.py" })) {
    const modulePath = path.join(runtimeRoot, relative);
    moduleManifest[name] = { path: modulePath, sha256: createHash("sha256").update(await readFile(modulePath)).digest("hex") };
  }
  const slowSource = `import json,sys,time\nsession='slow-start-session'\nfor line in sys.stdin:\n r=json.loads(line); op=r.get('op')\n if op=='health': time.sleep(0.15); x={'status':'healthy','protocolVersion':1,'nautilusVersion':'1.231.0','runtimeVersion':'slow-runtime','pythonVersion':'slow-python','runtimeModules':${JSON.stringify(moduleManifest)}}\n elif op=='simulation.start': x={'simulationSessionId':session,'sessionLifecycle':'ACTIVE'}\n elif op=='simulation.stop': x={'simulationSessionId':session,'sessionLifecycle':'STOPPED'}\n elif op=='shutdown': x={'shutdown':True}\n else: x={'simulationSessionId':session}\n print(json.dumps({'id':r.get('id'),'ok':True,'result':x}),flush=True)\n if op=='shutdown': break\n`;
  await writeFile(daemonScriptPath, slowSource);
  const options = {
    runtimeRoot,
    daemonScriptPath,
    supervisorScriptPath,
    registryPath: path.join(root, "sessions.sqlite"),
    startTimeoutMs: 2_000,
    startupTimeoutMs: 2_000,
    requestTimeoutMs: 2_000,
    maxSessions: 1,
  } as const;
  const manager = new NautilusServerPaperRuntimeManager(options);
  try {
    const started = await manager.startForUser(732);
    assert.equal(started.simulationSessionId, "slow-start-session");
    await manager.stopForUser(732);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("startup deadline expiry fails closed without a session identity", { timeout: 20_000, skip: !existsSync(path.join(runtimeRoot, "python.exe")) }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gt-n13b-startup-expiry-"));
  const daemonScriptPath = path.join(root, "too-slow-daemon.py");
  const moduleManifest: Record<string, { path: string; sha256: string }> = {};
  for (const [name, relative] of Object.entries({ daemon: "daemon.py", contracts: "goodtrading/contracts.py", simulation_core: "goodtrading/simulation_core.py", simulation_service: "goodtrading/simulation_service.py", quote_stream: "goodtrading/quote_stream.py" })) {
    const modulePath = path.join(runtimeRoot, relative);
    moduleManifest[name] = { path: modulePath, sha256: createHash("sha256").update(await readFile(modulePath)).digest("hex") };
  }
  const slowSource = `import json,sys,time\nsession='never-reached-session'\nfor line in sys.stdin:\n r=json.loads(line); op=r.get('op')\n if op=='health': time.sleep(0.2); x={'status':'healthy','protocolVersion':1,'nautilusVersion':'1.231.0','runtimeVersion':'slow-runtime','pythonVersion':'slow-python','runtimeModules':${JSON.stringify(moduleManifest)}}\n elif op=='simulation.start': x={'simulationSessionId':session,'sessionLifecycle':'ACTIVE'}\n elif op=='shutdown': x={'shutdown':True}\n else: x={'simulationSessionId':session}\n print(json.dumps({'id':r.get('id'),'ok':True,'result':x}),flush=True)\n if op=='shutdown': break\n`;
  await writeFile(daemonScriptPath, slowSource);
  const options = {
    runtimeRoot,
    daemonScriptPath,
    supervisorScriptPath,
    registryPath: path.join(root, "sessions.sqlite"),
    startTimeoutMs: 2_000,
    startupTimeoutMs: 50,
    requestTimeoutMs: 2_000,
    maxSessions: 1,
  } as const;
  const manager = new NautilusServerPaperRuntimeManager(options);
  try {
    await assert.rejects(() => manager.startForUser(733));
    assert.equal(manager.getLifecycle(733).simulationSessionId, null);
  } finally {
    await manager.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
