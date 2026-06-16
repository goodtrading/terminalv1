import type { BookLevel, BookmapState, BookSide, HeatmapCell } from "@/types/bookmapState";

export type DesktopBookmapInputLevel = {
  price: number;
  size?: number;
  sizeBtc?: number;
  side: BookSide;
};

export type DesktopBookmapHeatmapSnapshot = {
  symbol: string;
  ts: number;
  midPrice?: number | null;
  bids: DesktopBookmapInputLevel[];
  asks: DesktopBookmapInputLevel[];
  visibleBids?: DesktopBookmapInputLevel[];
  visibleAsks?: DesktopBookmapInputLevel[];
};

export type DesktopBookmapHeatmapConfig = {
  exchange?: string;
  timeBucketMs?: number;
  priceBucketSize?: number;
  memoryWindowMs?: number;
  fadeMs?: number;
  wallFadeMs?: number;
  maxCells?: number;
  maxDistancePct?: number;
};

export type DesktopBookmapHeatmapStats = {
  cellCount: number;
  activeLevels: number;
  staleLevels: number;
  pulledCount: number;
  stackedCount: number;
  wallCount: number;
  maxIntensity: number;
  pruneCount: number;
  memoryWindowMs: number;
  priceBucketSize: number;
  timeBucketMs: number;
  strongestLevels: Array<{
    side: BookSide;
    price: number;
    currentSize: number;
    maxSize: number;
    visibleIntensity: number;
    ageMs: number;
    stale: boolean;
    pulled: boolean;
    stacked: boolean;
  }>;
};

export type DesktopLocalHistorySelection = {
  cells: HeatmapCell[];
  rejectedOutsideLocalRange: number;
  rejectedByAge: number;
  rejectedByWeakIntensity: number;
  rejectedByNoiseFilter: number;
  maxHistoryAgeMs: number;
};

type LiquidityTier = "low" | "medium" | "strong" | "wall" | "structural";

type TrackedLevel = {
  side: BookSide;
  priceBucket: number;
  firstSeenTs: number;
  lastSeenTs: number;
  lastUpdateTs: number;
  currentSize: number;
  previousSize: number;
  maxSize: number;
  avgSize: number;
  visibleIntensity: number;
  ageMs: number;
  stale: boolean;
  pulled: boolean;
  stacked: boolean;
  executedNear: boolean;
  updatesCount: number;
  tier: LiquidityTier;
};

type IngestResult = {
  state: BookmapState;
  stats: DesktopBookmapHeatmapStats;
};

const DEFAULT_TIME_BUCKET_MS = 1_000;
const DEFAULT_PRICE_BUCKET_SIZE = 10;
const DEFAULT_MEMORY_WINDOW_MS = 20 * 60_000;
const DEFAULT_FADE_MS = 45_000;
const DEFAULT_WALL_FADE_MS = 120_000;
const DEFAULT_MAX_CELLS = 120_000;
const DEFAULT_MAX_DISTANCE_PCT = 0.035;

