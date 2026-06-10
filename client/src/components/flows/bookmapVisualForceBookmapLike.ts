/**
 * P5.1 — Final visual forcing for Bookmap-realistic heatmap (render-only, no feed changes).
 */

import {
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { HeatmapCell } from "@shared/bookmapMarket";
import type { LiveDomBookLevel } from "./bookmapLiveDomPriority";
import type { LifecycleTextureTier } from "./bookmapLifecycleTextureIntegration";
import type { PreparedEngineTextureCell } from "./bookmapEnginePrepare";
import { BOOKMAP_TEXTURE_SAMPLER_MS } from "./bookmapEnginePrepare";
import type { PassiveBaseTextureTier, TextureSourceKind } from "./bookmapPassiveBaseTexture";

/** P5.1 — master switch for render-only Bookmap-like visual forcing. */
export const BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE = true;

export const BOOKMAP_NEAR_TICK_MIST_MIN_BTC = 0.35;
export const BOOKMAP_NEAR_TICK_MIST_PCT = 0.2;
/** Max render intensity before yellow on passive base (cyan cap). */
export const BOOKMAP_BASE_CYAN_MAX_INTENSITY = 0.48;
export const BOOKMAP_BASE_SOFT_YELLOW_MAX_INTENSITY = 0.58;

export type RightSideLengthTier = "protected" | "strong" | "normal" | "trace";

export type BookmapColorHierarchyStats = {
  baseYellowCount: number;
  baseOrangeCount: number;
  lifecycleOrangeCount: number;
  falseStrongColorCount: number;
  colorHierarchyOk: boolean;
};

export type BookmapVisualForceFrameStats = {
  nearTickPassiveMistCount: number;
  nearTickPassiveMistCoveragePct: number;
  baseLongFlatSpanCount: number;
  heatmapUnderDotsTooStrong: number;
  avgHeatmapAlphaNearRecentDots: number;
  dotsReadabilityOk: boolean;
  colorHierarchy: BookmapColorHierarchyStats;
};

let frameStats: BookmapVisualForceFrameStats = emptyFrameStats();

function emptyFrameStats(): BookmapVisualForceFrameStats {
  return {
    nearTickPassiveMistCount: 0,
    nearTickPassiveMistCoveragePct: 0,
    baseLongFlatSpanCount: 0,
    heatmapUnderDotsTooStrong: 0,
    avgHeatmapAlphaNearRecentDots: 0,
    dotsReadabilityOk: true,
    colorHierarchy: {
      baseYellowCount: 0,
      baseOrangeCount: 0,
      lifecycleOrangeCount: 0,
      falseStrongColorCount: 0,
      colorHierarchyOk: true,
    },
  };
}

export function resetBookmapVisualForceFrameStats(
  viewportPriceBucketCount = 1,
): void {
  frameStats = emptyFrameStats();
  frameStats.nearTickPassiveMistCoveragePct =
    viewportPriceBucketCount > 0
      ? Number(
          (frameStats.nearTickPassiveMistCount / viewportPriceBucketCount).toFixed(
            4,
          ),
        )
      : 0;
}

export function getBookmapVisualForceFrameStats(): BookmapVisualForceFrameStats {
  return frameStats;
}

export function stableVisualHash(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function pctFromMid(price: number, mid: number | null | undefined): number {
  if (mid == null || mid <= 0) return 100;
  return (Math.abs(price - mid) / mid) * 100;
}

export function passesNearTickPassiveMistRule(
  sizeBtc: number,
  price: number,
  midPrice: number | null | undefined,
): boolean {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE || sizeBtc <= 0) return false;
  const pct = pctFromMid(price, midPrice);
  if (pct <= BOOKMAP_NEAR_TICK_MIST_PCT && sizeBtc >= BOOKMAP_NEAR_TICK_MIST_MIN_BTC) {
    return true;
  }
  return false;
}

export function nearTickPassiveMistAlpha(
  price: number,
  midPrice: number | null | undefined,
  sizeBtc: number,
): number {
  const pct = pctFromMid(price, midPrice);
  if (pct <= 0.2) {
    return Number((0.025 + Math.min(1, sizeBtc / 3) * 0.035).toFixed(4));
  }
  if (pct <= 0.35) {
    return Number((0.035 + Math.min(1, sizeBtc / 5) * 0.05).toFixed(4));
  }
  if (pct <= 0.75) {
    return Number((0.05 + Math.min(1, sizeBtc / 8) * 0.07).toFixed(4));
  }
  return 0.05;
}

export function injectNearTickPassiveMistCells(opts: {
  baseCells: HeatmapCell[];
  bookLevels: LiveDomBookLevel[];
  midPrice: number | null | undefined;
  minPrice: number;
  maxPrice: number;
  dataEndTime: number;
  priceBucketUsd?: number;
  seenKeys: Set<string>;
}): HeatmapCell[] {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE || !opts.bookLevels.length) {
    return opts.baseCells;
  }

  const out = [...opts.baseCells];
  const bucketUsd = opts.priceBucketUsd ?? 5;
  const snapBucket =
    Math.floor(opts.dataEndTime / BOOKMAP_TEXTURE_SAMPLER_MS) *
    BOOKMAP_TEXTURE_SAMPLER_MS;
  let mistCount = 0;

  for (const level of opts.bookLevels) {
    if (level.size <= 0) continue;
    if (!passesNearTickPassiveMistRule(level.size, level.price, opts.midPrice)) {
      continue;
    }
    const bp = Math.round(level.price / bucketUsd) * bucketUsd;
    if (bp < opts.minPrice || bp > opts.maxPrice) continue;
    const key = `${snapBucket}:${level.side}:${bp}`;
    if (opts.seenKeys.has(key)) continue;
    opts.seenKeys.add(key);
    out.push({
      timeBucket: snapBucket,
      price: bp,
      side: level.side,
      size: level.size,
      maxSizeInBucket: level.size,
      lastSizeInBucket: level.size,
      lastUpdateTs: opts.dataEndTime,
    });
    mistCount += 1;
  }

  frameStats.nearTickPassiveMistCount = mistCount;
  return out;
}

