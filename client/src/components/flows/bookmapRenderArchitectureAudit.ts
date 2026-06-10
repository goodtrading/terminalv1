import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import type { BookmapSourceMode } from "@shared/bookmapSourceMode";
import { BOOKMAP_TEXTURE_SAMPLER_MS } from "./bookmapEnginePrepare";
import type {
  PreparedEngineRenderData,
  PreparedLiveProjectionLevel,
} from "./bookmapEnginePrepare";
import type { BookmapL2BandContinuityTruth } from "./bookmapEnginePrepare";
import type { MicroScalpLayerRenderStats } from "./bookmapMicroScalpLayerAudit";
import type { LiquidityContinuityStats } from "./bookmapLiquidityVisualIdentity";
import type { RightSideDensityRenderCapture } from "./bookmapRightSideDensity";
import { isWallTier } from "./bookmapBandTypes";

export type BookmapRenderArchitectureFrameStats = {
  renderedLayerOrder: string[];
  historicalTextureLeftSideCount: number;
  historicalTextureRightSideCount: number;
  pulledFootprintLeftSideCount: number;
  pulledFootprintRightSideCount: number;
  wallBandLeftSideCount: number;
  wallBandRightSideCount: number;
  structuralWallLeftSideCount: number;
  structuralWallRightSideCount: number;
  majorWallLeftSideCount: number;
  majorWallRightSideCount: number;
  leftSideRenderedCount: number;
  rightSideRenderedCount: number;
  duplicatedWallAndActiveDomCount: number;
  duplicatedAnchorAndLiveCount: number;
  executionOverlayActive: boolean;
  tradeDotsActive: boolean;
  phase2ClipApplied: boolean;
  phase2LiveDedupApplied: boolean;
  phase2WallDedupApplied: boolean;
  phase2StrictLiveStartApplied: boolean;
  beforeHistoricalRightSideCount: number;
  afterHistoricalRightSideCount: number;
  beforeDuplicatedLiveProjectionAndActiveDomCount: number;
  afterDuplicatedLiveProjectionAndActiveDomCount: number;
  beforeDuplicatedWallAndActiveDomCount: number;
  afterDuplicatedWallAndActiveDomCount: number;
  phase3ContinuityIdentityApplied: boolean;
  phase3SeamBlendApplied: boolean;
  phase3LiveUsesHistoricalVisualBase: boolean;
  liquidityContinuityStats: LiquidityContinuityStats | null;
  rightSideDensityCapture: RightSideDensityRenderCapture | null;
};

export type BookmapRenderArchitectureAudit = {
  market: string;
  sourceMode: string;
  domSource: string;
  tradeSource: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  dataEndTime: number;
  visibleEndTime: number;
  rightSideWidthPx: number;
  rightSidePct: number;
  historicalTextureActive: boolean;
  historicalTextureCount: number;
  historicalTextureRightSideCount: number;
  pulledFootprintActive: boolean;
  pulledFootprintCount: number;
  pulledFootprintRightSideCount: number;
  liveProjectionActive: boolean;
  liveProjectionCount: number;
  liveProjectionRightSideCount: number;
  activeDomBandsActive: boolean;
  activeDomBandsCount: number;
  activeDomBandsRightSideCount: number;
  currentBookAnchorsActive: boolean;
  currentBookAnchorsCount: number;
  currentBookAnchorsRightSideCount: number;
  wallBandsActive: boolean;
  wallBandsCount: number;
  wallBandsRightSideCount: number;
  structuralWallsActive: boolean;
  structuralWallsCount: number;
  structuralWallsRightSideCount: number;
  majorWallsActive: boolean;
  majorWallsCount: number;
  majorWallsRightSideCount: number;
  executionOverlayActive: boolean;
  tradeDotsActive: boolean;
  leftSideRenderedCount: number;
  rightSideRenderedCount: number;
  duplicatedPriceBucketsCount: number;
  duplicatedRightSideBucketsCount: number;
  duplicatedLiveProjectionAndActiveDomCount: number;
  duplicatedWallAndActiveDomCount: number;
  duplicatedWallAndLiveProjectionCount: number;
  duplicatedAnchorAndLiveCount: number;
  renderedLayerOrder: string[];
  rightSideDominantLayer: string;
  rightSideDominantLayerPct: number;
  historicalDrawingIntoFutureBug: boolean;
  liveLayerMissingBug: boolean;
  duplicatedLiveDomBug: boolean;
  wallBandOverExtensionBug: boolean;
  currentBookAnchorDuplicationBug: boolean;
  architectureOk: boolean;
  phase2ClipApplied: boolean;
  phase2LiveDedupApplied: boolean;
  phase2WallDedupApplied: boolean;
  phase2StrictLiveStartApplied: boolean;
  beforeHistoricalRightSideCount: number;
  afterHistoricalRightSideCount: number;
  beforeDuplicatedLiveProjectionAndActiveDomCount: number;
  afterDuplicatedLiveProjectionAndActiveDomCount: number;
  beforeDuplicatedWallAndActiveDomCount: number;
  afterDuplicatedWallAndActiveDomCount: number;
  phase3ContinuityIdentityApplied: boolean;
  phase3SeamBlendApplied: boolean;
  phase3LiveUsesHistoricalVisualBase: boolean;
};

