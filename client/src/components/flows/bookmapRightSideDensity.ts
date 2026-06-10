/**
 * P3.2 — Right-side density, wall dominance limits, quantile visual expansion.
 */

import {
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { HeatmapBand } from "./bookmapBandTypes";
import { isWallTier } from "./bookmapBandTypes";
import type { PreparedLiveProjectionLevel } from "./bookmapEnginePrepare";
import type { PassiveBaseTexturePrepareStats } from "./bookmapPassiveBaseTexture";
import type { MicroScalpLayerRenderStats } from "./bookmapMicroScalpLayerAudit";
import type { BookmapRenderArchitectureFrameStats } from "./bookmapRenderArchitectureAudit";
import { isStructuralWallEmphasis } from "./bookmapLayerResponsibilities";

export const MICRO_ACTIVE_DOM_COVERAGE_MAX = 0.45;
export const MICRO_WALL_COVERAGE_DOMINANCE_MAX = 0.35;

export type ScoreQuantiles = {
  p50: number;
  p80: number;
  p95: number;
};

export type LiveScoreTier = "bottom" | "mid" | "high" | "top";

export type RightSideDensityRenderCapture = {
  activeDomAlphas: number[];
  wallBandAlphas: number[];
  structuralWallAlphas: number[];
  majorWallAlphas: number[];
  activeDomRenderedCount: number;
  wallBandRenderedCount: number;
  structuralWallRenderedCount: number;
  majorWallRenderedCount: number;
  renderedVisualScores: number[];
  lowScoreRenderedCount: number;
  midScoreRenderedCount: number;
  highScoreRenderedCount: number;
  topScoreRenderedCount: number;
  scoreContrastExpanded: boolean;
  liveScoreP50: number;
  liveScoreP80: number;
  liveScoreP95: number;
  plotHeightPx: number;
  rightSideWidthPx: number;
  viewportPriceBucketCount: number;
  lowMidFadeAppliedCount: number;
  protectedNoFadeCount: number;
  uniformLengthRenderCount: number;
};

export type BookmapRightSideDensityAudit = {
  market: string;
  sourceMode: string;
  verticalMode: string;
  rightSideWidthPx: number;
  rightSidePriceBucketCount: number;
  activeDomRenderedCount: number;
  wallBandRenderedCount: number;
  structuralWallRenderedCount: number;
  majorWallRenderedCount: number;
  activeDomCoveragePct: number;
  wallBandCoveragePct: number;
  structuralWallCoveragePct: number;
  majorWallCoveragePct: number;
  avgActiveDomAlpha: number;
  avgWallBandAlpha: number;
  avgStructuralWallAlpha: number;
  avgMajorWallAlpha: number;
  maxActiveDomAlpha: number;
  maxWallBandAlpha: number;
  activeDomDominancePct: number;
  wallBandDominancePct: number;
  liveScoreP50: number;
  liveScoreP80: number;
  liveScoreP95: number;
  lowScoreRenderedCount: number;
  midScoreRenderedCount: number;
  highScoreRenderedCount: number;
  topScoreRenderedCount: number;
  scoreContrastExpanded: boolean;
  liveDomTooUniform: boolean;
  rightSideLooksRectangular: boolean;
  wallBandsTooDominant: boolean;
  rightSideDensityOk: boolean;
  liveIntensityStdDev: number;
  liveAlphaStdDev: number;
  continuityVisualOk: boolean;
  baseVsLifecycleVisualRatio: number;
  baseVsWallVisualRatio: number;
  liveProjectionMechanicalScore: number;
  rightSideUniformLengthScore: number;
  baseTextureBookmapDensityOk: boolean;
  rightSideBookmapProjectionOk: boolean;
};

export function createEmptyRightSideDensityCapture(): RightSideDensityRenderCapture {
  return {
    activeDomAlphas: [],
    wallBandAlphas: [],
    structuralWallAlphas: [],
    majorWallAlphas: [],
    activeDomRenderedCount: 0,
    wallBandRenderedCount: 0,
    structuralWallRenderedCount: 0,
    majorWallRenderedCount: 0,
    renderedVisualScores: [],
    lowScoreRenderedCount: 0,
    midScoreRenderedCount: 0,
    highScoreRenderedCount: 0,
    topScoreRenderedCount: 0,
    scoreContrastExpanded: false,
    liveScoreP50: 0,
    liveScoreP80: 0,
    liveScoreP95: 0,
    plotHeightPx: 0,
    rightSideWidthPx: 0,
    viewportPriceBucketCount: 1,
    lowMidFadeAppliedCount: 0,
    protectedNoFadeCount: 0,
    uniformLengthRenderCount: 0,
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx] ?? 0;
}

export function computeScoreQuantiles(scores: number[]): ScoreQuantiles {
  if (scores.length === 0) return { p50: 0, p80: 0, p95: 0 };
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    p50: Number(percentile(sorted, 0.5).toFixed(4)),
    p80: Number(percentile(sorted, 0.8).toFixed(4)),
    p95: Number(percentile(sorted, 0.95).toFixed(4)),
  };
}

