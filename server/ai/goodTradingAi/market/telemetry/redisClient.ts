/**
 * AI-6.4.1 — Redis client abstraction + FakeRedis (no network in CI).
 * Real client: official `redis` (node-redis). No KEYS/FLUSH/user EVAL exposed.
 */
import { createClient, type RedisClientType } from "redis";
import type { RedisTelemetryConfig } from "./redisConfig";

export type RedisCasOutcome = "STORED" | "DUPLICATE" | "REPLAY" | "CONFLICT" | "UNAVAILABLE";

/**
 * Minimal surface used by RedisMarketTelemetryRepository.
 * Intentionally excludes KEYS, FLUSH*, SCAN hot-path helpers, and arbitrary EVAL.
 */
export interface TelemetryRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { PX?: number }): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  pttl(key: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<boolean>;
  /** Fixed CAS script only — not arbitrary user EVAL. */
  casPut(
    key: string,
    payload: string,
    sequence: number,
    ttlMs: number,
  ): Promise<RedisCasOutcome>;
  quit(): Promise<void>;
  isOpen(): boolean;
}

/** Lua: compare sequence; SET PX only on store; DUPLICATE does not renew TTL. */
export const TELEMETRY_CAS_LUA = `
local cur = redis.call('GET', KEYS[1])
local incoming = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local payload = ARGV[1]
if not cur then
  redis.call('SET', KEYS[1], payload, 'PX', ttl)
  return 'STORED'
end
local ok, decoded = pcall(cjson.decode, cur)
if not ok or type(decoded) ~= 'table' then
  redis.call('SET', KEYS[1], payload, 'PX', ttl)
  return 'STORED'
end
local seq = tonumber(decoded['sequence'])
if seq == nil then
  redis.call('SET', KEYS[1], payload, 'PX', ttl)
  return 'STORED'
end
if incoming < seq then
  return 'REPLAY'
end
if incoming == seq then
  return 'DUPLICATE'
end
redis.call('SET', KEYS[1], payload, 'PX', ttl)
return 'STORED'
`;

type FakeEntry = { value: string; expiresAtMs: number | null };
type FakeSet = { members: Set<string>; expiresAtMs: number | null };

/**
 * In-process Redis stand-in for CI / unit tests. No sockets.
 */
export class FakeRedisClient implements TelemetryRedisClient {
  private kv = new Map<string, FakeEntry>();
  private sets = new Map<string, FakeSet>();
  private open = true;
  /** Simulate CAS conflict / unavailable for tests. */
  forceCasOutcome: RedisCasOutcome | null = null;
  casCalls = 0;
  getCalls = 0;

  private now(): number {
    return Date.now();
  }

  private alive(expiresAtMs: number | null): boolean {
    return expiresAtMs == null || expiresAtMs > this.now();
  }

  private getKv(key: string): FakeEntry | null {
    const e = this.kv.get(key);
    if (!e) return null;
    if (!this.alive(e.expiresAtMs)) {
      this.kv.delete(key);
      return null;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    this.getCalls += 1;
    if (!this.open) throw new Error("FakeRedis closed");
    const e = this.getKv(key);
    return e?.value ?? null;
  }

  async set(key: string, value: string, opts?: { PX?: number }): Promise<"OK" | null> {
    if (!this.open) throw new Error("FakeRedis closed");
    const expiresAtMs = opts?.PX != null ? this.now() + opts.PX : null;
    this.kv.set(key, { value, expiresAtMs });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.open) throw new Error("FakeRedis closed");
    let n = 0;
    for (const k of keys) {
      if (this.kv.delete(k)) n += 1;
      if (this.sets.delete(k)) n += 1;
    }
    return n;
  }

  async pttl(key: string): Promise<number> {
    const e = this.getKv(key);
    if (!e) return -2;
    if (e.expiresAtMs == null) return -1;
    return Math.max(0, e.expiresAtMs - this.now());
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let s = this.sets.get(key);
    if (!s || !this.alive(s.expiresAtMs)) {
      s = { members: new Set(), expiresAtMs: s?.expiresAtMs ?? null };
      this.sets.set(key, s);
    }
    let added = 0;
    for (const m of members) {
      if (!s.members.has(m)) {
        s.members.add(m);
        added += 1;
      }
    }
    return added;
  }

  async smembers(key: string): Promise<string[]> {
    const s = this.sets.get(key);
    if (!s || !this.alive(s.expiresAtMs)) {
      this.sets.delete(key);
      return [];
    }
    return Array.from(s.members);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const ms = seconds * 1000;
    const e = this.kv.get(key);
    if (e && this.alive(e.expiresAtMs)) {
      e.expiresAtMs = this.now() + ms;
      return true;
    }
    const s = this.sets.get(key);
    if (s && this.alive(s.expiresAtMs)) {
      s.expiresAtMs = this.now() + ms;
      return true;
    }
    return false;
  }