export type BookmapLeftRightContinuityAudit = {
  market: string;
  sourceMode: string;
  verticalMode: string;
  dataEndTime: number;
  visibleEndTime: number;
  activeDomVisibleLevelsCount: number;
  activeDomNearTickLevelsCount: number;
  historicalLevelsNearDataEndCount: number;
  liveBucketsAtRightSideCount: number;
  historicalBucketsNearEdgeCount: number;
  bucketsContinuingFromHistoricalToLiveCount: number;
  bucketsLiveOnlyCount: number;
  bucketsHistoricalOnlyNearEdgeCount: number;
  continuityRatio: number;
  liveOnlyRatio: number;
  historicalOnlyNearEdgeRatio: number;
  avgIntensityDeltaAtEdge: number;
  avgAlphaDeltaAtEdge: number;
  hardSeamDetected: boolean;
  rightSideLooksLikeSeparateLayer: boolean;
  continuityOk: boolean;
  phase2ClipApplied: boolean;
  phase2LiveDedupApplied: boolean;
  phase2WallDedupApplied: boolean;
  phase2StrictLiveStartApplied: boolean;
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
  phase3ContinuityIdentityApplied: boolean;
  phase3SeamBlendApplied: boolean;
  phase3StrictLiveStartApplied: boolean;
  /** P3.1 — wash / hierarchy / flatness diagnostics */
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
  topDomVisualMapping: import("./bookmapLiquidityVisualIdentity").TopDomVisualMappingEntry[];
  topDomVisualOkCount: number;
};

function priceKey(side: string, price: number): string {
  return `${side}:${price}`;
}

function intersectCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  a.forEach((k) => {
    if (b.has(k)) n += 1;
  });
  return n;
}

function countWallTiers(bands: PreparedEngineRenderData["bands"]) {
  let structural = 0;
  let major = 0;
  for (const band of bands) {
    if (band.tier === "structural") structural += 1;
    if (band.tier === "major") major += 1;
  }
  return { structural, major };
}

function liveLevelKeys(
  activeDom: PreparedLiveProjectionLevel[],
  liveProjection: PreparedLiveProjectionLevel[],
): Set<string> {
  const keys = new Set<string>();
  for (const l of activeDom) keys.add(priceKey(l.side, l.price));
  for (const l of liveProjection) keys.add(priceKey(l.side, l.price));
  return keys;
}

function historicalNearEdgeKeys(
  renderData: PreparedEngineRenderData | null | undefined,
  dataEndTime: number,
): Set<string> {
  const keys = new Set<string>();
  if (!renderData?.textureCells?.length) return keys;
  const edgeMs = BOOKMAP_TEXTURE_SAMPLER_MS * 3;
  for (const cell of renderData.textureCells) {
    const end =
      cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
    if (end >= dataEndTime - edgeMs && cell.timeBucket <= dataEndTime) {
      keys.add(priceKey(cell.side, cell.price));
    }
  }
  return keys;
}

function countDuplicatedWallAndActiveDom(
  bands: PreparedEngineRenderData["bands"],
  activeDomKeys: Set<string>,
): number {
  let n = 0;
  for (const band of bands) {
    if (activeDomKeys.has(priceKey(band.side, band.price))) n += 1;
  }
  return n;
}

