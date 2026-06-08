/**
 * Event-sourced order book engine for Bookmap-style heatmap reconstruction.
 * Maintains current depth, time-bucketed liquidity cells, and persistent wall registries.
 *
 * Live Binance depth today is wired via `orderbookService` (spot) and `orderbookServicePerp` (perp).
 * Engines are keyed by exchange + symbol + market so spot and perp never overwrite each other.
 */
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET } from "@shared/bookmapMarket";

export type BookSide = "bid" | "ask";

export interface BookLevel {
  price: number;
  size: number;
  side: BookSide;
  firstSeenTs: number;
  lastUpdateTs: number;
  maxSeenSize: number;
  isImportant: boolean;
  isStructural: boolean;
  isMajor: boolean;
  stale: boolean;
}

export interface HeatmapCell {
  timeBucket: number;
  price: number;
  side: BookSide;
  size: number;
  maxSizeInBucket: number;
  lastSizeInBucket: number;
  lastUpdateTs: number;
}

export interface BookmapEngineState {
  bids: BookLevel[];
  asks: BookLevel[];
  heatmapCells: HeatmapCell[];
  importantWalls: BookLevel[];
  structuralWalls: BookLevel[];
  majorWalls: BookLevel[];
  timestamp: number;
  limitHistorySampler?: LimitHistorySamplerStats;
}

export interface OrderBookLevelInput {
  price: number;
  size: number;
}

export interface BookmapSnapshotInput {
  bids: OrderBookLevelInput[];
  asks: OrderBookLevelInput[];
  timestamp?: number;
}

export interface BookmapDepthUpdateInput {
  bids: OrderBookLevelInput[];
  asks: OrderBookLevelInput[];
  timestamp?: number;
}

export interface GetHeatmapCellsParams {
  fromTs?: number;
  toTs?: number;
  priceMin?: number;
  priceMax?: number;
  bucketMs?: number;
}

export interface LimitHistorySamplerStats {
  historySamplerEnabled: boolean;
  lastTickTs: number;
  lastSampledLevelCount: number;
  lastBidSampled: number;
  lastAskSampled: number;
  /** Levels >= BOOKMAP_SAMPLE_MAJOR_BTC in last tick. */
  lastSampledWallLevels: number;
  /** Levels >= BOOKMAP_SAMPLE_MEDIUM_BTC and < major in last tick. */
  lastSampledMediumLevels: number;
  heatmapCellCount: number;
  coverageMs: number;
  snapshotTickAgeMs: number;
  /** P7.4D — server sampler audit scalars (DEV diagnostics). */
  snapshotSampleIntervalMs: number;
  snapshotWritesPerTick: number;
  avgBidLevelsSampledPerTick: number;
  avgAskLevelsSampledPerTick: number;
  maxBidLevelsSampledPerTick: number;
  maxAskLevelsSampledPerTick: number;
  majorLevelsPerTick: number;
  mediumLevelsPerTick: number;
  nearPriceLevelsPerTick: number;
  sampledDepthMode: string;
  sampledTopLevelsPerSide: number;
  thresholdMajorBtc: number;
  thresholdMediumBtc: number;
  thresholdNearPriceBtc: number;
  historicalRetentionMinutes: number;
  rawHeatmapCellCount: number;
  retainedHeatmapCellCount: number;
  droppedByRetentionCount: number;
  farFromPriceSampledPct: number;
  nearPriceSampledPct: number;
  likelySamplerTooSparse: boolean;
  likelyThresholdTooAggressive: boolean;
  likelyRetentionTooShort: boolean;
  p74ServerSamplerOk: boolean;
}

export interface GetStateOptions {
  priceRangePct?: number;
  /** When set with priceMax, overrides pct-based book clipping for bids/asks. */
  priceMin?: number;
  priceMax?: number;
  minWallSize?: number;
  includeStale?: boolean;
}

export const WALL_IMPORTANT_BTC = 100;
export const WALL_STRUCTURAL_BTC = 150;
export const WALL_MAJOR_BTC = 300;

const DEFAULT_BUCKET_MS = 500;
/** Periodic passive limit history sampler (P7.1). */
export const BOOKMAP_SNAPSHOT_SAMPLE_MS = 1_000;
export const BOOKMAP_SAMPLE_MIN_BTC = 2;
/** P7.4E — lower medium threshold to increase historical texture input. */
export const BOOKMAP_SAMPLE_MEDIUM_BTC = 1.5;
export const BOOKMAP_SAMPLE_MAJOR_BTC = 100;
/** P7.4E — dense passive limit sampling per side. */
export const BOOKMAP_SAMPLE_TOP_LEVELS_PER_SIDE = 400;
/** Legacy near band (superseded by P7.4E distance bands). */
export const BOOKMAP_SAMPLE_NEAR_BAND_PCT = 0.35;
export const BOOKMAP_SAMPLE_FAR_MEDIUM_BAND_PCT = 0.5;
export const BOOKMAP_SAMPLER_DEPTH_MODE =
  "banded-0-50pct+major+top-by-size";
