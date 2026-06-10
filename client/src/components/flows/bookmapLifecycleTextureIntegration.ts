/**
 * P4.1/P4.2 — Lifecycle historical texture integration (Bookmap-style, not flat overlay).
 */

import {
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { LiquidityLifecycleLevel } from "./bookmapLiquidityLifecycle";
import type { RestingLiquidityWriteConfig } from "./bookmapRestingLiquidity";

/** P4.2 — hard visual filter: fewer writes, lower alpha, granular texture. */
export const BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER = true;

export type LifecycleTextureTier = "trace" | "normal" | "strong" | "wall";

/** @deprecated use LifecycleTextureTier */
export type LifecycleRenderTier = "normal" | "strong" | "wall";

export type LifecycleHistoricalCellMeta = {
  lifecycleActive: boolean;
  lifecyclePulled: boolean;
  lifecycleFootprint: boolean;
  lifecycleWall: boolean;
  lifecycleStrong: boolean;
  lifecycleTextureMod: number;
  lifecycleTier: LifecycleTextureTier;
  historicalLifecycleIntensity: number;
  historicalLifecycleAlpha: number;
  peakRetentionFloor: number;
  persistenceMs: number;
};

export type LifecycleTextureIntegrationStats = {
  lifecycleHistoricalCellsCount: number;
  lifecycleFootprintCellsCount: number;
  lifecycleCellsMergedIntoTextureCount: number;
  lifecycleCellsRenderedCount: number;
  lifecycleAvgSize: number;
  lifecycleAvgPeakSize: number;
  lifecycleAvgIntensity: number;
  lifecycleAvgAlpha: number;
  lifecycleMaxAlpha: number;
  lifecycleOverlayLikeCount: number;
  lifecycleFlatBandCount: number;
  lifecycleTooDominantCount: number;
  avgLifecycleSpanDurationMs: number;
  maxLifecycleSpanDurationMs: number;
  lifecycleTraceCount: number;
  lifecycleNormalCount: number;
  lifecycleStrongCount: number;
  lifecycleWallCount: number;
  lifecycleWriteDensityHigh: boolean;
  lifecycleWriteDecimatedCount: number;
  lifecycleWriteSkippedByDensityCount: number;
  lifecycleWriteProtectedCount: number;
  lifecycleLongFlatSpanCount: number;
  lifecycleArtificialBandScore: number;
};

const lifecycleCellMetaByKey = new Map<string, LifecycleHistoricalCellMeta>();
let integrationStats: LifecycleTextureIntegrationStats = emptyIntegrationStats();

function metaKey(timeBucket: number, side: string, price: number): string {
  return `${timeBucket}:${side}:${price}`;
}

function emptyIntegrationStats(): LifecycleTextureIntegrationStats {
  return {
    lifecycleHistoricalCellsCount: 0,
    lifecycleFootprintCellsCount: 0,
    lifecycleCellsMergedIntoTextureCount: 0,
    lifecycleCellsRenderedCount: 0,
    lifecycleAvgSize: 0,
    lifecycleAvgPeakSize: 0,
    lifecycleAvgIntensity: 0,
    lifecycleAvgAlpha: 0,
    lifecycleMaxAlpha: 0,
    lifecycleOverlayLikeCount: 0,
    lifecycleFlatBandCount: 0,
    lifecycleTooDominantCount: 0,
    avgLifecycleSpanDurationMs: 0,
    maxLifecycleSpanDurationMs: 0,
    lifecycleTraceCount: 0,
    lifecycleNormalCount: 0,
    lifecycleStrongCount: 0,
    lifecycleWallCount: 0,
    lifecycleWriteDensityHigh: false,
    lifecycleWriteDecimatedCount: 0,
    lifecycleWriteSkippedByDensityCount: 0,
    lifecycleWriteProtectedCount: 0,
    lifecycleLongFlatSpanCount: 0,
    lifecycleArtificialBandScore: 0,
  };
}

export function clearLifecycleTextureIntegrationFrame(): void {
  lifecycleCellMetaByKey.clear();
  integrationStats = emptyIntegrationStats();
}

export function getLifecycleCellMeta(
  timeBucket: number,
  side: "bid" | "ask",
  price: number,
): LifecycleHistoricalCellMeta | undefined {
  return lifecycleCellMetaByKey.get(metaKey(timeBucket, side, price));
}

export function getLifecycleTextureIntegrationStats(): LifecycleTextureIntegrationStats {
  return integrationStats;
}

export function recordLifecycleTexturePrepareStats(opts: {
  mergedCount: number;
  renderedCount: number;
  spanDurationsMs: number[];
  longFlatSpanCount?: number;
}): void {
  integrationStats.lifecycleCellsMergedIntoTextureCount = opts.mergedCount;
  integrationStats.lifecycleCellsRenderedCount = opts.renderedCount;
  if (opts.longFlatSpanCount != null) {
    integrationStats.lifecycleLongFlatSpanCount = opts.longFlatSpanCount;
  }
  if (opts.spanDurationsMs.length > 0) {
    integrationStats.avgLifecycleSpanDurationMs = Number(
      (
        opts.spanDurationsMs.reduce((a, b) => a + b, 0) /
        opts.spanDurationsMs.length
      ).toFixed(0),
    );
    integrationStats.maxLifecycleSpanDurationMs = Math.max(...opts.spanDurationsMs);
  }
  const flatRatio =
    opts.spanDurationsMs.length > 0
      ? integrationStats.lifecycleLongFlatSpanCount / opts.spanDurationsMs.length
      : 0;
  const dominantRatio =
    integrationStats.lifecycleHistoricalCellsCount +
      integrationStats.lifecycleFootprintCellsCount >
    0
      ? integrationStats.lifecycleTooDominantCount /
        (integrationStats.lifecycleHistoricalCellsCount +
          integrationStats.lifecycleFootprintCellsCount)
      : 0;
  integrationStats.lifecycleArtificialBandScore = Number(
    (flatRatio * 0.55 + dominantRatio * 0.45).toFixed(4),
  );
}

export function recordLifecycleWriteDecimationStats(opts: {
  densityHigh: boolean;
  decimatedCount: number;
  skippedCount: number;
  protectedCount: number;
}): void {
  integrationStats.lifecycleWriteDensityHigh = opts.densityHigh;
  integrationStats.lifecycleWriteDecimatedCount = opts.decimatedCount;
  integrationStats.lifecycleWriteSkippedByDensityCount = opts.skippedCount;
  integrationStats.lifecycleWriteProtectedCount = opts.protectedCount;
}

/** Deterministic 0..1 hash — stable per key + timeBucket. */
export function stableLifecycleHash(key: string, timeBucket: number): number {
  let h = 2166136261;
  const s = `${key}:${timeBucket}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function computeLifecycleTextureMod(
  lifecycleKey: string,
  timeBucket: number,
): number {
  const hash = stableLifecycleHash(lifecycleKey, timeBucket);
  return 0.94 + hash * 0.12;
}

export function classifyLifecycleTextureTier(
  level: LiquidityLifecycleLevel,
  config: RestingLiquidityWriteConfig,
  opts?: { footprint?: boolean; forceTrace?: boolean },
): LifecycleTextureTier {
  if (opts?.forceTrace) return "trace";

  const size = Math.max(level.smoothedSize, level.peakSize);
  const isMajorWall =
    level.structuralCandidate && size >= WALL_MAJOR_BTC;
  const isStructuralWall =
    level.structuralCandidate && size >= WALL_STRUCTURAL_BTC;

  if (
    isMajorWall ||
    isStructuralWall ||
    (level.wallCandidate && size >= config.wallMinBtc)
  ) {
    return "wall";
  }

  const strongBySize = size >= (config.viewportMinBtc ?? 8);
  const strongByPersistence =
    level.activeDurationMs >= 5_000 && size >= 3;
  const strongByTopDom =
    level.topDomCandidate &&
    (level.activeDurationMs >= 2_500 || size >= config.near035MinBtc);
  const strongByNearTick =
    level.nearTick &&
    level.activeDurationMs >= 2_500 &&
    size >= 1.5;

  if (
    strongBySize ||
    strongByPersistence ||
    strongByTopDom ||
    strongByNearTick
  ) {
    return "strong";
  }

  if (
    size >= config.near035MinBtc ||
    level.activeDurationMs >= 3_000 ||
    (opts?.footprint && size >= config.near035MinBtc * 0.5)
  ) {
    return "normal";
  }

  if (
    level.topDomCandidate ||
    (level.nearTick && size >= 1) ||
    (opts?.footprint && size >= 1)
  ) {
    return "trace";
  }

  return "normal";
}

export function canCoalesceLifecycleTextureTier(
  tier: LifecycleTextureTier | undefined,
): boolean {
  if (!tier) return true;
  return tier === "strong" || tier === "wall";
}

export function lifecycleAlphaCapForTier(
  tier: LifecycleTextureTier,
  opts: {
    footprint?: boolean;
    pulled?: boolean;
    majorWall?: boolean;
    footprintStrong?: boolean;
  },
): number {
  if (opts.footprint) {
    if (opts.majorWall) return 0.34;
    if (opts.footprintStrong || tier === "strong") return 0.24;
    return tier === "wall" ? 0.34 : 0.18;
  }
  switch (tier) {
    case "trace":
      return 0.12;
    case "normal":
      return 0.22;
    case "strong":
      return 0.34;
    case "wall":
      return 0.52;
    default:
      return 0.22;
  }
}

export function computePeakRetentionFloor(
  level: LiquidityLifecycleLevel,
  ts: number,
): number {
  const peak = level.peakVisualIntensity;
  if (peak <= 0) return 0;

  if (level.active) {
    return peak * 0.45;
  }

  const goneAt = level.disappearedAt ?? ts;
  const sincePullMs = Math.max(0, ts - goneAt);

  if (sincePullMs <= 5_000) return peak * 0.35;
  if (sincePullMs <= 20_000) return peak * 0.22;
  return peak * 0.12;
}

export function computeHistoricalLifecycleIntensity(opts: {
  level: LiquidityLifecycleLevel;
  viewportMaxSize: number;
  ts: number;
  footprint: boolean;
}): number {
  const { level, viewportMaxSize, ts, footprint } = opts;
  const denom = Math.max(1, viewportMaxSize, 10);
  const sizeScore = Math.max(
    0,
    Math.min(1, level.smoothedSize / denom),
  );
  const persistenceScore = Math.min(1, level.activeDurationMs / 8_000);
  const peakScore = Math.max(
    0,
    Math.min(0.85, level.peakSize / denom),
  );
  const wallScore =
    level.structuralCandidate ||
    (level.wallCandidate && level.peakSize >= WALL_STRUCTURAL_BTC)
      ? 1
      : 0;

  let calculated =
    sizeScore * 0.45 +
    persistenceScore * 0.25 +
    peakScore * 0.2 +
    wallScore * 0.1;

  if (footprint) {
    calculated *= 0.62;
  }

  const peakFloor = computePeakRetentionFloor(level, ts);
  let intensity = Math.max(calculated, peakFloor);
  intensity = Math.min(0.72, intensity);

  const textureMod = computeLifecycleTextureMod(
    level.key,
    Math.floor(ts / 1_200) * 1_200,
  );
  intensity = Math.max(0.04, Math.min(0.88, intensity * textureMod));

  return Number(intensity.toFixed(4));
}

export function buildLifecycleHistoricalCellMeta(opts: {
  level: LiquidityLifecycleLevel;
  ts: number;
  viewportMaxSize: number;
  footprint: boolean;
  config: RestingLiquidityWriteConfig;
  forceTrace?: boolean;
}): LifecycleHistoricalCellMeta {
  const { level, ts, viewportMaxSize, footprint, config } = opts;
  const tier = classifyLifecycleTextureTier(level, config, {
    footprint,
    forceTrace: opts.forceTrace,
  });
  const textureMod = computeLifecycleTextureMod(
    level.key,
    Math.floor(ts / 1_200) * 1_200,
  );
  const historicalLifecycleIntensity = computeHistoricalLifecycleIntensity({
    level,
    viewportMaxSize,
    ts,
    footprint,
  });
  const peakRetentionFloor = computePeakRetentionFloor(level, ts);
  const majorWall =
    level.structuralCandidate && level.peakSize >= WALL_MAJOR_BTC;
  const footprintStrong = footprint && tier === "strong";
  const alphaCap = lifecycleAlphaCapForTier(tier, {
    footprint,
    pulled: level.pulled || level.pullingCandidate,
    majorWall,
    footprintStrong,
  });
  const tierIntensityMul =
    tier === "trace" ? 0.72 : tier === "normal" ? 0.88 : 1;
  const historicalLifecycleAlpha = Math.min(
    alphaCap,
    Math.max(0.06, historicalLifecycleIntensity * 0.42 * textureMod * tierIntensityMul),
  );

  return {
    lifecycleActive: level.active,
    lifecyclePulled: level.pulled || level.pullingCandidate,
    lifecycleFootprint: footprint,
    lifecycleWall: tier === "wall",
    lifecycleStrong: tier === "strong",
    lifecycleTextureMod: Number(textureMod.toFixed(4)),
    lifecycleTier: tier,
    historicalLifecycleIntensity,
    historicalLifecycleAlpha: Number(historicalLifecycleAlpha.toFixed(4)),
    peakRetentionFloor: Number(peakRetentionFloor.toFixed(4)),
    persistenceMs: level.activeDurationMs,
  };
}

export function registerLifecycleHistoricalCellMeta(
  timeBucket: number,
  side: "bid" | "ask",
  price: number,
  meta: LifecycleHistoricalCellMeta,
  size: number,
  peakSize: number,
): void {
  lifecycleCellMetaByKey.set(metaKey(timeBucket, side, price), meta);

  const n =
    integrationStats.lifecycleHistoricalCellsCount +
    integrationStats.lifecycleFootprintCellsCount;
  const avg = (v: number, x: number) =>
    n <= 0 ? x : (v * n + x) / (n + 1);

  if (meta.lifecycleFootprint) {
    integrationStats.lifecycleFootprintCellsCount += 1;
  } else {
    integrationStats.lifecycleHistoricalCellsCount += 1;
  }

  integrationStats.lifecycleAvgSize = avg(integrationStats.lifecycleAvgSize, size);
  integrationStats.lifecycleAvgPeakSize = avg(
    integrationStats.lifecycleAvgPeakSize,
    peakSize,
  );
  integrationStats.lifecycleAvgIntensity = avg(
    integrationStats.lifecycleAvgIntensity,
    meta.historicalLifecycleIntensity,
  );
  integrationStats.lifecycleAvgAlpha = avg(
    integrationStats.lifecycleAvgAlpha,
    meta.historicalLifecycleAlpha,
  );
  integrationStats.lifecycleMaxAlpha = Math.max(
    integrationStats.lifecycleMaxAlpha,
    meta.historicalLifecycleAlpha,
  );

  switch (meta.lifecycleTier) {
    case "trace":
      integrationStats.lifecycleTraceCount += 1;
      break;
    case "normal":
      integrationStats.lifecycleNormalCount += 1;
      break;
    case "strong":
      integrationStats.lifecycleStrongCount += 1;
      break;
    case "wall":
      integrationStats.lifecycleWallCount += 1;
      break;
  }

  if (
    meta.historicalLifecycleIntensity >= 0.52 &&
    meta.historicalLifecycleAlpha >= 0.3
  ) {
    integrationStats.lifecycleTooDominantCount += 1;
  }
  if (
    meta.historicalLifecycleIntensity >= 0.48 &&
    meta.lifecycleTextureMod >= 0.98 &&
    meta.lifecycleTextureMod <= 1.02
  ) {
    integrationStats.lifecycleFlatBandCount += 1;
  }
  if (
    meta.historicalLifecycleAlpha >= 0.28 &&
    meta.lifecycleTier !== "wall" &&
    !meta.lifecycleFootprint
  ) {
    integrationStats.lifecycleOverlayLikeCount += 1;
  }
}

export function scaleLifecycleAlphaForBaseDensity(
  historicalTextureCellCount: number,
): void {
  const lifecycleTotal =
    integrationStats.lifecycleHistoricalCellsCount +
    integrationStats.lifecycleFootprintCellsCount;
  if (historicalTextureCellCount <= 0 || lifecycleTotal <= 0) return;

  const ratio = lifecycleTotal / historicalTextureCellCount;
  if (ratio <= 0.45) return;

  const scale = ratio > 0.6 ? 0.62 : ratio > 0.5 ? 0.72 : 0.82;
  let alphaSum = 0;
  let alphaMax = 0;
  let intensitySum = 0;
  let n = 0;

  for (const [key, meta] of Array.from(lifecycleCellMetaByKey.entries())) {
    const nextAlpha = Number(
      (meta.historicalLifecycleAlpha * scale).toFixed(4),
    );
    const nextIntensity = Number(
      (meta.historicalLifecycleIntensity * (scale * 0.94)).toFixed(4),
    );
    lifecycleCellMetaByKey.set(key, {
      ...meta,
      historicalLifecycleAlpha: nextAlpha,
      historicalLifecycleIntensity: nextIntensity,
    });
    alphaSum += nextAlpha;
    intensitySum += nextIntensity;
    alphaMax = Math.max(alphaMax, nextAlpha);
    n += 1;
  }

  if (n > 0) {
    integrationStats.lifecycleAvgAlpha = alphaSum / n;
    integrationStats.lifecycleAvgIntensity = intensitySum / n;
    integrationStats.lifecycleMaxAlpha = alphaMax;
  }
}

export type BookmapLifecycleTextureIntegrationAudit = {
  market: string;
  sourceMode: string;
  verticalMode: string;
  spotPrice: number | null;
  dataEndTime: number;
  hardVisualFilterEnabled: boolean;
  lifecycleCacheSize: number;
  lifecycleHistoricalCellsCount: number;
  lifecycleFootprintCellsCount: number;
  lifecycleCellsMergedIntoTextureCount: number;
  lifecycleCellsRenderedCount: number;
  lifecycleAvgSize: number;
  lifecycleAvgPeakSize: number;
  lifecycleAvgIntensity: number;
  lifecycleAvgAlpha: number;
  lifecycleMaxAlpha: number;
  lifecycleTraceCount: number;
  lifecycleNormalCount: number;
  lifecycleStrongCount: number;
  lifecycleWallCount: number;
  lifecycleWriteDensityHigh: boolean;
  lifecycleWriteDecimatedCount: number;
  lifecycleWriteSkippedByDensityCount: number;
  lifecycleWriteProtectedCount: number;
  lifecycleOverlayLikeCount: number;
  lifecycleFlatBandCount: number;
  lifecycleTooDominantCount: number;
  historicalTextureCellCount: number;
  lifecycleToHistoricalRatio: number;
  avgLifecycleSpanDurationMs: number;
  maxLifecycleSpanDurationMs: number;
  lifecycleLongFlatSpanCount: number;
  lifecycleArtificialBandScore: number;
  lifecycleTextureIntegrationOk: boolean;
  lifecycleLooksLikeOverlayBug: boolean;
  lifecycleTooFlatBug: boolean;
  lifecycleTooDominantBug: boolean;
  lifecycleBookmapLikeOk: boolean;
  baseVsLifecycleVisualRatio?: number;
  baseVsWallVisualRatio?: number;
  baseTextureBookmapDensityOk?: boolean;
  lifecycleToBaseRatio?: number;
};

export function buildBookmapLifecycleTextureIntegrationAudit(opts: {
  market: string;
  sourceMode: string;
  verticalMode: string;
  spotPrice: number | null;
  dataEndTime: number;
  lifecycleCacheSize: number;
  historicalTextureCellCount: number;
  lifecycleHistoricalWriteOk?: boolean;
  lifecycleFootprintOk?: boolean;
  passiveBaseStats?: {
    lifecycleToBaseRatio: number;
    baseVsLifecycleVisualRatio: number;
    baseVsWallVisualRatio: number;
    baseTextureCoveragePct: number;
    baseTextureDensityScore: number;
    baseTextureAvgAlpha: number;
  };
}): BookmapLifecycleTextureIntegrationAudit {
  const s = getLifecycleTextureIntegrationStats();
  const lifecycleTotal =
    s.lifecycleHistoricalCellsCount + s.lifecycleFootprintCellsCount;
  const ratio =
    opts.historicalTextureCellCount > 0
      ? Number(
          (lifecycleTotal / opts.historicalTextureCellCount).toFixed(4),
        )
      : 0;

  const lifecycleLooksLikeOverlayBug =
    s.lifecycleOverlayLikeCount >= 3 &&
    s.lifecycleOverlayLikeCount > lifecycleTotal * 0.35;
  const lifecycleTooFlatBug =
    s.lifecycleFlatBandCount >= 2 &&
    s.lifecycleFlatBandCount > lifecycleTotal * 0.4;
  const lifecycleTooDominantBug =
    s.lifecycleTooDominantCount >= 2 &&
    s.lifecycleTooDominantCount > lifecycleTotal * 0.2;

  const ratioTooHigh = ratio > 0.45;
  const baseStats = opts.passiveBaseStats;
  const lifecycleToBaseRatio =
    baseStats?.lifecycleToBaseRatio ?? ratio;

  const lifecycleBookmapLikeOk =
    !lifecycleLooksLikeOverlayBug &&
    !lifecycleTooFlatBug &&
    !lifecycleTooDominantBug &&
    !ratioTooHigh &&
    s.lifecycleAvgAlpha <= 0.28 &&
    s.lifecycleMaxAlpha <= 0.52 &&
    s.lifecycleArtificialBandScore < 0.42 &&
    lifecycleToBaseRatio < 0.35;

  const baseTextureBookmapDensityOk =
    baseStats != null &&
    baseStats.baseTextureCoveragePct >= 0.18 &&
    baseStats.baseTextureDensityScore >= 0.15 &&
    baseStats.baseTextureAvgAlpha >= 0.045;

  const lifecycleTextureIntegrationOk =
    lifecycleTotal > 0 &&
    lifecycleBookmapLikeOk &&
    s.lifecycleAvgIntensity > 0.04 &&
    s.lifecycleAvgIntensity < 0.62 &&
    ratio < 0.45 &&
    (opts.lifecycleHistoricalWriteOk ?? true) &&
    (opts.lifecycleFootprintOk ?? true);

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    verticalMode: opts.verticalMode,
    spotPrice: opts.spotPrice,
    dataEndTime: opts.dataEndTime,
    hardVisualFilterEnabled: BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER,
    lifecycleCacheSize: opts.lifecycleCacheSize,
    lifecycleHistoricalCellsCount: s.lifecycleHistoricalCellsCount,
    lifecycleFootprintCellsCount: s.lifecycleFootprintCellsCount,
    lifecycleCellsMergedIntoTextureCount: s.lifecycleCellsMergedIntoTextureCount,
    lifecycleCellsRenderedCount: s.lifecycleCellsRenderedCount,
    lifecycleAvgSize: s.lifecycleAvgSize,
    lifecycleAvgPeakSize: s.lifecycleAvgPeakSize,
    lifecycleAvgIntensity: s.lifecycleAvgIntensity,
    lifecycleAvgAlpha: s.lifecycleAvgAlpha,
    lifecycleMaxAlpha: s.lifecycleMaxAlpha,
    lifecycleTraceCount: s.lifecycleTraceCount,
    lifecycleNormalCount: s.lifecycleNormalCount,
    lifecycleStrongCount: s.lifecycleStrongCount,
    lifecycleWallCount: s.lifecycleWallCount,
    lifecycleWriteDensityHigh: s.lifecycleWriteDensityHigh,
    lifecycleWriteDecimatedCount: s.lifecycleWriteDecimatedCount,
    lifecycleWriteSkippedByDensityCount: s.lifecycleWriteSkippedByDensityCount,
    lifecycleWriteProtectedCount: s.lifecycleWriteProtectedCount,
    lifecycleOverlayLikeCount: s.lifecycleOverlayLikeCount,
    lifecycleFlatBandCount: s.lifecycleFlatBandCount,
    lifecycleTooDominantCount: s.lifecycleTooDominantCount,
    historicalTextureCellCount: opts.historicalTextureCellCount,
    lifecycleToHistoricalRatio: ratio,
    avgLifecycleSpanDurationMs: s.avgLifecycleSpanDurationMs,
    maxLifecycleSpanDurationMs: s.maxLifecycleSpanDurationMs,
    lifecycleLongFlatSpanCount: s.lifecycleLongFlatSpanCount,
    lifecycleArtificialBandScore: s.lifecycleArtificialBandScore,
    lifecycleTextureIntegrationOk,
    lifecycleLooksLikeOverlayBug,
    lifecycleTooFlatBug,
    lifecycleTooDominantBug,
    lifecycleBookmapLikeOk,
    baseVsLifecycleVisualRatio: baseStats?.baseVsLifecycleVisualRatio,
    baseVsWallVisualRatio: baseStats?.baseVsWallVisualRatio,
    baseTextureBookmapDensityOk,
    lifecycleToBaseRatio,
  };
}

/** Blend lifecycle run peaks — avoid flattening to single max overlay. */
export function blendLifecycleRunIntensity(
  runIntensity: number,
  nextIntensity: number,
): number {
  return Number((runIntensity * 0.55 + nextIntensity * 0.45).toFixed(4));
}

export function applyLifecycleChunkTextureMod(
  intensity: number,
  alpha: number,
  lifecycleKey: string,
  timeBucket: number,
): { intensity: number; alpha: number } {
  const mod = computeLifecycleTextureMod(lifecycleKey, timeBucket);
  return {
    intensity: Math.max(0.04, Math.min(0.88, intensity * mod)),
    alpha: Math.max(0.06, Math.min(0.52, alpha * (0.97 + (mod - 1) * 0.35))),
  };
}
