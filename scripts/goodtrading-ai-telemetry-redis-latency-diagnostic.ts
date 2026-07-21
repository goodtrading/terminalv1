/**
 * Opt-in Redis latency diagnostic (AI-6.4.4e).
 *
 *   GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC=true npm run goodtrading-ai:telemetry:redis:latency-diagnostic
 *
 * Prefer Railway SSH / env inheritance. Does NOT write validation proof.
 * Does NOT run full smoke. Never prints URL/password.
 * Disable ALLOW flag after one run (do not persist in Railway Variables).
 */
import {
  runRedisLatencyDiagnostic,
  diagnosticReportForLog,
} from "../server/ai/goodTradingAi/market/telemetry/redisLatencyDiagnostic.ts";
import { auditRailwayRedisConfig } from "../server/ai/goodTradingAi/market/telemetry/redisRailwayAudit.ts";
import { containsRedisSecretLeak } from "../server/ai/goodTradingAi/market/telemetry/redisSecretRedaction.ts";

async function main(): Promise<void> {
  const audit = auditRailwayRedisConfig();
  console.log(
    JSON.stringify({
      event: "redis_latency_diagnostic_gate",
      classification: audit.classification,
      setEnvNames: audit.setEnvNames,
      note: "env VALUES never printed",
    }),
  );

  const report = await runRedisLatencyDiagnostic();
  const text = diagnosticReportForLog(report);
  if (containsRedisSecretLeak(text)) {
    console.error(
      JSON.stringify({
        event: "redis_latency_diagnostic_fail",
        errorCode: "REDIS_SECRET_LEAK_BLOCKED",
      }),
    );
    process.exit(1);
  }
  console.log(text);
  if (!report.gateOk) process.exit(2);
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      event: "redis_latency_diagnostic_fail",
      errorCode: "REDIS_UNKNOWN",
      message: e instanceof Error ? e.message.slice(0, 120) : "unknown",
    }),
  );
  process.exit(1);
});
