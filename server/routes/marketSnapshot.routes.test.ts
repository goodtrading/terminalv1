/**
 * Route tests for Market Snapshot (AI-6).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth.ts";
import { registerMarketSnapshotRoutes } from "./marketSnapshot.routes.ts";
import { resetMarketSnapshotRateLimitsForTests } from "../ai/goodTradingAi/market/rateLimit.ts";

let server: Server | null = null;
const FLAG = "GOODTRADING_AI_MARKET_SNAPSHOT_ENABLED";
const LIVE = "GOODTRADING_AI_MARKET_LIVE_ENABLED";
const prev = process.env[FLAG];
const prevLive = process.env[LIVE];

afterEach(async () => {
  __setSaasAuthResolverForTests(null);
  resetMarketSnapshotRateLimitsForTests();
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
  if (prevLive === undefined) delete process.env[LIVE];
  else process.env[LIVE] = prevLive;
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
  registerMarketSnapshotRoutes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("market snapshot routes AI-6", () => {
  it("flag off → 403 even for admin", async () => {
    delete process.env[FLAG];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/market/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    });
  });

  it("non-admin → 403 when flag on", async () => {
    process.env[FLAG] = "true";
    await withServer(
      async (base) => {
        const res = await fetch(`${base}/api/internal/ai/market/status`, {
          headers: { Authorization: "Bearer t" },
        });
        assert.equal(res.status, 403);
      },
      { id: 2, email: "u@test.com", role: "user" },
    );
  });

  it("admin stub snapshot + simulate", async () => {
    process.env[FLAG] = "true";
    delete process.env[LIVE];
    await withServer(async (base) => {
      const snap = await fetch(`${base}/api/internal/ai/market/snapshot?symbol=ETHUSDT`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(snap.status, 200);
      const body = (await snap.json()) as {
        snapshot: { symbol: string; gamma: { hypothesisOnly: boolean }; source: string };
        live: boolean;
        durationMs: number;
      };
      assert.equal(body.live, false);
      assert.equal(body.snapshot.symbol, "ETHUSDT");
      assert.equal(body.snapshot.gamma.hypothesisOnly, true);
      assert.ok(body.durationMs < 100);

      const sim = await fetch(`${base}/api/internal/ai/market/simulate`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ scenario: "bullish_confluence", symbol: "BTCUSDT" }),
      });
      assert.equal(sim.status, 200);
      const simBody = (await sim.json()) as {
        snapshot: { source: string; scores: { confluence: number }; evidence: Array<{ origin: string }> };
        rendered: { headline: string };
      };
      assert.equal(simBody.snapshot.source, "simulate");
      assert.ok(simBody.rendered.headline.includes("BTCUSDT"));
      assert.ok(simBody.snapshot.evidence.every((e) => e.origin === "INFERRED"));
    });
  });

  it("capabilities endpoint lists sources", async () => {
    process.env[FLAG] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/market/capabilities`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { capabilities: Array<{ sourceId: string }> };
      assert.ok(body.capabilities.length >= 5);
    });
  });

  it("live disabled → 403", async () => {
    process.env[FLAG] = "true";
    delete process.env[LIVE];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/market/live`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 403);
    });
  });
});

describe("market telemetry routes AI-6.2", () => {
  const TELEMETRY = "GOODTRADING_AI_MARKET_TELEMETRY_ENABLED";
  const prevTel = process.env[TELEMETRY];

  afterEach(() => {
    if (prevTel === undefined) delete process.env[TELEMETRY];
    else process.env[TELEMETRY] = prevTel;
  });

  it("telemetry flag off → 403", async () => {
    process.env[FLAG] = "true";
    delete process.env[TELEMETRY];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/market/telemetry`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ telemetry: {} }),
      });
      assert.equal(res.status, 403);
    });
  });

  it("status exposes telemetryEnabled + repositoryMode", async () => {
    process.env[FLAG] = "true";
    process.env[TELEMETRY] = "true";
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/internal/ai/market/status`, {
        headers: { Authorization: "Bearer t" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        telemetryEnabled: boolean;
        repositoryMode: string;
      };
      assert.equal(body.telemetryEnabled, true);
      assert.equal(body.repositoryMode, "memory");
    });
  });

  it("ingest compact telemetry → 202 then replay → 409", async () => {
    process.env[FLAG] = "true";
    process.env[TELEMETRY] = "true";
    const { buildCompactMarketTelemetry } = await import(
      "@shared/goodTradingAiMarketTelemetry"
    );
    const { resetMarketTelemetryStoreForTests } = await import(
      "../ai/goodTradingAi/market/telemetry/index.ts"
    );
    resetMarketTelemetryStoreForTests();

    const { telemetry } = buildCompactMarketTelemetry({
      symbol: "BTCUSDT",
      sessionId: "sess_route_test_01",
      sequence: 1,
      orderFlowSummary: {
        tradeCount: 30,
        buyVolume: 4,
        sellVolume: 2,
        delta: 2,
        cvd: 5,
        imbalancePct: 15,
      },
    });

    await withServer(async (base) => {
      const ok = await fetch(`${base}/api/internal/ai/market/telemetry`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ telemetry }),
      });
      assert.equal(ok.status, 202);
      const again = await fetch(`${base}/api/internal/ai/market/telemetry`, {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ telemetry }),
      });
      assert.equal(again.status, 409);
    });
  });
});
