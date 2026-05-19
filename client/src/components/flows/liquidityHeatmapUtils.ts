import { HEATMAP_MAJOR_WALL_BTC, normalizeHeatmapSide } from "@/lib/heatmapWallConfig";

export { HEATMAP_MAJOR_WALL_BTC };

export const HEATMAP_MIN_VISIBLE_BTC = 1;
/** Ultra-low floor — paint texture; not the user “Min” highlight threshold. */
export const HEATMAP_RENDER_FLOOR_BTC = 0.05;
export const HEATMAP_MIN_SIZE_OPTIONS = [1, 2, 5, 10, 25, 50, 100] as const;
export const MAX_LIQUIDITY_SNAPSHOTS = 300;
/** Real-time orderbook snapshots (not candle timeframes). */
export const SNAPSHOT_INTERVAL_MS = 500;
export const SNAPSHOT_THROTTLE_MS = SNAPSHOT_INTERVAL_MS;
export const TRADE_BUBBLE_MIN_BTC = 0.5;
export const DEFAULT_RANGE_PCT = 0.035;
export const AUTO_FIT_RANGE_PCT = 0.025;
export const MAX_LEVELS_PER_SNAPSHOT = 1200;
/** Ignore dust below this when normalizing (still keeps sub-1 BTC levels). */
export const DUST_MIN_BTC = 0.000_000_1;

export type OrderbookLevel = {
  price: number;
  sizeBtc: number;
  side: "bid" | "ask";
};

export type LiquiditySnapshot = {
  ts: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
};

export type HeatmapTrade = {
  id?: string;
  price: number;
  sizeBtc: number;
  side: "buy" | "sell";
  /** Unix ms */
  ts: number;
};

export type HeatmapPipelineStats = {
  rawBids: number;
  rawAsks: number;
  normalizedBids: number;
  normalizedAsks: number;
  visibleBids: number;
  visibleAsks: number;
  /** @deprecated Use renderedHeatmap */
  heatmapLevels: number;
  renderedHeatmap: number;
  aboveMinHeatmap: number;
  majorWallsHeatmap: number;
  majorWallsRaw: number;
  majorWallsVisible: number;
  domBuckets: number;
  nonZeroBidBuckets: number;
  nonZeroAskBuckets: number;
};

export function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Binance [price, qty] or object — qty is BTC for BTCUSDT (never divide by spot). */
export function normalizeRawLevel(
  raw: unknown,
  side: "bid" | "ask",
): OrderbookLevel | null {
  let price = 0;
  let sizeBtc = 0;

  if (Array.isArray(raw) && raw.length >= 2) {
    price = Number(raw[0]);
    sizeBtc = Number(raw[1]);
  } else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    price = safeNumber(o.price ?? o.px ?? o.level);
    const resolvedSide = normalizeHeatmapSide(o.side) ?? side;
    if (resolvedSide !== side) return null;
    sizeBtc = safeNumber(
      o.sizeBtc ??
        o.btcSize ??
        o.quantity ??
        o.qty ??
        o.size ??
        o.amount,
    );
  } else {
    return null;
  }

  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(sizeBtc) || sizeBtc <= DUST_MIN_BTC) return null;

  return { price, sizeBtc, side };
}

export function parseRawBookSide(
  rows: unknown[],
  side: "bid" | "ask",
): OrderbookLevel[] {
  const out: OrderbookLevel[] = [];
  for (const row of rows) {
    const level = normalizeRawLevel(row, side);
    if (level) out.push(level);
  }
  if (side === "bid") {
    out.sort((a, b) => b.price - a.price);
  } else {
    out.sort((a, b) => a.price - b.price);
  }
  return out.slice(0, MAX_LEVELS_PER_SNAPSHOT);
}

export function buildSnapshotFromRaw(raw: {
  bids: unknown[];
  asks: unknown[];
  timestamp?: number;
}): LiquiditySnapshot {
  return {
    ts: raw.timestamp ?? Date.now(),
    bids: parseRawBookSide(raw.bids ?? [], "bid"),
    asks: parseRawBookSide(raw.asks ?? [], "ask"),
  };
}

/** Mid from best bid / best ask when ticker spot is unavailable (sorted: bids desc, asks asc). */
export function getBookMidFromSnapshot(snapshot: LiquiditySnapshot | undefined): number | null {
  if (!snapshot?.bids?.length || !snapshot?.asks?.length) return null;
  const bestBid = snapshot.bids[0]?.price;
  const bestAsk = snapshot.asks[0]?.price;
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
    return null;
  }
  if (bestAsk < bestBid) return null;
  return (bestBid + bestAsk) / 2;
}

/** Spot-centered window — do not expand to full book min/max. */
export function computePriceRange(
  spot: number | null,
  autoFit: boolean,
): { minPrice: number; maxPrice: number } {
  const mid = spot && spot > 0 ? spot : null;
  const rangePct = autoFit ? AUTO_FIT_RANGE_PCT : DEFAULT_RANGE_PCT;

  if (mid == null) {
    const fallback = 70_000;
    return {
      minPrice: fallback * (1 - DEFAULT_RANGE_PCT),
      maxPrice: fallback * (1 + DEFAULT_RANGE_PCT),
    };
  }

  return {
    minPrice: mid * (1 - rangePct),
    maxPrice: mid * (1 + rangePct),
  };
}

export function filterLevelsByPrice(
  levels: OrderbookLevel[],
  minPrice: number,
  maxPrice: number,
): OrderbookLevel[] {
  return levels.filter((l) => l.price >= minPrice && l.price <= maxPrice);
}

