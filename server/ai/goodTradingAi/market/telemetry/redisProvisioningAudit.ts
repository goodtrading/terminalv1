/**
 * AI-6.4.3 — Railway Redis provisioning audit (no invented readiness).
 * Classifies REDIS_READY | EXISTS_NOT_LINKED | NOT_CREATED | AMBIGUOUS from local evidence only.
 * Never reads/prints secret values.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditRailwayRedisConfig } from "./redisRailwayAudit";
import { discoverRedisUrlEnvName } from "./redisConfig";

export type RailwayRedisProvisioningClass =
  | "REDIS_READY"
  | "REDIS_EXISTS_NOT_LINKED"
  | "REDIS_NOT_CREATED"
  | "REDIS_CONFIGURATION_AMBIGUOUS";

export type RailwayRedisProvisioningAudit = {
  classification: RailwayRedisProvisioningClass;
  stoppedForHumanConfig: boolean;
  stopReason: string | null;
  railwayCliPresent: boolean;
  railwayProjectLinked: boolean;
  redisPackagePresent: boolean;
  redisUrlEnvName: string | null;
  localConfigClass: string;
  evidence: string[];
  /** Click-by-click doc path — human must complete before smoke/commit. */
  humanRunbook: string;
  proposedVarNames: string[];
};

function hasRailwayCli(): boolean {
  // Process PATH probe without executing network — sync which is OS-specific;
  // callers may also pass railwayCliPresent override from shell.
  return false;
}

function hasRailwayLink(cwd: string): boolean {
  return existsSync(join(cwd, ".railway")) || existsSync(join(cwd, "railway.json"));
}

function railwayTomlMentionsRedis(cwd: string): boolean {
  try {
    const text = readFileSync(join(cwd, "railway.toml"), "utf8");
    return /redis/i.test(text);
  } catch {
    return false;
  }
}

/**
 * Evidence-only provisioning audit.
 * Without Railway API/CLI access, cannot claim REDIS_READY or EXISTS_NOT_LINKED from dashboard.
 */
