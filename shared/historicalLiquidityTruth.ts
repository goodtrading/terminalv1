import type { CanonicalL2Book, CanonicalL2Level, CanonicalL2Quality } from "./canonicalL2Book";
import type { LiquidityLifecycleEvent } from "./liquidityLifecycle";

export type HistoricalLiquidityIdentity = Pick<CanonicalL2Book, "instrument" | "venue" | "marketType">;

export type HistoricalLiquidityCheckpoint = HistoricalLiquidityIdentity & {
  eventTime: number | null;
  receiveTime: number;
  sequence: number | null;
  snapshotId: number | null;
  bids: CanonicalL2Level[];
  asks: CanonicalL2Level[];
  quality: CanonicalL2Quality;
  provenance: CanonicalL2Book["provenance"];
};

export type HistoricalLiquiditySegment = {
  identity: HistoricalLiquidityIdentity;
  checkpoint: HistoricalLiquidityCheckpoint;
  events: LiquidityLifecycleEvent[];
  fromSequence: number | null;
  toSequence: number | null;
  quality: CanonicalL2Quality;
};

export type HistoricalLiquidityFrame = HistoricalLiquidityIdentity & {
  eventTime: number | null;
  receiveTime: number;
  sequence: number | null;
  bids: CanonicalL2Level[];
  asks: CanonicalL2Level[];
  quality: CanonicalL2Quality;
  provenance: CanonicalL2Book["provenance"];
};

export type HistoricalReplayResult = HistoricalLiquidityFrame | null;

const unusable = new Set<CanonicalL2Quality>(["GAP", "RESYNCING", "DISCONNECTED"]);
const MAX_SEGMENTS = 8;
const MAX_EVENTS_PER_SEGMENT = 5_000;

function cloneLevels(levels: CanonicalL2Level[]): CanonicalL2Level[] {
  return levels.map((level) => ({ ...level }));
}

function cloneCheckpoint(checkpoint: HistoricalLiquidityCheckpoint): HistoricalLiquidityCheckpoint {
  return { ...checkpoint, bids: cloneLevels(checkpoint.bids), asks: cloneLevels(checkpoint.asks), provenance: { ...checkpoint.provenance } };
}

function cloneEvent(event: LiquidityLifecycleEvent): LiquidityLifecycleEvent {
  return { ...event, provenance: { ...event.provenance } };
}

function sameIdentity(a: HistoricalLiquidityIdentity, b: HistoricalLiquidityIdentity): boolean {
  return a.instrument === b.instrument && a.venue === b.venue && a.marketType === b.marketType;
}

function eventTime(event: LiquidityLifecycleEvent): number {
  return event.eventTime ?? event.receiveTime;
}

function checkpointTime(checkpoint: HistoricalLiquidityCheckpoint): number {
  return checkpoint.eventTime ?? checkpoint.receiveTime;
}

function compareEvents(a: LiquidityLifecycleEvent, b: LiquidityLifecycleEvent): number {
  if (a.sequence != null && b.sequence != null && a.sequence !== b.sequence) return a.sequence - b.sequence;
  return eventTime(a) - eventTime(b) || String(a.sequence ?? "").localeCompare(String(b.sequence ?? "")) || a.side.localeCompare(b.side) || a.price - b.price;
}

function eventKey(event: LiquidityLifecycleEvent): string {
  return [event.marketType, event.sequence ?? "none", event.side, event.price, event.newQuantity].join("|");
}

function mapLevels(levels: CanonicalL2Level[]): Map<number, number> {
  return new Map(levels.map((level) => [level.price, level.quantity]));
}

function frameFromMaps(segment: HistoricalLiquiditySegment, bids: Map<number, number>, asks: Map<number, number>, lastEvent?: LiquidityLifecycleEvent): HistoricalLiquidityFrame {
  const checkpoint = segment.checkpoint;
  return {
    ...segment.identity,
    eventTime: lastEvent?.eventTime ?? checkpoint.eventTime,
    receiveTime: lastEvent?.receiveTime ?? checkpoint.receiveTime,
    sequence: lastEvent?.sequence ?? checkpoint.sequence,
    bids: [...bids.entries()].filter(([, quantity]) => quantity > 0).map(([price, quantity]) => ({ price, quantity })).sort((a, b) => b.price - a.price),
    asks: [...asks.entries()].filter(([, quantity]) => quantity > 0).map(([price, quantity]) => ({ price, quantity })).sort((a, b) => a.price - b.price),
    quality: segment.quality,
    provenance: lastEvent?.provenance ? { ...lastEvent.provenance } : { ...checkpoint.provenance },
  };
}

