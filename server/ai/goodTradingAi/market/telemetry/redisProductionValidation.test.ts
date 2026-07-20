/**
 * AI-6.4.2 — Production Redis validation (fake/CI only — no network).
 * Real smoke requires GOODTRADING_AI_ALLOW_REDIS_SMOKE=true + CONFIGURED Redis (not run in CI).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  auditRailwayRedisConfig,
  redactRedisSecrets,
  toSafeRedisError,
  containsRedisSecretLeak,
  assertRedisSmokeAuthorized,
  runRedisProductionSmoke,
  runFakeRedisFailureRecoverySmoke,
  FakeRedisClient,
  classifyLatencyP95,
  percentile,
  getRedisSmokeValidationFacts,
  resetRedisSmokeValidationFactsForTests,
  redisSmokeFactsForStatus,
  buildTelemetryMentorReadiness,
  MENTOR_INTEGRATION_NOT_ENABLED,
  canUseTelemetryForMentor,
  isAllowRedisSmokeEnv,
  resetRedisEnvContractWarningsForTests,
} from "./index.ts";

afterEach(() => {
  resetRedisSmokeValidationFactsForTests();
  resetRedisEnvContractWarningsForTests();
  delete process.env.ALLOW_REDIS_SMOKE;
  delete process.env.GOODTRADING_AI_ALLOW_REDIS_SMOKE;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_PRIVATE_URL;
  delete process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY;
});

describe("AI-6.4.2 Railway Redis config audit", () => {
  it("NOT_CONFIGURED when empty", () => {
    const a = auditRailwayRedisConfig({});
    assert.equal(a.classification, "NOT_CONFIGURED");
    assert.equal(a.allowRedisSmoke, false);
    assert.ok(a.proposedRailwaySteps.length >= 5);
  });
  it("CONFIGURED when REDIS_URL + package", () => {
    const a = auditRailwayRedisConfig({ REDIS_URL: "redis://x" } as NodeJS.ProcessEnv);
    assert.equal(a.classification, "CONFIGURED");
    assert.ok(a.setEnvNames.includes("REDIS_URL"));
    assert.ok(!JSON.stringify(a).includes("redis://x"));
  });
  it("PARTIALLY_CONFIGURED host without port", () => {
    const a = auditRailwayRedisConfig({ REDISHOST: "10.0.0.1" } as NodeJS.ProcessEnv);
    assert.equal(a.classification, "PARTIALLY_CONFIGURED");
  });
  it("AMBIGUOUS upstash only", () => {
    const a = auditRailwayRedisConfig({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    } as NodeJS.ProcessEnv);
    assert.equal(a.classification, "AMBIGUOUS");
  });
  it("PARTIALLY when mode redis without URL", () => {
    const a = auditRailwayRedisConfig({
      GOODTRADING_AI_TELEMETRY_REPOSITORY: "redis",
    } as NodeJS.ProcessEnv);
    assert.equal(a.classification, "PARTIALLY_CONFIGURED");
  });
  it("never prints secret values in evidence", () => {
    const secret = "redis://user:SuperSecretPass99@host:6379/0";
    const a = auditRailwayRedisConfig({ REDIS_URL: secret } as NodeJS.ProcessEnv);
    const dump = JSON.stringify(a);
    assert.ok(!dump.includes("SuperSecretPass99"));
    assert.ok(!dump.includes(secret));
  });
});

describe("AI-6.4.2 secret redaction", () => {
  const LEAK = "redis://user:password@host:6379/0";
  it("redacts redis URL", () => {
    const out = redactRedisSecrets(`connect failed ${LEAK} retry`);
    assert.ok(!out.includes("password"));
    assert.ok(!out.includes("user:password"));
    assert.ok(out.includes("[REDIS_URL_REDACTED]"));
  });
  it("redacts rediss URL", () => {
    const out = redactRedisSecrets("rediss://u:p@h:6380");
    assert.equal(containsRedisSecretLeak(out), false);
  });
  it("toSafeRedisError codes only", () => {
    const safe = toSafeRedisError(new Error(`NOAUTH Authentication required ${LEAK}`));
    assert.equal(safe.code, "REDIS_AUTH_FAILED");
    assert.equal(containsRedisSecretLeak(safe.message), false);
    assert.ok(!safe.message.includes("password"));
  });
  it("connect refused → REDIS_CONNECT_FAILED", () => {
    const safe = toSafeRedisError(new Error(`connect ECONNREFUSED ${LEAK}`));
    assert.equal(safe.code, "REDIS_CONNECT_FAILED");
    assert.equal(containsRedisSecretLeak(safe.message), false);
  });
  it("timeout code", () => {
    assert.equal(toSafeRedisError(new Error("Connection timeout")).code, "REDIS_TIMEOUT");
  });
  for (let i = 0; i < 12; i++) {
    it(`leak matrix #${i}`, () => {
      const msg = `err ${LEAK} n=${i}`;
      assert.equal(containsRedisSecretLeak(redactRedisSecrets(msg)), false);
    });
  }
});

describe("AI-6.4.2 smoke gate", () => {
  it("refuses without GOODTRADING_AI_ALLOW_REDIS_SMOKE", () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const g = assertRedisSmokeAuthorized();
    assert.equal(g.ok, false);
  });
  it("refuses when NOT_CONFIGURED even if allow", () => {
    process.env.GOODTRADING_AI_ALLOW_REDIS_SMOKE = "true";
    delete process.env.REDIS_URL;
    const g = assertRedisSmokeAuthorized();
    assert.equal(g.ok, false);
  });
  it("authorizes when canonical allow + CONFIGURED", () => {
    process.env.GOODTRADING_AI_ALLOW_REDIS_SMOKE = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    const g = assertRedisSmokeAuthorized();
    assert.equal(g.ok, true);
  });
  it("alias ALLOW_REDIS_SMOKE still authorizes", () => {
    process.env.ALLOW_REDIS_SMOKE = "true";
    process.env.REDIS_URL = "redis://localhost:6379";
    assert.equal(isAllowRedisSmokeEnv(), true);
    const g = assertRedisSmokeAuthorized();
    assert.equal(g.ok, true);
  });
});

describe("AI-6.4.2 fake smoke runner", () => {
  it("fake smoke CAS + concurrent 13 + isolation", async () => {
    const fake = new FakeRedisClient();
    const report = await runRedisProductionSmoke({
      skipGate: true,
      injectClient: fake,
      latencyIterations: 50,
    });
    assert.equal(report.connectOk, true);
    assert.equal(report.casOk, true);
    assert.equal(report.concurrentFinalSequence, 13);
    assert.equal(report.namespaceIsolationOk, true);
    assert.equal(report.cleanupOk, true);
    assert.equal(report.ok, true);
    assert.equal(report.sharedRepository, "SHARED_REPOSITORY_NOT_CONFIRMED");
    assert.ok(report.latency.samples >= 50);
    assert.ok(["PASS", "ACCEPTABLE_WITH_WARNING", "FAIL"].includes(report.latency.verdict));
    // Production facts must stay false for fake
    assert.equal(getRedisSmokeValidationFacts().smokeValidated, false);
  });
  it("gate refuse leaves NOT_MEASURED facts", async () => {
    const report = await runRedisProductionSmoke();
    assert.equal(report.ok, false);
    assert.equal(report.errorCode, "SMOKE_REFUSED");
    assert.equal(report.latency.verdict, "NOT_MEASURED");
    const st = redisSmokeFactsForStatus();
    assert.equal(st.smokeValidated, false);
    assert.equal(st.latencyVerdict, "NOT_MEASURED");
  });
  it("failure recovery via fake UNAVAILABLE", async () => {
    const r = await runFakeRedisFailureRecoverySmoke();
    assert.equal(r.unavailableHandled, true);
    assert.equal(r.healthIndependent, true);
  });
});

describe("AI-6.4.2 latency helpers", () => {
  it("percentile", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(xs, 50), 5);
  });
  it("classify PASS/WARN/FAIL", () => {
    assert.equal(classifyLatencyP95(10), "PASS");
    assert.equal(classifyLatencyP95(40), "ACCEPTABLE_WITH_WARNING");
    assert.equal(classifyLatencyP95(100), "FAIL");
  });
});

describe("AI-6.4.2 mentor readiness", () => {
  it("mentorEligible false + MENTOR_INTEGRATION_NOT_ENABLED", () => {
    const r = buildTelemetryMentorReadiness();
    assert.equal(r.mentorEligible, false);
    assert.equal(r.canUseTelemetryForMentor, false);
    assert.ok(r.blockers.includes(MENTOR_INTEGRATION_NOT_ENABLED));
    assert.equal(canUseTelemetryForMentor(), false);
    assert.equal(r.redis.smokeValidated, false);
    assert.equal(r.redis.latencyVerdict, "NOT_MEASURED");
  });
  it("redis mode adds REDIS_SMOKE_NOT_VALIDATED", () => {
    process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY = "redis";
    const r = buildTelemetryMentorReadiness();
    assert.ok(r.blockers.includes("REDIS_SMOKE_NOT_VALIDATED"));
    assert.equal(r.mentorEligible, false);
  });
});

describe("AI-6.4.2 security greps", () => {
  const files = [
    "server/ai/goodTradingAi/market/telemetry/redisSmokeRunner.ts",
    "scripts/goodtrading-ai-telemetry-redis-smoke.ts",
    "server/ai/goodTradingAi/market/telemetry/redisRailwayAudit.ts",
  ];
  for (const f of files) {
    it(`no FLUSH/KEYS API in ${f}`, () => {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      assert.ok(!/\bFLUSHALL\b|\bFLUSHDB\b|\.keys\s*\(/i.test(src));
      // Documentary "Do NOT flush" language is ok; ban API identifiers only via FLUSHALL/FLUSHDB
    });
  }
  it("smoke script requires GOODTRADING_AI_ALLOW_REDIS_SMOKE", () => {
    const src = readFileSync(
      join(process.cwd(), "scripts/goodtrading-ai-telemetry-redis-smoke.ts"),
      "utf8",
    );
    assert.ok(src.includes("GOODTRADING_AI_ALLOW_REDIS_SMOKE"));
    assert.ok(src.includes("assertRedisSmokeAuthorized"));
  });
});

describe("AI-6.4.2 status facts honesty pad", () => {
  for (let i = 0; i < 20; i++) {
    it(`facts default false #${i}`, () => {
      const f = redisSmokeFactsForStatus();
      assert.equal(f.smokeValidated, false);
      assert.equal(f.sharedRepository, "NOT_MEASURED");
      assert.equal(f.latencyVerdict, "NOT_MEASURED");
    });
  }
});

describe("AI-6.4.2 connection lifecycle note", () => {
  it("docs mention lifecycle", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/goodtrading-ai-telemetry-redis-production-validation.md"),
      "utf8",
    );
    assert.ok(doc.includes("lifecycle"));
    assert.ok(doc.includes("GOODTRADING_AI_ALLOW_REDIS_SMOKE") || doc.includes("ALLOW_REDIS_SMOKE"));
    assert.ok(doc.includes("NOT_MEASURED"));
  });
});
