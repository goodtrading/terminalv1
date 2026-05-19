import { BOOKMAP_ENGINE_MAX_RENDER_CELLS } from "@/lib/bookmapEngineConfig";
import {
  aggregateBookLevelsByBucket,
  aggregateHeatmapCellsByBucket,
} from "@/lib/bookmapPriceScaleUtils";
import type { AdaptiveVisualScale } from "@/lib/bookmapIntensity";
import type { LiquiditySnapshot, OrderbookLevel } from "./liquidityHeatmapUtils";
import type { BookLevel, BookmapState, HeatmapCell } from "@/types/bookmapState";
import {
  prepareHeatmapBands,
  rescoreMergedBandsForViewport,
  type BandPrepareStats,
} from "./bookmapBandPrepare";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { HeatmapBand } from "./bookmapBandTypes";
import { BOOKMAP_ENGINE_BUCKET_MS } from "@/lib/bookmapEngineConfig";

export type PreparedEngineCell = {
  timeBucket: number;
  price: number;
  side: "bid" | "ask";
  intensity: number;
  isMajor: boolean;
  maxSizeInBucket: number;
};

export type EngineWallTier = "important" | "structural" | "major";

export type PreparedEngineWall = {
  price: number;
  side: "bid" | "ask";
  maxSeenSize: number;
  tier: EngineWallTier;
  stale: boolean;
  intensity: number;
};

export type PreparedEngineRenderData = {
  bands: HeatmapBand[];
  /** Uncapped merged bands — used for micro viewport rescoring. */
  mergedBands: HeatmapBand[];
  /** @deprecated Use bands */
  cells: PreparedEngineCell[];
  walls: PreparedEngineWall[];
  timeMin: number;
  /** Latest data timestamp. */
  timeMax: number;
  visualScale: AdaptiveVisualScale;
  stats: BandPrepareStats;
  bandPrepareMeta: {
    rawCellCount: number;
    bandCount: number;
    priceSpan: number;
    labelStep: number;
    heatmapBucketSize: number;
    domBucketSize: number;
  };
};

const TIER_RANK: Record<EngineWallTier, number> = {
  important: 1,
  structural: 2,
  major: 3,
};

type WallLike = Pick<
  BookLevel,
  "price" | "side" | "maxSeenSize" | "isImportant" | "isStructural" | "isMajor" | "stale"
>;

function wallTier(level: WallLike): EngineWallTier | null {
  if (level.isMajor) return "major";
  if (level.isStructural) return "structural";
  if (level.isImportant) return "important";
  return null;
}

function dedupeWalls(levels: WallLike[]): PreparedEngineWall[] {
  const byKey = new Map<string, PreparedEngineWall>();

  for (const level of levels) {
    const tier = wallTier(level);
    if (!tier) continue;
    const key = `${level.side}:${level.price}`;
    const prev = byKey.get(key);
    if (prev && TIER_RANK[prev.tier] >= TIER_RANK[tier]) continue;

    byKey.set(key, {
      price: level.price,
      side: level.side,
      maxSeenSize: level.maxSeenSize,
      tier,
      stale: level.stale,
      intensity: 0,
    });
  }

  return Array.from(byKey.values());
}

function capCells(
  cells: PreparedEngineCell[],
  wallPrices: Set<string>,
  maxCells: number,
): PreparedEngineCell[] {
  if (cells.length <= maxCells) return cells;

  const mustKeep = cells.filter((c) => wallPrices.has(`${c.side}:${c.price}`));
  const rest = cells
    .filter((c) => !wallPrices.has(`${c.side}:${c.price}`))
    .sort((a, b) => b.maxSizeInBucket - a.maxSizeInBucket);

  const budget = Math.max(maxCells - mustKeep.length, 0);
  return [...mustKeep, ...rest.slice(0, budget)];
}