export class HistoricalLiquidityTruth {
  private readonly segments: HistoricalLiquiditySegment[] = [];

  constructor(readonly identity: HistoricalLiquidityIdentity, private readonly maxSegments = MAX_SEGMENTS) {}

  addCheckpoint(book: CanonicalL2Book): void {
    if (!sameIdentity(this.identity, book)) throw new Error("Historical checkpoint identity mismatch");
    const checkpoint: HistoricalLiquidityCheckpoint = {
      instrument: book.instrument,
      venue: book.venue,
      marketType: book.marketType,
      eventTime: book.eventTime,
      receiveTime: book.receiveTime,
      sequence: book.sequence,
      snapshotId: book.snapshotId,
      bids: cloneLevels(book.bids),
      asks: cloneLevels(book.asks),
      quality: book.quality,
      provenance: { ...book.provenance },
    };
    this.segments.push({ identity: { ...this.identity }, checkpoint, events: [], fromSequence: book.sequence, toSequence: book.sequence, quality: book.quality });
    while (this.segments.length > Math.max(1, this.maxSegments)) this.segments.shift();
  }

  addEvent(event: LiquidityLifecycleEvent): boolean {
    if (!sameIdentity(this.identity, event)) throw new Error("Historical lifecycle identity mismatch");
    if (unusable.has(event.quality) || event.quality !== "VALID") return false;
    const segment = this.segments.at(-1);
    if (!segment || segment.quality !== "VALID") return false;
    if (segment.checkpoint.sequence != null && event.sequence != null && event.sequence <= segment.checkpoint.sequence) return false;
    const key = eventKey(event);
    if (segment.events.some((existing) => eventKey(existing) === key)) return false;
    segment.events.push(cloneEvent(event));
    segment.events.sort(compareEvents);
    if (segment.events.length > MAX_EVENTS_PER_SEGMENT) segment.events.splice(0, segment.events.length - MAX_EVENTS_PER_SEGMENT);
    segment.toSequence = event.sequence ?? segment.toSequence;
    return true;
  }

  getSegments(): HistoricalLiquiditySegment[] {
    return this.segments.map((segment) => ({ ...segment, checkpoint: cloneCheckpoint(segment.checkpoint), events: segment.events.map(cloneEvent), identity: { ...segment.identity } }));
  }

  bookAt(targetTime: number): HistoricalReplayResult {
    if (!Number.isFinite(targetTime)) return null;
    const candidates = this.segments.filter((candidate) => checkpointTime(candidate.checkpoint) <= targetTime);
    const segment = candidates.reduce<HistoricalLiquiditySegment | undefined>((latest, candidate) =>
      !latest || checkpointTime(candidate.checkpoint) > checkpointTime(latest.checkpoint) ? candidate : latest, undefined);
    if (!segment || segment.quality !== "VALID") return null;
    const bids = mapLevels(segment.checkpoint.bids);
    const asks = mapLevels(segment.checkpoint.asks);
    let lastEvent: LiquidityLifecycleEvent | undefined;
    for (const event of segment.events.filter((candidate) => eventTime(candidate) <= targetTime).sort(compareEvents)) {
      const levels = event.side === "bid" ? bids : asks;
      if (event.eventType === "REMOVE" || event.newQuantity <= 0) levels.delete(event.price);
      else levels.set(event.price, event.newQuantity);
      lastEvent = event;
    }
    return frameFromMaps(segment, bids, asks, lastEvent);
  }

  get size(): number { return this.segments.length; }
}

export function historicalFrameFromCanonical(book: CanonicalL2Book): HistoricalLiquidityFrame {
  return {
    instrument: book.instrument,
    venue: book.venue,
    marketType: book.marketType,
    eventTime: book.eventTime,
    receiveTime: book.receiveTime,
    sequence: book.sequence,
    bids: cloneLevels(book.bids),
    asks: cloneLevels(book.asks),
    quality: book.quality,
    provenance: { ...book.provenance },
  };
}
