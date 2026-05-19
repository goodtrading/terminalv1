import {
  computeAutoFitRange,
  computeAutoFitRangeWithImportantPrices,
  type PriceRange,
} from "./bookmapViewportUtils";

export type BookmapViewMode = "local" | "fullDepth";

export const LOCAL_RANGE_USD_OPTIONS = [500, 1000, 1500, 2500] as const;
export type LocalRangeUsd = (typeof LOCAL_RANGE_USD_OPTIONS)[number];

export const DEFAULT_LOCAL_RANGE_USD: LocalRangeUsd = 1000;

/** Horizontal future projection to the right of latest data (Bookmap-style). */
export const RIGHT_SPACE_PCT_OPTIONS = [0, 10, 20, 30, 50] as const;
export type RightSpacePct = (typeof RIGHT_SPACE_PCT_OPTIONS)[number];
export const DEFAULT_RIGHT_SPACE_PCT: RightSpacePct = 30;

/** Operational band around spot — fixed USD half-span (Bookmap local). */
export function computeLocalBookmapRange(
  spot: number | null,
  halfSpanUsd: number = DEFAULT_LOCAL_RANGE_USD,
): PriceRange {
  const mid = spot != null && spot > 0 ? spot : 70_000;
  const half = Math.max(100, halfSpanUsd);
  return {
    minPrice: mid - half,
    maxPrice: mid + half,
  };
}

export function resolveBookmapPriceRange(params: {
  viewMode: BookmapViewMode;
  autoFit: boolean;
  manualPriceRange: PriceRange | null;
  spot: number | null;
  localRangeUsd: number;
  showImportantFarLevels: boolean;
  importantBidPrices: number[];
  importantAskPrices: number[];
}): PriceRange {
  const localRange = computeLocalBookmapRange(params.spot, params.localRangeUsd);

  if (!params.autoFit) {
    return params.manualPriceRange ?? localRange;
  }

  if (params.viewMode === "local") {
    return localRange;
  }

  if (params.showImportantFarLevels) {
    return computeAutoFitRangeWithImportantPrices(
      params.spot,
      params.importantBidPrices,
      params.importantAskPrices,
      { includeImportant: true, showFullDepth: true },
    );
  }

  return computeAutoFitRange(params.spot, true);
}

export function isOperableLocalLadder(metrics: {
  labelStep: number;
  bucketPx: number;
  priceStep: number;
}): boolean {
  return metrics.labelStep <= 100 && metrics.bucketPx >= 4;
}