export function prepareEngineRenderData(
  state: BookmapState,
  minPrice: number,
  maxPrice: number,
  heatmapBucketSize = 50,
  wallBucketSize?: number,
  maxCells = BOOKMAP_ENGINE_MAX_RENDER_CELLS,
  labelStep = 50,
  domBucketSize = 50,
  spotPrice?: number | null,
  verticalCompressionMode?: VerticalCompressionMode,
): PreparedEngineRenderData | null {
  const rawInRange = state.heatmapCells.filter(
    (c) => c.price >= minPrice && c.price <= maxPrice && c.maxSizeInBucket > 0,
  );
  const cellsInRange = aggregateHeatmapCellsByBucket(
    rawInRange,
    heatmapBucketSize,
    minPrice,
    maxPrice,
  );

  if (!cellsInRange.length && !state.importantWalls.length) {
    return null;
  }

  const wallStep = wallBucketSize ?? heatmapBucketSize;
  const wallLevels = [
    ...state.importantWalls,
    ...state.structuralWalls,
    ...state.majorWalls,
  ];
  const aggregatedWalls = aggregateBookLevelsByBucket(wallLevels, wallStep);
  const walls = dedupeWalls(aggregatedWalls);

  const wallPrices = new Set(walls.map((w) => `${w.side}:${w.price}`));

  const preparedCells: PreparedEngineCell[] = cellsInRange.map((cell) =>
    cellToPrepared(cell),
  );

  const capped = capCells(preparedCells, wallPrices, maxCells);

  const timeMax = state.timestamp || Date.now();
  const bucketTimes = capped.map((c) => c.timeBucket);
  const timeMin =
    bucketTimes.length > 0
      ? Math.min(...bucketTimes)
      : timeMax - 15 * 60 * 1000;

  const priceSpan = maxPrice - minPrice;
  const {
    bands,
    mergedBands,
    stats,
    visualScale,
  } = prepareHeatmapBands({
    cells: capped,
    walls,
    wallLevels,
    bucketMs: BOOKMAP_ENGINE_BUCKET_MS,
    priceSpan,
    timeMin,
    timeMax,
    labelStep,
    heatmapBucketSize,
    domBucketSize,
    minPrice,
    maxPrice,
    spotPrice,
    verticalCompressionMode,
  });

  return {
    bands,
    mergedBands,
    cells: capped,
    walls,
    timeMin,
    timeMax,
    visualScale,
    stats,
    bandPrepareMeta: {
      rawCellCount: stats.rawCellCount,
      bandCount: stats.bandCount,
      priceSpan,
      labelStep,
      heatmapBucketSize,
      domBucketSize,
    },
  };
}

export function applyEngineViewportBandNormalization(
  data: PreparedEngineRenderData,
  opts: {
    minPrice: number;
    maxPrice: number;
    visibleStartTime: number;
    visibleEndTime: number;
    verticalCompressionMode: VerticalCompressionMode;
    spotPrice?: number | null;
  },
): PreparedEngineRenderData {
  const { bandPrepareMeta: meta } = data;
  const {
    bands,
    mergedBands,
    stats,
    visualScale,
  } = rescoreMergedBandsForViewport({
    mergedBands: data.mergedBands,
    priceSpan: meta.priceSpan,
    timeMin: data.timeMin,
    timeMax: data.timeMax,
    visibleTimeMin: opts.visibleStartTime,
    visibleTimeMax: opts.visibleEndTime,
    minPrice: opts.minPrice,
    maxPrice: opts.maxPrice,
    labelStep: meta.labelStep,
    heatmapBucketSize: meta.heatmapBucketSize,
    domBucketSize: meta.domBucketSize,
    spotPrice: opts.spotPrice,
    verticalCompressionMode: opts.verticalCompressionMode,
    rawCellCount: meta.rawCellCount,
    bandCount: meta.bandCount,
  });

  return {
    ...data,
    bands,
    mergedBands,
    visualScale,
    stats,
  };
}

function cellToPrepared(cell: HeatmapCell): PreparedEngineCell {
  const size = cell.maxSizeInBucket;
  return {
    timeBucket: cell.timeBucket,
    price: cell.price,
    side: cell.side,
    intensity: 0,
    isMajor: size >= 300,
    maxSizeInBucket: size,
  };
}

export function bookLevelsToDomSnapshot(
  bids: BookLevel[],
  asks: BookLevel[],
  timestamp: number,
): LiquiditySnapshot {
  const mapSide = (levels: BookLevel[], side: "bid" | "ask"): OrderbookLevel[] =>
    levels
      .filter((l) => !l.stale && l.size > 0)
      .map((l) => ({
        price: l.price,
        sizeBtc: l.size,
        side,
      }));

  return {
    ts: timestamp,
    bids: mapSide(bids, "bid").sort((a, b) => b.price - a.price),
    asks: mapSide(asks, "ask").sort((a, b) => a.price - b.price),
  };
}

export function bookLevelsToSnapshotLevels(
  bids: BookLevel[],
  asks: BookLevel[],
  timestamp: number,
): LiquiditySnapshot {
  const mapSide = (levels: BookLevel[], side: "bid" | "ask"): OrderbookLevel[] =>
    levels
      .filter((l) => l.size > 0 || l.isImportant || l.isStructural || l.isMajor)
      .map((l) => ({
        price: l.price,
        sizeBtc: l.size > 0 ? l.size : l.maxSeenSize,
        side,
      }));

  return {
    ts: timestamp,
    bids: mapSide(bids, "bid").sort((a, b) => b.price - a.price),
    asks: mapSide(asks, "ask").sort((a, b) => a.price - b.price),
  };
}
