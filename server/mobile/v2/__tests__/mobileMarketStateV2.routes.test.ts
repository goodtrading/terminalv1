/**
 * Route integration tests for mobile market-state v2.
 */
import { test, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { __setSaasAuthResolverForTests } from "../../../middleware/saasAuth";
import { __setMobileTerminalAccessResolverForTests } from "../../../services/mobile/mobileTerminalAccessService";
import {
  __resetMobileV2CacheForTests,
  __setMobileV2TerminalStateLoaderForTests,
} from "../mobileMarketStateCache";
import { resetMobileRateLimitsForTests } from "../../../middleware/mobileRateLimit";
import { registerMobileMarketStateV2Routes } from "../../../routes/mobileMarketStateV2.routes";
import { makeTerminalStateFixture } from "./fixtures";

let server: Server | null = null;

afterEach(async () => {
  __resetMobileV2CacheForTests();
  __setMobileV2TerminalStateLoaderForTests(null);
  __setMobileTerminalAccessResolverForTests(null);
  __setSaasAuthResolverForTests(null);
  resetMobileRateLimitsForTests();
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

function activeAccess() {
  __setMobileTerminalAccessResolverForTests(async () => ({
    allowed: true,
    subscription: {
      id: 1,
      planId: 1,
      planName: "Monthly",
      planSlug: "monthly",
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      startsAt: new Date().toISOString(),
    },
  }));
}

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
  authUser: { id: number; email: string; role: string } | null = {
    id: 42,
    email: "u@test.com",
    role: "user",
  },
): Promise<void> {
  __setSaasAuthResolverForTests(async () => authUser);
  activeAccess();
  __setMobileV2TerminalStateLoaderForTests(async () => makeTerminalStateFixture());

  const app = express();
  registerMobileMarketStateV2Routes(app);
  server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  await fn(`http://127.0.0.1:${port}`);
}

describe("route integration", () => {
  test("Bearer válido + plan activo → 200", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/market-state/v2?asset=BTC&mode=both`, {
        headers: { Authorization: "Bearer test-token" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        status: string;
        meta: { requestId: string; generatedAt: string; servedAt: string; snapshotId: string };
      };
      assert.equal(body.status, "success");
      assert.ok(body.meta.requestId);
      assert.ok(body.meta.generatedAt);
      assert.ok(body.meta.servedAt);
      assert.ok(body.meta.snapshotId);
      assert.equal(res.headers.get("x-request-id"), body.meta.requestId);
    });
  });

  test("sin token → 401", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/market-state/v2?asset=BTC&mode=micro`);
      assert.equal(res.status, 401);
    }, null);
  });

  test("Bearer inválido (resolver null) → 401", async () => {
    await withServer(
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/mobile/market-state/v2?asset=BTC&mode=micro`, {
          headers: { Authorization: "Bearer invalid" },
        });
        assert.equal(res.status, 401);
      },
      null,
    );
  });

  test("usuario autenticado sin acceso → 403", async () => {
    await withServer(async (baseUrl) => {
      __setMobileTerminalAccessResolverForTests(async () => ({
        allowed: false,
        reason: "no_subscription",
      }));
      const res = await fetch(`${baseUrl}/api/mobile/market-state/v2?asset=BTC&mode=micro`, {
        headers: { Authorization: "Bearer test-token" },
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "PLAN_REQUIRED");
    });
  });

  test("rate limit excedido → 429 con Retry-After", async () => {
    await withServer(async (baseUrl) => {
      const url = `${baseUrl}/api/mobile/market-state/v2?asset=BTC&mode=micro`;
      const headers = { Authorization: "Bearer test-token" };
      for (let i = 0; i < 60; i += 1) {
        const ok = await fetch(url, { headers });
        assert.equal(ok.status, 200);
      }
      const blocked = await fetch(url, { headers });
      assert.equal(blocked.status, 429);
      assert.ok(blocked.headers.get("retry-after"));
      assert.ok(blocked.headers.get("x-ratelimit-limit"));
      const body = (await blocked.json()) as { error: { code: string } };
      assert.equal(body.error.code, "MOBILE_RATE_LIMITED");
    });
  });

  test("400 asset no soportado", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/market-state/v2?asset=ETH&mode=micro`, {
        headers: { Authorization: "Bearer test-token" },
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "UNSUPPORTED_ASSET");
    });
  });
});