export function classifyLiveScoreTier(
  score: number,
  quantiles: ScoreQuantiles,
): LiveScoreTier {
  if (score >= quantiles.p95) return "top";
  if (score >= quantiles.p80) return "high";
  if (score >= quantiles.p50) return "mid";
  return "bottom";
}

/** Quantile expansion — bottom 40% fade, top 20% boost, top 5% highlight. */
export function applyQuantileVisualExpansion(
  visualScore: number,
  intensity: number,
  alpha: number,
  quantiles: ScoreQuantiles,
  opts?: { protectedLevel?: boolean },
): {
  intensity: number;
  alpha: number;
  tier: LiveScoreTier;
} {
  const tier = classifyLiveScoreTier(visualScore, quantiles);
  if (opts?.protectedLevel) {
    return {
      intensity: Math.min(0.96, intensity * 1.05),
      alpha: Math.min(0.68, alpha * 1.04),
      tier,
    };
  }

  let intensityMul = 1;
  let alphaMul = 1;
  switch (tier) {
    case "bottom":
      intensityMul = 0.62;
      alphaMul = 0.55;
      break;
    case "mid":
      intensityMul = 0.88;
      alphaMul = 0.82;
      break;
    case "high":
      intensityMul = 1.12;
      alphaMul = 1.1;
      break;
    case "top":
      intensityMul = 1.22;
      alphaMul = 1.15;
      break;
  }

  return {
    intensity: Math.max(0, Math.min(0.96, intensity * intensityMul)),
    alpha: Math.max(0, Math.min(0.68, alpha * alphaMul)),
    tier,
  };
}

export function isProtectedLiveDomLevel(opts: {
  liveIsNearTick: boolean;
  liveIsTopDom: boolean;
  liveIsWall: boolean;
  continuingFromHistorical: boolean;
  historicalWasStrong?: boolean;
}): boolean {
  return (
    opts.liveIsNearTick ||
    opts.liveIsTopDom ||
    opts.liveIsWall ||
    (opts.continuingFromHistorical && opts.historicalWasStrong === true)
  );
}

export function shouldSkipLiveDomForDensity(opts: {
  visualScore: number;
  quantiles: ScoreQuantiles;
  protectedLevel: boolean;
  activeDomCoveragePct: number;
  verticalMode: string;
}): boolean {
  if (opts.protectedLevel) return false;
  const mode = opts.verticalMode.toLowerCase();
  if (mode !== "micro" && !mode.includes("micro")) return false;
  if (opts.activeDomCoveragePct <= MICRO_ACTIVE_DOM_COVERAGE_MAX) return false;
  return classifyLiveScoreTier(opts.visualScore, opts.quantiles) === "bottom";
}

/** Wall alpha caps on right-side edge — tier + distance from mid. */
export function resolveWallBandRightSideAlphaCap(
  band: HeatmapBand,
  midPrice: number | null,
  verticalMode: string,
  wallBandCoveragePct: number,
): number {
  const mode = verticalMode.toLowerCase();
  const isMicro = mode === "micro" || mode.includes("micro");
  const isMajor =
    band.tier === "major" && band.maxSize >= WALL_MAJOR_BTC;
  const isStructural =
    band.tier === "structural" && band.maxSize >= WALL_STRUCTURAL_BTC;

  let pctFromMid = 0.05;
  if (midPrice != null && midPrice > 0) {
    pctFromMid = Math.abs(band.price - midPrice) / midPrice;
  }
  const nearPrice = pctFromMid <= 0.015;

  let cap: number;
  if (isMajor) {
    cap = 0.62;
  } else if (isStructural && nearPrice) {
    cap = 0.48;
  } else if (isStructural) {
    cap = 0.38;
  } else if (nearPrice) {
    cap = 0.32;
  } else {
    cap = 0.28;
  }

  if (
    isMicro &&
    wallBandCoveragePct > MICRO_WALL_COVERAGE_DOMINANCE_MAX &&
    !isMajor &&
    !isStructural
  ) {
    cap = Math.min(cap, 0.22);
  } else if (
    isMicro &&
    wallBandCoveragePct > MICRO_WALL_COVERAGE_DOMINANCE_MAX &&
    band.tier === "important"
  ) {
    cap = Math.min(cap, 0.26);
  }

  return cap;
}

