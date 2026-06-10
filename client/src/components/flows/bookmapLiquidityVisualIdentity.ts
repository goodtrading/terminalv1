/**
 * FASE 3 — Liquidity visual identity & left↔right seam continuity.
 *
 * Same price bucket must read as one object across historical (≤ dataEndTime)
 * and live DOM (≥ dataEndTime). No temporal overlap — visual blend only.
 */

import { WALL_IMPORTANT_BTC } from "@/lib/bookmapEngineConfig";
import {
  alphaForPassiveLiquidity,
  type PassiveLiquidityAlphaContext,
} from "@/lib/bookmapBandColors";
import { bucketPrice } from "./domLadderUtils";
import { BOOKMAP_TEXTURE_SAMPLER_MS } from "./bookmapEnginePrepare";
import type {
  PreparedEngineTextureCell,
  PreparedLiveProjectionLevel,
} from "./bookmapEnginePrepare";
import { stableL2FillKey } from "./bookmapEnginePrepare";

export type LiquidityVisualKey = `${"bid" | "ask"}:${number}`;

export type HistoricalEdgeBucket = {
  key: LiquidityVisualKey;
  side: "bid" | "ask";
  bucketPrice: number;
  lastHistoricalTime: number;
  historicalCellCountNearEdge: number;
  historicalMaxSize: number;
  historicalMaxIntensity: number;
  historicalAvgIntensity: number;
  historicalMaxAlpha: number;
  historicalWasStrongNearEdge: boolean;
  historicalWasWallLike: boolean;
  historicalNearEdge: true;
  historicalFromPulledFootprint: boolean;
};

export type LiveDomBucket = {
  key: LiquidityVisualKey;
  side: "bid" | "ask";
  bucketPrice: number;
  liveSize: number;
  liveSmoothedSize?: number;
  liveRank?: number;
  liveIntensity: number;
  liveAlpha: number;
  liveActive: true;
  liveIsNearTick: boolean;
  liveIsTopDom: boolean;
  liveIsWallCandidate: boolean;
};

export type LiquidityVisualIdentity = {
  key: LiquidityVisualKey;
  side: "bid" | "ask";
  bucketPrice: number;
  historicalNearEdge: boolean;
  liveActive: boolean;
  historicalIntensity: number;
  liveIntensity: number;
  historicalAlpha: number;
  liveAlpha: number;
  continuityScore: number;
  continuingFromHistorical: boolean;
  liveOnly: boolean;
  historicalOnlyNearEdge: boolean;
};

export type LiquidityContinuityResolution = LiquidityVisualIdentity & {
  blendedIntensity: number;
  blendedAlpha: number;
  intensityBeforeBlend: number;
  alphaBeforeBlend: number;
  liveOnlyFadeApplied: boolean;
  liveOnlyWallBypass: boolean;
};

export type LiquidityContinuityStats = {
  continuityIdentityEnabled: boolean;
  historicalEdgeBucketCount: number;
  liveDomBucketCount: number;
  matchedContinuityBucketCount: number;
  continuingFromHistoricalCount: number;
  liveOnlyCount: number;
  historicalOnlyNearEdgeCount: number;
  avgMatchedIntensityDeltaBeforeBlend: number;
  avgMatchedIntensityDeltaAfterBlend: number;
  avgMatchedAlphaDeltaBeforeBlend: number;
  avgMatchedAlphaDeltaAfterBlend: number;
  liveOnlyFadeInCount: number;
  liveOnlyWallBypassCount: number;
  seamBlendApplied: boolean;
  seamBlendImproved: boolean;
  continuityVisualOk: boolean;
  /** P3.1 — wash / hierarchy diagnostics */
  avgHistoricalEdgeIntensity: number;
  avgLiveRawIntensity: number;
  avgLiveBlendedIntensity: number;
  avgHistoricalEdgeAlpha: number;
  avgLiveRawAlpha: number;
  avgLiveBlendedAlpha: number;
  liveTooWashedOut: boolean;
  liveTooFlat: boolean;
  liveHierarchyTooCompressed: boolean;
  liveDomNotDominantEnough: boolean;
  topDomVisualScoreAvg: number;
  topDomAlphaAvg: number;
  wallVisualScoreAvg: number;
  wallAlphaAvg: number;
  nearTickVisualScoreAvg: number;
  nearTickAlphaAvg: number;
  liveIntensityStdDev: number;
  liveAlphaStdDev: number;
  liveFlatnessScore: number;
  liveFlatBlockDetected: boolean;
  topDomVisualMapping: TopDomVisualMappingEntry[];
};

