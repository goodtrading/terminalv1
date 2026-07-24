import type { BingxTradingActionEvent } from "../../../../shared/goodTradingAiBingxAccount";
import { BINGX_ACCOUNT_TIMELINE_CAP } from "./flags";
import { assertTimelineIsolation } from "./isolation";

type TimelineStore = {
  events: BingxTradingActionEvent[];
  updatedAt: string;
};

const byUser = new Map<string, TimelineStore>();

function key(userId: number, accountId: string): string {
  return `${userId}:${accountId}`;
}

/** Bounded in-memory timeline — no credentials / raw dumps. */
export function appendTimelineEvents(
  userId: number,
  accountId: string,
  events: BingxTradingActionEvent[],
): BingxTradingActionEvent[] {
  assertTimelineIsolation(events);
  const k = key(userId, accountId);
  const existing = byUser.get(k)?.events ?? [];
  const seen = new Set(existing.map((e) => e.eventId));
  const merged = [...existing];
  for (const e of events) {
    if (seen.has(e.eventId)) continue;
    seen.add(e.eventId);
    merged.push(e);
  }
  const capped = merged.slice(-BINGX_ACCOUNT_TIMELINE_CAP);
  byUser.set(k, { events: capped, updatedAt: new Date().toISOString() });
  return capped;
}

export function getTimeline(
  userId: number,
  accountId: string,
  limit = 50,
): BingxTradingActionEvent[] {
  const store = byUser.get(key(userId, accountId));
  if (!store) return [];
  const n = Math.max(1, Math.min(BINGX_ACCOUNT_TIMELINE_CAP, limit));
  return store.events.slice(-n);
}

export function clearTimelineForTests(): void {
  byUser.clear();
}
