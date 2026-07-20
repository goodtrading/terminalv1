/**
 * Route tests for Knowledge Acquisition Inbox (AI-5).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth.ts";
import { registerExtractorRoutes } from "./extractor.routes.ts";
import { resetExtractorStoreForTests } from "../ai/goodTradingAi/extractor/store.ts";
import { resetExtractorRateLimitsForTests } from "../ai/goodTradingAi/extractor/rateLimit.ts";
import { knowledgeRegistry } from "../ai/goodTradingAi/knowledge/registry.ts";

let server: Server | null = null;
const FLAG = "GOODTRADING_AI_EXTRACTOR_ENABLED";
const prev = process.env[FLAG];

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  resetExtractorStoreForTests();
  resetExtractorRateLimitsForTests();
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
  authUser: { id: number; email: string; role: string } | null = {
    id: 9,
    email: "admin@test.com",
    role: "admin",
  },
): Promise<void> {
  __setSaasAuthResolverForTests(async () => authUser);
  const app = express();
  app.use(express.json());
  registerExtractorRoutes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("extractor routes AI-5", () => {
  it("flag off → 403 even for admin", async () => {
    delete process.env[FLAG];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/extractor/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    });
  });

  it("non-admin → 403 when flag on", async () => {
    process.env[FLAG] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/extractor/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    }, { id: 2, email: "u@test.com", role: "user" });
  });

  it("admin extract + review does not mutate registry", async () => {
    process.env[FLAG] = "true";
    const before = knowledgeRegistry.count();
    await withServer(async (base) => {
      const extract = await fetch(`${base}/api/internal/ai/extractor/extract`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({
          transcript:
            "Principio: contexto antes que señal. Anti-patrón: confundir wall con reversión. Ejemplo: absorption en un nivel con pasivo.",
          sourceLabel: "route-test",
        }),
      });
      assert.equal(extract.status, 200);
      const body = (await extract.json()) as {
        proposals: Array<{ id: string }>;
        autoAppliedToBrain: boolean;
      };
      assert.equal(body.autoAppliedToBrain, false);
      assert.ok(body.proposals.length >= 1);

      const review = await fetch(`${base}/api/internal/ai/extractor/review`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({
          proposalId: body.proposals[0]!.id,
          decision: "ACCEPT",
        }),
      });
      assert.equal(review.status, 200);
      const revBody = (await review.json()) as { autoAppliedToBrain: boolean };
      assert.equal(revBody.autoAppliedToBrain, false);
      assert.equal(knowledgeRegistry.count(), before);

      const inbox = await fetch(`${base}/api/internal/ai/extractor/inbox`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(inbox.status, 200);
    });
  });
});
