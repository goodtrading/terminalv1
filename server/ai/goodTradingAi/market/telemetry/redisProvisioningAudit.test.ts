/**
 * AI-6.4.3 — Provisioning audit tests (no network, no invented REDIS_READY).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auditRailwayRedisProvisioning } from "./redisProvisioningAudit.ts";

describe("AI-6.4.3 provisioning audit", () => {
  it("STOP when no CLI/link/URL", () => {
    const a = auditRailwayRedisProvisioning({
      env: {},
      railwayCliPresent: false,
      cwd: process.cwd(),
    });
    assert.equal(a.classification, "REDIS_NOT_CREATED");
    assert.equal(a.stoppedForHumanConfig, true);
    assert.ok(a.stopReason?.includes("STOPPED_FOR_HUMAN_CONFIG") || a.stopReason);
    assert.ok(!JSON.stringify(a).includes("redis://"));
  });

  it("EXISTS_NOT_LINKED when service evidenced but not linked", () => {
    const a = auditRailwayRedisProvisioning({
      env: {},
      railwayCliPresent: true,
      redisServiceEvidenced: true,
      redisLinkedToBackend: false,
    });
    assert.equal(a.classification, "REDIS_EXISTS_NOT_LINKED");
    assert.equal(a.stoppedForHumanConfig, true);
  });

  it("REDIS_READY only with full evidence", () => {
    const a = auditRailwayRedisProvisioning({
      env: { REDIS_URL: "redis://localhost:6379" } as NodeJS.ProcessEnv,
      railwayCliPresent: true,
      railwayCliAuthenticated: true,
      redisServiceEvidenced: true,
      redisLinkedToBackend: true,
    });
    assert.equal(a.classification, "REDIS_READY");
    assert.equal(a.stoppedForHumanConfig, false);
    assert.ok(!JSON.stringify(a).includes("localhost"));
  });

  it("local URL without Railway link → AMBIGUOUS stop", () => {
    const a = auditRailwayRedisProvisioning({
      env: { REDIS_URL: "redis://x" } as NodeJS.ProcessEnv,
      railwayCliPresent: false,
      redisLinkedToBackend: false,
    });
    assert.equal(a.classification, "REDIS_CONFIGURATION_AMBIGUOUS");
    assert.equal(a.stoppedForHumanConfig, true);
  });

  it("runbook doc exists", () => {
    const p = join(process.cwd(), "docs/goodtrading-ai-telemetry-redis-railway-provisioning.md");
    const text = readFileSync(p, "utf8");
    assert.ok(text.includes("STOPPED_FOR_HUMAN_CONFIG"));
    assert.ok(text.includes("Click-by-click"));
    assert.ok(!/redis:\/\/[^.]+:.+@/i.test(text));
  });
});
