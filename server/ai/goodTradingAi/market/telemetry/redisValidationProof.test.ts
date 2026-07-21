/**
 * AI-6.4.4g — RedisValidationProof v2 + semantics tests (FakeRedis only).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FakeRedisClient,
  buildRedisValidationProof,
  buildRedisValidationProofKey,
  parseRedisValidationProof,
  serializeRedisValidationProof,
  writeRedisValidationProof,
  readRedisValidationProof,
  redisValidationProofForStatus,
  deriveValidationStatus,
  REDIS_VALIDATION_PROOF_TTL_MS,
  REDIS_VALIDATION_PROOF_SCHEMA_VERSION,
  latencyVerdictToClass,
  toPerformanceVerdict,
  classifyPerformanceP95,
  performancePassedForVerdict,
  REDIS_PERFORMANCE_THRESHOLDS_VERSION,
  containsRedisSecretLeak,
  buildTelemetryMentorReadiness,
} from "./index.ts";

describe("AI-6.4.4g RedisValidationProof schema 2.0", () => {
  it("schemaVersion 2.0", () => {
    assert.equal(REDIS_VALIDATION_PROOF_SCHEMA_VERSION, "2.0");
  });
  it("TTL is 7 days", () => {
    assert.equal(REDIS_VALIDATION_PROOF_TTL_MS, 7 * 24 * 60 * 60 * 1000);
  });
  it("admin key stable", () => {
    assert.equal(
      buildRedisValidationProofKey("gt:ai:telem"),
      "gt:ai:telem:admin:redis_validation_proof",
    );
  });
  it("builds HIGH proof with performancePassed false + warning status", () => {
    const p = buildRedisValidationProof({
      smokeId: "abc12345",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      correctnessVerdict: "PASS",
      connectOk: true,
      casOk: true,
      performanceVerdict: "HIGH",
      latencySamples: 60,
      latencyP50Ms: 138,
      latencyP95Ms: 140,
      latencyP99Ms: 145,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    assert.equal(p.schemaVersion, "2.0");
    assert.equal(p.mentorEligible, false);
    assert.equal(p.security.mentorEligible, false);
    assert.equal(p.correctness.verdict, "PASS");
    assert.equal(p.performance.verdict, "HIGH");
    assert.equal(p.performance.performancePassed, false);
    assert.equal(p.performance.thresholdsVersion, REDIS_PERFORMANCE_THRESHOLDS_VERSION);
    assert.equal(p.metadata.validationStatus, "VALIDATED_WITH_PERFORMANCE_WARNING");
    assert.equal(p.metadata.smokeValidated, true);
  });
  it("status matrix badges never fullyReady", () => {
    const p = buildRedisValidationProof({
      smokeId: "highwarn1",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      correctnessVerdict: "PASS",
      connectOk: true,
      casOk: true,
      performanceVerdict: "HIGH",
      latencySamples: 50,
      latencyP50Ms: 138,
      latencyP95Ms: 140,
      latencyP99Ms: 142,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    const st = redisValidationProofForStatus(p);
    assert.equal(st.smokeValidated, true);
    assert.equal(st.validationStatus, "VALIDATED_WITH_PERFORMANCE_WARNING");
    assert.equal(st.performancePassed, false);
    assert.equal(st.badges.redisValidated, true);
    assert.equal(st.badges.performanceWarning, true);
    assert.equal(st.badges.fullyReady, false);
    assert.ok(st.warnings.includes("REDIS_HIGH_LATENCY"));
    assert.ok(st.blockers.includes("REDIS_PERFORMANCE_NOT_APPROVED"));
    assert.equal(st.mentorEligible, false);
    assert.ok(!containsRedisSecretLeak(JSON.stringify(st)));
  });
  it("GOOD performance → VALIDATED", () => {
    assert.equal(
      deriveValidationStatus({ correctness: "PASS", performance: "GOOD" }),
      "VALIDATED",
    );
    const p = buildRedisValidationProof({
      smokeId: "good0001",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      correctnessVerdict: "PASS",
      connectOk: true,
      casOk: true,
      performanceVerdict: "GOOD",
      latencySamples: 60,
      latencyP50Ms: 2,
      latencyP95Ms: 5,
      latencyP99Ms: 8,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    assert.equal(p.metadata.validationStatus, "VALIDATED");
    assert.equal(p.performance.performancePassed, true);
  });
  it("rejects mentorEligible true", () => {
    const raw = JSON.stringify({
      schemaVersion: "2.0",
      correctness: {
        verdict: "PASS",
        connectOk: true,
        casOk: true,
        concurrentFinalSequence: 13,
        namespaceIsolationOk: true,
        sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
        cleanupOk: true,
      },
      performance: {
        verdict: "GOOD",
        performancePassed: true,
        samples: 1,
        p50Ms: 1,
        p95Ms: 1,
        p99Ms: 1,
        thresholdsVersion: REDIS_PERFORMANCE_THRESHOLDS_VERSION,
      },
      security: { mentorEligible: false, noSilentMemoryFallback: true },
      metadata: {
        smokeId: "xxxx",
        validatedAtMs: Date.now(),
        expiresAtMs: Date.now() + 10000,
        urlEnvName: "REDIS_URL",
        proofSource: "authorized_smoke",
        validationStatus: "VALIDATED",
        smokeValidated: true,
      },
      mentorEligible: true,
    });
    assert.equal(parseRedisValidationProof(raw), null);
  });
  it("reads legacy 1.0 and migrates in memory", () => {
    const legacy = {
      schemaVersion: "1.0",
      smokeValidated: true,
      validatedAtMs: Date.now(),
      expiresAtMs: Date.now() + REDIS_VALIDATION_PROOF_TTL_MS,
      smokeId: "leg10001",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyClass: "ACCEPTABLE",
      latencyVerdict: "ACCEPTABLE_WITH_WARNING",
      latencySamples: 50,
      latencyP50Ms: 10,
      latencyP95Ms: 40,
      latencyP99Ms: 50,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      mentorEligible: false,
      proofSource: "authorized_smoke",
    };
    const got = parseRedisValidationProof(JSON.stringify(legacy));
    assert.ok(got);
    assert.equal(got!.schemaVersion, "2.0");
    assert.equal(got!.performance.verdict, "ACCEPTABLE");
    assert.equal(got!.mentorEligible, false);
  });
  it("legacy FAIL latency migrates to HIGH not functional fail", () => {
    const legacy = {
      schemaVersion: "1.0",
      smokeValidated: true,
      validatedAtMs: Date.now(),
      expiresAtMs: Date.now() + REDIS_VALIDATION_PROOF_TTL_MS,
      smokeId: "leghigh1",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      latencyClass: "HIGH",
      latencyVerdict: "FAIL",
      latencySamples: 50,
      latencyP50Ms: 138,
      latencyP95Ms: 140,
      latencyP99Ms: 145,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      mentorEligible: false,
      proofSource: "authorized_smoke",
    };
    const got = parseRedisValidationProof(JSON.stringify(legacy));
    assert.equal(got?.correctness.verdict, "PASS");
    assert.equal(got?.performance.verdict, "HIGH");
    assert.equal(got?.metadata.validationStatus, "VALIDATED_WITH_PERFORMANCE_WARNING");
  });
  it("write refuses correctness FAIL", async () => {
    const fake = new FakeRedisClient();
    const proof = buildRedisValidationProof({
      smokeId: "denyfail",
      urlEnvName: "REDIS_URL",
      sharedRepository: "NOT_MEASURED",
      correctnessVerdict: "FAIL",
      connectOk: false,
      casOk: false,
      performanceVerdict: "NOT_MEASURED",
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
    await fake.quit();
  });
  it("write+read HIGH roundtrip persists performancePassed false", async () => {
    const fake = new FakeRedisClient();
    const proof = buildRedisValidationProof({
      smokeId: "roundhigh",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      correctnessVerdict: "PASS",
      connectOk: true,
      casOk: true,
      performanceVerdict: "HIGH",
      latencySamples: 60,
      latencyP50Ms: 138,
      latencyP95Ms: 140,
      latencyP99Ms: 142,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    const w = await writeRedisValidationProof(fake, "gt:ai:telem:t", proof);
    assert.equal(w.ok, true, w.reason);
    const got = await readRedisValidationProof(fake, "gt:ai:telem:t");
    assert.equal(got?.schemaVersion, "2.0");
    assert.equal(got?.performance.verdict, "HIGH");
    assert.equal(got?.performance.performancePassed, false);
    assert.equal(got?.metadata.validationStatus, "VALIDATED_WITH_PERFORMANCE_WARNING");
    await fake.quit();
  });
  it("performance classifier: 138ms is HIGH not GOOD", () => {
    assert.equal(classifyPerformanceP95(10), "GOOD");
    assert.equal(classifyPerformanceP95(40), "ACCEPTABLE");
    assert.equal(classifyPerformanceP95(138), "HIGH");
    assert.equal(performancePassedForVerdict("HIGH"), false);
    assert.equal(toPerformanceVerdict("FAIL"), "HIGH");
    assert.equal(latencyVerdictToClass("PASS"), "GOOD");
  });
  it("readiness never Mentor GO with HIGH validated redis", () => {
    const p = buildRedisValidationProof({
      smokeId: "readyhi1",
      urlEnvName: "REDIS_URL",
      sharedRepository: "SHARED_REPOSITORY_CONFIRMED",
      correctnessVerdict: "PASS",
      connectOk: true,
      casOk: true,
      performanceVerdict: "HIGH",
      latencySamples: 60,
      latencyP50Ms: 138,
      latencyP95Ms: 140,
      latencyP99Ms: 142,
      casConcurrentFinalSequence: 13,
      namespaceIsolationOk: true,
      cleanupOk: true,
      smokeValidated: true,
    });
    const st = redisValidationProofForStatus(p);
    const r = buildTelemetryMentorReadiness({
      smokeValidated: true,
      proofStatus: st,
    });
    assert.equal(r.mentorEligible, false);
    assert.equal(r.badges.fullyReady, false);
    assert.equal(r.badges.redisValidated, true);
    assert.equal(r.badges.performanceWarning, true);
    assert.ok(r.blockers.includes("REDIS_PERFORMANCE_NOT_APPROVED"));
    assert.ok(r.warnings.includes("REDIS_HIGH_LATENCY"));
  });
});

describe("AI-6.4.4g smoke HIGH success persists proof", () => {
  it("FakeRedis smoke ok + proof when opted in", async () => {
    const { runRedisProductionSmoke } = await import("./redisSmokeRunner.ts");
    const {
      resetRedisSmokeValidationFactsForTests,
      getRedisSmokeValidationFacts,
    } = await import("./redisSmokeValidation.ts");
    resetRedisSmokeValidationFactsForTests();
    const fake = new FakeRedisClient();
    const report = await runRedisProductionSmoke({
      skipGate: true,
      injectClient: fake,
      persistProofWithInjectedClient: true,
      latencyIterations: 50,
    });
    assert.equal(report.ok, true);
    assert.equal(report.correctnessVerdict, "PASS");
    assert.equal(report.exitCodeHint, 0);
    assert.equal(report.proofPersisted, true, report.notes.join("; "));
    assert.ok(report.latency.p95Ms != null);
    assert.equal(getRedisSmokeValidationFacts().smokeValidated, false);
    const got = await readRedisValidationProof(fake, "gt:ai:telem");
    assert.equal(got?.schemaVersion, "2.0");
    assert.equal(got?.mentorEligible, false);
  });
});
