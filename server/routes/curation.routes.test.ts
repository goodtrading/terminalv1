/**
 * Route tests for Knowledge Curation (AI-5.5).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth.ts";
import { registerCurationRoutes } from "./curation.routes.ts";
import { resetCurationStoreForTests } from "../ai/goodTradingAi/curation/curationStore.ts";
import { resetCurationRateLimitsForTests } from "../ai/goodTradingAi/curation/rateLimit.ts";
import { knowledgeRegistry } from "../ai/goodTradingAi/knowledge/registry.ts";

let server: Server | null = null;
const FLAG = "GOODTRADING_AI_CURATION_ENABLED";
const prev = process.env[FLAG];

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  resetCurationStoreForTests();
  resetCurationRateLimitsForTests();
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
  registerCurationRoutes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("curation routes AI-5.5", () => {
  it("flag off → 403 even for admin", async () => {
    delete process.env[FLAG];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/curation/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    });
  });

  it("non-admin → 403 when flag on", async () => {
    process.env[FLAG] = "true";
    await withServer(
      async (base) => {
        const res = await fetch(`${base}/api/internal/ai/curation/status`, {
          headers: { Authorization: "Bearer t" },
        });
        assert.equal(res.status, 403);
      },
      { id: 2, email: "u@test.com", role: "user" },
    );
  });

  it("admin scan + review does not mutate registry", async () => {
    process.env[FLAG] = "true";
    const before = knowledgeRegistry.count();
    await withServer(async (base) => {
      const scan = await fetch(`${base}/api/internal/ai/curation/scan`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ includeQuality: true }),
      });
      assert.equal(scan.status, 200);
      const body = (await scan.json()) as {
        issues: Array<{ id: string }>;
        autoAppliedToBrain: boolean;
        metrics: { entryCount: number };
      };
      assert.equal(body.autoAppliedToBrain, false);
      assert.ok(body.metrics.entryCount >= 70);
      assert.ok(body.issues.length >= 1);

      const review = await fetch(`${base}/api/internal/ai/curation/review`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({
          issueId: body.issues[0]!.id,
          decision: "IGNORE",
          notes: "route-test",
        }),
      });
      assert.equal(review.status, 200);
      const revBody = (await review.json()) as { autoAppliedToBrain: boolean };
      assert.equal(revBody.autoAppliedToBrain, false);
      assert.equal(knowledgeRegistry.count(), before);

      const versions = await fetch(`${base}/api/internal/ai/curation/versions`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(versions.status, 200);
      const vBody = (await versions.json()) as { count: number };
      assert.ok(vBody.count >= 1);
    });
  });
});