export function isDominantLiquidityForWarmColor(opts: {
  localRankScore: number;
  absoluteSizeScore: number;
  topPercentile?: boolean;
}): boolean {
  return (
    opts.localRankScore >= 0.85 ||
    opts.absoluteSizeScore >= 0.8 ||
    opts.topPercentile === true
  );
}

/** Clamp render intensity — reserve yellow/orange for truly dominant liquidity. */
export function clampBookmapLikeRenderIntensity(opts: {
  intensity: number;
  sourceKind: TextureSourceKind;
  lifecycleTier?: LifecycleTextureTier;
  tier?: PassiveBaseTextureTier;
  localRankScore?: number;
  absoluteSizeScore?: number;
  topPercentile?: boolean;
  isStructuralWall?: boolean;
  isMajorWall?: boolean;
}): number {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE) {
    return opts.intensity;
  }

  let cap = opts.intensity;
  const rank = opts.localRankScore ?? 0;
  const abs = opts.absoluteSizeScore ?? 0;
  const dominant = isDominantLiquidityForWarmColor({
    localRankScore: rank,
    absoluteSizeScore: abs,
    topPercentile: opts.topPercentile,
  });

  if (opts.sourceKind === "base") {
    if (opts.tier === "low" || opts.tier === "medium") {
      cap = Math.min(cap, BOOKMAP_BASE_CYAN_MAX_INTENSITY);
    } else if (opts.tier === "strong") {
      cap = dominant
        ? Math.min(cap, BOOKMAP_BASE_SOFT_YELLOW_MAX_INTENSITY)
        : Math.min(cap, BOOKMAP_BASE_CYAN_MAX_INTENSITY);
    } else {
      cap = Math.min(cap, BOOKMAP_BASE_CYAN_MAX_INTENSITY);
    }
    recordColorSample(opts.intensity, cap, "base");
  } else if (opts.sourceKind === "lifecycle") {
    const lt = opts.lifecycleTier ?? "normal";
    if (lt === "trace" || lt === "normal") {
      cap = Math.min(cap, 0.42);
    } else if (lt === "strong") {
      cap = Math.min(cap, dominant ? 0.62 : 0.48);
    } else if (lt === "wall") {
      if (opts.isStructuralWall || opts.isMajorWall) {
        cap = Math.min(cap, 0.88);
      } else {
        cap = Math.min(cap, 0.55);
      }
    }
    if (opts.intensity > 0.52 && cap <= 0.48) {
      recordColorSample(opts.intensity, cap, "lifecycle");
    }
  }

  return Number(Math.max(0.04, cap).toFixed(4));
}

