/**
 * AI-6.4.1 — RedisMarketTelemetryRepository (ephemeral multi-instance).
 * Latest-only, short TTL, atomic CAS sequence. Never uses Redis KEYS command or FLUSH.
 */
import type { TelemetryNamespace } from "@shared/goodTradingAiMarketTelemetry";
import type { RedisTelemetryConfig } from "./redisConfig";
import {
  buildTelemetryRepositoryKey,
  buildTelemetrySessionIndexKey,
} from "./redisKeys";
import {
  entryToRedisRecord,
  parseRedisRecord,
  redisRecordToEntry,
  serializeRedisRecord,
} from "./redisRecord";
import type { TelemetryRedisClient } from "./redisClient";
import type {
  MarketTelemetryRepository,
  TelemetryPutResult,
  TelemetryStoreEntry,
} from "./telemetryStore";

export type RedisPutOutcome =
  | "STORED"
  | "DUPLICATE"
  | "REPLAY"
  | "CONFLICT"
  | "INVALID_EXISTING_RECORD"
  | "UNAVAILABLE";

function casToPutResult(outcome: RedisPutOutcome): TelemetryPutResult {
  switch (outcome) {
    case "STORED":
      return { accepted: true, casOk: true, reason: "STORED" };
    case "INVALID_EXISTING_RECORD":
      // Repair write succeeded — same client contract as STORED (accepted).
      return { accepted: true, casOk: true, reason: "STORED" };
    case "DUPLICATE":
      return { accepted: false, casOk: false, reason: "DUPLICATE_SEQUENCE" };
    case "REPLAY":
      return { accepted: false, casOk: false, reason: "REPLAY_SEQUENCE" };
    case "CONFLICT":
      return { accepted: false, casOk: false, reason: "CONFLICT" };
    case "UNAVAILABLE":
      return { accepted: false, casOk: false, reason: "UNAVAILABLE" };
  }
}

export class RedisMarketTelemetryRepository implements MarketTelemetryRepository {
  readonly mode = "redis" as const;
  private sizeEstimate = 0;

  constructor(
    private readonly client: TelemetryRedisClient,
    private readonly cfg: RedisTelemetryConfig,
  ) {}

  /** Sync facade — prefer putAsync in routes. */
  put(entry: TelemetryStoreEntry): TelemetryPutResult {
    throw new Error(
      "RedisMarketTelemetryRepository.put is async-only; use putAsync (ingest routes must await).",
    );
  }

  get(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace?: TelemetryNamespace,
  ): TelemetryStoreEntry | undefined {
    void userId;
    void sessionId;
    void symbol;
    void namespace;
    throw new Error(
      "RedisMarketTelemetryRepository.get is async-only; use getAsync (snapshot must await).",
    );
  }

  async putAsync(entry: TelemetryStoreEntry): Promise<TelemetryPutResult> {
    try {
      const ns = entry.namespace ?? entry.telemetry.namespace ?? "synthetic_debug";
      const key = buildTelemetryRepositoryKey({
        prefix: this.cfg.prefix,
        userId: entry.userId,
        sessionId: entry.sessionId,
        symbol: entry.symbol,
        namespace: ns,
      });
      const record = entryToRedisRecord({ ...entry, namespace: ns });
      // Align expiresAt with Redis TTL we apply
      const ttlMs = this.cfg.ttlMs;
      record.expiresAtMs = Date.now() + ttlMs;
      const payload = serializeRedisRecord(record);
      const sessKey = buildTelemetrySessionIndexKey(
        this.cfg.prefix,
        entry.userId,
        entry.sessionId,
      );
      // AI-6.4.4f: one EVAL = CAS + SADD + EXPIRE (1 RTT). No post-CAS sadd/expire.
      const outcome = await this.client.atomicPut({
        recordKey: key,
        sessionIndexKey: sessKey,
        sequence: record.sequence,
        payload,
        recordTtlMs: ttlMs,
        sessionIndexTtlSeconds: Math.ceil(ttlMs / 1000) + 1,
        recordKeyForIndex: key,
      });
      if (outcome === "STORED" || outcome === "INVALID_EXISTING_RECORD") {
        this.sizeEstimate += 1;
      }
      return casToPutResult(outcome);
    } catch {
      return casToPutResult("UNAVAILABLE");
    }
  }

  async getAsync(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace?: TelemetryNamespace,
  ): Promise<TelemetryStoreEntry | undefined> {
    try {
      if (namespace == null) {
        return (
          (await this.getExactAsync(userId, sessionId, symbol, "real")) ??
          (await this.getExactAsync(userId, sessionId, symbol, "synthetic_debug"))
        );
      }
      return this.getExactAsync(userId, sessionId, symbol, namespace);
    } catch {
      return undefined;
    }
  }

  private async getExactAsync(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace: TelemetryNamespace,
  ): Promise<TelemetryStoreEntry | undefined> {
    const key = buildTelemetryRepositoryKey({
      prefix: this.cfg.prefix,
      userId,
      sessionId,
      symbol,
      namespace,
    });
    const raw = await this.client.get(key);
    if (!raw) return undefined;
    const rec = parseRedisRecord(raw);
    if (!rec) return undefined;
    if (rec.sessionId !== sessionId) return undefined;
    if (Date.now() > rec.expiresAtMs) return undefined;
    return redisRecordToEntry(rec);
  }

  /**
   * Remove all telemetry keys for a session via session index set.
   * Never uses Redis KEYS command or global SCAN.
   */
  async removeSession(userId: number, sessionId: string): Promise<number> {
    const sessKey = buildTelemetrySessionIndexKey(this.cfg.prefix, userId, sessionId);
    const members = await this.client.smembers(sessKey);
    if (members.length === 0) {
      await this.client.del(sessKey);
      return 0;
    }
    const n = await this.client.del(...members, sessKey);
    this.sizeEstimate = Math.max(0, this.sizeEstimate - members.length);
    return n;
  }

  clearForTests(): void {
    this.sizeEstimate = 0;
  }

  stats(): { size: number; mode: string; namespaces: Record<string, number> } {
    return {
      size: this.sizeEstimate,
      mode: this.mode,
      namespaces: { real: 0, synthetic_debug: 0 },
    };
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}

/** Helper for callers that support both memory (sync) and redis (async). */
export async function repoPut(
  repo: MarketTelemetryRepository,
  entry: TelemetryStoreEntry,
): Promise<TelemetryPutResult> {
  if (repo.mode === "redis" && "putAsync" in repo) {
    return (repo as RedisMarketTelemetryRepository).putAsync(entry);
  }
  return repo.put(entry);
}

export async function repoGet(
  repo: MarketTelemetryRepository,
  userId: number,
  sessionId: string,
  symbol: string,
  namespace?: TelemetryNamespace,
): Promise<TelemetryStoreEntry | undefined> {
  if (repo.mode === "redis" && "getAsync" in repo) {
    return (repo as RedisMarketTelemetryRepository).getAsync(
      userId,
      sessionId,
      symbol,
      namespace,
    );
  }
  return repo.get(userId, sessionId, symbol, namespace);
}