function countDuplicatedWallAndLive(
  bands: PreparedEngineRenderData["bands"],
  liveKeys: Set<string>,
): number {
  let n = 0;
  for (const band of bands) {
    if (!liveKeys.has(priceKey(band.side, band.price))) continue;
    if (isWallTier(band.tier)) continue;
    n += 1;
  }
  return n;
}

function computeAvgIntensityDeltaAtEdge(
  renderData: PreparedEngineRenderData | null | undefined,
  liveKeys: Set<string>,
  dataEndTime: number,
): { intensityDelta: number; alphaDelta: number } {
  if (!renderData?.textureCells?.length || liveKeys.size === 0) {
    return { intensityDelta: 0, alphaDelta: 0 };
  }
  const edgeMs = BOOKMAP_TEXTURE_SAMPLER_MS * 3;
  const histByKey = new Map<string, { intensity: number; alpha: number }>();
  for (const cell of renderData.textureCells) {
    const end =
      cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
    if (end < dataEndTime - edgeMs || cell.timeBucket > dataEndTime) continue;
    const key = priceKey(cell.side, cell.price);
    const intensity = cell.intensity ?? 0;
    const alpha = intensity;
    const prev = histByKey.get(key);
    if (!prev || intensity > prev.intensity) {
      histByKey.set(key, { intensity, alpha });
    }
  }

  const liveByKey = new Map<string, { intensity: number; alpha: number }>();
  for (const l of [
    ...(renderData.activeDomBands ?? []),
    ...(renderData.liveProjectionLevels ?? []),
  ]) {
    liveByKey.set(priceKey(l.side, l.price), {
      intensity: l.intensity,
      alpha: l.microScalpAlpha ?? l.intensity,
    });
  }

  let intensitySum = 0;
  let alphaSum = 0;
  let n = 0;
  liveKeys.forEach((key) => {
    if (!histByKey.has(key) || !liveByKey.has(key)) return;
    const h = histByKey.get(key)!;
    const live = liveByKey.get(key)!;
    intensitySum += Math.abs(live.intensity - h.intensity);
    alphaSum += Math.abs(live.alpha - h.alpha);
    n += 1;
  });
  if (n === 0) return { intensityDelta: 0, alphaDelta: 0 };
  return {
    intensityDelta: Number((intensitySum / n).toFixed(4)),
    alphaDelta: Number((alphaSum / n).toFixed(4)),
  };
}

