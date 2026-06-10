/**
 * P5 — Passive base texture (Bookmap-like background density, separate from lifecycle).
 */

import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { HeatmapCell } from "@shared/bookmapMarket";
import type { LiveDomBookLevel } from "./bookmapLiveDomPriority";
import { getLifecycleCellMeta } from "./bookmapLifecycleTextureIntegration";
import type { PreparedEngineTextureCell } from "./bookmapEnginePrepare";
import { BOOKMAP_TEXTURE_SAMPLER_MS } from "./bookmapEnginePrepare";
import {
  BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE,
  computeBookmapLikeVisualScore,
  getBookmapVisualForceFrameStats,
  injectNearTickPassiveMistCells,
  passesNearTickPassiveMistRule,
} from "./bookmapVisualForceBookmapLike";

export type TextureSourceKind = "base" | "lifecycle" | "wall" | "overlay";

export const BOOKMAP_BASE_TEXTURE_NEAR035_MIN_BTC = 0.5;
export const BOOKMAP_BASE_TEXTURE_NEAR075_MIN_BTC = 1.5;
export const BOOKMAP_BASE_TEXTURE_VIEWPORT_TOP_PER_SIDE_MICRO = 35;
export const BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY = 0.008;
export const BOOKMAP_BASE_TEXTURE_NORMAL_MAX_INTENSITY = 0.45;
export const BOOKMAP_BASE_TEXTURE_STRONG_MAX_INTENSITY = 0.62;

export type PassiveBaseTextureTier = "low" | "medium" | "strong";

export type PassiveBaseTextureSelectStats = {
  rawCandidateCount: number;
  baseSelectedCount: number;
  lifecycleSkippedAsBaseCount: number;
  wallRoutedCount: number;
  degradedWallToBaseCount: number;
  filteredByBaseRulesCount: number;
  bookSnapshotInjectedCount: number;
};

export type PassiveBaseTexturePrepareStats = {
  baseTextureCellCount: number;
  lifecycleTextureCellCount: number;
  wallBandCellCount: number;
  baseTextureVisibleCount: number;
  baseTextureNearTickCount: number;
  baseTextureMidRangeCount: number;
  baseTextureFarCount: number;
  baseTextureAvgIntensity: number;
  baseTextureMedianIntensity: number;
  baseTextureMaxIntensity: number;
  baseTextureAvgAlpha: number;
  baseTextureMedianAlpha: number;
  baseTextureMaxAlpha: number;
  baseTextureCoveragePct: number;
  baseTextureNearTickCoveragePct: number;
  baseTextureDensityScore: number;
  lifecycleToBaseRatio: number;
  wallToBaseRatio: number;
  baseVsLifecycleVisualRatio: number;
  baseVsWallVisualRatio: number;
};

let lastSelectStats: PassiveBaseTextureSelectStats = emptySelectStats();
let lastPrepareStats: PassiveBaseTexturePrepareStats = emptyPrepareStats();

function emptySelectStats(): PassiveBaseTextureSelectStats {
  return {
    rawCandidateCount: 0,
    baseSelectedCount: 0,
    lifecycleSkippedAsBaseCount: 0,
    wallRoutedCount: 0,
    degradedWallToBaseCount: 0,
    filteredByBaseRulesCount: 0,
    bookSnapshotInjectedCount: 0,
  };
}

function emptyPrepareStats(): PassiveBaseTexturePrepareStats {
  return {
    baseTextureCellCount: 0,
    lifecycleTextureCellCount: 0,
    wallBandCellCount: 0,
    baseTextureVisibleCount: 0,
    baseTextureNearTickCount: 0,
    baseTextureMidRangeCount: 0,
    baseTextureFarCount: 0,
    baseTextureAvgIntensity: 0,
    baseTextureMedianIntensity: 0,
    baseTextureMaxIntensity: 0,
    baseTextureAvgAlpha: 0,
    baseTextureMedianAlpha: 0,
    baseTextureMaxAlpha: 0,
    baseTextureCoveragePct: 0,
    baseTextureNearTickCoveragePct: 0,
    baseTextureDensityScore: 0,
    lifecycleToBaseRatio: 0,
    wallToBaseRatio: 0,
    baseVsLifecycleVisualRatio: 0,
    baseVsWallVisualRatio: 0,
  };
}