/** P7.4E — top levels by size within each distance band (per side). */
const BOOKMAP_SAMPLE_DISTANCE_BANDS: ReadonlyArray<{
  lo: number;
  hi: number;
  minBtc: number;
  topN: number;
}> = [
  { lo: 0, hi: 0.05, minBtc: BOOKMAP_SAMPLE_MIN_BTC, topN: 120 },
  { lo: 0.05, hi: 0.15, minBtc: BOOKMAP_SAMPLE_MIN_BTC, topN: 120 },
  { lo: 0.15, hi: 0.35, minBtc: BOOKMAP_SAMPLE_MEDIUM_BTC, topN: 100 },
  { lo: 0.35, hi: 0.5, minBtc: BOOKMAP_SAMPLE_MEDIUM_BTC, topN: 60 },
];
const BOOKMAP_SAMPLER_NEAR_PRICE_AUDIT_PCT = 0.05;
const STALE_MS = 5 * 60 * 1000;
/** Keep stale non-wall depth for last-known DOM / COB (Bookmap-style far depth). */
const STALE_DEPTH_RETENTION_MS = 30 * 60 * 1000;
/** P7.4D — longer passive limit footprint retention (was 90m). */
const HEATMAP_RETENTION_MS = 120 * 60 * 1000;
const MAX_HEATMAP_CELLS = 280_000;
const DEBUG = process.env.NODE_ENV === "development";
const LOG_THROTTLE_MS = 5_000;

function levelKey(side: BookSide, price: number): string {
  return `${side}:${price}`;
}

function cellKey(timeBucket: number, side: BookSide, price: number): string {
  return `${timeBucket}:${side}:${price}`;
}

function classifyPeakSize(peakSize: number): Pick<BookLevel, "isImportant" | "isStructural" | "isMajor"> {
  return {
    isImportant: peakSize >= WALL_IMPORTANT_BTC,
    isStructural: peakSize >= WALL_STRUCTURAL_BTC,
    isMajor: peakSize >= WALL_MAJOR_BTC,
  };
}

function applyClassification(level: BookLevel): void {
  const c = classifyPeakSize(level.maxSeenSize);
  level.isImportant = c.isImportant;
  level.isStructural = c.isStructural;
  level.isMajor = c.isMajor;
}

/** Walls / far depth that must survive pruning and API filtering when includeStale. */
export function isPreservedBookLevel(level: BookLevel): boolean {
  return (
    level.maxSeenSize >= WALL_IMPORTANT_BTC ||
    level.isImportant ||
    level.isStructural ||
    level.isMajor
  );
}

export class BookmapEngine {
  readonly symbol: string;
  readonly exchange: string;
  readonly market: BookmapMarketSource;

  private readonly levels = new Map<string, BookLevel>();
  private readonly heatmapCells = new Map<string, HeatmapCell>();
  private bucketMs = DEFAULT_BUCKET_MS;
  private snapshotBucketMs = BOOKMAP_SNAPSHOT_SAMPLE_MS;
  private lastTimestamp = 0;
  private lastLogAt = 0;
  private samplerStats: LimitHistorySamplerStats = {
    historySamplerEnabled: true,
    lastTickTs: 0,
    lastSampledLevelCount: 0,
    lastBidSampled: 0,
    lastAskSampled: 0,
    lastSampledWallLevels: 0,
    lastSampledMediumLevels: 0,
    heatmapCellCount: 0,
    coverageMs: 0,
    snapshotTickAgeMs: 0,
    snapshotSampleIntervalMs: BOOKMAP_SNAPSHOT_SAMPLE_MS,
    snapshotWritesPerTick: 0,
    avgBidLevelsSampledPerTick: 0,
    avgAskLevelsSampledPerTick: 0,
    maxBidLevelsSampledPerTick: 0,
    maxAskLevelsSampledPerTick: 0,
    majorLevelsPerTick: 0,
    mediumLevelsPerTick: 0,
    nearPriceLevelsPerTick: 0,
    sampledDepthMode: BOOKMAP_SAMPLER_DEPTH_MODE,
    sampledTopLevelsPerSide: BOOKMAP_SAMPLE_TOP_LEVELS_PER_SIDE,
    thresholdMajorBtc: BOOKMAP_SAMPLE_MAJOR_BTC,
    thresholdMediumBtc: BOOKMAP_SAMPLE_MEDIUM_BTC,
    thresholdNearPriceBtc: BOOKMAP_SAMPLE_MIN_BTC,
    historicalRetentionMinutes: HEATMAP_RETENTION_MS / 60_000,
    rawHeatmapCellCount: 0,
    retainedHeatmapCellCount: 0,
    droppedByRetentionCount: 0,
    farFromPriceSampledPct: 0,
    nearPriceSampledPct: 0,
    likelySamplerTooSparse: false,
    likelyThresholdTooAggressive: false,
    likelyRetentionTooShort: false,
    p74ServerSamplerOk: false,
  };
  private samplerTickCount = 0;
  private bidSampledSum = 0;
  private askSampledSum = 0;
  private cumulativeRetentionDropped = 0;
  private lastTrimRawCount = 0;