export function buildBookmapRenderArchitectureAudit(opts: {
  market: BookmapMarketSource;
  sourceMode: BookmapSourceMode;
  domSource: string;
  tradeSource: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  timeViewport: BookmapTimeViewport;
  rightSideWidthPx: number;
  renderData?: PreparedEngineRenderData | null;
  frameStats?: BookmapRenderArchitectureFrameStats | null;
  microStats?: MicroScalpLayerRenderStats | null;
  l2Continuity?: BookmapL2BandContinuityTruth | null;
  currentBookAnchorsInPrepare?: boolean;
}): BookmapRenderArchitectureAudit {
  const rd = opts.renderData;
  const fs = opts.frameStats;
  const ms = opts.microStats;
  const tv = opts.timeViewport;

  const activeDom = rd?.activeDomBands ?? [];
  const liveProjection = rd?.liveProjectionLevels ?? [];
  const bands = rd?.bands ?? [];
  const tiers = countWallTiers(bands);

  const activeDomKeys = new Set(activeDom.map((l) => priceKey(l.side, l.price)));
  const liveKeys = liveLevelKeys(activeDom, liveProjection);

  const duplicatedLiveProjectionAndActiveDomCount =
    fs?.afterDuplicatedLiveProjectionAndActiveDomCount ??
    ms?.duplicatedActiveDomAndProjectionBucketsCount ??
    liveProjection.filter((l) => activeDomKeys.has(priceKey(l.side, l.price)))
      .length;

  const duplicatedWallAndActiveDomCount =
    fs?.afterDuplicatedWallAndActiveDomCount ??
    fs?.duplicatedWallAndActiveDomCount ??
    countDuplicatedWallAndActiveDom(bands, activeDomKeys);

  const duplicatedWallAndLiveProjectionCount =
    ms?.duplicatedWallAndLiveBucketsCount ??
    countDuplicatedWallAndLive(bands, liveKeys);

  const duplicatedAnchorAndLiveCount = fs?.duplicatedAnchorAndLiveCount ?? 0;

  const duplicatedPriceBucketsCount =
    duplicatedLiveProjectionAndActiveDomCount +
    duplicatedWallAndActiveDomCount +
    duplicatedWallAndLiveProjectionCount +
    duplicatedAnchorAndLiveCount;

  const duplicatedRightSideBucketsCount =
    duplicatedLiveProjectionAndActiveDomCount +
    duplicatedWallAndLiveProjectionCount +
    duplicatedAnchorAndLiveCount;

  const historicalTextureCount =
    fs?.historicalTextureLeftSideCount != null
      ? fs.historicalTextureLeftSideCount + fs.historicalTextureRightSideCount
      : rd?.textureCells.length ?? 0;

  const historicalTextureRightSideCount =
    fs?.historicalTextureRightSideCount ?? 0;

  const pulledFootprintCount =
    (fs?.pulledFootprintLeftSideCount ?? 0) +
    (fs?.pulledFootprintRightSideCount ?? 0);

  const liveProjectionRightSideCount = ms?.liveProjectionRectCount ?? 0;
  const activeDomBandsRightSideCount = ms?.activeDomBandRectCount ?? 0;

  const leftSideRenderedCount = fs?.leftSideRenderedCount ?? 0;
  const rightSideRenderedCount =
    fs?.rightSideRenderedCount ?? ms?.rightSideTotalRectCount ?? 0;

  const rightSideTotal = Math.max(1, rightSideRenderedCount);
  const domPct = activeDomBandsRightSideCount / rightSideTotal;
  const lpPct = liveProjectionRightSideCount / rightSideTotal;
  const wallPct = (fs?.wallBandRightSideCount ?? ms?.wallBandRightSideRectCount ?? 0) / rightSideTotal;

  let rightSideDominantLayer = ms?.rightSideDominantLayer ?? "none";
  let rightSideDominantLayerPct = 0;
  if (domPct >= lpPct && domPct >= wallPct && domPct > 0) {
    rightSideDominantLayer = "activeDomBands";
    rightSideDominantLayerPct = Number(domPct.toFixed(4));
  } else if (lpPct >= wallPct && lpPct > 0) {
    rightSideDominantLayer = "liveProjection";
    rightSideDominantLayerPct = Number(lpPct.toFixed(4));
  } else if (wallPct > 0) {
    rightSideDominantLayer = "wallBands";
    rightSideDominantLayerPct = Number(wallPct.toFixed(4));
  }

  const historicalDrawingIntoFutureBug = historicalTextureRightSideCount > 0;
  const preparedActiveDom = activeDom.length;
  const renderedActiveDom = activeDomBandsRightSideCount;
  const liveLayerMissingBug =
    preparedActiveDom > 0 &&
    renderedActiveDom === 0 &&
    tv.rightSpacePct > 0 &&
    tv.visibleEndTime > tv.dataEndTime + 500;

  const duplicatedLiveDomBug =
    duplicatedLiveProjectionAndActiveDomCount > 0 ||
    (activeDomBandsRightSideCount > 0 &&
      liveProjectionRightSideCount > 0 &&
      (fs?.afterDuplicatedLiveProjectionAndActiveDomCount ?? 0) > 0);

  const wallBandOverExtensionBug =
    (fs?.pulledFootprintRightSideCount ??
      fs?.afterHistoricalRightSideCount ??
      historicalTextureRightSideCount) > 0;

  const currentBookAnchorDuplicationBug =
    Boolean(opts.currentBookAnchorsInPrepare) || duplicatedAnchorAndLiveCount > 0;

  const architectureOk =
    !historicalDrawingIntoFutureBug &&
    !liveLayerMissingBug &&
    !duplicatedLiveDomBug &&
    !wallBandOverExtensionBug &&
    !currentBookAnchorDuplicationBug;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    domSource: opts.domSource,
    tradeSource: opts.tradeSource,
    verticalMode: opts.verticalMode,
    spotPrice: opts.spotPrice,
    bestBid: opts.bestBid,
    bestAsk: opts.bestAsk,
    dataEndTime: tv.dataEndTime,
    visibleEndTime: tv.visibleEndTime,
    rightSideWidthPx: ms?.rightSideWidthPx ?? opts.rightSideWidthPx,
    rightSidePct: tv.rightSpacePct,
    historicalTextureActive: Boolean(
      rd?.textureModeEnabled && (rd?.textureCells.length ?? 0) > 0,
    ),
    historicalTextureCount,
    historicalTextureRightSideCount,
    pulledFootprintActive: pulledFootprintCount > 0,
    pulledFootprintCount,
    pulledFootprintRightSideCount: fs?.pulledFootprintRightSideCount ?? 0,
    liveProjectionActive: liveProjection.length > 0,
    liveProjectionCount: liveProjection.length,
    liveProjectionRightSideCount,
    activeDomBandsActive: activeDom.length > 0,
    activeDomBandsCount: activeDom.length,
    activeDomBandsRightSideCount,
    currentBookAnchorsActive: Boolean(opts.currentBookAnchorsInPrepare),
    currentBookAnchorsCount: 0,
    currentBookAnchorsRightSideCount: 0,
    wallBandsActive: bands.length > 0,
    wallBandsCount: bands.length,
    wallBandsRightSideCount:
      fs?.wallBandRightSideCount ?? ms?.wallBandRightSideRectCount ?? 0,
    structuralWallsActive: tiers.structural > 0,
    structuralWallsCount: tiers.structural,
    structuralWallsRightSideCount:
      fs?.structuralWallRightSideCount ??
      ms?.structuralWallRightSideRectCount ??
      0,
    majorWallsActive: tiers.major > 0,
    majorWallsCount: tiers.major,
    majorWallsRightSideCount:
      fs?.majorWallRightSideCount ?? ms?.majorWallRightSideRectCount ?? 0,
    executionOverlayActive: fs?.executionOverlayActive ?? false,
    tradeDotsActive: fs?.tradeDotsActive ?? false,
    leftSideRenderedCount,
    rightSideRenderedCount,
    duplicatedPriceBucketsCount,
    duplicatedRightSideBucketsCount,
    duplicatedLiveProjectionAndActiveDomCount,
    duplicatedWallAndActiveDomCount,
    duplicatedWallAndLiveProjectionCount,
    duplicatedAnchorAndLiveCount,
    renderedLayerOrder: fs?.renderedLayerOrder ?? [],
    rightSideDominantLayer,
    rightSideDominantLayerPct,
    historicalDrawingIntoFutureBug,
    liveLayerMissingBug,
    duplicatedLiveDomBug,
    wallBandOverExtensionBug,
    currentBookAnchorDuplicationBug,
    architectureOk,
    phase2ClipApplied: fs?.phase2ClipApplied ?? true,
    phase2LiveDedupApplied: fs?.phase2LiveDedupApplied ?? false,
    phase2WallDedupApplied: fs?.phase2WallDedupApplied ?? false,
    phase2StrictLiveStartApplied: fs?.phase2StrictLiveStartApplied ?? false,
    beforeHistoricalRightSideCount: fs?.beforeHistoricalRightSideCount ?? 0,
    afterHistoricalRightSideCount:
      fs?.afterHistoricalRightSideCount ?? historicalTextureRightSideCount,
    beforeDuplicatedLiveProjectionAndActiveDomCount:
      fs?.beforeDuplicatedLiveProjectionAndActiveDomCount ?? 0,
    afterDuplicatedLiveProjectionAndActiveDomCount:
      fs?.afterDuplicatedLiveProjectionAndActiveDomCount ?? 0,
    beforeDuplicatedWallAndActiveDomCount:
      fs?.beforeDuplicatedWallAndActiveDomCount ?? 0,
    afterDuplicatedWallAndActiveDomCount:
      fs?.afterDuplicatedWallAndActiveDomCount ?? duplicatedWallAndActiveDomCount,
    phase3ContinuityIdentityApplied: fs?.phase3ContinuityIdentityApplied ?? false,
    phase3SeamBlendApplied: fs?.phase3SeamBlendApplied ?? false,
    phase3LiveUsesHistoricalVisualBase:
      fs?.phase3LiveUsesHistoricalVisualBase ?? false,
  };
}

