import { AUTO_FIT_RANGE_PCT, DEFAULT_RANGE_PCT } from "./liquidityHeatmapUtils";

export type PriceRange = { minPrice: number; maxPrice: number };

export const BOOKMAP_PLOT_PAD = { top: 8, right: 8, bottom: 8, left: 8 };

/** Hard cap on auto-fit expansion (spot ± this %) unless “full depth” is enabled. */
export const AUTO_FIT_MAX_RANGE_PCT = 0.08;

const MIN_SPAN_RATIO = 0.0008;
const MAX_SPAN_RATIO = 0.2;

export function computeAutoFitRange(spot: number | null, useTight = true): PriceRange {
  const mid = spot && spot > 0 ? spot : 70_000;
  const pct = useTight ? AUTO_FIT_RANGE_PCT : DEFAULT_RANGE_PCT;
  return {
    minPrice: mid * (1 - pct),
    maxPrice: mid * (1 + pct),
  };
}

/**
 * Spot-centered auto range: base band `AUTO_FIT_RANGE_PCT`, optionally widened to include
 * important bid (min) / ask (max) prices, then clamped to `AUTO_FIT_MAX_RANGE_PCT` unless
 * `showFullDepth` is true.
 */
export function computeAutoFitRangeWithImportantPrices(
  spot: number | null,
  importantBidPrices: number[],
  importantAskPrices: number[],
  opts: { includeImportant: boolean; showFullDepth: boolean },
): PriceRange {
  const mid = spot && spot > 0 ? spot : 70_000;
  const baseLo = mid * (1 - AUTO_FIT_RANGE_PCT);
  const baseHi = mid * (1 + AUTO_FIT_RANGE_PCT);

  let minPrice = baseLo;
  let maxPrice = baseHi;

  if (opts.includeImportant) {
    const extraBid =
      importantBidPrices.length > 0 ? Math.min(...importantBidPrices) : baseLo;
    const extraAsk =
      importantAskPrices.length > 0 ? Math.max(...importantAskPrices) : baseHi;
    minPrice = Math.min(baseLo, extraBid);
    maxPrice = Math.max(baseHi, extraAsk);
  }

  if (!opts.showFullDepth) {
    const capLo = mid * (1 - AUTO_FIT_MAX_RANGE_PCT);
    const capHi = mid * (1 + AUTO_FIT_MAX_RANGE_PCT);
    minPrice = Math.max(minPrice, capLo);
    maxPrice = Math.min(maxPrice, capHi);
  }

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice >= maxPrice) {
    return computeAutoFitRange(spot, true);
  }

  return { minPrice, maxPrice };
}

export function clampPriceRange(
  range: PriceRange,
  spot: number | null,
  maxSpanRatio = MAX_SPAN_RATIO,
): PriceRange {
  const mid = spot && spot > 0 ? spot : (range.minPrice + range.maxPrice) / 2;
  let { minPrice, maxPrice } = range;
  let span = maxPrice - minPrice;
  const minSpan = mid * MIN_SPAN_RATIO;
  const maxSpan = mid * maxSpanRatio;

  if (span < minSpan) {
    const c = (minPrice + maxPrice) / 2;
    minPrice = c - minSpan / 2;
    maxPrice = c + minSpan / 2;
    span = minSpan;
  }
  if (span > maxSpan) {
    const c = (minPrice + maxPrice) / 2;
    minPrice = c - maxSpan / 2;
    maxPrice = c + maxSpan / 2;
  }

  if (minPrice <= 0) {
    minPrice = maxPrice * 0.99;
  }

  return { minPrice, maxPrice };
}

export function zoomPriceRange(
  range: PriceRange,
  anchorPrice: number,
  zoomFactor: number,
  spot: number | null,
): PriceRange {
  const { minPrice, maxPrice } = range;
  const newMin = anchorPrice - (anchorPrice - minPrice) * zoomFactor;
  const newMax = anchorPrice + (maxPrice - anchorPrice) * zoomFactor;
  return clampPriceRange({ minPrice: newMin, maxPrice: newMax }, spot);
}

export function panPriceRange(
  range: PriceRange,
  deltaY: number,
  plotHeight: number,
  spot: number | null,
): PriceRange {
  const span = range.maxPrice - range.minPrice;
  const priceDelta = (deltaY / Math.max(plotHeight, 1)) * span;
  return clampPriceRange(
    {
      minPrice: range.minPrice + priceDelta,
      maxPrice: range.maxPrice + priceDelta,
    },
    spot,
  );
}

export function getPlotHeight(containerHeight: number): number {
  return containerHeight - BOOKMAP_PLOT_PAD.top - BOOKMAP_PLOT_PAD.bottom;
}

export function yToPrice(
  y: number,
  range: PriceRange,
  containerHeight: number,
): number {
  const plotH = getPlotHeight(containerHeight);
  const { minPrice, maxPrice } = range;
  const rel = (y - BOOKMAP_PLOT_PAD.top) / Math.max(plotH, 1);
  return maxPrice - rel * (maxPrice - minPrice);
}

export function priceToY(
  price: number,
  range: PriceRange,
  containerHeight: number,
): number {
  const plotH = getPlotHeight(containerHeight);
  const { minPrice, maxPrice } = range;
  const span = maxPrice - minPrice;
  if (span <= 0) return BOOKMAP_PLOT_PAD.top;
  return BOOKMAP_PLOT_PAD.top + ((maxPrice - price) / span) * plotH;
}