  constructor(symbol: string, exchange: string, market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET) {
    this.symbol = symbol.toUpperCase();
    this.exchange = exchange.toLowerCase();
    this.market = market;
  }

  setBucketMs(ms: number): void {
    if (Number.isFinite(ms) && ms > 0) this.bucketMs = Math.floor(ms);
  }

  applySnapshot(input: BookmapSnapshotInput): void {
    const ts = input.timestamp ?? Date.now();
    this.lastTimestamp = ts;

    for (const side of ["bid", "ask"] as const) {
      const rows = side === "bid" ? input.bids : input.asks;
      for (const row of rows) {
        this.applyLevelUpdate(row.price, row.size, side, ts, false);
      }
    }

    this.trimHeatmapCells(ts);
    this.maybeLog("applySnapshot");
  }

  applyDepthUpdate(input: BookmapDepthUpdateInput): void {
    const ts = input.timestamp ?? Date.now();
    this.lastTimestamp = ts;

    for (const b of input.bids) {
      this.applyLevelUpdate(b.price, b.size, "bid", ts, true);
    }
    for (const a of input.asks) {
      this.applyLevelUpdate(a.price, a.size, "ask", ts, true);
    }

    this.markStaleLevels(ts);
    this.pruneStaleLevels();
    this.trimHeatmapCells(ts);
    this.maybeLog("applyDepthUpdate");
  }

