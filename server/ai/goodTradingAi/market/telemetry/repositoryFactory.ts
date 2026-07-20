/**
 * AI-6.4.1 — Telemetry repository factory (memory | redis).
 * Redis via official `redis` package. No silent memory fallback when redis selected.
 * Filesystem / Postgres auto-fallback forbidden.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getMarketTelemetryStore,
  type MarketTelemetryRepository,
  type TelemetryPutResult,
  type TelemetryStoreEntry,
} from "./telemetryStore";
import type { TelemetryNamespace } from "@shared/goodTradingAiMarketTelemetry";
import {
  discoverRedisUrlEnvName,
  getConfiguredTelemetryRepositoryMode,
  loadRedisTelemetryConfig,
  normalizeTelemetryRepositoryMode,
  RedisTelemetryConfigError,
  type TelemetryRepositoryMode,
} from "./redisConfig";
import { FakeRedisClient, createRealRedisClient } from "./redisClient";
import { RedisMarketTelemetryRepository } from "./redisMarketTelemetryRepository";

export type { TelemetryRepositoryMode } from "./redisConfig";
export { getConfiguredTelemetryRepositoryMode, normalizeTelemetryRepositoryMode };

export type SharedInfraClass =
  | "READY"
  | "POSSIBLE"
  | "REQUIRES_NEW_DEP"
  | "UNAVAILABLE";

export type SharedInfraAudit = {
  redis: SharedInfraClass;
  postgres: SharedInfraClass;
  kv: SharedInfraClass;
  filesystem: "FORBIDDEN";
  evidence: string[];
  canImplementSharedSafely: boolean;
  recommendation: "memory" | "redis_blocked" | "redis_ready";
  multiInstanceBlocker: string | null;
  redisUrlEnvName: string | null;
};

function hasRedisPackage(cwd = process.cwd()): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return !!(deps.ioredis || deps.redis || deps["@upstash/redis"]);
  } catch {
    return false;
  }
}

export function auditSharedTelemetryInfra(cwd = process.cwd()): SharedInfraAudit {
  const evidence: string[] = [];
  const redisUrlEnvName = discoverRedisUrlEnvName();
  const redisEnv = !!redisUrlEnvName;
  const redisPkg = hasRedisPackage(cwd);
  evidence.push(
    redisPkg ? "redis client package present (node-redis)" : "no redis client in package.json",
  );
  evidence.push(
    redisEnv ? `Redis URL env name present: ${redisUrlEnvName}` : "no REDIS_* URL env",
  );

  let redis: SharedInfraClass;
  if (redisPkg && redisEnv) redis = "READY";
  else if (redisEnv && !redisPkg) redis = "REQUIRES_NEW_DEP";
  else if (redisPkg && !redisEnv) redis = "POSSIBLE";
  else redis = "REQUIRES_NEW_DEP";

  const pgEnv = !!process.env.DATABASE_URL?.trim();
  let postgres: SharedInfraClass;
  if (pgEnv) {
    postgres = "POSSIBLE";
    evidence.push(
      "DATABASE_URL present (SaaS) — ephemeral telemetry latest-only NOT justified; not selected",
    );
  } else {
    postgres = "UNAVAILABLE";
    evidence.push("DATABASE_URL absent");
  }

  evidence.push("no Cloudflare KV / generic KV client in deps");
  evidence.push("filesystem store FORBIDDEN by AI-6.4.1 policy");

  const canImplementSharedSafely = redis === "READY";
  const recommendation = canImplementSharedSafely
    ? "redis_ready"
    : "redis_blocked";

  const multiInstanceBlocker = canImplementSharedSafely
    ? null
    : "RedisMarketTelemetryRepository needs REDIS_URL (or REDIS_PRIVATE_URL) + redis package. Process-local memory is UNSAFE on multi-instance Railway.";

  return {
    redis,
    postgres,
    kv: "UNAVAILABLE",
    filesystem: "FORBIDDEN",
    evidence,
    canImplementSharedSafely,
    recommendation: redisPkg && !redisEnv ? "redis_blocked" : recommendation,
    multiInstanceBlocker,
    redisUrlEnvName,
  };
}

export class TelemetryRepositoryConfigError extends Error {
  readonly code = "TELEMETRY_REPOSITORY_CONFIG";
  constructor(message: string) {
    super(message);
    this.name = "TelemetryRepositoryConfigError";
  }
}

/**
 * Sync Map fake advertising mode=redis (AI-6.4 compat + unit tests without FakeRedis).
 */
