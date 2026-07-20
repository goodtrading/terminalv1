/**
 * AI-6.4.2 — TelemetryMentorReadiness (always mentorEligible=false).
 */
import { canUseTelemetryForMentor } from "./mentorGate";
import { auditSharedTelemetryInfra } from "./repositoryFactory";
import { auditRailwayTelemetryTopology } from "./railwayAudit";
import { getConfiguredTelemetryRepositoryMode } from "./redisConfig";
import { getMarketTelemetryStore } from "./telemetryStore";
import { auditRailwayRedisConfig } from "./redisRailwayAudit";
import { redisSmokeFactsForStatus } from "./redisSmokeValidation";

export const MENTOR_INTEGRATION_NOT_ENABLED = "MENTOR_INTEGRATION_NOT_ENABLED" as const;

export type TelemetryMentorReadiness = {
  mentorEligible: false;
  canUseTelemetryForMentor: false;
  blockers: string[];
  stages: {
    producer: "absent" | "connected";
    registry: "absent" | "fresh" | "stale";
    repository: "memory" | "redis_blocked" | "redis_error" | "redis_ready";
    snapshotMerge: "ready" | "degraded";
  };
  repositoryMode: string;
  repositorySafety: string;
  /** AI-6.4.2 redis facts — never imply Mentor GO. */
  redis: {
    configClassification: string;
    smokeValidated: boolean;
    sharedRepository: string;
    latencyVerdict: string;
  };
  note: string;
};

export function buildTelemetryMentorReadiness(opts?: {
  hasRegistry?: boolean;
  redisError?: string;
  /** @deprecated alias of redisError */
  sharedError?: string;
  smokeValidated?: boolean;
}): TelemetryMentorReadiness {
  const audit = auditSharedTelemetryInfra();
  const railwayRedis = auditRailwayRedisConfig();
  const configured = getConfiguredTelemetryRepositoryMode();
  const railway = auditRailwayTelemetryTopology({
    repositoryMode: configured,
  });
  const redisError = opts?.redisError ?? opts?.sharedError;
  const smoke = redisSmokeFactsForStatus();
  const smokeValidated = opts?.smokeValidated ?? smoke.smokeValidated;

  const blockers: string[] = [
    MENTOR_INTEGRATION_NOT_ENABLED,
    "AI-6.4.4b policy: Mentor must stay disconnected (mentorEligible=false)",
  ];
  if (audit.multiInstanceBlocker && configured === "redis") {
    blockers.push(audit.multiInstanceBlocker);
  }
  if (redisError) blockers.push(`redis repo: ${redisError}`);
  if (configured === "redis" && !smokeValidated) {
    blockers.push("REDIS_SMOKE_NOT_VALIDATED");
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

  return {
    mentorEligible: false,
    canUseTelemetryForMentor: canUseTelemetryForMentor(),
    blockers,
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
      sharedRepository: smoke.sharedRepository,
      latencyVerdict: smoke.latencyVerdict,
    },
    note: "Client telemetry may degrade; server live snapshot without telemetry remains available. Mentor NO-GO. Persistent proof required for smokeValidated across processes.",
  };
}
