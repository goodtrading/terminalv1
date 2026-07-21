/**
 * Opt-in Redis production smoke (AI-6.4.2 / 6.4.3a / AI-6.4.4b).
 *
 * Requires (prefer Railway shell so env inheritance picks linked Redis):
 *   GOODTRADING_AI_ALLOW_REDIS_SMOKE=true  (alias: ALLOW_REDIS_SMOKE)
 *   REDIS_PRIVATE_URL or REDIS_URL (or REDISHOST+REDISPORT)
 *
 * On success, writes a persistent validation proof (see
 * docs/goodtrading-ai-telemetry-redis-validation-proof.md). Payload includes
 * proofPersisted + reminder to disable ALLOW after one run.
 *
 * Uses isolated prefix smoke:{id}: — never FLUSH / KEYS / production prefix.
 * Never prints URL/password. Exit 2 if refused; 1 if failed; 0 if ok.
 *
 *   GOODTRADING_AI_ALLOW_REDIS_SMOKE=true npm run goodtrading-ai:telemetry:redis:smoke
 */
import {
  assertRedisSmokeAuthorized,
  runRedisProductionSmoke,
} from "../server/ai/goodTradingAi/market/telemetry/redisSmokeRunner.ts";
import { containsRedisSecretLeak } from "../server/ai/goodTradingAi/market/telemetry/redisSecretRedaction.ts";
import { auditRailwayRedisConfig } from "../server/ai/goodTradingAi/market/telemetry/redisRailwayAudit.ts";

async function main(): Promise<void> {
  const audit = auditRailwayRedisConfig();
  console.log(
    JSON.stringify({
      event: "redis_smoke_gate",
      classification: audit.classification,
      allowRedisSmoke: audit.allowRedisSmoke,
      repositoryMode: audit.repositoryMode,
      setEnvNames: audit.setEnvNames,
      note: "env VALUES never printed",
    }),
  );

  const gate = assertRedisSmokeAuthorized();
  if (!gate.ok) {
    console.error(
      JSON.stringify({
        event: "redis_smoke_refused",
        code: gate.code,
        reason: gate.reason,
        latencyVerdict: "NOT_MEASURED",
        sharedRepository: "NOT_MEASURED",
      }),
    );
    process.exit(2);
  }

  const report = await runRedisProductionSmoke();
  const payload = {
    event: report.ok ? "redis_smoke_ok" : "redis_smoke_fail",
    smokeId: report.smokeId,
    prefix: report.prefix,
    urlEnvName: report.urlEnvName,
    tls: report.tls,
    connectOk: report.connectOk,
    casOk: report.casOk,
    concurrentFinalSequence: report.concurrentFinalSequence,
    namespaceIsolationOk: report.namespaceIsolationOk,
    sharedRepository: report.sharedRepository,
    correctnessVerdict: report.correctnessVerdict,
    performanceVerdict: report.performanceVerdict,
    validationStatus: report.validationStatus,
    performancePassed: report.performancePassed,
    latency: report.latency,
    cleanupOk: report.cleanupOk,
    proofPersisted: report.proofPersisted,
    mentorEligible: false,
    reminder:
      "Disable GOODTRADING_AI_ALLOW_REDIS_SMOKE after one run. HIGH latency ? correctness FAIL. See docs/goodtrading-ai-redis-validation-semantics.md",
    errorCode: report.errorCode,
    notes: report.notes,
  };
  const text = JSON.stringify(payload);
  if (containsRedisSecretLeak(text)) {
    console.error(
      JSON.stringify({
        event: "redis_smoke_fail",
        errorCode: "REDIS_SECRET_LEAK_BLOCKED",
        message: "Refusing to print payload that may contain secrets",
      }),
    );
    process.exit(1);
  }
  console.log(text);
  // 0 = correctness PASS (proof may persist even if PERFORMANCE HIGH)
  // 1 = correctness FAIL
  // 2 = refused (handled above)
  process.exit(report.exitCodeHint);
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      event: "redis_smoke_fail",
      errorCode: "REDIS_UNKNOWN",
      message: "smoke crashed (details redacted)",
    }),
  );
  void e;
  process.exit(1);
});
