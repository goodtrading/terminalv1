import { BOOKMAP_ENGINE_BUCKET_MS, BOOKMAP_ENGINE_MAX_RENDER_CELLS } from "@/lib/bookmapEngineConfig";
import {
  applyPersistenceBoost,
  computeAdaptiveVisualScale,
  mapSizeToVisualIntensity,
  type AdaptiveVisualScale,
} from "@/lib/bookmapIntensity";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import {
  noiseConfigForMode,
  resolveVisualMode,
  type BookmapVisualMode,
  type VisibleVisualContext,
} from "@/lib/bookmapVisualContext";
import type { BookLevel, HeatmapCell } from "@/types/bookmapState";
import type { PreparedEngineCell, PreparedEngineWall } from "./bookmapEnginePrepare";
import {
  higherBandTier,
  isWallTier,
  refineTierFromIntensity,
  tierFromMaxSize,
  type HeatmapBand,
  type HeatmapBandTier,
} from "./bookmapBandTypes";

const MAX_GAP_MS_MULTIPLIER = 2;
const INTENSITY_MERGE_DELTA = 0.38;
const MAX_RENDER_BANDS = 6_000;
const MAX_LABELS = 8;

const TIER_RANK: Record<HeatmapBandTier, number> = {
  low: 0,
  medium: 1,
  important: 2,
  structural: 3,
  major: 4,
};

export type BandPrepareStats = {
  rawCellCount: number;
  bandCount: number;
  visibleBandCount: number;
  renderedBandCount: number;
  visualMode: BookmapVisualMode;
  pLow: number;
  pHigh: number;
  minRenderIntensity: number;
};

function intensityGroupKey(intensity: number, maxSize: number): string {
  const tier = tierFromMaxSize(maxSize);
  if (isWallTier(tier)) return tier;
  const logBucket = Math.floor(Math.log1p(maxSize) * 4);
  if (intensity < 0.22) return `low-${logBucket}`;
  if (intensity < 0.48) return `med-${logBucket}`;
  return `hi-${logBucket}`;
}

function cellToBand(
  cell: PreparedEngineCell,
  bucketMs: number,
  tier: HeatmapBandTier,
): HeatmapBand {
  return {
    price: cell.price,
    side: cell.side,
    startTime: cell.timeBucket,
    endTime: cell.timeBucket + bucketMs,
    size: cell.maxSizeInBucket,
    maxSize: cell.maxSizeInBucket,
    intensity: cell.intensity,
    visualIntensity: cell.intensity,
    persistenceMs: bucketMs,
    tier,
  };
}

export function mergeCellsToBands(
  cells: PreparedEngineCell[],
  bucketMs: number = BOOKMAP_ENGINE_BUCKET_MS,
): HeatmapBand[] {
  if (!cells.length) return [];

  const groups = new Map<string, PreparedEngineCell[]>();
  for (const cell of cells) {
    const key = `${cell.side}:${cell.price}`;
    const list = groups.get(key) ?? [];
    list.push(cell);
    groups.set(key, list);
  }

  const bands: HeatmapBand[] = [];
  const maxGap = bucketMs * MAX_GAP_MS_MULTIPLIER;

  for (const list of Array.from(groups.values())) {
    list.sort((a, b) => a.timeBucket - b.timeBucket);

    let current: HeatmapBand | null = null;

    for (const cell of list) {
      const sizeTier = tierFromMaxSize(cell.maxSizeInBucket);
      const tier = refineTierFromIntensity(sizeTier, cell.intensity, cell.maxSizeInBucket);
      const group = intensityGroupKey(cell.intensity, cell.maxSizeInBucket);

      if (!current) {
        current = cellToBand(cell, bucketMs, tier);
        continue;
      }

      const gap = cell.timeBucket - current.endTime;
      const sameGroup =
        intensityGroupKey(current.intensity, current.maxSize) === group;
      const intenseOk = Math.abs(cell.intensity - current.intensity) <= INTENSITY_MERGE_DELTA;
      const tierOk =
        isWallTier(current.tier) === isWallTier(tier) ||
        (!isWallTier(current.tier) && !isWallTier(tier));

      if (gap <= maxGap && sameGroup && intenseOk && tierOk) {
        current.endTime = cell.timeBucket + bucketMs;
        current.maxSize = Math.max(current.maxSize, cell.maxSizeInBucket);
        current.size = Math.max(current.size, cell.maxSizeInBucket);
        current.intensity = Math.max(current.intensity, cell.intensity);
        current.visualIntensity = Math.max(current.visualIntensity, cell.intensity);
        current.persistenceMs = current.endTime - current.startTime;
        current.tier = higherBandTier(
          current.tier,
          refineTierFromIntensity(tier, cell.intensity, cell.maxSizeInBucket),
        );
      } else {
        bands.push(current);
        current = cellToBand(cell, bucketMs, tier);
      }
    }

    if (current) bands.push(current);
  }

  return bands;
}

