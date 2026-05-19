import type { BookLevel } from "@/types/bookmapState";
import type { PriceRange } from "@/components/flows/bookmapViewportUtils";
import { pickNiceStepAtLeast } from "@/lib/bookmapPriceScaleUtils";

/** Vertical depth presets (half-span in USD for band modes). */
export type DepthRangePreset =
  | "local"
  | "2.5k"
  | "5k"
  | "10k"
  | "25k"
  | "fullDepth"
  | "majorWalls";

export const DEPTH_RANGE_PRESETS: DepthRangePreset[] = [
  "local",
  "2.5k",
  "5k",
  "10k",
  "25k",
  "fullDepth",
  "majorWalls",
];

export const DEFAULT_DEPTH_RANGE_PRESET: DepthRangePreset = "local";

export type VerticalCompressionMode = "micro" | "intraday" | "macro" | "fullDepth";

export const WALL_VISIBILITY_FLOOR_BTC = {
  important: 100,
  structural: 150,
  major: 300,
} as const;

const BAND_HALF_SPAN: Partial<Record<DepthRangePreset, number>> = {
  "2.5k": 2500,
  "5k": 5000,
  "10k": 10_000,
  "25k": 25_000,
};

/** Max price span as fraction of spot — wide presets bypass tight 20% cap. */
export function maxSpanRatioForDepthPreset(preset: DepthRangePreset): number {
  switch (preset) {
    case "local":
      return 0.12;
    case "2.5k":
      return 0.18;
    case "5k":
      return 0.28;
    case "10k":
      return 0.45;
    case "25k":
      return 0.75;
    case "majorWalls":
      return 1.1;
    case "fullDepth":
      return 1.8;
    default:
      return 0.2;
  }
}

export function depthPresetLabel(preset: DepthRangePreset, localHalfUsd?: number): string {
  switch (preset) {
    case "local":
      return localHalfUsd != null ? `Local ±${localHalfUsd}` : "Local";
    case "2.5k":
      return "±2.5k";
    case "5k":
      return "±5k";
    case "10k":
      return "±10k";
    case "25k":
      return "±25k";
    case "fullDepth":
      return "Full Depth";
    case "majorWalls":
      return "Major Walls";
  }
}

export function depthPresetToLegacyViewMode(
  preset: DepthRangePreset,
): "local" | "fullDepth" {
  return preset === "local" || preset === "2.5k" || preset === "5k"
    ? "local"
    : "fullDepth";
}

export function inferVerticalCompressionMode(visibleRange: number): VerticalCompressionMode {
  if (visibleRange <= 1_500) return "micro";
  if (visibleRange <= 8_000) return "intraday";
  if (visibleRange <= 25_000) return "macro";
  return "fullDepth";
}

export type VerticalScaleMetrics = {
  verticalMode: VerticalCompressionMode;
  labelStep: number;
  heatmapBucketSize: number;
  domBucketSize: number;
};

/**
 * Bookmap-style vertical compression: coarser buckets and labels as range widens.
 */
export function chooseVerticalBucketSizes(
  visibleRange: number,
  chartHeight: number,
): VerticalScaleMetrics {
  const mode = inferVerticalCompressionMode(visibleRange);
  const dollarsPerPx =
    visibleRange > 0 && chartHeight > 0 ? visibleRange / chartHeight : 50;

  let labelStep: number;
  let heatmapBucketSize: number;
  let domBucketSize: number;

  switch (mode) {
    case "micro":
      labelStep = visibleRange <= 800 ? 25 : 50;
      heatmapBucketSize = visibleRange <= 800 ? 10 : 25;
      domBucketSize = Math.max(
        heatmapBucketSize,
        pickNiceStepAtLeast(dollarsPerPx * 14),
      );
      break;
    case "intraday":
      labelStep = visibleRange <= 4_000 ? 100 : 250;
      heatmapBucketSize = visibleRange <= 4_000 ? 50 : 100;
      domBucketSize = Math.max(
        heatmapBucketSize,
        pickNiceStepAtLeast(dollarsPerPx * 16),
      );
      break;
    case "macro":
      labelStep = visibleRange <= 15_000 ? 500 : 1000;
      heatmapBucketSize = visibleRange <= 15_000 ? 250 : 500;
      domBucketSize = Math.max(
        heatmapBucketSize,
        pickNiceStepAtLeast(dollarsPerPx * 18),
      );
      break;
    case "fullDepth":
      labelStep =
        visibleRange <= 50_000 ? 1000 : visibleRange <= 100_000 ? 2500 : 5000;
      heatmapBucketSize =
        visibleRange <= 50_000 ? 500 : visibleRange <= 100_000 ? 1000 : 1000;
      domBucketSize = Math.max(
        heatmapBucketSize,
        pickNiceStepAtLeast(dollarsPerPx * 20),
      );
      break;
  }

  return { verticalMode: mode, labelStep, heatmapBucketSize, domBucketSize };
}

export function isSignificantWall(level: BookLevel): boolean {
  const size = level.maxSeenSize;
  if (level.isMajor && size >= WALL_VISIBILITY_FLOOR_BTC.major) return true;
  if (level.isStructural && size >= WALL_VISIBILITY_FLOOR_BTC.structural) return true;
  if (level.isImportant && size >= WALL_VISIBILITY_FLOOR_BTC.important) return true;
  return false;
}

