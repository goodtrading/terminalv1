/**
 * AI-6.4.4b — RedisValidationProof tests (FakeRedis only — no network).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  FakeRedisClient,
  buildRedisValidationProof,
  buildRedisValidationProofKey,
  parseRedisValidationProof,
  serializeRedisValidationProof,
  writeRedisValidationProof,
  readRedisValidationProof,
  redisValidationProofForStatus,
  REDIS_VALIDATION_PROOF_TTL_MS,
  REDIS_VALIDATION_PROOF_SCHEMA_VERSION,
  latencyVerdictToClass,
  containsRedisSecretLeak,
} from "./index.ts";

afterEach(() => {
  /* no process env mutation required */
});

describe("AI-6.4.4b RedisValidationProof schema", () => {
  it("schemaVersion 1.0", () => {
    assert.equal(REDIS_VALIDATION_PROOF_SCHEMA_VERSION, "1.0");
  });
  it("TTL is 7 days (not telemetry 10-15s)", () => {
    assert.equal(REDIS_VALIDATION_PROOF_TTL_MS, 7 * 24 * 60 * 60 * 1000);
    assert.ok(REDIS_VALIDATION_PROOF_TTL_MS > 15_000);
  });
  it("admin key stable under prod prefix", () => {
    const k = buildRedisValidationProofKey("gt:ai:telem");
    assert.equal(k, "gt:ai:telem:admin:redis_validation_proof");
    assert.ok(!k.includes("smoke:"));
  });
  it("builds proof with mentorEligible always false", () => {
    const p = buildRedisValidationProof({
      smokeId: "abc123",
      urlEnvName: "REDIS_PRIVATE_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyVerdict: "PASS",
      latencySamples: 60,
      latencyP50Ms: 2,
      latencyP95Ms: 5,
      latencyP99Ms: 8,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    assert.equal(p.mentorEligible, false);
    assert.equal(p.latencyClass, "GOOD");
    assert.equal(p.proofSource, "authorized_smoke");
  });
  it("rejects mentorEligible true on parse", () => {
    const raw = JSON.stringify({
      schemaVersion: "1.0",
      smokeValidated: true,
      validatedAtMs: Date.now(),
      expiresAtMs: Date.now() + 10000,
      smokeId: "xxxx",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyClass: "GOOD",
      latencyVerdict: "PASS",
      latencySamples: 1,
      latencyP50Ms: 1,
      latencyP95Ms: 1,
      latencyP99Ms: 1,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      mentorEligible: true,
      proofSource: "authorized_smoke",
    });
    assert.equal(parseRedisValidationProof(raw), null);
  });
  it("expiry rejects stale proof", () => {
    const p = buildRedisValidationProof({
      smokeId: "old1",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyVerdict: "PASS",
      latencySamples: 1,
      latencyP50Ms: 1,
      latencyP95Ms: 1,
      latencyP99Ms: 1,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
      nowMs: Date.now() - 10_000,
      ttlMs: 1_000,
    });
    assert.equal(parseRedisValidationProof(serializeRedisValidationProof(p)), null);
  });
  it("status projection never includes secrets or full key", () => {
    const p = buildRedisValidationProof({
      smokeId: "sid1",
      urlEnvName: "REDIS_PRIVATE_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyVerdict: "ACCEPTABLE_WITH_WARNING",
      latencySamples: 50,
      latencyP50Ms: 10,
      latencyP95Ms: 40,
      latencyP99Ms: 50,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    const st = redisValidationProofForStatus(p);
    const dump = JSON.stringify(st);
    assert.equal(st.mentorEligible, false);
    assert.equal(st.latencyClass, "ACCEPTABLE");
    assert.ok(!dump.includes("redis://"));
    assert.ok(!dump.includes("admin:redis_validation_proof"));
    assert.ok(!containsRedisSecretLeak(dump));
  });
  it("latency class mapping", () => {
    assert.equal(latencyVerdictToClass("PASS"), "GOOD");
    assert.equal(latencyVerdictToClass("ACCEPTABLE_WITH_WARNING"), "ACCEPTABLE");
    assert.equal(latencyVerdictToClass("FAIL"), "HIGH");
  });
});

describe("AI-6.4.4b proof FakeRedis persist", () => {
  it("write + read roundtrip", async () => {
    const fake = new FakeRedisClient();
    const proof = buildRedisValidationProof({
      smokeId: "round1",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyVerdict: "PASS",
      latencySamples: 60,
      latencyP50Ms: 1,
      latencyP95Ms: 2,
      latencyP99Ms: 3,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    const w = await writeRedisValidationProof(fake, "gt:ai:telem:t", proof);
    assert.equal(w.ok, true);
    const got = await readRedisValidationProof(fake, "gt:ai:telem:t");
    assert.equal(got?.smokeId, "round1");
    assert.equal(got?.smokeValidated, true);
    await fake.quit();
  });
  it("refuses write when smokeValidated false", async () => {
    const fake = new FakeRedisClient();
    const proof = buildRedisValidationProof({
      smokeId: "deny",
      urlEnvName: "REDIS_URL",
      sharedRepository: "NOT_MEASURED",
      latencyVerdict: "NOT_MEASURED",
      latencySamples: 0,
      latencyP50Ms: null,
      latencyP95Ms: null,
      latencyP99Ms: null,
      casConcurrentFinalSequence: null,
      namespaceIsolationOk: null,
      cleanupOk: false,
      smokeValidated: false,
    });
    const w = await writeRedisValidationProof(fake, "gt:ai:telem:t", proof);
    assert.equal(w.ok, false);
    assert.equal(await readRedisValidationProof(fake, "gt:ai:telem:t"), null);
    await fake.quit();
  });
});
