import type { HeatmapCell } from "@/types/bookmapState";
import { WALL_IMPORTANT_BTC } from "@/lib/bookmapEngineConfig";

export type MatrixIntensityTier = "weak" | "medium" | "strong";

export function classifyMatrixTierBySize(sizeBtc: number): MatrixIntensityTier {
  if (sizeBtc >= WALL_IMPORTANT_BTC) return "strong";
  if (sizeBtc >= 5) return "medium";
  return "weak";
}

export function classifyMatrixTierByIntensity(
  intensity: number,
  sizeBtc: number,
): MatrixIntensityTier {
  const vi = Math.max(0, Math.min(1, intensity));
  if (sizeBtc >= WALL_IMPORTANT_BTC || vi >= 0.52) return "strong";
  if (vi >= 0.22 || sizeBtc >= 5) return "medium";
  return "weak";
}

export type RawHeatmapMatrixDiag = {
  market: string;
  sourceMode: string;
  activeTradeMarket: string;
  heatmapCellsTotal: number;
  uniqueTimeBuckets: number;
  uniquePriceLevels: number;
  minTime: number;
  maxTime: number;
  timeSpanSec: number;
  avgCellsPerBucket: number;
  maxCellsPerBucket: number;
  avgLevelsPerBucket: number;
  weakCells: number;
  mediumCells: number;
  strongCells: number;
  staleCells: number;
  activeCells: number;
  liveLevels: number;
  wallsCount: number;
  timestamp: number;
};

export function buildRawHeatmapMatrixDiag(
  state: {
    heatmapCells: HeatmapCell[];
    bids: Array<{ stale?: boolean; size: number }>;
    asks: Array<{ stale?: boolean; size: number }>;
    importantWalls?: unknown[];
    structuralWalls?: unknown[];
    majorWalls?: unknown[];
  },
  meta: {
    market: string;
    sourceMode: string;
    activeTradeMarket: string;
  },
): RawHeatmapMatrixDiag {
  const cells = state.heatmapCells ?? [];
  const timeBuckets = new Set<number>();
  const priceLevels = new Set<string>();
  const bucketCounts = new Map<number, number>();
  let weakCells = 0;
  let mediumCells = 0;
  let strongCells = 0;
  let minTime = 0;
  let maxTime = 0;

  for (const cell of cells) {
    timeBuckets.add(cell.timeBucket);
    priceLevels.add(`${cell.side}:${cell.price}`);
    bucketCounts.set(cell.timeBucket, (bucketCounts.get(cell.timeBucket) ?? 0) + 1);
    const tier = classifyMatrixTierBySize(cell.maxSizeInBucket);
    if (tier === "weak") weakCells += 1;
    else if (tier === "medium") mediumCells += 1;
    else strongCells += 1;
    if (minTime === 0 || cell.timeBucket < minTime) minTime = cell.timeBucket;
    if (cell.timeBucket > maxTime) maxTime = cell.timeBucket;
  }

  const bucketSizes = Array.from(bucketCounts.values());
  const avgCellsPerBucket =
    bucketSizes.length > 0
      ? bucketSizes.reduce((a, b) => a + b, 0) / bucketSizes.length
      : 0;
  const maxCellsPerBucket =
    bucketSizes.length > 0 ? Math.max(...bucketSizes) : 0;

  const liveLevels = [...state.bids, ...state.asks].filter((l) => l.size > 0);
  const staleCells = cells.filter((c) => c.lastSizeInBucket <= 0).length;
  const activeCells = cells.length - staleCells;
  const wallsCount =
    (state.importantWalls?.length ?? 0) +
    (state.structuralWalls?.length ?? 0) +
    (state.majorWalls?.length ?? 0);

  return {
    market: meta.market,
    sourceMode: meta.sourceMode,
    activeTradeMarket: meta.activeTradeMarket,
    heatmapCellsTotal: cells.length,
    uniqueTimeBuckets: timeBuckets.size,
    uniquePriceLevels: priceLevels.size,
    minTime,
    maxTime,
    timeSpanSec:
      minTime > 0 && maxTime > minTime
        ? Number(((maxTime - minTime) / 1000).toFixed(1))
        : 0,
    avgCellsPerBucket: Number(avgCellsPerBucket.toFixed(2)),
    maxCellsPerBucket,
    avgLevelsPerBucket:
      timeBuckets.size > 0
        ? Number((cells.length / timeBuckets.size).toFixed(2))
        : 0,
    weakCells,
    mediumCells,
    strongCells,
    staleCells,
    activeCells,
    liveLevels: liveLevels.length,
    wallsCount,
    timestamp: Date.now(),
  };
}