export function isMajorMacroWall(level: BookLevel): boolean {
  const size = level.maxSeenSize;
  if (level.isMajor && size >= WALL_VISIBILITY_FLOOR_BTC.major) return true;
  if (level.isStructural && size >= WALL_VISIBILITY_FLOOR_BTC.structural) return true;
  return false;
}

export function filterSignificantWalls(walls: BookLevel[]): BookLevel[] {
  return walls.filter(isSignificantWall);
}

export function filterMajorMacroWalls(walls: BookLevel[]): BookLevel[] {
  return walls.filter(isMajorMacroWall);
}

export function computeSpotBandRange(
  spot: number | null,
  halfSpanUsd: number,
): PriceRange {
  const mid = spot != null && spot > 0 ? spot : 70_000;
  const half = Math.max(100, halfSpanUsd);
  return { minPrice: mid - half, maxPrice: mid + half };
}

export function computeDepthRangeFromPreset(
  preset: DepthRangePreset,
  spot: number | null,
  walls: BookLevel[],
  localHalfSpanUsd: number,
  bookLevels?: BookLevel[],
): PriceRange {
  const half = BAND_HALF_SPAN[preset];
  if (half != null) {
    return computeSpotBandRange(spot, half);
  }
  if (preset === "local") {
    return computeSpotBandRange(spot, localHalfSpanUsd);
  }
  if (preset === "majorWalls") {
    const fit = computeFitWallsRange(spot, filterMajorMacroWalls(walls), {
      paddingPct: 0.04,
    });
    return fit
      ? { minPrice: fit.minPrice, maxPrice: fit.maxPrice }
      : computeSpotBandRange(spot, localHalfSpanUsd);
  }
  return computeFullDepthRange(spot, walls, bookLevels);
}

export function computeFullDepthRange(
  spot: number | null,
  walls: BookLevel[],
  bookLevels?: BookLevel[],
  topBookLevels = 8,
): PriceRange {
  const prices: number[] = [];
  if (spot != null && Number.isFinite(spot) && spot > 0) prices.push(spot);

  for (const w of filterSignificantWalls(walls)) {
    if (Number.isFinite(w.price)) prices.push(w.price);
  }

  if (bookLevels?.length) {
    const ranked = [...bookLevels]
      .filter((l) => l.maxSeenSize > 0 || l.size > 0)
      .sort(
        (a, b) =>
          Math.max(b.maxSeenSize, b.size) - Math.max(a.maxSeenSize, a.size),
      )
      .slice(0, topBookLevels);
    for (const l of ranked) {
      if (Number.isFinite(l.price)) prices.push(l.price);
    }
  }

  if (!prices.length) {
    return computeSpotBandRange(spot, 1000);
  }

  let minP = Math.min(...prices);
  let maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, spot != null ? spot * 0.006 : 400);
  const pad = span * 0.035;
  minP -= pad;
  maxP += pad;

  if (spot != null && spot > 0) {
    const minSpan = spot * 0.008;
    if (maxP - minP < minSpan) {
      minP = spot - minSpan / 2;
      maxP = spot + minSpan / 2;
    }
  }

  return { minPrice: minP, maxPrice: maxP };
}

export function computeFitWallsRange(
  spot: number | null,
  walls: BookLevel[],
  options?: { majorOnly?: boolean; paddingPct?: number },
): { minPrice: number; maxPrice: number; centerPrice: number } | null {
  const pool = options?.majorOnly
    ? filterMajorMacroWalls(walls)
    : filterSignificantWalls(walls);
  const prices: number[] = [];
  if (spot != null && Number.isFinite(spot) && spot > 0) prices.push(spot);
  for (const w of pool) {
    if (Number.isFinite(w.price)) prices.push(w.price);
  }
  if (!prices.length) return null;

  let minP = Math.min(...prices);
  let maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, spot != null ? spot * 0.006 : 400);
  const pad = span * (options?.paddingPct ?? 0.04);
  minP -= pad;
  maxP += pad;

  if (spot != null && spot > 0) {
    const minSpan = spot * 0.01;
    if (maxP - minP < minSpan) {
      const c = spot;
      minP = c - minSpan / 2;
      maxP = c + minSpan / 2;
    }
  }

  return {
    minPrice: minP,
    maxPrice: maxP,
    centerPrice: spot ?? (minP + maxP) / 2,
  };
}

export type FarDepthMarker = {
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  pctFromSpot: number;
};

export function computeFarDepthMarkers(
  spot: number | null,
  walls: Array<{ side: "bid" | "ask"; price: number; maxSeenSize: number }>,
  minPrice: number,
  maxPrice: number,
  minBtc = WALL_VISIBILITY_FLOOR_BTC.important,
  maxEach = 3,
): { above: FarDepthMarker[]; below: FarDepthMarker[] } {
  if (spot == null || !Number.isFinite(spot) || spot <= 0) {
    return { above: [], below: [] };
  }

  const toMarker = (
    w: { side: "bid" | "ask"; price: number; maxSeenSize: number },
  ): FarDepthMarker => ({
    side: w.side,
    price: w.price,
    sizeBtc: w.maxSeenSize,
    pctFromSpot: ((w.price - spot) / spot) * 100,
  });

  const above = walls
    .filter((w) => w.side === "ask" && w.price > maxPrice && w.maxSeenSize >= minBtc)
    .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
    .slice(0, maxEach)
    .map(toMarker);

  const below = walls
    .filter((w) => w.side === "bid" && w.price < minPrice && w.maxSeenSize >= minBtc)
    .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
    .slice(0, maxEach)
    .map(toMarker);

  return { above, below };
}
