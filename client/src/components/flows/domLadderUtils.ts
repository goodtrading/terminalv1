import type { OrderbookLevel } from "./liquidityHeatmapUtils";
import {
  BOOKMAP_BTCUSDT_TICK_SIZE,
  BOOKMAP_DOM_FULL_DEPTH_DIAG,
  BOOKMAP_DOM_MACRO_COLLISION_BAND_PX,
  BOOKMAP_DOM_MAX_SCAFFOLD_ROWS,
  BOOKMAP_DOM_MICRO_COLLISION_BAND_PX,
  BOOKMAP_DOM_MICRO_MAX_LABELS_PER_COLUMN,
  BOOKMAP_DOM_MICRO_MIN_LABEL_SPACING_PX,
  BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD,
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
  showBidText?: boolean;
  showAskText?: boolean;
  showCobText?: boolean;
  showSvpText?: boolean;
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
  /** Shared PRICE-column band bounds for raw Binance DOM rows. */
  bandTopY?: number;
  bandBottomY?: number;
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

export type DomAutoScaleLayoutDiag = {
  enabled: boolean;
  domUsesSharedPriceScale: boolean;
  domHasIndependentScroll: boolean;
  visiblePriceMin: number;
  visiblePriceMax: number;
  visibleRawBidLevels: number;
  visibleRawAskLevels: number;
  pixelsPerDollar: number;
  minAdjacentLevelDistancePx: number | null;
  averageAdjacentLevelDistancePx: number | null;
  textHeightPx: number;
  fullTextThresholdPx: number;
  collisionGroupsBid: number;
  collisionGroupsAsk: number;
  collisionGroupsCob: number;
  collisionGroupsSvp: number;
  individualLabelsRendered: number;
  groupedLabelsRendered: number;
  labelsHiddenDueToDensity: number;
  barsRendered: number;
  strongestHiddenValue: number;
  bestBidVisible: boolean;
  bestAskVisible: boolean;
  maxAlignmentErrorPx: number;
  extraPriceColumnEnabled: false;
  rawDataMutatedForLayout: false;
};

export type DomLodRendererDiag = {
  enabled: boolean;
  domUsesSharedPriceScale: boolean;
  domHasIndependentScroll: false;
  extraPriceColumnEnabled: false;
  rawBidLevelsTotal: number;
  rawAskLevelsTotal: number;
  visibleRawBidLevels: number;
  visibleRawAskLevels: number;
  bidVisualGroups: number;
  askVisualGroups: number;
  cobVisualGroups: number;
  svpVisualGroups: number;
  bidBarsRendered: number;
  askBarsRendered: number;
  cobBarsRendered: number;
  svpBarsRendered: number;
  bidLabelsRendered: number;
  askLabelsRendered: number;
  cobLabelsRendered: number;
  svpLabelsRendered: number;
  labelsHiddenDueToCollision: number;
  hiddenLabelsWithBarsStillRendered: number;
  strongestBidGroupValue: number;
  strongestAskGroupValue: number;
  bestBidVisible: boolean;
  bestAskVisible: boolean;
  visibleMaxLiquidity: number;
  pixelsPerDollar: number;
  minCollisionBandPx: number;
  averageLevelsPerVisualGroup: number;
  maxLevelsPerVisualGroup: number;
  rawDataMutatedForLayout: false;
  syntheticRowsCreated: 0;
  valuesCreatedWithoutBookLevel: 0;
};

export type DomMicroReadabilityDiag = {
  selectedDepthMode: string;
  visiblePriceRangeUsd: number;
  pixelsPerDollar: number;
  microModeActive: boolean;
  collisionBandPx: number;
  nearPricePriorityUsd: number;
  visibleRawBidLevels: number;
  visibleRawAskLevels: number;
  individualBidLabelsRendered: number;
  individualAskLabelsRendered: number;
  groupedBidLabelsRendered: number;
  groupedAskLabelsRendered: number;
  bidBarsRendered: number;
  askBarsRendered: number;
  labelsHiddenDueToDensity: number;
  bestBidVisible: boolean;
  bestAskVisible: boolean;
  largeLevelsVisible: number;
  maxLabelsPerColumn: number;
  domUsesSharedPriceScale: true;
  independentDomScroll: false;
  syntheticRowsCreated: 0;
};

export type DomPriceBandLayoutDiag = {
  enabled: true;
  domUsesSharedPriceScale: true;
  domUsesPriceColumnBands: true;
  independentPixelBinsDisabled: true;
  independentDomScroll: false;
  extraPriceColumnEnabled: false;
  visiblePriceBandCount: number;
  first10PriceBands: Array<{
    labelPrice: number;
    topY: number;
    bottomY: number;
    minPrice: number;
    maxPrice: number;
  }>;
  visiblePriceMin: number;
  visiblePriceMax: number;
  plotHeightPx: number;
  pixelsPerDollar: number;
  rawBidLevelsTotal: number;
  rawAskLevelsTotal: number;
  visibleRawBidLevels: number;
  visibleRawAskLevels: number;
  bidLevelsAssignedToBands: number;
  askLevelsAssignedToBands: number;
  bandsWithBidLiquidity: number;
  bandsWithAskLiquidity: number;
  bandsWithCobLiquidity: number;
  bandsWithSvp: number;
  bidBarsRendered: number;
  askBarsRendered: number;
  cobBarsRendered: number;
  svpBarsRendered: number;
  bidLabelsRendered: number;
  askLabelsRendered: number;
  cobLabelsRendered: number;
  svpLabelsRendered: number;
  maxBidLevelsPerBand: number;
  maxAskLevelsPerBand: number;
  strongestBidBand: { labelPrice: number; sumSize: number; maxSize: number } | null;
  strongestAskBand: { labelPrice: number; sumSize: number; maxSize: number } | null;
  bestBidBandVisible: boolean;
  bestAskBandVisible: boolean;
  rawDataMutatedForLayout: false;
  syntheticRowsCreated: 0;
  valuesCreatedWithoutBookLevel: 0;
  maxPriceBandAlignmentErrorPx: number;
};

export type DomMinorPriceSlot = {
  slotIndex: number;
  centerPrice: number;
  minPrice: number;
  maxPrice: number;
  centerY: number;
  topY: number;
  bottomY: number;
  source: "raw" | "visual-bin";
};

export type DomMinorLadderSlotDiag = {
  enabled: true;
  domUsesSharedPriceScale: true;
  majorPriceLabelCount: number;
  minorDomSlotCount: number;
  visibleRawBidLevels: number;
  visibleRawAskLevels: number;
  rawLevelsAssignedToExactSlots: number;
  rawLevelsAssignedToMinorBins: number;
  rawLevelsCollapsedIntoMajorLabels: 0;
  microModeActive: boolean;
  binHeightPx: number;
  minSlotHeightPx: number;
  pixelsPerDollar: number;
  visiblePriceRangeUsd: number;
  bestBidVisible: boolean;
  bestAskVisible: boolean;
  largeLevelsVisible: number;
  bidSlotsRendered: number;
  askSlotsRendered: number;
  cobSlotsRendered: number;
  svpSlotsRendered: number;
  bidLabelsRendered: number;
  askLabelsRendered: number;
  labelsHiddenButBarsRendered: number;
  majorLabelBandModeDisabled: true;
  independentDomScroll: false;
  extraPriceColumnEnabled: false;
  syntheticRowsCreated: 0;
  rawDataMutatedForLayout: false;
};

export type VisiblePriceBand = {
  labelPrice: number;
  topY: number;
  bottomY: number;
  centerY: number;
  minPrice: number;
  maxPrice: number;
  label: string;
};

export function buildVisiblePriceBands(params: {
  labelPrices: number[];
  plotHeight: number;
  priceToY: (price: number) => number;
  yToPrice: (y: number) => number;
}): VisiblePriceBand[] {
  const centers = params.labelPrices
    .map((labelPrice) => ({
      labelPrice,
      centerY: params.priceToY(labelPrice),
    }))
    .filter(
      (entry) =>
        Number.isFinite(entry.centerY) &&
        entry.centerY >= BOOKMAP_PLOT_PAD.top &&
        entry.centerY <= params.plotHeight - BOOKMAP_PLOT_PAD.bottom,
    )
    .sort((a, b) => a.centerY - b.centerY);
  const plotTop = BOOKMAP_PLOT_PAD.top;
  const plotBottom = Math.max(
    plotTop,
    params.plotHeight - BOOKMAP_PLOT_PAD.bottom,
  );

  return centers.map((entry, index) => {
    const previous = centers[index - 1];
    const next = centers[index + 1];
    const topY = previous ? (previous.centerY + entry.centerY) / 2 : plotTop;
    const bottomY = next ? (entry.centerY + next.centerY) / 2 : plotBottom;
    const topPrice = params.yToPrice(topY);
    const bottomPrice = params.yToPrice(bottomY);
    return {
      labelPrice: entry.labelPrice,
      topY,
      bottomY,
      centerY: entry.centerY,
      minPrice: Math.min(topPrice, bottomPrice),
      maxPrice: Math.max(topPrice, bottomPrice),
      label: formatBookmapPrice(entry.labelPrice),
    };
  });
}

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
  autoScaleDiag: DomAutoScaleLayoutDiag;
  lodDiag: DomLodRendererDiag;
  microReadabilityDiag: DomMicroReadabilityDiag;
  priceBandLayoutDiag?: DomPriceBandLayoutDiag;
  minorLadderSlotDiag?: DomMinorLadderSlotDiag;
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

let lastDomAutoScaleLayoutDiagMs = 0;

function emitDomAutoScaleLayoutDiag(diag: DomAutoScaleLayoutDiag): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - lastDomAutoScaleLayoutDiagMs < 2_000) return;
  lastDomAutoScaleLayoutDiagMs = now;
  console.debug("[BOOKMAP_DOM_AUTO_SCALE_LAYOUT_DIAG]", diag);
}

