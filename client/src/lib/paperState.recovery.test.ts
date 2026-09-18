import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { activateNautilusPaperBackend, setPaperExecutionBackend } from "./paperExecutionPort";
import { PaperStateController } from "./paperState";
import { bindPaperOwner, getPaperOwner, resetPaperOwnerForTests } from "./paperOwnerContext";

const runtime = (userId: number | null, authenticated = userId !== null) => ({
  workspace: "paper" as const,
  backend: "nautilus" as const,
  authReady: true,
  authenticated,
  authenticatedUserId: userId,
});

const event = {
  eventId: "lifecycle-event",
  eventType: "OrderFilled",
  tsEventNs: "1700000000000000001",
  tsInitNs: "1700000000000000002",
  environment: "PAPER",
  source: "NAUTILUS_PAPER",
  clientOrderId: "lifecycle-client",
  side: "BUY",
  orderType: "LIMIT",
  quantity: "0.123456789",
  price: "123456.12345678",
  triggerPrice: "120000.00000001",
  reduceOnly: false,
  reduceOnlySource: "EVENT_FACTUAL",
  tags: ["GT_PROTECTION=STOP_LOSS"],
  tagsSource: "EVENT_FACTUAL",
  linkedOrderIds: [],
  parentOrderId: null,
};

function item(accountId: string) {
  return {
    accountId,
    environment: "PAPER",
    source: "NAUTILUS_PAPER",
    eventId: event.eventId,
    payload: event,
    status: "PENDING",
    attempts: 0,
    lastError: null,
  };
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function setupOutbox(initial: Record<string, unknown[]>) {
  const rows = new Map(Object.entries(initial));
  const calls: Array<{ command: string; payload: any }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    const accountId = String((payload as { accountId?: string })?.accountId ?? "");
    if (command === "list_nautilus_evidence_outbox") return rows.get(accountId) ?? [];
    if (command === "ack_nautilus_evidence_outbox") {
      rows.set(accountId, []);
      return undefined;
    }
    if (command === "mark_nautilus_evidence_outbox_failure") return undefined;
    if (command === "nautilus_evidence_outbox_diagnostics") {
      return { pendingCount: (rows.get(accountId) ?? []).length, conflictCount: 0, lastDeliveryFailure: null };
    }
    if (command === "nautilus_simulation_deactivate") return { availability: "UNAVAILABLE", engine: "UNKNOWN", simulation: "UNKNOWN" };
    return undefined;
  });
  return { rows, calls };
}

async function activateBackend() {
  (globalThis as { window?: unknown }).window = {
    __TAURI__: {},
    __TAURI_INTERNALS__: {},
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  await activateNautilusPaperBackend({
    runtime: { isDesktopApp: () => true },
    engine: {
      start: async () => ({ state: "HEALTHY" }),
      status: async () => ({ state: "HEALTHY" }),
      version: async () => ({ protocolVersion: 1, nautilusVersion: "1.231.0", pythonVersion: "3.12.10", pid: 1 }),
      ping: async () => ({ pong: true }),
      stop: async () => ({ state: "STOPPED" }),
    } as never,
    simulation: {
      start: async () => ({ state: "RUNNING" }),
      status: async () => ({ state: "RUNNING" }),
      stop: async () => ({ state: "STOPPED" }),
    } as never,
  });
}

function cleanup() {
  clearMocks();
  resetPaperOwnerForTests();
  setPaperExecutionBackend("legacy");
  delete (globalThis as { window?: unknown }).window;
}

test("startup binding drains only the matching durable owner", async () => {
  resetPaperOwnerForTests();
  await activateBackend();
  const { rows, calls } = setupOutbox({ "101": [item("101")], "202": [item("202")] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ acknowledged: true }), { status: 200 })) as typeof fetch;
  const controller = new PaperStateController(undefined, {
    getAccount: async () => ({ exchange: "paper", balanceUsdt: 1, equityUsdt: 1 }) as never,
    getPosition: async () => null,
    getOrders: async () => [],
    getFills: async () => [],
  });
  try {
    controller.setRuntime(runtime(null, false));
    await settle();
    assert.equal(calls.some((call) => call.command === "ack_nautilus_evidence_outbox"), false);
    assert.equal(rows.get("101")?.length, 1);

    controller.setRuntime(runtime(202));
    await settle();
    assert.equal(getPaperOwner()?.userId, 202);
    assert.equal(rows.get("101")?.length, 1);
    assert.equal(rows.get("202")?.length, 0);
    assert.equal(calls.filter((call) => call.command === "ack_nautilus_evidence_outbox").length, 1);

    controller.setRuntime(runtime(101));
    await settle();
    assert.equal(getPaperOwner()?.userId, 101);
    assert.equal(rows.get("101")?.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    controller.dispose();
    cleanup();
  }
});

test("logout preserves pending durable evidence and relogin drains it", async () => {
  resetPaperOwnerForTests();
  await activateBackend();
  const { rows, calls } = setupOutbox({ "101": [item("101")] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ acknowledged: true }), { status: 200 })) as typeof fetch;
  const controller = new PaperStateController();
  try {
    controller.setRuntime(runtime(101));
    await settle();
    assert.equal(getPaperOwner()?.userId, 101);
    assert.equal(rows.get("101")?.length, 0);

    rows.set("101", [item("101")]);
    const ackCountBeforeLogout = calls.filter((call) => call.command === "ack_nautilus_evidence_outbox").length;
    controller.setRuntime(runtime(null, false));
    await settle();
    assert.equal(getPaperOwner(), null);
    assert.equal(rows.get("101")?.length, 1);
    assert.equal(calls.filter((call) => call.command === "ack_nautilus_evidence_outbox").length, ackCountBeforeLogout);

    controller.setRuntime(runtime(101));
    await settle();
    assert.equal(getPaperOwner()?.userId, 101);
    assert.equal(rows.get("101")?.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    controller.dispose();
    cleanup();
  }
});

test("startup binding with an empty outbox is a safe no-op", async () => {
  resetPaperOwnerForTests();
  await activateBackend();
  const { rows, calls } = setupOutbox({ "101": [] });
  const originalFetch = globalThis.fetch;
  let posts = 0;
  globalThis.fetch = (async (_input, init) => {
    if ((init?.method ?? "GET") === "POST") posts += 1;
    return new Response(JSON.stringify({ acknowledged: true }), { status: 200 });
  }) as typeof fetch;
  const controller = new PaperStateController();
  try {
    controller.setRuntime(runtime(101));
    await settle();
    assert.equal(getPaperOwner()?.userId, 101);
    assert.equal(rows.get("101")?.length, 0);
    assert.equal(posts, 0);
    assert.equal(calls.filter((call) => call.command === "ack_nautilus_evidence_outbox").length, 0);
    assert.equal(calls.filter((call) => call.command === "mark_nautilus_evidence_outbox_failure").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    controller.dispose();
    cleanup();
  }
});

test("repeated matching owner binds do not duplicate ACK handling", async () => {
  resetPaperOwnerForTests();
  await activateBackend();
  const { rows, calls } = setupOutbox({ "101": [item("101")] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ acknowledged: true }), { status: 200 })) as typeof fetch;
  const controller = new PaperStateController();
  try {
    controller.setRuntime(runtime(101));
    controller.setRuntime(runtime(101));
    controller.setRuntime(runtime(101));
    await settle();
    assert.equal(rows.get("101")?.length, 0);
    assert.equal(calls.filter((call) => call.command === "ack_nautilus_evidence_outbox").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    controller.dispose();
    cleanup();
  }
});