function recordColorSample(
  before: number,
  after: number,
  kind: "base" | "lifecycle",
): void {
  const ch = frameStats.colorHierarchy;
  if (before >= 0.52 && after < before) {
    ch.falseStrongColorCount += 1;
  }
  if (after >= 0.48 && after < 0.62) {
    if (kind === "base") ch.baseYellowCount += 1;
  }
  if (after >= 0.62) {
    if (kind === "base") ch.baseOrangeCount += 1;
    else ch.lifecycleOrangeCount += 1;
  }
}

export function finalizeColorHierarchyStats(): void {
  const ch = frameStats.colorHierarchy;
  ch.colorHierarchyOk =
    ch.falseStrongColorCount <= 3 &&
    ch.baseOrangeCount <= Math.max(2, ch.baseYellowCount * 0.35);
}

export function canRenderLongCleanSpan(opts: {
  sourceKind: TextureSourceKind;
  lifecycleTier?: LifecycleTextureTier;
  isStructuralWall?: boolean;
  isMajorWall?: boolean;
  isExtremeTopDom?: boolean;
  maxSizeBtc: number;
}): boolean {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE) return true;
  if (opts.isStructuralWall || opts.isMajorWall) return true;
  if (opts.lifecycleTier === "wall") return true;
  if (opts.isExtremeTopDom && opts.maxSizeBtc >= 12) return true;
  if (opts.sourceKind === "wall") return true;
  return false;
}

export function shouldForceGranularBookmapTexture(
  cell: PreparedEngineTextureCell,
  spanDurationMs: number,
  samplerMs: number,
): boolean {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE) return false;
  if (
    canRenderLongCleanSpan({
      sourceKind: cell.textureSourceKind ?? (cell.lifecycleHistorical ? "lifecycle" : "base"),
      lifecycleTier: cell.lifecycleTextureTier,
      isStructuralWall: cell.maxSizeInBucket >= WALL_STRUCTURAL_BTC,
      isMajorWall: cell.maxSizeInBucket >= WALL_MAJOR_BTC || cell.isMajor,
      isExtremeTopDom: cell.lifecycleStrong === true,
      maxSizeBtc: cell.maxSizeInBucket,
    })
  ) {
    return false;
  }
  const tier = cell.lifecycleTextureTier;
  if (tier === "trace" || tier === "normal") return true;
  if (cell.textureSourceKind === "base") return true;
  return spanDurationMs > samplerMs * 2;
}

export function applyStableGapModulation(opts: {
  key: string;
  timeBucket: number;
  alpha: number;
  intensity: number;
  protectedNearTick?: boolean;
  lifecycleTier?: LifecycleTextureTier;
  sourceKind?: TextureSourceKind;
}): { alpha: number; intensity: number; gapApplied: boolean } {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE || opts.protectedNearTick) {
    return { alpha: opts.alpha, intensity: opts.intensity, gapApplied: false };
  }

  const tier = opts.lifecycleTier;
  const isSoftTier =
    tier === "trace" ||
    tier === "normal" ||
    opts.sourceKind === "base";

  if (!isSoftTier) {
    return { alpha: opts.alpha, intensity: opts.intensity, gapApplied: false };
  }

  const hash = stableVisualHash(`${opts.key}:${opts.timeBucket}`, 0x51a5);
  const gapChance = 0.08 + hash * 0.1;
  const bucket = hash % 1;
  if (bucket > gapChance) {
    return { alpha: opts.alpha, intensity: opts.intensity, gapApplied: false };
  }

  const fade = 0.3 + (hash % 0.4);
  return {
    alpha: Number((opts.alpha * fade).toFixed(4)),
    intensity: Number((opts.intensity * (0.85 + fade * 0.12)).toFixed(4)),
    gapApplied: true,
  };
}