  async casPut(
    key: string,
    payload: string,
    sequence: number,
    ttlMs: number,
  ): Promise<RedisCasOutcome> {
    this.casCalls += 1;
    if (!this.open) return "UNAVAILABLE";
    if (this.forceCasOutcome) return this.forceCasOutcome;

    const cur = this.getKv(key);
    if (!cur) {
      this.kv.set(key, { value: payload, expiresAtMs: this.now() + ttlMs });
      return "STORED";
    }
    let seq = -1;
    try {
      const parsed = JSON.parse(cur.value) as { sequence?: number };
      seq = Number(parsed.sequence);
    } catch {
      this.kv.set(key, { value: payload, expiresAtMs: this.now() + ttlMs });
      return "STORED";
    }
    if (sequence < seq) return "REPLAY";
    if (sequence === seq) {
      // DUPLICATE must NOT renew TTL — leave expiresAtMs untouched
      return "DUPLICATE";
    }
    this.kv.set(key, { value: payload, expiresAtMs: this.now() + ttlMs });
    return "STORED";
  }

  async quit(): Promise<void> {
    this.open = false;
    this.kv.clear();
    this.sets.clear();
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Test helper — remaining TTL for key (ms), or null. */
  remainingTtlMs(key: string): number | null {
    const e = this.getKv(key);
    if (!e || e.expiresAtMs == null) return null;
    return e.expiresAtMs - this.now();
  }

  clear(): void {
    this.kv.clear();
    this.sets.clear();
    this.forceCasOutcome = null;
    this.casCalls = 0;
    this.getCalls = 0;
  }
}

/** Safe lifecycle counters for latency diagnostics (no secrets). */
const lifecycleCounters = {
  creates: 0,
  connects: 0,
  quits: 0,
  ensureReconnects: 0,
};

export function getRedisClientLifecycleCounters(): {
  creates: number;
  connects: number;
  quits: number;
  ensureReconnects: number;
} {
  return { ...lifecycleCounters };
}

export function resetRedisClientLifecycleCounters(): void {
  lifecycleCounters.creates = 0;
  lifecycleCounters.connects = 0;
  lifecycleCounters.quits = 0;
  lifecycleCounters.ensureReconnects = 0;
}

export class RealRedisClient implements TelemetryRedisClient {
  private client: RedisClientType;
  private openFlag = false;

  constructor(private readonly cfg: RedisTelemetryConfig) {
    lifecycleCounters.creates += 1;
    this.client = createClient({
      url: cfg.url,
      socket: {
        connectTimeout: cfg.timeoutMs,
        reconnectStrategy: false,
      },
    }) as RedisClientType;
  }

  async connect(): Promise<void> {
    if (this.openFlag) return;
    lifecycleCounters.connects += 1;
    await this.client.connect();
    this.openFlag = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensure();
    return this.client.get(key);
  }

  async set(key: string, value: string, opts?: { PX?: number }): Promise<"OK" | null> {
    await this.ensure();
    const result =
      opts?.PX != null
        ? await this.client.set(key, value, { PX: opts.PX })
        : await this.client.set(key, value);
    return result === "OK" ? "OK" : null;
  }

  async del(...keys: string[]): Promise<number> {
    await this.ensure();
    if (keys.length === 0) return 0;
    return this.client.del(keys);
  }

  async pttl(key: string): Promise<number> {
    await this.ensure();
    return this.client.pTTL(key);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    await this.ensure();
    return this.client.sAdd(key, members);
  }

  async smembers(key: string): Promise<string[]> {
    await this.ensure();
    return this.client.sMembers(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    await this.ensure();
    const n = await this.client.expire(key, seconds);
    return Number(n) === 1;
  }

  async casPut(
    key: string,
    payload: string,
    sequence: number,
    ttlMs: number,
  ): Promise<RedisCasOutcome> {
    try {
      await this.ensure();
      const result = (await this.client.eval(TELEMETRY_CAS_LUA, {
        keys: [key],
        arguments: [payload, String(sequence), String(ttlMs)],
      })) as string;
      if (
        result === "STORED" ||
        result === "DUPLICATE" ||
        result === "REPLAY" ||
        result === "CONFLICT"
      ) {
        return result;
      }
      return "UNAVAILABLE";
    } catch {
      return "UNAVAILABLE";
    }
  }

  async quit(): Promise<void> {
    if (this.openFlag) {
      lifecycleCounters.quits += 1;
      try {
        await this.client.quit();
      } catch {
        try {
          await this.client.disconnect();
        } catch {
          /* ignore */
        }
      }
    }
    this.openFlag = false;
  }

  isOpen(): boolean {
    return this.openFlag;
  }

  private async ensure(): Promise<void> {
    if (!this.openFlag) {
      lifecycleCounters.ensureReconnects += 1;
      await this.connect();
    }
  }
}

export async function createRealRedisClient(
  cfg: RedisTelemetryConfig,
): Promise<RealRedisClient> {
  const c = new RealRedisClient(cfg);
  await c.connect();
  return c;
}