export class FakeSharedMarketTelemetryRepository implements MarketTelemetryRepository {
  readonly mode = "redis" as const;
  private map = new Map<string, TelemetryStoreEntry>();

  private key(
    userId: number,
    namespace: TelemetryNamespace,
    sessionId: string,
    symbol: string,
  ): string {
    return `shared|${userId}|${namespace}|${sessionId}|${symbol.toUpperCase()}`;
  }

  put(entry: TelemetryStoreEntry): TelemetryPutResult {
    const ns = entry.namespace;
    const k = this.key(entry.userId, ns, entry.sessionId, entry.symbol);
    const prev = this.map.get(k);
    if (prev && entry.lastSequence < prev.lastSequence) {
      return { accepted: false, reason: "REPLAY_SEQUENCE", casOk: false };
    }
    if (prev && entry.lastSequence === prev.lastSequence) {
      return { accepted: false, reason: "DUPLICATE_SEQUENCE", casOk: false };
    }
    this.map.set(k, entry);
    return { accepted: true, casOk: true, reason: "STORED" };
  }

  get(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace: TelemetryNamespace = "real",
  ): TelemetryStoreEntry | undefined {
    const e = this.map.get(this.key(userId, namespace, sessionId, symbol));
    if (!e) return undefined;
    if (Date.now() > e.expiresAtMs) {
      this.map.delete(this.key(userId, namespace, sessionId, symbol));
      return undefined;
    }
    return e;
  }

  clearForTests(): void {
    this.map.clear();
  }

  stats(): { size: number; mode: string; namespaces: Record<string, number> } {
    const namespaces: Record<string, number> = { real: 0, synthetic_debug: 0 };
    for (const v of Array.from(this.map.values())) {
      namespaces[v.namespace] = (namespaces[v.namespace] ?? 0) + 1;
    }
    return { size: this.map.size, mode: this.mode, namespaces };
  }
}

let forcedRepoForTests: MarketTelemetryRepository | null = null;
let singleton: MarketTelemetryRepository | null = null;
let redisSingletonPromise: Promise<MarketTelemetryRepository> | null = null;

export function resetMarketTelemetryRepositoryFactoryForTests(): void {
  forcedRepoForTests = null;
  singleton = null;
  redisSingletonPromise = null;
  getMarketTelemetryStore().clearForTests();
}

export function __setMarketTelemetryRepositoryForTests(
  repo: MarketTelemetryRepository | null,
): void {
  forcedRepoForTests = repo;
  singleton = repo;
}

/**
 * Sync factory — memory, FakeRedis inject, or FakeShared for tests.
 * Real Redis connect → createMarketTelemetryRepositoryAsync (no silent memory fallback).
 */
export function createMarketTelemetryRepository(opts?: {
  mode?: TelemetryRepositoryMode | "shared";
  allowFakeSharedForTests?: boolean;
  fakeRedisClient?: FakeRedisClient;
}): MarketTelemetryRepository {
  if (forcedRepoForTests) return forcedRepoForTests;

  const raw = normalizeTelemetryRepositoryMode(
    opts?.mode === "shared"
      ? "redis"
      : ((opts?.mode as string | undefined) ??
          process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY),
  );

  if (raw === "memory") {
    singleton = getMarketTelemetryStore();
    return singleton;
  }

  if (opts?.fakeRedisClient) {
    const cfg = {
      url: "redis://fake",
      urlEnvName: "FAKE",
      prefix:
        process.env.GOODTRADING_AI_TELEMETRY_REDIS_PREFIX?.trim() || "gt:ai:telem:test",
      ttlMs: 12_000,
      timeoutMs: 500,
      tls: false,
      ttlEnvName: null,
    };
    singleton = new RedisMarketTelemetryRepository(opts.fakeRedisClient, cfg);
    return singleton;
  }

  if (opts?.allowFakeSharedForTests) {
    singleton = new FakeSharedMarketTelemetryRepository();
    return singleton;
  }

  const audit = auditSharedTelemetryInfra();
  if (!audit.canImplementSharedSafely) {
    throw new TelemetryRepositoryConfigError(
      audit.multiInstanceBlocker ??
        "redis repository requested but Redis URL/client not ready. No silent memory fallback.",
    );
  }

  throw new TelemetryRepositoryConfigError(
    "Redis mode requires createMarketTelemetryRepositoryAsync() (connect). No silent memory fallback.",
  );
}

