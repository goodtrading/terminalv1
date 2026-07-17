/**
 * Route integration tests for GoodTrading AI chat (AI-1).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth.ts";
import { resetAiChatRateLimitsForTests } from "../ai/goodTradingAi/rateLimit.ts";
import { registerAiChatRoutes } from "./aiChat.routes.ts";

let server: Server | null = null;
const FLAG = "GOODTRADING_AI_ENABLED";
const prevFlag = process.env[FLAG];

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  resetAiChatRateLimitsForTests();
  if (prevFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prevFlag;
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
  authUser: { id: number; email: string; role: string } | null = {
    id: 7,
    email: "ai@test.com",
    role: "user",
  },
): Promise<void> {
  __setSaasAuthResolverForTests(async () => authUser);
  const app = express();
  app.use(express.json());
  registerAiChatRoutes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("POST /api/ai/chat AI-1", () => {
  it("unauthenticated → 401", async () => {
    process.env[FLAG] = "true";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schemaVersion: "1.0", mode: "mentor", message: "Gamma" }),
      });
      assert.equal(res.status, 401);
    }, null);
  });

  it("flag off → AI_DISABLED", async () => {
    delete process.env[FLAG];
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer test",
        },
        body: JSON.stringify({ schemaVersion: "1.0", mode: "mentor", message: "Gamma" }),
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, "AI_DISABLED");
    });
  });

  it("market mode → MODE_NOT_AVAILABLE", async () => {
    process.env[FLAG] = "true";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer test",
        },
        body: JSON.stringify({ schemaVersion: "1.0", mode: "market", message: "Gamma" }),
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { code: string };
      assert.equal(body.code, "MODE_NOT_AVAILABLE");
    });
  });

  it("auth + mentor → 200 structured mock with refs", async () => {
    process.env[FLAG] = "true";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer test",
        },
        body: JSON.stringify({
          schemaVersion: "1.0",
          mode: "mentor",
          message: "Qué es el Dealer Pivot?",
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        mode: string;
        provider: { mocked: boolean };
        summary: string;
        requestId: string;
        knowledgeReferences?: { id: string; title: string; kind: string; category: string }[];
        coverage?: string;
      };
      assert.equal(body.mode, "mentor");
      assert.equal(body.provider.mocked, true);
      assert.ok(body.summary.length > 0);
      assert.ok(body.requestId);
      assert.ok((body.knowledgeReferences?.length ?? 0) >= 1);
      assert.ok(body.knowledgeReferences?.every((r) => r.id && r.title && r.kind && r.category));
      // refs must not leak full explanations
      assert.ok(!JSON.stringify(body.knowledgeReferences).includes("explanation"));
      assert.ok(body.coverage);
    });
  });

  it("rate limit → 429", async () => {
    process.env[FLAG] = "true";
    await withServer(async (baseUrl) => {
      let lastStatus = 0;
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`${baseUrl}/api/ai/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: "Bearer test",
          },
          body: JSON.stringify({ schemaVersion: "1.0", mode: "mentor", message: "Gamma" }),
        });
        lastStatus = res.status;
      }
      assert.equal(lastStatus, 429);
    });
  });
});
