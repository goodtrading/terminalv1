/**
 * AI-6.4.2 / 6.4.4g — TelemetryMentorReadiness (always mentorEligible=false).
 * Redis may be VALIDATED with PERFORMANCE WARNING — never FULLY READY / Mentor GO.
 */
import { canUseTelemetryForMentor } from "./mentorGate";
import { auditSharedTelemetryInfra } from "./repositoryFactory";
import { auditRailwayTelemetryTopology } from "./railwayAudit";
import { getConfiguredTelemetryRepositoryMode } from "./redisConfig";
import { getMarketTelemetryStore } from "./telemetryStore";
import { auditRailwayRedisConfig } from "./redisRailwayAudit";
import { redisSmokeFactsForStatus } from "./redisSmokeValidation";
import type { RedisValidationProofStatus } from "./redisValidationProof";

export const MENTOR_INTEGRATION_NOT_ENABLED = "MENTOR_INTEGRATION_NOT_ENABLED" as const;

export type TelemetryMentorReadiness = {
  mentorEligible: false;
  canUseTelemetryForMentor: false;
  blockers: string[];
  warnings: string[];
  badges: {
    redisValidated: boolean;
    performanceWarning: boolean;
    fullyReady: false;
  };
  stages: {
    producer: "absent" | "connected";
    registry: "absent" | "fresh" | "stale";
    repository: "memory" | "redis_blocked" | "redis_error" | "redis_ready";
    snapshotMerge: "ready" | "degraded";
  };
  repositoryMode: string;
  repositorySafety: string;
  redis: {
    configClassification: string;
    smokeValidated: boolean;
    sharedRepository: string;
    latencyVerdict: string;
    correctnessVerdict: string;
    performanceVerdict: string;
    validationStatus: string;
    performancePassed: boolean;
  };
  note: string;
};

export function buildTelemetryMentorReadiness(opts?: {
  hasRegistry?: boolean;
  redisError?: string;
  /** @deprecated alias of redisError */
  sharedError?: string;
  smokeValidated?: boolean;
  proofStatus?: RedisValidationProofStatus | null;
}): TelemetryMentorReadiness {
  const audit = auditSharedTelemetryInfra();
  const railwayRedis = auditRailwayRedisConfig();
  const configured = getConfiguredTelemetryRepositoryMode();
  const railway = auditRailwayTelemetryTopology({
    repositoryMode: configured,
  });
  const redisError = opts?.redisError ?? opts?.sharedError;
  const smoke = redisSmokeFactsForStatus();
  const proof = opts?.proofStatus ?? null;
  const smokeValidated =
    opts?.smokeValidated ??
    proof?.smokeValidated ??
    smoke.smokeValidated;
  const performanceVerdict =
    proof?.performanceVerdict ?? smoke.performanceVerdict ?? "NOT_MEASURED";
  const validationStatus =
    proof?.validationStatus ?? smoke.validationStatus ?? "NOT_VALIDATED";
  const performancePassed =
    proof?.performancePassed ?? smoke.performancePassed ?? false;
  const correctnessVerdict =
    proof?.correctnessVerdict ?? smoke.correctnessVerdict ?? "NOT_MEASURED";

  const blockers: string[] = [
    MENTOR_INTEGRATION_NOT_ENABLED,
    "AI-6.4.4g policy: Mentor must stay disconnected (mentorEligible=false)",
  ];
  const warnings: string[] = [];
  if (audit.multiInstanceBlocker && configured === "redis") {
    blockers.push(audit.multiInstanceBlocker);
  }
  if (redisError) blockers.push(`redis repo: ${redisError}`);
  if (configured === "redis" && !smokeValidated) {
    blockers.push("REDIS_SMOKE_NOT_VALIDATED");
  }
  if (
    smokeValidated &&
    (performanceVerdict === "HIGH" ||
      validationStatus === "VALIDATED_WITH_PERFORMANCE_WARNING" ||
      !performancePassed)
  ) {
    warnings.push("REDIS_HIGH_LATENCY");
    blockers.push("REDIS_PERFORMANCE_NOT_APPROVED");
  }
  if (proof?.warnings) {
    for (const w of proof.warnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }
  }

  let repository: TelemetryMentorReadiness["stages"]["repository"] = "memory";
  if (configured === "redis") {
    repository = audit.canImplementSharedSafely
      ? redisError
        ? "redis_error"
        : "redis_ready"
      : redisError
        ? "redis_error"
        : "redis_blocked";
  }

  const redisValidated = smokeValidated === true;
  const performanceWarning =
    redisValidated &&
    (performanceVerdict === "HIGH" ||
      validationStatus === "VALIDATED_WITH_PERFORMANCE_WARNING" ||
      !performancePassed);

  return {
    mentorEligible: false,
    canUseTelemetryForMentor: canUseTelemetryForMentor(),
    blockers,
    warnings,
    badges: {
      redisValidated,
      performanceWarning,
      fullyReady: false,
    },
    stages: {
      producer: opts?.hasRegistry ? "connected" : "absent",
      registry: opts?.hasRegistry ? "fresh" : "absent",
      repository,
      snapshotMerge: redisError ? "degraded" : "ready",
    },
    repositoryMode:
      configured === "redis" ? "redis" : getMarketTelemetryStore().stats().mode,
    repositorySafety: railway.repositorySafety,
    redis: {
      configClassification: railwayRedis.classification,
      smokeValidated,
      sharedRepository: proof?.sharedRepository ?? smoke.sharedRepository,
      latencyVerdict: performanceVerdict,
      correctnessVerdict,
      performanceVerdict,
      validationStatus,
      performancePassed: performancePassed && performanceVerdict !== "HIGH",
    },
    note: "AI-6.4.4g: Redis correctness may be VALIDATED with PERFORMANCE WARNING. Never FULLY READY. Mentor NO-GO. Telemetry OFF for general users.",
  };
}
