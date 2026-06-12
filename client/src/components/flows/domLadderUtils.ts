import type { OrderbookLevel } from "./liquidityHeatmapUtils";
import {
  BOOKMAP_BTCUSDT_TICK_SIZE,
  BOOKMAP_DOM_FULL_DEPTH_DIAG,
  BOOKMAP_DOM_MAX_SCAFFOLD_ROWS,
  BOOKMAP_BINANCE_RAW_DOM_SOURCE_DIAG,
  BOOKMAP_DOM_VALUE_MAPPING_DIAG,
  BOOKMAP_FULL_RAW_DOM_LADDER_DIAG,
  BOOKMAP_RAW_DOM_ROW_HEIGHT_PX,
  BOOKMAP_RAW_DOM_STABILITY_DIAG,
  useDesktopFullRawDomLadder,
} from "@/lib/bookmapEngineConfig";
import type { DepthRangePreset } from "@/lib/bookmapDepthRange";
import {
  filterHeatmapForRender,
  filterLevelsByPrice,
  HEATMAP_MAJOR_WALL_BTC,
  type HeatmapPipelineStats,
} from "./liquidityHeatmapUtils";
import {
  BOOKMAP_PLOT_PAD,
  priceToY,
  type PriceRange,
} from "./bookmapViewportUtils";

export const DEFAULT_PRICE_STEP = 10;

/** Fixed ladder / DOM row height (Bookmap-style; do not compress to fit range). */
export const DOM_ROW_HEIGHT = 22;

/** DOM / ladder numeric labels — fixed size, no scaling. */
export const DOM_FONT_CLASS =
  "font-mono tabular-nums text-[13px] font-semibold leading-tight whitespace-nowrap text-[#f2f6f8]";

export function snapLadderCenter(centerPrice: number, priceStep: number): number {
  return bucketPrice(centerPrice, Math.max(1, priceStep));
}

/**
 * Visible ladder prices, high → low (top → bottom), centered on `centerPrice`.
 * `visibleRowCount` rows; spacing in the heatmap should match `(plotH / max(1, visibleRowCount - 1)) ≈ DOM_ROW_HEIGHT`.
 */
export function buildVisibleLadderPrices(
  centerPrice: number,
  visibleRowCount: number,
  priceStep: number,
): number[] {
  return buildViewportLadderWindow(centerPrice, visibleRowCount, priceStep).prices;
}

/**
 * Fixed-row viewport: `halfRows = floor(n/2)`, bucketed center, symmetric span.
 * Always yields exactly `n` prices (high → low).
 */
export function buildViewportLadderWindow(
  effectiveCenterPrice: number,
  visibleRowCount: number,
  priceStep: number,
): { prices: number[]; minPrice: number; maxPrice: number } {
  const step = Math.max(1, priceStep);
  const n = Math.max(1, Math.floor(visibleRowCount));
  const halfRows = Math.floor(n / 2);
  const centerBucket = snapLadderCenter(effectiveCenterPrice, step);
  const maxPrice = centerBucket + halfRows * step;
  const minPrice = maxPrice - (n - 1) * step;
  const prices: number[] = [];
  for (let i = 0; i < n; i++) {
    prices.push(maxPrice - i * step);
  }
  return { prices, minPrice, maxPrice };
}

export function viewportRangeFromLadderPrices(prices: number[]): PriceRange | null {
  if (!prices.length) return null;
  let minP = prices[0];
  let maxP = prices[0];
  for (const p of prices) {
    minP = Math.min(minP, p);
    maxP = Math.max(maxP, p);
  }
  return { minPrice: minP, maxPrice: maxP };
}

export function computeViewportRowCount(plotHeight: number, rowHeight = DOM_ROW_HEIGHT): number {
  if (plotHeight < rowHeight) return 5;
  return Math.max(5, Math.floor(plotHeight / rowHeight));
}

/** Minimum vertical gap between price labels on the ladder (Bookmap-style). */
export const MIN_LABEL_GAP_PX = 20;
/** DOM numeric labels only when row has enough vertical space. */
export const MIN_DOM_TEXT_GAP_PX = 12;
/** Minimum bucket height to draw a subtle tick on the ladder. */
export const MIN_TICK_GAP_PX = 2;

export type LadderLabelDensity = {
  labelEvery: number;
  labelStep: number;
  maxLabels: number;
};

export type DomWallTier = "important" | "structural" | "major";

export type DomWallEntry = {
  price: number;
  bucketedPrice: number;
  side: "bid" | "ask";
  wallSize: number;
  wallTier: DomWallTier;
  wallIsStale: boolean;
};

export type DomLiquidityState = "none" | "live" | "lastKnown" | "wall";

export type DomDepthTier = "none" | "important" | "structural" | "major";

export type DomEngineBookLevel = {
  price: number;
  size: number;
  side: "bid" | "ask";
  maxSeenSize: number;
  stale: boolean;
  isImportant?: boolean;
  isStructural?: boolean;
  isMajor?: boolean;
};

export type DomHeatmapCellRef = {
  price: number;
  side: "bid" | "ask";
  size?: number;
  maxSizeInBucket: number;
  lastSizeInBucket: number;
  lastUpdateTs: number;
};

export type DomEngineBook = {
  bids: DomEngineBookLevel[];
  asks: DomEngineBookLevel[];
  importantWalls?: DomEngineBookLevel[];
  structuralWalls?: DomEngineBookLevel[];
  majorWalls?: DomEngineBookLevel[];
  /** Heatmap time buckets — fills DOM gaps when level map was pruned but cells remain. */
  heatmapCells?: DomHeatmapCellRef[];
};

export interface DomDepthBucket {
  priceBucket: number;
  bidLiveSize: number;
  askLiveSize: number;
  bidLastKnownSize: number;
  askLastKnownSize: number;
  bidWallSize: number;
  askWallSize: number;
  bidTier: DomDepthTier;
  askTier: DomDepthTier;
}

export type DomDepthBucketMapResult = {
  buckets: Map<number, DomDepthBucket>;
  stats: {
    bucketCount: number;
    liveBuckets: number;
    lastKnownBuckets: number;
    wallBuckets: number;
  };
};

type DomBucketWalls = {
  bid?: DomWallEntry;
  ask?: DomWallEntry;
};

export type DomLadderRow = {
  price: number;
  bidSize: number;
  askSize: number;
  bidState: DomLiquidityState;
  askState: DomLiquidityState;
  bidLastKnownSize: number;
  askLastKnownSize: number;
  cobSize: number;
  svpCumulative: number;
  y: number;
  bucketHeight: number;
  barHeight: number;
  isSpotBucket: boolean;
  showLabel: boolean;
  showTick: boolean;
  showDomText: boolean;
  isMajorWall: boolean;
  bidBarPct: number;
  askBarPct: number;
  cobBarPct: number;
  hasLiveBid: boolean;
  hasLiveAsk: boolean;
  hasHistoricalWall: boolean;
  wallSize: number;
  wallSide: "bid" | "ask" | null;
  wallTier: DomWallTier | null;
  wallIsStale: boolean;
  wallBid?: DomWallEntry;
  wallAsk?: DomWallEntry;
  /** Exact exchange price label for raw Binance DOM rows. */
  priceLabel?: string;
};

export type DomScaffoldStats = {
  ladderRows: number;
  liveRows: number;
  lastKnownRows: number;
  wallRows: number;
  expectedDomRowCount: number;
  zeroLiquidityRows: number;
  rowsWithBidLiquidity: number;
  rowsWithAskLiquidity: number;
  rawBidLevelsCount: number;
  rawAskLevelsCount: number;
  aggregatedBidLevelsCount: number;
  aggregatedAskLevelsCount: number;
  domUsesContinuousLadder: boolean;
};

export type DomFullDepthDiag = {
  selectedDepthMode: string;
  selectedDepthValue: number;
  spotPrice: number | null;
  domRangeMin: number;
  domRangeMax: number;
  domRangeUsd: number;
  domLadderStep: number;
  expectedDomRowCount: number;
  actualDomRowCount: number;
  missingDomRowCount: number;
  rawBidLevelsCount: number;
  rawAskLevelsCount: number;
  aggregatedBidLevelsCount: number;
  aggregatedAskLevelsCount: number;
  rowsWithBidLiquidity: number;
  rowsWithAskLiquidity: number;
  zeroLiquidityRowsRendered: number;
  rowsSkippedByReason: {
    clippedViewport: number;
    zeroHidden: number;
    tooWeak: number;
    outsideRange: number;
    rowCap: number;
    virtualized: number;
  };
  skippedBecauseZero: number;
  skippedBecauseTooWeak: number;
  skippedBecauseOutsideRange: number;
  skippedBecauseRowCap: number;
  skippedBecauseVirtualized: number;
  maxDomRowsCap: number;
  domUsesContinuousLadder: boolean;
  domForcedByHeatmapBucket: boolean;
};

export type FullRawDomLadderDiag = {
  featureEnabled: boolean;
  market: string;
  mode: string;
  rawBidLevelsReceived: number;
  rawAskLevelsReceived: number;
  rawBidLevelsRendered: number;
  rawAskLevelsRendered: number;
  totalRawLevelsRendered: number;
  domRowsTotal: number;
  visibleDomViewportRows: number;
  hiddenBecauseVirtualized: number;
  skippedBecauseAggregation: number;
  skippedBecauseRowCap: number;
  skippedBecauseTooWeak: number;
  skippedBecauseOutsideRange: number;
  skippedBecauseZero: number;
  aggregationEnabled: boolean;
  domUsesRawPrices: boolean;
  domUsesHeatmapBucket: boolean;
  domUsesChartRange: boolean;
  domUsesPriceAxisStep: boolean;
  tickSize: number;
  minRenderedPrice: number | null;
  maxRenderedPrice: number | null;
  currentPriceInsideDom: boolean;
  followMode: boolean;
  scrollOffset: number | null;
  centerRowIndex: number | null;
};

export type RawDomStabilityDiag = {
  rawModeEnabled: boolean;
  rawBidLevelsReceived: number;
  rawAskLevelsReceived: number;
  rawBidRows: number;
  rawAskRows: number;
  mergedRawRows: number;
  syntheticRowsCreated: number;
  zeroOnlyRowsCreated: number;
  rowsFromChartRange: number;
  rowsFromHeatmapBucket: number;
  rowsFromLocalDepth: number;
  rowsVisibleInViewport: number;
  currentPrice: number | null;
  nearestRowToCurrentPrice: number | null;
  currentPriceVisible: boolean;
  followMode: boolean;
  scrollTop: number | null;
  scrollTargetIndex: number | null;
  minRawPrice: number | null;
  maxRawPrice: number | null;
  renderedMinPrice: number | null;
  renderedMaxPrice: number | null;
  invalidRowsDropped: number;
  duplicateRowsDropped: number;
  grayOverlayDetectedOrSource: string | null;
};

export type BinanceRawDomSourceDiag = {
  enabled: boolean;
  selectedDomSource: string;
  selectedMarketMode: string;
  symbol: string;
  feedVenue: string;
  rawBidsReceived: number;
  rawAsksReceived: number;
  rawBidsAfterZeroFilter: number;
  rawAsksAfterZeroFilter: number;
  rawRowsBuilt: number;
  visibleRowsRendered: number;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  first10BidPrices: number[];
  first10AskPrices: number[];
  first10RenderedPrices: number[];
  minRawBidPrice: number | null;
  maxRawBidPrice: number | null;
  minRawAskPrice: number | null;
  maxRawAskPrice: number | null;
  usesScaffoldRows: boolean;
  usesChartRange: boolean;
  usesHeatmapBucket: boolean;
  usesPriceAxisStep: boolean;
  usesChooseDomBucketSize: boolean;
  syntheticZeroRowsCreated: number;
  rowsWithNoBidNoAsk: number;
  roundedRowsDetected: number;
  suspiciousLargePriceStepDetected: boolean;
  currentPriceInsideRenderedWindow: boolean;
  followMode: boolean;
  scrollTop: number | null;
  scrollTargetIndex: number | null;
};