function logDomTextOverlapPrevented(params: {
  reason: string;
  hiddenLabels: number;
  groupedLabels: number;
  minAdjacentLevelDistancePx: number | null;
  textHeightPx: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.debug("[BOOKMAP_DOM_TEXT_OVERLAP_PREVENTED]", params);
}

function logDomPriceAlignmentRegression(params: {
  price: number;
  renderedY: number;
  expectedY: number;
  errorPx: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_DOM_PRICE_ALIGNMENT_REGRESSION]", params);
}

let lastDomLodRendererDiagMs = 0;

function emitDomLodRendererDiag(diag: DomLodRendererDiag): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - lastDomLodRendererDiagMs < 2_000) return;
  lastDomLodRendererDiagMs = now;
  console.debug("[BOOKMAP_DOM_LOD_RENDERER_DIAG]", diag);
}

let lastDomMicroReadabilityDiagMs = 0;

function emitDomMicroReadabilityDiag(diag: DomMicroReadabilityDiag): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - lastDomMicroReadabilityDiagMs < 2_000) return;
  lastDomMicroReadabilityDiagMs = now;
  console.debug("[BOOKMAP_DOM_MICRO_READABILITY_DIAG]", diag);
}

function logDomEmptyRenderRegression(params: {
  visibleRawLevels: number;
  barsRendered: number;
  bidVisualGroups: number;
  askVisualGroups: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_DOM_EMPTY_RENDER_REGRESSION]", params);
}

function logDomLiquidityHiddenWithoutBar(params: {
  hiddenGroups: number;
  hiddenLevels: number;
  barsRendered: number;
}): void {
  if (!import.meta.env.DEV) return;
  console.warn("[BOOKMAP_DOM_LIQUIDITY_HIDDEN_WITHOUT_BAR]", params);
}