/** P3.2 — wall at live seam only when structural/major with real persistence. */
export function shouldRenderWallBandWithLiveDomOverlap(band: HeatmapBand): boolean {
  if (!isStructuralWallEmphasis(band)) return false;
  if (band.tier === "major") {
    return band.persistenceMs >= 1_500 || band.maxSize >= WALL_MAJOR_BTC * 1.2;
  }
  if (band.tier === "structural") {
    return band.persistenceMs >= 3_000 || band.maxSize >= WALL_STRUCTURAL_BTC * 1.15;
  }
  return false;
}

export function buildBookmapRightSideDensityAudit(opts: {
  market: string;
  sourceMode: string;
  verticalMode: string;
  rightSideWidthPx: number;
  capture?: RightSideDensityRenderCapture | null;
  microStats?: MicroScalpLayerRenderStats | null;
  frameStats?: BookmapRenderArchitectureFrameStats | null;
  passiveBaseStats?: PassiveBaseTexturePrepareStats | null;
}): BookmapRightSideDensityAudit {
  const cap = opts.capture;
  const ms = opts.microStats;
  const lc = opts.frameStats?.liquidityContinuityStats;

  const viewportBuckets = Math.max(
    1,
    cap?.viewportPriceBucketCount ??
      Math.round((ms?.rightSideCoveragePct ?? 0) > 0
        ? (ms?.activeDomBandRectCount ?? 0) / Math.max(0.01, ms!.rightSideCoveragePct)
        : 1),
  );

  const activeDomRenderedCount =
    cap?.activeDomRenderedCount ?? ms?.activeDomBandRectCount ?? 0;
  const wallBandRenderedCount =
    cap?.wallBandRenderedCount ?? ms?.wallBandRightSideRectCount ?? 0;
  const structuralWallRenderedCount =
    cap?.structuralWallRenderedCount ?? ms?.structuralWallRightSideRectCount ?? 0;
  const majorWallRenderedCount =
    cap?.majorWallRenderedCount ?? ms?.majorWallRightSideRectCount ?? 0;

  const activeDomCoveragePct = Number(
    (activeDomRenderedCount / viewportBuckets).toFixed(4),
  );
  const wallBandCoveragePct = Number(
    (wallBandRenderedCount / viewportBuckets).toFixed(4),
  );
  const structuralWallCoveragePct = Number(
    (structuralWallRenderedCount / viewportBuckets).toFixed(4),
  );
  const majorWallCoveragePct = Number(
    (majorWallRenderedCount / viewportBuckets).toFixed(4),
  );

  const rightSideTotal = Math.max(
    1,
    activeDomRenderedCount + wallBandRenderedCount,
  );
  const activeDomDominancePct = Number(
    (activeDomRenderedCount / rightSideTotal).toFixed(4),
  );
  const wallBandDominancePct = Number(
    (wallBandRenderedCount / rightSideTotal).toFixed(4),
  );

  const avgActiveDomAlpha = mean(cap?.activeDomAlphas ?? []);
  const avgWallBandAlpha = mean(cap?.wallBandAlphas ?? []);
  const avgStructuralWallAlpha = mean(cap?.structuralWallAlphas ?? []);
  const avgMajorWallAlpha = mean(cap?.majorWallAlphas ?? []);
  const maxActiveDomAlpha =
    cap?.activeDomAlphas.length ?
      Math.max(...cap.activeDomAlphas)
    : ms?.maxRightSideAlpha ?? 0;
  const maxWallBandAlpha =
    cap?.wallBandAlphas.length ? Math.max(...cap.wallBandAlphas) : 0;

  const liveIntensityStdDev = lc?.liveIntensityStdDev ?? 0;
  const liveAlphaStdDev = lc?.liveAlphaStdDev ?? 0;
  const liveDomTooUniform =
    lc?.liveDomTooUniform === true ||
    lc?.liveFlatBlockDetected === true ||
    (liveIntensityStdDev < 0.055 && activeDomRenderedCount >= 4);

  const wallBandsTooDominant =
    wallBandDominancePct > 0.35 ||
    (wallBandCoveragePct > MICRO_WALL_COVERAGE_DOMINANCE_MAX &&
      opts.verticalMode.toLowerCase().includes("micro"));

  const rightSideLooksRectangular =
    (activeDomCoveragePct > MICRO_ACTIVE_DOM_COVERAGE_MAX ||
      wallBandsTooDominant ||
      liveDomTooUniform) &&
    activeDomRenderedCount + wallBandRenderedCount >= 3;

  const rightSideDensityOk =
    !rightSideLooksRectangular &&
    !wallBandsTooDominant &&
    !liveDomTooUniform &&
    activeDomCoveragePct >= 0.15 &&
    activeDomCoveragePct <= MICRO_ACTIVE_DOM_COVERAGE_MAX + 0.08;

  const totalRendered =
    activeDomRenderedCount +
    wallBandRenderedCount +
    (cap?.lowScoreRenderedCount ?? 0) +
    (cap?.midScoreRenderedCount ?? 0) +
    (cap?.highScoreRenderedCount ?? 0) +
    (cap?.topScoreRenderedCount ?? 0);
  const uniformLengthRenderCount = cap?.uniformLengthRenderCount ?? 0;
  const rightSideUniformLengthScore =
    totalRendered > 0
      ? Number((uniformLengthRenderCount / totalRendered).toFixed(4))
      : 0;
  const lowMidRendered =
    (cap?.lowScoreRenderedCount ?? 0) + (cap?.midScoreRenderedCount ?? 0);
  const fadeApplied = cap?.lowMidFadeAppliedCount ?? 0;
  const liveProjectionMechanicalScore =
    lowMidRendered > 0
      ? Number(
          (
            1 -
            fadeApplied / Math.max(1, lowMidRendered) +
            rightSideUniformLengthScore * 0.45
          ).toFixed(4),
        )
      : rightSideUniformLengthScore;

  const pBase = opts.passiveBaseStats;
  const baseTextureBookmapDensityOk =
    pBase != null &&
    pBase.baseTextureCoveragePct >= 0.18 &&
    pBase.baseTextureDensityScore >= 0.15 &&
    pBase.baseTextureAvgAlpha >= 0.045;

  const rightSideBookmapProjectionOk =
    rightSideDensityOk &&
    liveProjectionMechanicalScore < 0.55 &&
    rightSideUniformLengthScore < 0.72 &&
    !liveDomTooUniform;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    verticalMode: opts.verticalMode,
    rightSideWidthPx: cap?.rightSideWidthPx ?? ms?.rightSideWidthPx ?? opts.rightSideWidthPx,
    rightSidePriceBucketCount: viewportBuckets,
    activeDomRenderedCount,
    wallBandRenderedCount,
    structuralWallRenderedCount,
    majorWallRenderedCount,
    activeDomCoveragePct,
    wallBandCoveragePct,
    structuralWallCoveragePct,
    majorWallCoveragePct,
    avgActiveDomAlpha,
    avgWallBandAlpha,
    avgStructuralWallAlpha,
    avgMajorWallAlpha,
    maxActiveDomAlpha: Number(maxActiveDomAlpha.toFixed(4)),
    maxWallBandAlpha: Number(maxWallBandAlpha.toFixed(4)),
    activeDomDominancePct,
    wallBandDominancePct,
    liveScoreP50: cap?.liveScoreP50 ?? 0,
    liveScoreP80: cap?.liveScoreP80 ?? 0,
    liveScoreP95: cap?.liveScoreP95 ?? 0,
    lowScoreRenderedCount: cap?.lowScoreRenderedCount ?? 0,
    midScoreRenderedCount: cap?.midScoreRenderedCount ?? 0,
    highScoreRenderedCount: cap?.highScoreRenderedCount ?? 0,
    topScoreRenderedCount: cap?.topScoreRenderedCount ?? 0,
    scoreContrastExpanded: cap?.scoreContrastExpanded ?? false,
    liveDomTooUniform,
    rightSideLooksRectangular,
    wallBandsTooDominant,
    rightSideDensityOk,
    liveIntensityStdDev,
    liveAlphaStdDev,
    continuityVisualOk: lc?.continuityVisualOk ?? false,
    baseVsLifecycleVisualRatio: pBase?.baseVsLifecycleVisualRatio ?? 0,
    baseVsWallVisualRatio: pBase?.baseVsWallVisualRatio ?? 0,
    liveProjectionMechanicalScore,
    rightSideUniformLengthScore,
    baseTextureBookmapDensityOk,
    rightSideBookmapProjectionOk,
  };
}

export function recordLiveDomDensityTier(
  capture: RightSideDensityRenderCapture,
  tier: LiveScoreTier,
): void {
  switch (tier) {
    case "bottom":
      capture.lowScoreRenderedCount += 1;
      break;
    case "mid":
      capture.midScoreRenderedCount += 1;
      break;
    case "high":
      capture.highScoreRenderedCount += 1;
      break;
    case "top":
      capture.topScoreRenderedCount += 1;
      break;
  }
}

export type LiveDomRenderCandidate = {
  level: PreparedLiveProjectionLevel;
  baseVi: number;
  vi: number;
  visualScore: number;
  protectedLevel: boolean;
  continuingFromHistorical: boolean;
  historicalWasStrong: boolean;
};