export type DomValueMappingDiag = {
  selectedDomSource: string;
  symbol: string;
  feedVenue: string;
  rawBidsReceived: number;
  rawAsksReceived: number;
  visibleDomRows: number;
  bidRowsMatched: number;
  askRowsMatched: number;
  rowsWithBidOnly: number;
  rowsWithAskOnly: number;
  rowsWithBoth: number;
  rowsWithNoBidNoAsk: number;
  cobRowsMatched: number;
  svpRowsMatched: number;
  unmatchedVisibleRows: number;
  exactPriceMatches: number;
  roundedPriceMatches: number;
  bucketedPriceMatches: number;
  syntheticValuesCreated: number;
  extraPriceColumnEnabled: false;
  rawTableModeEnabled: false;
  bidAskFromRealBook: boolean;
  cobFromRealBook: boolean;
  svpCreatesRows: false;
  priceMappingStep: number;
  first10VisibleRowPrices: number[];
  first10MatchedBidRows: Array<{ price: number; size: number }>;
  first10MatchedAskRows: Array<{ price: number; size: number }>;
  suspiciousFarPriceAttached: boolean;
  suspiciousMirroredValues: number;
};

export type DomPriceAlignmentDiag = {
  enabled: boolean;
  selectedDomSource: string;
  symbol: string;
  venue: string;
  chartVisiblePriceMin: number;
  chartVisiblePriceMax: number;
  chartPriceRangeUsd: number;
  priceToYSource: string;
  domUsesSharedPriceScale: boolean;
  domHasIndependentScroll: boolean;
  domUsesRowIndexY: boolean;
  rawBidLevelsTotal: number;
  rawAskLevelsTotal: number;
  visibleBidLevelsRendered: number;
  visibleAskLevelsRendered: number;
  levelsOutsideChartRange: number;
  bidAskLinesY: { bid: number | null; ask: number | null };
  nearestDomBidY: number | null;
  nearestDomAskY: number | null;
  maxAlignmentErrorPx: number;
  syntheticRowsCreated: number;
  extraPriceColumnEnabled: boolean;
  chartRangeControlsDomVisibility: boolean;
  heatmapBucketControlsDom: boolean;
  localDepthControlsDomRows: boolean;
  svpCreatesDomRows: boolean;
  collapsedVisualGroups: number;
  aggregatedBecausePixelCollision: number;
};

export type DomScaffoldResult = {
  rows: DomLadderRow[];
  stats: DomScaffoldStats;
};

export type PriceLadderRow = {
  price: number;
  y: number;
  bucketHeight: number;
  barHeight: number;
  isSpotBucket: boolean;
  showLabel: boolean;
  showTick: boolean;
};

/** Full-precision Bookmap price label (e.g. 79,120 — never 79.1k). */
export function formatBookmapPrice(price: number): string {
  if (!Number.isFinite(price)) return "—";
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatDomPrice(price: number): string {
  return formatBookmapPrice(price);
}

export function computeLabelDensity(
  priceRange: PriceRange,
  plotHeight: number,
  priceStep: number,
  minLabelGapPx = MIN_LABEL_GAP_PX,
): LadderLabelDensity {
  const span = priceRange.maxPrice - priceRange.minPrice;
  const step = Math.max(1, priceStep);
  const rawStepsCount = Math.max(1, Math.ceil(span / step));
  const maxLabels = Math.max(1, Math.floor(plotHeight / Math.max(minLabelGapPx, 8)));
  const labelEvery = Math.max(1, Math.ceil(rawStepsCount / maxLabels));
  return {
    labelEvery,
    labelStep: step * labelEvery,
    maxLabels,
  };
}

/** Visual label spacing — real buckets stay at `baseStep`. */
export function getAdaptiveLabelStep(params: {
  priceRange: PriceRange;
  plotHeight: number;
  baseStep: number;
  minLabelGapPx?: number;
}): number {
  return computeLabelDensity(
    params.priceRange,
    params.plotHeight,
    params.baseStep,
    params.minLabelGapPx ?? MIN_LABEL_GAP_PX,
  ).labelStep;
}

export function getLabelStep(
  priceRange: PriceRange,
  plotHeight: number,
  baseStep: number,
): number {
  return getAdaptiveLabelStep({ priceRange, plotHeight, baseStep });
}

export type LadderVisualMetrics = {
  labelStep: number;
  labelEvery: number;
  bucketPx: number;
  maxLabels: number;
  totalBuckets: number;
};

export function computeLadderVisualMetrics(
  priceRange: PriceRange,
  plotHeight: number,
  priceStep: number,
): LadderVisualMetrics {
  const step = Math.max(1, priceStep);
  const density = computeLabelDensity(priceRange, plotHeight, step);
  const prices = buildLadderPricesFromRange(priceRange, step);
  const bucketPx =
    plotHeight >= 20 && prices.length > 0
      ? getBucketHeightPx(prices[0], step, priceRange, plotHeight)
      : 0;
  return {
    labelStep: density.labelStep,
    labelEvery: density.labelEvery,
    bucketPx,
    maxLabels: density.maxLabels,
    totalBuckets: prices.length,
  };
}

/** Raw pixel height between adjacent price buckets (no text-size clamp). */
export function getBucketHeightPx(
  price: number,
  step: number,
  priceRange: PriceRange,
  plotHeight: number,
): number {
  const y1 = priceToY(price, priceRange, plotHeight);
  const y2 = priceToY(price - step, priceRange, plotHeight);
  return Math.abs(y2 - y1);
}

export function clampBarHeight(bucketHeight: number, denseLadder = false): number {
  if (!Number.isFinite(bucketHeight) || bucketHeight <= 0) return denseLadder ? 5 : 20;
  if (denseLadder) return Math.max(3, Math.min(16, bucketHeight * 0.92));
  return Math.max(8, Math.min(26, bucketHeight));
}

/** @deprecated Use getBucketHeightPx — kept for callers that expect the name. */
export function getTickRowHeightPx(
  price: number,
  step: number,
  priceRange: PriceRange,
  plotHeight: number,
): number {
  return getBucketHeightPx(price, step, priceRange, plotHeight);
}

export function roundToStep(price: number, step: number): number {
  if (!Number.isFinite(price) || step <= 0) return price;
  return Math.round(price / step) * step;
}

export function bucketPrice(price: number, step: number): number {
  return roundToStep(price, step);
}

/** Aggregate one side into book levels at priceStep buckets (DOM + heatmap). */
export function aggregateSideToBookLevels(
  levels: OrderbookLevel[],
  step: number,
  side: "bid" | "ask",
): OrderbookLevel[] {
  const map = aggregateLevelsByPriceStep(levels, step);
  return Array.from(map.entries())
    .map(([price, sizeBtc]) => ({ price, sizeBtc, side }))
    .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
}

export function aggregateLevelsByPriceStep(
  levels: OrderbookLevel[],
  step: number,
): Map<number, number> {
  const map = new Map<number, number>();

  for (const level of levels) {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);

    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) continue;

    const bucket = bucketPrice(price, step);
    map.set(bucket, (map.get(bucket) ?? 0) + size);
  }

  return map;
}

export function buildLadderPricesFromRange(
  priceRange: PriceRange,
  step: number,
): number[] {
  const startPrice = Math.ceil(priceRange.maxPrice / step) * step;
  const endPrice = Math.floor(priceRange.minPrice / step) * step;
  const prices: number[] = [];

  for (let p = startPrice; p >= endPrice; p -= step) {
    prices.push(p);
    if (prices.length >= BOOKMAP_DOM_MAX_SCAFFOLD_ROWS) break;
  }

  return prices;
}

export function getAutoPriceStep(rangeSpan: number): number {
  if (rangeSpan <= 500) return 5;
  if (rangeSpan <= 1500) return 10;
  if (rangeSpan <= 4000) return 25;
  return 50;
}

type LadderLayoutRow = {
  price: number;
  y: number;
  bucketHeight: number;
  barHeight: number;
  isSpotBucket: boolean;
  showLabel: boolean;
  showTick: boolean;
  showDomText: boolean;
  isMajorWall: boolean;
};

function buildLadderLayout(params: {
  priceRange: PriceRange;
  priceStep: number;
  plotHeight: number;
  spot: number | null;
  cobSizeByPrice?: Map<number, number>;
  majorWallBtc?: number;
  /** When false, DOM shows bars only (narrow panel). */
  showDomNumbers?: boolean;
}): LadderLayoutRow[] {
  const { priceRange, priceStep, plotHeight } = params;
  if (plotHeight < 20) return [];

  const span = priceRange.maxPrice - priceRange.minPrice;
  if (!Number.isFinite(span) || span <= 0) return [];

  const prices = buildLadderPricesFromRange(priceRange, priceStep);
  if (!prices.length) return [];

  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const { labelEvery } = computeLabelDensity(priceRange, plotHeight, priceStep);
  const showDomNumbers = params.showDomNumbers !== false;
  const spotBucket =
    params.spot != null && Number.isFinite(params.spot)
      ? bucketPrice(params.spot, priceStep)
      : null;

  const lastIndex = prices.length - 1;

  return prices.map((price, index) => {
    const bucketHeight = getBucketHeightPx(price, priceStep, priceRange, plotHeight);
    const barHeight = clampBarHeight(bucketHeight);
    const cobSize = params.cobSizeByPrice?.get(price) ?? 0;
    const isSpotBucket = spotBucket != null && price === spotBucket;
    const isMajorWall = cobSize >= majorWallBtc;
    const onLabelGrid = index % labelEvery === 0;
    const showLabel =
      index === 0 ||
      index === lastIndex ||
      onLabelGrid ||
      isSpotBucket;
    const showDomText =
      showDomNumbers &&
      (isSpotBucket ||
        isMajorWall ||
        (bucketHeight >= MIN_DOM_TEXT_GAP_PX && onLabelGrid));
    const showTick = bucketHeight >= MIN_TICK_GAP_PX && !showLabel;

    return {
      price,
      y: priceToY(price, priceRange, plotHeight),
      bucketHeight,
      barHeight,
      isSpotBucket,
      showLabel,
      showTick,
      showDomText,
      isMajorWall,
    };
  });
}

export function buildPriceLadderRows(params: {
  priceRange: PriceRange;
  priceStep: number;
  plotHeight: number;
  spot: number | null;
}): PriceLadderRow[] {
  return buildLadderLayout({
    priceRange: params.priceRange,
    priceStep: params.priceStep,
    plotHeight: params.plotHeight,
    spot: params.spot,
  }).map((row) => ({
    price: row.price,
    y: row.y,
    bucketHeight: row.bucketHeight,
    barHeight: row.barHeight,
    isSpotBucket: row.isSpotBucket,
    showLabel: row.showLabel,
    showTick: row.showTick,
  }));
}

export function computeBookmapPipelineStats(
  latest: { bids: OrderbookLevel[]; asks: OrderbookLevel[] } | undefined,
  minPrice: number,
  maxPrice: number,
  minVisibleBtc: number,
  majorWallsOnly: boolean,
  priceStep: number,
  rawBidCount: number,
  rawAskCount: number,
): HeatmapPipelineStats {
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
      domBuckets: 0,
      nonZeroBidBuckets: 0,
      nonZeroAskBuckets: 0,
    };
  }

  const visibleBids = filterLevelsByPrice(latest.bids, minPrice, maxPrice);
  const visibleAsks = filterLevelsByPrice(latest.asks, minPrice, maxPrice);
  const aggBids = aggregateSideToBookLevels(visibleBids, priceStep, "bid");
  const aggAsks = aggregateSideToBookLevels(visibleAsks, priceStep, "ask");
  const heatmapBids = filterHeatmapForRender(aggBids, majorWallsOnly);
  const heatmapAsks = filterHeatmapForRender(aggAsks, majorWallsOnly);
  const aboveMin =
    aggBids.filter((l) => l.sizeBtc >= minVisibleBtc).length +
    aggAsks.filter((l) => l.sizeBtc >= minVisibleBtc).length;
  const majorHeatmap =
    heatmapBids.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC).length +
    heatmapAsks.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC).length;
  const rendered = heatmapBids.length + heatmapAsks.length;

  const priceRange: PriceRange = { minPrice, maxPrice };
  const ladderPrices = buildLadderPricesFromRange(priceRange, priceStep);
  const bidMap = aggregateLevelsByPriceStep(visibleBids, priceStep);
  const askMap = aggregateLevelsByPriceStep(visibleAsks, priceStep);

  let nonZeroBidBuckets = 0;
  let nonZeroAskBuckets = 0;
  for (const p of ladderPrices) {
    if ((bidMap.get(p) ?? 0) > 0) nonZeroBidBuckets++;
    if ((askMap.get(p) ?? 0) > 0) nonZeroAskBuckets++;
  }

  const allNorm = [...latest.bids, ...latest.asks];
  const major = (levels: OrderbookLevel[]) =>
    levels.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC).length;

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
    majorWallsRaw: major(allNorm),
    majorWallsVisible: major([...visibleBids, ...visibleAsks]),
    domBuckets: ladderPrices.length,
    nonZeroBidBuckets,
    nonZeroAskBuckets,
  };
}

