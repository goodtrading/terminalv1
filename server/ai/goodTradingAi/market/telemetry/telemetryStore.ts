/**
 * Ephemeral telemetry store (AI-6.2 / AI-6.3).
 * Key: userId + namespace + sessionId + symbol. TTL 10–15s. LRU capped.
 * CAS on sequence. Multi-instance: process-local only unless Redis adapter exists.
 */
import type {
  CompactMarketTelemetry,
  TelemetryNamespace,
} from "@shared/goodTradingAiMarketTelemetry";
import { TELEMETRY_TTL_MS } from "@shared/goodTradingAiMarketTelemetry";

export type TelemetryStoreEntry = {
  telemetry: CompactMarketTelemetry;
  userId: number;
  sessionId: string;
  symbol: string;
  namespace: TelemetryNamespace;
  ingestedAtMs: number;
  expiresAtMs: number;
  lastSequence: number;
};

export type TelemetryPutResult = {
  accepted: boolean;
  reason?: string;
  casOk?: boolean;
};

/**
 * Repository contract for memory now / Redis later.
 * CAS: reject if incoming sequence <= lastSequence.
 */
export interface MarketTelemetryRepository {
  readonly mode: "memory" | "redis";
  put(entry: TelemetryStoreEntry): TelemetryPutResult;
  get(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace?: TelemetryNamespace,
  ): TelemetryStoreEntry | undefined;
  /** Optional async put (Redis). Memory uses sync put. */
  putAsync?(entry: TelemetryStoreEntry): Promise<TelemetryPutResult>;
  /** Optional async get (Redis). Memory uses sync get. */
  getAsync?(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace?: TelemetryNamespace,
  ): Promise<TelemetryStoreEntry | undefined>;
  /** Remove session keys without KEYS/SCAN (Redis session index). */
  removeSession?(userId: number, sessionId: string): Promise<number> | number;
  clearForTests(): void;
  stats(): {
    size: number;
    mode: string;
    namespaces: Record<string, number>;
  };
}

function keyOf(
  userId: number,
  namespace: TelemetryNamespace,
  sessionId: string,
  symbol: string,
): string {
  return `${userId}|${namespace}|${sessionId}|${symbol.toUpperCase()}`;
}

const MAX_ENTRIES = 500;

export class InMemoryMarketTelemetryStore implements MarketTelemetryRepository {
  readonly mode = "memory" as const;
  private map = new Map<string, TelemetryStoreEntry>();

  put(entry: TelemetryStoreEntry): TelemetryPutResult {
    this.evictExpired();
    const ns = entry.namespace ?? entry.telemetry.namespace ?? "synthetic_debug";
    const k = keyOf(entry.userId, ns, entry.sessionId, entry.symbol);
    const prev = this.map.get(k);
    if (prev && entry.sessionId !== prev.sessionId) {
      return { accepted: false, reason: "SESSION_MISMATCH", casOk: false };
    }
    // CAS / sequence monotonicity
    if (prev && entry.lastSequence < prev.lastSequence) {
      return { accepted: false, reason: "REPLAY_SEQUENCE", casOk: false };
    }
    if (prev && entry.lastSequence === prev.lastSequence) {
      return { accepted: false, reason: "DUPLICATE_SEQUENCE", casOk: false };
    }
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, { ...entry, namespace: ns });
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (!oldest) break;
      this.map.delete(oldest);
    }
    return { accepted: true, casOk: true };
  }

  get(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace?: TelemetryNamespace,
  ): TelemetryStoreEntry | undefined {
    if (namespace == null) {
      return this.getPreferReal(userId, sessionId, symbol);
    }
    this.evictExpired();
    const k = keyOf(userId, namespace, sessionId, symbol);
    const e = this.map.get(k);
    if (!e) return undefined;
    if (e.sessionId !== sessionId) return undefined;
    if (Date.now() > e.expiresAtMs) {
      this.map.delete(k);
      return undefined;
    }
    this.map.delete(k);
    this.map.set(k, e);
    return e;
  }

  /** Live merge: prefer real namespace, else synthetic_debug. */
  getPreferReal(
    userId: number,
    sessionId: string,
    symbol: string,
  ): TelemetryStoreEntry | undefined {
    return (
      this.getExact(userId, sessionId, symbol, "real") ??
      this.getExact(userId, sessionId, symbol, "synthetic_debug")
    );
  }

  private getExact(
    userId: number,
    sessionId: string,
    symbol: string,
    namespace: TelemetryNamespace,
  ): TelemetryStoreEntry | undefined {
    this.evictExpired();
    const k = keyOf(userId, namespace, sessionId, symbol);
    const e = this.map.get(k);
    if (!e) return undefined;
    if (e.sessionId !== sessionId) return undefined;
    if (Date.now() > e.expiresAtMs) {
      this.map.delete(k);
      return undefined;
    }
    this.map.delete(k);
    this.map.set(k, e);
    return e;
  }

  clearForTests(): void {
    this.map.clear();
  }

  stats(): { size: number; mode: string; namespaces: Record<string, number> } {
    this.evictExpired();
    const namespaces: Record<string, number> = { real: 0, synthetic_debug: 0 };
    for (const v of Array.from(this.map.values())) {
      namespaces[v.namespace] = (namespaces[v.namespace] ?? 0) + 1;
    }
    return { size: this.map.size, mode: this.mode, namespaces };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of Array.from(this.map.entries())) {
      if (now > v.expiresAtMs) this.map.delete(k);
    }
  }
}

let singleton: InMemoryMarketTelemetryStore | null = null;

export function getMarketTelemetryStore(): InMemoryMarketTelemetryStore {
  if (!singleton) singleton = new InMemoryMarketTelemetryStore();
  return singleton;
}

export function resetMarketTelemetryStoreForTests(): void {
  getMarketTelemetryStore().clearForTests();
}

export function makeTelemetryEntry(params: {
  telemetry: CompactMarketTelemetry;
  userId: number;
  ttlMs?: number;
}): TelemetryStoreEntry {
  const now = Date.now();
  const ttl = params.ttlMs ?? TELEMETRY_TTL_MS;
  const namespace = params.telemetry.namespace;
  return {
    telemetry: params.telemetry,
    userId: params.userId,
    sessionId: params.telemetry.sessionId,
    symbol: params.telemetry.symbol.toUpperCase(),
    namespace,
    ingestedAtMs: now,
    expiresAtMs: now + ttl,
    lastSequence: params.telemetry.sequence,
  };
}