/** @deprecated The desktop panel now uses PRICE-column bands instead. */
export function buildIndependentPixelBinnedRawDomRows(params: {
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
  depthPreset?: DepthRangePreset;
}): PriceAlignedRawDomResult {
  if (import.meta.env.DEV) {
    console.warn("[BOOKMAP_DOM_INDEPENDENT_BIN_REGRESSION]", {
      reason: "legacy_pixel_bin_builder_called",
      independentPixelBinsDisabled: false,
    });
  }
  const showDomNumbers = params.showDomNumbers !== false;
  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const rawBids = params.bids ?? [];
  const rawAsks = params.asks ?? [];
  const minPrice = params.priceRange.minPrice;
  const maxPrice = params.priceRange.maxPrice;
  const inChartRange = (price: number) => price >= minPrice && price <= maxPrice;
  const textHeightPx = 13;
  const fullTextThresholdPx = 16;
  const priceRangeUsd = Math.max(1e-9, maxPrice - minPrice);
  const pixelsPerDollar = params.plotHeight > 0 ? params.plotHeight / priceRangeUsd : 0;
  const selectedDepthMode = params.depthPreset ?? "local";
  const microModeActive =
    selectedDepthMode === "local" ||
    priceRangeUsd <= BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD * 4 ||
    pixelsPerDollar >= 0.18;
  const minCollisionBandPx = microModeActive
    ? BOOKMAP_DOM_MICRO_COLLISION_BAND_PX
    : BOOKMAP_DOM_MACRO_COLLISION_BAND_PX;
  const labelSpacingPx = microModeActive
    ? BOOKMAP_DOM_MICRO_MIN_LABEL_SPACING_PX
    : fullTextThresholdPx;
  const maxLabelsPerColumn = microModeActive
    ? BOOKMAP_DOM_MICRO_MAX_LABELS_PER_COLUMN
    : Math.max(12, Math.floor(params.plotHeight / fullTextThresholdPx));
  const bestBid = rawBids.find((level) => level.sizeBtc > 0) ?? null;
  const bestAsk = rawAsks.find((level) => level.sizeBtc > 0) ?? null;
  const bestBidPrice = bestBid?.price ?? null;
  const bestAskPrice = bestAsk?.price ?? null;

  type VisualLevel = {
    price: number;
    y: number;
    size: number;
    side: "bid" | "ask";
  };

  type VisualGroup = {
    levels: VisualLevel[];
    side: "bid" | "ask";
    size: number;
    price: number;
    y: number;
    yMin: number;
    yMax: number;
    containsBest: boolean;
    nearSpotDistance: number;
  };

  let levelsOutsideChartRange = 0;
  let visibleBidLevelsRendered = 0;
  let visibleAskLevelsRendered = 0;
  let maxAlignmentErrorPx = 0;
  const visibleBidLevels: VisualLevel[] = [];
  const visibleAskLevels: VisualLevel[] = [];

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
    const visualLevel: VisualLevel = {
      price,
      y: expectedY,
      size,
      side,
    };
    if (side === "bid") {
      visibleBidLevels.push(visualLevel);
      visibleBidLevelsRendered += 1;
    } else {
      visibleAskLevels.push(visualLevel);
      visibleAskLevelsRendered += 1;
    }
  };

  for (const level of rawBids) ingest(level, "bid");
  for (const level of rawAsks) ingest(level, "ask");

  const sortedLevels = [...visibleBidLevels, ...visibleAskLevels].sort((a, b) => a.y - b.y);
  const adjacentDistances: number[] = [];
  for (let i = 1; i < sortedLevels.length; i += 1) {
    adjacentDistances.push(Math.abs(sortedLevels[i]!.y - sortedLevels[i - 1]!.y));
  }
  const minAdjacentLevelDistancePx = adjacentDistances.length
    ? Math.min(...adjacentDistances)
    : null;
  const averageAdjacentLevelDistancePx = adjacentDistances.length
    ? adjacentDistances.reduce((sum, distance) => sum + distance, 0) / adjacentDistances.length
    : null;

  const chooseRepresentativeLevel = (levels: VisualLevel[], side: "bid" | "ask") => {
    const bestPrice = side === "bid" ? bestBidPrice : bestAskPrice;
    if (bestPrice != null) {
      const bestLevel = levels.find(
        (level) => Math.abs(level.price - bestPrice) <= BOOKMAP_BTCUSDT_TICK_SIZE,
      );
      if (bestLevel) return bestLevel;
    }
    const strongest = levels.reduce((best, candidate) =>
      candidate.size > best.size ? candidate : best,
    );
    if (params.spot == null) return strongest;
    const nearestToSpot = levels.reduce((best, candidate) =>
      Math.abs(candidate.price - params.spot!) < Math.abs(best.price - params.spot!)
        ? candidate
        : best,
    );
    return strongest.size >= nearestToSpot.size * 1.5 ? strongest : nearestToSpot;
  };

  const buildSideGroups = (levels: VisualLevel[], side: "bid" | "ask"): VisualGroup[] => {
    const buckets = new Map<number, VisualLevel[]>();
    for (const level of levels) {
      const key = Math.round(level.y / minCollisionBandPx);
      const existing = buckets.get(key);
      if (existing) existing.push(level);
      else buckets.set(key, [level]);
    }
    const bestPrice = side === "bid" ? bestBidPrice : bestAskPrice;
    return Array.from(buckets.values())
      .map((bucketLevels) => {
        const representative = chooseRepresentativeLevel(bucketLevels, side);
        const yValues = bucketLevels.map((level) => level.y);
        const y = params.priceToY(representative.price);
        const size = bucketLevels.reduce((sum, level) => sum + level.size, 0);
        return {
          levels: bucketLevels,
          side,
          size,
          price: representative.price,
          y,
          yMin: Math.min(...yValues),
          yMax: Math.max(...yValues),
          containsBest:
            bestPrice != null &&
            bucketLevels.some((level) => Math.abs(level.price - bestPrice) <= BOOKMAP_BTCUSDT_TICK_SIZE),
          nearSpotDistance:
            params.spot == null ? Number.POSITIVE_INFINITY : Math.abs(representative.price - params.spot),
        };
      })
      .sort((a, b) => a.y - b.y);
  };

  const bidGroups = buildSideGroups(visibleBidLevels, "bid");
  const askGroups = buildSideGroups(visibleAskLevels, "ask");
  const visualGroups = [...bidGroups, ...askGroups].sort((a, b) => a.y - b.y);

  let maxBid = 0;
  let maxAsk = 0;
  let maxCob = 0;
  for (const group of bidGroups) {
    maxBid = Math.max(maxBid, group.size);
  }
  for (const group of askGroups) {
    maxAsk = Math.max(maxAsk, group.size);
  }
  maxCob = Math.max(maxBid, maxAsk);
  const visibleMaxLiquidity = Math.max(maxBid, maxAsk, 1e-9);

  const chooseLabelIndexes = (groups: VisualGroup[]): Set<number> => {
    const labelIndexes = new Set<number>();
    const acceptedLabelYs: number[] = [];
    if (!showDomNumbers) return labelIndexes;
    const ranked = groups
      .map((group, index) => ({
        index,
        y: group.y,
        score:
          (group.containsBest ? 10_000_000 : 0) +
          (group.nearSpotDistance <= BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD ? 250_000 : 0) +
          (group.levels.length === 1 && microModeActive ? 50_000 : 0) +
          (group.levels.length > 1 ? 2_000 : 0) +
          group.size * 100 +
          (Number.isFinite(group.nearSpotDistance) ? Math.max(0, 1_000 - group.nearSpotDistance) : 0),
      }))
      .sort((a, b) => b.score - a.score);
    for (const candidate of ranked) {
      if (labelIndexes.size >= maxLabelsPerColumn) break;
      const group = groups[candidate.index]!;
      const mandatory =
        group.containsBest ||
        (!microModeActive && group.size >= visibleMaxLiquidity * 0.72);
      const nearPricePriority =
        microModeActive && group.nearSpotDistance <= BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD;
      const collides = acceptedLabelYs.some((y) => Math.abs(y - candidate.y) < labelSpacingPx);
      if (collides && !mandatory) continue;
      labelIndexes.add(candidate.index);
      acceptedLabelYs.push(candidate.y);
      if (nearPricePriority && labelIndexes.size >= maxLabelsPerColumn) break;
    }
    return labelIndexes;
  };

  const bidLabelIndexes = chooseLabelIndexes(bidGroups);
  const askLabelIndexes = chooseLabelIndexes(askGroups);

  let svpRunning = 0;
  let liveRows = 0;
  let rowsWithBidLiquidity = 0;
  let rowsWithAskLiquidity = 0;
  const rowInputs = visualGroups.map((group, index) => {
    const groupIndex = group.side === "bid" ? bidGroups.indexOf(group) : askGroups.indexOf(group);
    const sideText = group.side === "bid" ? bidLabelIndexes.has(groupIndex) : askLabelIndexes.has(groupIndex);
    return {
      group,
      index,
      bidText: group.side === "bid" && sideText,
      askText: group.side === "ask" && sideText,
      cobText:
        group.containsBest ||
        group.size >= visibleMaxLiquidity * (microModeActive ? 0.78 : 0.62),
      svpText:
        !microModeActive &&
        sideText &&
        group.size >= visibleMaxLiquidity * 0.35,
    };
  });
  const labelsHiddenDueToDensity = rowInputs.filter(
    (entry) => !entry.bidText && !entry.askText && entry.group.size > 0,
  ).length;
  const hiddenLabelsWithBarsStillRendered = labelsHiddenDueToDensity;
  const strongestHiddenValue = rowInputs.reduce(
    (max, entry) =>
      !entry.bidText && !entry.askText ? Math.max(max, entry.group.size) : max,
    0,
  );
  const rows: DomLadderRow[] = rowInputs.map((entry) => {
    const group = entry.group;
    const y = group.y;
    const expectedY = params.priceToY(group.price);
    const errorPx = Math.abs(y - expectedY);
    maxAlignmentErrorPx = Math.max(maxAlignmentErrorPx, errorPx);
    if (errorPx > 1) {
      logDomPriceDesync({ price: group.price, renderedY: y, expectedY, errorPx });
      logDomPriceAlignmentRegression({ price: group.price, renderedY: y, expectedY, errorPx });
    }
    const bidSize = group.side === "bid" ? group.size : 0;
    const askSize = group.side === "ask" ? group.size : 0;
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
        ? Math.abs(group.price - params.spot) <= BOOKMAP_BTCUSDT_TICK_SIZE
        : false;
    const footprintHeight = Math.max(4, Math.min(20, group.yMax - group.yMin + 4));
    return {
      price: group.price,
      bidSize,
      askSize,
      bidState: hasLiveBid ? "live" : "none",
      askState: hasLiveAsk ? "live" : "none",
      bidLastKnownSize: 0,
      askLastKnownSize: 0,
      cobSize,
      svpCumulative: svpRunning,
      y,
      bucketHeight: footprintHeight,
      barHeight: footprintHeight,
      isSpotBucket,
      showLabel: false,
      showTick: false,
      showDomText: entry.bidText || entry.askText || entry.cobText || entry.svpText,
      showBidText: entry.bidText,
      showAskText: entry.askText,
      showCobText: entry.cobText,
      showSvpText: entry.svpText,
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
  const bestBidVisible = bestBid != null && bidGroups.some(
    (group) => group.levels.some(
      (level) => Math.abs(level.price - bestBid.price) <= BOOKMAP_BTCUSDT_TICK_SIZE,
    ),
  );
  const bestAskVisible = bestAsk != null && askGroups.some(
    (group) => group.levels.some(
      (level) => Math.abs(level.price - bestAsk.price) <= BOOKMAP_BTCUSDT_TICK_SIZE,
    ),
  );
  const collapsedVisualGroups = 0;
  const aggregatedBecausePixelCollision = visualGroups.reduce(
    (sum, group) => sum + Math.max(0, group.levels.length - 1),
    0,
  );
  const collisionGroupsBid = bidGroups.filter((group) => group.levels.length > 1).length;
  const collisionGroupsAsk = askGroups.filter((group) => group.levels.length > 1).length;
  const collisionGroupsCob = visualGroups.filter((group) => group.levels.length > 1).length;
  const collisionGroupsSvp = collisionGroupsCob;
  const bidBarsRendered = rows.filter((row) => row.bidSize > 0).length;
  const askBarsRendered = rows.filter((row) => row.askSize > 0).length;
  const cobBarsRendered = rows.filter((row) => row.cobSize > 0).length;
  const svpBarsRendered = cobBarsRendered;
  const barsRendered = cobBarsRendered;
  const bidLabelsRendered = rows.filter((row) => row.showBidText && row.bidSize > 0).length;
  const askLabelsRendered = rows.filter((row) => row.showAskText && row.askSize > 0).length;
  const cobLabelsRendered = rows.filter((row) => row.showCobText && row.cobSize > 0).length;
  const svpLabelsRendered = rows.filter((row) => row.showSvpText && row.cobSize > 0).length;
  const individualBidLabelsRendered = bidGroups.filter(
    (group, index) => bidLabelIndexes.has(index) && group.levels.length === 1,
  ).length;
  const individualAskLabelsRendered = askGroups.filter(
    (group, index) => askLabelIndexes.has(index) && group.levels.length === 1,
  ).length;
  const groupedBidLabelsRendered = bidGroups.filter(
    (group, index) => bidLabelIndexes.has(index) && group.levels.length > 1,
  ).length;
  const groupedAskLabelsRendered = askGroups.filter(
    (group, index) => askLabelIndexes.has(index) && group.levels.length > 1,
  ).length;
  const strongestBidGroupValue = bidGroups.reduce((max, group) => Math.max(max, group.size), 0);
  const strongestAskGroupValue = askGroups.reduce((max, group) => Math.max(max, group.size), 0);
  const largeLevelsVisible = bidGroups.concat(askGroups).filter(
    (group) => group.size >= visibleMaxLiquidity * 0.52,
  ).length;
  const averageLevelsPerVisualGroup =
    visualGroups.length > 0
      ? visualGroups.reduce((sum, group) => sum + group.levels.length, 0) / visualGroups.length
      : 0;
  const maxLevelsPerVisualGroup = visualGroups.reduce(
    (max, group) => Math.max(max, group.levels.length),
    0,
  );

  if (aggregatedBecausePixelCollision > 0 || labelsHiddenDueToDensity > 0) {
    logDomTextOverlapPrevented({
      reason: aggregatedBecausePixelCollision > 0 ? "bookmap_lod_grouped_dense_levels" : "bookmap_lod_bar_only_groups",
      hiddenLabels: labelsHiddenDueToDensity,
      groupedLabels: bidLabelsRendered + askLabelsRendered,
      minAdjacentLevelDistancePx,
      textHeightPx,
    });
  }

  if ((visibleBidLevelsRendered + visibleAskLevelsRendered) >= 25 && bidBarsRendered + askBarsRendered < 4) {
    logDomEmptyRenderRegression({
      visibleRawLevels: visibleBidLevelsRendered + visibleAskLevelsRendered,
      barsRendered: bidBarsRendered + askBarsRendered,
      bidVisualGroups: bidGroups.length,
      askVisualGroups: askGroups.length,
    });
  }

  const hiddenGroupsWithoutBars = rowInputs.filter(
    (entry) => !entry.bidText && !entry.askText && entry.group.size > 0 && entry.group.size <= 0,
  );
  if (hiddenGroupsWithoutBars.length > 0) {
    logDomLiquidityHiddenWithoutBar({
      hiddenGroups: hiddenGroupsWithoutBars.length,
      hiddenLevels: hiddenGroupsWithoutBars.reduce((sum, entry) => sum + entry.group.levels.length, 0),
      barsRendered: bidBarsRendered + askBarsRendered,
    });
  }

  const lodDiag: DomLodRendererDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    extraPriceColumnEnabled: false,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleRawBidLevels: visibleBidLevelsRendered,
    visibleRawAskLevels: visibleAskLevelsRendered,
    bidVisualGroups: bidGroups.length,
    askVisualGroups: askGroups.length,
    cobVisualGroups: cobBarsRendered,
    svpVisualGroups: svpBarsRendered,
    bidBarsRendered,
    askBarsRendered,
    cobBarsRendered,
    svpBarsRendered,
    bidLabelsRendered,
    askLabelsRendered,
    cobLabelsRendered,
    svpLabelsRendered,
    labelsHiddenDueToCollision: labelsHiddenDueToDensity,
    hiddenLabelsWithBarsStillRendered,
    strongestBidGroupValue,
    strongestAskGroupValue,
    bestBidVisible,
    bestAskVisible,
    visibleMaxLiquidity,
    pixelsPerDollar,
    minCollisionBandPx,
    averageLevelsPerVisualGroup,
    maxLevelsPerVisualGroup,
    rawDataMutatedForLayout: false,
    syntheticRowsCreated: 0,
    valuesCreatedWithoutBookLevel: 0,
  };
  emitDomLodRendererDiag(lodDiag);

  const microReadabilityDiag: DomMicroReadabilityDiag = {
    selectedDepthMode,
    visiblePriceRangeUsd: priceRangeUsd,
    pixelsPerDollar,
    microModeActive,
    collisionBandPx: minCollisionBandPx,
    nearPricePriorityUsd: BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD,
    visibleRawBidLevels: visibleBidLevelsRendered,
    visibleRawAskLevels: visibleAskLevelsRendered,
    individualBidLabelsRendered,
    individualAskLabelsRendered,
    groupedBidLabelsRendered,
    groupedAskLabelsRendered,
    bidBarsRendered,
    askBarsRendered,
    labelsHiddenDueToDensity,
    bestBidVisible,
    bestAskVisible,
    largeLevelsVisible,
    maxLabelsPerColumn,
    domUsesSharedPriceScale: true,
    independentDomScroll: false,
    syntheticRowsCreated: 0,
  };
  emitDomMicroReadabilityDiag(microReadabilityDiag);

  const autoScaleDiag: DomAutoScaleLayoutDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    visibleRawBidLevels: visibleBidLevelsRendered,
    visibleRawAskLevels: visibleAskLevelsRendered,
    pixelsPerDollar,
    minAdjacentLevelDistancePx,
    averageAdjacentLevelDistancePx,
    textHeightPx,
    fullTextThresholdPx,
    collisionGroupsBid,
    collisionGroupsAsk,
    collisionGroupsCob,
    collisionGroupsSvp,
    individualLabelsRendered: Math.max(
      0,
      bidLabelsRendered + askLabelsRendered - collisionGroupsBid - collisionGroupsAsk,
    ),
    groupedLabelsRendered: collisionGroupsBid + collisionGroupsAsk,
    labelsHiddenDueToDensity,
    barsRendered,
    strongestHiddenValue,
    bestBidVisible,
    bestAskVisible,
    maxAlignmentErrorPx,
    extraPriceColumnEnabled: false,
    rawDataMutatedForLayout: false,
  };
  emitDomAutoScaleLayoutDiag(autoScaleDiag);

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
    autoScaleDiag,
    lodDiag,
    microReadabilityDiag,
  };
}

