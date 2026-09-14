import type { CanonicalL2Book } from "@shared/canonicalL2Book";
import type { LiquidityLifecycleEvent } from "@shared/liquidityLifecycle";
import { HistoricalLiquidityTruth, type HistoricalLiquidityFrame, type HistoricalLiquidityIdentity } from "@shared/historicalLiquidityTruth";

const histories = new Map<string, HistoricalLiquidityTruth>();

function key(identity: HistoricalLiquidityIdentity): string {
  return `${identity.instrument}|${identity.venue}|${identity.marketType}`;
}

function owner(identity: HistoricalLiquidityIdentity): HistoricalLiquidityTruth {
  const identityKey = key(identity);
  let history = histories.get(identityKey);
  if (!history) {
    history = new HistoricalLiquidityTruth({ ...identity });
    histories.set(identityKey, history);
  }
  return history;
}

export function recordHistoricalLiquidityCheckpoint(book: CanonicalL2Book): void {
  owner(book).addCheckpoint(book);
}

export function recordHistoricalLiquidityEvents(events: LiquidityLifecycleEvent[]): void {
  for (const event of events) owner(event).addEvent(event);
}

export function getHistoricalLiquidityBook(input: HistoricalLiquidityIdentity & { time: number }): HistoricalLiquidityFrame | null {
  if (!Number.isFinite(input.time)) throw new Error("Invalid historical liquidity time");
  return owner(input).bookAt(input.time);
}

export function getHistoricalLiquidityOwner(input: HistoricalLiquidityIdentity): HistoricalLiquidityTruth | null {
  return histories.get(key(input)) ?? null;
}

export function getHistoricalLiquiditySegments(input: HistoricalLiquidityIdentity) {
  return owner(input).getSegments();
}

export function __resetHistoricalLiquidityForTests(): void {
  histories.clear();
}
