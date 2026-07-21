/**
 * AI-6.4.4e — FakeRedis latency diagnostic tests (no network).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyRedisRouteClass,
  isAllowRedisDiagnosticEnv,
  runFakeRedisLatencyDiagnostic,
  runRedisLatencyDiagnostic,
} from "./redisLatencyDiagnostic.ts";
import { FakeRedisClient } from "./redisClient.ts";

describe("AI-6.4.4e Redis latency diagnostic", () => {
  it("gate refuses without GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC", async () => {
    const prev = process.env.GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC;
    delete process.env.GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC;
    try {
      assert.equal(isAllowRedisDiagnosticEnv({}), false);
      const r = await runRedisLatencyDiagnostic({
        env: {},
        skipGate: false,
      });
      assert.equal(r.gateOk, false);
      assert.equal(r.errorCode, "DIAGNOSTIC_REFUSED");
    } finally {
      if (prev == null) delete process.env.GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC;
      else process.env.GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC = prev;
    }
  });

  it("FakeRedis diagnostic produces block stats", async () => {
    const r = await runFakeRedisLatencyDiagnostic();
    assert.equal(r.gateOk, true);
    assert.equal(r.ok, true);
    assert.equal(r.routeClass, "LOCAL");
    const names = r.blocks.map((b) => b.name);
    for (const n of [
      "raw_SET",
      "raw_GET",
      "lua_CAS_only",
      "repo_putAsync_full",
      "serialization_cpu",
      "e2e_put_get_remove",
    ]) {
      assert.ok(names.includes(n), `missing block ${n}`);
    }
    const put = r.blocks.find((b) => b.name === "repo_putAsync_full");
    assert.ok(put && put.samples >= 8);
    assert.ok(put!.p95Ms != null && put!.p95Ms < 50);
    assert.equal(r.decomposition.removeSessionOutsideSmokeTimer, true);
    assert.ok(r.decomposition.smokeMeasures.includes("CAS Lua"));
  });

  it("route class never requires printing host", () => {
    assert.equal(
      classifyRedisRouteClass({
        url: "redis://redis.railway.internal:6379",
        urlEnvName: "REDIS_URL",
        tls: false,
      }),
      "PRIVATE_RAILWAY",
    );
    assert.equal(
      classifyRedisRouteClass({
        url: "rediss://default:x@host.proxy.rlwy.net:1234",
        urlEnvName: "REDIS_URL",
        tls: true,
      }),
      "PUBLIC_PROXY",
    );
    assert.equal(
      classifyRedisRouteClass({
        url: "redis://127.0.0.1:6379",
        urlEnvName: "REDIS_URL",
        tls: false,
      }),
      "LOCAL",
    );
    assert.equal(
      classifyRedisRouteClass({
        url: "redis://fake",
        urlEnvName: "REDIS_PRIVATE_URL",
        tls: false,
      }),
      "PRIVATE_RAILWAY",
    );
  });

  it("injectClient path does not claim real shared root causes incorrectly", async () => {
    const fake = new FakeRedisClient();
    const r = await runRedisLatencyDiagnostic({
      injectClient: fake,
      skipGate: true,
      rawSamples: 10,
      repoSamples: 8,
    });
    assert.ok(r.suggestedRootCauseCandidates.length >= 1);
    assert.ok(!r.suggestedRootCauseCandidates.includes("PUBLIC_ROUTE_LATENCY"));
  });
});