/**
 * STEP 1.6.4 — Strict Binance Spot raw DOM: rows ONLY from live bid/ask arrays.
 */
type PriceBandAccumulator = {
  band: VisiblePriceBand;
  bidLevelCount: number;
  askLevelCount: number;
  bidSumSize: number;
  askSumSize: number;
  bidMaxSize: number;
  askMaxSize: number;
  bidMaxPrice: number | null;
  askMaxPrice: number | null;
  containsBestBid: boolean;
  containsBestAsk: boolean;
  nearestBidToBandCenter: { price: number; size: number; distancePx: number } | null;
  nearestAskToBandCenter: { price: number; size: number; distancePx: number } | null;
};

let lastDomPriceBandLayoutDiagMs = 0;

function emitDomPriceBandLayoutDiag(diag: DomPriceBandLayoutDiag): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - lastDomPriceBandLayoutDiagMs < 2_000) return;
  lastDomPriceBandLayoutDiagMs = now;
  console.debug("[BOOKMAP_DOM_PRICE_BAND_LAYOUT_DIAG]", diag);
}

function findPriceBandForY(
  bands: PriceBandAccumulator[],
  y: number,
): PriceBandAccumulator | null {
  return (
    bands.find(
      ({ band }, index) =>
        y >= band.topY &&
        (y < band.bottomY || (index === bands.length - 1 && y <= band.bottomY)),
    ) ?? null
  );
}

