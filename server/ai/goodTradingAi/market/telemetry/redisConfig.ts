/**
 * AI-6.4.3a — Redis telemetry env contract (canonical names + safe aliases).
 * Server-only. Never logs secret values.
 */
import { TELEMETRY_TTL_MS } from "@shared/goodTradingAiMarketTelemetry";

export type TelemetryRepositoryMode = "memory" | "redis";

export type RedisTelemetryConfig = {
  url: string;
  /** Env name that provided the URL (never the value). */
  urlEnvName: string;
  prefix: string;
  ttlMs: number;
  /** Which TTL env name won (canonical or alias). */
  ttlEnvName: string | null;
  timeoutMs: number;
  tls: boolean;
};

export class RedisTelemetryConfigError extends Error {
  readonly code = "REDIS_TELEMETRY_CONFIG";
  constructor(message: string) {
    super(message);
    this.name = "RedisTelemetryConfigError";
  }
}

/** Canonical URL preference: private networking first (Railway). */
export const REDIS_URL_ENV_PRIORITY = [
  "REDIS_PRIVATE_URL",
  "REDIS_URL",
  "REDIS_TLS_URL",
] as const;

/** @deprecated use REDIS_URL_ENV_PRIORITY — kept for export compatibility */
export const URL_ENV_CANDIDATES = REDIS_URL_ENV_PRIORITY;

const warned = new Set<string>();

function warnAliasOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[goodtrading-ai-telemetry-env] ${message}`);
}

/** Test helper — clear alias warning dedupe. */
export function resetRedisEnvContractWarningsForTests(): void {
  warned.clear();
}

export function normalizeTelemetryRepositoryMode(
  raw: string | undefined | null,
): TelemetryRepositoryMode {
  const v = raw?.trim().toLowerCase();
  // `shared` is a deprecated AI-6.4 alias for redis
  if (v === "redis" || v === "shared") return "redis";
  return "memory";
}

export function getConfiguredTelemetryRepositoryMode(
  env: NodeJS.ProcessEnv = process.env,
): TelemetryRepositoryMode {
  return normalizeTelemetryRepositoryMode(env.GOODTRADING_AI_TELEMETRY_REPOSITORY);
}

/**
 * Smoke gate flag — canonical GOODTRADING_AI_ALLOW_REDIS_SMOKE;
 * alias ALLOW_REDIS_SMOKE (backward compatible, warns once).
 */
export function isAllowRedisSmokeEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const canonical = env.GOODTRADING_AI_ALLOW_REDIS_SMOKE?.trim();
  const alias = env.ALLOW_REDIS_SMOKE?.trim();
  if (canonical === "true" || canonical === "1") return true;
  if (alias === "true" || alias === "1") {
    warnAliasOnce(
      "ALLOW_REDIS_SMOKE",
      "ALLOW_REDIS_SMOKE is deprecated; use GOODTRADING_AI_ALLOW_REDIS_SMOKE=true",
    );
    return true;
  }
  return false;
}

/** Discover which Redis URL env is set — never returns the secret value. */
export function discoverRedisUrlEnvName(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const name of REDIS_URL_ENV_PRIORITY) {
    if (env[name]?.trim()) return name;
  }
  if (env.REDISHOST?.trim() && env.REDISPORT?.trim()) {
    return "REDISHOST+REDISPORT";
  }
  if (env.UPSTASH_REDIS_REST_URL?.trim()) {
    return null;
  }
  return null;
}

function composeHostPortUrl(
  env: NodeJS.ProcessEnv,
): { url: string; urlEnvName: string } | null {
  const host = env.REDISHOST?.trim();
  const port = env.REDISPORT?.trim();
  if (!host || !port) return null;
  const user = env.REDISUSER?.trim() || "";
  const pass = env.REDISPASSWORD ?? "";
  const auth =
    user || pass
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
      : "";
  const tls = env.REDIS_TLS === "true" || env.REDIS_TLS === "1";
  const scheme = tls ? "rediss" : "redis";
  return {
    url: `${scheme}://${auth}${host}:${port}`,
    urlEnvName: "REDISHOST+REDISPORT",
  };
}

function readUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { url: string; urlEnvName: string } | null {
  for (const name of REDIS_URL_ENV_PRIORITY) {
    const url = env[name]?.trim();
    if (url) return { url, urlEnvName: name };
  }
  return composeHostPortUrl(env);
}

function clampTtlMs(raw: number): number {
  if (!Number.isFinite(raw)) return TELEMETRY_TTL_MS;
  return Math.min(15_000, Math.max(10_000, Math.floor(raw)));
}

/**
 * TTL resolution:
 * 1. GOODTRADING_AI_TELEMETRY_TTL_MS (canonical)
 * 2. GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS (alias, warn once)
 * 3. shared constant TELEMETRY_TTL_MS (12000)
 */
export function resolveTelemetryTtlMs(env: NodeJS.ProcessEnv = process.env): {
  ttlMs: number;
  ttlEnvName: string | null;
} {
  const canonical = env.GOODTRADING_AI_TELEMETRY_TTL_MS?.trim();
  if (canonical) {
    return { ttlMs: clampTtlMs(Number(canonical)), ttlEnvName: "GOODTRADING_AI_TELEMETRY_TTL_MS" };
  }
  const alias = env.GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS?.trim();
  if (alias) {
    warnAliasOnce(
      "GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS",
      "GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS is deprecated; use GOODTRADING_AI_TELEMETRY_TTL_MS",
    );
    return {
      ttlMs: clampTtlMs(Number(alias)),
      ttlEnvName: "GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS",
    };
  }
  return { ttlMs: TELEMETRY_TTL_MS, ttlEnvName: null };
}

/**
 * Load Redis config when repository mode is redis.
 * Throws if URL missing — caller must NOT fall back to memory.
 */
export function loadRedisTelemetryConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisTelemetryConfig {
  const found = readUrlFromEnv(env);

  if (!found) {
    throw new RedisTelemetryConfigError(
      "GOODTRADING_AI_TELEMETRY_REPOSITORY=redis requires REDIS_PRIVATE_URL or REDIS_URL (or REDISHOST+REDISPORT). No silent memory fallback.",
    );
  }

  const prefix =
    env.GOODTRADING_AI_TELEMETRY_REDIS_PREFIX?.trim() || "gt:ai:telem";
  if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(prefix)) {
    throw new RedisTelemetryConfigError(
      "GOODTRADING_AI_TELEMETRY_REDIS_PREFIX must match [a-zA-Z0-9:_-]{1,64}",
    );
  }

  const { ttlMs, ttlEnvName } = resolveTelemetryTtlMs(env);
  const timeoutMs = Math.min(
    10_000,
    Math.max(
      200,
      Number(env.GOODTRADING_AI_TELEMETRY_REDIS_TIMEOUT_MS ?? 2_000) || 2_000,
    ),
  );

  const tls = found.url.startsWith("rediss://");

  return {
    url: found.url,
    urlEnvName: found.urlEnvName,
    prefix,
    ttlMs,
    ttlEnvName,
    timeoutMs,
    tls,
  };
}

/** Redacted status fields — never include URL/password. */
export function redactRedisConfigForStatus(cfg: RedisTelemetryConfig | null): {
  configured: boolean;
  urlEnvName: string | null;
  prefix: string | null;
  ttlMs: number | null;
  ttlEnvName: string | null;
  timeoutMs: number | null;
  tls: boolean | null;
} {
  if (!cfg) {
    return {
      configured: false,
      urlEnvName: discoverRedisUrlEnvName(),
      prefix: null,
      ttlMs: null,
      ttlEnvName: null,
      timeoutMs: null,
      tls: null,
    };
  }
  return {
    configured: true,
    urlEnvName: cfg.urlEnvName,
    prefix: cfg.prefix,
    ttlMs: cfg.ttlMs,
    ttlEnvName: cfg.ttlEnvName,
    timeoutMs: cfg.timeoutMs,
    tls: cfg.tls,
  };
}

export { readUrlFromEnv };
