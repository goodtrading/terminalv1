/**
 * AI-6.3 — Railway / multi-instance repository safety audit (evidence-based).
 * Does NOT install Redis/Postgres clients. Discovery via env + railway.toml signals only.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { canUseTelemetryForMentor } from "@shared/goodTradingAiMarketTelemetry";

export type ReplicaTopology = "SINGLE" | "MULTI" | "UNKNOWN";
export type RepositorySafety =
  | "SAFE_SINGLE_INSTANCE"
  | "UNSAFE_FOR_MULTI_INSTANCE"
  | "UNKNOWN";

export type RailwayTelemetryAudit = {
  topology: ReplicaTopology;
  repositoryMode: "memory" | "redis";
  repositorySafety: RepositorySafety;
  redisDiscovered: boolean;
  postgresDiscovered: boolean;
  mentorEligible: false;
  evidence: string[];
  canUseTelemetryForMentor: false;
};

function discoverRedis(): { present: boolean; evidence: string } {
  const keys = ["REDIS_URL", "REDIS_PRIVATE_URL", "UPSTASH_REDIS_REST_URL", "REDISHOST"];
  for (const k of keys) {
    if (process.env[k]?.trim()) return { present: true, evidence: `${k} set` };
  }
  return { present: false, evidence: "no REDIS_URL/UPSTASH/REDISHOST in env" };
}

function discoverPostgres(): { present: boolean; evidence: string } {
  if (process.env.DATABASE_URL?.trim()) {
    return { present: true, evidence: "DATABASE_URL set (SaaS DB — not telemetry store)" };
  }
  return { present: false, evidence: "DATABASE_URL absent" };
}

function readRailwayTomlEvidence(cwd = process.cwd()): string[] {
  const evidence: string[] = [];
  const path = join(cwd, "railway.toml");
  if (!existsSync(path)) {
    evidence.push("railway.toml missing");
    return evidence;
  }
  try {
    const text = readFileSync(path, "utf8");
    evidence.push("railway.toml present: single-service Express+Vite");
    if (/replicas?\s*=/i.test(text) || /numReplicas/i.test(text)) {
      evidence.push("railway.toml mentions replicas field");
    } else {
      evidence.push("railway.toml has no replicas/numReplicas field");
    }
    if (/\[deploy\]/.test(text)) evidence.push("railway.toml [deploy] block present");
  } catch {
    evidence.push("railway.toml unreadable");
  }
  return evidence;
}

/**
 * Evidence-based topology:
 * - MULTI only if explicit replica env (RAILWAY_REPLICA_ID + RAILWAY_REPLICA_TOTAL>1 or similar)
 * - SINGLE if local/dev and no multi signals
 * - UNKNOWN for production Railway without replica count evidence (dashboard may scale)
 */
export function auditRailwayTelemetryTopology(
  opts?: { repositoryMode?: "memory" | "redis"; cwd?: string },
): RailwayTelemetryAudit {
  const evidence: string[] = [];
  const redis = discoverRedis();
  const pg = discoverPostgres();
  evidence.push(redis.evidence);
  evidence.push(pg.evidence);
  evidence.push(...readRailwayTomlEvidence(opts?.cwd));

  const replicaId = process.env.RAILWAY_REPLICA_ID?.trim();
  const replicaTotal = Number(process.env.RAILWAY_REPLICA_TOTAL ?? process.env.RAILWAY_RUN_COUNT ?? "");
  const isRailway = !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_PROJECT_ID
  );

  let topology: ReplicaTopology = "UNKNOWN";
  if (Number.isFinite(replicaTotal) && replicaTotal > 1) {
    topology = "MULTI";
    evidence.push(`RAILWAY_REPLICA_TOTAL/RUN_COUNT=${replicaTotal}`);
  } else if (replicaId && Number.isFinite(replicaTotal) && replicaTotal === 1) {
    topology = "SINGLE";
    evidence.push(`explicit single replica (id=${replicaId})`);
  } else if (!isRailway && process.env.NODE_ENV !== "production") {
    topology = "SINGLE";
    evidence.push("non-Railway / non-production → treat as SINGLE for local");
  } else if (isRailway) {
    topology = "UNKNOWN";
    evidence.push("Railway env present but replica count not evidenced in process env");
  } else {
    topology = "UNKNOWN";
    evidence.push("insufficient evidence for replica topology");
  }

  const envMode = process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY?.trim().toLowerCase();
  const configuredRedis = envMode === "redis" || envMode === "shared";
  const effectiveMode: "memory" | "redis" =
    opts?.repositoryMode ?? (configuredRedis ? "redis" : "memory");
  if (redis.present && effectiveMode === "redis") {
    evidence.push("Redis env discovered + repositoryMode=redis (AI-6.4.1 adapter)");
  } else if (redis.present && effectiveMode === "memory") {
    evidence.push("Redis env discovered but GOODTRADING_AI_TELEMETRY_REPOSITORY!=redis → memory");
  }

  let repositorySafety: RepositorySafety;
  if (effectiveMode === "redis") {
    repositorySafety = redis.present ? "SAFE_SINGLE_INSTANCE" : "UNKNOWN";
    if (redis.present) {
      evidence.push("redis repository selected — shared across replicas when URL reachable");
    } else {
      evidence.push("redis repository selected but REDIS_* URL env missing");
      repositorySafety = "UNSAFE_FOR_MULTI_INSTANCE";
    }
  } else if (effectiveMode === "memory" && topology === "MULTI") {
    repositorySafety = "UNSAFE_FOR_MULTI_INSTANCE";
  } else if (effectiveMode === "memory" && topology === "UNKNOWN") {
    repositorySafety = "UNSAFE_FOR_MULTI_INSTANCE";
    evidence.push("memory store unsafe if Railway scales horizontally");
  } else if (effectiveMode === "memory" && topology === "SINGLE") {
    repositorySafety = "SAFE_SINGLE_INSTANCE";
  } else {
    repositorySafety = "UNKNOWN";
  }

  void canUseTelemetryForMentor; // ensure import used — always false below

  return {
    topology,
    repositoryMode: effectiveMode,
    repositorySafety,
    redisDiscovered: redis.present,
    postgresDiscovered: pg.present,
    mentorEligible: false,
    evidence,
    canUseTelemetryForMentor: false,
  };
}