export type TopDomVisualMappingEntry = {
  side: "bid" | "ask";
  price: number;
  bucketPrice: number;
  size: number;
  rank: number;
  finalIntensity: number;
  finalAlpha: number;
  visible: boolean;
  visualOk: boolean;
};

export type LiveDomRenderCapture = {
  renderedIntensities: number[];
  renderedAlphas: number[];
  renderedVisualScores: number[];
  topDomVisualMapping: TopDomVisualMappingEntry[];
};

const MIN_LIVE_INTENSITY_FROM_HIST = 0.85;
const MIN_LIVE_ALPHA_FROM_HIST = 0.82;
const LIVE_ONLY_LOW_RELEVANCE_ALPHA_MUL = 0.82;
const MAX_BLENDED_INTENSITY = 0.92;
const MAX_BLENDED_INTENSITY_WALL = 0.96;
const MAX_BLENDED_ALPHA_MICRO = 0.68;
const MAX_BLENDED_ALPHA_DEFAULT = 0.72;
const LIVE_ONLY_ALPHA_FLOOR_NEAR_TICK = 0.22;
const LIVE_ONLY_ALPHA_FLOOR_TOP_DOM = 0.3;
const LIVE_ONLY_ALPHA_FLOOR_WALL = 0.42;

export type LiquidityContinuityPlan = {
  historicalEdgeBuckets: Map<LiquidityVisualKey, HistoricalEdgeBucket>;
  liveDomBuckets: Map<LiquidityVisualKey, LiveDomBucket>;
  resolutions: Map<LiquidityVisualKey, LiquidityContinuityResolution>;
  stats: LiquidityContinuityStats;
};

export function createEmptyLiveDomRenderCapture(): LiveDomRenderCapture {
  return {
    renderedIntensities: [],
    renderedAlphas: [],
    renderedVisualScores: [],
    topDomVisualMapping: [],
  };
}

export function resolveLiveDomAlphaCap(verticalMode: string): number {
  const mode = verticalMode.toLowerCase();
  if (mode === "micro" || mode.includes("micro")) return MAX_BLENDED_ALPHA_MICRO;
  return MAX_BLENDED_ALPHA_DEFAULT;
}

/** P3.1 — hierarchy score; Fase 4 may replace rank with smoothedRank. */
export function computeLiveDomVisualScore(opts: {
  liveRank?: number;
  liveDomVisualScore?: number;
  sizeBtc: number;
  viewportMaxSize: number;
  liveIsNearTick: boolean;
  liveIsTopDom: boolean;
  liveIsWallCandidate: boolean;
  midPrice?: number | null;
  price?: number;
}): number {
  const rankSource = opts.liveDomVisualScore ?? opts.liveRank ?? 0;
  const normalizedRank = Math.max(0, Math.min(1, rankSource));

  let nearTickScore = opts.liveIsNearTick ? 0.8 : 0.15;
  if (opts.midPrice != null && opts.midPrice > 0 && opts.price != null) {
    const pct = Math.abs(opts.price - opts.midPrice) / opts.midPrice;
    if (pct <= 0.005) nearTickScore = 1;
    else if (pct <= 0.015) nearTickScore = 0.78;
    else if (pct <= 0.035) nearTickScore = 0.45;
  }

  const maxSize = Math.max(1, opts.viewportMaxSize);
  const absoluteSizeScore = Math.max(0, Math.min(1, opts.sizeBtc / maxSize));
  const wallScore = opts.liveIsWallCandidate ? 1 : 0;

  return Math.max(
    0,
    Math.min(
      1,
      normalizedRank * 0.45 +
        nearTickScore * 0.25 +
        absoluteSizeScore * 0.2 +
        wallScore * 0.1,
    ),
  );
}

