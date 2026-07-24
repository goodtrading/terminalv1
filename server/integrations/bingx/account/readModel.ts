import type {
  BingxAccountSnapshot,
  BingxCompleteness,
} from "../../../../shared/goodTradingAiBingxAccount";
import {
  BINGX_ACCOUNT_SNAPSHOT_TTL_MS,
} from "./flags";
import { isolateRealSnapshot } from "./isolation";
import { incrBingxCounter } from "./metrics";

type Entry = {
  snapshot: BingxAccountSnapshot;
  storedAt: number;
};

const cache = new Map<string, Entry>();

function cacheKey(userId: number, connectionId: string): string {
  return `${userId}:${connectionId}`;
}

export function getCachedSnapshot(
  userId: number,
  connectionId: string,
): BingxAccountSnapshot | null {
  const entry = cache.get(cacheKey(userId, connectionId));
  if (!entry) return null;
  const age = Date.now() - entry.storedAt;
  if (age > BINGX_ACCOUNT_SNAPSHOT_TTL_MS * 4) {
    cache.delete(cacheKey(userId, connectionId));
    incrBingxCounter("stale_snapshots");
    return null;
  }
  return entry.snapshot;
}

export function setCachedSnapshot(
  userId: number,
  connectionId: string,
  snapshot: BingxAccountSnapshot,
): void {
  isolateRealSnapshot(snapshot);
  cache.set(cacheKey(userId, connectionId), {
    snapshot,
    storedAt: Date.now(),
  });
}

export function clearCachedSnapshot(
  userId?: number,
  connectionId?: string,
): void {
  if (userId == null) {
    cache.clear();
    return;
  }
  if (connectionId) {
    cache.delete(cacheKey(userId, connectionId));
    return;
  }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${userId}:`)) cache.delete(k);
  }
}

export function isSnapshotFresh(
  snapshot: BingxAccountSnapshot,
  ttlMs = BINGX_ACCOUNT_SNAPSHOT_TTL_MS,
): boolean {
  return snapshot.sourceAgeMs <= ttlMs && !snapshot.health.stale;
}

export function deriveCompleteness(parts: {
  balanceOk: boolean;
  positionsOk: boolean;
  openOrdersOk: boolean;
  historyOk: boolean;
  fillsOk: boolean;
}): BingxCompleteness {
  const flags = [
    parts.balanceOk,
    parts.positionsOk,
    parts.openOrdersOk,
    parts.historyOk,
    parts.fillsOk,
  ];
  const ok = flags.filter(Boolean).length;
  if (ok === 0) return "UNAVAILABLE";
  if (ok === flags.length) return "COMPLETE";
  if (!parts.balanceOk || !parts.positionsOk) return "DEGRADED";
  return "PARTIAL";
}
