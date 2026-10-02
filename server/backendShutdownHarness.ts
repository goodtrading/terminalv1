import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { requireSaasAuth, __setSaasAuthResolverForTests } from "./middleware/saasAuth";
import { createNautilusServerPaperRuntimeRouter } from "./routes/nautilusServerPaperRuntime.routes";
import { installBackendGracefulShutdown } from "./services/backendGracefulShutdown";
import { NautilusServerPaperRuntimeManager, type ServerPaperQuoteObservation } from "./services/nautilusServerPaperRuntime";
import { ServerPaperSessionRegistry } from "./services/serverPaperSessionRegistry";
import { runAutonomousPaperCycle, recoverAutonomousPaperExecution, pauseAutonomousPaperLoop, stopAutonomousPaperLoop, startAutonomousPaperLoop } from "./services/autonomousPaperAgent";
import { createShadowTraderStore } from "./services/shadowTraderStore";
import type { AIProvider } from "@shared/aiResearch";


const runtimeRoot = process.env.GT_TEST_RUNTIME_ROOT;
const registryPath = process.env.GT_TEST_REGISTRY_PATH;
const ownerUserId = Number(process.env.GT_TEST_OWNER_ID ?? "901001");

const mode = process.env.GT_TEST_MODE ?? "run";
const shadowRoot = process.env.GT_TEST_SHADOW_ROOT ?? path.join(process.cwd(), "shadow");
if (!runtimeRoot || !registryPath) throw new Error("Isolated test runtime paths are required.");


const quoteProvider = async (): Promise<ServerPaperQuoteObservation> => ({
  source: "CONTROLLED_TEST_PERP_BBO",
  symbol: "BTCUSDT",
  marketType: "perpetual",
  bid: "85000",
  ask: "85001",
  bidSize: "5",
  askSize: "5",
  sourceTimestampMs: Date.now(),
  observedAtMs: Date.now(),
  sourceAgeMs: 0,
  endpoint: "test://controlled-perp-bbo",
  sequence: Date.now(),
});
const manager = new NautilusServerPaperRuntimeManager({
  runtimeRoot,
  registryPath,
  supervisorScriptPath: path.resolve(process.env.GT_REPO_ROOT ?? process.cwd(), "scripts", "nautilus_bridge", "supervisor.py"),
  startTimeoutMs: 90_000,
  requestTimeoutMs: 8_000,
  maxSessions: 2,
  prewarmPackage: true,
  allowControlledTestQuotes: true,
  allowOrderAuthorization: true,
  ordersEnabled: true,
  quoteProvider,
});
const autonomousStore = createShadowTraderStore(shadowRoot);
function deterministicProvider(action: string): AIProvider {
  return {
    id: "deterministic-paper-fixture",
    model: "n13b-fixture",
    mocked: true,
    async health() { return { ok: true }; },
    async generate() { return JSON.stringify({ action, thesis: `controlled ${action}`, keyEvidence: ["CONTROLLED_TEST_PERP_BBO"], contradictions: [], invalidation: action === "ENTER_LONG" ? 84000 : action === "ENTER_SHORT" ? 86000 : null, horizon: "intraday", dataLimitations: [] }); },
  } as AIProvider;
}
async function controlledMarket() {
  return { capturedAt: new Date().toISOString(), liveEvidence: { BBO: { quality: "VALID", value: { bid: 85000, ask: 85001 } } } };
}
const app = express();
__setSaasAuthResolverForTests((request) => request.header("x-test-user") === String(ownerUserId)
  ? { id: ownerUserId, email: "isolated-owner@example.invalid", role: "user" }
  : null);