/** Per-level intensity/alpha expansion — avoids flat rectangular right-side block. */
export function applyLiveDomHierarchyVisual(
  intensity: number,
  alpha: number,
  visualScore: number,
  opts: {
    liveIsWallCandidate?: boolean;
    verticalMode?: string;
  },
): { intensity: number; alpha: number } {
  const score = Math.max(0.06, Math.min(1, visualScore));
  const alphaCap = resolveLiveDomAlphaCap(opts.verticalMode ?? "micro");
  const intensityCap = opts.liveIsWallCandidate
    ? MAX_BLENDED_INTENSITY_WALL
    : MAX_BLENDED_INTENSITY;

  const hierarchyIntensityMul = 0.7 + score * 0.55;
  const hierarchyAlphaMul = 0.75 + score * 0.5;

  let outIntensity = Math.min(intensityCap, intensity * hierarchyIntensityMul);
  let outAlpha = Math.min(alphaCap, alpha * hierarchyAlphaMul);

  if (score >= 0.5) {
    outAlpha = Math.max(outAlpha, alphaCap * (0.38 + score * 0.35));
  }
  if (opts.liveIsWallCandidate) {
    outAlpha = Math.max(outAlpha, LIVE_ONLY_ALPHA_FLOOR_WALL);
    outIntensity = Math.max(outIntensity, 0.62);
  } else if (score >= 0.72) {
    outAlpha = Math.max(outAlpha, LIVE_ONLY_ALPHA_FLOOR_TOP_DOM);
  } else if (score >= 0.45) {
    outAlpha = Math.max(outAlpha, LIVE_ONLY_ALPHA_FLOOR_NEAR_TICK);
  }

  return {
    intensity: Math.max(0, Math.min(intensityCap, outIntensity)),
    alpha: Math.max(0, Math.min(alphaCap, outAlpha)),
  };
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Number(Math.sqrt(variance).toFixed(4));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

function createEmptyContinuityP31Stats(): Pick<
  LiquidityContinuityStats,
  | "avgHistoricalEdgeIntensity"
  | "avgLiveRawIntensity"
  | "avgLiveBlendedIntensity"
  | "avgHistoricalEdgeAlpha"
  | "avgLiveRawAlpha"
  | "avgLiveBlendedAlpha"
  | "liveTooWashedOut"
  | "liveTooFlat"
  | "liveHierarchyTooCompressed"
  | "liveDomNotDominantEnough"
  | "topDomVisualScoreAvg"
  | "topDomAlphaAvg"
  | "wallVisualScoreAvg"
  | "wallAlphaAvg"
  | "nearTickVisualScoreAvg"
  | "nearTickAlphaAvg"
  | "liveIntensityStdDev"
  | "liveAlphaStdDev"
  | "liveFlatnessScore"
  | "liveFlatBlockDetected"
  | "topDomVisualMapping"
> {
  return {
    avgHistoricalEdgeIntensity: 0,
    avgLiveRawIntensity: 0,
    avgLiveBlendedIntensity: 0,
    avgHistoricalEdgeAlpha: 0,
    avgLiveRawAlpha: 0,
    avgLiveBlendedAlpha: 0,
    liveTooWashedOut: false,
    liveTooFlat: false,
    liveHierarchyTooCompressed: false,
    liveDomNotDominantEnough: false,
    topDomVisualScoreAvg: 0,
    topDomAlphaAvg: 0,
    wallVisualScoreAvg: 0,
    wallAlphaAvg: 0,
    nearTickVisualScoreAvg: 0,
    nearTickAlphaAvg: 0,
    liveIntensityStdDev: 0,
    liveAlphaStdDev: 0,
    liveFlatnessScore: 0,
    liveFlatBlockDetected: false,
    topDomVisualMapping: [],
  };
}

export function enrichLiquidityContinuityStatsFromRender(
  stats: LiquidityContinuityStats,
  capture: LiveDomRenderCapture | null | undefined,
  verticalMode: string,
): LiquidityContinuityStats {
  if (!capture || capture.renderedIntensities.length === 0) return stats;

  const intStd = stdDev(capture.renderedIntensities);
  const alphaStd = stdDev(capture.renderedAlphas);
  const liveFlatnessScore =
    intStd > 0 ? Number((alphaStd / intStd).toFixed(4)) : 0;
  const liveFlatBlockDetected =
    capture.renderedIntensities.length >= 4 &&
    intStd < 0.045 &&
    alphaStd < 0.035;

  const alphaCap = resolveLiveDomAlphaCap(verticalMode);
  const avgRenderedAlpha = mean(capture.renderedAlphas);
  const avgRenderedIntensity = mean(capture.renderedIntensities);
  const avgScore = mean(capture.renderedVisualScores);

  const liveTooWashedOut =
    avgRenderedAlpha < alphaCap * 0.42 && avgRenderedIntensity < 0.38;
  const liveTooFlat = liveFlatBlockDetected || intStd < 0.05;
  const liveHierarchyTooCompressed = intStd < 0.06 && avgScore > 0.2;
  const liveDomNotDominantEnough = avgRenderedAlpha < 0.2;

  return {
    ...stats,
    avgLiveBlendedIntensity: avgRenderedIntensity,
    avgLiveBlendedAlpha: avgRenderedAlpha,
    liveIntensityStdDev: intStd,
    liveAlphaStdDev: alphaStd,
    liveFlatnessScore,
    liveFlatBlockDetected,
    liveTooFlat,
    liveTooWashedOut,
    liveHierarchyTooCompressed,
    liveDomNotDominantEnough,
    topDomVisualMapping: capture.topDomVisualMapping,
    topDomAlphaAvg: mean(
      capture.topDomVisualMapping.map((e) => e.finalAlpha),
    ),
    topDomVisualScoreAvg: mean(
      capture.topDomVisualMapping.map((e) => e.rank),
    ),
    continuityVisualOk:
      !liveFlatBlockDetected &&
      !liveTooWashedOut &&
      avgRenderedAlpha >= alphaCap * 0.35 &&
      stats.avgMatchedAlphaDeltaAfterBlend < 0.28,
  };
}

export function getLiquidityVisualKey(
  side: "bid" | "ask",
  bucketPrice: number,
): LiquidityVisualKey {
  return `${side}:${bucketPrice}`;
}

export function normalizeLiquidityBucketPrice(
  price: number,
  bucketSize: number,
): number {
  return bucketPrice(price, bucketSize);
}

export function resolveHistoricalEdgeWindowMs(verticalMode: string): {
  maxLookbackMs: number;
  strongLookbackMs: number;
} {
  const mode = verticalMode.toLowerCase();
  if (mode === "micro" || mode.includes("micro")) {
    return { maxLookbackMs: 8_000, strongLookbackMs: 3_000 };
  }
  if (mode === "wide" || mode.includes("wide")) {
    return { maxLookbackMs: 90_000, strongLookbackMs: 30_000 };
  }
  return { maxLookbackMs: 30_000, strongLookbackMs: 10_000 };
}

function estimateHistoricalAlpha(intensity: number): number {
  const ctx: PassiveLiquidityAlphaContext = {
    intensity,
    isActive: true,
    isRightContinuation: false,
  };
  return alphaForPassiveLiquidity(ctx);
}

function cellSpanEnd(cell: PreparedEngineTextureCell): number {
  return cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
}

export function buildHistoricalEdgeBucketMap(opts: {
  textureCells: PreparedEngineTextureCell[];
  dataEndTime: number;
  priceBucketUsd: number;
  verticalMode: string;
  historicalActiveAlphaByKey?: Map<string, number>;
}): Map<LiquidityVisualKey, HistoricalEdgeBucket> {
  const { maxLookbackMs, strongLookbackMs } = resolveHistoricalEdgeWindowMs(
    opts.verticalMode,
  );
  const edgeStart = opts.dataEndTime - maxLookbackMs;
  const map = new Map<LiquidityVisualKey, HistoricalEdgeBucket>();

  for (const cell of opts.textureCells) {
    const spanEnd = cellSpanEnd(cell);
    if (spanEnd < edgeStart || cell.timeBucket > opts.dataEndTime) continue;

    const bp = normalizeLiquidityBucketPrice(cell.price, opts.priceBucketUsd);
    const key = getLiquidityVisualKey(cell.side, bp);
    const intensity =
      cell.microScalpRenderIntensity ??
      cell.historicalRenderIntensity ??
      cell.intensity ??
      0;
    const alphaKey = stableL2FillKey(cell.side, cell.price);
    const alpha =
      opts.historicalActiveAlphaByKey?.get(alphaKey) ??
      estimateHistoricalAlpha(intensity);
    const size = cell.maxSizeInBucket ?? 0;
    const withinStrong = spanEnd >= opts.dataEndTime - strongLookbackMs;
    const pulledCandidate =
      cell.historicalColorLocked === true && !withinStrong;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        side: cell.side,
        bucketPrice: bp,
        lastHistoricalTime: spanEnd,
        historicalCellCountNearEdge: 1,
        historicalMaxSize: size,
        historicalMaxIntensity: intensity,
        historicalAvgIntensity: intensity,
        historicalMaxAlpha: alpha,
        historicalWasStrongNearEdge:
          withinStrong && intensity >= 0.42,
        historicalWasWallLike:
          size >= WALL_IMPORTANT_BTC || cell.isMajor === true,
        historicalNearEdge: true,
        historicalFromPulledFootprint: pulledCandidate,
      });
      continue;
    }

    existing.historicalCellCountNearEdge += 1;
    existing.lastHistoricalTime = Math.max(existing.lastHistoricalTime, spanEnd);
    existing.historicalMaxSize = Math.max(existing.historicalMaxSize, size);
    existing.historicalMaxIntensity = Math.max(
      existing.historicalMaxIntensity,
      intensity,
    );
    existing.historicalAvgIntensity =
      (existing.historicalAvgIntensity * (existing.historicalCellCountNearEdge - 1) +
        intensity) /
      existing.historicalCellCountNearEdge;
    existing.historicalMaxAlpha = Math.max(existing.historicalMaxAlpha, alpha);
    if (withinStrong && intensity >= 0.42) {
      existing.historicalWasStrongNearEdge = true;
    }
    if (size >= WALL_IMPORTANT_BTC || cell.isMajor) {
      existing.historicalWasWallLike = true;
    }
    if (pulledCandidate) existing.historicalFromPulledFootprint = true;
  }

  return map;
}