function buildMajorLabelBandDomRows(params: {
  bids?: OrderbookLevel[];
  asks?: OrderbookLevel[];
  spot: number | null;
  priceRange: PriceRange;
  plotHeight: number;
  priceToY: (price: number) => number;
  priceBands: VisiblePriceBand[];
  showDomNumbers?: boolean;
  majorWallBtc?: number;
  selectedDomSource?: string;
  feedVenue?: string;
  market?: string;
  mode?: string;
  depthPreset?: DepthRangePreset;
}): PriceAlignedRawDomResult {
  if (import.meta.env.DEV) {
    console.warn("[BOOKMAP_DOM_MAJOR_LABEL_COLLAPSE_REGRESSION]", {
      reason: "disabled_major_label_band_builder_called",
      majorLabelBandModeDisabled: false,
    });
  }
  const rawBids = params.bids ?? [];
  const rawAsks = params.asks ?? [];
  const showDomNumbers = params.showDomNumbers !== false;
  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const minPrice = params.priceRange.minPrice;
  const maxPrice = params.priceRange.maxPrice;
  const priceRangeUsd = Math.max(1e-9, maxPrice - minPrice);
  const pixelsPerDollar = params.plotHeight / priceRangeUsd;
  const fullTextThresholdPx = 16;
  const selectedDepthMode = params.depthPreset ?? "local";
  const microModeActive =
    selectedDepthMode === "local" ||
    priceRangeUsd <= BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD * 4 ||
    pixelsPerDollar >= 0.18;
  const visibleBands = params.priceBands
    .filter(
      (band) =>
        Number.isFinite(band.topY) &&
        Number.isFinite(band.bottomY) &&
        band.bottomY > band.topY,
    )
    .sort((a, b) => a.topY - b.topY);
  const bands: PriceBandAccumulator[] = visibleBands.map((band) => ({
    band,
    bidLevelCount: 0,
    askLevelCount: 0,
    bidSumSize: 0,
    askSumSize: 0,
    bidMaxSize: 0,
    askMaxSize: 0,
    bidMaxPrice: null,
    askMaxPrice: null,
    containsBestBid: false,
    containsBestAsk: false,
    nearestBidToBandCenter: null,
    nearestAskToBandCenter: null,
  }));
  const bestBid = rawBids.find((level) => Number(level.sizeBtc) > 0) ?? null;
  const bestAsk = rawAsks.find((level) => Number(level.sizeBtc) > 0) ?? null;
  let levelsOutsideChartRange = 0;
  let visibleRawBidLevels = 0;
  let visibleRawAskLevels = 0;
  let bidLevelsAssignedToBands = 0;
  let askLevelsAssignedToBands = 0;

  const ingest = (level: OrderbookLevel, side: "bid" | "ask") => {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) return;
    const y = params.priceToY(price);
    const inPlot =
      price >= minPrice &&
      price <= maxPrice &&
      Number.isFinite(y) &&
      y >= BOOKMAP_PLOT_PAD.top &&
      y <= params.plotHeight - BOOKMAP_PLOT_PAD.bottom;
    if (!inPlot) {
      levelsOutsideChartRange += 1;
      return;
    }
    if (side === "bid") visibleRawBidLevels += 1;
    else visibleRawAskLevels += 1;

    const target = findPriceBandForY(bands, y);
    if (!target) {
      if (import.meta.env.DEV) {
        console.warn("[BOOKMAP_DOM_PRICE_BAND_ASSIGNMENT_FAILED]", {
          side,
          price,
          y,
          visiblePriceBandCount: visibleBands.length,
        });
      }
      return;
    }

    const distancePx = Math.abs(y - target.band.centerY);
    if (side === "bid") {
      target.bidLevelCount += 1;
      target.bidSumSize += size;
      if (size > target.bidMaxSize) {
        target.bidMaxSize = size;
        target.bidMaxPrice = price;
      }
      if (
        !target.nearestBidToBandCenter ||
        distancePx < target.nearestBidToBandCenter.distancePx
      ) {
        target.nearestBidToBandCenter = { price, size, distancePx };
      }
      target.containsBestBid =
        target.containsBestBid ||
        (bestBid != null &&
          Math.abs(price - Number(bestBid.price)) <= BOOKMAP_BTCUSDT_TICK_SIZE);
      bidLevelsAssignedToBands += 1;
    } else {
      target.askLevelCount += 1;
      target.askSumSize += size;
      if (size > target.askMaxSize) {
        target.askMaxSize = size;
        target.askMaxPrice = price;
      }
      if (
        !target.nearestAskToBandCenter ||
        distancePx < target.nearestAskToBandCenter.distancePx
      ) {
        target.nearestAskToBandCenter = { price, size, distancePx };
      }
      target.containsBestAsk =
        target.containsBestAsk ||
        (bestAsk != null &&
          Math.abs(price - Number(bestAsk.price)) <= BOOKMAP_BTCUSDT_TICK_SIZE);
      askLevelsAssignedToBands += 1;
    }
  };

  rawBids.forEach((level) => ingest(level, "bid"));
  rawAsks.forEach((level) => ingest(level, "ask"));

  const liquidityBands = bands.filter(
    (entry) => entry.bidLevelCount > 0 || entry.askLevelCount > 0,
  );
  const maxBid = liquidityBands.reduce((max, entry) => Math.max(max, entry.bidSumSize), 0);
  const maxAsk = liquidityBands.reduce((max, entry) => Math.max(max, entry.askSumSize), 0);
  const maxCob = liquidityBands.reduce(
    (max, entry) => Math.max(max, entry.bidSumSize + entry.askSumSize),
    0,
  );
  const visibleMaxLiquidity = Math.max(maxBid, maxAsk, 1e-9);
  let svpRunning = 0;
  let maxPriceBandAlignmentErrorPx = 0;

  const rows: DomLadderRow[] = liquidityBands.map((entry) => {
    const bandHeight = entry.band.bottomY - entry.band.topY;
    const bidSize = entry.bidSumSize;
    const askSize = entry.askSumSize;
    const cobSize = bidSize + askSize;
    svpRunning += cobSize;
    const textFitsBand = showDomNumbers && bandHeight >= fullTextThresholdPx;
    const showBandText =
      textFitsBand &&
      (microModeActive ||
        cobSize >= visibleMaxLiquidity * 0.2 ||
        entry.containsBestBid ||
        entry.containsBestAsk);
    const renderedTop = entry.band.centerY - bandHeight / 2;
    const renderedBottom = entry.band.centerY + bandHeight / 2;
    const alignmentError = Math.max(
      Math.max(0, entry.band.topY - renderedTop),
      Math.max(0, renderedBottom - entry.band.bottomY),
    );
    maxPriceBandAlignmentErrorPx = Math.max(maxPriceBandAlignmentErrorPx, alignmentError);
    if (alignmentError > 0.5 && import.meta.env.DEV) {
      console.warn("[BOOKMAP_DOM_VALUE_NOT_IN_PRICE_BAND]", {
        labelPrice: entry.band.labelPrice,
        renderedTop,
        renderedBottom,
        bandTopY: entry.band.topY,
        bandBottomY: entry.band.bottomY,
        alignmentErrorPx: alignmentError,
      });
    }
    if (
      import.meta.env.DEV &&
      ((bidSize > 0 && entry.bidLevelCount === 0) ||
        (askSize > 0 && entry.askLevelCount === 0))
    ) {
      console.warn("[BOOKMAP_DOM_FAKE_VALUE_REGRESSION]", {
        labelPrice: entry.band.labelPrice,
        bidSize,
        askSize,
        bidLevelCount: entry.bidLevelCount,
        askLevelCount: entry.askLevelCount,
      });
    }

    return {
      price: entry.band.labelPrice,
      priceLabel: entry.band.label,
      bidSize,
      askSize,
      bidState: bidSize > 0 ? "live" : "none",
      askState: askSize > 0 ? "live" : "none",
      bidLastKnownSize: 0,
      askLastKnownSize: 0,
      cobSize,
      svpCumulative: svpRunning,
      y: entry.band.centerY,
      bucketHeight: bandHeight,
      barHeight: bandHeight,
      bandTopY: entry.band.topY,
      bandBottomY: entry.band.bottomY,
      isSpotBucket:
        params.spot != null &&
        params.spot >= entry.band.minPrice &&
        params.spot <= entry.band.maxPrice,
      showLabel: false,
      showTick: false,
      showDomText: showBandText,
      showBidText: showBandText && bidSize > 0,
      showAskText: showBandText && askSize > 0,
      showCobText: showBandText && cobSize > 0,
      showSvpText: showBandText && svpRunning > 0,
      isMajorWall: cobSize >= majorWallBtc,
      bidBarPct: maxBid > 0 ? (bidSize / maxBid) * 100 : 0,
      askBarPct: maxAsk > 0 ? (askSize / maxAsk) * 100 : 0,
      cobBarPct: maxCob > 0 ? (cobSize / maxCob) * 100 : 0,
      hasLiveBid: bidSize > 0,
      hasLiveAsk: askSize > 0,
      hasHistoricalWall: false,
      wallSize: 0,
      wallSide: null,
      wallTier: null,
      wallIsStale: false,
    };
  });

  const bidBarsRendered = rows.filter((row) => row.bidSize > 0).length;
  const askBarsRendered = rows.filter((row) => row.askSize > 0).length;
  const cobBarsRendered = rows.filter((row) => row.cobSize > 0).length;
  const svpBarsRendered = rows.filter((row) => row.svpCumulative > 0).length;
  const bidLabelsRendered = rows.filter((row) => row.showBidText).length;
  const askLabelsRendered = rows.filter((row) => row.showAskText).length;
  const cobLabelsRendered = rows.filter((row) => row.showCobText).length;
  const svpLabelsRendered = rows.filter((row) => row.showSvpText).length;
  const bestBidVisible = liquidityBands.some((entry) => entry.containsBestBid);
  const bestAskVisible = liquidityBands.some((entry) => entry.containsBestAsk);
  const strongestBid = liquidityBands.reduce<PriceBandAccumulator | null>(
    (best, entry) => (!best || entry.bidSumSize > best.bidSumSize ? entry : best),
    null,
  );
  const strongestAsk = liquidityBands.reduce<PriceBandAccumulator | null>(
    (best, entry) => (!best || entry.askSumSize > best.askSumSize ? entry : best),
    null,
  );
  const maxBidLevelsPerBand = liquidityBands.reduce(
    (max, entry) => Math.max(max, entry.bidLevelCount),
    0,
  );
  const maxAskLevelsPerBand = liquidityBands.reduce(
    (max, entry) => Math.max(max, entry.askLevelCount),
    0,
  );
  const aggregatedLevels = liquidityBands.reduce(
    (sum, entry) =>
      sum +
      Math.max(0, entry.bidLevelCount - 1) +
      Math.max(0, entry.askLevelCount - 1),
    0,
  );
  const totalAssignedLevels = bidLevelsAssignedToBands + askLevelsAssignedToBands;
  const averageLevelsPerBand =
    liquidityBands.length > 0 ? totalAssignedLevels / liquidityBands.length : 0;

  const priceBandLayoutDiag: DomPriceBandLayoutDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domUsesPriceColumnBands: true,
    independentPixelBinsDisabled: true,
    independentDomScroll: false,
    extraPriceColumnEnabled: false,
    visiblePriceBandCount: visibleBands.length,
    first10PriceBands: visibleBands.slice(0, 10).map((band) => ({
      labelPrice: band.labelPrice,
      topY: band.topY,
      bottomY: band.bottomY,
      minPrice: band.minPrice,
      maxPrice: band.maxPrice,
    })),
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    plotHeightPx: params.plotHeight,
    pixelsPerDollar,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleRawBidLevels,
    visibleRawAskLevels,
    bidLevelsAssignedToBands,
    askLevelsAssignedToBands,
    bandsWithBidLiquidity: bidBarsRendered,
    bandsWithAskLiquidity: askBarsRendered,
    bandsWithCobLiquidity: cobBarsRendered,
    bandsWithSvp: svpBarsRendered,
    bidBarsRendered,
    askBarsRendered,
    cobBarsRendered,
    svpBarsRendered,
    bidLabelsRendered,
    askLabelsRendered,
    cobLabelsRendered,
    svpLabelsRendered,
    maxBidLevelsPerBand,
    maxAskLevelsPerBand,
    strongestBidBand:
      strongestBid && strongestBid.bidSumSize > 0
        ? {
            labelPrice: strongestBid.band.labelPrice,
            sumSize: strongestBid.bidSumSize,
            maxSize: strongestBid.bidMaxSize,
          }
        : null,
    strongestAskBand:
      strongestAsk && strongestAsk.askSumSize > 0
        ? {
            labelPrice: strongestAsk.band.labelPrice,
            sumSize: strongestAsk.askSumSize,
            maxSize: strongestAsk.askMaxSize,
          }
        : null,
    bestBidBandVisible: bestBidVisible,
    bestAskBandVisible: bestAskVisible,
    rawDataMutatedForLayout: false,
    syntheticRowsCreated: 0,
    valuesCreatedWithoutBookLevel: 0,
    maxPriceBandAlignmentErrorPx,
  };
  emitDomPriceBandLayoutDiag(priceBandLayoutDiag);

  const alignmentDiag: DomPriceAlignmentDiag = {
    enabled: true,
    selectedDomSource: params.selectedDomSource ?? "spot",
    symbol: params.market ?? "BTCUSDT",
    venue: params.feedVenue ?? "binance_spot",
    chartVisiblePriceMin: minPrice,
    chartVisiblePriceMax: maxPrice,
    chartPriceRangeUsd: priceRangeUsd,
    priceToYSource: "BookmapPriceScale.priceToY",
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    domUsesRowIndexY: false,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleBidLevelsRendered: visibleRawBidLevels,
    visibleAskLevelsRendered: visibleRawAskLevels,
    levelsOutsideChartRange,
    bidAskLinesY: {
      bid: bestBid ? params.priceToY(Number(bestBid.price)) : null,
      ask: bestAsk ? params.priceToY(Number(bestAsk.price)) : null,
    },
    nearestDomBidY: rows.find((row) => row.hasLiveBid)?.y ?? null,
    nearestDomAskY: rows.find((row) => row.hasLiveAsk)?.y ?? null,
    maxAlignmentErrorPx: maxPriceBandAlignmentErrorPx,
    syntheticRowsCreated: 0,
    extraPriceColumnEnabled: false,
    chartRangeControlsDomVisibility: true,
    heatmapBucketControlsDom: false,
    localDepthControlsDomRows: false,
    svpCreatesDomRows: false,
    collapsedVisualGroups: 0,
    aggregatedBecausePixelCollision: 0,
  };
  emitDomPriceAlignmentDiag(alignmentDiag);

  const autoScaleDiag: DomAutoScaleLayoutDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    visibleRawBidLevels,
    visibleRawAskLevels,
    pixelsPerDollar,
    minAdjacentLevelDistancePx: null,
    averageAdjacentLevelDistancePx: null,
    textHeightPx: 13,
    fullTextThresholdPx,
    collisionGroupsBid: liquidityBands.filter((entry) => entry.bidLevelCount > 1).length,
    collisionGroupsAsk: liquidityBands.filter((entry) => entry.askLevelCount > 1).length,
    collisionGroupsCob: liquidityBands.filter(
      (entry) => entry.bidLevelCount + entry.askLevelCount > 1,
    ).length,
    collisionGroupsSvp: liquidityBands.filter(
      (entry) => entry.bidLevelCount + entry.askLevelCount > 1,
    ).length,
    individualLabelsRendered: rows.filter(
      (row) => row.showDomText && (row.bidSize > 0) !== (row.askSize > 0),
    ).length,
    groupedLabelsRendered: rows.filter(
      (row) => row.showDomText && row.bidSize > 0 && row.askSize > 0,
    ).length,
    labelsHiddenDueToDensity: rows.filter((row) => !row.showDomText).length,
    barsRendered: cobBarsRendered,
    strongestHiddenValue: rows.reduce(
      (max, row) => (!row.showDomText ? Math.max(max, row.cobSize) : max),
      0,
    ),
    bestBidVisible,
    bestAskVisible,
    maxAlignmentErrorPx: maxPriceBandAlignmentErrorPx,
    extraPriceColumnEnabled: false,
    rawDataMutatedForLayout: false,
  };
  emitDomAutoScaleLayoutDiag(autoScaleDiag);

  const lodDiag: DomLodRendererDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    extraPriceColumnEnabled: false,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleRawBidLevels,
    visibleRawAskLevels,
    bidVisualGroups: bidBarsRendered,
    askVisualGroups: askBarsRendered,
    cobVisualGroups: cobBarsRendered,
    svpVisualGroups: svpBarsRendered,
    bidBarsRendered,
    askBarsRendered,
    cobBarsRendered,
    svpBarsRendered,
    bidLabelsRendered,
    askLabelsRendered,
    cobLabelsRendered,
    svpLabelsRendered,
    labelsHiddenDueToCollision: rows.filter((row) => !row.showDomText).length,
    hiddenLabelsWithBarsStillRendered: rows.filter(
      (row) => !row.showDomText && row.cobSize > 0,
    ).length,
    strongestBidGroupValue: maxBid,
    strongestAskGroupValue: maxAsk,
    bestBidVisible,
    bestAskVisible,
    visibleMaxLiquidity,
    pixelsPerDollar,
    minCollisionBandPx: 0,
    averageLevelsPerVisualGroup: averageLevelsPerBand,
    maxLevelsPerVisualGroup: Math.max(maxBidLevelsPerBand, maxAskLevelsPerBand),
    rawDataMutatedForLayout: false,
    syntheticRowsCreated: 0,
    valuesCreatedWithoutBookLevel: 0,
  };
  emitDomLodRendererDiag(lodDiag);

  const microReadabilityDiag: DomMicroReadabilityDiag = {
    selectedDepthMode,
    visiblePriceRangeUsd: priceRangeUsd,
    pixelsPerDollar,
    microModeActive,
    collisionBandPx: 0,
    nearPricePriorityUsd: BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD,
    visibleRawBidLevels,
    visibleRawAskLevels,
    individualBidLabelsRendered: bidLabelsRendered,
    individualAskLabelsRendered: askLabelsRendered,
    groupedBidLabelsRendered: liquidityBands.filter(
      (entry) => entry.bidLevelCount > 1 && entry.band.bottomY - entry.band.topY >= fullTextThresholdPx,
    ).length,
    groupedAskLabelsRendered: liquidityBands.filter(
      (entry) => entry.askLevelCount > 1 && entry.band.bottomY - entry.band.topY >= fullTextThresholdPx,
    ).length,
    bidBarsRendered,
    askBarsRendered,
    labelsHiddenDueToDensity: rows.filter((row) => !row.showDomText).length,
    bestBidVisible,
    bestAskVisible,
    largeLevelsVisible: rows.filter((row) => row.cobSize >= visibleMaxLiquidity * 0.52).length,
    maxLabelsPerColumn: visibleBands.length,
    domUsesSharedPriceScale: true,
    independentDomScroll: false,
    syntheticRowsCreated: 0,
  };
  emitDomMicroReadabilityDiag(microReadabilityDiag);

  return {
    rows,
    stats: {
      ladderRows: rows.length,
      liveRows: rows.length,
      lastKnownRows: 0,
      wallRows: 0,
      expectedDomRowCount: rows.length,
      zeroLiquidityRows: 0,
      rowsWithBidLiquidity: bidBarsRendered,
      rowsWithAskLiquidity: askBarsRendered,
      rawBidLevelsCount: rawBids.length,
      rawAskLevelsCount: rawAsks.length,
      aggregatedBidLevelsCount: aggregatedLevels,
      aggregatedAskLevelsCount: aggregatedLevels,
      domUsesContinuousLadder: false,
    },
    alignmentDiag,
    autoScaleDiag,
    lodDiag,
    microReadabilityDiag,
    priceBandLayoutDiag,
  };
}

