import assert from "node:assert/strict";
import test from "node:test";

import { getPaperExecutionBackend, setPaperExecutionBackend } from "@/lib/paperExecutionPort";
import { paperApiFetch } from "./paperApiClient";

const originalFetch = globalThis.fetch;

function installFetchSpy() {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ fromServer: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

test.afterEach(() => {
  setPaperExecutionBackend("legacy");
  globalThis.fetch = originalFetch;
});

test("legacy GET position uses the real authenticated transport", async () => {
  const calls = installFetchSpy();
  await paperApiFetch("/api/paper/position");
  assert.equal(getPaperExecutionBackend(), "legacy");
  assert.equal(calls.length, 1);
});

test("Nautilus direct Paper reads do not receive fake success", async () => {
  const calls = installFetchSpy();
  setPaperExecutionBackend("nautilus");

  const position = await paperApiFetch("/api/paper/position");
  const account = await paperApiFetch("/api/paper/account");
  const orders = await paperApiFetch("/api/paper/orders");
  const settings = await paperApiFetch("/api/paper/settings");

  assert.equal(calls.length, 4);
  assert.equal(position.status, 200);
  assert.deepEqual(await position.json(), { fromServer: true });
  assert.deepEqual(await account.json(), { fromServer: true });
  assert.deepEqual(await orders.json(), { fromServer: true });
  assert.deepEqual(await settings.json(), { fromServer: true });
});

test("Nautilus stop checks remain an explicit safety rejection", async () => {
  installFetchSpy();
  setPaperExecutionBackend("nautilus");

  await assert.rejects(
    paperApiFetch("/api/paper/check-stops", { method: "POST" }),
    /LEGACY_PAPER_REQUEST_FORBIDDEN_IN_NAUTILUS.*POST \/api\/paper\/check-stops/,
  );
});

test("Nautilus legacy order and preview writes fail explicitly", async () => {
  installFetchSpy();
  setPaperExecutionBackend("nautilus");

  for (const path of ["/api/paper/order", "/api/paper/preview"]) {
    await assert.rejects(
      paperApiFetch(path, { method: "POST" }),
      new RegExp(`LEGACY_PAPER_REQUEST_FORBIDDEN_IN_NAUTILUS.*${path}`),
    );
  }
});