export function buildLiveDomBucketMap(opts: {
  liveLevels: PreparedLiveProjectionLevel[];
  priceBucketUsd: number;
}): Map<LiquidityVisualKey, LiveDomBucket> {
  const map = new Map<LiquidityVisualKey, LiveDomBucket>();

  for (const level of opts.liveLevels) {
    const bp = normalizeLiquidityBucketPrice(level.price, opts.priceBucketUsd);
    const key = getLiquidityVisualKey(level.side, bp);
    const liveAlpha =
      level.microScalpAlpha != null
        ? level.microScalpAlpha
        : estimateHistoricalAlpha(level.intensity);
    const liveIsNearTick =
      level.liveDomSource === "near-tick" || level.liveDomSource === "best";
    const liveIsTopDom =
      level.liveDomSource === "top-dom" || level.liveDomSource === "viewport-top";
    const liveIsWallCandidate =
      level.liveDomSource === "wall" ||
      level.sizeBtc >= WALL_IMPORTANT_BTC ||
      level.liveDomColorTier === "wall";

    const existing = map.get(key);
    if (!existing || level.sizeBtc > existing.liveSize) {
      map.set(key, {
        key,
        side: level.side,
        bucketPrice: bp,
        liveSize: level.sizeBtc,
        liveSmoothedSize: level.liveDomVisualScore,
        liveRank: level.selectionScore,
        liveIntensity: level.intensity,
        liveAlpha,
        liveActive: true,
        liveIsNearTick,
        liveIsTopDom,
        liveIsWallCandidate,
      });
    }
  }

  return map;
}

