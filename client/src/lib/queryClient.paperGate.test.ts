import assert from "node:assert/strict";
import test from "node:test";

import { getPaperExecutionBackend, setPaperExecutionBackend } from "./paperExecutionBackendState";
import { setPaperExecutionBackend as setThroughPort } from "./paperExecutionPort";
import { apiRequest, getQueryFn } from "./queryClient";
import { bindPaperOwner, resetPaperOwnerForTests } from "./paperOwnerContext";

const originalFetch = globalThis.fetch;

function installFetchSpy() {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ fromServer: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return () => calls;
}

test.afterEach(() => {
  setPaperExecutionBackend("legacy");
  resetPaperOwnerForTests();
  globalThis.fetch = originalFetch;
});

test("queryClient does not fabricate Nautilus Paper read responses", async () => {
  const calls = installFetchSpy();
  setThroughPort("nautilus");
  assert.equal(getPaperExecutionBackend(), "nautilus");

  const response = await apiRequest("/api/paper/account");

  assert.equal(calls(), 1);
  assert.deepEqual(await response.json(), { fromServer: true });
});

test("factual Nautilus evidence POST requires a bound owner", async () => {
  installFetchSpy();
  setThroughPort("nautilus");
  await assert.rejects(
    apiRequest("/api/paper/nautilus/order-events", { method: "POST" }),
    /PAPER_OWNER_NOT_BOUND/,
  );
  bindPaperOwner(101);
  const response = await apiRequest("/api/paper/nautilus/order-events", { method: "POST" });
  assert.equal(response.status, 200);
});
test("queryClient keeps legacy Paper requests on the real transport", async () => {
  const calls = installFetchSpy();
  setThroughPort("legacy");

  await apiRequest("/api/paper/account");

  assert.equal(calls(), 1);
});

test("queryClient forbids Nautilus legacy writes", async () => {
  installFetchSpy();
  setThroughPort("nautilus");

  for (const path of ["/api/paper/order", "/api/paper/preview"]) {
    await assert.rejects(
      apiRequest(path, { method: "POST" }),
      new RegExp(`LEGACY_PAPER_REQUEST_FORBIDDEN_IN_NAUTILUS.*POST ${path}`),
    );
  }
});

test("React Query default GET path does not fabricate Nautilus Paper state", async () => {
  const calls = installFetchSpy();
  const queryFn = getQueryFn({ on401: "throw" });
  setThroughPort("nautilus");

  const position = await queryFn({ queryKey: ["/api/paper/position"] } as never);
  const account = await queryFn({ queryKey: ["/api/paper/account"] } as never);
  const orders = await queryFn({ queryKey: ["/api/paper/orders"] } as never);

  assert.equal(calls(), 3);
  assert.deepEqual(position, { fromServer: true });
  assert.deepEqual(account, { fromServer: true });
  assert.deepEqual(orders, { fromServer: true });
});

test("React Query default GET path preserves legacy network behavior", async () => {
  const calls = installFetchSpy();
  const queryFn = getQueryFn({ on401: "throw" });
  setThroughPort("legacy");

  await queryFn({ queryKey: ["/api/paper/account"] } as never);

  assert.equal(calls(), 1);
});
