import type { CanonicalL2Book, CanonicalL2Level, CanonicalL2Quality } from "./canonicalL2Book";

export type LiquidityLifecycleEventType = "ADD" | "UPDATE" | "DECREASE" | "REMOVE";
export type LiquidityLifecycleSide = "bid" | "ask";

export type LiquidityLifecycleEvent = {
  instrument: string;
  venue: "Binance";
  marketType: "Spot" | "Perpetual";
  side: LiquidityLifecycleSide;
  price: number;
  previousQuantity: number;
  newQuantity: number;
  deltaQuantity: number;
  eventType: LiquidityLifecycleEventType;
  sequence: number | null;
  eventTime: number | null;
  receiveTime: number;
  quality: CanonicalL2Quality;
  provenance: CanonicalL2Book["provenance"];
};

const unusable = new Set<CanonicalL2Quality>(["GAP", "RESYNCING", "DISCONNECTED"]);

function levelsByPrice(levels: CanonicalL2Level[]): Map<number, number> {
  return new Map(levels.map((level) => [level.price, level.quantity]));
}

export function projectLiquidityLifecycle(
  previous: CanonicalL2Book,
  current: CanonicalL2Book,
): LiquidityLifecycleEvent[] {
  if (previous.instrument !== current.instrument || previous.venue !== current.venue || previous.marketType !== current.marketType) {
    throw new Error("Lifecycle projection requires matching market identity");
  }
  if (unusable.has(current.quality) || current.provenance.source === "rest") return [];

  const events: LiquidityLifecycleEvent[] = [];
  const sides: Array<[LiquidityLifecycleSide, CanonicalL2Level[], CanonicalL2Level[]]> = [
    ["bid", previous.bids, current.bids],
    ["ask", previous.asks, current.asks],
  ];
  for (const [side, previousLevels, currentLevels] of sides) {
    const before = levelsByPrice(previousLevels);
    const after = levelsByPrice(currentLevels);
    const prices = new Set([...before.keys(), ...after.keys()]);
    for (const price of Array.from(prices).sort((a, b) => a - b)) {
      const previousQuantity = before.get(price) ?? 0;
      const newQuantity = after.get(price) ?? 0;
      if (previousQuantity === newQuantity) continue;
      const eventType: LiquidityLifecycleEventType =
        previousQuantity <= 0 && newQuantity > 0 ? "ADD" :
        newQuantity <= 0 ? "REMOVE" :
        newQuantity < previousQuantity ? "DECREASE" : "UPDATE";
      events.push({
        instrument: current.instrument,
        venue: current.venue,
        marketType: current.marketType,
        side,
        price,
        previousQuantity,
        newQuantity,
        deltaQuantity: newQuantity - previousQuantity,
        eventType,
        sequence: current.sequence,
        eventTime: current.eventTime,
        receiveTime: current.receiveTime,
        quality: current.quality,
        provenance: { ...current.provenance },
      });
    }
  }
  return events;
}

export function appendLiquidityLifecycleEvents(
  buffer: LiquidityLifecycleEvent[],
  events: LiquidityLifecycleEvent[],
  maxEvents = 500,
): void {
  if (!Number.isInteger(maxEvents) || maxEvents <= 0) throw new Error("Invalid lifecycle buffer size");
  buffer.push(...events);
  if (buffer.length > maxEvents) buffer.splice(0, buffer.length - maxEvents);
}

export class LiquidityLifecycleProjector {
  private readonly emitted = new Set<string>();

  project(previous: CanonicalL2Book, current: CanonicalL2Book): LiquidityLifecycleEvent[] {
    return projectLiquidityLifecycle(previous, current).filter((event) => {
      const key = [event.marketType, event.sequence ?? "none", event.side, event.price, event.newQuantity].join("|");
      if (this.emitted.has(key)) return false;
      this.emitted.add(key);
      return true;
    });
  }
}