const WALL_TIER_RANK: Record<DomWallTier, number> = {
  important: 1,
  structural: 2,
  major: 3,
};

const DEPTH_TIER_RANK: Record<DomDepthTier, number> = {
  none: 0,
  important: 1,
  structural: 2,
  major: 3,
};

function maxDomDepthTier(a: DomDepthTier, b: DomDepthTier): DomDepthTier {
  return DEPTH_TIER_RANK[a] >= DEPTH_TIER_RANK[b] ? a : b;
}

function domDepthTierFromLevel(level: DomEngineBookLevel): DomDepthTier {
  const t = wallTierFromLevel(level);
  return t ?? "none";
}

/** Merge engine book + wall registries (dedupe by side+price). */
export function mergeEngineBookLevels(book: DomEngineBook): DomEngineBookLevel[] {
  const byKey = new Map<string, DomEngineBookLevel>();
  const ingest = (levels: DomEngineBookLevel[] | undefined) => {
    for (const level of levels ?? []) {
      if (!Number.isFinite(level.price) || level.price <= 0) continue;
      const key = `${level.side}:${level.price}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...level });
        continue;
      }
      const size = Math.max(prev.size, level.size);
      const maxSeenSize = Math.max(prev.maxSeenSize, level.maxSeenSize);
      byKey.set(key, {
        price: level.price,
        side: level.side,
        size,
        maxSeenSize,
        stale: size <= 0 ? prev.stale && level.stale : false,
        isImportant: prev.isImportant || level.isImportant,
        isStructural: prev.isStructural || level.isStructural,
        isMajor: prev.isMajor || level.isMajor,
      });
    }
  };
  ingest(book.bids);
  ingest(book.asks);
  ingest(book.importantWalls);
  ingest(book.structuralWalls);
  ingest(book.majorWalls);
  ingest(heatmapCellsToDomLevels(book.heatmapCells ?? []));
  return Array.from(byKey.values());
}

function emptyDomDepthBucket(priceBucket: number): DomDepthBucket {
  return {
    priceBucket,
    bidLiveSize: 0,
    askLiveSize: 0,
    bidLastKnownSize: 0,
    askLastKnownSize: 0,
    bidWallSize: 0,
    askWallSize: 0,
    bidTier: "none",
    askTier: "none",
  };
}

function applyLevelToDomDepthBucket(
  bucket: DomDepthBucket,
  level: DomEngineBookLevel,
): void {
  const side = level.side;
  const isLive = !level.stale && level.size > 0;
  const lastKnownSize =
    level.stale && level.size > 0
      ? level.size
      : level.maxSeenSize > 0
        ? level.size > 0
          ? level.size
          : level.maxSeenSize
        : 0;
  const tier = domDepthTierFromLevel(level);
  const wallSize = Math.max(level.size, level.maxSeenSize);

  if (isLive) {
    if (side === "bid") bucket.bidLiveSize += level.size;
    else bucket.askLiveSize += level.size;
  } else if (lastKnownSize > 0) {
    if (side === "bid") {
      bucket.bidLastKnownSize = Math.max(bucket.bidLastKnownSize, lastKnownSize);
    } else {
      bucket.askLastKnownSize = Math.max(bucket.askLastKnownSize, lastKnownSize);
    }
  }

  if (tier !== "none" && wallSize > 0) {
    if (side === "bid") {
      if (wallSize > bucket.bidWallSize) bucket.bidWallSize = wallSize;
      bucket.bidTier = maxDomDepthTier(bucket.bidTier, tier);
    } else {
      if (wallSize > bucket.askWallSize) bucket.askWallSize = wallSize;
      bucket.askTier = maxDomDepthTier(bucket.askTier, tier);
    }
  }
}

export type AggregateDomDepthOptions = {
  scaffoldPrices?: number[];
  logBucketMiss?: boolean;
};

/** Single bucket map for DOM / COB from full BookmapEngine depth. */
export function aggregateEngineDomDepthBuckets(
  levels: DomEngineBookLevel[],
  domBucketSize: number,
  priceRange: PriceRange,
  opts?: AggregateDomDepthOptions,
): DomDepthBucketMapResult {
  const step = Math.max(1, domBucketSize);
  const buckets = new Map<number, DomDepthBucket>();
  const scaffoldSet = opts?.scaffoldPrices
    ? new Set(opts.scaffoldPrices)
    : undefined;
  const logMiss = import.meta.env.DEV && opts?.logBucketMiss === true;

  for (const level of levels) {
    const rawBp = bucketPrice(level.price, step);
    if (!isDomLevelInPriceRange(level.price, rawBp, priceRange, step)) continue;

    const { bp, missReason } = resolveDomBucketPrice(
      level.price,
      step,
      priceRange,
      scaffoldSet,
    );

    if (logMiss && missReason && scaffoldSet && !scaffoldSet.has(rawBp)) {
      console.debug("[DOM_BUCKET_MISS]", {
        rawPrice: level.price,
        bucketedPrice: rawBp,
        resolvedBucket: bp,
        domBucketSize: step,
        visibleMinPrice: priceRange.minPrice,
        visibleMaxPrice: priceRange.maxPrice,
        reason: missReason,
        side: level.side,
        maxSeenSize: level.maxSeenSize,
      });
    }

    const slot = buckets.get(bp) ?? emptyDomDepthBucket(bp);
    applyLevelToDomDepthBucket(slot, level);
    buckets.set(bp, slot);
  }

  let liveBuckets = 0;
  let lastKnownBuckets = 0;
  let wallBuckets = 0;
  for (const bucket of Array.from(buckets.values())) {
    if (bucket.bidLiveSize > 0 || bucket.askLiveSize > 0) liveBuckets++;
    if (bucket.bidLastKnownSize > 0 || bucket.askLastKnownSize > 0) {
      lastKnownBuckets++;
    }
    if (
      bucket.bidWallSize > 0 ||
      bucket.askWallSize > 0 ||
      bucket.bidTier !== "none" ||
      bucket.askTier !== "none"
    ) {
      wallBuckets++;
    }
  }

  return {
    buckets,
    stats: {
      bucketCount: buckets.size,
      liveBuckets,
      lastKnownBuckets,
      wallBuckets,
    },
  };
}

export type DomDepthSideDisplay = {
  size: number;
  state: DomLiquidityState;
  lastKnownSize: number;
  wallSize: number;
  tier: DomDepthTier;
};

export function resolveDomDepthSideDisplay(
  bucket: DomDepthBucket | undefined,
  side: "bid" | "ask",
): DomDepthSideDisplay {
  if (!bucket) {
    return { size: 0, state: "none", lastKnownSize: 0, wallSize: 0, tier: "none" };
  }
  const live = side === "bid" ? bucket.bidLiveSize : bucket.askLiveSize;
  const lk = side === "bid" ? bucket.bidLastKnownSize : bucket.askLastKnownSize;
  const wall = side === "bid" ? bucket.bidWallSize : bucket.askWallSize;
  const tier = side === "bid" ? bucket.bidTier : bucket.askTier;

  if (live > 0) {
    return { size: live, state: "live", lastKnownSize: lk, wallSize: wall, tier };
  }
  if (lk > 0) {
    return { size: lk, state: "lastKnown", lastKnownSize: lk, wallSize: wall, tier };
  }
  if (wall > 0 || tier !== "none") {
    const wallDisplay = wall > 0 ? wall : 0;
    return {
      size: wallDisplay,
      state: "wall",
      lastKnownSize: 0,
      wallSize: wallDisplay,
      tier,
    };
  }
  return { size: 0, state: "none", lastKnownSize: 0, wallSize: 0, tier: "none" };
}

function domWallTierToEntryTier(tier: DomDepthTier): DomWallTier | null {
  if (tier === "none") return null;
  return tier;
}

function summarizeLevel(level: DomEngineBookLevel) {
  return {
    price: level.price,
    size: level.size,
    maxSeenSize: level.maxSeenSize,
    stale: level.stale,
    isImportant: level.isImportant,
    isMajor: level.isMajor,
  };
}

/** Dev audit: lower visible book vs DOM buckets (below spot −2% or min..spot). */
export function auditLowerDomDepth(params: {
  visibleMinPrice: number;
  visibleMaxPrice: number;
  domBucketSize: number;
  spot: number | null;
  requestedIncludeStale: boolean;
  engineBook?: DomEngineBook;
}): void {
  if (!import.meta.env.DEV || !params.engineBook) return;
  const spot = params.spot;
  if (spot == null || !Number.isFinite(spot) || spot <= 0) return;

  const lowerCutoff = spot * 0.98;
  const inLowerBand = (p: number) =>
    p >= params.visibleMinPrice &&
    p <= params.visibleMaxPrice &&
    p < lowerCutoff;

  const merged = mergeEngineBookLevels(params.engineBook);
  const lowerBids = merged.filter((l) => l.side === "bid" && inLowerBand(l.price));
  const lowerAsks = merged.filter((l) => l.side === "ask" && inLowerBand(l.price));
  const lowerWalls = [
    ...(params.engineBook.importantWalls ?? []),
    ...(params.engineBook.structuralWalls ?? []),
    ...(params.engineBook.majorWalls ?? []),
  ].filter((l) => inLowerBand(l.price));

  const bidPrices = params.engineBook.bids.map((l) => l.price);
  const askPrices = params.engineBook.asks.map((l) => l.price);

  const priceRange: PriceRange = {
    minPrice: params.visibleMinPrice,
    maxPrice: params.visibleMaxPrice,
  };
  const depth = aggregateEngineDomDepthBuckets(
    merged,
    params.domBucketSize,
    priceRange,
  );

  const lowerBuckets = Array.from(depth.buckets.entries())
    .filter(([p]) => inLowerBand(p))
    .map(([priceBucket, b]) => {
      const bid = resolveDomDepthSideDisplay(b, "bid");
      return {
        priceBucket,
        bidLiveSize: b.bidLiveSize,
        bidLastKnownSize: b.bidLastKnownSize,
        bidWallSize: b.bidWallSize,
        bidState: bid.state,
        tier: b.bidTier,
        displaySize: bid.size,
      };
    })
    .filter((r) => r.displaySize > 0)
    .sort((a, b) => b.displaySize - a.displaySize)
    .slice(0, 20);

  console.debug("[LOWER_DEPTH_AUDIT]", {
    visibleMinPrice: params.visibleMinPrice,
    visibleMaxPrice: params.visibleMaxPrice,
    domBucketSize: params.domBucketSize,
    requestedIncludeStale: params.requestedIncludeStale,
    engineBidsCount: params.engineBook.bids.length,
    engineAsksCount: params.engineBook.asks.length,
    heatmapCellCount: params.engineBook.heatmapCells?.length ?? 0,
    mergedLevelCount: merged.length,
    bidPriceMin: bidPrices.length ? Math.min(...bidPrices) : null,
    bidPriceMax: bidPrices.length ? Math.max(...bidPrices) : null,
    askPriceMin: askPrices.length ? Math.min(...askPrices) : null,
    askPriceMax: askPrices.length ? Math.max(...askPrices) : null,
    lowerBidLevelsCount: lowerBids.length,
    lowerAskLevelsCount: lowerAsks.length,
    lowerWallLevelsCount: lowerWalls.length,
    sampleLowerBids: lowerBids
      .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
      .slice(0, 8)
      .map(summarizeLevel),
    sampleLowerAsks: lowerAsks
      .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
      .slice(0, 8)
      .map(summarizeLevel),
    sampleLowerWalls: lowerWalls
      .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
      .slice(0, 8)
      .map(summarizeLevel),
  });

  console.debug("[LOWER_DOM_BUCKETS_TOP]", lowerBuckets);
}

function wallTierFromLevel(level: {
  isImportant?: boolean;
  isStructural?: boolean;
  isMajor?: boolean;
  size?: number;
  maxSeenSize?: number;
}): DomWallTier | null {
  if (level.isMajor) return "major";
  if (level.isStructural) return "structural";
  if (level.isImportant) return "important";
  const wallSize = Math.max(level.size ?? 0, level.maxSeenSize ?? 0);
  if (wallSize >= HEATMAP_MAJOR_WALL_BTC) return "major";
  if (wallSize >= 150) return "structural";
  if (wallSize >= 100) return "important";
  return null;
}

function referenceBookSize(level: DomEngineBookLevel): number {
  if (level.size > 0) return level.size;
  return level.maxSeenSize > 0 ? level.maxSeenSize : 0;
}

/** Bucket overlaps visible range (half-step padding on each side). */
export function bucketInViewport(bp: number, priceRange: PriceRange, step: number): boolean {
  const half = Math.max(1, step) * 0.5;
  return bp + half >= priceRange.minPrice && bp - half <= priceRange.maxPrice;
}

/** Raw engine price or its bucket overlaps the visible DOM range. */
export function isDomLevelInPriceRange(
  rawPrice: number,
  bucketedPrice: number,
  priceRange: PriceRange,
  step: number,
): boolean {
  if (
    rawPrice >= priceRange.minPrice &&
    rawPrice <= priceRange.maxPrice
  ) {
    return true;
  }
  return bucketInViewport(bucketedPrice, priceRange, step);
}

function resolveDomBucketPrice(
  rawPrice: number,
  step: number,
  priceRange: PriceRange,
  scaffoldSet: Set<number> | undefined,
): { bp: number; missReason?: string } {
  const bp = bucketPrice(rawPrice, step);
  if (!scaffoldSet || scaffoldSet.has(bp)) {
    return { bp };
  }
  if (!isDomLevelInPriceRange(rawPrice, bp, priceRange, step)) {
    return { bp, missReason: "outside_visible_range" };
  }

  let nearest = bp;
  let nearestDist = Infinity;
  for (const p of Array.from(scaffoldSet)) {
    const d = Math.abs(p - rawPrice);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = p;
    }
  }
  if (nearestDist <= step) {
    return {
      bp: nearest,
      missReason: `scaffold_snap ${bp}→${nearest}`,
    };
  }
  return { bp, missReason: `scaffold_missing bucket=${bp}` };
}

/** Peak liquidity from heatmap cells for DOM when book level was pruned. */
export function heatmapCellsToDomLevels(cells: DomHeatmapCellRef[]): DomEngineBookLevel[] {
  const byKey = new Map<string, DomEngineBookLevel>();
  for (const cell of cells) {
    const peak = Math.max(
      cell.maxSizeInBucket,
      cell.lastSizeInBucket,
      cell.size ?? 0,
    );
    if (peak <= 0 || !Number.isFinite(cell.price)) continue;
    const key = `${cell.side}:${cell.price}`;
    const prev = byKey.get(key);
    const maxSeenSize = prev ? Math.max(prev.maxSeenSize, peak) : peak;
    byKey.set(key, {
      price: cell.price,
      size: 0,
      side: cell.side,
      maxSeenSize,
      stale: true,
      isImportant: maxSeenSize >= 100,
      isStructural: maxSeenSize >= 150,
      isMajor: maxSeenSize >= 300,
    });
  }
  return Array.from(byKey.values());
}

/** Engine walls → DOM metadata (not live book sizes). */
export function bookLevelsToDomWallEntries(
  levels: DomEngineBookLevel[],
  domBucketSize: number,
): DomWallEntry[] {
  const step = Math.max(1, domBucketSize);
  const out: DomWallEntry[] = [];
  for (const level of levels) {
    const wallSize = Math.max(level.size ?? 0, level.maxSeenSize ?? 0);
    const tier = wallTierFromLevel({ ...level, maxSeenSize: wallSize });
    if (!tier && wallSize < 100) continue;
    const bp = bucketPrice(level.price, step);
    out.push({
      price: level.price,
      bucketedPrice: bp,
      side: level.side,
      wallSize,
      wallTier: tier ?? "important",
      wallIsStale: Boolean(level.stale),
    });
  }
  return out;
}

function aggregateDomWallsByBucket(
  walls: DomWallEntry[],
  step: number,
  priceRange: PriceRange,
): Map<number, DomBucketWalls> {
  const byPrice = new Map<number, DomBucketWalls>();
  for (const wall of walls) {
    const bp = wall.bucketedPrice ?? bucketPrice(wall.price, step);
    if (!bucketInViewport(bp, priceRange, step)) continue;

    const slot = byPrice.get(bp) ?? {};
    const prev = wall.side === "bid" ? slot.bid : slot.ask;
    if (!prev) {
      if (wall.side === "bid") slot.bid = { ...wall, bucketedPrice: bp, price: bp };
      else slot.ask = { ...wall, bucketedPrice: bp, price: bp };
      byPrice.set(bp, slot);
      continue;
    }
    if (WALL_TIER_RANK[wall.wallTier] > WALL_TIER_RANK[prev.wallTier]) {
      if (wall.side === "bid") slot.bid = { ...wall, bucketedPrice: bp, price: bp };
      else slot.ask = { ...wall, bucketedPrice: bp, price: bp };
    } else if (wall.wallTier === prev.wallTier && wall.wallSize > prev.wallSize) {
      if (wall.side === "bid") slot.bid = { ...wall, bucketedPrice: bp, price: bp };
      else slot.ask = { ...wall, bucketedPrice: bp, price: bp };
    }
    byPrice.set(bp, slot);
  }
  return byPrice;
}

function engineLevelsFromSnapshot(
  bids: OrderbookLevel[],
  asks: OrderbookLevel[],
): DomEngineBookLevel[] {
  const map = (levels: OrderbookLevel[], side: "bid" | "ask"): DomEngineBookLevel[] =>
    levels.map((l) => ({
      price: l.price,
      size: l.sizeBtc,
      side,
      maxSeenSize: l.sizeBtc,
      stale: false,
    }));
  return [...map(bids, "bid"), ...map(asks, "ask")];
}

let lastDomFullDepthDiagMs = 0;
let lastFullRawDomLadderDiagMs = 0;
let lastRawDomStabilityDiagMs = 0;
let lastBinanceRawDomSourceDiagMs = 0;
let lastDomValueMappingDiagMs = 0;

export function emitDomFullDepthDiag(diag: DomFullDepthDiag): void {
  if (!import.meta.env.DEV || !BOOKMAP_DOM_FULL_DEPTH_DIAG) return;
  const now = Date.now();
  if (now - lastDomFullDepthDiagMs < 2_000) return;
  lastDomFullDepthDiagMs = now;
  console.debug("[BOOKMAP_DOM_FULL_DEPTH_DIAG]", diag);
}

export function emitFullRawDomLadderDiag(diag: FullRawDomLadderDiag): void {
  if (!import.meta.env.DEV || !BOOKMAP_FULL_RAW_DOM_LADDER_DIAG) return;
  const now = Date.now();
  if (now - lastFullRawDomLadderDiagMs < 2_000) return;
  lastFullRawDomLadderDiagMs = now;
  console.debug("[BOOKMAP_FULL_RAW_DOM_LADDER_DIAG]", diag);
}

export function emitRawDomStabilityDiag(diag: RawDomStabilityDiag): void {
  if (!import.meta.env.DEV || !BOOKMAP_RAW_DOM_STABILITY_DIAG) return;
  const now = Date.now();
  if (now - lastRawDomStabilityDiagMs < 2_000) return;
  lastRawDomStabilityDiagMs = now;
  console.debug("[BOOKMAP_RAW_DOM_STABILITY_DIAG]", diag);
}

function resolveEngineLevelDisplay(level: DomEngineBookLevel): DomDepthSideDisplay {
  const bucket = emptyDomDepthBucket(level.price);
  applyLevelToDomDepthBucket(bucket, level);
  return resolveDomDepthSideDisplay(bucket, level.side);
}

function ingestSideLevel(
  map: Map<number, DomEngineBookLevel>,
  level: DomEngineBookLevel,
): void {
  if (!Number.isFinite(level.price) || level.price <= 0) return;
  if (level.size <= 0) return;
  const prev = map.get(level.price);
  if (!prev) {
    map.set(level.price, { ...level, stale: false });
    return;
  }
  const size = Math.max(prev.size, level.size);
  const maxSeenSize = Math.max(prev.maxSeenSize, level.maxSeenSize);
  map.set(level.price, {
    price: level.price,
    side: level.side,
    size,
    maxSeenSize,
    stale: false,
    isImportant: prev.isImportant || level.isImportant,
    isStructural: prev.isStructural || level.isStructural,
    isMajor: prev.isMajor || level.isMajor,
  });
}

function snapshotToEngineSide(
  levels: OrderbookLevel[],
  side: "bid" | "ask",
): DomEngineBookLevel[] {
  return levels
    .filter((l) => l.sizeBtc > 0 && Number.isFinite(l.price) && l.price > 0)
    .map((l) => ({
      price: l.price,
      size: l.sizeBtc,
      side,
      maxSeenSize: l.sizeBtc,
      stale: false,
    }));
}

export function formatRawBinanceDomPrice(
  price: number,
  tickSize = BOOKMAP_BTCUSDT_TICK_SIZE,
): string {
  if (!Number.isFinite(price)) return "—";
  const decimals = tickSize >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(tickSize)));
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function normalizeRawDomPriceKey(price: number, tickSize = BOOKMAP_BTCUSDT_TICK_SIZE): string {
  const decimals = tickSize >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(tickSize)));
  return price.toFixed(decimals);
}

function isSuspiciousRoundGrid(prices: number[], minGap = 250): boolean {
  if (prices.length < 4) return false;
  const sample = prices.slice(0, Math.min(12, prices.length));
  let roundGaps = 0;
  for (let i = 1; i < sample.length; i++) {
    const gap = Math.abs(sample[i - 1]! - sample[i]!);
    if (gap >= minGap && gap % 50 === 0) roundGaps++;
  }
  return roundGaps >= 3;
}

export function emitBinanceRawDomSourceDiag(diag: BinanceRawDomSourceDiag): void {
  if (!import.meta.env.DEV || !BOOKMAP_BINANCE_RAW_DOM_SOURCE_DIAG) return;
  const now = Date.now();
  if (now - lastBinanceRawDomSourceDiagMs < 2_000) return;
  lastBinanceRawDomSourceDiagMs = now;
  console.debug("[BOOKMAP_BINANCE_RAW_DOM_SOURCE_DIAG]", diag);
}

function logInvalidDomSyntheticValue(
  price: number,
  side: "bid" | "ask" | "cob",
  displayed: number,
  reason: string,
): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_DOM_INVALID_SYNTHETIC_VALUE]", {
    price,
    side,
    displayed,
    reason,
  });
  console.warn("[BOOKMAP_DOM_VALUE_WITHOUT_BOOK_LEVEL]", {
    price,
    side,
    displayed,
    reason,
  });
}

export function logExtraPriceColumnRegression(present: boolean): void {
  if (!import.meta.env.DEV || !present) return;
  console.warn("[BOOKMAP_DOM_EXTRA_PRICE_COLUMN_REGRESSION]", {
    present: true,
    message: "DOM/COB panel must not render a separate raw PRICE column",
  });
}

function buildExactDepthByPrice(levels: OrderbookLevel[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const level of levels) {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) {
      continue;
    }
    map.set(price, (map.get(price) ?? 0) + size);
  }
  return map;
}

function expectedMappedSizeAtRow(
  rowPrice: number,
  exactMap: Map<number, number>,
  bucketMap: Map<number, number>,
): { size: number; matchKind: "exact" | "bucket" | "none" } {
  const exact = exactMap.get(rowPrice);
  if (exact != null && exact > 0) {
    return { size: exact, matchKind: "exact" };
  }
  const bucket = bucketMap.get(rowPrice) ?? 0;
  if (bucket > 0) {
    return { size: bucket, matchKind: "bucket" };
  }
  return { size: 0, matchKind: "none" };
}

export function emitDomValueMappingDiag(diag: DomValueMappingDiag): void {
  if (!import.meta.env.DEV || !BOOKMAP_DOM_VALUE_MAPPING_DIAG) return;
  const now = Date.now();
  if (now - lastDomValueMappingDiagMs < 2_000) return;
  lastDomValueMappingDiagMs = now;
  console.debug("[BOOKMAP_DOM_VALUE_MAPPING_DIAG]", diag);
}

/**
 * STEP 1.6.5 — Map raw Binance Spot depth onto the existing chart-aligned DOM scaffold.
 * No separate raw price column or scroll table; COB/BID/ASK/SVP attach to ladder rows.
 */
export function buildMappedDomLadderRows(params: {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spot: number | null;
  priceRange: PriceRange;
  priceStep: number;
  plotHeight: number;
  priceToY?: (price: number) => number;
  majorWallBtc?: number;
  showDomNumbers?: boolean;
  walls?: DomWallEntry[];
  depthPreset?: DepthRangePreset;
  selectedDomSource?: string;
  feedVenue?: string;
  symbol?: string;
  tickSize?: number;
}): DomScaffoldResult & { mappingDiag: DomValueMappingDiag } {
  const tickSize = params.tickSize ?? BOOKMAP_BTCUSDT_TICK_SIZE;
  const priceStep = Math.max(tickSize, params.priceStep);
  const rawBids = params.bids ?? [];
  const rawAsks = params.asks ?? [];

  const result = buildScaffoldedDomRows({
    bids: rawBids,
    asks: rawAsks,
    walls: params.walls,
    spot: params.spot,
    priceRange: params.priceRange,
    priceStep,
    plotHeight: params.plotHeight,
    priceToY: params.priceToY,
    majorWallBtc: params.majorWallBtc,
    showDomNumbers: params.showDomNumbers,
    depthPreset: params.depthPreset,
  });

  const exactBidByPrice = buildExactDepthByPrice(rawBids);
  const exactAskByPrice = buildExactDepthByPrice(rawAsks);
  const bucketBids = aggregateLevelsByPriceStep(rawBids, priceStep);
  const bucketAsks = aggregateLevelsByPriceStep(rawAsks, priceStep);

  let bidRowsMatched = 0;
  let askRowsMatched = 0;
  let cobRowsMatched = 0;
  let svpRowsMatched = 0;
  let unmatchedVisibleRows = 0;
  let rowsWithBidOnly = 0;
  let rowsWithAskOnly = 0;
  let rowsWithBoth = 0;
  let rowsWithNoBidNoAsk = 0;
  let exactPriceMatches = 0;
  let bucketedPriceMatches = 0;
  let syntheticValuesCreated = 0;
  const first10MatchedBidRows: Array<{ price: number; size: number }> = [];
  const first10MatchedAskRows: Array<{ price: number; size: number }> = [];
  let suspiciousFarPriceAttached = false;
  const spotPrice =
    params.spot != null && Number.isFinite(params.spot) ? params.spot : null;

  for (const row of result.rows) {
    const bidExpected = expectedMappedSizeAtRow(row.price, exactBidByPrice, bucketBids);
    const askExpected = expectedMappedSizeAtRow(row.price, exactAskByPrice, bucketAsks);

    if (bidExpected.matchKind === "exact") exactPriceMatches++;
    else if (bidExpected.matchKind === "bucket") bucketedPriceMatches++;
    if (askExpected.matchKind === "exact") exactPriceMatches++;
    else if (askExpected.matchKind === "bucket") bucketedPriceMatches++;

    const bidLive = row.bidState === "live" && row.bidSize > 0;
    const askLive = row.askState === "live" && row.askSize > 0;
    if (bidLive && askLive) rowsWithBoth++;
    else if (bidLive) rowsWithBidOnly++;
    else if (askLive) rowsWithAskOnly++;
    else rowsWithNoBidNoAsk++;

    if (bidLive) {
      if (Math.abs(row.bidSize - bidExpected.size) > 1e-8) {
        syntheticValuesCreated++;
        logInvalidDomSyntheticValue(
          row.price,
          "bid",
          row.bidSize,
          "live_bid_not_traceable_to_raw_book",
        );
      } else {
        bidRowsMatched++;
        if (first10MatchedBidRows.length < 10) {
          first10MatchedBidRows.push({ price: row.price, size: row.bidSize });
        }
      }
    }

    if (askLive) {
      if (Math.abs(row.askSize - askExpected.size) > 1e-8) {
        syntheticValuesCreated++;
        logInvalidDomSyntheticValue(
          row.price,
          "ask",
          row.askSize,
          "live_ask_not_traceable_to_raw_book",
        );
      } else {
        askRowsMatched++;
        if (first10MatchedAskRows.length < 10) {
          first10MatchedAskRows.push({ price: row.price, size: row.askSize });
        }
      }
    }

    const expectedCob = bidExpected.size + askExpected.size;
    if (row.cobSize > 0) {
      if (Math.abs(row.cobSize - expectedCob) > 1e-8 && bidLive && askLive) {
        syntheticValuesCreated++;
        logInvalidDomSyntheticValue(
          row.price,
          "cob",
          row.cobSize,
          "cob_not_sum_of_mapped_bid_ask",
        );
      } else if (row.cobSize > 0 && expectedCob > 0) {
        cobRowsMatched++;
      }
    }

    if (row.svpCumulative > 0) svpRowsMatched++;

    if (
      row.bidSize <= 0 &&
      row.askSize <= 0 &&
      row.cobSize <= 0 &&
      !row.hasHistoricalWall
    ) {
      unmatchedVisibleRows++;
    }

    if (
      spotPrice != null &&
      (bidLive || askLive) &&
      Math.abs(row.price - spotPrice) > 8_000
    ) {
      const rawNearRow =
        [...exactBidByPrice.keys(), ...exactAskByPrice.keys()].some(
          (p) => Math.abs(p - row.price) <= priceStep,
        ) ||
        bucketBids.has(row.price) ||
        bucketAsks.has(row.price);
      if (!rawNearRow) {
        suspiciousFarPriceAttached = true;
      }
    }
  }

  const mappingDiag: DomValueMappingDiag = {
    selectedDomSource: params.selectedDomSource ?? "spot",
    symbol: params.symbol ?? "BTCUSDT",
    feedVenue: params.feedVenue ?? "binance_spot",
    rawBidsReceived: rawBids.length,
    rawAsksReceived: rawAsks.length,
    visibleDomRows: result.rows.length,
    bidRowsMatched,
    askRowsMatched,
    rowsWithBidOnly,
    rowsWithAskOnly,
    rowsWithBoth,
    rowsWithNoBidNoAsk,
    cobRowsMatched,
    svpRowsMatched,
    unmatchedVisibleRows,
    exactPriceMatches,
    roundedPriceMatches: 0,
    bucketedPriceMatches,
    syntheticValuesCreated,
    extraPriceColumnEnabled: false,
    rawTableModeEnabled: false,
    bidAskFromRealBook: syntheticValuesCreated === 0,
    cobFromRealBook: syntheticValuesCreated === 0,
    svpCreatesRows: false,
    priceMappingStep: priceStep,
    first10VisibleRowPrices: result.rows.slice(0, 10).map((r) => r.price),
    first10MatchedBidRows,
    first10MatchedAskRows,
    suspiciousFarPriceAttached,
    suspiciousMirroredValues: 0,
  };

  if (import.meta.env.DEV) {
    emitDomValueMappingDiag(mappingDiag);
  }

  return { ...result, mappingDiag };
}

function logInvalidSyntheticRow(price: number, reason: string, source: string): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_RAW_DOM_INVALID_SYNTHETIC_ROW]", { price, reason, source });
  console.warn("[BOOKMAP_RAW_DOM_INVALID_ROW_SOURCE]", { price, reason, source });
  console.warn("[BOOKMAP_RAW_DOM_SYNTHETIC_ZERO_ROW]", { price, reason, source });
}

function logSuspiciousPriceGrid(
  samplePrices: number[],
  medianGap: number,
  reason: string,
): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_RAW_DOM_SUSPICIOUS_PRICE_GRID]", {
    samplePrices,
    medianGap,
    reason,
  });
}

export type RawDomLadderResult = DomScaffoldResult & {
  rawDiag: FullRawDomLadderDiag;
  stabilityDiag: RawDomStabilityDiag;
  sourceDiag: BinanceRawDomSourceDiag;
};

export type PriceAlignedRawDomResult = DomScaffoldResult & {
  alignmentDiag: DomPriceAlignmentDiag;
};

let lastDomPriceAlignmentDiagMs = 0;

function emitDomPriceAlignmentDiag(diag: DomPriceAlignmentDiag): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - lastDomPriceAlignmentDiagMs < 2_000) return;
  lastDomPriceAlignmentDiagMs = now;
  console.debug("[BOOKMAP_DOM_PRICE_ALIGNMENT_DIAG]", diag);
}

function logDomPriceDesync(params: {
  price: number;
  renderedY: number;
  expectedY: number;
  errorPx: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_DOM_PRICE_DESYNC]", params);
}

export function logDomIndependentScrollRegression(params: {
  enabled: boolean;
  reason: string;
}): void {
  if (!import.meta.env.DEV || !params.enabled) return;
  console.warn("[BOOKMAP_DOM_INDEPENDENT_SCROLL_REGRESSION]", params);
}

export function buildPriceAlignedRawDomRows(params: {
  bids?: OrderbookLevel[];
  asks?: OrderbookLevel[];
  spot: number | null;
  priceRange: PriceRange;
  plotHeight: number;
  priceToY: (price: number) => number;
  showDomNumbers?: boolean;
  majorWallBtc?: number;
  selectedDomSource?: string;
  feedVenue?: string;
  market?: string;
  mode?: string;
}): PriceAlignedRawDomResult {
  const showDomNumbers = params.showDomNumbers !== false;
  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const rawBids = params.bids ?? [];
  const rawAsks = params.asks ?? [];
  const minPrice = params.priceRange.minPrice;
  const maxPrice = params.priceRange.maxPrice;
  const inChartRange = (price: number) => price >= minPrice && price <= maxPrice;
  const yBandPx = 8;

  type Slot = {
    price: number;
    ySum: number;
    samples: number;
    bidSize: number;
    askSize: number;
    bidLevels: number;
    askLevels: number;
    hasBidSource: boolean;
    hasAskSource: boolean;
  };

  const slots = new Map<number, Slot>();
  let levelsOutsideChartRange = 0;
  let visibleBidLevelsRendered = 0;
  let visibleAskLevelsRendered = 0;
  let maxAlignmentErrorPx = 0;

  const ingest = (level: OrderbookLevel, side: "bid" | "ask") => {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) return;
    if (!inChartRange(price)) {
      levelsOutsideChartRange += 1;
      return;
    }
    const expectedY = params.priceToY(price);
    if (!Number.isFinite(expectedY)) return;
    const key = Math.round(expectedY / yBandPx);
    const slot = slots.get(key) ?? {
      price,
      ySum: 0,
      samples: 0,
      bidSize: 0,
      askSize: 0,
      bidLevels: 0,
      askLevels: 0,
      hasBidSource: false,
      hasAskSource: false,
    };
    slot.ySum += expectedY;
    slot.samples += 1;
    if (side === "bid") {
      slot.bidSize += size;
      slot.bidLevels += 1;
      slot.hasBidSource = true;
      visibleBidLevelsRendered += 1;
    } else {
      slot.askSize += size;
      slot.askLevels += 1;
      slot.hasAskSource = true;
      visibleAskLevelsRendered += 1;
    }
    if (Math.abs(price - (params.spot ?? price)) < Math.abs(slot.price - (params.spot ?? slot.price))) {
      slot.price = price;
    }
    slots.set(key, slot);
  };

  for (const level of rawBids) ingest(level, "bid");
  for (const level of rawAsks) ingest(level, "ask");

  const sortedSlots = Array.from(slots.values()).sort(
    (a, b) => b.ySum / Math.max(1, b.samples) - a.ySum / Math.max(1, a.samples),
  );

  let maxBid = 0;
  let maxAsk = 0;
  let maxCob = 0;
  for (const slot of sortedSlots) {
    maxBid = Math.max(maxBid, slot.bidSize);
    maxAsk = Math.max(maxAsk, slot.askSize);
    maxCob = Math.max(maxCob, slot.bidSize + slot.askSize);
  }

  let svpRunning = 0;
  let liveRows = 0;
  let rowsWithBidLiquidity = 0;
  let rowsWithAskLiquidity = 0;
  const rows: DomLadderRow[] = sortedSlots.map((slot) => {
    const y = slot.ySum / Math.max(1, slot.samples);
    const expectedY = params.priceToY(slot.price);
    const errorPx = Math.abs(y - expectedY);
    maxAlignmentErrorPx = Math.max(maxAlignmentErrorPx, errorPx);
    if (errorPx > 1) {
      logDomPriceDesync({ price: slot.price, renderedY: y, expectedY, errorPx });
    }
    const bidSize = slot.bidSize;
    const askSize = slot.askSize;
    const hasLiveBid = bidSize > 0;
    const hasLiveAsk = askSize > 0;
    const cobSize = bidSize + askSize;
    svpRunning += cobSize;
    if (hasLiveBid) {
      liveRows += 1;
      rowsWithBidLiquidity += 1;
    }
    if (hasLiveAsk) {
      liveRows += 1;
      rowsWithAskLiquidity += 1;
    }
    const isSpotBucket =
      params.spot != null && Number.isFinite(params.spot)
        ? Math.abs(slot.price - params.spot) <= BOOKMAP_BTCUSDT_TICK_SIZE
        : false;
    return {
      price: slot.price,
      bidSize,
      askSize,
      bidState: hasLiveBid ? "live" : "none",
      askState: hasLiveAsk ? "live" : "none",
      bidLastKnownSize: 0,
      askLastKnownSize: 0,
      cobSize,
      svpCumulative: svpRunning,
      y,
      bucketHeight: yBandPx,
      barHeight: Math.max(5, yBandPx - 1),
      isSpotBucket,
      showLabel: false,
      showTick: false,
      showDomText: showDomNumbers && cobSize > 0,
      isMajorWall: cobSize >= majorWallBtc,
      bidBarPct: maxBid > 0 ? (bidSize / maxBid) * 100 : 0,
      askBarPct: maxAsk > 0 ? (askSize / maxAsk) * 100 : 0,
      cobBarPct: maxCob > 0 ? (cobSize / maxCob) * 100 : 0,
      hasLiveBid,
      hasLiveAsk,
      hasHistoricalWall: false,
      wallSize: 0,
      wallSide: null,
      wallTier: null,
      wallIsStale: false,
    };
  });

  const nearestBid = rows.find((row) => row.hasLiveBid) ?? null;
  const nearestAsk = rows.find((row) => row.hasLiveAsk) ?? null;
  const bestBid = rawBids.find((level) => level.sizeBtc > 0) ?? null;
  const bestAsk = rawAsks.find((level) => level.sizeBtc > 0) ?? null;
  const collapsedVisualGroups = rows.filter(
    (row) => row.hasLiveBid && row.hasLiveAsk,
  ).length;
  const aggregatedBecausePixelCollision = sortedSlots.reduce(
    (sum, slot) => sum + Math.max(0, slot.samples - 1),
    0,
  );

  const alignmentDiag: DomPriceAlignmentDiag = {
    enabled: true,
    selectedDomSource: params.selectedDomSource ?? "spot",
    symbol: params.market ?? "BTCUSDT",
    venue: params.feedVenue ?? "binance_spot",
    chartVisiblePriceMin: minPrice,
    chartVisiblePriceMax: maxPrice,
    chartPriceRangeUsd: maxPrice - minPrice,
    priceToYSource: "BookmapPriceScale.priceToY",
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    domUsesRowIndexY: false,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleBidLevelsRendered,
    visibleAskLevelsRendered,
    levelsOutsideChartRange,
    bidAskLinesY: {
      bid: bestBid && inChartRange(bestBid.price) ? params.priceToY(bestBid.price) : null,
      ask: bestAsk && inChartRange(bestAsk.price) ? params.priceToY(bestAsk.price) : null,
    },
    nearestDomBidY: nearestBid?.y ?? null,
    nearestDomAskY: nearestAsk?.y ?? null,
    maxAlignmentErrorPx,
    syntheticRowsCreated: 0,
    extraPriceColumnEnabled: false,
    chartRangeControlsDomVisibility: true,
    heatmapBucketControlsDom: false,
    localDepthControlsDomRows: false,
    svpCreatesDomRows: false,
    collapsedVisualGroups,
    aggregatedBecausePixelCollision,
  };

  emitDomPriceAlignmentDiag(alignmentDiag);

  return {
    rows,
    stats: {
      ladderRows: rows.length,
      liveRows,
      lastKnownRows: 0,
      wallRows: 0,
      expectedDomRowCount: rows.length,
      zeroLiquidityRows: 0,
      rowsWithBidLiquidity,
      rowsWithAskLiquidity,
      rawBidLevelsCount: rawBids.length,
      rawAskLevelsCount: rawAsks.length,
      aggregatedBidLevelsCount: aggregatedBecausePixelCollision,
      aggregatedAskLevelsCount: aggregatedBecausePixelCollision,
      domUsesContinuousLadder: false,
    },
    alignmentDiag,
  };
}

/**
 * STEP 1.6.4 — Strict Binance Spot raw DOM: rows ONLY from live bid/ask arrays.
 */
export function buildRawDomLadderRows(params: {
  bids?: OrderbookLevel[];
  asks?: OrderbookLevel[];
  spot: number | null;
  showDomNumbers?: boolean;
  majorWallBtc?: number;
  tickSize?: number;
  market?: string;
  mode?: string;
  selectedDomSource?: string;
  feedVenue?: string;
  followMode?: boolean;
  viewportHeight?: number;
  scrollTop?: number;
  centerPrice?: number | null;
  scrollTargetIndex?: number | null;
}): RawDomLadderResult {
  const emptyStats: DomScaffoldStats = {
    ladderRows: 0,
    liveRows: 0,
    lastKnownRows: 0,
    wallRows: 0,
    expectedDomRowCount: 0,
    zeroLiquidityRows: 0,
    rowsWithBidLiquidity: 0,
    rowsWithAskLiquidity: 0,
    rawBidLevelsCount: 0,
    rawAskLevelsCount: 0,
    aggregatedBidLevelsCount: 0,
    aggregatedAskLevelsCount: 0,
    domUsesContinuousLadder: false,
  };

  const tickSize = params.tickSize ?? BOOKMAP_BTCUSDT_TICK_SIZE;
  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const showDomNumbers = params.showDomNumbers !== false;
  const rowHeight = BOOKMAP_RAW_DOM_ROW_HEIGHT_PX;

  type RawRowSlot = {
    price: number;
    priceLabel: string;
    bidSize: number;
    askSize: number;
    hasBidSource: boolean;
    hasAskSource: boolean;
  };

  const rawRowsByPrice = new Map<string, RawRowSlot>();
  let duplicateRowsDropped = 0;
  let invalidRowsDropped = 0;

  const ingestRawLevel = (level: OrderbookLevel, side: "bid" | "ask") => {
    if (!Number.isFinite(level.price) || level.price <= 0) {
      invalidRowsDropped++;
      return;
    }
    if (!Number.isFinite(level.sizeBtc) || level.sizeBtc <= 0) {
      invalidRowsDropped++;
      return;
    }
    const priceKey = normalizeRawDomPriceKey(level.price, tickSize);
    const existing = rawRowsByPrice.get(priceKey);
    if (existing) {
      duplicateRowsDropped++;
      if (side === "bid") {
        existing.bidSize = level.sizeBtc;
        existing.hasBidSource = true;
      } else {
        existing.askSize = level.sizeBtc;
        existing.hasAskSource = true;
      }
      return;
    }
    rawRowsByPrice.set(priceKey, {
      price: level.price,
      priceLabel: formatRawBinanceDomPrice(level.price, tickSize),
      bidSize: side === "bid" ? level.sizeBtc : 0,
      askSize: side === "ask" ? level.sizeBtc : 0,
      hasBidSource: side === "bid",
      hasAskSource: side === "ask",
    });
  };

  const rawBidsReceived = params.bids?.length ?? 0;
  const rawAsksReceived = params.asks?.length ?? 0;
  for (const level of params.bids ?? []) ingestRawLevel(level, "bid");
  for (const level of params.asks ?? []) ingestRawLevel(level, "ask");

  const rawBidLevelsReceived = [...rawRowsByPrice.values()].filter((r) => r.hasBidSource).length;
  const rawAskLevelsReceived = [...rawRowsByPrice.values()].filter((r) => r.hasAskSource).length;

  const sortedSlots = [...rawRowsByPrice.values()]
    .filter((slot) => slot.bidSize > 0 || slot.askSize > 0)
    .sort((a, b) => b.price - a.price);

  const bidPrices = sortedSlots.filter((s) => s.bidSize > 0).map((s) => s.price);
  const askPrices = sortedSlots.filter((s) => s.askSize > 0).map((s) => s.price);
  const bestBidPrice = bidPrices.length ? Math.max(...bidPrices) : null;
  const bestAskPrice = askPrices.length ? Math.min(...askPrices) : null;

  const minRawBidPrice = bidPrices.length ? Math.min(...bidPrices) : null;
  const maxRawBidPrice = bidPrices.length ? Math.max(...bidPrices) : null;
  const minRawAskPrice = askPrices.length ? Math.min(...askPrices) : null;
  const maxRawAskPrice = askPrices.length ? Math.max(...askPrices) : null;

  let maxBid = 0;
  let maxAsk = 0;
  let maxCob = 0;
  for (const slot of sortedSlots) {
    maxBid = Math.max(maxBid, slot.bidSize);
    maxAsk = Math.max(maxAsk, slot.askSize);
    maxCob = Math.max(maxCob, slot.bidSize + slot.askSize);
  }

  const spotPrice =
    params.spot != null && Number.isFinite(params.spot) ? params.spot : null;
  const centerPrice =
    params.centerPrice != null && Number.isFinite(params.centerPrice)
      ? params.centerPrice
      : bestBidPrice != null && bestAskPrice != null
        ? (bestBidPrice + bestAskPrice) / 2
        : spotPrice ?? bestBidPrice ?? bestAskPrice;

  let svpRunning = 0;
  let liveRows = 0;
  let rowsWithBidLiquidity = 0;
  let rowsWithAskLiquidity = 0;
  let rawBidRows = 0;
  let rawAskRows = 0;
  let rowsWithNoBidNoAsk = 0;
  let rowsWithBidOnly = 0;
  let rowsWithAskOnly = 0;
  let rowsWithBoth = 0;

  const rows: DomLadderRow[] = sortedSlots.map((slot, index) => {
    const bidSize = slot.bidSize;
    const askSize = slot.askSize;
    const hasLiveBid = bidSize > 0;
    const hasLiveAsk = askSize > 0;
    const cobSize = bidSize + askSize;

    if (!hasLiveBid && !hasLiveAsk) {
      rowsWithNoBidNoAsk++;
      logInvalidSyntheticRow(slot.price, "no_bid_no_ask", "strict_binance_raw_dom");
    }
    if (hasLiveBid && hasLiveAsk) rowsWithBoth++;
    else if (hasLiveBid) rowsWithBidOnly++;
    else if (hasLiveAsk) rowsWithAskOnly++;
    if (hasLiveBid) {
      rawBidRows++;
      rowsWithBidLiquidity++;
      liveRows++;
    }
    if (hasLiveAsk) {
      rawAskRows++;
      rowsWithAskLiquidity++;
      liveRows++;
    }

    svpRunning += cobSize;

    const isSpotBucket =
      centerPrice != null && Math.abs(slot.price - centerPrice) <= tickSize;
    const isBestBid = bestBidPrice != null && slot.price === bestBidPrice && hasLiveBid;
    const isBestAsk = bestAskPrice != null && slot.price === bestAskPrice && hasLiveAsk;

    return {
      price: slot.price,
      priceLabel: slot.priceLabel,
      bidSize,
      askSize,
      bidState: hasLiveBid ? ("live" as const) : ("none" as const),
      askState: hasLiveAsk ? ("live" as const) : ("none" as const),
      bidLastKnownSize: 0,
      askLastKnownSize: 0,
      cobSize,
      svpCumulative: svpRunning,
      y: index * rowHeight + rowHeight / 2,
      bucketHeight: rowHeight,
      barHeight: rowHeight,
      isSpotBucket: isSpotBucket || isBestBid || isBestAsk,
      showLabel: true,
      showTick: false,
      showDomText: showDomNumbers && (hasLiveBid || hasLiveAsk),
      isMajorWall: cobSize >= majorWallBtc,
      bidBarPct: maxBid > 0 ? (bidSize / maxBid) * 100 : 0,
      askBarPct: maxAsk > 0 ? (askSize / maxAsk) * 100 : 0,
      cobBarPct: maxCob > 0 ? (cobSize / maxCob) * 100 : 0,
      hasLiveBid,
      hasLiveAsk,
      hasHistoricalWall: false,
      wallSize: 0,
      wallSide: null,
      wallTier: null,
      wallIsStale: false,
    };
  });

  const renderedPrices = rows.map((r) => r.price);
  const suspiciousLargePriceStepDetected = isSuspiciousRoundGrid(renderedPrices);
  if (suspiciousLargePriceStepDetected && renderedPrices.length >= 4) {
    const gaps: number[] = [];
    for (let i = 1; i < Math.min(12, renderedPrices.length); i++) {
      gaps.push(Math.abs(renderedPrices[i - 1]! - renderedPrices[i]!));
    }
    gaps.sort((a, b) => a - b);
    const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 0;
    logSuspiciousPriceGrid(
      renderedPrices.slice(0, 10),
      medianGap,
      "rendered_dom_prices_have_large_round_gaps",
    );
  }

  for (const row of rows) {
    if (row.bidSize <= 0 && row.askSize <= 0) {
      logInvalidSyntheticRow(row.price, "zero_only_row_rendered", "strict_binance_raw_dom");
    }
  }

  const viewportHeight = params.viewportHeight ?? 0;
  const scrollTop = params.scrollTop ?? 0;
  const visibleDomViewportRows =
    viewportHeight > 0
      ? Math.min(rows.length, Math.ceil(viewportHeight / rowHeight) + 1)
      : rows.length;
  const hiddenBecauseVirtualized = Math.max(0, rows.length - visibleDomViewportRows);

  let centerRowIndex: number | null = params.scrollTargetIndex ?? null;
  if (centerRowIndex == null && centerPrice != null && rows.length > 0) {
    let bestDist = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(rows[i]!.price - centerPrice);
      if (d < bestDist) {
        bestDist = d;
        centerRowIndex = i;
      }
    }
  }

  const minRenderedPrice = renderedPrices.length ? renderedPrices[renderedPrices.length - 1]! : null;
  const maxRenderedPrice = renderedPrices.length ? renderedPrices[0]! : null;
  const nearestRowToCurrentPrice =
    centerRowIndex != null && rows[centerRowIndex]
      ? rows[centerRowIndex]!.price
      : null;
  const currentPriceInsideDom =
    centerPrice != null &&
    minRenderedPrice != null &&
    maxRenderedPrice != null &&
    centerPrice >= minRenderedPrice &&
    centerPrice <= maxRenderedPrice;

  const firstVisibleIndex =
    viewportHeight > 0 ? Math.floor(scrollTop / rowHeight) : 0;
  const lastVisibleIndex =
    viewportHeight > 0
      ? Math.min(rows.length - 1, Math.ceil((scrollTop + viewportHeight) / rowHeight))
      : rows.length - 1;
  const currentPriceVisible =
    centerRowIndex != null &&
    centerRowIndex >= firstVisibleIndex &&
    centerRowIndex <= lastVisibleIndex;

  const sourceDiag: BinanceRawDomSourceDiag = {
    enabled: useDesktopFullRawDomLadder(),
    selectedDomSource: params.selectedDomSource ?? "spot",
    selectedMarketMode: params.mode ?? "spot",
    symbol: params.market ?? "BTCUSDT",
    feedVenue: params.feedVenue ?? "binance_spot",
    rawBidsReceived,
    rawAsksReceived,
    rawBidsAfterZeroFilter: rawBidLevelsReceived,
    rawAsksAfterZeroFilter: rawAskLevelsReceived,
    rawRowsBuilt: rows.length,
    visibleRowsRendered: visibleDomViewportRows,
    bestBidPrice,
    bestAskPrice,
    first10BidPrices: bidPrices.slice(0, 10),
    first10AskPrices: askPrices.slice(0, 10),
    first10RenderedPrices: renderedPrices.slice(0, 10),
    minRawBidPrice,
    maxRawBidPrice,
    minRawAskPrice,
    maxRawAskPrice,
    usesScaffoldRows: false,
    usesChartRange: false,
    usesHeatmapBucket: false,
    usesPriceAxisStep: false,
    usesChooseDomBucketSize: false,
    syntheticZeroRowsCreated: rowsWithNoBidNoAsk,
    rowsWithNoBidNoAsk,
    roundedRowsDetected: 0,
    suspiciousLargePriceStepDetected,
    currentPriceInsideRenderedWindow: currentPriceInsideDom,
    followMode: params.followMode ?? false,
    scrollTop,
    scrollTargetIndex: centerRowIndex,
  };

  const stabilityDiag: RawDomStabilityDiag = {
    rawModeEnabled: useDesktopFullRawDomLadder(),
    rawBidLevelsReceived,
    rawAskLevelsReceived,
    rawBidRows,
    rawAskRows,
    mergedRawRows: rows.length,
    syntheticRowsCreated: 0,
    zeroOnlyRowsCreated: rowsWithNoBidNoAsk,
    rowsFromChartRange: 0,
    rowsFromHeatmapBucket: 0,
    rowsFromLocalDepth: 0,
    rowsVisibleInViewport: visibleDomViewportRows,
    currentPrice: centerPrice,
    nearestRowToCurrentPrice,
    currentPriceVisible,
    followMode: params.followMode ?? false,
    scrollTop,
    scrollTargetIndex: centerRowIndex,
    minRawPrice: minRenderedPrice,
    maxRawPrice: maxRenderedPrice,
    renderedMinPrice: minRenderedPrice,
    renderedMaxPrice: maxRenderedPrice,
    invalidRowsDropped,
    duplicateRowsDropped,
    grayOverlayDetectedOrSource: null,
  };

  const rawDiag: FullRawDomLadderDiag = {
    featureEnabled: useDesktopFullRawDomLadder(),
    market: params.market ?? "BTCUSDT",
    mode: params.mode ?? "spot",
    rawBidLevelsReceived,
    rawAskLevelsReceived,
    rawBidLevelsRendered: rawBidRows,
    rawAskLevelsRendered: rawAskRows,
    totalRawLevelsRendered: rows.length,
    domRowsTotal: rows.length,
    visibleDomViewportRows,
    hiddenBecauseVirtualized,
    skippedBecauseAggregation: 0,
    skippedBecauseRowCap: 0,
    skippedBecauseTooWeak: 0,
    skippedBecauseOutsideRange: 0,
    skippedBecauseZero: rowsWithNoBidNoAsk,
    aggregationEnabled: false,
    domUsesRawPrices: true,
    domUsesHeatmapBucket: false,
    domUsesChartRange: false,
    domUsesPriceAxisStep: false,
    tickSize,
    minRenderedPrice,
    maxRenderedPrice,
    currentPriceInsideDom,
    followMode: params.followMode ?? false,
    scrollOffset: scrollTop,
    centerRowIndex,
  };
  const mappingDiag: DomValueMappingDiag = {
    selectedDomSource: params.selectedDomSource ?? "spot",
    symbol: params.market ?? "BTCUSDT",
    feedVenue: params.feedVenue ?? "binance_spot",
    rawBidsReceived,
    rawAsksReceived,
    visibleDomRows: rows.length,
    bidRowsMatched: rawBidRows,
    askRowsMatched: rawAskRows,
    rowsWithBidOnly,
    rowsWithAskOnly,
    rowsWithBoth,
    rowsWithNoBidNoAsk,
    cobRowsMatched: rows.filter((r) => r.cobSize > 0).length,
    svpRowsMatched: rows.filter((r) => r.svpCumulative > 0).length,
    unmatchedVisibleRows: rowsWithNoBidNoAsk,
    exactPriceMatches: rawBidRows + rawAskRows,
    roundedPriceMatches: 0,
    bucketedPriceMatches: 0,
    syntheticValuesCreated: rowsWithNoBidNoAsk,
    extraPriceColumnEnabled: false,
    rawTableModeEnabled: false,
    bidAskFromRealBook: rowsWithNoBidNoAsk === 0,
    cobFromRealBook: rowsWithNoBidNoAsk === 0,
    svpCreatesRows: false,
    priceMappingStep: tickSize,
    first10VisibleRowPrices: rows.slice(0, 10).map((r) => r.price),
    first10MatchedBidRows: rows
      .filter((r) => r.hasLiveBid)
      .slice(0, 10)
      .map((r) => ({ price: r.price, size: r.bidSize })),
    first10MatchedAskRows: rows
      .filter((r) => r.hasLiveAsk)
      .slice(0, 10)
      .map((r) => ({ price: r.price, size: r.askSize })),
    suspiciousFarPriceAttached: false,
    suspiciousMirroredValues: rowsWithBoth,
  };

  if (import.meta.env.DEV) {
    emitFullRawDomLadderDiag(rawDiag);
    emitRawDomStabilityDiag(stabilityDiag);
    emitBinanceRawDomSourceDiag(sourceDiag);
    emitDomValueMappingDiag(mappingDiag);
  }

  return {
    rows,
    stats: {
      ladderRows: rows.length,
      liveRows,
      lastKnownRows: 0,
      wallRows: 0,
      expectedDomRowCount: rows.length,
      zeroLiquidityRows: rowsWithNoBidNoAsk,
      rowsWithBidLiquidity,
      rowsWithAskLiquidity,
      rawBidLevelsCount: rawBidLevelsReceived,
      rawAskLevelsCount: rawAskLevelsReceived,
      aggregatedBidLevelsCount: 0,
      aggregatedAskLevelsCount: 0,
      domUsesContinuousLadder: false,
    },
    rawDiag,
    stabilityDiag,
    sourceDiag,
  };
}

/**
 * Full visible-range DOM scaffold: one row per domBucket (max→min).
 * Live, last-known, and historical wall layers overlay separately.
 */
export function buildScaffoldedDomRows(params: {
  /** Legacy live-only snapshot (used when engine book absent). */
  bids?: OrderbookLevel[];
  asks?: OrderbookLevel[];
  /** Full BookmapEngine book — primary DOM source in engine mode. */
  engineBook?: DomEngineBook;
  /** @deprecated Prefer engineBook */
  engineBids?: DomEngineBookLevel[];
  engineAsks?: DomEngineBookLevel[];
  walls?: DomWallEntry[];
  spot: number | null;
  priceRange: PriceRange;
  priceStep: number;
  plotHeight: number;
  priceToY?: (price: number) => number;
  majorWallBtc?: number;
  showDomNumbers?: boolean;
  depthPreset?: DepthRangePreset;
}): DomScaffoldResult {
  const emptyStats: DomScaffoldStats = {
    ladderRows: 0,
    liveRows: 0,
    lastKnownRows: 0,
    wallRows: 0,
    expectedDomRowCount: 0,
    zeroLiquidityRows: 0,
    rowsWithBidLiquidity: 0,
    rowsWithAskLiquidity: 0,
    rawBidLevelsCount: 0,
    rawAskLevelsCount: 0,
    aggregatedBidLevelsCount: 0,
    aggregatedAskLevelsCount: 0,
    domUsesContinuousLadder: true,
  };
  const empty: DomScaffoldResult = { rows: [], stats: emptyStats };
  const { priceRange, priceStep, plotHeight } = params;
  if (plotHeight < 20) return empty;

  const step = Math.max(1, priceStep);
  const scaffoldPrices = buildLadderPricesFromRange(priceRange, step);
  if (!scaffoldPrices.length) return empty;

  const expectedDomRowCount = scaffoldPrices.length;
  const denseLadder = scaffoldPrices.length > plotHeight / 14;
  const rawBidLevelsCount = params.engineBook?.bids.length ?? params.bids?.length ?? params.engineBids?.length ?? 0;
  const rawAskLevelsCount = params.engineBook?.asks.length ?? params.asks?.length ?? params.engineAsks?.length ?? 0;

  const engineLevels: DomEngineBookLevel[] = params.engineBook
    ? mergeEngineBookLevels(params.engineBook)
    : params.engineBids != null || params.engineAsks != null
      ? mergeEngineBookLevels({
          bids: params.engineBids ?? [],
          asks: params.engineAsks ?? [],
        })
      : engineLevelsFromSnapshot(params.bids ?? [], params.asks ?? []);

  const depthMap = aggregateEngineDomDepthBuckets(
    engineLevels,
    step,
    priceRange,
    { scaffoldPrices, logBucketMiss: true },
  );
  const wallsMap = aggregateDomWallsByBucket(params.walls ?? [], step, priceRange);

  const resolveY =
    params.priceToY ??
    ((price: number) => priceToY(price, priceRange, plotHeight));

  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const { labelEvery } = computeLabelDensity(priceRange, plotHeight, step);
  const showDomNumbers = params.showDomNumbers !== false;
  const spotBucket =
    params.spot != null && Number.isFinite(params.spot)
      ? bucketPrice(params.spot, step)
      : null;

  let maxBid = 0;
  let maxAsk = 0;
  let maxCob = 0;
  for (const price of scaffoldPrices) {
    const bucket = depthMap.buckets.get(price);
    const bid = resolveDomDepthSideDisplay(bucket, "bid").size;
    const ask = resolveDomDepthSideDisplay(bucket, "ask").size;
    maxBid = Math.max(maxBid, bid);
    maxAsk = Math.max(maxAsk, ask);
    maxCob = Math.max(maxCob, bid + ask);
  }

  const lastIndex = scaffoldPrices.length - 1;
  let svpRunning = 0;
  let liveRows = 0;
  let lastKnownRows = 0;
  let wallRows = 0;
  let zeroLiquidityRows = 0;
  let rowsWithBidLiquidity = 0;
  let rowsWithAskLiquidity = 0;

  const rows: DomLadderRow[] = scaffoldPrices.map((price, index) => {
    const depthBucket = depthMap.buckets.get(price);
    const bidResolved = resolveDomDepthSideDisplay(depthBucket, "bid");
    const askResolved = resolveDomDepthSideDisplay(depthBucket, "ask");
    const bidSize = bidResolved.size;
    const askSize = askResolved.size;
    const bidState = bidResolved.state;
    const askState = askResolved.state;
    const hasLiveBid = bidState === "live";
    const hasLiveAsk = askState === "live";
    const hasLastKnownBid =
      bidState === "lastKnown" || bidResolved.lastKnownSize > 0;
    const hasLastKnownAsk =
      askState === "lastKnown" || askResolved.lastKnownSize > 0;
    const hasWallBid = bidState === "wall";
    const hasWallAsk = askState === "wall";
    const cobSize = bidSize + askSize;
    if (hasLiveBid || hasLiveAsk) liveRows++;
    if (hasLastKnownBid || hasLastKnownAsk) lastKnownRows++;
    if (bidSize > 0) rowsWithBidLiquidity++;
    if (askSize > 0) rowsWithAskLiquidity++;
    if (bidSize <= 0 && askSize <= 0 && !hasWallBid && !hasWallAsk) zeroLiquidityRows++;

    const wallSlot = wallsMap.get(price);
    let wallBid = wallSlot?.bid;
    let wallAsk = wallSlot?.ask;
    if (hasWallBid && !wallBid && bidResolved.tier !== "none") {
      const tier = domWallTierToEntryTier(bidResolved.tier);
      if (tier) {
        wallBid = {
          price,
          bucketedPrice: price,
          side: "bid",
          wallSize: bidResolved.wallSize,
          wallTier: tier,
          wallIsStale: true,
        };
      }
    }
    if (hasWallAsk && !wallAsk && askResolved.tier !== "none") {
      const tier = domWallTierToEntryTier(askResolved.tier);
      if (tier) {
        wallAsk = {
          price,
          bucketedPrice: price,
          side: "ask",
          wallSize: askResolved.wallSize,
          wallTier: tier,
          wallIsStale: true,
        };
      }
    }
    const hasHistoricalWall =
      wallBid != null || wallAsk != null || hasWallBid || hasWallAsk;
    if (hasHistoricalWall || hasWallBid || hasWallAsk) wallRows++;

    const primaryWall =
      wallBid && wallAsk
        ? WALL_TIER_RANK[wallBid.wallTier] >= WALL_TIER_RANK[wallAsk.wallTier]
          ? wallBid
          : wallAsk
        : wallBid ?? wallAsk;

    svpRunning += cobSize;

    const y = resolveY(price);
    const yBelow = resolveY(price - step);
    const bucketHeight = Math.abs(yBelow - y);
    const barHeight = clampBarHeight(bucketHeight, denseLadder);
    const isSpotBucket = spotBucket != null && price === spotBucket;
    const isMajorWall =
      cobSize >= majorWallBtc ||
      wallBid?.wallTier === "major" ||
      wallAsk?.wallTier === "major" ||
      (primaryWall?.wallSize ?? 0) >= majorWallBtc;
    const onLabelGrid = index % labelEvery === 0;
    const showLabel =
      index === 0 ||
      index === lastIndex ||
      onLabelGrid ||
      isSpotBucket ||
      hasHistoricalWall;
    const showDomText =
      showDomNumbers && (bidSize > 0 || askSize > 0 || cobSize > 0 || isSpotBucket);
    const showTick = bucketHeight >= MIN_TICK_GAP_PX && !showLabel;

    return {
      price,
      bidSize,
      askSize,
      bidState,
      askState,
      bidLastKnownSize: bidResolved.lastKnownSize,
      askLastKnownSize: askResolved.lastKnownSize,
      cobSize,
      svpCumulative: svpRunning,
      y,
      bucketHeight,
      barHeight,
      isSpotBucket,
      showLabel,
      showTick,
      showDomText,
      isMajorWall,
      bidBarPct: maxBid > 0 ? (bidSize / maxBid) * 100 : 0,
      askBarPct: maxAsk > 0 ? (askSize / maxAsk) * 100 : 0,
      cobBarPct: maxCob > 0 ? (cobSize / maxCob) * 100 : 0,
      hasLiveBid,
      hasLiveAsk,
      hasHistoricalWall,
      wallSize: primaryWall?.wallSize ?? 0,
      wallSide: primaryWall?.side ?? null,
      wallTier: primaryWall?.wallTier ?? null,
      wallIsStale: primaryWall?.wallIsStale ?? false,
      wallBid,
      wallAsk,
    };
  });

  if (import.meta.env.DEV) {
    const sampleBuckets = scaffoldPrices
      .filter((p) => depthMap.buckets.has(p))
      .slice(0, 6)
      .map((p) => {
        const b = depthMap.buckets.get(p)!;
        return {
          price: p,
          bid: resolveDomDepthSideDisplay(b, "bid"),
          ask: resolveDomDepthSideDisplay(b, "ask"),
        };
      });
    console.debug("[DOM_DEPTH_BUCKETS]", {
      domBucketSize: step,
      visibleMinPrice: priceRange.minPrice,
      visibleMaxPrice: priceRange.maxPrice,
      bucketCount: depthMap.stats.bucketCount,
      liveBuckets: depthMap.stats.liveBuckets,
      lastKnownBuckets: depthMap.stats.lastKnownBuckets,
      wallBuckets: depthMap.stats.wallBuckets,
      engineLevelCount: engineLevels.length,
      expectedDomRowCount,
      denseLadder,
      sampleBuckets,
    });

    emitDomFullDepthDiag({
      selectedDepthMode: params.depthPreset ?? "local",
      selectedDepthValue: Math.round((priceRange.maxPrice - priceRange.minPrice) / 2),
      spotPrice: params.spot,
      domRangeMin: priceRange.minPrice,
      domRangeMax: priceRange.maxPrice,
      domRangeUsd: priceRange.maxPrice - priceRange.minPrice,
      domLadderStep: step,
      expectedDomRowCount,
      actualDomRowCount: rows.length,
      missingDomRowCount: Math.max(0, expectedDomRowCount - rows.length),
      rawBidLevelsCount,
      rawAskLevelsCount,
      aggregatedBidLevelsCount: depthMap.stats.bucketCount,
      aggregatedAskLevelsCount: depthMap.stats.bucketCount,
      rowsWithBidLiquidity,
      rowsWithAskLiquidity,
      zeroLiquidityRowsRendered: zeroLiquidityRows,
      rowsSkippedByReason: {
        clippedViewport: 0,
        zeroHidden: 0,
        tooWeak: 0,
        outsideRange: 0,
        rowCap: Math.max(0, expectedDomRowCount - rows.length),
        virtualized: 0,
      },
      skippedBecauseZero: 0,
      skippedBecauseTooWeak: 0,
      skippedBecauseOutsideRange: 0,
      skippedBecauseRowCap: Math.max(0, expectedDomRowCount - rows.length),
      skippedBecauseVirtualized: 0,
      maxDomRowsCap: BOOKMAP_DOM_MAX_SCAFFOLD_ROWS,
      domUsesContinuousLadder: true,
      domForcedByHeatmapBucket: false,
    });
  }

  return {
    rows,
    stats: {
      ladderRows: rows.length,
      liveRows,
      lastKnownRows,
      wallRows,
      expectedDomRowCount,
      zeroLiquidityRows,
      rowsWithBidLiquidity,
      rowsWithAskLiquidity,
      rawBidLevelsCount,
      rawAskLevelsCount,
      aggregatedBidLevelsCount: depthMap.stats.bucketCount,
      aggregatedAskLevelsCount: depthMap.stats.bucketCount,
      domUsesContinuousLadder: true,
    },
  };
}

/**
 * Full visible-range DOM ladder: one row per priceStep from max→min,
 * including buckets with zero bid/ask (Bookmap-style).
 */
export function buildFullDomRows(
  params: Parameters<typeof buildScaffoldedDomRows>[0],
): DomLadderRow[] {
  return buildScaffoldedDomRows(params).rows;
}

/** @deprecated Use buildFullDomRows — same full ladder. */
export function buildAlignedDomRows(
  params: Parameters<typeof buildFullDomRows>[0],
): DomLadderRow[] {
  return buildFullDomRows(params);
}

/**
 * DOM rows for the viewport only — one row per `visiblePrices`, fixed height.
 * Sizes come from the full aggregated book (not clipped to a synthetic global range).
 */
export function buildViewportDomRows(params: {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spot: number | null;
  visiblePrices: number[];
  priceStep: number;
  rowOffsetPx: (rowIndex: number) => number;
  rowHeight: number;
  majorWallBtc?: number;
  showDomNumbers?: boolean;
}): DomLadderRow[] {
  const {
    bids,
    asks,
    spot,
    visiblePrices,
    priceStep,
    rowOffsetPx,
    rowHeight,
    majorWallBtc = HEATMAP_MAJOR_WALL_BTC,
    showDomNumbers = true,
  } = params;
  const step = Math.max(1, priceStep);
  if (!visiblePrices.length) return [];

  const bidsMap = aggregateLevelsByPriceStep(bids, step);
  const asksMap = aggregateLevelsByPriceStep(asks, step);

  let maxBid = 0;
  let maxAsk = 0;
  let maxCob = 0;

  for (const price of visiblePrices) {
    const bid = bidsMap.get(price) ?? 0;
    const ask = asksMap.get(price) ?? 0;
    const cob = bid + ask;
    maxBid = Math.max(maxBid, bid);
    maxAsk = Math.max(maxAsk, ask);
    maxCob = Math.max(maxCob, cob);
  }

  const spotBucket =
    spot != null && Number.isFinite(spot) ? bucketPrice(spot, step) : null;

  let svpRunning = 0;
  const rows: DomLadderRow[] = [];

  visiblePrices.forEach((price, index) => {
    const bidSize = bidsMap.get(price) ?? 0;
    const askSize = asksMap.get(price) ?? 0;
    const cobSize = bidSize + askSize;
    svpRunning += cobSize;

    const top = rowOffsetPx(index);
    const isSpotBucket = spotBucket != null && price === spotBucket;
    const isMajorWall = cobSize >= majorWallBtc;

    const bidBarPct = maxBid > 0 ? (bidSize / maxBid) * 100 : 0;
    const askBarPct = maxAsk > 0 ? (askSize / maxAsk) * 100 : 0;
    const cobBarPct = maxCob > 0 ? (cobSize / maxCob) * 100 : 0;

    rows.push({
      price,
      bidSize,
      askSize,
      cobSize,
      svpCumulative: svpRunning,
      y: top + rowHeight / 2,
      bucketHeight: rowHeight,
      barHeight: clampBarHeight(rowHeight),
      isSpotBucket,
      showLabel: true,
      showTick: false,
      showDomText: showDomNumbers,
      isMajorWall,
      bidBarPct,
      askBarPct,
      cobBarPct,
      bidState: bidSize > 0 ? "live" : "none",
      askState: askSize > 0 ? "live" : "none",
      bidLastKnownSize: 0,
      askLastKnownSize: 0,
      hasLiveBid: bidSize > 0,
      hasLiveAsk: askSize > 0,
      hasHistoricalWall: false,
      wallSize: 0,
      wallSide: null,
      wallTier: null,
      wallIsStale: false,
    });
  });

  return rows;
}

export function formatDomSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size >= 100) return size.toFixed(0);
  if (size >= 10) return size.toFixed(1);
  return size.toFixed(2);
}

/** Re-export for DOM components — same scale as heatmap canvas. */
export { BOOKMAP_PLOT_PAD, priceToY };
