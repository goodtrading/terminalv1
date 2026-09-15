import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { afterEach, test } from "node:test";
import { __setSaasAuthResolverForTests, type SaasAuthUser } from "../middleware/saasAuth";
import { registerAccountContextRoutes } from "./accountContext.routes";

let server: http.Server | null = null;
let currentUser: SaasAuthUser | null = null;
const accounts = new Map<number, string>();

function startServer(): Promise<string> {
  const app = express();
  app.use(express.json());
  registerAccountContextRoutes(app, async (userId) => {
    if (userId === 999) throw new Error("USER_NOT_FOUND_IN_USERS_TABLE");
    const existing = accounts.get(userId);
    if (existing) return { accountUid: existing };
    const accountUid = `GT-test-${userId}`;
    accounts.set(userId, accountUid);
    return { accountUid };
  });
  return new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_UNAVAILABLE");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function bootstrap(baseUrl: string, body: unknown = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/account-context/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

afterEach(async () => {
  currentUser = null;
  accounts.clear();
  __setSaasAuthResolverForTests(null);
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

test("rejects unauthenticated bootstrap and never provisions", async () => {
  __setSaasAuthResolverForTests(() => currentUser);
  const baseUrl = await startServer();
  const result = await bootstrap(baseUrl);
  assert.equal(result.status, 401);
  assert.equal(accounts.size, 0);
});

test("provisions once per authenticated user and returns only the canonical UID", async () => {
  currentUser = { id: 10, email: "hidden@example.test", role: "user" };
  __setSaasAuthResolverForTests(() => currentUser);
  const baseUrl = await startServer();
  const first = await bootstrap(baseUrl, { userId: 20, accountUid: "GT-attacker" });
  const second = await bootstrap(baseUrl);
  currentUser = { id: 11, email: "other@example.test", role: "user" };
  const other = await bootstrap(baseUrl);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(other.status, 200);
  assert.equal(first.body.accountUid, "GT-test-10");
  assert.equal(second.body.accountUid, first.body.accountUid);
  assert.equal(other.body.accountUid, "GT-test-11");
  assert.notEqual(other.body.accountUid, first.body.accountUid);
  assert.deepEqual(Object.keys(first.body), ["accountUid"]);
  assert.equal(accounts.size, 2);
});

test("does not create an account for a nonexistent authenticated owner", async () => {
  currentUser = { id: 999, email: "missing@example.test", role: "user" };
  __setSaasAuthResolverForTests(() => currentUser);
  const baseUrl = await startServer();
  const result = await bootstrap(baseUrl);
  assert.equal(result.status, 404);
  assert.equal(accounts.size, 0);
});