function pctFromMid(price: number, mid: number | null | undefined): number {
  if (mid == null || mid <= 0) return 100;
  return (Math.abs(price - mid) / mid) * 100;
}

function cellKey(timeBucket: number, side: string, price: number): string {
  return `${timeBucket}:${side}:${price}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function classifyTextureSourceKind(
  cell: Pick<HeatmapCell, "timeBucket" | "side" | "price" | "maxSizeInBucket">,
  opts?: { forceWall?: boolean; forceBase?: boolean },
): TextureSourceKind {
  if (opts?.forceWall) return "wall";
  if (opts?.forceBase) return "base";
  const meta = getLifecycleCellMeta(cell.timeBucket, cell.side, cell.price);
  if (meta != null) return "lifecycle";
  if (cell.maxSizeInBucket >= WALL_IMPORTANT_BTC) {
    return isStructuralOrMajorWallSize(cell.maxSizeInBucket) ? "wall" : "base";
  }
  return "base";
}

export function isStructuralOrMajorWallSize(sizeBtc: number): boolean {
  return sizeBtc >= WALL_STRUCTURAL_BTC || sizeBtc >= WALL_MAJOR_BTC;
}

export function passesPassiveBaseSizeRule(
  sizeBtc: number,
  price: number,
  midPrice: number | null | undefined,
): boolean {
  if (sizeBtc <= 0) return false;
  const pct = pctFromMid(price, midPrice);
  if (
    BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE &&
    pct <= 0.2 &&
    sizeBtc >= 0.35
  ) {
    return true;
  }
  if (pct <= 0.35 && sizeBtc >= BOOKMAP_BASE_TEXTURE_NEAR035_MIN_BTC) return true;
  if (pct <= 0.75 && sizeBtc >= BOOKMAP_BASE_TEXTURE_NEAR075_MIN_BTC) return true;
  return false;
}

function selectTopBaseLevelKeys(
  cells: HeatmapCell[],
  perSide: number,
): Set<string> {
  const keys = new Set<string>();
  for (const side of ["bid", "ask"] as const) {
    const top = cells
      .filter((c) => c.side === side && c.maxSizeInBucket > 0)
      .sort((a, b) => b.maxSizeInBucket - a.maxSizeInBucket)
      .slice(0, perSide);
    for (const c of top) {
      keys.add(`${c.side}:${c.price}`);
    }
  }
  return keys;
}

export function selectPassiveBaseTextureSources(opts: {
  cells: HeatmapCell[];
  midPrice: number | null | undefined;
  minPrice: number;
  maxPrice: number;
  verticalMode?: VerticalCompressionMode | string;
  bookLevels?: LiveDomBookLevel[];
  dataEndTime: number;
  priceBucketUsd?: number;
}): {
  baseCells: HeatmapCell[];
  trueWallCells: HeatmapCell[];
  degradedWallBaseCells: HeatmapCell[];
  stats: PassiveBaseTextureSelectStats;
} {
  const stats = emptySelectStats();
  stats.rawCandidateCount = opts.cells.length;

  const micro =
    opts.verticalMode === "micro" ||
    String(opts.verticalMode ?? "").toLowerCase().includes("micro");
  const topPerSide = micro
    ? BOOKMAP_BASE_TEXTURE_VIEWPORT_TOP_PER_SIDE_MICRO
    : 20;

  const inRange = opts.cells.filter(
    (c) =>
      c.price >= opts.minPrice &&
      c.price <= opts.maxPrice &&
      c.maxSizeInBucket > 0,
  );

  const topKeys = selectTopBaseLevelKeys(inRange, topPerSide);
  const baseCells: HeatmapCell[] = [];
  const trueWallCells: HeatmapCell[] = [];
  const degradedWallBaseCells: HeatmapCell[] = [];
  const seenBase = new Set<string>();

  for (const cell of inRange) {
    const meta = getLifecycleCellMeta(cell.timeBucket, cell.side, cell.price);
    if (meta != null) {
      stats.lifecycleSkippedAsBaseCount += 1;
      continue;
    }

    if (cell.maxSizeInBucket >= WALL_IMPORTANT_BTC) {
      if (isStructuralOrMajorWallSize(cell.maxSizeInBucket)) {
        trueWallCells.push(cell);
        stats.wallRoutedCount += 1;
      } else {
        degradedWallBaseCells.push(cell);
        stats.degradedWallToBaseCount += 1;
      }
      continue;
    }

    const priceKey = `${cell.side}:${cell.price}`;
    const passes =
      passesPassiveBaseSizeRule(
        cell.maxSizeInBucket,
        cell.price,
        opts.midPrice,
      ) || topKeys.has(priceKey);

    if (!passes) {
      stats.filteredByBaseRulesCount += 1;
      continue;
    }

    const key = cellKey(cell.timeBucket, cell.side, cell.price);
    if (!seenBase.has(key)) {
      seenBase.add(key);
      baseCells.push(cell);
      stats.baseSelectedCount += 1;
    }
  }

  if (opts.bookLevels?.length && opts.dataEndTime > 0) {
    const snapBucket =
      Math.floor(opts.dataEndTime / BOOKMAP_TEXTURE_SAMPLER_MS) *
      BOOKMAP_TEXTURE_SAMPLER_MS;
    const bucketUsd = opts.priceBucketUsd ?? 5;
    for (const side of ["bid", "ask"] as const) {
      const top = opts.bookLevels
        .filter((l) => l.side === side && l.size > 0)
        .sort((a, b) => b.size - a.size)
        .slice(0, topPerSide);
      for (const level of top) {
        const bp =
          Math.round(level.price / bucketUsd) * bucketUsd;
        if (bp < opts.minPrice || bp > opts.maxPrice) continue;
        const key = cellKey(snapBucket, side, bp);
        if (seenBase.has(key)) continue;
        if (
          !passesPassiveBaseSizeRule(level.size, level.price, opts.midPrice) &&
          !passesNearTickPassiveMistRule(level.size, level.price, opts.midPrice) &&
          !topKeys.has(`${side}:${bp}`)
        ) {
          continue;
        }
        seenBase.add(key);
        baseCells.push({
          timeBucket: snapBucket,
          price: bp,
          side,
          size: level.size,
          maxSizeInBucket: level.size,
          lastSizeInBucket: level.size,
          lastUpdateTs: opts.dataEndTime,
        });
        stats.bookSnapshotInjectedCount += 1;
        stats.baseSelectedCount += 1;
      }
    }
  }

  const withMist = injectNearTickPassiveMistCells({
    baseCells,
    bookLevels: opts.bookLevels ?? [],
    midPrice: opts.midPrice,
    minPrice: opts.minPrice,
    maxPrice: opts.maxPrice,
    dataEndTime: opts.dataEndTime,
    priceBucketUsd: opts.priceBucketUsd,
    seenKeys: seenBase,
  });
  stats.baseSelectedCount += withMist.length - baseCells.length;

  lastSelectStats = stats;
  return {
    baseCells: withMist,
    trueWallCells,
    degradedWallBaseCells,
    stats,
  };
}

export function computeBaseVisualIntensity(opts: {
  sizeBtc: number;
  price: number;
  midPrice: number | null | undefined;
  localRankScore?: number;
  persistenceMs?: number;
  viewportMaxSize?: number;
  tier?: PassiveBaseTextureTier;
}): number {
  const maxSize = Math.max(1, opts.viewportMaxSize ?? 50, opts.sizeBtc);
  const localRankScore = Math.max(
    0,
    Math.min(1, opts.localRankScore ?? opts.sizeBtc / maxSize),
  );
  const absoluteSizeScore = Math.max(
    0,
    Math.min(1, opts.sizeBtc / maxSize),
  );
  const pct = pctFromMid(opts.price, opts.midPrice);
  let nearTickScore = 0.12;
  if (pct <= 0.15) nearTickScore = 1;
  else if (pct <= 0.35) nearTickScore = 0.72;
  else if (pct <= 0.75) nearTickScore = 0.38;
  else if (pct <= 2.5) nearTickScore = 0.18;

  const persistenceScore = Math.min(
    1,
    (opts.persistenceMs ?? 0) / 12_000,
  );

  let intensity =
    localRankScore * 0.45 +
    absoluteSizeScore * 0.3 +
    nearTickScore * 0.15 +
    persistenceScore * 0.1;

  const tier = opts.tier ?? classifyPassiveBaseTier(opts.sizeBtc, pct);
  const cap =
    tier === "strong"
      ? BOOKMAP_BASE_TEXTURE_STRONG_MAX_INTENSITY
      : BOOKMAP_BASE_TEXTURE_NORMAL_MAX_INTENSITY;

  intensity = Math.min(cap, Math.max(0.04, intensity));
  return Number(intensity.toFixed(4));
}

export function classifyPassiveBaseTier(
  sizeBtc: number,
  pctFromMidPrice: number,
): PassiveBaseTextureTier {
  if (sizeBtc >= 8 || (pctFromMidPrice <= 0.15 && sizeBtc >= 3)) return "strong";
  if (sizeBtc >= 2 || pctFromMidPrice <= 0.35) return "medium";
  return "low";
}

export function baseTextureAlphaForIntensity(
  intensity: number,
  tier: PassiveBaseTextureTier,
): number {
  const i = Math.max(0, Math.min(1, intensity));
  switch (tier) {
    case "low":
      return Number((0.035 + i * 0.035).toFixed(4));
    case "medium":
      return Number((0.07 + i * 0.07).toFixed(4));
    case "strong":
      return Number((0.14 + i * 0.1).toFixed(4));
    default:
      return Number((0.07 + i * 0.05).toFixed(4));
  }
}

export function resolveTextureSourceKindForPrepared(
  cell: PreparedEngineTextureCell,
): TextureSourceKind {
  if (cell.textureSourceKind) return cell.textureSourceKind;
  if (cell.lifecycleHistorical) return "lifecycle";
  if (cell.maxSizeInBucket >= WALL_IMPORTANT_BTC && cell.isMajor) return "wall";
  return "base";
}

export function recordPassiveBaseTexturePrepareStats(opts: {
  preparedCells: PreparedEngineTextureCell[];
  wallBandCellCount: number;
  viewportPriceBucketCount: number;
  midPrice: number | null | undefined;
  minRenderIntensity?: number;
}): PassiveBaseTexturePrepareStats {
  const minI =
    opts.minRenderIntensity ?? BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY;
  const baseCells = opts.preparedCells.filter(
    (c) => resolveTextureSourceKindForPrepared(c) === "base",
  );
  const lifecycleCells = opts.preparedCells.filter(
    (c) => resolveTextureSourceKindForPrepared(c) === "lifecycle",
  );

  const visible = baseCells.filter((c) => (c.intensity ?? 0) >= minI);
  const intensities = visible.map((c) => c.intensity ?? 0);
  const alphas = visible.map(
    (c) =>
      c.historicalRenderAlphaFloor ??
      baseTextureAlphaForIntensity(
        c.intensity ?? 0,
        classifyPassiveBaseTier(
          c.maxSizeInBucket,
          pctFromMid(c.price, opts.midPrice),
        ),
      ),
  );

  let nearTick = 0;
  let midRange = 0;
  let far = 0;
  const priceKeys = new Set<string>();
  for (const cell of visible) {
    priceKeys.add(`${cell.side}:${cell.price}`);
    const pct = pctFromMid(cell.price, opts.midPrice);
    if (pct <= 0.35) nearTick += 1;
    else if (pct <= 0.75) midRange += 1;
    else far += 1;
  }

  const viewportBuckets = Math.max(1, opts.viewportPriceBucketCount);
  const coveragePct = Number((priceKeys.size / viewportBuckets).toFixed(4));
  const nearTickKeys = new Set(
    visible
      .filter((c) => pctFromMid(c.price, opts.midPrice) <= 0.35)
      .map((c) => `${c.side}:${c.price}`),
  );
  const nearTickCoveragePct = Number(
    (nearTickKeys.size / viewportBuckets).toFixed(4),
  );

  const baseVisualSum = alphas.reduce((a, b) => a + b, 0);
  const lifecycleVisualSum = lifecycleCells.reduce(
    (a, c) => a + (c.historicalRenderAlphaFloor ?? (c.intensity ?? 0) * 0.35),
    0,
  );
  const wallVisualEst = opts.wallBandCellCount * 0.28;

  const stats: PassiveBaseTexturePrepareStats = {
    baseTextureCellCount: baseCells.length,
    lifecycleTextureCellCount: lifecycleCells.length,
    wallBandCellCount: opts.wallBandCellCount,
    baseTextureVisibleCount: visible.length,
    baseTextureNearTickCount: nearTick,
    baseTextureMidRangeCount: midRange,
    baseTextureFarCount: far,
    baseTextureAvgIntensity: intensities.length
      ? Number(
          (intensities.reduce((a, b) => a + b, 0) / intensities.length).toFixed(
            4,
          ),
        )
      : 0,
    baseTextureMedianIntensity: Number(median(intensities).toFixed(4)),
    baseTextureMaxIntensity: intensities.length ? Math.max(...intensities) : 0,
    baseTextureAvgAlpha: alphas.length
      ? Number((alphas.reduce((a, b) => a + b, 0) / alphas.length).toFixed(4))
      : 0,
    baseTextureMedianAlpha: Number(median(alphas).toFixed(4)),
    baseTextureMaxAlpha: alphas.length ? Math.max(...alphas) : 0,
    baseTextureCoveragePct: coveragePct,
    baseTextureNearTickCoveragePct: nearTickCoveragePct,
    baseTextureDensityScore: Number(
      (coveragePct * 0.55 + nearTickCoveragePct * 0.45).toFixed(4),
    ),
    lifecycleToBaseRatio:
      baseCells.length > 0
        ? Number((lifecycleCells.length / baseCells.length).toFixed(4))
        : lifecycleCells.length > 0
          ? 1
          : 0,
    wallToBaseRatio:
      baseCells.length > 0
        ? Number((opts.wallBandCellCount / baseCells.length).toFixed(4))
        : 0,
    baseVsLifecycleVisualRatio:
      lifecycleVisualSum > 0
        ? Number((baseVisualSum / lifecycleVisualSum).toFixed(4))
        : baseVisualSum > 0
          ? 10
          : 0,
    baseVsWallVisualRatio:
      wallVisualEst > 0
        ? Number((baseVisualSum / wallVisualEst).toFixed(4))
        : baseVisualSum > 0
          ? 10
          : 0,
  };

  lastPrepareStats = stats;
  return stats;
}

export function getPassiveBaseTextureSelectStats(): PassiveBaseTextureSelectStats {
  return lastSelectStats;
}

export function getPassiveBaseTexturePrepareStats(): PassiveBaseTexturePrepareStats {
  return lastPrepareStats;
}

export type BookmapPassiveBaseTextureAudit = {
  market: string;
  sourceMode: string;
  verticalMode: string;
  spotPrice: number | null;
  dataEndTime: number;
  rawHeatmapCellCount: number;
  baseTextureCellCount: number;
  lifecycleTextureCellCount: number;
  wallBandCellCount: number;
  baseTextureVisibleCount: number;
  baseTextureNearTickCount: number;
  baseTextureMidRangeCount: number;
  baseTextureFarCount: number;
  baseTextureAvgIntensity: number;
  baseTextureMedianIntensity: number;
  baseTextureMaxIntensity: number;
  baseTextureAvgAlpha: number;
  baseTextureMedianAlpha: number;
  baseTextureMaxAlpha: number;
  baseTextureCoveragePct: number;
  baseTextureNearTickCoveragePct: number;
  baseTextureDensityScore: number;
  lifecycleToBaseRatio: number;
  wallToBaseRatio: number;
  baseVsLifecycleVisualRatio: number;
  baseVsWallVisualRatio: number;
  baseTextureTooSparse: boolean;
  baseTextureTooWeak: boolean;
  baseTextureTooFiltered: boolean;
  baseTextureDominatedByLifecycle: boolean;
  passiveBaseTextureOk: boolean;
  baseTextureBookmapDensityOk: boolean;
  forceBookmapLikeEnabled: boolean;
  nearTickPassiveMistCount: number;
  nearTickPassiveMistCoveragePct: number;
  baseYellowCount: number;
  baseOrangeCount: number;
  falseStrongColorCount: number;
  colorHierarchyOk: boolean;
  baseLongFlatSpanCount: number;
  lifecycleLongFlatSpanCount: number;
  rightSideUniformLengthScore: number;
  liveProjectionMechanicalScore: number;
  dotsReadabilityOk: boolean;
  bookmapLikeVisualScore: number;
  bookmapLikeVisualOk: boolean;
};

export function buildBookmapPassiveBaseTextureAudit(opts: {
  market: string;
  sourceMode: string;
  verticalMode: string;
  spotPrice: number | null;
  dataEndTime: number;
  rawHeatmapCellCount: number;
  selectStats?: PassiveBaseTextureSelectStats;
  prepareStats?: PassiveBaseTexturePrepareStats;
  lifecycleBookmapLikeOk?: boolean;
  rightSideBookmapProjectionOk?: boolean;
  lifecycleArtificialBandScore?: number;
  lifecycleLongFlatSpanCount?: number;
  rightSideUniformLengthScore?: number;
  liveProjectionMechanicalScore?: number;
}): BookmapPassiveBaseTextureAudit {
  const sel = opts.selectStats ?? getPassiveBaseTextureSelectStats();
  const prep = opts.prepareStats ?? getPassiveBaseTexturePrepareStats();

  const baseTextureTooSparse =
    prep.baseTextureVisibleCount < 12 || prep.baseTextureCoveragePct < 0.12;
  const baseTextureTooWeak =
    prep.baseTextureAvgAlpha < 0.045 && prep.baseTextureVisibleCount > 0;
  const baseTextureTooFiltered =
    sel.filteredByBaseRulesCount > sel.rawCandidateCount * 0.65 &&
    sel.rawCandidateCount > 20;
  const baseTextureDominatedByLifecycle =
    prep.lifecycleToBaseRatio > 0.45 || prep.baseVsLifecycleVisualRatio < 0.85;

  const baseTextureBookmapDensityOk =
    prep.baseTextureCoveragePct >= 0.18 &&
    prep.baseTextureDensityScore >= 0.15 &&
    prep.baseTextureAvgAlpha >= 0.045 &&
    prep.baseTextureAvgAlpha <= 0.2;

  const passiveBaseTextureOk =
    !baseTextureTooSparse &&
    !baseTextureTooWeak &&
    !baseTextureDominatedByLifecycle &&
    baseTextureBookmapDensityOk &&
    prep.lifecycleToBaseRatio < 0.35;

  const forceStats = getBookmapVisualForceFrameStats();
  const ch = forceStats.colorHierarchy;
  const bookmapLikeVisualScore = computeBookmapLikeVisualScore({
    passiveBaseTextureOk,
    lifecycleBookmapLikeOk: opts.lifecycleBookmapLikeOk ?? true,
    rightSideBookmapProjectionOk: opts.rightSideBookmapProjectionOk ?? true,
    colorHierarchyOk: ch.colorHierarchyOk,
    baseTextureCoveragePct: prep.baseTextureCoveragePct,
    nearTickPassiveMistCoveragePct: forceStats.nearTickPassiveMistCoveragePct,
    falseStrongColorCount: ch.falseStrongColorCount,
    rightSideUniformLengthScore: opts.rightSideUniformLengthScore ?? 0,
    lifecycleArtificialBandScore: opts.lifecycleArtificialBandScore ?? 0,
  });
  const bookmapLikeVisualOk =
    passiveBaseTextureOk &&
    (opts.lifecycleBookmapLikeOk ?? true) &&
    (opts.rightSideBookmapProjectionOk ?? true) &&
    ch.colorHierarchyOk &&
    forceStats.dotsReadabilityOk &&
    bookmapLikeVisualScore >= 0.62;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    verticalMode: opts.verticalMode,
    spotPrice: opts.spotPrice,
    dataEndTime: opts.dataEndTime,
    rawHeatmapCellCount: opts.rawHeatmapCellCount,
    baseTextureCellCount: prep.baseTextureCellCount,
    lifecycleTextureCellCount: prep.lifecycleTextureCellCount,
    wallBandCellCount: prep.wallBandCellCount,
    baseTextureVisibleCount: prep.baseTextureVisibleCount,
    baseTextureNearTickCount: prep.baseTextureNearTickCount,
    baseTextureMidRangeCount: prep.baseTextureMidRangeCount,
    baseTextureFarCount: prep.baseTextureFarCount,
    baseTextureAvgIntensity: prep.baseTextureAvgIntensity,
    baseTextureMedianIntensity: prep.baseTextureMedianIntensity,
    baseTextureMaxIntensity: prep.baseTextureMaxIntensity,
    baseTextureAvgAlpha: prep.baseTextureAvgAlpha,
    baseTextureMedianAlpha: prep.baseTextureMedianAlpha,
    baseTextureMaxAlpha: prep.baseTextureMaxAlpha,
    baseTextureCoveragePct: prep.baseTextureCoveragePct,
    baseTextureNearTickCoveragePct: prep.baseTextureNearTickCoveragePct,
    baseTextureDensityScore: prep.baseTextureDensityScore,
    lifecycleToBaseRatio: prep.lifecycleToBaseRatio,
    wallToBaseRatio: prep.wallToBaseRatio,
    baseVsLifecycleVisualRatio: prep.baseVsLifecycleVisualRatio,
    baseVsWallVisualRatio: prep.baseVsWallVisualRatio,
    baseTextureTooSparse,
    baseTextureTooWeak,
    baseTextureTooFiltered,
    baseTextureDominatedByLifecycle,
    passiveBaseTextureOk,
    baseTextureBookmapDensityOk,
    forceBookmapLikeEnabled: BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE,
    nearTickPassiveMistCount: forceStats.nearTickPassiveMistCount,
    nearTickPassiveMistCoveragePct: forceStats.nearTickPassiveMistCoveragePct,
    baseYellowCount: ch.baseYellowCount,
    baseOrangeCount: ch.baseOrangeCount,
    falseStrongColorCount: ch.falseStrongColorCount,
    colorHierarchyOk: ch.colorHierarchyOk,
    baseLongFlatSpanCount: forceStats.baseLongFlatSpanCount,
    lifecycleLongFlatSpanCount: opts.lifecycleLongFlatSpanCount ?? 0,
    rightSideUniformLengthScore: opts.rightSideUniformLengthScore ?? 0,
    liveProjectionMechanicalScore: opts.liveProjectionMechanicalScore ?? 0,
    dotsReadabilityOk: forceStats.dotsReadabilityOk,
    bookmapLikeVisualScore,
    bookmapLikeVisualOk,
  };
}

/** Right-side temporal fade — low/mid live levels fade toward visible edge. */
export function applyRightSideTemporalFade(
  alpha: number,
  progress: number,
  tier: "protected" | "mid" | "low",
): number {
  const p = Math.max(0, Math.min(1, progress));
  if (tier === "protected") {
    return alpha * (1 - p * 0.08);
  }
  if (tier === "mid") {
    return alpha * (1 - p * (1 - 0.55));
  }
  return alpha * (1 - p * (1 - 0.55));
}

export function classifyRightSideFadeTier(opts: {
  liveIsNearTick: boolean;
  liveIsTopDom: boolean;
  liveIsWall: boolean;
  protectedLevel: boolean;
  quantileTier: "bottom" | "mid" | "high" | "top";
}): "protected" | "mid" | "low" {
  if (
    opts.protectedLevel ||
    opts.liveIsWall ||
    opts.liveIsTopDom ||
    opts.liveIsNearTick ||
    opts.quantileTier === "top"
  ) {
    return "protected";
  }
  if (opts.quantileTier === "mid" || opts.quantileTier === "high") {
    return "mid";
  }
  return "low";
}
