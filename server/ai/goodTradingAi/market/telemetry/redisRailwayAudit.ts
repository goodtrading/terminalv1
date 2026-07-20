/**
 * AI-6.4.2 — Railway / env Redis config audit (NAMES only — never values).
 */
import { discoverRedisUrlEnvName, isAllowRedisSmokeEnv } from "./redisConfig";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type RedisConfigClassification =
  | "CONFIGURED"
  | "PARTIALLY_CONFIGURED"
  | "NOT_CONFIGURED"
  | "AMBIGUOUS";

export type RedisRailwayConfigAudit = {
  classification: RedisConfigClassification;
  /** Env names that are SET (never values). */
  setEnvNames: string[];
  unsetEnvNames: string[];
  repositoryMode: "memory" | "redis";
  redisPackagePresent: boolean;
  allowRedisSmoke: boolean;
  evidence: string[];
  /** Proposed Railway readiness steps — NOT auto-applied. */
  proposedRailwaySteps: string[];
};

const REDIS_ENV_NAMES = [
  "REDIS_PRIVATE_URL",
  "REDIS_URL",
  "REDIS_TLS_URL",
  "REDISHOST",
  "REDISPORT",
  "REDISPASSWORD",
  "REDISUSER",
  "REDIS_TLS",
  "UPSTASH_REDIS_REST_URL",
] as const;

const TELEMETRY_ENV_NAMES = [
  "GOODTRADING_AI_TELEMETRY_REPOSITORY",
  "GOODTRADING_AI_TELEMETRY_REDIS_PREFIX",
  "GOODTRADING_AI_TELEMETRY_TTL_MS",
  "GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS",
  "GOODTRADING_AI_TELEMETRY_REDIS_TIMEOUT_MS",
  "GOODTRADING_AI_ALLOW_REDIS_SMOKE",
  "ALLOW_REDIS_SMOKE",
] as const;

function isSet(name: string, env: NodeJS.ProcessEnv): boolean {
  return !!(env[name]?.trim());
}

function hasRedisPackage(cwd = process.cwd()): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    return !!pkg.dependencies?.redis;
  } catch {
    return false;
  }
}

/**
 * Classify Redis readiness from env NAMES presence only.
 * Does not connect and does not read secret values into logs.
 */
export function auditRailwayRedisConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): RedisRailwayConfigAudit {
  const setEnvNames: string[] = [];
  const unsetEnvNames: string[] = [];
  for (const n of [...REDIS_ENV_NAMES, ...TELEMETRY_ENV_NAMES]) {
    if (isSet(n, env)) setEnvNames.push(n);
    else unsetEnvNames.push(n);
  }

  const evidence: string[] = [];
  const redisPackagePresent = hasRedisPackage(cwd);
  evidence.push(redisPackagePresent ? "package.json has redis" : "package.json missing redis");

  const urlName = (() => {
    for (const n of ["REDIS_PRIVATE_URL", "REDIS_URL", "REDIS_TLS_URL"] as const) {
      if (isSet(n, env)) return n;
    }
    if (isSet("REDISHOST", env) && isSet("REDISPORT", env)) return "REDISHOST+REDISPORT";
    return null;
  })();

  const hasPartialHost =
    (isSet("REDISHOST", env) && !isSet("REDISPORT", env)) ||
    (!isSet("REDISHOST", env) && isSet("REDISPORT", env)) ||
    (isSet("REDISPASSWORD", env) && !urlName);
  const hasUpstashOnly = isSet("UPSTASH_REDIS_REST_URL", env) && !urlName;
  const repositoryMode = (() => {
    const v = env.GOODTRADING_AI_TELEMETRY_REPOSITORY?.trim().toLowerCase();
    return v === "redis" || v === "shared" ? ("redis" as const) : ("memory" as const);
  })();
  // discover for evidence (names only) — use process discover only when env===process.env
  const discovered =
    env === process.env
      ? discoverRedisUrlEnvName()
      : urlName;
  if (discovered) evidence.push(`url env candidate: ${discovered}`);
  else evidence.push("no TCP redis URL env candidate");

  const allowRedisSmoke = isAllowRedisSmokeEnv(env);

  let classification: RedisConfigClassification;
  if (urlName && redisPackagePresent) {
    classification = "CONFIGURED";
    evidence.push(`connectable URL env present: ${urlName}`);
  } else if (hasUpstashOnly) {
    classification = "AMBIGUOUS";
    evidence.push("UPSTASH_REDIS_REST_URL alone — REST not TCP node-redis");
  } else if (hasPartialHost || (urlName && !redisPackagePresent) || (redisPackagePresent && isSet("REDISPASSWORD", env) && !urlName)) {
    classification = "PARTIALLY_CONFIGURED";
    evidence.push("partial Redis signals without full connectable URL + client");
  } else if (!urlName && !hasPartialHost && !hasUpstashOnly) {
    classification = "NOT_CONFIGURED";
    evidence.push("no Redis URL/host env set");
  } else {
    classification = "AMBIGUOUS";
    evidence.push("ambiguous Redis env combination");
  }

  // Mode redis without URL is partial from app perspective
  if (repositoryMode === "redis" && classification === "NOT_CONFIGURED") {
    classification = "PARTIALLY_CONFIGURED";
    evidence.push("GOODTRADING_AI_TELEMETRY_REPOSITORY=redis but no REDIS_* URL");
  }

  const proposedRailwaySteps = [
    "Add Railway Redis plugin / service (do not paste credentials into git).",
    "Prefer REDIS_PRIVATE_URL (fallback REDIS_URL) via Railway variable reference (rediss:// preferred for TLS).",
    "Set GOODTRADING_AI_TELEMETRY_REPOSITORY=redis on the web service when ready.",
    "Optional: GOODTRADING_AI_TELEMETRY_REDIS_PREFIX=gt:ai:telem (prod) — smoke uses isolated smoke:{id}: prefix.",
    "Optional: GOODTRADING_AI_TELEMETRY_TTL_MS between 10000–15000 (alias GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS deprecated).",
    "To validate: GOODTRADING_AI_ALLOW_REDIS_SMOKE=true npm run goodtrading-ai:telemetry:redis:smoke (opt-in; never in CI by default).",
    "Do NOT use Redis FLUSH commands / KEYS scanning / write secrets to repo files.",
    "Confirm /health stays 200 independent of Redis.",
    "Confirm mentorEligible remains false after redis mode enable.",
  ];

  return {
    classification,
    setEnvNames,
    unsetEnvNames,
    repositoryMode,
    redisPackagePresent,
    allowRedisSmoke,
    evidence,
    proposedRailwaySteps,
  };
}

export { REDIS_ENV_NAMES, TELEMETRY_ENV_NAMES };