export function classifyRightSideLengthTier(opts: {
  liveIsNearTick: boolean;
  liveIsTopDom: boolean;
  liveIsWall: boolean;
  protectedLevel: boolean;
  quantileTier: "bottom" | "mid" | "high" | "top";
  sizeBtc: number;
}): RightSideLengthTier {
  if (
    opts.protectedLevel ||
    opts.liveIsWall ||
    (opts.liveIsTopDom && opts.sizeBtc >= 5) ||
    (opts.liveIsNearTick && opts.sizeBtc >= 2)
  ) {
    return "protected";
  }
  if (opts.quantileTier === "top" || opts.quantileTier === "high") {
    return "strong";
  }
  if (opts.quantileTier === "mid") return "normal";
  return "trace";
}

export function resolveRightSideVisualLengthFraction(opts: {
  tier: RightSideLengthTier;
  side: string;
  price: number;
}): number {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE || opts.tier === "protected") {
    const mod =
      0.9 +
      stableVisualHash(`${opts.side}:${opts.price}`, 0x7f4a7c) * 0.1;
    return Math.min(1.05, mod);
  }

  const hash = stableVisualHash(`${opts.side}:${opts.price}`, 0x9e3779);
  const lengthMod = 0.9 + hash * 0.15;

  switch (opts.tier) {
    case "strong":
      return Number((0.85 + hash * 0.15).toFixed(4)) * lengthMod;
    case "normal":
      return Number((0.55 + hash * 0.2).toFixed(4)) * lengthMod;
    case "trace":
    default:
      return Number((0.3 + hash * 0.2).toFixed(4)) * lengthMod;
  }
}

export function applyWallBandBaseIntegrationAlpha(
  wallAlpha: number,
  hasBaseTextureUnder: boolean,
  isStructuralOrMajor: boolean,
  textureMod = 1,
): number {
  if (!BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE || !hasBaseTextureUnder) {
    return wallAlpha;
  }
  if (isStructuralOrMajor) {
    return Number((wallAlpha * (0.92 + (textureMod - 1) * 0.08)).toFixed(4));
  }
  return Number((wallAlpha * 0.82 * textureMod).toFixed(4));
}

export function recordHeatmapAlphaNearDots(alpha: number, nearRecentDots: boolean): void {
  if (!nearRecentDots) return;
  const n = frameStats.heatmapUnderDotsTooStrong;
  frameStats.avgHeatmapAlphaNearRecentDots =
    n <= 0 ? alpha : (frameStats.avgHeatmapAlphaNearRecentDots * n + alpha) / (n + 1);
  if (alpha > 0.32) {
    frameStats.heatmapUnderDotsTooStrong += 1;
  }
}

export function finalizeDotsReadabilityStats(): void {
  frameStats.dotsReadabilityOk =
    frameStats.heatmapUnderDotsTooStrong <= 4 &&
    frameStats.avgHeatmapAlphaNearRecentDots <= 0.28;
}

export function recordBaseLongFlatSpanCount(count = 1): void {
  frameStats.baseLongFlatSpanCount += count;
}

export function setNearTickPassiveMistCoverage(viewportPriceBucketCount: number): void {
  frameStats.nearTickPassiveMistCoveragePct =
    viewportPriceBucketCount > 0
      ? Number(
          (frameStats.nearTickPassiveMistCount / viewportPriceBucketCount).toFixed(
            4,
          ),
        )
      : 0;
}

export function computeBookmapLikeVisualScore(opts: {
  passiveBaseTextureOk: boolean;
  lifecycleBookmapLikeOk: boolean;
  rightSideBookmapProjectionOk: boolean;
  colorHierarchyOk: boolean;
  baseTextureCoveragePct: number;
  nearTickPassiveMistCoveragePct: number;
  falseStrongColorCount: number;
  rightSideUniformLengthScore: number;
  lifecycleArtificialBandScore: number;
}): number {
  let score = 0;
  if (opts.passiveBaseTextureOk) score += 0.22;
  if (opts.lifecycleBookmapLikeOk) score += 0.18;
  if (opts.rightSideBookmapProjectionOk) score += 0.15;
  if (opts.colorHierarchyOk) score += 0.12;
  score += Math.min(0.12, opts.baseTextureCoveragePct * 0.45);
  score += Math.min(0.08, opts.nearTickPassiveMistCoveragePct * 0.35);
  score -= Math.min(0.15, opts.falseStrongColorCount * 0.02);
  score -= Math.min(0.12, opts.rightSideUniformLengthScore * 0.12);
  score -= Math.min(0.1, opts.lifecycleArtificialBandScore * 0.15);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}