  getCurrentState(options: GetStateOptions = {}): BookmapEngineState {
    const mid = this.estimateMidPrice();
    const resolved = this.resolvePriceRange(mid, options.priceRangePct);
    const priceMin =
      options.priceMin != null && Number.isFinite(options.priceMin)
        ? options.priceMin
        : resolved.priceMin;
    const priceMax =
      options.priceMax != null && Number.isFinite(options.priceMax)
        ? options.priceMax
        : resolved.priceMax;

    const includeStale = options.includeStale === true;
    const minWall = options.minWallSize ?? 0;

    const explicitViewport =
      options.priceMin != null &&
      options.priceMax != null &&
      Number.isFinite(options.priceMin) &&
      Number.isFinite(options.priceMax);

    const viewMin = explicitViewport ? options.priceMin! : priceMin;
    const viewMax = explicitViewport ? options.priceMax! : priceMax;

    const inRequestedViewport = (levelPrice: number): boolean => {
      if (viewMin == null || viewMax == null) return true;
      return levelPrice >= viewMin && levelPrice <= viewMax;
    };

    const shouldIncludeInBidAsk = (level: BookLevel): boolean => {
      if (!inRequestedViewport(level.price)) return false;
      if (!includeStale && level.stale) return false;
      if (level.size > 0) return true;
      if (isPreservedBookLevel(level)) return true;
      if (level.maxSeenSize >= WALL_IMPORTANT_BTC) return true;
      if (includeStale && level.maxSeenSize > 0) return true;
      return false;
    };

    const bids: BookLevel[] = [];
    const asks: BookLevel[] = [];
    const importantWalls: BookLevel[] = [];
    const structuralWalls: BookLevel[] = [];
    const majorWalls: BookLevel[] = [];

    for (const level of Array.from(this.levels.values())) {
      if (shouldIncludeInBidAsk(level)) {
        const copy = { ...level };
        if (copy.side === "bid") bids.push(copy);
        else asks.push(copy);
      }

      if (level.maxSeenSize >= minWall) {
        if (level.isMajor) majorWalls.push({ ...level });
        if (level.isStructural) structuralWalls.push({ ...level });
        if (level.isImportant) importantWalls.push({ ...level });
      }
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    const bySize = (a: BookLevel, b: BookLevel) => b.maxSeenSize - a.maxSeenSize;
    importantWalls.sort(bySize);
    structuralWalls.sort(bySize);
    majorWalls.sort(bySize);

    return {
      bids,
      asks,
      heatmapCells: this.getHeatmapCells({
        priceMin: priceMin ?? undefined,
        priceMax: priceMax ?? undefined,
      }),
      importantWalls,
      structuralWalls,
      majorWalls,
      timestamp: this.lastTimestamp,
      limitHistorySampler: this.getLimitHistorySamplerStats(),
    };
  }

  getHeatmapCells(params: GetHeatmapCellsParams = {}): HeatmapCell[] {
    const fromTs = params.fromTs ?? Date.now() - HEATMAP_RETENTION_MS;
    const toTs = params.toTs ?? Date.now();
    const out: HeatmapCell[] = [];

    for (const cell of Array.from(this.heatmapCells.values())) {
      if (cell.timeBucket < fromTs || cell.timeBucket > toTs) continue;
      if (params.priceMin != null && cell.price < params.priceMin) continue;
      if (params.priceMax != null && cell.price > params.priceMax) continue;
      out.push({ ...cell });
    }

    out.sort((a, b) => a.timeBucket - b.timeBucket || a.price - b.price);
    return out;
  }

  getImportantWalls(minSize = WALL_IMPORTANT_BTC): BookLevel[] {
    return Array.from(this.levels.values())
      .filter((l) => l.isImportant && l.maxSeenSize >= minSize)
      .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
      .map((l) => ({ ...l }));
  }

  reset(): void {
    this.levels.clear();
    this.heatmapCells.clear();
    this.lastTimestamp = 0;
    this.samplerTickCount = 0;
    this.bidSampledSum = 0;
    this.askSampledSum = 0;
    this.cumulativeRetentionDropped = 0;
    this.lastTrimRawCount = 0;
    if (DEBUG) console.debug("[BookmapEngine] reset", { symbol: this.symbol, exchange: this.exchange });
  }

  hasData(): boolean {
    return this.levels.size > 0 || this.heatmapCells.size > 0;
  }

  getLimitHistorySamplerStats(): LimitHistorySamplerStats {
    const now = Date.now();
    const coverageMs = this.computeHeatmapCoverageMs();
    const retainedHeatmapCellCount = this.heatmapCells.size;
    const coverageMinutes = coverageMs / 60_000;
    const retentionMinutes = HEATMAP_RETENTION_MS / 60_000;

    const likelySamplerTooSparse =
      this.samplerTickCount > 3 &&
      (this.samplerStats.avgBidLevelsSampledPerTick +
        this.samplerStats.avgAskLevelsSampledPerTick <
        80 ||
        coverageMinutes < retentionMinutes * 0.2);

    const likelyThresholdTooAggressive =
      this.samplerStats.mediumLevelsPerTick <
        this.samplerStats.majorLevelsPerTick * 0.5 &&
      this.samplerStats.lastSampledLevelCount < 120;

    const likelyRetentionTooShort =
      coverageMinutes < retentionMinutes * 0.35 &&
      retainedHeatmapCellCount > 1_000 &&
      this.cumulativeRetentionDropped > 500;

    const p74ServerSamplerOk =
      !likelySamplerTooSparse &&
      !likelyThresholdTooAggressive &&
      !likelyRetentionTooShort &&
      coverageMinutes >= 10;

    return {
      ...this.samplerStats,
      heatmapCellCount: retainedHeatmapCellCount,
      coverageMs,
      snapshotTickAgeMs:
        this.samplerStats.lastTickTs > 0
          ? Math.max(0, now - this.samplerStats.lastTickTs)
          : 0,
      retainedHeatmapCellCount,
      rawHeatmapCellCount: this.lastTrimRawCount || retainedHeatmapCellCount,
      droppedByRetentionCount: this.cumulativeRetentionDropped,
      historicalRetentionMinutes: retentionMinutes,
      likelySamplerTooSparse,
      likelyThresholdTooAggressive,
      likelyRetentionTooShort,
      p74ServerSamplerOk,
    };
  }

  /**
   * P7.1 — materialize passive limit history from a full orderbook snapshot.
   * Only levels present in the current book receive cells for this time bucket;
   * pulled/disappeared levels leave gaps in newer buckets while past cells remain.
   */
  samplePassiveLimitHistory(input: BookmapSnapshotInput): number {
    const ts = input.timestamp ?? Date.now();
    this.lastTimestamp = Math.max(this.lastTimestamp, ts);

    const mid = this.estimateMidFromBook(input.bids, input.asks) ?? this.estimateMidPrice();
    const bidLevels = selectPassiveLimitSampleLevels(input.bids, mid);
    const askLevels = selectPassiveLimitSampleLevels(input.asks, mid);
    const timeBucket =
      Math.floor(ts / this.snapshotBucketMs) * this.snapshotBucketMs;

    for (const row of bidLevels) {
      this.writeSnapshotHeatmapCell(timeBucket, row.price, "bid", row.size, ts);
    }
    for (const row of askLevels) {
      this.writeSnapshotHeatmapCell(timeBucket, row.price, "ask", row.size, ts);
    }

    const rawBeforeTrim = this.heatmapCells.size;
    this.trimHeatmapCells(ts);
    const sampled = [...bidLevels, ...askLevels];
    let lastSampledWallLevels = 0;
    let lastSampledMediumLevels = 0;
    let majorLevelsPerTick = 0;
    let mediumLevelsPerTick = 0;
    let nearPriceLevelsPerTick = 0;
    let farFromPriceLevelsPerTick = 0;
    for (const row of sampled) {
      if (row.size >= BOOKMAP_SAMPLE_MAJOR_BTC) {
        lastSampledWallLevels += 1;
        majorLevelsPerTick += 1;
      } else if (row.size >= BOOKMAP_SAMPLE_MEDIUM_BTC) {
        lastSampledMediumLevels += 1;
        mediumLevelsPerTick += 1;
      }
      if (mid != null && mid > 0) {
        const distPct = Math.abs(row.price - mid) / mid;
        if (distPct <= BOOKMAP_SAMPLER_NEAR_PRICE_AUDIT_PCT) {
          nearPriceLevelsPerTick += 1;
        } else {
          farFromPriceLevelsPerTick += 1;
        }
      }
    }

    this.samplerTickCount += 1;
    this.bidSampledSum += bidLevels.length;
    this.askSampledSum += askLevels.length;
    const sampledTotal = sampled.length || 1;
    const nearPct = nearPriceLevelsPerTick / sampledTotal;
    const farPct = farFromPriceLevelsPerTick / sampledTotal;

    this.samplerStats = {
      historySamplerEnabled: true,
      lastTickTs: ts,
      lastSampledLevelCount: sampled.length,
      lastBidSampled: bidLevels.length,
      lastAskSampled: askLevels.length,
      lastSampledWallLevels,
      lastSampledMediumLevels,
      heatmapCellCount: this.heatmapCells.size,
      coverageMs: this.computeHeatmapCoverageMs(),
      snapshotTickAgeMs: 0,
      snapshotSampleIntervalMs: this.snapshotBucketMs,
      snapshotWritesPerTick: bidLevels.length + askLevels.length,
      avgBidLevelsSampledPerTick: this.bidSampledSum / this.samplerTickCount,
      avgAskLevelsSampledPerTick: this.askSampledSum / this.samplerTickCount,
      maxBidLevelsSampledPerTick: Math.max(
        this.samplerStats.maxBidLevelsSampledPerTick,
        bidLevels.length,
      ),
      maxAskLevelsSampledPerTick: Math.max(
        this.samplerStats.maxAskLevelsSampledPerTick,
        askLevels.length,
      ),
      majorLevelsPerTick,
      mediumLevelsPerTick,
      nearPriceLevelsPerTick,
      sampledDepthMode: BOOKMAP_SAMPLER_DEPTH_MODE,
      sampledTopLevelsPerSide: BOOKMAP_SAMPLE_TOP_LEVELS_PER_SIDE,
      thresholdMajorBtc: BOOKMAP_SAMPLE_MAJOR_BTC,
      thresholdMediumBtc: BOOKMAP_SAMPLE_MEDIUM_BTC,
      thresholdNearPriceBtc: BOOKMAP_SAMPLE_MIN_BTC,
      historicalRetentionMinutes: HEATMAP_RETENTION_MS / 60_000,
      rawHeatmapCellCount: rawBeforeTrim,
      retainedHeatmapCellCount: this.heatmapCells.size,
      droppedByRetentionCount: this.cumulativeRetentionDropped,
      farFromPriceSampledPct: farPct,
      nearPriceSampledPct: nearPct,
      likelySamplerTooSparse: false,
      likelyThresholdTooAggressive: false,
      likelyRetentionTooShort: false,
      p74ServerSamplerOk: false,
    };
    this.lastTrimRawCount = rawBeforeTrim;

    return this.samplerStats.lastSampledLevelCount;
  }

  private computeHeatmapCoverageMs(): number {
    let oldest = Infinity;
    let newest = -Infinity;
    for (const cell of Array.from(this.heatmapCells.values())) {
      if (cell.timeBucket < oldest) oldest = cell.timeBucket;
      if (cell.timeBucket > newest) newest = cell.timeBucket;
    }
    if (!Number.isFinite(oldest) || !Number.isFinite(newest)) return 0;
    return Math.max(0, newest - oldest);
  }

  private estimateMidFromBook(
    bids: OrderBookLevelInput[],
    asks: OrderBookLevelInput[],
  ): number | null {
    let bestBid = 0;
    let bestAsk = Infinity;
    for (const b of bids) {
      if (b.size > 0 && b.price > bestBid) bestBid = b.price;
    }
    for (const a of asks) {
      if (a.size > 0 && a.price < bestAsk) bestAsk = a.price;
    }
    if (bestBid > 0 && Number.isFinite(bestAsk) && bestAsk < Infinity && bestAsk > bestBid) {
      return (bestBid + bestAsk) / 2;
    }
    return null;
  }

  private writeSnapshotHeatmapCell(
    timeBucket: number,
    price: number,
    side: BookSide,
    size: number,
    ts: number,
  ): void {
    if (!Number.isFinite(price) || price <= 0 || size <= 0) return;
    const key = cellKey(timeBucket, side, price);
    const existing = this.heatmapCells.get(key);
    if (existing) {
      existing.lastSizeInBucket = size;
      existing.size = size;
      existing.maxSizeInBucket = Math.max(existing.maxSizeInBucket, size);
      existing.lastUpdateTs = ts;
      return;
    }
    this.heatmapCells.set(key, {
      timeBucket,
      price,
      side,
      size,
      maxSizeInBucket: size,
      lastSizeInBucket: size,
      lastUpdateTs: ts,
    });
  }

  private applyLevelUpdate(
    price: number,
    size: number,
    side: BookSide,
    ts: number,
    _isDelta: boolean,
  ): void {
    if (!Number.isFinite(price) || price <= 0) return;

    const key = levelKey(side, price);
    const existing = this.levels.get(key);

    if (size <= 0) {
      if (!existing) return;
      if (existing.isImportant || existing.isStructural || existing.isMajor) {
        existing.size = 0;
        existing.stale = true;
        existing.lastUpdateTs = ts;
        this.updateHeatmapCell(price, side, 0, ts);
      } else {
        this.levels.delete(key);
      }
      return;
    }

    let level: BookLevel;
    if (existing) {
      level = existing;
      level.size = size;
      level.lastUpdateTs = ts;
      level.maxSeenSize = Math.max(level.maxSeenSize, size);
      level.stale = false;
    } else {
      level = {
        price,
        size,
        side,
        firstSeenTs: ts,
        lastUpdateTs: ts,
        maxSeenSize: size,
        isImportant: false,
        isStructural: false,
        isMajor: false,
        stale: false,
      };
      this.levels.set(key, level);
    }

    applyClassification(level);

    this.updateHeatmapCell(price, side, size, ts);
  }

  private updateHeatmapCell(price: number, side: BookSide, size: number, ts: number): void {
    const timeBucket = Math.floor(ts / this.bucketMs) * this.bucketMs;
    const key = cellKey(timeBucket, side, price);
    const existing = this.heatmapCells.get(key);

    if (size <= 0) {
      if (existing) {
        existing.lastSizeInBucket = 0;
        existing.size = 0;
        existing.lastUpdateTs = ts;
      }
      return;
    }

    if (existing) {
      existing.lastSizeInBucket = size;
      existing.size = size;
      existing.maxSizeInBucket = Math.max(existing.maxSizeInBucket, size);
      existing.lastUpdateTs = ts;
    } else {
      this.heatmapCells.set(key, {
        timeBucket,
        price,
        side,
        size,
        maxSizeInBucket: size,
        lastSizeInBucket: size,
        lastUpdateTs: ts,
      });
    }
  }

  private markStaleLevels(now: number): void {
    for (const level of Array.from(this.levels.values())) {
      if (level.stale) continue;
      if (now - level.lastUpdateTs < STALE_MS) continue;
      level.stale = true;
    }
  }

  /** Drop stale levels with no retained depth memory (walls and last-known COB kept longer). */
  private pruneStaleLevels(): void {
    const now = Date.now();
    for (const level of Array.from(this.levels.values())) {
      if (!level.stale) continue;
      if (isPreservedBookLevel(level)) continue;
      if (level.maxSeenSize >= WALL_IMPORTANT_BTC) continue;
      if (level.size > 0) continue;
      if (
        level.maxSeenSize > 0 &&
        now - level.lastUpdateTs < STALE_DEPTH_RETENTION_MS
      ) {
        continue;
      }
      this.levels.delete(levelKey(level.side, level.price));
    }
  }

  private trimHeatmapCells(now: number): void {
    const before = this.heatmapCells.size;
    const cutoff = now - HEATMAP_RETENTION_MS;
    for (const [key, cell] of Array.from(this.heatmapCells.entries())) {
      if (cell.timeBucket < cutoff) this.heatmapCells.delete(key);
    }

    if (this.heatmapCells.size > MAX_HEATMAP_CELLS) {
      const sorted = Array.from(this.heatmapCells.entries()).sort(
        (a, b) => a[1].timeBucket - b[1].timeBucket,
      );
      const drop = sorted.length - MAX_HEATMAP_CELLS;
      for (let i = 0; i < drop; i++) {
        this.heatmapCells.delete(sorted[i]![0]);
      }
    }

    const dropped = Math.max(0, before - this.heatmapCells.size);
    if (dropped > 0) {
      this.cumulativeRetentionDropped += dropped;
    }
  }

  private estimateMidPrice(): number | null {
    let bestBid = 0;
    let bestAsk = Infinity;
    for (const l of Array.from(this.levels.values())) {
      if (l.stale || l.size <= 0) continue;
      if (l.side === "bid" && l.price > bestBid) bestBid = l.price;
      if (l.side === "ask" && l.price < bestAsk) bestAsk = l.price;
    }
    if (bestBid > 0 && Number.isFinite(bestAsk) && bestAsk < Infinity) {
      return (bestBid + bestAsk) / 2;
    }
    return null;
  }

  private resolvePriceRange(
    mid: number | null,
    priceRangePct?: number,
  ): { priceMin: number | null; priceMax: number | null } {
    if (mid == null || priceRangePct == null || !Number.isFinite(priceRangePct) || priceRangePct <= 0) {
      return { priceMin: null, priceMax: null };
    }
    const pct = priceRangePct / 100;
    return {
      priceMin: mid * (1 - pct),
      priceMax: mid * (1 + pct),
    };
  }

  private maybeLog(source: string): void {
    if (!DEBUG) return;
    const now = Date.now();
    if (now - this.lastLogAt < LOG_THROTTLE_MS) return;
    this.lastLogAt = now;

    let bidCount = 0;
    let askCount = 0;
    let staleCount = 0;
    for (const l of Array.from(this.levels.values())) {
      if (l.side === "bid") bidCount++;
      else askCount++;
      if (l.stale) staleCount++;
    }

    const important = this.getImportantWalls();
    const structural = Array.from(this.levels.values()).filter((l) => l.isStructural);
    const major = Array.from(this.levels.values()).filter((l) => l.isMajor);

    const topWalls = important
      .slice()
      .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
      .slice(0, 10)
      .map((w) => ({
        side: w.side,
        price: w.price,
        size: w.size,
        maxSeenSize: w.maxSeenSize,
        stale: w.stale,
      }));

    console.debug("[BookmapEngine]", {
      source,
      symbol: this.symbol,
      exchange: this.exchange,
      totalBidLevels: bidCount,
      totalAskLevels: askCount,
      totalHeatmapCells: this.heatmapCells.size,
      importantWallsCount: important.length,
      structuralWallsCount: structural.length,
      majorWallsCount: major.length,
      staleWallCount: staleCount,
      top10WallsBySize: topWalls,
      bucketMs: this.bucketMs,
      timestamp: this.lastTimestamp,
    });
  }
}

function passiveLimitDistancePct(price: number, mid: number): number {
  return Math.abs(price - mid) / mid;
}

function selectPassiveLimitSampleLevels(
  levels: OrderBookLevelInput[],
  mid: number | null,
): OrderBookLevelInput[] {
  const selected = new Map<number, OrderBookLevelInput>();

  const consider = (row: OrderBookLevelInput) => {
    if (!Number.isFinite(row.price) || row.price <= 0 || row.size <= 0) return;
    const prev = selected.get(row.price);
    if (!prev || row.size > prev.size) {
      selected.set(row.price, row);
    }
  };

  for (const row of levels) {
    if (row.size >= BOOKMAP_SAMPLE_MAJOR_BTC) consider(row);
  }
  for (const row of levels) {
    if (row.size >= BOOKMAP_SAMPLE_MEDIUM_BTC) consider(row);
  }

  if (mid != null && mid > 0) {
    for (const band of BOOKMAP_SAMPLE_DISTANCE_BANDS) {
      const inBand = levels.filter((row) => {
        if (row.size < band.minBtc) return false;
        const distPct = passiveLimitDistancePct(row.price, mid);
        return distPct >= band.lo && distPct < band.hi;
      });
      inBand
        .sort((a, b) => b.size - a.size)
        .slice(0, band.topN)
        .forEach(consider);
    }
  }

  const ranked = [...levels]
    .filter((row) => row.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, BOOKMAP_SAMPLE_TOP_LEVELS_PER_SIDE);
  for (const row of ranked) {
    consider(row);
  }

  return Array.from(selected.values());
}

const engines = new Map<string, BookmapEngine>();

function engineKey(symbol: string, exchange: string, market: BookmapMarketSource): string {
  return `${exchange.toLowerCase()}:${symbol.toUpperCase()}:${market}`;
}

export function getBookmapEngine(
  symbol: string,
  exchange: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): BookmapEngine {
  const key = engineKey(symbol, exchange, market);
  let engine = engines.get(key);
  if (!engine) {
    engine = new BookmapEngine(symbol, exchange, market);
    engines.set(key, engine);
  }
  return engine;
}

/** Feed Binance order book updates into the engine for the given market (spot | perp). */
export function feedBinanceOrderBook(
  update: BookmapDepthUpdateInput,
  mode: "snapshot" | "delta" = "delta",
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): void {
  const engine = getBookmapEngine("BTCUSDT", "binance", market);
  if (mode === "snapshot") {
    engine.applySnapshot(update);
  } else {
    engine.applyDepthUpdate(update);
  }
}

/** P7.1 — periodic passive limit snapshot into heatmap history cells. */
export function sampleBinancePassiveLimitHistory(
  market: BookmapMarketSource,
  orderBook: BookmapSnapshotInput,
): number {
  const engine = getBookmapEngine("BTCUSDT", "binance", market);
  return engine.samplePassiveLimitHistory(orderBook);
}

export function getLimitHistorySamplerStats(
  symbol: string,
  exchange: string,
  market: BookmapMarketSource,
): LimitHistorySamplerStats {
  return getBookmapEngine(symbol, exchange, market).getLimitHistorySamplerStats();
}

let limitHistoryDiagStarted = false;

export function startBookmapLimitHistoryDiagnostics(): void {
  if (limitHistoryDiagStarted || process.env.NODE_ENV === "production") return;
  limitHistoryDiagStarted = true;

  setInterval(() => {
    const spot = getLimitHistorySamplerStats("BTCUSDT", "binance", "spot");
    const perp = getLimitHistorySamplerStats("BTCUSDT", "binance", "perp");
    console.debug("[BOOKMAP_LIMIT_HISTORY_STATE]", {
      spotEngineCellCount: spot.heatmapCellCount,
      perpEngineCellCount: perp.heatmapCellCount,
      spotEngineCoverageMs: spot.coverageMs,
      perpEngineCoverageMs: perp.coverageMs,
      spotSampledLevelsLastTick: spot.lastSampledLevelCount,
      perpSampledLevelsLastTick: perp.lastSampledLevelCount,
      spotSnapshotTickAgeMs: spot.snapshotTickAgeMs,
      perpSnapshotTickAgeMs: perp.snapshotTickAgeMs,
      historySamplerEnabled: spot.historySamplerEnabled && perp.historySamplerEnabled,
      currentOrderbookOnly:
        spot.coverageMs < 30_000 &&
        perp.coverageMs < 30_000 &&
        spot.heatmapCellCount < 200 &&
        perp.heatmapCellCount < 200,
    });
  }, 2_000);
}

export function logBookmapMarketStateDiagnostics(
  symbol: string,
  exchange: string,
  market: BookmapMarketSource,
): void {
  const engine = getBookmapEngine(symbol, exchange, market);
  const state = engine.getCurrentState({ includeStale: true });
  if (process.env.NODE_ENV === "production") return;
  console.debug("[BOOKMAP_MARKET_STATE]", {
    market,
    symbol: engine.symbol,
    exchange: engine.exchange,
    bids: state.bids.length,
    asks: state.asks.length,
    heatmapCells: state.heatmapCells.length,
    importantWalls: state.importantWalls.length,
    structuralWalls: state.structuralWalls.length,
    majorWalls: state.majorWalls.length,
    timestamp: state.timestamp,
  });
}