export function wallsToBands(
  walls: PreparedEngineWall[],
  wallMeta: Map<string, BookLevel>,
  timeMin: number,
  timeDataMax: number,
): HeatmapBand[] {
  const bands: HeatmapBand[] = [];

  for (const wall of walls) {
    const key = `${wall.side}:${wall.price}`;
    const meta = wallMeta.get(key);
    const maxSize = wall.maxSeenSize;
    const tier = tierFromMaxSize(maxSize);

    const startTime = meta?.firstSeenTs
      ? Math.max(timeMin, meta.firstSeenTs)
      : timeMin;
    const endTime =
      wall.stale && meta?.lastUpdateTs
        ? Math.min(timeDataMax, Math.max(startTime, meta.lastUpdateTs))
        : timeDataMax;

    const persistenceMs = Math.max(1, endTime - startTime);
    bands.push({
      price: wall.price,
      side: wall.side,
      startTime,
      endTime: Math.max(startTime + 1, endTime),
      size: maxSize,
      maxSize,
      intensity: 0,
      visualIntensity: 0,
      persistenceMs,
      tier,
      stale: wall.stale,
    });
  }

  return bands;
}

function mergeOverlappingWallBands(bands: HeatmapBand[]): HeatmapBand[] {
  const byKey = new Map<string, HeatmapBand>();

  for (const band of bands) {
    const key = `${band.side}:${band.price}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...band });
      continue;
    }
    prev.startTime = Math.min(prev.startTime, band.startTime);
    prev.endTime = Math.max(prev.endTime, band.endTime);
    prev.maxSize = Math.max(prev.maxSize, band.maxSize);
    prev.size = Math.max(prev.size, band.size);
    prev.intensity = Math.max(prev.intensity, band.intensity);
    prev.visualIntensity = Math.max(prev.visualIntensity, band.visualIntensity);
    prev.persistenceMs = Math.max(prev.persistenceMs, band.persistenceMs);
    prev.endTime = Math.max(prev.endTime, band.endTime);
    prev.startTime = Math.min(prev.startTime, band.startTime);
    prev.tier = higherBandTier(prev.tier, band.tier);
    prev.stale = prev.stale && band.stale;
  }

  return Array.from(byKey.values());
}

function applyMicroLocalBoost(
  band: HeatmapBand,
  visualCtx: VisibleVisualContext,
  mode: BookmapVisualMode,
): number {
  if (mode !== "micro") return band.visualIntensity ?? 0;

  let mult = 1;
  const spot = visualCtx.spotPrice;
  const halfSpan = visualCtx.priceSpan / 2;

  if (spot != null && spot > 0 && halfSpan > 0) {
    const dist = Math.abs(band.price - spot);
    const near = dist / halfSpan;
    if (near <= 0.12) mult *= 1.14;
    else if (near <= 0.28) mult *= 1.08;
  }

  const end = visualCtx.dataEndTime;
  if (end != null && Number.isFinite(end)) {
    const span = Math.max(1, visualCtx.visibleTimeSpanMs);
    const age = end - band.endTime;
    if (age >= 0 && age <= span * 0.35) mult *= 1.1;
  }

  if (isWallTier(band.tier) && (band.visualIntensity ?? 0) >= 0.5) {
    mult *= 1.06;
  }

  return Math.min(1, (band.visualIntensity ?? 0) * mult);
}

function bandOverlapsViewport(
  band: HeatmapBand,
  minPrice: number,
  maxPrice: number,
  timeMin: number,
  timeMax: number,
): boolean {
  if (band.price < minPrice || band.price > maxPrice) return false;
  return band.endTime >= timeMin && band.startTime <= timeMax;
}

function scoreBandsWithScale(
  bands: HeatmapBand[],
  scale: AdaptiveVisualScale,
  visualCtx: VisibleVisualContext,
  mode: BookmapVisualMode,
): void {
  for (const band of bands) {
    let v = mapSizeToVisualIntensity(band.maxSize, scale, band.maxSize);
    v = applyPersistenceBoost(v, band.persistenceMs, mode);
    band.visualIntensity = v;
    band.intensity = v;
    v = applyMicroLocalBoost(band, visualCtx, mode);
    band.visualIntensity = v;
    band.intensity = v;
    band.tier = refineTierFromIntensity(
      tierFromMaxSize(band.maxSize),
      v,
      band.maxSize,
    );
  }
}

export function applyAdaptiveVisualScores(
  bands: HeatmapBand[],
  visualCtx: VisibleVisualContext,
  scaleSourceBands?: HeatmapBand[],
): { scale: AdaptiveVisualScale; pLow: number; pHigh: number } {
  const mode = resolveVisualMode(visualCtx);
  const source = scaleSourceBands?.length ? scaleSourceBands : bands;
  const sizes = source.map((b) => b.maxSize);
  const { scale, pLow, pHigh } = computeAdaptiveVisualScale(sizes, visualCtx, {
    skipSmoothing: mode === "micro",
  });

  scoreBandsWithScale(bands, scale, visualCtx, mode);

  return { scale, pLow, pHigh };
}

export function filterBandsForVisualMode(
  bands: HeatmapBand[],
  visualMode: ReturnType<typeof resolveVisualMode>,
): HeatmapBand[] {
  const cfg = noiseConfigForMode(visualMode);

  return bands.filter((b) => {
    if (isWallTier(b.tier)) return true;
    if (b.maxSize >= 100) return true;
    return (b.visualIntensity ?? 0) >= cfg.minRenderIntensity;
  });
}

export function capLowBands(
  bands: HeatmapBand[],
  maxBands: number,
): HeatmapBand[] {
  if (bands.length <= maxBands) return bands;

  const wallBands = bands.filter((b) => isWallTier(b.tier) || b.maxSize >= 100);
  const rest = bands
    .filter((b) => !isWallTier(b.tier) && b.maxSize < 100)
    .sort((a, b) => (b.visualIntensity ?? 0) - (a.visualIntensity ?? 0));

  const budget = Math.max(maxBands - wallBands.length, 0);
  return [...wallBands, ...rest.slice(0, budget)];
}

export function buildWallMetaMap(levels: BookLevel[]): Map<string, BookLevel> {
  const map = new Map<string, BookLevel>();
  for (const level of levels) {
    map.set(`${level.side}:${level.price}`, level);
  }
  return map;
}

export function prepareHeatmapBands(params: {
  cells: PreparedEngineCell[];
  walls: PreparedEngineWall[];
  wallLevels: BookLevel[];
  bucketMs?: number;
  priceSpan: number;
  timeMin: number;
  timeMax: number;
  labelStep: number;
  heatmapBucketSize: number;
  domBucketSize: number;
  minPrice: number;
  maxPrice: number;
  spotPrice?: number | null;
  verticalCompressionMode?: VerticalCompressionMode;
}): {
  bands: HeatmapBand[];
  mergedBands: HeatmapBand[];
  stats: BandPrepareStats;
  visualScale: AdaptiveVisualScale;
} {
  const bucketMs = params.bucketMs ?? BOOKMAP_ENGINE_BUCKET_MS;
  const rawCellCount = params.cells.length;
  const visibleTimeSpanMs = Math.max(1, params.timeMax - params.timeMin);

  const visualCtx: VisibleVisualContext = {
    visibleTimeSpanMs,
    priceSpan: params.priceSpan,
    labelStep: params.labelStep,
    heatmapBucketSize: params.heatmapBucketSize,
    domBucketSize: params.domBucketSize,
    spotPrice: params.spotPrice,
    dataEndTime: params.timeMax,
    verticalCompressionMode: params.verticalCompressionMode,
  };

  const visualMode = resolveVisualMode(visualCtx);
  const isMicro = visualMode === "micro";

  if (!isMicro) {
    const preSizes = params.cells.map((c) => c.maxSizeInBucket);
    const { scale: preScale } = computeAdaptiveVisualScale(preSizes, visualCtx, {
      skipSmoothing: false,
    });
    for (const cell of params.cells) {
      cell.intensity = mapSizeToVisualIntensity(
        cell.maxSizeInBucket,
        preScale,
        cell.maxSizeInBucket,
      );
    }
  }

  const cellBands = mergeCellsToBands(params.cells, bucketMs);
  const wallMeta = buildWallMetaMap(params.wallLevels);
  const wallBands = wallsToBands(
    params.walls,
    wallMeta,
    params.timeMin,
    params.timeMax,
  );

  const merged = mergeOverlappingWallBands([...cellBands, ...wallBands]);

  const viewportBands = merged.filter((b) =>
    bandOverlapsViewport(
      b,
      params.minPrice,
      params.maxPrice,
      params.timeMin,
      params.timeMax,
    ),
  );
  const scaleBands =
    isMicro && viewportBands.length > 0 ? viewportBands : merged;

  return finalizeHeatmapBandsFromMerged(merged, visualCtx, scaleBands, {
    rawCellCount,
    bandCount: cellBands.length + wallBands.length,
    viewportBandCount: viewportBands.length,
  });
}

export function finalizeHeatmapBandsFromMerged(
  merged: HeatmapBand[],
  visualCtx: VisibleVisualContext,
  scaleBands: HeatmapBand[],
  meta: {
    rawCellCount: number;
    bandCount: number;
    viewportBandCount: number;
  },
): {
  bands: HeatmapBand[];
  mergedBands: HeatmapBand[];
  stats: BandPrepareStats;
  visualScale: AdaptiveVisualScale;
} {
  const visualMode = resolveVisualMode(visualCtx);
  const source =
    visualMode === "micro" && scaleBands.length > 0 ? scaleBands : merged;

  const { scale, pLow, pHigh } = applyAdaptiveVisualScores(
    merged,
    visualCtx,
    source,
  );
  const minRenderIntensity = noiseConfigForMode(visualMode).minRenderIntensity;

  const filtered = filterBandsForVisualMode(merged, visualMode);
  const capped = capLowBands(filtered, MAX_RENDER_BANDS);

  capped.sort(
    (a, b) => (a.visualIntensity ?? 0) - (b.visualIntensity ?? 0),
  );

  return {
    bands: capped,
    mergedBands: merged,
    visualScale: scale,
    stats: {
      rawCellCount: meta.rawCellCount,
      bandCount: meta.bandCount,
      visibleBandCount: meta.viewportBandCount,
      renderedBandCount: capped.length,
      visualMode,
      pLow,
      pHigh,
      minRenderIntensity,
    },
  };
}

export function rescoreMergedBandsForViewport(params: {
  mergedBands: HeatmapBand[];
  priceSpan: number;
  timeMin: number;
  timeMax: number;
  visibleTimeMin: number;
  visibleTimeMax: number;
  minPrice: number;
  maxPrice: number;
  labelStep: number;
  heatmapBucketSize: number;
  domBucketSize: number;
  spotPrice?: number | null;
  verticalCompressionMode?: VerticalCompressionMode;
  rawCellCount?: number;
  bandCount?: number;
}): ReturnType<typeof finalizeHeatmapBandsFromMerged> {
  const visibleTimeSpanMs = Math.max(
    1,
    params.visibleTimeMax - params.visibleTimeMin,
  );
  const visualCtx: VisibleVisualContext = {
    visibleTimeSpanMs,
    priceSpan: params.priceSpan,
    labelStep: params.labelStep,
    heatmapBucketSize: params.heatmapBucketSize,
    domBucketSize: params.domBucketSize,
    spotPrice: params.spotPrice,
    dataEndTime: params.timeMax,
    verticalCompressionMode: params.verticalCompressionMode,
  };

  const merged = params.mergedBands;
  const visualMode = resolveVisualMode(visualCtx);
  const isMicro = visualMode === "micro";

  const viewportBands = merged.filter((b) =>
    bandOverlapsViewport(
      b,
      params.minPrice,
      params.maxPrice,
      isMicro ? params.visibleTimeMin : params.timeMin,
      isMicro ? params.visibleTimeMax : params.timeMax,
    ),
  );
  const scaleBands =
    isMicro && viewportBands.length > 0 ? viewportBands : merged;

  return finalizeHeatmapBandsFromMerged(merged, visualCtx, scaleBands, {
    rawCellCount: params.rawCellCount ?? 0,
    bandCount: params.bandCount ?? merged.length,
    viewportBandCount: viewportBands.length,
  });
}

export type WallLabelPlacement = {
  band: HeatmapBand;
  text: string;
  x: number;
  y: number;
};

export function pickWallLabels(
  bands: HeatmapBand[],
  priceToY: (price: number) => number,
  plotRight: number,
  minSizeBtc = 100,
): WallLabelPlacement[] {
  const candidates = bands
    .filter((b) => b.maxSize >= minSizeBtc && isWallTier(b.tier))
    .sort((a, b) => b.maxSize - a.maxSize)
    .slice(0, MAX_LABELS * 2);

  const placed: WallLabelPlacement[] = [];
  const usedY: number[] = [];
  const minGap = 13;

  for (const band of candidates) {
    if (placed.length >= MAX_LABELS) break;
    const vi = band.visualIntensity ?? band.intensity;
    if (vi < 0.55 && band.maxSize < 100) continue;
    const y = priceToY(band.price);
    if (usedY.some((uy) => Math.abs(uy - y) < minGap)) continue;

    placed.push({
      band,
      text: "", // filled by renderer
      x: plotRight - 4,
      y: y - 3,
    });
    usedY.push(y);
  }

  return placed;
}

/** Re-export cap for raw cells before banding. */
export { BOOKMAP_ENGINE_MAX_RENDER_CELLS };
