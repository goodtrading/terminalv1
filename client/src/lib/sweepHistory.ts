/**
 * Short-term sweep event history for UI (last N events).
 * Only confirmed event types are stored; deduped by type + zone + time bucket.
 */

export interface SweepHistoryEntry {
  timestamp: number;
  direction: string;
  type: string;
  confidence: number;
  zone: string;
  outcome?: string;
}

const MAX_ENTRIES = 10;
const DEDUPE_BUCKET_MS = 60_000;

let history: SweepHistoryEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

export function getSweepHistory(): SweepHistoryEntry[] {
  return [...history];
}

function fingerprint(e: SweepHistoryEntry): string {
  const bucket = Math.floor(e.timestamp / DEDUPE_BUCKET_MS) * DEDUPE_BUCKET_MS;
  return `${e.type}|${e.zone}|${bucket}`;
}

const recentFingerprints = new Set<string>();
const FINGERPRINT_MAX = 50;

export function pushSweepEvent(entry: Omit<SweepHistoryEntry, "timestamp">): void {
  const full: SweepHistoryEntry = { ...entry, timestamp: Date.now() };
  const fp = fingerprint(full);
  if (recentFingerprints.has(fp)) return;
  recentFingerprints.add(fp);
  if (recentFingerprints.size > FINGERPRINT_MAX) {
    const arr = Array.from(recentFingerprints);
    arr.splice(0, FINGERPRINT_MAX / 2);
    recentFingerprints.clear();
    arr.forEach((f) => recentFingerprints.add(f));
  }
  history = [full, ...history].slice(0, MAX_ENTRIES);
  notify();
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