type MinorSlotLevel = {
  price: number;
  size: number;
  y: number;
  side: "bid" | "ask";
  exact: boolean;
};

type MinorSlotAccumulator = {
  key: string;
  source: "raw" | "visual-bin";
  levels: MinorSlotLevel[];
  bidLevelCount: number;
  askLevelCount: number;
  bidSumSize: number;
  askSumSize: number;
  bidMaxSize: number;
  askMaxSize: number;
  bidMaxPrice: number | null;
  askMaxPrice: number | null;
  containsBestBid: boolean;
  containsBestAsk: boolean;
};

let lastDomMinorLadderSlotDiagMs = 0;

function emitDomMinorLadderSlotDiag(diag: DomMinorLadderSlotDiag): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - lastDomMinorLadderSlotDiagMs < 2_000) return;
  lastDomMinorLadderSlotDiagMs = now;
  console.debug("[BOOKMAP_DOM_MINOR_LADDER_SLOT_DIAG]", diag);
}

export function buildPriceAlignedRawDomRows(params: {
  bids?: OrderbookLevel[];
  asks?: OrderbookLevel[];
  spot: number | null;
  priceRange: PriceRange;
  plotHeight: number;
  priceToY: (price: number) => number;
  majorPriceLabelCount: number;
  showDomNumbers?: boolean;
  majorWallBtc?: number;
  selectedDomSource?: string;
  feedVenue?: string;
  market?: string;
  mode?: string;
  depthPreset?: DepthRangePreset;
}): PriceAlignedRawDomResult {
  const rawBids = params.bids ?? [];
  const rawAsks = params.asks ?? [];
  const showDomNumbers = params.showDomNumbers !== false;
  const majorWallBtc = params.majorWallBtc ?? HEATMAP_MAJOR_WALL_BTC;
  const minPrice = params.priceRange.minPrice;
  const maxPrice = params.priceRange.maxPrice;
  const visiblePriceRangeUsd = Math.max(1e-9, maxPrice - minPrice);
  const plotTop = BOOKMAP_PLOT_PAD.top;
  const plotBottom = Math.max(plotTop, params.plotHeight - BOOKMAP_PLOT_PAD.bottom);
  const plotHeightPx = Math.max(1, plotBottom - plotTop);
  const pixelsPerDollar = plotHeightPx / visiblePriceRangeUsd;
  const selectedDepthMode = params.depthPreset ?? "local";
  const microModeActive =
    selectedDepthMode === "local" ||
    visiblePriceRangeUsd <= BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD * 4 ||
    pixelsPerDollar >= 0.18;
  const scalpingModeActive =
    !microModeActive &&
    (selectedDepthMode === "intraday" || visiblePriceRangeUsd <= 6_000);
  const minSlotHeightPx = microModeActive ? 8 : scalpingModeActive ? 10 : 14;
  const binHeightPx = microModeActive ? 9 : scalpingModeActive ? 12 : 18;
  const textHeightPx = 14;
  const bestBid = rawBids.reduce<OrderbookLevel | null>((best, level) => {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return best;
    return !best || price > Number(best.price) ? level : best;
  }, null);
  const bestAsk = rawAsks.reduce<OrderbookLevel | null>((best, level) => {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return best;
    return !best || price < Number(best.price) ? level : best;
  }, null);
  const bestBidPrice = bestBid ? Number(bestBid.price) : null;
  const bestAskPrice = bestAsk ? Number(bestAsk.price) : null;
  let levelsOutsideChartRange = 0;

  const visibleLevels: MinorSlotLevel[] = [];
  const collect = (level: OrderbookLevel, side: "bid" | "ask") => {
    const price = Number(level.price);
    const size = Number(level.sizeBtc);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) return;
    const y = params.priceToY(price);
    if (
      price < minPrice ||
      price > maxPrice ||
      !Number.isFinite(y) ||
      y < plotTop ||
      y > plotBottom
    ) {
      levelsOutsideChartRange += 1;
      return;
    }
    visibleLevels.push({ price, size, y, side, exact: false });
  };
  rawBids.forEach((level) => collect(level, "bid"));
  rawAsks.forEach((level) => collect(level, "ask"));
  visibleLevels.sort((a, b) => a.y - b.y || a.price - b.price);

  for (let index = 0; index < visibleLevels.length; index += 1) {
    const level = visibleLevels[index]!;
    const previous = visibleLevels[index - 1];
    const next = visibleLevels[index + 1];
    const previousGap = previous ? Math.abs(level.y - previous.y) : Number.POSITIVE_INFINITY;
    const nextGap = next ? Math.abs(next.y - level.y) : Number.POSITIVE_INFINITY;
    level.exact = Math.min(previousGap, nextGap) >= minSlotHeightPx;
  }

  const slotsByKey = new Map<string, MinorSlotAccumulator>();
  let rawLevelsAssignedToExactSlots = 0;
  let rawLevelsAssignedToMinorBins = 0;
  const assignedLevels = new Set<MinorSlotLevel>();

  for (const level of visibleLevels) {
    const binIndex = Math.floor((level.y - plotTop) / binHeightPx);
    const key = level.exact
      ? `raw:${level.price.toFixed(8)}`
      : `bin:${binIndex}`;
    let slot = slotsByKey.get(key);
    if (!slot) {
      slot = {
        key,
        source: level.exact ? "raw" : "visual-bin",
        levels: [],
        bidLevelCount: 0,
        askLevelCount: 0,
        bidSumSize: 0,
        askSumSize: 0,
        bidMaxSize: 0,
        askMaxSize: 0,
        bidMaxPrice: null,
        askMaxPrice: null,
        containsBestBid: false,
        containsBestAsk: false,
      };
      slotsByKey.set(key, slot);
    }
    slot.levels.push(level);
    assignedLevels.add(level);
    if (level.exact) rawLevelsAssignedToExactSlots += 1;
    else rawLevelsAssignedToMinorBins += 1;

    if (level.side === "bid") {
      slot.bidLevelCount += 1;
      slot.bidSumSize += level.size;
      if (level.size > slot.bidMaxSize) {
        slot.bidMaxSize = level.size;
        slot.bidMaxPrice = level.price;
      }
      slot.containsBestBid =
        slot.containsBestBid ||
        (bestBidPrice != null &&
          Math.abs(level.price - bestBidPrice) <= BOOKMAP_BTCUSDT_TICK_SIZE);
    } else {
      slot.askLevelCount += 1;
      slot.askSumSize += level.size;
      if (level.size > slot.askMaxSize) {
        slot.askMaxSize = level.size;
        slot.askMaxPrice = level.price;
      }
      slot.containsBestAsk =
        slot.containsBestAsk ||
        (bestAskPrice != null &&
          Math.abs(level.price - bestAskPrice) <= BOOKMAP_BTCUSDT_TICK_SIZE);
    }
  }

  if (import.meta.env.DEV && assignedLevels.size !== visibleLevels.length) {
    for (const level of visibleLevels) {
      if (assignedLevels.has(level)) continue;
      console.warn("[BOOKMAP_DOM_RAW_LEVEL_NOT_ASSIGNED]", {
        side: level.side,
        price: level.price,
        y: level.y,
      });
    }
  }

  const slotEntries = Array.from(slotsByKey.values())
    .map((slot) => {
      const representative =
        slot.levels.find(
          (level) =>
            (level.side === "bid" && slot.containsBestBid) ||
            (level.side === "ask" && slot.containsBestAsk),
        ) ??
        slot.levels.reduce((strongest, level) =>
          level.size > strongest.size ? level : strongest,
        );
      const centerY = params.priceToY(representative.price);
      const slotHeight = slot.source === "raw" ? minSlotHeightPx : binHeightPx;
      const halfHeight = slotHeight / 2;
      const topY = Math.max(plotTop, centerY - halfHeight);
      const bottomY = Math.min(plotBottom, centerY + halfHeight);
      const prices = slot.levels.map((level) => level.price);
      const minorSlot: DomMinorPriceSlot = {
        slotIndex: 0,
        centerPrice: representative.price,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        centerY,
        topY,
        bottomY,
        source: slot.source,
      };
      return { slot, minorSlot };
    })
    .sort((a, b) => a.minorSlot.centerY - b.minorSlot.centerY);
  slotEntries.forEach((entry, index) => {
    entry.minorSlot.slotIndex = index;
  });

  const maxBid = slotEntries.reduce(
    (max, entry) => Math.max(max, entry.slot.bidSumSize),
    0,
  );
  const maxAsk = slotEntries.reduce(
    (max, entry) => Math.max(max, entry.slot.askSumSize),
    0,
  );
  const maxCob = slotEntries.reduce(
    (max, entry) =>
      Math.max(max, entry.slot.bidSumSize + entry.slot.askSumSize),
    0,
  );
  const visibleMaxLiquidity = Math.max(maxBid, maxAsk, 1e-9);
  const maxLabelsPerColumn = Math.max(8, Math.floor(plotHeightPx / textHeightPx));

  const chooseLabelSlots = (side: "bid" | "ask"): Set<number> => {
    const acceptedYs: number[] = [];
    const selected = new Set<number>();
    if (!showDomNumbers) return selected;
    const ranked = slotEntries
      .map((entry, index) => {
        const size =
          side === "bid" ? entry.slot.bidSumSize : entry.slot.askSumSize;
        const containsBest =
          side === "bid"
            ? entry.slot.containsBestBid
            : entry.slot.containsBestAsk;
        const nearSpot =
          params.spot == null
            ? false
            : Math.abs(entry.minorSlot.centerPrice - params.spot) <=
              BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD;
        return {
          index,
          y: entry.minorSlot.centerY,
          size,
          containsBest,
          score:
            (containsBest ? 10_000_000 : 0) +
            (nearSpot ? 250_000 : 0) +
            size * 100,
        };
      })
      .filter((entry) => entry.size > 0)
      .sort((a, b) => b.score - a.score);

    for (const candidate of ranked) {
      if (selected.size >= maxLabelsPerColumn) break;
      const collides = acceptedYs.some(
        (acceptedY) => Math.abs(acceptedY - candidate.y) < textHeightPx,
      );
      if (collides && !candidate.containsBest) continue;
      selected.add(candidate.index);
      acceptedYs.push(candidate.y);
    }
    return selected;
  };

  const bidLabelSlots = chooseLabelSlots("bid");
  const askLabelSlots = chooseLabelSlots("ask");
  let svpRunning = 0;
  let maxAlignmentErrorPx = 0;

  const rows: DomLadderRow[] = slotEntries.map((entry, index) => {
    const { slot, minorSlot } = entry;
    const bidSize = slot.bidSumSize;
    const askSize = slot.askSumSize;
    const cobSize = bidSize + askSize;
    svpRunning += cobSize;
    const renderedY = minorSlot.centerY;
    const expectedY = params.priceToY(minorSlot.centerPrice);
    const alignmentErrorPx = Math.abs(renderedY - expectedY);
    maxAlignmentErrorPx = Math.max(maxAlignmentErrorPx, alignmentErrorPx);
    if (alignmentErrorPx > 1 && import.meta.env.DEV) {
      console.warn("[BOOKMAP_DOM_PRICE_ALIGNMENT_REGRESSION]", {
        representativePrice: minorSlot.centerPrice,
        renderedY,
        expectedY,
        errorPx: alignmentErrorPx,
      });
    }
    if (
      import.meta.env.DEV &&
      ((bidSize > 0 && slot.bidLevelCount === 0) ||
        (askSize > 0 && slot.askLevelCount === 0))
    ) {
      console.warn("[BOOKMAP_DOM_FAKE_VALUE_REGRESSION]", {
        representativePrice: minorSlot.centerPrice,
        bidSize,
        askSize,
        bidLevelCount: slot.bidLevelCount,
        askLevelCount: slot.askLevelCount,
      });
    }

    const showBidText = bidLabelSlots.has(index);
    const showAskText = askLabelSlots.has(index);
    const showCobText =
      showDomNumbers &&
      (slot.containsBestBid ||
        slot.containsBestAsk ||
        cobSize >= visibleMaxLiquidity * (microModeActive ? 0.72 : 0.55));
    const showSvpText =
      showDomNumbers &&
      !microModeActive &&
      (showBidText || showAskText) &&
      cobSize >= visibleMaxLiquidity * 0.35;
    const slotHeight = minorSlot.bottomY - minorSlot.topY;
    const renderedHeight =
      showBidText || showAskText || showCobText || showSvpText
        ? Math.max(slotHeight, textHeightPx)
        : slotHeight;
    const renderedTopY = Math.max(plotTop, minorSlot.centerY - renderedHeight / 2);
    const renderedBottomY = Math.min(
      plotBottom,
      minorSlot.centerY + renderedHeight / 2,
    );

    return {
      price: minorSlot.centerPrice,
      priceLabel: formatRawBinanceDomPrice(minorSlot.centerPrice),
      bidSize,
      askSize,
      bidState: bidSize > 0 ? "live" : "none",
      askState: askSize > 0 ? "live" : "none",
      bidLastKnownSize: 0,
      askLastKnownSize: 0,
      cobSize,
      svpCumulative: svpRunning,
      y: minorSlot.centerY,
      bucketHeight: renderedBottomY - renderedTopY,
      barHeight: renderedBottomY - renderedTopY,
      bandTopY: renderedTopY,
      bandBottomY: renderedBottomY,
      isSpotBucket:
        params.spot != null &&
        params.spot >= minorSlot.minPrice &&
        params.spot <= minorSlot.maxPrice,
      showLabel: false,
      showTick: false,
      showDomText:
        showBidText || showAskText || showCobText || showSvpText,
      showBidText,
      showAskText,
      showCobText,
      showSvpText,
      isMajorWall: cobSize >= majorWallBtc,
      bidBarPct: maxBid > 0 ? (bidSize / maxBid) * 100 : 0,
      askBarPct: maxAsk > 0 ? (askSize / maxAsk) * 100 : 0,
      cobBarPct: maxCob > 0 ? (cobSize / maxCob) * 100 : 0,
      hasLiveBid: bidSize > 0,
      hasLiveAsk: askSize > 0,
      hasHistoricalWall: false,
      wallSize: 0,
      wallSide: null,
      wallTier: null,
      wallIsStale: false,
    };
  });

  const visibleRawBidLevels = visibleLevels.filter(
    (level) => level.side === "bid",
  ).length;
  const visibleRawAskLevels = visibleLevels.filter(
    (level) => level.side === "ask",
  ).length;
  const bidSlotsRendered = rows.filter((row) => row.bidSize > 0).length;
  const askSlotsRendered = rows.filter((row) => row.askSize > 0).length;
  const cobSlotsRendered = rows.filter((row) => row.cobSize > 0).length;
  const svpSlotsRendered = rows.filter((row) => row.svpCumulative > 0).length;
  const bidLabelsRendered = rows.filter((row) => row.showBidText).length;
  const askLabelsRendered = rows.filter((row) => row.showAskText).length;
  const labelsHiddenButBarsRendered = rows.filter(
    (row) =>
      row.cobSize > 0 && !row.showBidText && !row.showAskText && !row.showCobText,
  ).length;
  const bestBidVisible = slotEntries.some(
    (entry) => entry.slot.containsBestBid,
  );
  const bestAskVisible = slotEntries.some(
    (entry) => entry.slot.containsBestAsk,
  );
  const largeLevelsVisible = rows.filter(
    (row) => row.cobSize >= visibleMaxLiquidity * 0.52,
  ).length;
  const aggregatedBidLevelsCount = slotEntries.reduce(
    (sum, entry) => sum + Math.max(0, entry.slot.bidLevelCount - 1),
    0,
  );
  const aggregatedAskLevelsCount = slotEntries.reduce(
    (sum, entry) => sum + Math.max(0, entry.slot.askLevelCount - 1),
    0,
  );
  const averageLevelsPerSlot =
    slotEntries.length > 0 ? visibleLevels.length / slotEntries.length : 0;
  const maxLevelsPerSlot = slotEntries.reduce(
    (max, entry) => Math.max(max, entry.slot.levels.length),
    0,
  );
  const minorLadderSlotDiag: DomMinorLadderSlotDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    majorPriceLabelCount: params.majorPriceLabelCount,
    minorDomSlotCount: slotEntries.length,
    visibleRawBidLevels,
    visibleRawAskLevels,
    rawLevelsAssignedToExactSlots,
    rawLevelsAssignedToMinorBins,
    rawLevelsCollapsedIntoMajorLabels: 0,
    microModeActive,
    binHeightPx,
    minSlotHeightPx,
    pixelsPerDollar,
    visiblePriceRangeUsd,
    bestBidVisible,
    bestAskVisible,
    largeLevelsVisible,
    bidSlotsRendered,
    askSlotsRendered,
    cobSlotsRendered,
    svpSlotsRendered,
    bidLabelsRendered,
    askLabelsRendered,
    labelsHiddenButBarsRendered,
    majorLabelBandModeDisabled: true,
    independentDomScroll: false,
    extraPriceColumnEnabled: false,
    syntheticRowsCreated: 0,
    rawDataMutatedForLayout: false,
  };
  emitDomMinorLadderSlotDiag(minorLadderSlotDiag);

  if (
    import.meta.env.DEV &&
    visibleLevels.length >= Math.max(20, params.majorPriceLabelCount * 3) &&
    slotEntries.length <= params.majorPriceLabelCount + 1
  ) {
    console.warn("[BOOKMAP_DOM_MAJOR_LABEL_COLLAPSE_REGRESSION]", {
      visibleRawLevels: visibleLevels.length,
      majorPriceLabelCount: params.majorPriceLabelCount,
      minorDomSlotCount: slotEntries.length,
    });
  }

  const alignmentDiag: DomPriceAlignmentDiag = {
    enabled: true,
    selectedDomSource: params.selectedDomSource ?? "spot",
    symbol: params.market ?? "BTCUSDT",
    venue: params.feedVenue ?? "binance_spot",
    chartVisiblePriceMin: minPrice,
    chartVisiblePriceMax: maxPrice,
    chartPriceRangeUsd: visiblePriceRangeUsd,
    priceToYSource: "BookmapPriceScale.priceToY",
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    domUsesRowIndexY: false,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleBidLevelsRendered: visibleRawBidLevels,
    visibleAskLevelsRendered: visibleRawAskLevels,
    levelsOutsideChartRange,
    bidAskLinesY: {
      bid: bestBidPrice != null ? params.priceToY(bestBidPrice) : null,
      ask: bestAskPrice != null ? params.priceToY(bestAskPrice) : null,
    },
    nearestDomBidY: rows.find((row) => row.hasLiveBid)?.y ?? null,
    nearestDomAskY: rows.find((row) => row.hasLiveAsk)?.y ?? null,
    maxAlignmentErrorPx,
    syntheticRowsCreated: 0,
    extraPriceColumnEnabled: false,
    chartRangeControlsDomVisibility: true,
    heatmapBucketControlsDom: false,
    localDepthControlsDomRows: false,
    svpCreatesDomRows: false,
    collapsedVisualGroups: 0,
    aggregatedBecausePixelCollision:
      aggregatedBidLevelsCount + aggregatedAskLevelsCount,
  };
  emitDomPriceAlignmentDiag(alignmentDiag);

  const autoScaleDiag: DomAutoScaleLayoutDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    visibleRawBidLevels,
    visibleRawAskLevels,
    pixelsPerDollar,
    minAdjacentLevelDistancePx:
      visibleLevels.length > 1
        ? Math.min(
            ...visibleLevels
              .slice(1)
              .map((level, index) =>
                Math.abs(level.y - visibleLevels[index]!.y),
              ),
          )
        : null,
    averageAdjacentLevelDistancePx:
      visibleLevels.length > 1
        ? visibleLevels
            .slice(1)
            .reduce(
              (sum, level, index) =>
                sum + Math.abs(level.y - visibleLevels[index]!.y),
              0,
            ) /
          (visibleLevels.length - 1)
        : null,
    textHeightPx,
    fullTextThresholdPx: textHeightPx,
    collisionGroupsBid: slotEntries.filter(
      (entry) => entry.slot.bidLevelCount > 1,
    ).length,
    collisionGroupsAsk: slotEntries.filter(
      (entry) => entry.slot.askLevelCount > 1,
    ).length,
    collisionGroupsCob: slotEntries.filter(
      (entry) => entry.slot.levels.length > 1,
    ).length,
    collisionGroupsSvp: slotEntries.filter(
      (entry) => entry.slot.levels.length > 1,
    ).length,
    individualLabelsRendered: bidLabelsRendered + askLabelsRendered,
    groupedLabelsRendered: rows.filter(
      (row, index) =>
        row.showDomText && slotEntries[index]!.slot.levels.length > 1,
    ).length,
    labelsHiddenDueToDensity: labelsHiddenButBarsRendered,
    barsRendered: cobSlotsRendered,
    strongestHiddenValue: rows.reduce(
      (max, row) =>
        !row.showDomText ? Math.max(max, row.cobSize) : max,
      0,
    ),
    bestBidVisible,
    bestAskVisible,
    maxAlignmentErrorPx,
    extraPriceColumnEnabled: false,
    rawDataMutatedForLayout: false,
  };
  emitDomAutoScaleLayoutDiag(autoScaleDiag);

  const lodDiag: DomLodRendererDiag = {
    enabled: true,
    domUsesSharedPriceScale: true,
    domHasIndependentScroll: false,
    extraPriceColumnEnabled: false,
    rawBidLevelsTotal: rawBids.length,
    rawAskLevelsTotal: rawAsks.length,
    visibleRawBidLevels,
    visibleRawAskLevels,
    bidVisualGroups: bidSlotsRendered,
    askVisualGroups: askSlotsRendered,
    cobVisualGroups: cobSlotsRendered,
    svpVisualGroups: svpSlotsRendered,
    bidBarsRendered: bidSlotsRendered,
    askBarsRendered: askSlotsRendered,
    cobBarsRendered: cobSlotsRendered,
    svpBarsRendered: svpSlotsRendered,
    bidLabelsRendered,
    askLabelsRendered,
    cobLabelsRendered: rows.filter((row) => row.showCobText).length,
    svpLabelsRendered: rows.filter((row) => row.showSvpText).length,
    labelsHiddenDueToCollision: labelsHiddenButBarsRendered,
    hiddenLabelsWithBarsStillRendered: labelsHiddenButBarsRendered,
    strongestBidGroupValue: maxBid,
    strongestAskGroupValue: maxAsk,
    bestBidVisible,
    bestAskVisible,
    visibleMaxLiquidity,
    pixelsPerDollar,
    minCollisionBandPx: binHeightPx,
    averageLevelsPerVisualGroup: averageLevelsPerSlot,
    maxLevelsPerVisualGroup: maxLevelsPerSlot,
    rawDataMutatedForLayout: false,
    syntheticRowsCreated: 0,
    valuesCreatedWithoutBookLevel: 0,
  };
  emitDomLodRendererDiag(lodDiag);

  const microReadabilityDiag: DomMicroReadabilityDiag = {
    selectedDepthMode,
    visiblePriceRangeUsd,
    pixelsPerDollar,
    microModeActive,
    collisionBandPx: binHeightPx,
    nearPricePriorityUsd: BOOKMAP_DOM_NEAR_PRICE_PRIORITY_USD,
    visibleRawBidLevels,
    visibleRawAskLevels,
    individualBidLabelsRendered: bidLabelsRendered,
    individualAskLabelsRendered: askLabelsRendered,
    groupedBidLabelsRendered: slotEntries.filter(
      (entry, index) =>
        entry.slot.bidLevelCount > 1 && bidLabelSlots.has(index),
    ).length,
    groupedAskLabelsRendered: slotEntries.filter(
      (entry, index) =>
        entry.slot.askLevelCount > 1 && askLabelSlots.has(index),
    ).length,
    bidBarsRendered: bidSlotsRendered,
    askBarsRendered: askSlotsRendered,
    labelsHiddenDueToDensity: labelsHiddenButBarsRendered,
    bestBidVisible,
    bestAskVisible,
    largeLevelsVisible,
    maxLabelsPerColumn,
    domUsesSharedPriceScale: true,
    independentDomScroll: false,
    syntheticRowsCreated: 0,
  };
  emitDomMicroReadabilityDiag(microReadabilityDiag);

  return {
    rows,
    stats: {
      ladderRows: rows.length,
      liveRows: rows.length,
      lastKnownRows: 0,
      wallRows: 0,
      expectedDomRowCount: rows.length,
      zeroLiquidityRows: 0,
      rowsWithBidLiquidity: bidSlotsRendered,
      rowsWithAskLiquidity: askSlotsRendered,
      rawBidLevelsCount: rawBids.length,
      rawAskLevelsCount: rawAsks.length,
      aggregatedBidLevelsCount,
      aggregatedAskLevelsCount,
      domUsesContinuousLadder: false,
    },
    alignmentDiag,
    autoScaleDiag,
    lodDiag,
    microReadabilityDiag,
    minorLadderSlotDiag,
  };
}

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