app.use(express.json());
app.get("/health", (_request, response) => response.status(200).json({ ok: true, service: "isolated-paper-backend" }));
app.use("/api/paper/nautilus/runtime", createNautilusServerPaperRuntimeRouter({
  manager,
  authenticate: requireSaasAuth,
  enabled: true,
  ordersEnabled: false,
}));
app.post("/__test/kill-daemon", (_request, response) => {
  const sessions = (manager as unknown as { sessions: Map<number, { supervisorMetadata: Record<string, unknown> }> }).sessions;
  const record = sessions.get(ownerUserId);
  const daemonPid = Number(record?.supervisorMetadata.daemonPid ?? 0);
  const accepted = daemonPid > 0;
  if (accepted) process.kill(daemonPid);
  response.status(record ? 202 : 404).json({ accepted, daemonPid: accepted ? daemonPid : null });
});
app.get("/__test/canonical", async (_request, response) => {
  try { response.json({ snapshot: await manager.readSnapshot(ownerUserId), orders: await manager.readOrders(ownerUserId), fills: await manager.readFills(ownerUserId) }); }
  catch (error) { response.status(500).json({ message: String(error) }); }
});
app.get("/__test/daemon", (_request, response) => {
  const sessions = (manager as unknown as { sessions: Map<number, { child: { exitCode: number | null }; supervisorMetadata: Record<string, unknown> }> }).sessions;
  const record = sessions.get(ownerUserId);
  const metadata = record?.supervisorMetadata;
  response.json({ pid: metadata?.daemonPid ?? null, supervisorPid: metadata?.supervisorPid ?? null, supervisorEpoch: metadata?.supervisorEpoch ?? null, daemonInstanceId: metadata?.daemonInstanceId ?? null, exitCode: record?.child.exitCode ?? null });
});
app.get("/__test/session-record", (_request, response) => {
  const registry = new ServerPaperSessionRegistry(registryPath);
  try { response.json({ record: registry.latest(ownerUserId) }); } finally { registry.close(); }
});
app.post("/__test/create-session", async (_request, response) => {
  try {
    const result = await manager.startForUser(ownerUserId);
    response.status(result.alreadyRunning ? 200 : 201).json({ ...result, lifecycle: "AVAILABLE" });
  } catch (error) {
    console.error("ISOLATED_TEST_CREATE_SESSION_FAILED", error);
    response.status(500).json({ message: String(error) });
  }
});
app.post("/__test/protected-entry", async (request, response) => {
  try {
    const lifecycle = manager.getLifecycle(ownerUserId);
    if (!lifecycle.simulationSessionId) throw new Error("PAPER session is not available.");
    manager.grantOrderExecution(ownerUserId, lifecycle.simulationSessionId);
    const input = request.body && typeof request.body === "object" ? request.body : {};
    const result = await manager.submitProtectedEntryCommand(ownerUserId, String(input.idempotencyKey ?? "clean-restart-entry-001"), {
      side: input.side === "SELL" ? "SELL" : "BUY",
      quantity: typeof input.quantity === "string" ? input.quantity : "0.001",
      stopLoss: typeof input.stopLoss === "string" ? input.stopLoss : "84000",
      takeProfit: typeof input.takeProfit === "string" ? input.takeProfit : "86000",
    });
    response.json(result);
  } catch (error) {
    console.error("ISOLATED_TEST_PROTECTED_ENTRY_FAILED", error);
    response.status(500).json({ message: String(error) });
  }
});