function finitePositive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function levelSize(level: DesktopBookmapInputLevel): number {
  const size = level.sizeBtc ?? level.size ?? 0;
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function normalizePriceBucket(price: number, step: number): number {
  return Math.round(price / step) * step;
}

function levelKey(side: BookSide, priceBucket: number): string {
  return `${side}:${priceBucket}`;
}

function timeBucket(ts: number, bucketMs: number): number {
  return Math.floor(ts / bucketMs) * bucketMs;
}

function tierForSize(size: number): LiquidityTier {
  if (size >= 75) return "structural";
  if (size >= 30) return "wall";
  if (size >= 10) return "strong";
  if (size >= 3) return "medium";
  return "low";
}

function tierFloor(tier: LiquidityTier): number {
  switch (tier) {
    case "structural":
      return 0.82;
    case "wall":
      return 0.68;
    case "strong":
      return 0.5;
    case "medium":
      return 0.32;
    default:
      return 0.16;
  }
}

function isWallTier(tier: LiquidityTier): boolean {
  return tier === "wall" || tier === "structural";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toBookLevel(level: TrackedLevel, staleOverride = level.stale): BookLevel {
  const isMajor = level.tier === "structural";
  const isStructural = isMajor || level.tier === "wall";
  const isImportant = isStructural || level.tier === "strong";
  return {
    price: level.priceBucket,
    size: Math.max(0, level.currentSize),
    side: level.side,
    firstSeenTs: level.firstSeenTs,
    lastUpdateTs: level.lastUpdateTs,
    maxSeenSize: level.maxSize,
    isImportant,
    isStructural,
    isMajor,
    stale: staleOverride,
  };
}

export class DesktopBookmapHeatmapEngine {
  private readonly config: Required<DesktopBookmapHeatmapConfig>;
  private readonly levels = new Map<string, TrackedLevel>();
  private cells: HeatmapCell[] = [];
  private cellIndex = new Map<string, number>();
  private pruneCount = 0;
  private lastStats: DesktopBookmapHeatmapStats;

  constructor(config: DesktopBookmapHeatmapConfig = {}) {
    this.config = {
      exchange: config.exchange ?? "Binance Desktop",
      timeBucketMs: config.timeBucketMs ?? DEFAULT_TIME_BUCKET_MS,
      priceBucketSize: config.priceBucketSize ?? DEFAULT_PRICE_BUCKET_SIZE,
      memoryWindowMs: config.memoryWindowMs ?? DEFAULT_MEMORY_WINDOW_MS,
      fadeMs: config.fadeMs ?? DEFAULT_FADE_MS,
      wallFadeMs: config.wallFadeMs ?? DEFAULT_WALL_FADE_MS,
      maxCells: config.maxCells ?? DEFAULT_MAX_CELLS,
      maxDistancePct: config.maxDistancePct ?? DEFAULT_MAX_DISTANCE_PCT,
    };
    this.lastStats = this.buildStats(Date.now());
  }

  reset(): void {
    this.levels.clear();
    this.cells = [];
    this.cellIndex.clear();
    this.pruneCount = 0;
    this.lastStats = this.buildStats(Date.now());
  }

  ingest(snapshot: DesktopBookmapHeatmapSnapshot): IngestResult {
    const ts = snapshot.ts;
    const seen = new Set<string>();
    const midPrice = finitePositive(snapshot.midPrice)
      ? snapshot.midPrice
      : this.resolveMidPrice(snapshot);

    for (const level of [...snapshot.bids, ...snapshot.asks]) {
      const size = levelSize(level);
      if (size <= 0 || !finitePositive(level.price)) continue;
      if (finitePositive(midPrice) && this.isTooFarFromMid(level.price, midPrice)) continue;

      const priceBucket = normalizePriceBucket(level.price, this.config.priceBucketSize);
      const key = levelKey(level.side, priceBucket);
      seen.add(key);
      const previous = this.levels.get(key);
      if (!previous) {
        const tier = tierForSize(size);
        this.levels.set(key, {
          side: level.side,
          priceBucket,
          firstSeenTs: ts,
          lastSeenTs: ts,
          lastUpdateTs: ts,
          currentSize: size,
          previousSize: size,
          maxSize: size,
          avgSize: size,
          visibleIntensity: this.computeIntensity(size, size, 0, tier, false, false),
          ageMs: 0,
          stale: false,
          pulled: false,
          stacked: false,
          executedNear: false,
          updatesCount: 1,
          tier,
        });
        continue;
      }

      const sizeIncreaseRatio = previous.currentSize > 0 ? size / previous.currentSize : 1;
      const sizeDropRatio = previous.currentSize > 0 ? size / previous.currentSize : 1;
      previous.previousSize = previous.currentSize;
      previous.currentSize = size;
      previous.maxSize = Math.max(previous.maxSize, size);
      previous.avgSize =
        (previous.avgSize * previous.updatesCount + size) / (previous.updatesCount + 1);
      previous.lastSeenTs = ts;
      previous.lastUpdateTs = ts;
      previous.ageMs = ts - previous.firstSeenTs;
      previous.stale = false;
      previous.pulled = sizeDropRatio <= 0.45;
      previous.stacked = sizeIncreaseRatio >= 1.55 && size - previous.previousSize >= 2;
      previous.updatesCount += 1;
      previous.tier = tierForSize(previous.maxSize);
      previous.visibleIntensity = this.computeIntensity(
        previous.currentSize,
        previous.maxSize,
        previous.ageMs,
        previous.tier,
        previous.stacked,
        false,
      );
    }

    for (const [key, level] of Array.from(this.levels.entries())) {
      if (seen.has(key)) continue;
      const missingForMs = ts - level.lastSeenTs;
      const fadeLimit = isWallTier(level.tier) ? this.config.wallFadeMs : this.config.fadeMs;
      level.stale = true;
      level.pulled = true;
      level.currentSize = 0;
      level.ageMs = ts - level.firstSeenTs;
      level.lastUpdateTs = ts;
      level.visibleIntensity = this.computeIntensity(
        0,
        level.maxSize,
        level.ageMs,
        level.tier,
        false,
        true,
        missingForMs / fadeLimit,
      );
      if (missingForMs > fadeLimit) {
        this.levels.delete(key);
      }
    }

    this.appendCells(ts);
    this.prune(ts, midPrice);
    this.lastStats = this.buildStats(ts);
    return {
      state: this.buildState(
        snapshot.symbol,
        snapshot.visibleBids ?? snapshot.bids,
        snapshot.visibleAsks ?? snapshot.asks,
        ts,
      ),
      stats: this.lastStats,
    };
  }

  getStats(): DesktopBookmapHeatmapStats {
    return this.lastStats;
  }

  hydrateHistory(cells: readonly HeatmapCell[], now: number): number {
    const byKey = new Map<string, HeatmapCell>();
    for (const cell of [...this.cells, ...cells]) {
      if (
        !Number.isFinite(cell.timeBucket) ||
        !Number.isFinite(cell.price) ||
        cell.price <= 0 ||
        !Number.isFinite(cell.maxSizeInBucket) ||
        cell.maxSizeInBucket <= 0
      ) {
        continue;
      }
      if (now - cell.lastUpdateTs > this.config.memoryWindowMs) continue;
      const key = `${cell.timeBucket}:${cell.side}:${cell.price}`;
      const previous = byKey.get(key);
      if (!previous || cell.maxSizeInBucket > previous.maxSizeInBucket) {
        byKey.set(key, { ...cell });
      }
    }
    this.cells = Array.from(byKey.values())
      .sort((a, b) => a.timeBucket - b.timeBucket)
      .slice(-this.config.maxCells);
    this.rebuildCellIndex();
    return this.cells.length;
  }

  getPersistableLocalHistory(params: {
    currentPrice: number;
    halfRangeUsd: number;
    now: number;
    maxAgeMs: number;
  }): DesktopLocalHistorySelection {
    const minPrice = params.currentPrice - params.halfRangeUsd;
    const maxPrice = params.currentPrice + params.halfRangeUsd;
    const result: DesktopLocalHistorySelection = {
      cells: [],
      rejectedOutsideLocalRange: 0,
      rejectedByAge: 0,
      rejectedByWeakIntensity: 0,
      rejectedByNoiseFilter: 0,
      maxHistoryAgeMs: 0,
    };
    const observationsByLevel = new Map<string, number>();
    for (const cell of this.cells) {
      const key = levelKey(cell.side, cell.price);
      observationsByLevel.set(key, (observationsByLevel.get(key) ?? 0) + 1);
    }
    for (const cell of this.cells) {
      const age = Math.max(0, params.now - cell.lastUpdateTs);
      if (age > params.maxAgeMs) {
        result.rejectedByAge += 1;
        continue;
      }
      if (cell.price < minPrice || cell.price > maxPrice) {
        result.rejectedOutsideLocalRange += 1;
        continue;
      }
      const key = levelKey(cell.side, cell.price);
      const tracked = this.levels.get(key);
      const persistent =
        (tracked?.updatesCount ?? 0) >= 3 ||
        (observationsByLevel.get(key) ?? 0) >= 3;
      const strongEnough = cell.maxSizeInBucket >= 5;
      if (!persistent && !strongEnough) {
        result.rejectedByNoiseFilter += 1;
        continue;
      }
      if (cell.maxSizeInBucket < 0.75) {
        result.rejectedByWeakIntensity += 1;
        continue;
      }
      result.cells.push({ ...cell });
      result.maxHistoryAgeMs = Math.max(result.maxHistoryAgeMs, age);
    }
    return result;
  }

  private computeIntensity(
    currentSize: number,
    maxSize: number,
    ageMs: number,
    tier: LiquidityTier,
    stacked: boolean,
    stale: boolean,
    fadeRatio = 0,
  ): number {
    const sizeBase = clamp01(Math.log1p(Math.max(currentSize, maxSize * 0.45)) / Math.log1p(80));
    const stabilityBoost = clamp01(ageMs / 90_000) * 0.22;
    const stackBoost = stacked ? 0.16 : 0;
    const floor = tierFloor(tier);
    const raw = Math.max(floor, sizeBase * 0.78 + stabilityBoost + stackBoost);
    const fade = stale ? Math.max(0.12, 1 - clamp01(fadeRatio) * 0.85) : 1;
    return clamp01(raw * fade);
  }

  private appendCells(ts: number): void {
    const bucket = timeBucket(ts, this.config.timeBucketMs);
    for (const level of Array.from(this.levels.values())) {
      if (level.visibleIntensity <= 0.04) continue;
      const visualSize = Math.max(level.currentSize, level.maxSize * level.visibleIntensity);
      const key = `${bucket}:${level.side}:${level.priceBucket}`;
      const existingIndex = this.cellIndex.get(key);
      if (existingIndex != null) {
        const cell = this.cells[existingIndex];
        if (!cell) continue;
        cell.size = Math.max(cell.size, visualSize);
        cell.maxSizeInBucket = Math.max(cell.maxSizeInBucket, level.maxSize, visualSize);
        cell.lastSizeInBucket = level.currentSize;
        cell.lastUpdateTs = ts;
      } else {
        this.cellIndex.set(key, this.cells.length);
        this.cells.push({
          timeBucket: bucket,
          price: level.priceBucket,
          side: level.side,
          size: visualSize,
          maxSizeInBucket: Math.max(level.maxSize, visualSize),
          lastSizeInBucket: level.currentSize,
          lastUpdateTs: ts,
        });
      }
    }
  }

  private prune(ts: number, midPrice: number | null): void {
    const minTime = ts - this.config.memoryWindowMs;
    const before = this.cells.length;
    this.cells = this.cells.filter((cell) => {
      if (cell.timeBucket < minTime) return false;
      if (finitePositive(midPrice) && this.isTooFarFromMid(cell.price, midPrice)) return false;
      return true;
    });
    if (this.cells.length > this.config.maxCells) {
      this.cells = this.cells.slice(-this.config.maxCells);
    }
    this.pruneCount += Math.max(0, before - this.cells.length);
    this.rebuildCellIndex();
  }

  private rebuildCellIndex(): void {
    this.cellIndex.clear();
    this.cells.forEach((cell, index) => {
      this.cellIndex.set(`${cell.timeBucket}:${cell.side}:${cell.price}`, index);
    });
  }

  private buildState(
    symbol: string,
    bidsInput: DesktopBookmapInputLevel[],
    asksInput: DesktopBookmapInputLevel[],
    ts: number,
  ): BookmapState {
    const bids = bidsInput.map((level) => {
      const priceBucket = normalizePriceBucket(level.price, this.config.priceBucketSize);
      const tracked = this.levels.get(levelKey("bid", priceBucket));
      return tracked
        ? toBookLevel(tracked, false)
        : toBookLevel({
            side: "bid",
            priceBucket,
            firstSeenTs: ts,
            lastSeenTs: ts,
            lastUpdateTs: ts,
            currentSize: levelSize(level),
            previousSize: levelSize(level),
            maxSize: levelSize(level),
            avgSize: levelSize(level),
            visibleIntensity: 0.2,
            ageMs: 0,
            stale: false,
            pulled: false,
            stacked: false,
            executedNear: false,
            updatesCount: 1,
            tier: tierForSize(levelSize(level)),
          });
    });
    const asks = asksInput.map((level) => {
      const priceBucket = normalizePriceBucket(level.price, this.config.priceBucketSize);
      const tracked = this.levels.get(levelKey("ask", priceBucket));
      return tracked
        ? toBookLevel(tracked, false)
        : toBookLevel({
            side: "ask",
            priceBucket,
            firstSeenTs: ts,
            lastSeenTs: ts,
            lastUpdateTs: ts,
            currentSize: levelSize(level),
            previousSize: levelSize(level),
            maxSize: levelSize(level),
            avgSize: levelSize(level),
            visibleIntensity: 0.2,
            ageMs: 0,
            stale: false,
            pulled: false,
            stacked: false,
            executedNear: false,
            updatesCount: 1,
            tier: tierForSize(levelSize(level)),
          });
    });
    const allBookLevels = [...bids, ...asks];
    return {
      symbol,
      exchange: this.config.exchange,
      market: "spot",
      bids,
      asks,
      heatmapCells: this.cells,
      importantWalls: allBookLevels.filter((level) => level.isImportant),
      structuralWalls: allBookLevels.filter((level) => level.isStructural),
      majorWalls: allBookLevels.filter((level) => level.isMajor),
      timestamp: ts,
    };
  }

  private buildStats(ts: number): DesktopBookmapHeatmapStats {
    let activeLevels = 0;
    let staleLevels = 0;
    let pulledCount = 0;
    let stackedCount = 0;
    let wallCount = 0;
    let maxIntensity = 0;

    for (const level of Array.from(this.levels.values())) {
      if (level.stale) staleLevels += 1;
      else activeLevels += 1;
      if (level.pulled) pulledCount += 1;
      if (level.stacked) stackedCount += 1;
      if (isWallTier(level.tier)) wallCount += 1;
      maxIntensity = Math.max(maxIntensity, level.visibleIntensity);
    }

    const strongestLevels = Array.from(this.levels.values())
      .sort((a, b) => b.visibleIntensity * b.maxSize - a.visibleIntensity * a.maxSize)
      .slice(0, 12)
      .map((level) => ({
        side: level.side,
        price: level.priceBucket,
        currentSize: level.currentSize,
        maxSize: level.maxSize,
        visibleIntensity: level.visibleIntensity,
        ageMs: Math.max(0, ts - level.firstSeenTs),
        stale: level.stale,
        pulled: level.pulled,
        stacked: level.stacked,
      }));

    return {
      cellCount: this.cells.length,
      activeLevels,
      staleLevels,
      pulledCount,
      stackedCount,
      wallCount,
      maxIntensity,
      pruneCount: this.pruneCount,
      memoryWindowMs: this.config.memoryWindowMs,
      priceBucketSize: this.config.priceBucketSize,
      timeBucketMs: this.config.timeBucketMs,
      strongestLevels,
    };
  }

  private resolveMidPrice(snapshot: DesktopBookmapHeatmapSnapshot): number | null {
    const bid = snapshot.bids[0]?.price;
    const ask = snapshot.asks[0]?.price;
    return finitePositive(bid) && finitePositive(ask) && ask >= bid ? (bid + ask) / 2 : null;
  }

  private isTooFarFromMid(price: number, midPrice: number): boolean {
    const distancePct = Math.abs(price - midPrice) / midPrice;
    return distancePct > this.config.maxDistancePct;
  }
}