export function resolveContinuityBucketMatch(
  historicalEdgeBuckets: Map<LiquidityVisualKey, HistoricalEdgeBucket>,
  liveDomBuckets: Map<LiquidityVisualKey, LiveDomBucket>,
  verticalMode: string,
): Map<LiquidityVisualKey, LiquidityContinuityResolution> {
  const resolutions = new Map<LiquidityVisualKey, LiquidityContinuityResolution>();

  liveDomBuckets.forEach((live, key) => {
    const hist = historicalEdgeBuckets.get(key);
    const continuingFromHistorical = hist != null;
    const liveOnly = !continuingFromHistorical;

    let continuityScore = 0;
    if (hist) {
      const intensityGap = Math.abs(live.liveIntensity - hist.historicalMaxIntensity);
      continuityScore = Math.max(
        0,
        Math.min(1, 1 - intensityGap / Math.max(0.15, hist.historicalMaxIntensity)),
      );
      if (hist.historicalWasStrongNearEdge) continuityScore = Math.min(1, continuityScore + 0.12);
    }

    const identity: LiquidityVisualIdentity = {
      key,
      side: live.side,
      bucketPrice: live.bucketPrice,
      historicalNearEdge: continuingFromHistorical,
      liveActive: true,
      historicalIntensity: hist?.historicalMaxIntensity ?? 0,
      liveIntensity: live.liveIntensity,
      historicalAlpha: hist?.historicalMaxAlpha ?? 0,
      liveAlpha: live.liveAlpha,
      continuityScore,
      continuingFromHistorical,
      liveOnly,
      historicalOnlyNearEdge: false,
    };

    const blend = resolveLiveDomContinuationVisual({
      liveIntensity: live.liveIntensity,
      liveAlpha: live.liveAlpha,
      historicalIntensityNearEdge: hist?.historicalMaxIntensity ?? 0,
      historicalAlphaNearEdge: hist?.historicalMaxAlpha ?? 0,
      continuingFromHistorical,
      liveOnly,
      verticalMode,
      liveIsWallCandidate: live.liveIsWallCandidate,
      liveIsTopDom: live.liveIsTopDom,
      liveIsNearTick: live.liveIsNearTick,
      liveFadeAlpha: undefined,
    });

    resolutions.set(key, {
      ...identity,
      blendedIntensity: blend.intensity,
      blendedAlpha: blend.alpha,
      intensityBeforeBlend: blend.intensityBefore,
      alphaBeforeBlend: blend.alphaBefore,
      liveOnlyFadeApplied: blend.liveOnlyFadeApplied,
      liveOnlyWallBypass: blend.liveOnlyWallBypass,
    });
  });

  historicalEdgeBuckets.forEach((hist, key) => {
    if (liveDomBuckets.has(key)) return;
    resolutions.set(key, {
      key,
      side: hist.side,
      bucketPrice: hist.bucketPrice,
      historicalNearEdge: true,
      liveActive: false,
      historicalIntensity: hist.historicalMaxIntensity,
      liveIntensity: 0,
      historicalAlpha: hist.historicalMaxAlpha,
      liveAlpha: 0,
      continuityScore: 0,
      continuingFromHistorical: false,
      liveOnly: false,
      historicalOnlyNearEdge: true,
      blendedIntensity: hist.historicalMaxIntensity,
      blendedAlpha: hist.historicalMaxAlpha,
      intensityBeforeBlend: hist.historicalMaxIntensity,
      alphaBeforeBlend: hist.historicalMaxAlpha,
      liveOnlyFadeApplied: false,
      liveOnlyWallBypass: false,
    });
  });

  return resolutions;
}