export async function createMarketTelemetryRepositoryAsync(opts?: {
  mode?: TelemetryRepositoryMode | "shared";
  allowFakeSharedForTests?: boolean;
  fakeRedisClient?: FakeRedisClient;
}): Promise<MarketTelemetryRepository> {
  if (forcedRepoForTests) return forcedRepoForTests;

  const raw = normalizeTelemetryRepositoryMode(
    opts?.mode === "shared"
      ? "redis"
      : ((opts?.mode as string | undefined) ??
          process.env.GOODTRADING_AI_TELEMETRY_REPOSITORY),
  );

  if (raw === "memory") {
    singleton = getMarketTelemetryStore();
    return singleton;
  }

  if (opts?.fakeRedisClient || opts?.allowFakeSharedForTests) {
    return createMarketTelemetryRepository(opts);
  }

  if (singleton && singleton.mode === "redis") return singleton;
  if (redisSingletonPromise) return redisSingletonPromise;

  redisSingletonPromise = (async () => {
    try {
      const cfg = loadRedisTelemetryConfig();
      const client = await createRealRedisClient(cfg);
      const repo = new RedisMarketTelemetryRepository(client, cfg);
      singleton = repo;
      return repo;
    } catch (e) {
      redisSingletonPromise = null;
      if (
        e instanceof RedisTelemetryConfigError ||
        e instanceof TelemetryRepositoryConfigError
      ) {
        throw e;
      }
      const { toSafeRedisError } = await import("./redisSecretRedaction");
      const safe = toSafeRedisError(e);
      throw new TelemetryRepositoryConfigError(
        `${safe.message} (${safe.code}). No silent memory fallback.`,
      );
    }
  })();

  return redisSingletonPromise;
}

/**
 * Status/debug helper. Does NOT open Redis. Never use for ingest writes.
 * When mode=redis without a live singleton, redisError is set — callers must not write via memory.
 */
export function resolveTelemetryRepositoryOrMemory(): {
  repo: MarketTelemetryRepository;
  mode: TelemetryRepositoryMode;
  redisError?: string;
  /** @deprecated alias of redisError */
  sharedError?: string;
  audit: SharedInfraAudit;
} {
  const audit = auditSharedTelemetryInfra();
  const mode = getConfiguredTelemetryRepositoryMode();
  if (mode === "memory") {
    return { repo: createMarketTelemetryRepository({ mode: "memory" }), mode, audit };
  }
  if (singleton && singleton.mode === "redis") {
    return { repo: singleton, mode, audit };
  }
  const err =
    "Redis configured but not connected in this process; ingest must use async factory (no silent memory write fallback)";
  return {
    repo: getMarketTelemetryStore(),
    mode,
    redisError: err,
    sharedError: err,
    audit,
  };
}

export async function tryCreateConfiguredTelemetryRepository(): Promise<
  | { ok: true; repo: MarketTelemetryRepository; mode: TelemetryRepositoryMode }
  | { ok: false; mode: TelemetryRepositoryMode; error: string }
> {
  const mode = getConfiguredTelemetryRepositoryMode();
  if (mode === "memory") {
    return { ok: true, repo: createMarketTelemetryRepository({ mode: "memory" }), mode };
  }
  try {
    const repo = await createMarketTelemetryRepositoryAsync({ mode: "redis" });
    return { ok: true, repo, mode };
  } catch (e) {
    return {
      ok: false,
      mode,
      error: e instanceof Error ? e.message : "redis unavailable",
    };
  }
}
