import { bucketPrice, aggregateLevelsByPriceStep } from "./domLadderUtils";
import type { LiquiditySnapshot } from "./liquidityHeatmapUtils";

export const PERSISTENT_IMPORTANT_WALL_BTC = 25;
export const PERSISTENT_MAJOR_WALL_BTC = 100;
export const WALL_DECAY_SNAPSHOTS = 12;
export const WALL_PERSISTENCE_GAIN = 1;

export type PersistentWall = {
  priceBucket: number;
  side: "bid" | "ask";
  firstSeenMs: number;
  lastSeenMs: number;
  maxSizeBtc: number;
  persistenceCount: number;
  missedSnapshots: number;
  active: boolean;
};

function wallKey(side: "bid" | "ask", priceBucket: number): string {
  return `${side}_${priceBucket}`;
}

export class PersistentWallsTracker {
  private walls = new Map<string, PersistentWall>();

  ingestSnapshot(snapshot: LiquiditySnapshot, priceStep: number): void {
    const now = snapshot.ts;
    const step = Math.max(1, priceStep);
    const seen = new Set<string>();

    const ingestSide = (levels: LiquiditySnapshot["bids"], side: "bid" | "ask") => {
      const agg = aggregateLevelsByPriceStep(levels, step);
      for (const [price, size] of Array.from(agg.entries())) {
        if (size < PERSISTENT_IMPORTANT_WALL_BTC) continue;
        const priceBucket = bucketPrice(price, step);
        const key = wallKey(side, priceBucket);
        seen.add(key);
        const prev = this.walls.get(key);
        if (prev) {
          prev.lastSeenMs = now;
          prev.maxSizeBtc = Math.max(prev.maxSizeBtc, size);
          prev.persistenceCount += WALL_PERSISTENCE_GAIN;
          prev.missedSnapshots = 0;
          prev.active = true;
        } else {
          this.walls.set(key, {
            priceBucket,
            side,
            firstSeenMs: now,
            lastSeenMs: now,
            maxSizeBtc: size,
            persistenceCount: 1,
            missedSnapshots: 0,
            active: true,
          });
        }
      }
    };

    ingestSide(snapshot.bids, "bid");
    ingestSide(snapshot.asks, "ask");

    for (const [key, wall] of Array.from(this.walls.entries())) {
      if (seen.has(key)) continue;
      wall.missedSnapshots += 1;
      if (wall.missedSnapshots >= WALL_DECAY_SNAPSHOTS) {
        wall.active = false;
      }
    }
  }

  getActiveWalls(): PersistentWall[] {
    return Array.from(this.walls.values()).filter((w) => w.active);
  }

  getStats(): { persistentWalls: number; majorWalls: number } {
    const active = this.getActiveWalls();
    return {
      persistentWalls: active.length,
      majorWalls: active.filter((w) => w.maxSizeBtc >= PERSISTENT_MAJOR_WALL_BTC).length,
    };
  }

  /** Walls reinforced enough to draw (≥2 hits or major size). */
  getRenderableWalls(minPersistence = 2): PersistentWall[] {
    return this.getActiveWalls().filter(
      (w) =>
        w.persistenceCount >= minPersistence ||
        w.maxSizeBtc >= PERSISTENT_MAJOR_WALL_BTC,
    );
  }

  reset(): void {
    this.walls.clear();
  }
}
