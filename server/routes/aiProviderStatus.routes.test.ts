import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth.ts";
import { registerAiProviderStatusRoutes } from "./aiProviderStatus.routes.ts";
import { resetProviderHealthForTests } from "../ai/goodTradingAi/providerHealth.ts";

let server: Server | null = null;
const prevProvider = process.env.GOODTRADING_AI_PROVIDER;
const prevKey = process.env.OPENAI_API_KEY;
const prevFlag = process.env.GOODTRADING_AI_ENABLED;

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  resetProviderHealthForTests();
  if (prevProvider === undefined) delete process.env.GOODTRADING_AI_PROVIDER;
  else process.env.GOODTRADING_AI_PROVIDER = prevProvider;
  if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prevKey;
  if (prevFlag === undefined) delete process.env.GOODTRADING_AI_ENABLED;
  else process.env.GOODTRADING_AI_ENABLED = prevFlag;
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
  authUser: { id: number; email: string; role: string } | null,
): Promise<void> {
  __setSaasAuthResolverForTests(async () => authUser);
  const app = express();
  registerAiProviderStatusRoutes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("GET /api/internal/ai/provider/status", () => {
  it("rejects non-admin", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/internal/ai/provider/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    }, { id: 1, email: "u@test.com", role: "user" });
  });

  it("returns config+health without secrets", async () => {
    process.env.GOODTRADING_AI_ENABLED = "true";
    process.env.GOODTRADING_AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-secret-must-not-leak";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/internal/ai/provider/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.provider, "openai");
      assert.equal(body.configured, true);
      assert.equal(body.enabled, true);
      assert.ok(typeof body.model === "string");
      const raw = JSON.stringify(body);
      assert.ok(!raw.includes("sk-secret"));
      assert.ok(!("apiKey" in body));
    }, { id: 9, email: "admin@test.com", role: "admin" });
  });
});