app.post("/__test/autonomous/create", async (_request, response) => {
  try {
    const native = await manager.startForUser(ownerUserId);
    manager.grantOrderExecution(ownerUserId, native.simulationSessionId);
    const session = await autonomousStore.create({ ownerUserId, provider: "deterministic-paper-fixture", model: "n13b-fixture", quality: "HIGH", mode: "PAPER_AUTONOMOUS", paperSimulationSessionId: native.simulationSessionId, cadenceMs: 5_000, riskConfig: { fixedQuantity: "0.001", maxExposure: 1, maxSessionLoss: 1000, cooldownMs: 0, requireInvalidation: true, stopLossDistance: 100, takeProfitDistance: 100 } });
    const running = await autonomousStore.update(session.sessionId, ownerUserId, (value) => ({ ...value, status: "RUNNING", nextEvaluationAt: new Date().toISOString() }));
    response.status(201).json({ session: running });
  } catch (error) { response.status(500).json({ message: String(error) }); }
});
app.get("/__test/autonomous/state", async (_request, response) => {
  try {
    const session = await autonomousStore.list(ownerUserId);
    const current = session[0] ?? null;
    const evidence = current?.paperSimulationSessionId ? manager.listAutonomousEvidence(ownerUserId, current.paperSimulationSessionId) : [];
    response.json({ session: current, evidence });
  } catch (error) { response.status(500).json({ message: String(error) }); }
});
app.post("/__test/autonomous/cycle", async (request, response) => {
  try {
    const current = (await autonomousStore.list(ownerUserId))[0];
    if (!current) throw new Error("PAPER_AUTONOMOUS_SESSION_NOT_FOUND");
    const action = request.body?.action === "ENTER_SHORT" || request.body?.action === "EXIT" || request.body?.action === "HOLD" ? request.body.action : "ENTER_LONG";
    const updated = await runAutonomousPaperCycle({ session: current, store: autonomousStore, manager, provider: deterministicProvider(action), readMarket: controlledMarket });
    response.json({ session: updated, evidence: updated.paperSimulationSessionId ? manager.listAutonomousEvidence(ownerUserId, updated.paperSimulationSessionId) : [] });
  } catch (error) { response.status(500).json({ message: String(error) }); }
});
app.post("/__test/autonomous/recover", async (_request, response) => {
  try {
    const current = (await autonomousStore.list(ownerUserId))[0];
    if (!current) throw new Error("PAPER_AUTONOMOUS_SESSION_NOT_FOUND");
    const simulationSessionId = current.paperSimulationSessionId;
    if (!simulationSessionId) throw new Error("PAPER_AUTONOMOUS_SIMULATION_SESSION_NOT_FOUND");
    manager.grantOrderExecution(ownerUserId, simulationSessionId);
    const session = await recoverAutonomousPaperExecution({ session: current, store: autonomousStore, manager });
    response.json({ session, evidence: manager.listAutonomousEvidence(ownerUserId, simulationSessionId) });
  } catch (error) { response.status(500).json({ message: String(error) }); }
});

app.post("/__test/autonomous/close-recovered", async (_request, response) => {
  try {
    const lifecycle = manager.getLifecycle(ownerUserId);
    if (!lifecycle.simulationSessionId) throw new Error("PAPER_SESSION_NOT_AVAILABLE");
    manager.grantOrderExecution(ownerUserId, lifecycle.simulationSessionId);
    const result = await manager.closePositionCommand(ownerUserId, `n13b-recovery-close-${lifecycle.simulationSessionId}`);
    response.json({ command: result.command });
  } catch (error) { response.status(500).json({ message: String(error) }); }
});

app.post("/__test/autonomous/pause", async (_request, response) => {
  try { const current = (await autonomousStore.list(ownerUserId))[0]; if (!current) throw new Error("PAPER_AUTONOMOUS_SESSION_NOT_FOUND"); response.json({ session: await pauseAutonomousPaperLoop(current, autonomousStore) }); }
  catch (error) { response.status(500).json({ message: String(error) }); }
});
app.post("/__test/autonomous/resume", async (_request, response) => {
  try { const current = (await autonomousStore.list(ownerUserId))[0]; if (!current) throw new Error("PAPER_AUTONOMOUS_SESSION_NOT_FOUND"); const session = await autonomousStore.update(current.sessionId, ownerUserId, (value) => ({ ...value, status: "RUNNING", nextEvaluationAt: new Date().toISOString() })); response.json({ session }); }
  catch (error) { response.status(500).json({ message: String(error) }); }
});
app.post("/__test/autonomous/stop", async (_request, response) => {
  try { const current = (await autonomousStore.list(ownerUserId))[0]; if (!current) throw new Error("PAPER_AUTONOMOUS_SESSION_NOT_FOUND"); response.json({ session: await stopAutonomousPaperLoop(current, autonomousStore, manager) }); }
  catch (error) { response.status(500).json({ message: String(error) }); }
});

app.post("/__test/stop-runtime", async (_request, response) => {
  try {
    const result = await manager.stopForUser(ownerUserId);
    response.json(result);
  } catch (error) {
    console.error("ISOLATED_TEST_STOP_RUNTIME_FAILED", error);
    response.status(500).json({ message: String(error) });
  }
});

