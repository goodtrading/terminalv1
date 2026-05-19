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
const STALE_MS = 5 * 60 * 1000;
/** Keep stale non-wall depth for last-known DOM / COB (Bookmap-style far depth). */
const STALE_DEPTH_RETENTION_MS = 30 * 60 * 1000;
const HEATMAP_RETENTION_MS = 90 * 60 * 1000;
const MAX_HEATMAP_CELLS = 250_000;
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
  private lastTimestamp = 0;
  private lastLogAt = 0;

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
    if (DEBUG) console.debug("[BookmapEngine] reset", { symbol: this.symbol, exchange: this.exchange });
  }

  hasData(): boolean {
    return this.levels.size > 0 || this.heatmapCells.size > 0;
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
    const cutoff = now - HEATMAP_RETENTION_MS;
    for (const [key, cell] of Array.from(this.heatmapCells.entries())) {
      if (cell.timeBucket < cutoff) this.heatmapCells.delete(key);
    }

    if (this.heatmapCells.size <= MAX_HEATMAP_CELLS) return;

    const sorted = Array.from(this.heatmapCells.entries()).sort(
      (a, b) => a[1].timeBucket - b[1].timeBucket,
    );
    const drop = sorted.length - MAX_HEATMAP_CELLS;
    for (let i = 0; i < drop; i++) {
      this.heatmapCells.delete(sorted[i]![0]);
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