export function auditRailwayRedisProvisioning(opts?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Set true only if shell confirmed `railway` binary exists. */
  railwayCliPresent?: boolean;
  /** Set true only if `railway status` succeeded (redacted). */
  railwayCliAuthenticated?: boolean;
  /** Set true only if human/CLI evidenced a Redis service in the project. */
  redisServiceEvidenced?: boolean;
  /** Set true only if human/CLI evidenced backend variable reference to Redis URL. */
  redisLinkedToBackend?: boolean;
}): RailwayRedisProvisioningAudit {
  const cwd = opts?.cwd ?? process.cwd();
  const env = opts?.env ?? process.env;
  const evidence: string[] = [];
  const local = auditRailwayRedisConfig(env, cwd);
  const urlName = (() => {
    for (const n of ["REDIS_PRIVATE_URL", "REDIS_URL", "REDIS_TLS_URL"] as const) {
      if (env[n]?.trim()) return n;
    }
    if (env.REDISHOST?.trim() && env.REDISPORT?.trim()) return "REDISHOST+REDISPORT";
    return env === process.env ? discoverRedisUrlEnvName() : null;
  })();
  const cli = opts?.railwayCliPresent ?? hasRailwayCli();
  const linked = hasRailwayLink(cwd);
  const tomlRedis = railwayTomlMentionsRedis(cwd);
  const pkg = local.redisPackagePresent;

  evidence.push(cli ? "railway CLI present" : "railway CLI absent / not probed as present");
  evidence.push(linked ? ".railway or railway.json link present" : "no local Railway project link");
  evidence.push(tomlRedis ? "railway.toml mentions redis" : "railway.toml has no redis");
  evidence.push(pkg ? "npm redis package present" : "npm redis package missing");
  evidence.push(
    urlName ? `local process has URL env name: ${urlName}` : "local process has no REDIS_* URL env",
  );
  evidence.push(`local redis config class: ${local.classification}`);

  if (opts?.redisServiceEvidenced === true) {
    evidence.push("caller evidenced Redis service exists");
  }
  if (opts?.redisLinkedToBackend === true) {
    evidence.push("caller evidenced Redis linked to backend");
  }
  if (opts?.railwayCliAuthenticated === true) {
    evidence.push("caller evidenced railway CLI authenticated");
  }

  const proposedVarNames = [
    "REDIS_PRIVATE_URL or REDIS_URL (Railway variable reference; prefer PRIVATE)",
    "GOODTRADING_AI_TELEMETRY_REPOSITORY",
    "GOODTRADING_AI_TELEMETRY_REDIS_PREFIX",
    "GOODTRADING_AI_TELEMETRY_TTL_MS",
    "GOODTRADING_AI_TELEMETRY_REDIS_TIMEOUT_MS",
    "GOODTRADING_AI_ALLOW_REDIS_SMOKE (one-shot only)",
  ];

  const humanRunbook = "docs/goodtrading-ai-telemetry-redis-railway-provisioning.md";

  // Strict: REDIS_READY only with connectable local URL + package + (linked evidence or CLI auth)
  if (
    local.classification === "CONFIGURED" &&
    pkg &&
    urlName &&
    (opts?.redisLinkedToBackend === true ||
      (opts?.railwayCliAuthenticated === true && opts?.redisServiceEvidenced === true))
  ) {
    return {
      classification: "REDIS_READY",
      stoppedForHumanConfig: false,
      stopReason: null,
      railwayCliPresent: cli,
      railwayProjectLinked: linked,
      redisPackagePresent: pkg,
      redisUrlEnvName: urlName,
      localConfigClass: local.classification,
      evidence,
      humanRunbook,
      proposedVarNames,
    };
  }

  if (opts?.redisServiceEvidenced === true && opts?.redisLinkedToBackend !== true) {
    return {
      classification: "REDIS_EXISTS_NOT_LINKED",
      stoppedForHumanConfig: true,
      stopReason:
        "Redis service evidenced but not linked to backend — complete variable reference steps in runbook",
      railwayCliPresent: cli,
      railwayProjectLinked: linked,
      redisPackagePresent: pkg,
      redisUrlEnvName: urlName,
      localConfigClass: local.classification,
      evidence,
      humanRunbook,
      proposedVarNames,
    };
  }

  // Cannot access Railway + no local URL → not created (from agent POV) or ambiguous
  if (!cli && !linked && !urlName && opts?.redisServiceEvidenced !== true) {
    return {
      classification: "REDIS_NOT_CREATED",
      stoppedForHumanConfig: true,
      stopReason:
        "Cannot access Railway (no CLI/link/token) and no local REDIS_* URL — STOPPED_FOR_HUMAN_CONFIG",
      railwayCliPresent: cli,
      railwayProjectLinked: linked,
      redisPackagePresent: pkg,
      redisUrlEnvName: null,
      localConfigClass: local.classification,
      evidence,
      humanRunbook,
      proposedVarNames,
    };
  }

  if (local.classification === "PARTIALLY_CONFIGURED" || local.classification === "AMBIGUOUS") {
    return {
      classification: "REDIS_CONFIGURATION_AMBIGUOUS",
      stoppedForHumanConfig: true,
      stopReason: "Partial/ambiguous Redis signals — complete Railway linking per runbook",
      railwayCliPresent: cli,
      railwayProjectLinked: linked,
      redisPackagePresent: pkg,
      redisUrlEnvName: urlName,
      localConfigClass: local.classification,
      evidence,
      humanRunbook,
      proposedVarNames,
    };
  }

  if (local.classification === "CONFIGURED" && !opts?.redisLinkedToBackend) {
    // Local URL set (e.g. laptop) but Railway link not evidenced — ambiguous for prod claim
    return {
      classification: "REDIS_CONFIGURATION_AMBIGUOUS",
      stoppedForHumanConfig: true,
      stopReason:
        "Local REDIS URL env present but Railway service link not evidenced — do not claim REDIS_READY for Railway",
      railwayCliPresent: cli,
      railwayProjectLinked: linked,
      redisPackagePresent: pkg,
      redisUrlEnvName: urlName,
      localConfigClass: local.classification,
      evidence,
      humanRunbook,
      proposedVarNames,
    };
  }

  return {
    classification: "REDIS_NOT_CREATED",
    stoppedForHumanConfig: true,
    stopReason: "STOPPED_FOR_HUMAN_CONFIG — Redis not evidenced",
    railwayCliPresent: cli,
    railwayProjectLinked: linked,
    redisPackagePresent: pkg,
    redisUrlEnvName: urlName,
    localConfigClass: local.classification,
    evidence,
    humanRunbook,
    proposedVarNames,
  };
}