export function resolveLiveDomContinuationVisual(opts: {
  liveIntensity: number;
  liveAlpha: number;
  historicalIntensityNearEdge: number;
  historicalAlphaNearEdge: number;
  continuingFromHistorical: boolean;
  liveOnly: boolean;
  verticalMode: string;
  liveIsWallCandidate?: boolean;
  liveIsTopDom?: boolean;
  liveIsNearTick?: boolean;
  liveFadeAlpha?: number;
}): {
  intensity: number;
  alpha: number;
  intensityBefore: number;
  alphaBefore: number;
  liveOnlyFadeApplied: boolean;
  liveOnlyWallBypass: boolean;
} {
  const intensityBefore = Math.max(0, Math.min(1, opts.liveIntensity));
  const alphaBefore = Math.max(0, Math.min(1, opts.liveAlpha));
  let intensity = intensityBefore;
  let alpha = alphaBefore;
  let liveOnlyFadeApplied = false;
  let liveOnlyWallBypass = false;
  const alphaCap = resolveLiveDomAlphaCap(opts.verticalMode);
  const isWall = opts.liveIsWallCandidate === true;
  const intensityCap = isWall ? MAX_BLENDED_INTENSITY_WALL : MAX_BLENDED_INTENSITY;

  if (opts.continuingFromHistorical && opts.historicalIntensityNearEdge > 0) {
    const minIntensity = Math.min(
      intensityCap,
      opts.historicalIntensityNearEdge * MIN_LIVE_INTENSITY_FROM_HIST,
    );
    intensity = Math.max(intensityBefore, minIntensity);
    intensity = Math.min(intensityCap, intensity);

    if (opts.historicalAlphaNearEdge > 0) {
      const minAlpha = Math.min(
        alphaCap,
        opts.historicalAlphaNearEdge * MIN_LIVE_ALPHA_FROM_HIST,
      );
      alpha = Math.max(alphaBefore, minAlpha);
    }
    alpha = Math.min(alphaCap, alpha);
  } else if (opts.liveOnly) {
    if (isWall) {
      liveOnlyWallBypass = true;
      alpha = Math.max(alphaBefore, LIVE_ONLY_ALPHA_FLOOR_WALL);
      alpha = Math.min(alphaCap, alpha);
    } else if (opts.liveIsTopDom) {
      liveOnlyWallBypass = true;
      alpha = Math.max(
        alphaBefore * (opts.liveFadeAlpha ?? 0.92),
        LIVE_ONLY_ALPHA_FLOOR_TOP_DOM,
      );
      alpha = Math.min(alphaCap, alpha);
    } else if (opts.liveIsNearTick) {
      const faded = alphaBefore * (opts.liveFadeAlpha ?? 0.88);
      alpha = Math.max(faded, LIVE_ONLY_ALPHA_FLOOR_NEAR_TICK);
      alpha = Math.min(alphaCap, alpha);
      liveOnlyFadeApplied = faded < LIVE_ONLY_ALPHA_FLOOR_NEAR_TICK;
    } else {
      const fadeMul = opts.liveFadeAlpha ?? LIVE_ONLY_LOW_RELEVANCE_ALPHA_MUL;
      alpha = Math.min(alphaCap, alphaBefore * fadeMul);
      liveOnlyFadeApplied = true;
    }
  }

  return {
    intensity,
    alpha,
    intensityBefore,
    alphaBefore,
    liveOnlyFadeApplied,
    liveOnlyWallBypass,
  };
}