const server = createServer(app);
const backendShutdown = installBackendGracefulShutdown({
  server,
  disposePaperRuntime: () => manager.disconnect(),
  logError: (message, error) => console.error(message, String(error)),
});
app.post("/__test/backend-disconnect", (_request, response) => {
  response.status(202).json({ accepted: true, backendPid: process.pid });
  setImmediate(() => { void manager.disconnect(); });
});
app.post("/__test/backend-shutdown", (_request, response) => {
  response.status(202).json({ accepted: true });
  setTimeout(() => {
    void backendShutdown.shutdown().then(() => {
      setTimeout(() => process.exit(0), 250);
    }, (error) => {
      console.error("ISOLATED_TEST_BACKEND_SHUTDOWN_FAILED", String(error));
      setTimeout(() => process.exit(1), 250);
    });
  }, 25);
});
server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Isolated backend did not bind a TCP port.");
  const baseUrl = `http://127.0.0.1:${address.port}/api/paper/nautilus/runtime`;
  const headers = { "x-test-user": String(ownerUserId), "content-type": "application/json" };
  try {
    if (mode === "boot-only") {
      await autonomousStore.recoverRunningSessions();
      const lifecycle = manager.getLifecycle(ownerUserId);
      console.log(JSON.stringify({
        phase: "ready",
        backendPid: process.pid,
        supervisorPid: null,
        supervisorEpoch: null,
        daemonPid: null,
        daemonInstanceId: null,
        port: address.port,
        simulationSessionId: lifecycle.simulationSessionId,
        lifecycle: lifecycle.lifecycle,
        status: lifecycle,
        snapshot: null,
        orders: [],
        fills: [],
        orderEvents: [],
      }));
      return;
    }
    if (mode === "probe") {
      const response = await fetch(`${baseUrl}/session`, { method: "POST", headers });
      const body = await response.json() as Record<string, unknown>;
      console.log(JSON.stringify({ phase: "restart_probe", statusCode: response.status, errorCode: body.code ?? null, message: body.message ?? null }));
      await manager.disconnect();
      server.close(() => process.exit(0));
      return;
    }
    const startResponse = await fetch(`${baseUrl}/session`, { method: "POST", headers });
    if (!startResponse.ok) throw new Error(`isolated PAPER start failed (${startResponse.status}): ${await startResponse.text()}`);
    const start = await startResponse.json() as { simulationSessionId: string; lifecycle: string };
    if (mode === "restart-state") {
      manager.grantOrderExecution(ownerUserId, start.simulationSessionId);
      await manager.submitProtectedEntryCommand(ownerUserId, "restart-state-entry-001", {
        side: "BUY", quantity: "0.001", stopLoss: "84000", takeProfit: "86000",
      });
    }
    const [statusResponse, snapshotResponse, ordersResponse, fillsResponse, eventsResponse] = await Promise.all([
      fetch(`${baseUrl}/session`, { headers }),
      fetch(`${baseUrl}/snapshot`, { headers }),
      fetch(`${baseUrl}/orders`, { headers }),
      fetch(`${baseUrl}/fills`, { headers }),
      fetch(`${baseUrl}/events`, { headers }),
    ]);
    const [status, snapshot, orders, fills, orderEvents] = await Promise.all([
      statusResponse.json(), snapshotResponse.json(), ordersResponse.json(), fillsResponse.json(), eventsResponse.json(),
    ]) as [Record<string, unknown>, Record<string, unknown>, { orders: unknown[] }, { fills: unknown[] }, { events: unknown[] }];
    const sessions = (manager as unknown as { sessions: Map<number, { supervisorMetadata: Record<string, unknown> }> }).sessions;
    const metadata = sessions.get(ownerUserId)?.supervisorMetadata;
    console.log(JSON.stringify({
      phase: "ready",
      backendPid: process.pid,
      supervisorPid: metadata?.supervisorPid ?? null,
      supervisorEpoch: metadata?.supervisorEpoch ?? null,
      daemonPid: metadata?.daemonPid ?? null,
      daemonInstanceId: metadata?.daemonInstanceId ?? null,
      port: address.port,
      simulationSessionId: start.simulationSessionId,
      lifecycle: status.lifecycle,
      status,
      snapshot,
      orders: orders.orders,
      fills: fills.fills,
      orderEvents: orderEvents.events,
    }));
  } catch (error) {
    console.error("ISOLATED_BACKEND_START_FAILED", error);
    await manager.disconnect();
    server.close(() => process.exit(1));
  }
});