/** What actually gets drawn on the canvas (floor or major-only hard cut). */
export function filterHeatmapForRender(
  levels: OrderbookLevel[],
  majorWallsOnly: boolean,
): OrderbookLevel[] {
  if (majorWallsOnly) {
    return levels.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC);
  }
  return levels.filter((l) => l.sizeBtc >= HEATMAP_RENDER_FLOOR_BTC);
}

/** @deprecated Use filterHeatmapForRender — minSize must not cull texture. */
export function filterHeatmapLevels(
  levels: OrderbookLevel[],
  _minSizeBtc: number,
  majorWallsOnly: boolean,
): OrderbookLevel[] {
  return filterHeatmapForRender(levels, majorWallsOnly);
}

export function percentile(values: number[], p: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx] ?? 0;
}

export function normalizeLiquidityIntensity(
  sizeBtc: number,
  maxForIntensity: number,
): number {
  if (!Number.isFinite(sizeBtc) || sizeBtc <= 0) return 0;
  if (!Number.isFinite(maxForIntensity) || maxForIntensity <= 0) return 0;
  return Math.max(0, Math.min(1, Math.pow(sizeBtc / maxForIntensity, 0.55)));
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Bookmap thermal ramp: dark blue → cyan → amber → red. */
export function getBookmapHeatColor(
  intensity: number,
  alphaBoost = 1,
  isMajor = false,
): string {
  const t = Math.max(0, Math.min(1, intensity));
  let r: number;
  let g: number;
  let b: number;

  if (t < 0.25) {
    const u = t / 0.25;
    r = lerpChannel(10, 30, u);
    g = lerpChannel(22, 74, u);
    b = lerpChannel(40, 122, u);
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    r = lerpChannel(30, 34, u);
    g = lerpChannel(74, 211, u);
    b = lerpChannel(122, 238, u);
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    r = lerpChannel(34, 251, u);
    g = lerpChannel(211, 191, u);
    b = lerpChannel(238, 36, u);
  } else {
    const u = (t - 0.75) / 0.25;
    r = lerpChannel(251, 239, u);
    g = lerpChannel(191, 68, u);
    b = lerpChannel(36, 68, u);
  }

  let alpha = (0.28 + t * 0.62) * alphaBoost;
  if (isMajor) alpha = Math.min(1, alpha * 1.15 + 0.12);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function computeMaxIntensityFromSizes(
  sizes: number[],
  minVisibleBtc: number,
): number {
  const p95 = percentile(sizes, 0.95);
  return Math.max(p95, minVisibleBtc, 0.1);
}

export function countMajorWallsInLevels(levels: OrderbookLevel[]): number {
  return levels.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC).length;
}

export function computePipelineStats(
  latest: LiquiditySnapshot | undefined,
  minPrice: number,
  maxPrice: number,
  minVisibleBtc: number,
  majorWallsOnly: boolean,
  rawBidCount = 0,
  rawAskCount = 0,
): HeatmapPipelineStats {
  const emptyDom = {
    domBuckets: 0,
    nonZeroBidBuckets: 0,
    nonZeroAskBuckets: 0,
  };

  if (!latest) {
    return {
      rawBids: rawBidCount,
      rawAsks: rawAskCount,
      normalizedBids: 0,
      normalizedAsks: 0,
      visibleBids: 0,
      visibleAsks: 0,
      heatmapLevels: 0,
      renderedHeatmap: 0,
      aboveMinHeatmap: 0,
      majorWallsHeatmap: 0,
      majorWallsRaw: 0,
      majorWallsVisible: 0,
      ...emptyDom,
    };
  }

  const visibleBids = filterLevelsByPrice(latest.bids, minPrice, maxPrice);
  const visibleAsks = filterLevelsByPrice(latest.asks, minPrice, maxPrice);
  const renderedBids = filterHeatmapForRender(visibleBids, majorWallsOnly);
  const renderedAsks = filterHeatmapForRender(visibleAsks, majorWallsOnly);
  const aboveMin =
    visibleBids.filter((l) => l.sizeBtc >= minVisibleBtc).length +
    visibleAsks.filter((l) => l.sizeBtc >= minVisibleBtc).length;
  const majorHeatmap =
    renderedBids.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC).length +
    renderedAsks.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC).length;
  const rendered = renderedBids.length + renderedAsks.length;
  const allNorm = [...latest.bids, ...latest.asks];

  return {
    rawBids: rawBidCount,
    rawAsks: rawAskCount,
    normalizedBids: latest.bids.length,
    normalizedAsks: latest.asks.length,
    visibleBids: visibleBids.length,
    visibleAsks: visibleAsks.length,
    heatmapLevels: rendered,
    renderedHeatmap: rendered,
    aboveMinHeatmap: aboveMin,
    majorWallsHeatmap: majorHeatmap,
    majorWallsRaw: countMajorWallsInLevels(allNorm),
    majorWallsVisible: countMajorWallsInLevels([...visibleBids, ...visibleAsks]),
    ...emptyDom,
  };
}

export function getLiquidityColor(
  side: "bid" | "ask",
  sizeBtc: number,
  maxSizeBtc: number,
  isMajor: boolean,
): string {
  const intensity = Math.min(sizeBtc / Math.max(maxSizeBtc, 0.01), 1);
  const alpha = isMajor
    ? 0.45 + intensity * 0.55
    : 0.22 + intensity * 0.68;

  if (side === "bid") {
    return `rgba(0, 220, 140, ${alpha})`;
  }
  return `rgba(255, 70, 70, ${alpha})`;
}

export function formatHeatmapPrice(price: number): string {
  if (!Number.isFinite(price)) return "—";
  if (price >= 1000) return `${(price / 1000).toFixed(1)}k`;
  return price.toFixed(0);
}
