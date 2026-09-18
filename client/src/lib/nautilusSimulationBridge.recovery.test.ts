import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { bindPaperOwner, enablePaperOwnershipEnforcement, resetPaperOwnerForTests } from "./paperOwnerContext";
import { drainEvidenceOutbox } from "./nautilusSimulationBridge";

const event = {
  eventId: "recovery-event",
  eventType: "OrderFilled",
  tsEventNs: "1700000000000000001",
  tsInitNs: "1700000000000000002",
  environment: "PAPER",
  source: "NAUTILUS_PAPER",
  clientOrderId: "recovery-client",
  side: "BUY",
  orderType: "LIMIT",
  quantity: "0.123456789",
  price: "123456.12345678",
  triggerPrice: "120000.00000001",
  reduceOnly: false,
  reduceOnlySource: "EVENT_FACTUAL",
  tags: ["RECOVERY"],
  tagsSource: "EVENT_FACTUAL",
  linkedOrderIds: [],
};
const item = { accountId: "101", environment: "PAPER", source: "NAUTILUS_PAPER", eventId: event.eventId, payload: event, status: "PENDING", attempts: 0, lastError: null };

function setup() {
  resetPaperOwnerForTests();
  enablePaperOwnershipEnforcement();
  bindPaperOwner(101);
  (globalThis as { window: unknown }).window = { __TAURI__: {}, __TAURI_INTERNALS__: {} };
}

function cleanup() {
  clearMocks();
  resetPaperOwnerForTests();
  delete (globalThis as { window?: unknown }).window;
}

function mockPending(calls: Array<{ command: string; payload: unknown }>) {
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "list_nautilus_evidence_outbox") return [item];
    if (command === "mark_nautilus_evidence_outbox_failure") return undefined;
    if (command === "ack_nautilus_evidence_outbox") return undefined;
    assert.fail(`unexpected command ${command}`);
  });
}

test("network and 5xx failures retain PENDING evidence", async () => {
  setup();
  const originalFetch = globalThis.fetch;
  try {
    for (const failure of ["network", "5xx"] as const) {
      const calls: Array<{ command: string; payload: unknown }> = [];
      mockPending(calls);
      globalThis.fetch = failure === "network"
        ? (async () => { throw new Error("NETWORK_DOWN"); }) as typeof fetch
        : (async () => new Response("server unavailable", { status: 503 })) as typeof fetch;
      assert.equal(await drainEvidenceOutbox(101), "PENDING");
      const mark = calls.find((call) => call.command === "mark_nautilus_evidence_outbox_failure");
      assert.deepEqual((mark?.payload as { status: string }).status, "PENDING");
      clearMocks();
    }
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("409 marks CONFLICT and retains the exact payload", async () => {
  setup();
  const originalFetch = globalThis.fetch;
  try {
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockPending(calls);
    globalThis.fetch = (async () => new Response(JSON.stringify({ code: "NAUTILUS_EVIDENCE_CONFLICT" }), { status: 409 })) as typeof fetch;
    assert.equal(await drainEvidenceOutbox(101), "CONFLICT");
    const mark = calls.find((call) => call.command === "mark_nautilus_evidence_outbox_failure");
    assert.equal((mark?.payload as { status: string }).status, "CONFLICT");
    assert.deepEqual((mark?.payload as { eventIds: string[] }).eventIds, [event.eventId]);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});

test("owner switch during POST prevents ACK/delete under the new owner", async () => {
  setup();
  const originalFetch = globalThis.fetch;
  try {
    const calls: Array<{ command: string; payload: unknown }> = [];
    mockPending(calls);
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    globalThis.fetch = (async () => response) as typeof fetch;
    const draining = drainEvidenceOutbox(101);
    bindPaperOwner(202);
    release(new Response(JSON.stringify({ acknowledged: true }), { status: 200 }));
    await assert.rejects(draining, /PAPER_OWNER_GENERATION_STALE/);
    assert.equal(calls.some((call) => call.command === "ack_nautilus_evidence_outbox"), false);
  } finally {
    globalThis.fetch = originalFetch;
    cleanup();
  }
});