function avgDelta(values: number[]): number {
  if (values.length === 0) return 0;
  return Number(
    (values.reduce((a, b) => a + b, 0) / values.length).toFixed(4),
  );
}

export function buildLiquidityContinuityPlan(opts: {
  textureCells: PreparedEngineTextureCell[];
  liveLevels: PreparedLiveProjectionLevel[];
  dataEndTime: number;
  verticalMode: string;
  priceBucketUsd: number;
  historicalActiveAlphaByKey?: Map<string, number>;
}): LiquidityContinuityPlan {
  const historicalEdgeBuckets = buildHistoricalEdgeBucketMap({
    textureCells: opts.textureCells,
    dataEndTime: opts.dataEndTime,
    priceBucketUsd: opts.priceBucketUsd,
    verticalMode: opts.verticalMode,
    historicalActiveAlphaByKey: opts.historicalActiveAlphaByKey,
  });
  const liveDomBuckets = buildLiveDomBucketMap({
    liveLevels: opts.liveLevels,
    priceBucketUsd: opts.priceBucketUsd,
  });
  const resolutions = resolveContinuityBucketMatch(
    historicalEdgeBuckets,
    liveDomBuckets,
    opts.verticalMode,
  );

  const intensityDeltaBefore: number[] = [];
  const intensityDeltaAfter: number[] = [];
  const alphaDeltaBefore: number[] = [];
  const alphaDeltaAfter: number[] = [];
  let continuingFromHistoricalCount = 0;
  let liveOnlyCount = 0;
  let historicalOnlyNearEdgeCount = 0;
  let liveOnlyFadeInCount = 0;
  let liveOnlyWallBypassCount = 0;
  let seamBlendApplied = false;

  resolutions.forEach((res) => {
    if (res.historicalOnlyNearEdge) {
      historicalOnlyNearEdgeCount += 1;
      return;
    }
    if (!res.liveActive) return;

    if (res.continuingFromHistorical) {
      continuingFromHistoricalCount += 1;
      intensityDeltaBefore.push(
        Math.abs(res.intensityBeforeBlend - res.historicalIntensity),
      );
      intensityDeltaAfter.push(
        Math.abs(res.blendedIntensity - res.historicalIntensity),
      );
      alphaDeltaBefore.push(Math.abs(res.alphaBeforeBlend - res.historicalAlpha));
      alphaDeltaAfter.push(Math.abs(res.blendedAlpha - res.historicalAlpha));
      if (
        res.blendedIntensity !== res.intensityBeforeBlend ||
        res.blendedAlpha !== res.alphaBeforeBlend
      ) {
        seamBlendApplied = true;
      }
    } else if (res.liveOnly) {
      liveOnlyCount += 1;
      if (res.liveOnlyFadeApplied) liveOnlyFadeInCount += 1;
      if (res.liveOnlyWallBypass) liveOnlyWallBypassCount += 1;
      if (res.liveOnlyFadeApplied) seamBlendApplied = true;
    }
  });

  const avgMatchedIntensityDeltaBeforeBlend = avgDelta(intensityDeltaBefore);
  const avgMatchedIntensityDeltaAfterBlend = avgDelta(intensityDeltaAfter);
  const avgMatchedAlphaDeltaBeforeBlend = avgDelta(alphaDeltaBefore);
  const avgMatchedAlphaDeltaAfterBlend = avgDelta(alphaDeltaAfter);
  const seamBlendImproved =
    avgMatchedIntensityDeltaAfterBlend <= avgMatchedIntensityDeltaBeforeBlend ||
    avgMatchedAlphaDeltaAfterBlend <= avgMatchedAlphaDeltaBeforeBlend;

  const matchedContinuityBucketCount = continuingFromHistoricalCount;

  const histIntensities: number[] = [];
  const histAlphas: number[] = [];
  historicalEdgeBuckets.forEach((b) => {
    histIntensities.push(b.historicalMaxIntensity);
    histAlphas.push(b.historicalMaxAlpha);
  });

  const liveRawIntensities: number[] = [];
  const liveRawAlphas: number[] = [];
  const liveBlendedIntensities: number[] = [];
  const liveBlendedAlphas: number[] = [];
  const topDomScores: number[] = [];
  const topDomAlphas: number[] = [];
  const wallScores: number[] = [];
  const wallAlphas: number[] = [];
  const nearTickScores: number[] = [];
  const nearTickAlphas: number[] = [];

  liveDomBuckets.forEach((live, key) => {
    liveRawIntensities.push(live.liveIntensity);
    liveRawAlphas.push(live.liveAlpha);
    const res = resolutions.get(key);
    if (res?.liveActive) {
      liveBlendedIntensities.push(res.blendedIntensity);
      liveBlendedAlphas.push(res.blendedAlpha);
    }
    const score =
      live.liveRank ??
      live.liveSmoothedSize ??
      live.liveIntensity;
    if (live.liveIsTopDom) {
      topDomScores.push(score);
      topDomAlphas.push(res?.blendedAlpha ?? live.liveAlpha);
    }
    if (live.liveIsWallCandidate) {
      wallScores.push(score);
      wallAlphas.push(res?.blendedAlpha ?? live.liveAlpha);
    }
    if (live.liveIsNearTick) {
      nearTickScores.push(score);
      nearTickAlphas.push(res?.blendedAlpha ?? live.liveAlpha);
    }
  });

  const p31 = createEmptyContinuityP31Stats();
  p31.avgHistoricalEdgeIntensity = mean(histIntensities);
  p31.avgHistoricalEdgeAlpha = mean(histAlphas);
  p31.avgLiveRawIntensity = mean(liveRawIntensities);
  p31.avgLiveRawAlpha = mean(liveRawAlphas);
  p31.avgLiveBlendedIntensity = mean(liveBlendedIntensities);
  p31.avgLiveBlendedAlpha = mean(liveBlendedAlphas);
  p31.topDomVisualScoreAvg = mean(topDomScores);
  p31.topDomAlphaAvg = mean(topDomAlphas);
  p31.wallVisualScoreAvg = mean(wallScores);
  p31.wallAlphaAvg = mean(wallAlphas);
  p31.nearTickVisualScoreAvg = mean(nearTickScores);
  p31.nearTickAlphaAvg = mean(nearTickAlphas);
  p31.liveIntensityStdDev = stdDev(liveBlendedIntensities);
  p31.liveAlphaStdDev = stdDev(liveBlendedAlphas);
  p31.liveFlatnessScore =
    p31.liveIntensityStdDev > 0
      ? Number((p31.liveAlphaStdDev / p31.liveIntensityStdDev).toFixed(4))
      : 0;
  p31.liveFlatBlockDetected =
    liveBlendedIntensities.length >= 4 &&
    p31.liveIntensityStdDev < 0.045 &&
    p31.liveAlphaStdDev < 0.035;
  const alphaCap = resolveLiveDomAlphaCap(opts.verticalMode);
  p31.liveTooWashedOut =
    p31.avgLiveBlendedAlpha < alphaCap * 0.4 &&
    p31.avgLiveBlendedIntensity < p31.avgHistoricalEdgeIntensity * 0.65;
  p31.liveTooFlat = p31.liveFlatBlockDetected;
  p31.liveHierarchyTooCompressed =
    p31.liveIntensityStdDev < 0.055 && liveBlendedIntensities.length >= 3;
  p31.liveDomNotDominantEnough = p31.avgLiveBlendedAlpha < 0.22;

  const continuityVisualOk =
    historicalEdgeBuckets.size === 0 ||
    liveDomBuckets.size === 0 ||
    (!p31.liveTooWashedOut &&
      !p31.liveFlatBlockDetected &&
      avgMatchedAlphaDeltaAfterBlend < 0.28 &&
      avgMatchedIntensityDeltaAfterBlend < 0.28);

  const stats: LiquidityContinuityStats = {
    continuityIdentityEnabled: true,
    historicalEdgeBucketCount: historicalEdgeBuckets.size,
    liveDomBucketCount: liveDomBuckets.size,
    matchedContinuityBucketCount,
    continuingFromHistoricalCount,
    liveOnlyCount,
    historicalOnlyNearEdgeCount,
    avgMatchedIntensityDeltaBeforeBlend,
    avgMatchedIntensityDeltaAfterBlend,
    avgMatchedAlphaDeltaBeforeBlend,
    avgMatchedAlphaDeltaAfterBlend,
    liveOnlyFadeInCount,
    liveOnlyWallBypassCount,
    seamBlendApplied,
    seamBlendImproved,
    continuityVisualOk,
    ...p31,
  };

  return {
    historicalEdgeBuckets,
    liveDomBuckets,
    resolutions,
    stats,
  };
}

export function lookupLiveContinuityResolution(
  plan: LiquidityContinuityPlan | null | undefined,
  side: "bid" | "ask",
  price: number,
  priceBucketUsd: number,
): LiquidityContinuityResolution | null {
  if (!plan) return null;
  const bp = normalizeLiquidityBucketPrice(price, priceBucketUsd);
  return plan.resolutions.get(getLiquidityVisualKey(side, bp)) ?? null;
}
