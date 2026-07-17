/**
 * Route access tests for Calibration Lab.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth.ts";
import { registerCalibrationRoutes } from "./calibration.routes.ts";
import { resetCalibrationRateLimitsForTests } from "../ai/goodTradingAi/calibration/rateLimit.ts";
import { resetCalibrationStoreForTests } from "../ai/goodTradingAi/calibration/store.ts";

let server: Server | null = null;
const FLAG = "GOODTRADING_AI_CALIBRATION_ENABLED";
const prev = process.env[FLAG];

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  resetCalibrationRateLimitsForTests();
  resetCalibrationStoreForTests();
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
});

async function withServer(
  fn: (base: string) => Promise<void>,
  user: { id: number; email: string; role: string } | null,
) {
  __setSaasAuthResolverForTests(async () => user);
  const app = express();
  app.use(express.json());
  registerCalibrationRoutes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("calibration routes access", () => {
  it("flag off → 403 even for admin", async () => {
    delete process.env[FLAG];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/calibration/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    }, { id: 1, email: "a@t.com", role: "admin" });
  });

  it("non-admin → 403 when flag on", async () => {
    process.env[FLAG] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/calibration/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    }, { id: 2, email: "u@t.com", role: "user" });
  });

  it("unauth → 401", async () => {
    process.env[FLAG] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/calibration/status`);
      assert.equal(res.status, 401);
    }, null);
  });

  it("admin + flag → 200 status and cases", async () => {
    process.env[FLAG] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/calibration/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { caseCount: number };
      assert.ok(body.caseCount >= 40);

      const cases = await fetch(`${base}/api/internal/ai/calibration/cases`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(cases.status, 200);
    }, { id: 1, email: "admin@t.com", role: "admin" });
  });

  it("review endpoint does not require applying knowledge", async () => {
    process.env[FLAG] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/calibration/reviews`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({
          caseId: "cal_gamma_01",
          decision: "SKIPPED",
          ignacioAnswer: "",
          corrections: "",
          missingContext: "",
          notes: "skip",
        }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { review: { decision: string } };
      assert.equal(body.review.decision, "SKIPPED");
    }, { id: 1, email: "admin@t.com", role: "admin" });
  });
});