export function buildBookmapLeftRightContinuityAudit(opts: {
  market: BookmapMarketSource;
  sourceMode: BookmapSourceMode;
  verticalMode: string;
  timeViewport: BookmapTimeViewport;
  renderData?: PreparedEngineRenderData | null;
  microStats?: MicroScalpLayerRenderStats | null;
  frameStats?: BookmapRenderArchitectureFrameStats | null;
}): BookmapLeftRightContinuityAudit {
  const rd = opts.renderData;
  const tv = opts.timeViewport;
  const fs = opts.frameStats;
  const sel = rd?.liveDomSelection;

  const activeDom = rd?.activeDomBands ?? [];
  const liveProjection = rd?.liveProjectionLevels ?? [];
  const liveKeys = liveLevelKeys(activeDom, liveProjection);
  const histKeys = historicalNearEdgeKeys(rd, tv.dataEndTime);

  const continuing = intersectCount(histKeys, liveKeys);
  const liveOnly = liveKeys.size - continuing;
  const histOnly = histKeys.size - continuing;

  const histDenom = Math.max(1, histKeys.size);
  const liveDenom = Math.max(1, liveKeys.size);

  const continuityRatio = Number((continuing / histDenom).toFixed(4));
  const liveOnlyRatio = Number((liveOnly / liveDenom).toFixed(4));
  const historicalOnlyNearEdgeRatio = Number((histOnly / histDenom).toFixed(4));

  const edgeDelta = computeAvgIntensityDeltaAtEdge(rd, liveKeys, tv.dataEndTime);
  const lc = fs?.liquidityContinuityStats;
  const finalAvgIntensityDeltaAtEdge =
    lc?.avgMatchedIntensityDeltaAfterBlend ?? edgeDelta.intensityDelta;
  const finalAvgAlphaDeltaAtEdge =
    lc?.avgMatchedAlphaDeltaAfterBlend ?? edgeDelta.alphaDelta;

  const continuingFromHistoricalCount =
    lc?.continuingFromHistoricalCount ?? continuing;
  const liveOnlyCountPhase3 = lc?.liveOnlyCount ?? liveOnly;
  const historicalOnlyNearEdgeCount =
    lc?.historicalOnlyNearEdgeCount ?? histOnly;

  const phase3Active = fs?.phase3ContinuityIdentityApplied === true;
  const intensitySeamThreshold = phase3Active ? 0.42 : 0.35;
  const alphaSeamThreshold = phase3Active ? 0.32 : 0.25;

  const hardSeamDetected =
    (continuityRatio < 0.35 && liveOnlyRatio > 0.4) ||
    finalAvgIntensityDeltaAtEdge > intensitySeamThreshold ||
    finalAvgAlphaDeltaAtEdge > alphaSeamThreshold ||
    (historicalOnlyNearEdgeRatio > 0.55 && liveOnlyRatio > 0.35);

  const rightSideDominant = opts.microStats?.rightSideDominantLayer ?? "none";
  const rightSideLooksLikeSeparateLayer =
    (hardSeamDetected ||
      lc?.liveTooWashedOut === true ||
      lc?.liveFlatBlockDetected === true ||
      lc?.liveDomNotDominantEnough === true) &&
    rightSideDominant !== "none" &&
    (opts.frameStats?.rightSideRenderedCount ?? 0) > 0 &&
    !(lc?.continuityVisualOk === true);

  const continuityOk =
    (lc?.continuityVisualOk ??
      (!hardSeamDetected &&
        !rightSideLooksLikeSeparateLayer &&
        !(continuityRatio < 0.2 && liveKeys.size > 3))) === true;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    verticalMode: opts.verticalMode,
    dataEndTime: tv.dataEndTime,
    visibleEndTime: tv.visibleEndTime,
    activeDomVisibleLevelsCount: sel?.currentBookVisibleLevelsCount ?? activeDom.length,
    activeDomNearTickLevelsCount: sel?.nearTickCount ?? 0,
    historicalLevelsNearDataEndCount: histKeys.size,
    liveBucketsAtRightSideCount: liveKeys.size,
    historicalBucketsNearEdgeCount: histKeys.size,
    bucketsContinuingFromHistoricalToLiveCount: continuing,
    bucketsLiveOnlyCount: liveOnly,
    bucketsHistoricalOnlyNearEdgeCount: histOnly,
    continuityRatio,
    liveOnlyRatio,
    historicalOnlyNearEdgeRatio,
    avgIntensityDeltaAtEdge: finalAvgIntensityDeltaAtEdge,
    avgAlphaDeltaAtEdge: finalAvgAlphaDeltaAtEdge,
    hardSeamDetected,
    rightSideLooksLikeSeparateLayer,
    continuityOk,
    phase2ClipApplied: fs?.phase2ClipApplied ?? true,
    phase2LiveDedupApplied: fs?.phase2LiveDedupApplied ?? false,
    phase2WallDedupApplied: fs?.phase2WallDedupApplied ?? false,
    phase2StrictLiveStartApplied: fs?.phase2StrictLiveStartApplied ?? false,
    continuityIdentityEnabled: lc?.continuityIdentityEnabled ?? phase3Active,
    historicalEdgeBucketCount: lc?.historicalEdgeBucketCount ?? histKeys.size,
    liveDomBucketCount: lc?.liveDomBucketCount ?? liveKeys.size,
    matchedContinuityBucketCount:
      lc?.matchedContinuityBucketCount ?? continuingFromHistoricalCount,
    continuingFromHistoricalCount,
    liveOnlyCount: liveOnlyCountPhase3,
    historicalOnlyNearEdgeCount,
    avgMatchedIntensityDeltaBeforeBlend:
      lc?.avgMatchedIntensityDeltaBeforeBlend ?? finalAvgIntensityDeltaAtEdge,
    avgMatchedIntensityDeltaAfterBlend:
      lc?.avgMatchedIntensityDeltaAfterBlend ?? finalAvgIntensityDeltaAtEdge,
    avgMatchedAlphaDeltaBeforeBlend:
      lc?.avgMatchedAlphaDeltaBeforeBlend ?? finalAvgAlphaDeltaAtEdge,
    avgMatchedAlphaDeltaAfterBlend:
      lc?.avgMatchedAlphaDeltaAfterBlend ?? finalAvgAlphaDeltaAtEdge,
    liveOnlyFadeInCount: lc?.liveOnlyFadeInCount ?? 0,
    liveOnlyWallBypassCount: lc?.liveOnlyWallBypassCount ?? 0,
    seamBlendApplied: lc?.seamBlendApplied ?? fs?.phase3SeamBlendApplied ?? false,
    seamBlendImproved: lc?.seamBlendImproved ?? false,
    continuityVisualOk: lc?.continuityVisualOk ?? continuityOk,
    phase3ContinuityIdentityApplied: fs?.phase3ContinuityIdentityApplied ?? false,
    phase3SeamBlendApplied: fs?.phase3SeamBlendApplied ?? false,
    phase3StrictLiveStartApplied: fs?.phase2StrictLiveStartApplied ?? false,
    avgHistoricalEdgeIntensity: lc?.avgHistoricalEdgeIntensity ?? 0,
    avgLiveRawIntensity: lc?.avgLiveRawIntensity ?? 0,
    avgLiveBlendedIntensity: lc?.avgLiveBlendedIntensity ?? 0,
    avgHistoricalEdgeAlpha: lc?.avgHistoricalEdgeAlpha ?? 0,
    avgLiveRawAlpha: lc?.avgLiveRawAlpha ?? 0,
    avgLiveBlendedAlpha: lc?.avgLiveBlendedAlpha ?? 0,
    liveTooWashedOut: lc?.liveTooWashedOut ?? false,
    liveTooFlat: lc?.liveTooFlat ?? false,
    liveHierarchyTooCompressed: lc?.liveHierarchyTooCompressed ?? false,
    liveDomNotDominantEnough: lc?.liveDomNotDominantEnough ?? false,
    topDomVisualScoreAvg: lc?.topDomVisualScoreAvg ?? 0,
    topDomAlphaAvg: lc?.topDomAlphaAvg ?? 0,
    wallVisualScoreAvg: lc?.wallVisualScoreAvg ?? 0,
    wallAlphaAvg: lc?.wallAlphaAvg ?? 0,
    nearTickVisualScoreAvg: lc?.nearTickVisualScoreAvg ?? 0,
    nearTickAlphaAvg: lc?.nearTickAlphaAvg ?? 0,
    liveIntensityStdDev: lc?.liveIntensityStdDev ?? 0,
    liveAlphaStdDev: lc?.liveAlphaStdDev ?? 0,
    liveFlatnessScore: lc?.liveFlatnessScore ?? 0,
    liveFlatBlockDetected: lc?.liveFlatBlockDetected ?? false,
    topDomVisualMapping: lc?.topDomVisualMapping ?? [],
    topDomVisualOkCount: (lc?.topDomVisualMapping ?? []).filter((e) => e.visualOk)
      .length,
  };
}
