import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBookmapCanvasInteraction } from "@/hooks/useBookmapCanvasInteraction";
import { useBookmapCompositeState } from "@/hooks/useBookmapCompositeState";
import { useBookmapPriceScale } from "@/hooks/useBookmapPriceScale";
import { useBookmapTimeScale } from "@/hooks/useBookmapTimeScale";
import { formatBookmapTimeSpanMs } from "@/lib/bookmapInteractionUtils";
import {
  detectPassiveConfluence,
  summarizePassiveConfluence,
  type PassiveConfluenceLevel,
} from "./bookmapConfluence";
import { resolveConfluenceRenderMode } from "./bookmapConfluenceRenderer";
import { extractBboFromDomSnapshot, isBboValid } from "./bookmapBboGuideLines";
import { downsampleBboPointsForViewport } from "./bookmapBboHistoryPath";
import { useBookmapBboHistory } from "@/hooks/useBookmapBboHistory";
import { useBookmapBboMarketDebug } from "@/hooks/useBookmapBboMarketDebug";
import { useBookmapMarketTradeSummary } from "@/hooks/useBookmapMarketTradeSummary";
import {
  detectSpotPerpDivergence,
  filterDivergenceSignals,
  resetDivergenceCooldown,
} from "./bookmapDivergenceEngine";
import { SpotPerpDivergencePanel } from "./SpotPerpDivergencePanel";
import { BOOKMAP_OB_STALE_MS, isOrderbookStale } from "@shared/bookmapFreshness";
import { countExecutionRails } from "./bookmapExecutionRails";
import {
  buildBookmapExecutionOrdersFromPaper,
  renderBookmapExecutionOrders,
} from "./bookmapExecutionOrderOverlay";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";
import { usePaperTradeOverlay } from "@/components/terminal/paperChart/usePaperTradeOverlay";
import {
  desktopBookmapFeedEnabled,
  useDesktopBookmapFeed,
} from "@/hooks/useDesktopBookmapFeed";
import { useLiquidityHeatmapFeed } from "@/hooks/useLiquidityHeatmapFeed";
import {
  BOOKMAP_ENGINE_PRICE_RANGE_PCT,
  ENABLE_BOOKMAP_DELTA_VOLUME,
  ENABLE_BOOKMAP_TRADE_DOTS,
  TRADE_DOT_COLOR_MODE,
  USE_BOOKMAP_ENGINE,
} from "@/lib/bookmapEngineConfig";
import {
  logBookmapFrontendDataDiag,
  logBookmapRailwayEnableAudit,
} from "@/lib/bookmapRailwayEnableAudit";
import { useBookmapTrades } from "@/hooks/useBookmapTrades";
import { formatBookmapRangeShort } from "@/lib/bookmapPriceScaleUtils";
import {
  prepareEngineTradeDots,
  resolveDotVisibleEndTime,
} from "./bookmapEngineTradeDots";
import { paintBookmapEngineHeatmapFrame } from "./bookmapEngineRenderer";
import {
  bookLevelsToDomSnapshot,
  applyEngineViewportBandNormalization,
  applyHistoricalTextureVisualLock,
  applyMicroScalpTextureCalibration,
  BOOKMAP_TEXTURE_MODE_ENABLED,
  BOOKMAP_TEXTURE_SAMPLER_MS,
  buildBookmapHistoryRetentionDiag,
  buildBookmapTextureDiag,
  buildBookmapTextureGeometryDiag,
  buildBookmapLiveProjectionDiag,
  buildBookmapLiveProjectionGeometryDiag,
  classifyBookmapTextureDiag,
  prepareEngineRenderData,
  type BookmapMicroVisualHierarchyTruth,
  type BookmapPerpFilterTruth,
  type BookmapTextureDiag,
  type BookmapL2BandContinuityTruth,
  type BookmapPaletteParityTruth,
  type BookmapVisualParityTruth,
  type BookmapP74SpanAudit,
  type HistoricalColorLockAudit,
  type HistoricalColorRetentionTruth,
  type HistoricalSpanColorAudit,
  type SpanRenderContinuityAudit,
  type SpanTextureBalanceAudit,
  type PreparedEngineRenderData,
} from "./bookmapEnginePrepare";
import type {
  HistoricalTextureSpanPeakLock,
  HistoricalTextureVisualLock,
} from "@/lib/bookmapIntensity";
import {
  PERP_RENDER_ACTIVE_CAP,
  PERP_RENDER_CLOSED_CAP,
} from "@/lib/bookmapEngineConfig";
import type { BookmapState } from "@/types/bookmapState";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { PERP_OVERLAY_OPACITY_OPTIONS } from "@shared/bookmapSourceMode";
import {
  buildLiveDomPriorityDiag,
  liquiditySnapshotToLiveDomLevels,
  resolveLiveDomBookLevels,
  resolveLiveDomPriorityConfig,
} from "./bookmapLiveDomPriority";
import {
  applyLiveDomVisualCache,
  buildLiveDomStabilityAudit,
  type LiveDomVisualCacheFrameStats,
  type LiveDomVisualCacheSession,
} from "./bookmapLiveDomVisualCache";
import { buildBookmapLayerAudit, type BookmapLayerAudit } from "./bookmapLayerAudit";
import {
  buildBookmapMicroScalpLayerAudit,
  type MicroScalpLayerRenderStats,
} from "./bookmapMicroScalpLayerAudit";
import {
  buildBookmapLeftRightContinuityAudit,
  buildBookmapRenderArchitectureAudit,
  type BookmapRenderArchitectureFrameStats,
} from "./bookmapRenderArchitectureAudit";
import { buildBookmapRightSideDensityAudit } from "./bookmapRightSideDensity";
import { buildBookmapLiquidityLifecycleAudit } from "./bookmapLiquidityLifecycle";
import { buildBookmapLifecycleTextureIntegrationAudit } from "./bookmapLifecycleTextureIntegration";
import {
  buildBookmapPassiveBaseTextureAudit,
  getPassiveBaseTexturePrepareStats,
  getPassiveBaseTextureSelectStats,
} from "./bookmapPassiveBaseTexture";
import { getLiquidityLifecycleCache } from "./bookmapLiquidityLifecycle";
import {
  buildBookmapRestingLiquidityLifecycleAudit,
  resolveRestingLiquidityWriteConfig,
} from "./bookmapRestingLiquidity";
import { paintBookmapHeatmapFrame } from "./bookmapHeatmapRenderer";
import { BookmapDomPanel } from "./BookmapDomPanel";
import { bookLevelsToDomWallEntries } from "./domLadderUtils";
import { BookmapPriceLadder } from "./BookmapPriceLadder";
import { BookmapCvdGauge } from "./BookmapCvdGauge";
import { DeltaVolumeMatrixPanel } from "./DeltaVolumeMatrixPanel";
import { formatBtcCompact } from "./bookmapTradeAggregation";
import {
  RIGHT_SPACE_PCT_OPTIONS,
  type LocalRangeUsd,
  type RightSpacePct,
} from "./bookmapViewMode";
import {
  computeDepthRangeFromPreset,
  computeFarDepthMarkers,
  depthPresetLabel,
  depthPresetToLegacyViewMode,
  DEPTH_RANGE_PRESETS,
  type DepthRangePreset,
} from "@/lib/bookmapDepthRange";
import { BOOKMAP_PLOT_PAD } from "./bookmapViewportUtils";
import {
  clampDomWidth,
  getMinBookmapBodyWidth,
  PRICE_LADDER_WIDTH_PX,
} from "./bookmapLayoutConstants";
import {
  auditLowerDomDepth,
  computeBookmapPipelineStats,
} from "./domLadderUtils";
import { useBookmapPanelPrefs } from "./useBookmapPanelPrefs";
import {
  formatHeatmapPrice,
  getBookMidFromSnapshot,
  HEATMAP_MAJOR_WALL_BTC,
  HEATMAP_MIN_SIZE_OPTIONS,
  MAX_LIQUIDITY_SNAPSHOTS,
  SNAPSHOT_INTERVAL_MS,
} from "./liquidityHeatmapUtils";
import {
  detectImportantLiquidityLevels,
  type ImportantLiquidityLevel,
} from "./importantLiquidityLevels";
import { PersistentWallsTracker } from "./persistentWallsTracker";
import {
  formatTradeRxPerSec,
  prepareTradeBubblesForRender,
} from "./tradeBubbleUtils";
import { BookmapControlPanel } from "@/components/terminal/bookmap/BookmapControlPanel";
import type { BookmapOperationalConfig } from "@/components/terminal/bookmap/bookmapOperationalConfig";
import { IndicatorsPanel } from "@/components/terminal/bookmap/IndicatorsPanel";
import {
  BookmapSegmentGroup,
  BookmapToggleButton,
  BookmapToolbarDivider,
  bookmapToolbarBtnClass,
} from "@/components/terminal/bookmap/BookmapToolbarSegments";
import { useBookmapVisualSettings } from "@/components/terminal/bookmap/useBookmapVisualSettings";
import { mergeBookmapVisualSettings } from "@/components/terminal/bookmap/bookmapSettings";
import type { TradeDotVisualContext } from "./bookmapEngineTradeDots";

export type LiquidityHeatmapPanelProps = {
  symbol?: string;
  spot?: number;
};

const MIN_SIZE_OPTIONS = HEATMAP_MIN_SIZE_OPTIONS;
const VOLUME_RESIZE_HANDLE_PX = 4;

/** Legacy snapshot renderer — manual debug only; never automatic in production. */
const LEGACY_DEBUG_ALLOWED = import.meta.env.VITE_BOOKMAP_LEGACY_DEBUG === "true";

function createEmptyEngineRenderData(
  timeMin: number,
  timeMax: number,
  heatmapBucketSize: number,
  domBucketSize: number,
  labelStep: number,
): PreparedEngineRenderData {
  return {
    bands: [],
    mergedBands: [],
    cells: [],
    walls: [],
    timeMin,
    timeMax,
    visualScale: {
      visualMode: "intraday",
      pLow: 0,
      pHigh: 1,
      logP60: 0,
      logP80: 0,
      logP92: 0,
      logP97: 0,
      logP99: 0,
      logMax: 0,
    },
    stats: {
      rawCellCount: 0,
      bandCount: 0,
      visibleBandCount: 0,
      renderedBandCount: 0,
      visualMode: "intraday",
      pLow: 0,
      pHigh: 1,
      minRenderIntensity: 0,
    },
    textureCells: [],
    textureStats: {
      rawHeatmapCellCount: 0,
      preparedCellCount: 0,
      preparedTextureCellCount: 0,
      wallBandCount: 0,
      cellsFilteredBySize: 0,
      cellsFilteredByPrice: 0,
      cellsFilteredByTime: 0,
      texturePriceBucketSize: 1,
      timeBucketMs: 500,
      minRenderedSizeBtc: 0,
      maxRenderedSizeBtc: 0,
      mergeCompressionRatio: 0,
      textureModeEnabled: BOOKMAP_TEXTURE_MODE_ENABLED,
      texturePrepareCapHit: false,
      textureDrawCapHit: false,
      cellsFilteredByIntensity: 0,
      textureSamplerMs: 1200,
      textureContinuousMode: "sampler-interval-end",
      cellsWithEndTime: 0,
      cellsUsingSyntheticEndTime: 0,
    },
    textureModeEnabled: BOOKMAP_TEXTURE_MODE_ENABLED,
    liveProjectionLevels: [],
    activeDomBands: [],
    liveProjectionStats: {
      liveProjectionEnabled: false,
      currentBidLevelCount: 0,
      currentAskLevelCount: 0,
      projectedBidLevelCount: 0,
      projectedAskLevelCount: 0,
      projectedLevelsFilteredBySize: 0,
      projectedLevelsFilteredByPrice: 0,
      minProjectedSizeBtc: 0,
      maxProjectedSizeBtc: 0,
      liveProjectionStartTime: timeMax,
    },
    bandPrepareMeta: {
      rawCellCount: 0,
      bandCount: 0,
      priceSpan: 0,
      labelStep,
      heatmapBucketSize,
      domBucketSize,
    },
  };
}

function isPosFinitePrice(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

type BookmapPriceCenterSource = "bbo" | "priceReference" | "bookMid" | "none";

function resolveBookmapPriceCenterMid(opts: {
  bestBid: number | null | undefined;
  bestAsk: number | null | undefined;
  priceReference: number | null;
  bookMid: number | null;
}): {
  midPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  source: BookmapPriceCenterSource;
} {
  const { bestBid, bestAsk, priceReference, bookMid } = opts;
  if (isBboValid(bestBid, bestAsk)) {
    return {
      midPrice: ((bestBid as number) + (bestAsk as number)) / 2,
      bestBid: bestBid as number,
      bestAsk: bestAsk as number,
      source: "bbo",
    };
  }
  if (isPosFinitePrice(priceReference)) {
    return {
      midPrice: priceReference,
      bestBid: null,
      bestAsk: null,
      source: "priceReference",
    };
  }
  if (isPosFinitePrice(bookMid)) {
    return {
      midPrice: bookMid,
      bestBid: null,
      bestAsk: null,
      source: "bookMid",
    };
  }
  return { midPrice: null, bestBid: null, bestAsk: null, source: "none" };
}

function heatmapCellsCoverageMs(
  cells: Array<{ timeBucket: number }> | undefined,
): number {
  if (!cells?.length) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const cell of cells) {
    if (cell.timeBucket < min) min = cell.timeBucket;
    if (cell.timeBucket > max) max = cell.timeBucket;
  }
  return min === Infinity ? 0 : Math.max(0, max - min);
}

export function LiquidityHeatmapPanel({
  symbol = "BTCUSDT",
  spot: spotProp,
}: LiquidityHeatmapPanelProps) {
  const { prefs, updatePrefs } = useBookmapPanelPrefs();
  const {
    settings: visualSettings,
    setSettings: setVisualSettings,
    resetSettings: resetVisualSettings,
  } = useBookmapVisualSettings();
  const [configOpen, setConfigOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const {
    domWidth,
    volumeHeight,
    minVisibleBtc,
    ladderAutoCenter,
    majorWallsOnly,
    showTrades,
    showPersistentWalls,
    showImportantFarLevels,
    depthRangePreset,
    localRangeUsd,
    rightSpacePct,
    confluence: confluencePrefs,
  } = prefs;

  const viewMode = depthPresetToLegacyViewMode(depthRangePreset);

  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number } | null>(
    null,
  );
  const [heatmapPlotHeight, setHeatmapPlotHeight] = useState(0);
  const [heatmapPlotWidth, setHeatmapPlotWidth] = useState(0);

  const bookmapBodyRef = useRef<HTMLDivElement>(null);
  const heatmapContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bookmapBodyWidth, setBookmapBodyWidth] = useState(0);
  const domResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const volResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const wallsTrackerRef = useRef(new PersistentWallsTracker());
  const [wallRevision, setWallRevision] = useState(0);
  const tradeRxSampleRef = useRef({ atMs: Date.now(), received: 0 });
  const [tradeRxPerSec, setTradeRxPerSec] = useState<number | null>(null);
  const textureRenderStatsRef = useRef({
    renderedTextureCellCount: 0,
    cellsFilteredByTime: 0,
    textureDrawCapHit: false,
    avgTextureCellWidthPx: 0,
    minTextureCellWidthPx: 0,
    maxTextureCellWidthPx: 0,
  });
  const liveProjectionRenderStatsRef = useRef({
    renderedLiveProjectionCount: 0,
    projectionStartTime: 0,
    projectionEndTime: 0,
    avgProjectionWidthPx: 0,
    minProjectionWidthPx: 0,
    maxProjectionWidthPx: 0,
    projectionOverlapsHistory: false,
  });
  const textureDiagRef = useRef<BookmapTextureDiag>(
    buildBookmapTextureDiag({
      sourceMode: "spot",
      activeDomMarket: "spot",
      renderData: null,
    }),
  );
  const perpFilterTruthRef = useRef<BookmapPerpFilterTruth>({
    perpFilterEnabled: false,
    activeCandidatesBeforePerpFilter: 0,
    closedCandidatesBeforePerpFilter: 0,
    activeAfterPerpFilter: 0,
    closedAfterPerpFilter: 0,
    activeDroppedByPerpSizeDistance: 0,
    closedDroppedByPerpAgeSizeDistance: 0,
    activeDroppedByPerpRowSuppression: 0,
    closedDroppedByPerpRowSuppression: 0,
    perpActiveCap: PERP_RENDER_ACTIVE_CAP,
    perpClosedCap: PERP_RENDER_CLOSED_CAP,
    renderedPerpActiveSpanCount: 0,
    renderedPerpClosedSpanCount: 0,
    renderedPerpTotalSpanCount: 0,
    perpStripeSaturationPct: 0,
    perpDensityTooHigh: false,
    perpFilterOk: true,
  });
  const visualParityTruthRef = useRef<BookmapVisualParityTruth>({
    perpFilterAligned: true,
    historicalTextureGranular: false,
    rightSideContinuityOk: false,
    adaptiveColorHierarchyEnabled: false,
    visiblePriceRangePct: 0,
    zoomRegime: "micro",
    viewportVisibleSpanCount: 0,
    viewportActiveSpanCount: 0,
    viewportClosedSpanCount: 0,
    usesAbsoluteSizeComponent: false,
    usesViewportRelativeSizeComponent: false,
    usesDistanceWeighting: false,
    usesClosedAgeWeighting: false,
    usesRecentPullWeighting: false,
    activeNearAvgAlpha: 0,
    activeFarAvgAlpha: 0,
    closedRecentAvgAlpha: 0,
    closedOldAvgAlpha: 0,
    nearVsFarAlphaRatio: 0,
    activeVsClosedAlphaRatio: 0,
    recentPullCandidateCount: 0,
    wallPullVisualCandidateCount: 0,
    textureLooksStripedOnly: true,
    textureLooksGranular: false,
    rightSideLooksOverlayed: true,
    rightSideFeelsContinuous: false,
    visualFloodingInPerp: false,
    microZoomBoostApplied: false,
    scalpZoomBoostApplied: false,
    visualParityOk: false,
  });
  const l2BandContinuityTruthRef = useRef<BookmapL2BandContinuityTruth>({
    l2BandContinuityFixEnabled: true,
    relevantActiveL2CandidateCount: 0,
    stableActiveL2BandCount: 0,
    normalActiveMicroBandCount: 0,
    closedRelevantHistoryBandCount: 0,
    weakGranularTextureBandCount: 0,
    stableBandsUsingSingleColorCount: 0,
    stableBandsSplitByMaterialSizeChangeCount: 0,
    stableBandsIncorrectlySplitByChunkColorCount: 0,
    rightEdgeStableBandCount: 0,
    rightEdgeColorMatchesHistoryCount: 0,
    rightEdgeColorMismatchCount: 0,
    pulledRelevantBandCount: 0,
    pulledRelevantBandsStopAtCloseTimeCount: 0,
    pulledRelevantBandsIncorrectlyExtendRightCount: 0,
    granularAppliedToWeakOnly: true,
    granularAppliedToRelevantL2Count: 0,
    stableL2BandContinuityOk: false,
    rightEdgeContinuityOk: false,
    pulledL2HistoryOk: false,
    l2BandVisualOk: false,
  });
  const paletteParityTruthRef = useRef<BookmapPaletteParityTruth>({
    paletteFixEnabled: true,
    activeBandMinAlpha: 0,
    activeBandMaxAlpha: 0,
    closedBandMinAlpha: 0,
    closedBandMaxAlpha: 0,
    weakBandCount: 0,
    mediumBandCount: 0,
    strongBandCount: 0,
    extremeBandCount: 0,
    weakBandsTooTransparentCount: 0,
    strongBandsTooTransparentCount: 0,
    activeRelevantBandsWashedOutCount: 0,
    liveRightContinuationCount: 0,
    liveRightContinuationToneMismatchCount: 0,
    liveRightContinuationAlphaMismatchCount: 0,
    zoomRegime: "micro",
    nearPriceContrastBoostActive: false,
    farLiquidityFadeActive: false,
    paletteUsesBookmapStyleRamp: false,
    opacityHierarchyOk: false,
    rightContinuationVisualMatchOk: false,
    relevantActiveBandsSolidEnough: false,
    paletteParityOk: false,
  });
  const microHierarchyTruthRef = useRef<BookmapMicroVisualHierarchyTruth>({
    microScalpMode: false,
    microVisualHierarchyActive: false,
    verticalMode: "macro",
    visiblePriceRange: 0,
    pxPerSample: 0,
    pxPerPriceBucket: 0,
    visibleTextureCellCount: 0,
    nearTouchCellCount: 0,
    mediumCellCount_2to10: 0,
    strongCellCount_10to30: 0,
    majorCellCount_30plus: 0,
    avgExistingIntensity: 0,
    avgMicroDataIntensity: 0,
    avgMicroRenderIntensity: 0,
    nearTouchAvgRenderIntensity: 0,
    mediumRenderAvg: 0,
    strongRenderAvg: 0,
    majorRenderAvg: 0,
    avgHistoricalTextureAlpha: 0,
    microAlphaMul: 1.12,
    mediumVisible: false,
    strongVisible: false,
    hierarchyGap_mediumToStrong: 0,
    hierarchyGap_strongToMajor: 0,
    overbrightRisk: false,
    microHierarchyOk: false,
  });
  const historicalTextureVisualCacheRef = useRef(
    new Map<string, HistoricalTextureVisualLock>(),
  );
  const liveDomVisualCacheRef = useRef<LiveDomVisualCacheSession>(new Map());
  const liveDomVisualFrameStatsRef = useRef<LiveDomVisualCacheFrameStats>({
    newLevelsThisFrame: 0,
    removedLevelsThisFrame: 0,
    updatedLevelsThisFrame: 0,
    retainedGhostLevels: 0,
    fadedOutLevels: 0,
    rawRankChanges: 0,
    smoothedRankChanges: 0,
    avgRawSizeChangePct: 0,
    avgSmoothedSizeChangePct: 0,
    flickerRate: 0,
    churnRate: 0,
    unstableBucketCount: 0,
    possiblePullingLevelCount: 0,
    possibleSpoofingLevelCount: 0,
    avgLevelLifetimeMs: 0,
    medianLevelLifetimeMs: 0,
    avgVisibleLifetimeMs: 0,
    medianVisibleLifetimeMs: 0,
  });
  const historicalTextureSpanPeakCacheRef = useRef(
    new Map<string, HistoricalTextureSpanPeakLock>(),
  );
  const historicalSpanColorAuditRef = useRef<HistoricalSpanColorAudit>({
    textureCellCount: 0,
    renderedSpanCount: 0,
    multiBucketSpanCount: 0,
    avgCellsPerSpan: 0,
    spansWithMixedIntensity: 0,
    avgIntensityVarianceWithinSpan: 0,
    maxIntensityVarianceWithinSpan: 0,
    spansUsingPeakIntensity: 0,
    spansDowngradePrevented: 0,
    avgSpanPeakIntensity: 0,
    avgSpanFinalIntensity: 0,
    historicalSpanColorRetentionOk: false,
    historicalSpanColorProblemClassification: "pending",
  });
  const p74SpanAuditRef = useRef<BookmapP74SpanAudit>({
    renderedSpanCount: 0,
    avgCellsPerSpan: 0,
    avgSpanWidthPx: 0,
    avgSpanPeakIntensity: 0,
    spanPeakIntensityMode: true,
    spanBaseLayerEnabled: true,
    internalChunkOverlayAlpha: 0.14,
    spanContinuityOk: false,
    internalTextureOverlayEnabled: false,
    overlayToBaseAlphaRatio: 0,
    bookmapTextureBalanceOk: false,
  });
  const spanTextureBalanceAuditRef = useRef<SpanTextureBalanceAudit>({
    renderedSpanCount: 0,
    spanBaseLayerEnabled: true,
    internalTextureOverlayEnabled: false,
    avgBaseAlpha: 0,
    avgOverlayAlpha: 0,
    overlayToBaseAlphaRatio: 0,
    avgInternalSizeVariance: 0,
    spansWithInternalVariation: 0,
    spansTooFlat: false,
    spansTooFragmented: false,
    bookmapTextureBalanceOk: false,
    problemClassification: "pending",
  });
  const spanRenderContinuityAuditRef = useRef<SpanRenderContinuityAudit>({
    renderedSpanCount: 0,
    renderedChunkCount: 0,
    avgChunksPerSpan: 0,
    maxChunksPerSpan: 0,
    spansRenderedAsSingleRect: 0,
    spansRenderedAsChunks: 0,
    chunkFragmentationDetected: false,
    avgSpanWidthPx: 0,
    avgChunkWidthPx: 0,
    spanBaseLayerEnabled: true,
    spanTextureOverlayEnabled: false,
    spanContinuityOk: false,
    problemClassification: "pending",
  });
  const historicalColorRetentionTruthRef = useRef<HistoricalColorRetentionTruth>({
    historicalTextureCellCount: 0,
    visualCacheSize: 0,
    cellsWithFrozenRenderIntensity: 0,
    cellsWithoutFrozenRenderIntensity: 0,
    avgFrozenRenderIntensity: 0,
    avgCurrentRenderIntensity: 0,
    avgFinalRenderIntensity: 0,
    avgIntensityDrift: 0,
    maxIntensityDrift: 0,
    downgradedHistoricalCellsPrevented: 0,
    upgradedHistoricalCells: 0,
    cellsStuckBelow025: 0,
    activeCellsUsingFrozenLowIntensity: 0,
    historicalColorRetentionOk: false,
    historicalColorTooMuted: false,
    alphaFrozenAsFinalDetected: false,
    recalculatingHistoricalColors: false,
    microScalpMode: false,
  });
  const historicalColorLockAuditRef = useRef<HistoricalColorLockAudit>({
    historicalTextureCellCount: 0,
    visualCacheSize: 0,
    firstLockBelowMediumCount: 0,
    cachedIntensityAvg: 0,
    currentCandidateIntensityAvg: 0,
    upgradedHistoricalCells: 0,
    downgradedHistoricalCellsPrevented: 0,
    alphaFrozenCellCount: 0,
    alphaFinalAvg: 0,
    intensityFinalAvg: 0,
    cellsStuckBelow025: 0,
    cellsEligibleForUpgrade: 0,
    cellsDeniedUpgrade: 0,
    activeCellsUsingFrozenLowIntensity: 0,
    historicalLockProblemClassification: "ok",
  });
  const hasUserAdjustedPriceViewportRef = useRef(false);
  const lastPriceCenterContextRef = useRef<string | null>(null);

  const layerAuditSinkRef = useRef<{ audit: BookmapLayerAudit | null }>({
    audit: null,
  });
  const microScalpLayerAuditSinkRef = useRef<{
    stats: MicroScalpLayerRenderStats | null;
  }>({ stats: null });
  const renderArchitectureFrameStatsRef =
    useRef<BookmapRenderArchitectureFrameStats>({
      renderedLayerOrder: [],
      historicalTextureLeftSideCount: 0,
      historicalTextureRightSideCount: 0,
      pulledFootprintLeftSideCount: 0,
      pulledFootprintRightSideCount: 0,
      wallBandLeftSideCount: 0,
      wallBandRightSideCount: 0,
      structuralWallLeftSideCount: 0,
      structuralWallRightSideCount: 0,
      majorWallLeftSideCount: 0,
      majorWallRightSideCount: 0,
      leftSideRenderedCount: 0,
      rightSideRenderedCount: 0,
      duplicatedWallAndActiveDomCount: 0,
      duplicatedAnchorAndLiveCount: 0,
      executionOverlayActive: false,
      tradeDotsActive: false,
      phase2ClipApplied: true,
      phase2LiveDedupApplied: false,
      phase2WallDedupApplied: false,
      phase2StrictLiveStartApplied: false,
      beforeHistoricalRightSideCount: 0,
      afterHistoricalRightSideCount: 0,
      beforeDuplicatedLiveProjectionAndActiveDomCount: 0,
      afterDuplicatedLiveProjectionAndActiveDomCount: 0,
      beforeDuplicatedWallAndActiveDomCount: 0,
      afterDuplicatedWallAndActiveDomCount: 0,
      phase3ContinuityIdentityApplied: false,
      phase3SeamBlendApplied: false,
      phase3LiveUsesHistoricalVisualBase: false,
      liquidityContinuityStats: null,
      rightSideDensityCapture: null,
    });
  const lastLayerAuditAtRef = useRef(0);
  const lastMicroScalpLayerAuditAtRef = useRef(0);
  const lastRenderArchitectureAuditAtRef = useRef(0);
  const lastRestingLiquidityAuditAtRef = useRef(0);

  const forensicDrawRef = useRef({
    legacyRendered: false,
    renderedLayerNames: [] as string[],
    rendererReceivedDotsCount: 0,
    rendererDrawnDotsCount: 0,
    rendererClippedTimeCount: 0,
    rendererClippedPriceCount: 0,
  });

  const [engineFetchBounds, setEngineFetchBounds] = useState<{
    priceMin?: number;
    priceMax?: number;
    priceRangePct: number;
  }>({ priceRangePct: BOOKMAP_ENGINE_PRICE_RANGE_PCT });

  const useDesktopLocalBookmap = desktopBookmapFeedEnabled;

  const composite = useBookmapCompositeState({
    symbol,
    exchange: "binance",
    enabled: USE_BOOKMAP_ENGINE && !useDesktopLocalBookmap,
    includeStale: true,
    priceRangePct: engineFetchBounds.priceRangePct,
    priceMin: engineFetchBounds.priceMin,
    priceMax: engineFetchBounds.priceMax,
  });

  const {
    sourceMode,
    setSourceMode,
    domSource,
    setDomSource,
    tradeSource,
    setTradeSource,
    perpOverlayOpacityPct,
    setPerpOverlayOpacityPct,
    perpOverlayOpacity,
    activeDomMarket,
    activeTradeMarket,
    effectiveSource,
    spotAvailable: remoteSpotAvailable,
    perpAvailable,
    effectiveSpot: remoteEffectiveSpot,
    effectivePerp,
    primaryHeatmapState: remotePrimaryHeatmapState,
    overlayHeatmapState,
    effectiveDomState: remoteEffectiveDomState,
    waitingMarkets: remoteWaitingMarkets,
    hasRenderableHeatmap: remoteHasRenderableHeatmap,
    usingCachedPrimary: remoteUsingCachedPrimary,
    primaryQuery: remotePrimaryQuery,
    spotAgeMs,
    perpAgeMs,
    spotDataUpdatedAt,
    perpDataUpdatedAt,
    activeDomAgeMs,
    perpBookmapStale,
    everLoadedByMarket,
  } = composite;

  const paperTrade = usePaperTradeOverlay();
  const executionOrderLines = useMemo(
    () =>
      buildBookmapExecutionOrdersFromPaper({
        paperActive: paperTrade.paperActive,
        openLimitOrders: paperTrade.openLimitOrders,
        overlay: paperTrade.overlay,
      }),
    [paperTrade.paperActive, paperTrade.openLimitOrders, paperTrade.overlay],
  );

  const desktopFeed = useDesktopBookmapFeed(symbol, useDesktopLocalBookmap, {
    tradeMarket: activeTradeMarket,
    orderbookMarket: activeDomMarket,
  });

  const primaryHeatmapState = desktopFeed.enabled
    ? desktopFeed.bookmapState
    : remotePrimaryHeatmapState;
  const effectiveSpot = desktopFeed.enabled
    ? desktopFeed.bookmapState
    : remoteEffectiveSpot;
  const effectiveDomState = desktopFeed.enabled
    ? desktopFeed.bookmapState
    : remoteEffectiveDomState;
  const spotAvailable = desktopFeed.enabled
    ? Boolean(desktopFeed.bookmapState)
    : remoteSpotAvailable;
  const hasRenderableHeatmap = desktopFeed.enabled
    ? Boolean(desktopFeed.bookmapState?.heatmapCells.length)
    : remoteHasRenderableHeatmap;
  const usingCachedPrimary = desktopFeed.enabled ? false : remoteUsingCachedPrimary;
  const waitingMarkets = desktopFeed.enabled ? [] : remoteWaitingMarkets;
  const primaryQuery = desktopFeed.enabled ? desktopFeed.query : remotePrimaryQuery;

  const remoteFeed = useLiquidityHeatmapFeed(symbol, !useDesktopLocalBookmap, {
    tradeMarket: activeTradeMarket,
    orderbookMarket: activeDomMarket,
  });
  const feed = desktopFeed.enabled ? desktopFeed : remoteFeed;

  const {
    getSnapshots,
    snapshotCount,
    spot: spotFeed,
    feedStatus,
    exchange: feedExchange,
    getRecentTrades,
    pipelineStats,
    tradeTick,
    tradeBufferCount,
    receivedTradeCount,
    tradesStreamConnected,
    latestTradeTs,
    lastMessageTs,
    tradeVersion,
    sseUrl: tradeSseUrl,
    bufferKey: tradeBufferKey,
    market: tradeFeedMarket,
    orderbookMarket: orderbookFeedMarket,
    orderbookAgeMs,
    orderbookReceivedAt,
  } = feed;

  const bookmapEngineLoading = primaryQuery.isLoading;
  const bookmapEngineFetching = primaryQuery.isFetching;
  const bookmapEngineError = primaryQuery.error;
  const bookmapAgeMs = primaryQuery.ageMs;
  const bookmapDataUpdatedAt = primaryQuery.dataUpdatedAt;

  const engineRequested = USE_BOOKMAP_ENGINE;
  const legacyDebugEnabled = LEGACY_DEBUG_ALLOWED;
  const useEngineRenderer = Boolean(engineRequested && hasRenderableHeatmap);

  const usingCachedBookmapState = usingCachedPrimary;

  const exchange = useEngineRenderer
    ? primaryHeatmapState?.exchange ?? feedExchange
    : feedExchange;

  useEffect(() => {
    if (!import.meta.env.DEV || !primaryHeatmapState) return;
    console.debug("[BOOKMAP_STATE_LEVELS]", {
      sourceMode,
      spotCells: effectiveSpot?.heatmapCells.length ?? 0,
      perpCells: effectivePerp?.heatmapCells.length ?? 0,
      domSource: activeDomMarket,
      tradeSource: activeTradeMarket,
    });
  }, [sourceMode, primaryHeatmapState, effectiveSpot, effectivePerp, activeDomMarket, activeTradeMarket]);

  const tickerSpot = spotProp ?? spotFeed ?? null;
  /** Ticker last; UI/debug may use `priceReference` when ticker is late. */
  const spot = tickerSpot;

  const snapshots = getSnapshots();
  const latestLegacy = snapshots[snapshots.length - 1];

  /** BBO path + live guide lines follow DOM source in Both mode; otherwise source mode. */
  const effectiveBboMarket = useMemo((): BookmapMarketSource => {
    if (sourceMode === "both") return domSource;
    return sourceMode;
  }, [sourceMode, domSource]);

  const latest = useMemo(() => {
    if (!useEngineRenderer || !effectiveDomState) return latestLegacy;
    return bookLevelsToDomSnapshot(
      effectiveDomState.bids,
      effectiveDomState.asks,
      effectiveDomState.timestamp,
    );
  }, [useEngineRenderer, effectiveDomState, latestLegacy]);

  const bboDomState = useMemo((): BookmapState | null => {
    return effectiveBboMarket === "perp" ? effectivePerp : effectiveSpot;
  }, [effectiveBboMarket, effectivePerp, effectiveSpot]);

  const bboDomSnapshot = useMemo(() => {
    const legacyBbo = orderbookFeedMarket === effectiveBboMarket
      ? extractBboFromDomSnapshot(latestLegacy)
      : null;

    if (useEngineRenderer && bboDomState) {
      const engineSnapshot = bookLevelsToDomSnapshot(
        bboDomState.bids,
        bboDomState.asks,
        bboDomState.timestamp,
      );
      const engineBbo = extractBboFromDomSnapshot(engineSnapshot);
      if (engineBbo) return engineSnapshot;
      if (legacyBbo) return latestLegacy;
      return engineSnapshot;
    }
    if (orderbookFeedMarket === effectiveBboMarket) return latestLegacy;
    return undefined;
  }, [
    useEngineRenderer,
    bboDomState,
    orderbookFeedMarket,
    effectiveBboMarket,
    latestLegacy,
  ]);

  const domBboRaw = useMemo(
    () => extractBboFromDomSnapshot(bboDomSnapshot),
    [bboDomSnapshot],
  );

  const bboEngineClientAgeMs = useMemo(() => {
    const updatedAt =
      effectiveBboMarket === "perp" ? perpDataUpdatedAt : spotDataUpdatedAt;
    if (updatedAt > 0) return Math.max(0, Date.now() - updatedAt);
    return effectiveBboMarket === "perp" ? perpAgeMs : spotAgeMs;
  }, [
    effectiveBboMarket,
    perpDataUpdatedAt,
    spotDataUpdatedAt,
    perpAgeMs,
    spotAgeMs,
  ]);

  const domBboFresh = useMemo(() => {
    if (!domBboRaw || !isBboValid(domBboRaw.bestBid, domBboRaw.bestAsk)) return false;
    const feedMatchesMarket = orderbookFeedMarket === effectiveBboMarket;
    const feedFresh = feedMatchesMarket && !isOrderbookStale(orderbookAgeMs);
    if (!useEngineRenderer) return feedFresh;
    const engineFresh = !isOrderbookStale(bboEngineClientAgeMs);
    return feedFresh || engineFresh;
  }, [
    domBboRaw,
    orderbookFeedMarket,
    effectiveBboMarket,
    orderbookAgeMs,
    useEngineRenderer,
    bboEngineClientAgeMs,
  ]);

  const domBbo = domBboFresh ? domBboRaw : null;

  const bboFeaturesEnabled =
    visualSettings.layout.showHistoricalBboPath ||
    visualSettings.layout.showBidAskLines;

  const bboHistory = useBookmapBboHistory({
    symbol,
    market: effectiveBboMarket,
    enabled: USE_BOOKMAP_ENGINE && bboFeaturesEnabled,
  });

  const bboMarketDebug = useBookmapBboMarketDebug(
    symbol,
    import.meta.env.DEV && USE_BOOKMAP_ENGINE,
  );

  const bothModeDivergence =
    sourceMode === "both" && visualSettings.divergence.enabled;
  const spotTradeSummaryQuery = useBookmapMarketTradeSummary(
    symbol,
    "spot",
    bothModeDivergence,
  );
  const perpTradeSummaryQuery = useBookmapMarketTradeSummary(
    symbol,
    "perp",
    bothModeDivergence,
  );

  useEffect(() => {
    if (!domBboFresh || !domBbo) return;
    const ts =
      bboDomState?.timestamp ??
      (bboDomSnapshot?.ts != null && Number.isFinite(bboDomSnapshot.ts)
        ? bboDomSnapshot.ts
        : Date.now());
    bboHistory.appendLiveBbo(domBbo.bestBid, domBbo.bestAsk, ts);
  }, [
    domBbo,
    domBboFresh,
    bboDomState?.timestamp,
    bboDomSnapshot?.ts,
    bboHistory.appendLiveBbo,
  ]);

  const perpLiveStale =
    activeDomMarket === "perp" &&
    (perpBookmapStale || isOrderbookStale(orderbookAgeMs) || isOrderbookStale(perpAgeMs));

  const trades = getRecentTrades();

  const tradeDotsEnabled =
    useEngineRenderer &&
    showTrades &&
    visualSettings.trades.enabled &&
    ENABLE_BOOKMAP_TRADE_DOTS;

  const deltaPanelEnabled = showTrades && ENABLE_BOOKMAP_DELTA_VOLUME;
  const tradeAggEnabled = tradeDotsEnabled || deltaPanelEnabled;

  const bookmapTradeAgg = useBookmapTrades(trades, tradeTick, tradeVersion, {
    enabled: tradeAggEnabled,
    scope: "session",
  });

  const cvdSamples = useMemo(
    () => bookmapTradeAgg.buckets.map((b) => b.cvd),
    [bookmapTradeAgg.buckets],
  );

  const bookMid = useMemo(() => getBookMidFromSnapshot(latest), [latest]);

  const perpBookMid = useMemo(() => {
    if (!effectivePerp?.bids.length || !effectivePerp?.asks.length) return null;
    const bestBid = effectivePerp.bids[0]?.price;
    const bestAsk = effectivePerp.asks[0]?.price;
    if (
      !Number.isFinite(bestBid) ||
      !Number.isFinite(bestAsk) ||
      bestBid! <= 0 ||
      bestAsk! <= 0 ||
      bestAsk! < bestBid!
    ) {
      return null;
    }
    return (bestBid! + bestAsk!) / 2;
  }, [effectivePerp]);

  /** Never use a hardcoded 70k fallback — anchor ladder to ticker or book mid. */
  const priceReference = useMemo(() => {
    if (isPosFinitePrice(tickerSpot)) return tickerSpot;
    if (isPosFinitePrice(bookMid)) return bookMid;
    return null;
  }, [tickerSpot, bookMid]);

  const priceCenterMid = useMemo(
    () =>
      resolveBookmapPriceCenterMid({
        bestBid: domBbo?.bestBid,
        bestAsk: domBbo?.bestAsk,
        priceReference,
        bookMid,
      }),
    [domBbo, priceReference, bookMid],
  );

  const priceScaleAnchor = priceCenterMid.midPrice;

  const engineWalls = useMemo(() => {
    if (!effectiveDomState) return [];
    return [
      ...effectiveDomState.importantWalls,
      ...effectiveDomState.structuralWalls,
      ...effectiveDomState.majorWalls,
    ];
  }, [effectiveDomState]);

  const engineBookLevels = useMemo(() => {
    if (!effectiveDomState) return [];
    return [...effectiveDomState.bids, ...effectiveDomState.asks];
  }, [effectiveDomState]);

  const priceScale = useBookmapPriceScale({
    spot: priceScaleAnchor,
    plotHeight: heatmapPlotHeight > 20 ? heatmapPlotHeight : 400,
    localRangeUsd,
    depthRangePreset,
    walls: engineWalls,
    bookLevels: engineBookLevels,
    followSpot: ladderAutoCenter,
  });

  const applyDepthPreset = useCallback(
    (preset: DepthRangePreset) => {
      hasUserAdjustedPriceViewportRef.current = true;
      updatePrefs({
        depthRangePreset: preset,
        bookmapViewMode: depthPresetToLegacyViewMode(preset),
      });
      priceScale.applyDepthRange(preset);
    },
    [updatePrefs, priceScale],
  );

  useEffect(() => {
    if (!USE_BOOKMAP_ENGINE) return;
    const mid = priceReference;
    if (!mid || mid <= 0) return;
    const min = priceScale.visibleMinPrice;
    const max = priceScale.visibleMaxPrice;
    const half = (max - min) / 2;
    const pct = Math.min(
      50,
      Math.max(BOOKMAP_ENGINE_PRICE_RANGE_PCT, (half / mid) * 100 * 1.15),
    );

    const timer = window.setTimeout(() => {
      setEngineFetchBounds((prev) => {
        const unchanged =
          prev.priceMin === min &&
          prev.priceMax === max &&
          Math.abs(prev.priceRangePct - pct) < 0.3;
        if (unchanged) return prev;
        return { priceMin: min, priceMax: max, priceRangePct: pct };
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    priceScale.visibleMinPrice,
    priceScale.visibleMaxPrice,
    priceReference,
  ]);

  const domWallEntries = useMemo(
    () =>
      useEngineRenderer
        ? bookLevelsToDomWallEntries(engineWalls, priceScale.domBucketSize)
        : [],
    [useEngineRenderer, engineWalls, priceScale.domBucketSize],
  );

  const engineBookForDom = useMemo(() => {
    if (!useEngineRenderer || !effectiveDomState) return undefined;
    return {
      bids: effectiveDomState.bids,
      asks: effectiveDomState.asks,
      importantWalls: effectiveDomState.importantWalls,
      structuralWalls: effectiveDomState.structuralWalls,
      majorWalls: effectiveDomState.majorWalls,
      heatmapCells: effectiveDomState.heatmapCells,
    };
  }, [useEngineRenderer, effectiveDomState]);

  useEffect(() => {
    if (!import.meta.env.DEV || !engineBookForDom) return;
    auditLowerDomDepth({
      visibleMinPrice: priceScale.visibleMinPrice,
      visibleMaxPrice: priceScale.visibleMaxPrice,
      domBucketSize: priceScale.domBucketSize,
      spot: priceReference ?? tickerSpot,
      requestedIncludeStale: true,
      engineBook: engineBookForDom,
    });
  }, [
    engineBookForDom,
    priceScale.visibleMinPrice,
    priceScale.visibleMaxPrice,
    priceScale.domBucketSize,
    priceReference,
    tickerSpot,
  ]);

  const priceRange = priceScale.priceRange;

  const tradeDotVisual: TradeDotVisualContext = useMemo(
    () => ({
      settings: visualSettings,
      spot: priceReference ?? tickerSpot,
      visibleLow: priceRange.minPrice,
      visibleHigh: priceRange.maxPrice,
    }),
    [
      visualSettings,
      priceReference,
      tickerSpot,
      priceRange.minPrice,
      priceRange.maxPrice,
    ],
  );

  useEffect(() => {
    const pct = visualSettings.layout.rightSpacePct;
    const snapped = RIGHT_SPACE_PCT_OPTIONS.reduce((best, o) =>
      Math.abs(o - pct) < Math.abs(best - pct) ? o : best,
    );
    updatePrefs({
      showTrades: visualSettings.trades.enabled,
      showPersistentWalls: visualSettings.liquidity.persistenceEnabled,
      showImportantFarLevels: visualSettings.liquidity.showAllImportantWalls,
      majorWallsOnly: !visualSettings.liquidity.showMajorWalls,
      minVisibleBtc: visualSettings.liquidity.minWallSizeBtc,
      rightSpacePct: snapped,
    });
  }, [visualSettings, updatePrefs]);

  const liveDomOverlay = useMemo(() => {
    if (orderbookFeedMarket !== activeDomMarket || !latestLegacy) return null;
    if (latestLegacy.bids.length === 0 && latestLegacy.asks.length === 0) return null;
    return {
      levels: liquiditySnapshotToLiveDomLevels(latestLegacy),
      timestamp: latestLegacy.ts,
    };
  }, [orderbookFeedMarket, activeDomMarket, latestLegacy, orderbookReceivedAt]);

  const prepareBands = useCallback(
    (state: BookmapState | null) => {
      if (!state) return null;
      if (
        !state.heatmapCells.length &&
        state.bids.length === 0 &&
        state.asks.length === 0
      ) {
        return null;
      }
      return prepareEngineRenderData(
        state,
        priceRange.minPrice,
        priceRange.maxPrice,
        priceScale.heatmapBucketSize,
        priceScale.domBucketSize,
        undefined,
        priceScale.labelStep,
        priceScale.domBucketSize,
        priceReference ?? tickerSpot,
        priceScale.verticalMode,
        {
          liveDomBook: liveDomOverlay?.levels,
          liveDomTimestamp: liveDomOverlay?.timestamp,
        },
      );
    },
    [
      priceRange.minPrice,
      priceRange.maxPrice,
      priceScale.heatmapBucketSize,
      priceScale.domBucketSize,
      priceScale.labelStep,
      priceScale.verticalMode,
      priceReference,
      tickerSpot,
      liveDomOverlay,
    ],
  );

  const engineRenderBase = useMemo(() => {
    if (!useEngineRenderer || !primaryHeatmapState) return null;
    return prepareBands(primaryHeatmapState);
  }, [useEngineRenderer, primaryHeatmapState, prepareBands, liveDomOverlay]);

  const engineOverlayBase = useMemo(() => {
    if (!useEngineRenderer || sourceMode !== "both" || !overlayHeatmapState) return null;
    return prepareBands(overlayHeatmapState);
  }, [useEngineRenderer, sourceMode, overlayHeatmapState, prepareBands]);

  const effectiveRightSpacePct = visualSettings.layout.rightSpacePct;

  const timeScale = useBookmapTimeScale({
    dataStartTime: engineRenderBase?.timeMin ?? Date.now() - 900_000,
    dataEndTime: engineRenderBase?.timeMax ?? Date.now(),
    rightSpacePct: effectiveRightSpacePct,
    plotWidth: heatmapPlotWidth,
    enabled: Boolean(useEngineRenderer && engineRenderBase),
  });

  const logPriceCenterDiag = useCallback(
    (payload: {
      reason: string;
      activeDomMarket: string;
      sourceMode: string;
      midPrice: number | null;
      bestBid: number | null;
      bestAsk: number | null;
      previousMinPrice: number;
      previousMaxPrice: number;
      nextMinPrice: number;
      nextMaxPrice: number;
      autoCentered: boolean;
      skippedBecauseUserAdjusted: boolean;
      skippedBecauseNoPrice: boolean;
      skippedBecauseAlreadyInView: boolean;
      followLive: boolean;
      depthSetting: DepthRangePreset;
      priceCenterSource: BookmapPriceCenterSource;
    }) => {
      if (!import.meta.env.DEV) return;
      console.debug("[BOOKMAP_PRICE_CENTER_DIAG]", payload);
    },
    [],
  );

  const tryAutoCenterPriceViewport = useCallback(
    (reason: string) => {
      const previousMinPrice = priceScale.visibleMinPrice;
      const previousMaxPrice = priceScale.visibleMaxPrice;
      const contextKey = `${sourceMode}:${activeDomMarket}`;
      const baseDiag = {
        reason,
        activeDomMarket,
        sourceMode,
        midPrice: priceCenterMid.midPrice,
        bestBid: priceCenterMid.bestBid,
        bestAsk: priceCenterMid.bestAsk,
        previousMinPrice,
        previousMaxPrice,
        followLive: timeScale.followLive,
        depthSetting: depthRangePreset,
        priceCenterSource: priceCenterMid.source,
      };

      if (hasUserAdjustedPriceViewportRef.current) {
        logPriceCenterDiag({
          ...baseDiag,
          nextMinPrice: previousMinPrice,
          nextMaxPrice: previousMaxPrice,
          autoCentered: false,
          skippedBecauseUserAdjusted: true,
          skippedBecauseNoPrice: false,
          skippedBecauseAlreadyInView: false,
        });
        return;
      }

      if (!isPosFinitePrice(priceCenterMid.midPrice)) {
        logPriceCenterDiag({
          ...baseDiag,
          nextMinPrice: previousMinPrice,
          nextMaxPrice: previousMaxPrice,
          autoCentered: false,
          skippedBecauseUserAdjusted: false,
          skippedBecauseNoPrice: true,
          skippedBecauseAlreadyInView: false,
        });
        return;
      }

      const span = Math.max(1, previousMaxPrice - previousMinPrice);
      const edgeMargin = span * 0.1;
      const comfortablyInView =
        priceCenterMid.midPrice >= previousMinPrice + edgeMargin &&
        priceCenterMid.midPrice <= previousMaxPrice - edgeMargin;
      const contextChanged = lastPriceCenterContextRef.current !== contextKey;

      if (
        comfortablyInView &&
        !contextChanged &&
        reason !== "panel_open" &&
        reason !== "price_available"
      ) {
        logPriceCenterDiag({
          ...baseDiag,
          nextMinPrice: previousMinPrice,
          nextMaxPrice: previousMaxPrice,
          autoCentered: false,
          skippedBecauseUserAdjusted: false,
          skippedBecauseNoPrice: false,
          skippedBecauseAlreadyInView: true,
        });
        return;
      }

      priceScale.resetToSpot();
      lastPriceCenterContextRef.current = contextKey;
      const nextRange = computeDepthRangeFromPreset(
        depthRangePreset,
        priceCenterMid.midPrice,
        engineWalls,
        localRangeUsd,
        engineBookLevels,
      );
      logPriceCenterDiag({
        ...baseDiag,
        nextMinPrice: nextRange.minPrice,
        nextMaxPrice: nextRange.maxPrice,
        autoCentered: true,
        skippedBecauseUserAdjusted: false,
        skippedBecauseNoPrice: false,
        skippedBecauseAlreadyInView: false,
      });
    },
    [
      activeDomMarket,
      depthRangePreset,
      engineBookLevels,
      engineWalls,
      localRangeUsd,
      logPriceCenterDiag,
      priceCenterMid,
      priceScale,
      sourceMode,
      timeScale.followLive,
    ],
  );

  useEffect(() => {
    if (heatmapPlotHeight <= 20) return;
    const contextKey = `${sourceMode}:${activeDomMarket}`;
    const reason =
      lastPriceCenterContextRef.current === null
        ? "panel_open"
        : lastPriceCenterContextRef.current !== contextKey
          ? "source_change"
          : "price_available";
    tryAutoCenterPriceViewport(reason);
  }, [
    activeDomMarket,
    heatmapPlotHeight,
    priceScaleAnchor,
    sourceMode,
    tryAutoCenterPriceViewport,
  ]);

  const bboPathDebug = useMemo(() => {
    const pts = bboHistory.points;
    const visible = downsampleBboPointsForViewport(
      pts,
      timeScale.viewport.visibleStartTime,
      timeScale.viewport.visibleEndTime,
      priceRange.minPrice,
      priceRange.maxPrice,
      Math.min(2000, Math.max(64, Math.floor(heatmapPlotWidth))),
    );
    return {
      totalPoints: pts.length,
      visiblePoints: visible.length,
      renderedSegments: Math.max(0, visible.length - 1) * 2,
    };
  }, [
    bboHistory.points,
    bboHistory.clientVersion,
    timeScale.viewport.visibleStartTime,
    timeScale.viewport.visibleEndTime,
    priceRange.minPrice,
    priceRange.maxPrice,
    heatmapPlotWidth,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[BOOKMAP_BBO_MARKET]", {
      sourceMode,
      domSource,
      effectiveBboMarket,
      historicalPoints: bboPathDebug.totalPoints,
      latestBboAgeMs: bboHistory.latestAgeMs,
      bestBid: domBbo?.bestBid ?? null,
      bestAsk: domBbo?.bestAsk ?? null,
      bboValid: domBboFresh,
    });
  }, [
    sourceMode,
    domSource,
    effectiveBboMarket,
    bboPathDebug.totalPoints,
    bboHistory.latestAgeMs,
    domBbo,
    domBboFresh,
  ]);

  const divergenceResult = useMemo(() => {
    if (!bothModeDivergence || !effectiveSpot || !effectivePerp) {
      return {
        signals: [],
        debug: {
          candidates: 0,
          filteredByDistance: 0,
          filteredByPersistence: 0,
          filteredByStrength: 0,
          filteredByType: 0,
          duplicateSuppressed: 0,
          filteredByCooldown: 0,
          filtered: 0,
          activeSignals: 0,
          rejectedLowConfidence: 0,
          strongestSignal: null,
        },
      };
    }
    return detectSpotPerpDivergence({
      spotState: effectiveSpot,
      perpState: effectivePerp,
      spotAggression: spotTradeSummaryQuery.summary,
      perpAggression: perpTradeSummaryQuery.summary,
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      spotPrice: tickerSpot ?? priceReference,
      perpPrice: perpBookMid ?? priceReference ?? tickerSpot,
      domBucketSize: priceScale.domBucketSize,
      filterPrefs: {
        passiveLiquidity: visualSettings.divergence.passiveLiquidity,
        aggressionDivergence: visualSettings.divergence.aggressionDivergence,
        confluenceSignals: visualSettings.divergence.confluenceSignals,
      },
    });
  }, [
    bothModeDivergence,
    effectiveSpot,
    effectivePerp,
    spotTradeSummaryQuery.summary,
    perpTradeSummaryQuery.summary,
    priceRange.minPrice,
    priceRange.maxPrice,
    tickerSpot,
    priceReference,
    perpBookMid,
    priceScale.domBucketSize,
    visualSettings.divergence.passiveLiquidity,
    visualSettings.divergence.aggressionDivergence,
    visualSettings.divergence.confluenceSignals,
  ]);

  useEffect(() => {
    if (!bothModeDivergence) resetDivergenceCooldown();
  }, [bothModeDivergence]);

  const divergenceDisplaySignals = useMemo(
    () =>
      filterDivergenceSignals(
        divergenceResult.signals,
        visualSettings.divergence.minSeverity,
      ),
    [divergenceResult.signals, visualSettings.divergence.minSeverity],
  );

  const divergenceMarkerSignals = useMemo(() => {
    if (!bothModeDivergence || !visualSettings.divergence.showChartMarkers) return [];
    return divergenceDisplaySignals.filter((s) => s.severity === "high").slice(0, 3);
  }, [
    bothModeDivergence,
    visualSettings.divergence.showChartMarkers,
    divergenceDisplaySignals,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !bothModeDivergence) return;
    console.debug("[SPOT_PERP_DIVERGENCE_QUALITY]", divergenceResult.debug);
  }, [bothModeDivergence, divergenceResult.debug]);

  const normalizeBands = useCallback(
    (base: ReturnType<typeof prepareEngineRenderData>) => {
      if (!base) return null;
      const visiblePriceRange = priceRange.maxPrice - priceRange.minPrice;
      const viewportMs =
        timeScale.viewport.visibleEndTime - timeScale.viewport.visibleStartTime;
      const plotW = Math.max(
        0,
        heatmapPlotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right,
      );
      const plotH = Math.max(
        0,
        heatmapPlotHeight - HEATMAP_PAD.top - HEATMAP_PAD.bottom,
      );
      const pxPerSample =
        viewportMs > 0 && plotW > 0
          ? plotW / (viewportMs / BOOKMAP_TEXTURE_SAMPLER_MS)
          : undefined;
      const pxPerPriceBucket =
        visiblePriceRange > 0 &&
        plotH > 0 &&
        priceScale.heatmapBucketSize > 0
          ? plotH / (visiblePriceRange / priceScale.heatmapBucketSize)
          : undefined;

      const microContext =
        priceScale.verticalMode === "micro" ||
        visiblePriceRange <= 1_500 ||
        priceScale.labelStep <= 50 ||
        priceScale.heatmapBucketSize <= 25;
      let data = base;
      if (microContext) {
        data = applyEngineViewportBandNormalization(base, {
          minPrice: priceRange.minPrice,
          maxPrice: priceRange.maxPrice,
          visibleStartTime: timeScale.viewport.visibleStartTime,
          visibleEndTime: timeScale.viewport.visibleEndTime,
          verticalCompressionMode: priceScale.verticalMode,
          spotPrice: priceReference ?? tickerSpot,
        });
      }
      const calibrated = applyMicroScalpTextureCalibration(data, {
        verticalMode: priceScale.verticalMode,
        visiblePriceRange,
        pxPerSample,
        pxPerPriceBucket,
        spotPrice: priceReference ?? tickerSpot,
        minPrice: priceRange.minPrice,
        maxPrice: priceRange.maxPrice,
        visibleStartTime: timeScale.viewport.visibleStartTime,
        visibleEndTime: timeScale.viewport.visibleEndTime,
      });
      const locked = applyHistoricalTextureVisualLock(calibrated, {
        cache: historicalTextureVisualCacheRef.current,
        microScalpMode: calibrated.microScalpVisual?.microScalpMode,
        microVisualHierarchyActive:
          calibrated.microScalpVisual?.microVisualHierarchyActive,
        dataEndTime: timeScale.viewport.dataEndTime,
      });
      const domConfig = resolveLiveDomPriorityConfig(
        priceScale.verticalMode,
        visiblePriceRange,
      );
      return applyLiveDomVisualCache(locked, {
        cache: liveDomVisualCacheRef.current,
        config: domConfig,
        midPrice: priceReference ?? tickerSpot ?? null,
        spotPrice: priceReference ?? tickerSpot ?? null,
        frameStats: liveDomVisualFrameStatsRef.current,
      });
    },
    [
      priceRange.minPrice,
      priceRange.maxPrice,
      priceScale.verticalMode,
      priceScale.labelStep,
      priceScale.heatmapBucketSize,
      timeScale.viewport.visibleStartTime,
      timeScale.viewport.visibleEndTime,
      priceReference,
      tickerSpot,
      heatmapPlotWidth,
      heatmapPlotHeight,
    ],
  );

  const engineRenderData = useMemo(
    () => normalizeBands(engineRenderBase),
    [engineRenderBase, normalizeBands],
  );

  const engineOverlayRenderData = useMemo(
    () => normalizeBands(engineOverlayBase),
    [engineOverlayBase, normalizeBands],
  );

  const passiveConfluenceDetect = useMemo(() => {
    if (sourceMode !== "both" || !effectiveSpot || !effectivePerp) {
      return {
        levels: [] as PassiveConfluenceLevel[],
        debug: {
          candidateConfluences: 0,
          rejectedBySide: 0,
          rejectedByStrength: 0,
          rejectedByDistance: 0,
          rejectedByMinTier: 0,
          renderedConfluences: 0,
          strong: 0,
          major: 0,
        },
      };
    }
    return detectPassiveConfluence({
      spotState: effectiveSpot,
      perpState: effectivePerp,
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      heatmapBucketSize: priceScale.heatmapBucketSize,
      domBucketSize: priceScale.domBucketSize,
      verticalMode: priceScale.verticalMode,
      prefs: confluencePrefs,
    });
  }, [
    sourceMode,
    effectiveSpot,
    effectivePerp,
    priceRange.minPrice,
    priceRange.maxPrice,
    priceScale.heatmapBucketSize,
    priceScale.domBucketSize,
    priceScale.verticalMode,
    confluencePrefs,
  ]);

  const passiveConfluenceLevels = passiveConfluenceDetect.levels;
  const passiveConfluenceDebug = passiveConfluenceDetect.debug;

  const passiveConfluenceSummary = useMemo(
    () =>
      summarizePassiveConfluence(
        passiveConfluenceLevels,
        confluencePrefs.minDisplayTier,
        passiveConfluenceDebug,
      ),
    [passiveConfluenceLevels, confluencePrefs.minDisplayTier, passiveConfluenceDebug],
  );

  const confluenceRenderMode = useMemo(
    () => resolveConfluenceRenderMode(priceScale.verticalMode, depthRangePreset),
    [priceScale.verticalMode, depthRangePreset],
  );

  const dotFilterWindow = useMemo(() => {
    const latestBboTs =
      bboHistory.latestBbo?.timestamp ??
      (bboDomState?.timestamp != null && Number.isFinite(bboDomState.timestamp)
        ? bboDomState.timestamp
        : null);
    return resolveDotVisibleEndTime({
      market: activeTradeMarket,
      viewportStart: timeScale.viewport.visibleStartTime,
      viewportEnd: timeScale.viewport.visibleEndTime,
      latestBboTs,
      newestTradeTs: latestTradeTs,
      followLive: timeScale.followLive,
    });
  }, [
    activeTradeMarket,
    timeScale.followLive,
    timeScale.viewport.visibleStartTime,
    timeScale.viewport.visibleEndTime,
    bboHistory.latestBbo,
    bboDomState?.timestamp,
    bboHistory.clientVersion,
    latestTradeTs,
    tradeTick,
    tradeVersion,
  ]);

  const engineTradeDots = useMemo(() => {
    if (!tradeDotsEnabled) {
      return {
        dots: [],
        stats: {
          tradeCount: 0,
          visibleTrades: 0,
          dotCount: 0,
          groupedCount: 0,
          buyDots: 0,
          sellDots: 0,
          dotRadiusMin: 0,
          dotRadiusMax: 0,
          clusterMs: 0,
          rejectedTooOld: 0,
          rejectedTooNew: 0,
          rejectedTooSmall: 0,
          rejectedBelowPrice: 0,
          rejectedAbovePrice: 0,
          dotMinBtc: 0,
        },
      };
    }
    return prepareEngineTradeDots({
      trades: bookmapTradeAgg.trades,
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      visibleStartTime: dotFilterWindow.dotVisibleStartTime,
      visibleEndTime: dotFilterWindow.dotVisibleEndTime,
      verticalMode: priceScale.verticalMode,
      heatmapBucketSize: priceScale.heatmapBucketSize,
      domBucketSize: priceScale.domBucketSize,
      market: activeTradeMarket,
      visual: tradeDotVisual,
    });
  }, [
    tradeDotsEnabled,
    bookmapTradeAgg.trades,
    tradeTick,
    tradeVersion,
    bookmapTradeAgg.summary.tradeCount,
    priceRange.minPrice,
    priceRange.maxPrice,
    dotFilterWindow.dotVisibleStartTime,
    dotFilterWindow.dotVisibleEndTime,
    timeScale.followLive,
    timeScale.horizontalOffsetMs,
    priceScale.verticalMode,
    priceScale.heatmapBucketSize,
    priceScale.domBucketSize,
    tradeDotVisual,
    activeTradeMarket,
    sourceMode,
    tradeSource,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const logForensicState = () => {
      const now = Date.now();
      let newestDotTs: number | null = null;
      let oldestDotTs: number | null = null;
      for (const d of engineTradeDots.dots) {
        if (newestDotTs == null || d.timestamp > newestDotTs) {
          newestDotTs = d.timestamp;
        }
        if (oldestDotTs == null || d.timestamp < oldestDotTs) {
          oldestDotTs = d.timestamp;
        }
      }
      const latestBboTs =
        bboHistory.latestBbo?.timestamp ??
        (bboDomState?.timestamp != null && Number.isFinite(bboDomState.timestamp)
          ? bboDomState.timestamp
          : null);
      let skippedReason = "none";
      if (!tradeDotsEnabled) {
        skippedReason = "disabled";
      } else if (engineTradeDots.stats.dotCount === 0) {
        if (!bookmapTradeAgg.trades.length) skippedReason = "no_trades";
        else if (engineTradeDots.stats.visibleTrades === 0) skippedReason = "filter";
        else skippedReason = "cluster_cap";
      } else if (forensicDrawRef.current.rendererDrawnDotsCount === 0) {
        skippedReason = "renderer_clip";
      }

      console.debug("[BOOKMAP_FORENSIC_STATE]", {
        sourceMode,
        domSource,
        tradeSource,
        activeTradeMarket,
        engineRequested,
        legacyRendered: forensicDrawRef.current.legacyRendered,
        renderedLayerNames: forensicDrawRef.current.renderedLayerNames.join(","),
        now,
        latestBboTs,
        latestBboAgeMs:
          latestBboTs != null ? Math.max(0, now - latestBboTs) : null,
        newestTradeTs: latestTradeTs,
        newestTradeAgeMs:
          latestTradeTs != null ? Math.max(0, now - latestTradeTs) : null,
        liveEdgeTs: dotFilterWindow.liveEdgeTs,
        liveEdgeSource: dotFilterWindow.liveEdgeSource,
        viewportStart: timeScale.viewport.visibleStartTime,
        viewportEnd: timeScale.viewport.visibleEndTime,
        dotWindowStart: dotFilterWindow.dotVisibleStartTime,
        dotWindowEnd: dotFilterWindow.dotVisibleEndTime,
        perpLiveStartApplied: dotFilterWindow.perpLiveStartApplied,
        perpEndToleranceApplied: dotFilterWindow.perpEndToleranceApplied,
        dotWindowDurationMs:
          dotFilterWindow.dotVisibleEndTime - dotFilterWindow.dotVisibleStartTime,
        selectedTradesCount: bookmapTradeAgg.trades.length,
        rejectedTooOld: engineTradeDots.stats.rejectedTooOld,
        rejectedTooNew: engineTradeDots.stats.rejectedTooNew,
        rejectedTooSmall: engineTradeDots.stats.rejectedTooSmall,
        rejectedBelowPrice: engineTradeDots.stats.rejectedBelowPrice,
        rejectedAbovePrice: engineTradeDots.stats.rejectedAbovePrice,
        passedFilterCount: engineTradeDots.stats.visibleTrades,
        dotMinBtc: engineTradeDots.stats.dotMinBtc,
        engineDotsCount: engineTradeDots.stats.dotCount,
        newestDotTs,
        newestDotAgeMs:
          newestDotTs != null ? Math.max(0, now - newestDotTs) : null,
        oldestDotTs,
        skippedReason,
        rendererReceivedDotsCount: forensicDrawRef.current.rendererReceivedDotsCount,
        rendererDrawnDotsCount: forensicDrawRef.current.rendererDrawnDotsCount,
        rendererClippedTimeCount: forensicDrawRef.current.rendererClippedTimeCount,
        rendererClippedPriceCount: forensicDrawRef.current.rendererClippedPriceCount,
      });
    };

    logForensicState();
    const id = window.setInterval(logForensicState, 2000);
    return () => window.clearInterval(id);
  }, [
    sourceMode,
    domSource,
    tradeSource,
    activeTradeMarket,
    engineRequested,
    useEngineRenderer,
    engineRenderData,
    legacyDebugEnabled,
    engineRenderBase,
    timeScale.viewport.visibleStartTime,
    timeScale.viewport.visibleEndTime,
    dotFilterWindow.dotVisibleStartTime,
    dotFilterWindow.dotVisibleEndTime,
    dotFilterWindow.liveEdgeTs,
    dotFilterWindow.liveEdgeSource,
    dotFilterWindow.perpLiveStartApplied,
    dotFilterWindow.perpEndToleranceApplied,
    bookmapTradeAgg.trades,
    engineTradeDots.dots,
    engineTradeDots.stats.visibleTrades,
    engineTradeDots.stats.dotCount,
    engineTradeDots.stats.rejectedTooOld,
    engineTradeDots.stats.rejectedTooNew,
    engineTradeDots.stats.rejectedTooSmall,
    engineTradeDots.stats.rejectedBelowPrice,
    engineTradeDots.stats.rejectedAbovePrice,
    latestTradeTs,
    tradeDotsEnabled,
    bboHistory.latestBbo,
    bboDomState?.timestamp,
    tradeVersion,
    tradeTick,
  ]);

  useEffect(() => {
    const heatmapCells = engineRenderData?.cells?.length ?? primaryHeatmapState?.heatmapCells.length ?? 0;
    const textureCells = engineRenderData?.textureCells?.length ?? 0;
    const liveProjectionLevels = engineRenderData?.liveProjectionLevels?.length ?? 0;
    const hasOrderbook = Boolean(
      (effectiveDomState?.bids.length ?? 0) > 0 && (effectiveDomState?.asks.length ?? 0) > 0,
    );
    const hasTrades = tradeBufferCount > 0 || receivedTradeCount > 0;
    const reasonIfEmpty = !hasOrderbook
      ? "no_orderbook"
      : !hasRenderableHeatmap && heatmapCells === 0
        ? "no_engine_heatmap"
        : !hasTrades
          ? "no_trades"
          : null;

    logBookmapFrontendDataDiag({
      selectedSource: sourceMode,
      effectiveSource,
      activeTradeMarket,
      hasEnginePayload: Boolean(engineRenderData),
      heatmapCells,
      textureCells,
      liveProjectionLevels,
      tradeDots: engineTradeDots.stats.dotCount,
      status: feedStatus,
      error: bookmapEngineError instanceof Error ? bookmapEngineError.message : null,
      timestampAgeMs: bookmapAgeMs,
      spotAvailable,
      perpAvailable,
    });

    logBookmapRailwayEnableAudit({
      ok: hasOrderbook && (heatmapCells > 0 || snapshotCount > 0) && (hasTrades || feedStatus === "live"),
      selectedSource: sourceMode,
      effectiveSource,
      spotAvailable,
      perpAvailable,
      hasOrderbook,
      hasTrades,
      heatmapCells,
      liveProjectionLevels,
      tradeDots: engineTradeDots.stats.dotCount,
      reasonIfEmpty,
    });
  }, [
    sourceMode,
    effectiveSource,
    activeTradeMarket,
    engineRenderData,
    primaryHeatmapState,
    effectiveDomState,
    engineTradeDots.stats.dotCount,
    feedStatus,
    bookmapEngineError,
    bookmapAgeMs,
    spotAvailable,
    perpAvailable,
    hasRenderableHeatmap,
    snapshotCount,
    tradeBufferCount,
    receivedTradeCount,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const now = Date.now();
    if (now - lastLayerAuditAtRef.current < 2_000) return;
    lastLayerAuditAtRef.current = now;

    const engineAudit = layerAuditSinkRef.current.audit;
    const audit = buildBookmapLayerAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: priceScale.verticalMode,
      legacyRendererActive: forensicDrawRef.current.legacyRendered,
      engineRendererActive: Boolean(useEngineRenderer && engineRenderData),
      renderData: engineRenderData ?? undefined,
      renderedLayerOrder:
        engineAudit?.renderedLayerOrder ??
        forensicDrawRef.current.renderedLayerNames,
      renderedHistoricalTextureCount:
        engineAudit?.renderedHistoricalTextureCount ??
        textureRenderStatsRef.current.renderedTextureCellCount,
      renderedHistoricalFootprintCount:
        engineAudit?.renderedHistoricalFootprintCount ?? 0,
      renderedLiveProjectionCount:
        engineAudit?.renderedLiveProjectionCount ??
        liveProjectionRenderStatsRef.current.renderedLiveProjectionCount,
      renderedWallBandCount:
        engineAudit?.renderedWallBandCount ?? engineRenderData?.bands.length ?? 0,
      executionOverlayActive: executionOrderLines.length > 0,
      tradeDotsActive: tradeDotsEnabled && engineTradeDots.stats.dotCount > 0,
      currentBookAnchorsInPrepare: false,
    });
    console.debug("[BOOKMAP_LAYER_AUDIT]", audit);
  }, [
    activeDomMarket,
    sourceMode,
    priceScale.verticalMode,
    useEngineRenderer,
    engineRenderData,
    executionOrderLines.length,
    tradeDotsEnabled,
    engineTradeDots.stats.dotCount,
    bookmapAgeMs,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !useEngineRenderer) return;
    const now = Date.now();
    if (now - lastMicroScalpLayerAuditAtRef.current < 2_000) return;
    lastMicroScalpLayerAuditAtRef.current = now;

    const tv = timeScale.viewport;
    const plotW = heatmapPlotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right;
    const rightSideWidthPx = Math.max(0, plotW * (tv.rightSpacePct / 100));

    const audit = buildBookmapMicroScalpLayerAudit({
      market: activeDomMarket,
      sourceMode,
      domSource,
      tradeSource,
      verticalMode: priceScale.verticalMode,
      spotPrice: priceCenterMid.midPrice,
      selection: engineRenderData?.liveDomSelection ?? null,
      renderData: engineRenderData ?? null,
      timeViewport: tv,
      rightSideWidthPx,
      renderStats: microScalpLayerAuditSinkRef.current.stats,
      historicalTextureRendered:
        textureRenderStatsRef.current.renderedTextureCellCount,
      wallBandsRendered: engineRenderData?.bands.length ?? 0,
    });
    console.debug("[BOOKMAP_MICRO_SCALP_LAYER_AUDIT]", audit);
  }, [
    useEngineRenderer,
    activeDomMarket,
    sourceMode,
    domSource,
    tradeSource,
    priceScale.verticalMode,
    priceCenterMid.midPrice,
    engineRenderData,
    timeScale.viewport,
    heatmapPlotWidth,
    bookmapAgeMs,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !useEngineRenderer) return;
    const now = Date.now();
    if (now - lastRenderArchitectureAuditAtRef.current < 2_000) return;
    lastRenderArchitectureAuditAtRef.current = now;

    const tv = timeScale.viewport;
    const plotW = heatmapPlotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right;
    const rightSideWidthPx = Math.max(0, plotW * (tv.rightSpacePct / 100));
    const selection = engineRenderData?.liveDomSelection ?? null;

    const architectureAudit = buildBookmapRenderArchitectureAudit({
      market: activeDomMarket,
      sourceMode,
      domSource,
      tradeSource,
      verticalMode: priceScale.verticalMode,
      spotPrice: priceCenterMid.midPrice,
      bestBid: selection?.bestBid ?? null,
      bestAsk: selection?.bestAsk ?? null,
      timeViewport: tv,
      rightSideWidthPx,
      renderData: engineRenderData ?? null,
      frameStats: renderArchitectureFrameStatsRef.current,
      microStats: microScalpLayerAuditSinkRef.current.stats,
      l2Continuity: l2BandContinuityTruthRef.current,
      currentBookAnchorsInPrepare: false,
    });
    console.debug("[BOOKMAP_RENDER_ARCHITECTURE_AUDIT]", architectureAudit);

    const continuityAudit = buildBookmapLeftRightContinuityAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: priceScale.verticalMode,
      timeViewport: tv,
      renderData: engineRenderData ?? null,
      microStats: microScalpLayerAuditSinkRef.current.stats,
      frameStats: renderArchitectureFrameStatsRef.current,
    });
    console.debug("[BOOKMAP_LEFT_RIGHT_CONTINUITY_AUDIT]", continuityAudit);

    const densityAudit = buildBookmapRightSideDensityAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: priceScale.verticalMode,
      rightSideWidthPx,
      capture: renderArchitectureFrameStatsRef.current.rightSideDensityCapture,
      microStats: microScalpLayerAuditSinkRef.current.stats,
      frameStats: renderArchitectureFrameStatsRef.current,
      passiveBaseStats: getPassiveBaseTexturePrepareStats(),
    });
    console.debug("[BOOKMAP_RIGHT_SIDE_DENSITY_AUDIT]", densityAudit);
  }, [
    useEngineRenderer,
    activeDomMarket,
    sourceMode,
    domSource,
    tradeSource,
    priceScale.verticalMode,
    priceCenterMid.midPrice,
    engineRenderData,
    timeScale.viewport,
    heatmapPlotWidth,
    bookmapAgeMs,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !useEngineRenderer || !engineRenderData) return;
    const now = Date.now();
    if (now - lastRestingLiquidityAuditAtRef.current < 2_000) return;
    lastRestingLiquidityAuditAtRef.current = now;

    const tv = timeScale.viewport;
    const priceSpan = priceRange.maxPrice - priceRange.minPrice;
    const restingConfig = resolveRestingLiquidityWriteConfig(
      priceScale.verticalMode,
      priceSpan,
    );
    const domState = effectiveDomState ?? primaryHeatmapState;
    const bookLevels = domState
      ? resolveLiveDomBookLevels(
          domState,
          liveDomOverlay?.levels,
          liveDomOverlay?.timestamp,
        )
      : [];

    const lifecycleAudit = buildBookmapLiquidityLifecycleAudit({
      market: activeDomMarket,
      sourceMode,
      domSource,
      verticalMode: priceScale.verticalMode,
      spotPrice: priceCenterMid.midPrice,
      bestBid: engineRenderData.liveDomSelection?.bestBid ?? null,
      bestAsk: engineRenderData.liveDomSelection?.bestAsk ?? null,
      renderData: engineRenderData,
      bookLevels,
      config: restingConfig,
    });
    console.debug("[BOOKMAP_LIQUIDITY_LIFECYCLE_AUDIT]", lifecycleAudit);

    const passiveBaseStats = getPassiveBaseTexturePrepareStats();
    const textureIntegrationAudit = buildBookmapLifecycleTextureIntegrationAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: priceScale.verticalMode,
      spotPrice: priceCenterMid.midPrice,
      dataEndTime: tv.dataEndTime,
      lifecycleCacheSize: getLiquidityLifecycleCache().size,
      historicalTextureCellCount: engineRenderData.textureCells.length,
      lifecycleHistoricalWriteOk: lifecycleAudit.lifecycleHistoricalWriteOk,
      lifecycleFootprintOk: lifecycleAudit.lifecycleFootprintOk,
      passiveBaseStats,
    });
    console.debug(
      "[BOOKMAP_LIFECYCLE_TEXTURE_INTEGRATION_AUDIT]",
      textureIntegrationAudit,
    );

    const plotW = heatmapPlotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right;
    const rightSideWidthPx = Math.max(0, plotW * (tv.rightSpacePct / 100));
    const densityAudit = buildBookmapRightSideDensityAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: priceScale.verticalMode,
      rightSideWidthPx,
      capture: renderArchitectureFrameStatsRef.current.rightSideDensityCapture,
      microStats: microScalpLayerAuditSinkRef.current.stats,
      frameStats: renderArchitectureFrameStatsRef.current,
      passiveBaseStats,
    });

    const passiveBaseAudit = buildBookmapPassiveBaseTextureAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: priceScale.verticalMode,
      spotPrice: priceCenterMid.midPrice,
      dataEndTime: tv.dataEndTime,
      rawHeatmapCellCount:
        engineRenderData.restingLiquidityRawCells?.length ??
        domState?.heatmapCells?.length ??
        0,
      selectStats: getPassiveBaseTextureSelectStats(),
      prepareStats: passiveBaseStats,
      lifecycleBookmapLikeOk: textureIntegrationAudit.lifecycleBookmapLikeOk,
      rightSideBookmapProjectionOk: densityAudit.rightSideBookmapProjectionOk,
      lifecycleArtificialBandScore:
        textureIntegrationAudit.lifecycleArtificialBandScore,
      lifecycleLongFlatSpanCount:
        textureIntegrationAudit.lifecycleLongFlatSpanCount,
      rightSideUniformLengthScore: densityAudit.rightSideUniformLengthScore,
      liveProjectionMechanicalScore: densityAudit.liveProjectionMechanicalScore,
    });
    console.debug("[BOOKMAP_PASSIVE_BASE_TEXTURE_AUDIT]", passiveBaseAudit);

    const audit = buildBookmapRestingLiquidityLifecycleAudit({
      market: activeDomMarket,
      sourceMode,
      domSource,
      spotPrice: priceCenterMid.midPrice,
      dataEndTime: tv.dataEndTime,
      visibleEndTime: tv.visibleEndTime,
      rawHeatmapCells:
        engineRenderData.restingLiquidityRawCells ??
        domState?.heatmapCells ??
        [],
      renderData: engineRenderData,
      bookLevels,
      config: restingConfig,
    });
    console.debug("[BOOKMAP_RESTING_LIQUIDITY_LIFECYCLE_AUDIT]", audit);
  }, [
    useEngineRenderer,
    engineRenderData,
    activeDomMarket,
    sourceMode,
    domSource,
    priceCenterMid.midPrice,
    priceScale.verticalMode,
    priceRange.maxPrice,
    priceRange.minPrice,
    timeScale.viewport,
    effectiveDomState,
    primaryHeatmapState,
    liveDomOverlay,
    bookmapAgeMs,
  ]);

  const lastLiveDomStabilityAuditAtRef = useRef(0);
  useEffect(() => {
    if (!import.meta.env.DEV || !engineRenderData?.liveDomSelection) return;
    const now = Date.now();
    if (now - lastLiveDomStabilityAuditAtRef.current < 2_000) return;
    lastLiveDomStabilityAuditAtRef.current = now;

    const selection = engineRenderData.liveDomSelection;
    const renderedCount =
      engineRenderData.activeDomBands.length +
      engineRenderData.liveProjectionLevels.length;
    console.debug(
      "[BOOKMAP_LIVE_DOM_STABILITY_AUDIT]",
      buildLiveDomStabilityAudit({
        market: activeDomMarket,
        sourceMode,
        verticalMode: priceScale.verticalMode,
        spotPrice: priceReference ?? tickerSpot ?? null,
        bestBid: selection.bestBid,
        bestAsk: selection.bestAsk,
        currentDomLevelCount: selection.currentBookVisibleLevelsCount,
        selectedLiveDomLevelCount:
          selection.selectedActiveDomBandCount +
          selection.selectedLiveProjectionCount,
        renderedLiveDomLevelCount: renderedCount,
        frameStats: liveDomVisualFrameStatsRef.current,
        nearTickSelectedCount: selection.nearTickCount,
        topSizeSelectedCount: selection.topDomCount,
        wallSelectedCount: selection.wallCount,
        estimatedCoveragePct: selection.estimatedCoveragePct,
      }),
    );
  }, [
    engineRenderData,
    activeDomMarket,
    sourceMode,
    priceScale.verticalMode,
    priceReference,
    tickerSpot,
  ]);

  const lastLiveDomDiagAtRef = useRef(0);
  useEffect(() => {
    if (!import.meta.env.DEV || !engineRenderData?.liveDomSelection) return;
    const now = Date.now();
    if (now - lastLiveDomDiagAtRef.current < 2_000) return;
    lastLiveDomDiagAtRef.current = now;

    const selection = engineRenderData.liveDomSelection;
    const domTs = liveDomOverlay?.timestamp ?? effectiveDomState?.timestamp ?? null;
    console.debug(
      "[BOOKMAP_LIVE_DOM_PRIORITY_DIAG]",
      buildLiveDomPriorityDiag({
        market: activeDomMarket,
        sourceMode,
        domSource: domSource,
        tradeSource: tradeSource,
        spotPrice: priceReference ?? tickerSpot,
        visiblePriceMin: priceRange.minPrice,
        visiblePriceMax: priceRange.maxPrice,
        heatmapBucketSize: priceScale.heatmapBucketSize,
        selection,
        liveProjectionRenderedCount:
          liveProjectionRenderStatsRef.current.renderedLiveProjectionCount,
        wallBandCandidateCount: engineRenderData.stats.bandCount,
        wallBandRenderedCount: engineRenderData.stats.renderedBandCount,
        lastDomUpdateAgeMs:
          domTs != null ? Math.max(0, now - domTs) : orderbookAgeMs ?? null,
        lastRenderAgeMs: bookmapAgeMs,
        currentBookBidCount: selection ? engineRenderData.liveProjectionStats.currentBidLevelCount : 0,
        currentBookAskCount: selection ? engineRenderData.liveProjectionStats.currentAskLevelCount : 0,
      }),
    );
  }, [
    engineRenderData,
    activeDomMarket,
    sourceMode,
    domSource,
    tradeSource,
    priceReference,
    tickerSpot,
    priceRange.minPrice,
    priceRange.maxPrice,
    priceScale.heatmapBucketSize,
    liveDomOverlay,
    effectiveDomState?.timestamp,
    orderbookAgeMs,
    bookmapAgeMs,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logLimitHistoryState = () => {
      const spotCells = effectiveSpot?.heatmapCells ?? [];
      const perpCells = effectivePerp?.heatmapCells ?? [];
      const st = engineRenderData?.stats;
      const spotCoverageMs = heatmapCellsCoverageMs(spotCells);
      const perpCoverageMs = heatmapCellsCoverageMs(perpCells);
      console.debug("[BOOKMAP_LIMIT_HISTORY_STATE]", {
        sourceMode,
        activeDomMarket,
        spotEngineCellCount: spotCells.length,
        perpEngineCellCount: perpCells.length,
        spotEngineCoverageMs: spotCoverageMs,
        perpEngineCoverageMs: perpCoverageMs,
        spotSampledLevelsLastTick: 0,
        perpSampledLevelsLastTick: 0,
        spotSnapshotTickAgeMs: orderbookAgeMs ?? 0,
        perpSnapshotTickAgeMs: perpAgeMs ?? 0,
        renderedBandCount: st?.renderedBandCount ?? 0,
        renderedHistoricalBandCount: st?.rawCellCount ?? 0,
        currentOrderbookOnly: spotCoverageMs <= 500 && perpCoverageMs <= 500,
        historySamplerEnabled: true,
      });
    };
    logLimitHistoryState();
    const id = window.setInterval(logLimitHistoryState, 2_000);
    return () => window.clearInterval(id);
  }, [
    sourceMode,
    activeDomMarket,
    effectiveSpot,
    effectivePerp,
    engineRenderData,
    orderbookAgeMs,
    perpAgeMs,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logTextureDiag = () => {
      const diag = buildBookmapTextureDiag({
        sourceMode,
        activeDomMarket,
        renderData: engineRenderData,
        renderedTextureCellCount:
          textureRenderStatsRef.current.renderedTextureCellCount,
        textureDrawCapHit: textureRenderStatsRef.current.textureDrawCapHit,
        spotSampledLevelsLastTick: 0,
        perpSampledLevelsLastTick: 0,
      });
      const classification = classifyBookmapTextureDiag(diag, {
        spotSampledLevelsLastTick: 0,
        perpSampledLevelsLastTick: 0,
      });
      textureDiagRef.current = diag;
      console.debug("[BOOKMAP_TEXTURE_DIAG]", {
        ...diag,
        classification,
        texturePrepareCapHit: diag.texturePrepareCapHit ? "yes" : "no",
        textureDrawCapHit: diag.textureDrawCapHit ? "yes" : "no",
        samplerNote:
          "spotSampledLevelsLastTick/perpSampledLevelsLastTick: see server [BOOKMAP_LIMIT_HISTORY_STATE]",
      });
    };
    logTextureDiag();
    const id = window.setInterval(logTextureDiag, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket, engineRenderData]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logHistoryRetentionDiag = () => {
      const rawCells = primaryHeatmapState?.heatmapCells ?? [];
      const activeMarketState =
        activeDomMarket === "perp" ? effectivePerp : effectiveSpot;
      const currentBookLevelCount =
        (activeMarketState?.bids ?? []).filter((l) => !l.stale && l.size > 0)
          .length +
        (activeMarketState?.asks ?? []).filter((l) => !l.stale && l.size > 0)
          .length;
      const diag = buildBookmapHistoryRetentionDiag({
        sourceMode,
        activeDomMarket,
        renderData: engineRenderData,
        rawHeatmapCells: rawCells,
        renderedTextureCellCount:
          textureRenderStatsRef.current.renderedTextureCellCount,
        textureDrawCapHit: textureRenderStatsRef.current.textureDrawCapHit,
        liveProjectionRenderedCount:
          liveProjectionRenderStatsRef.current.renderedLiveProjectionCount,
        currentBookLevelCount,
      });
      console.debug("[BOOKMAP_HISTORY_RETENTION_DIAG]", diag);
    };
    logHistoryRetentionDiag();
    const id = window.setInterval(logHistoryRetentionDiag, 2_000);
    return () => window.clearInterval(id);
  }, [
    sourceMode,
    activeDomMarket,
    primaryHeatmapState,
    effectiveSpot,
    effectivePerp,
    engineRenderData,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logPerpFilterTruth = () => {
      console.debug("[BOOKMAP_PERP_FILTER_TRUTH]", {
        ...perpFilterTruthRef.current,
      });
    };
    logPerpFilterTruth();
    const id = window.setInterval(logPerpFilterTruth, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logVisualParityTruth = () => {
      console.debug("[BOOKMAP_VISUAL_PARITY_TRUTH]", {
        ...visualParityTruthRef.current,
      });
    };
    logVisualParityTruth();
    const id = window.setInterval(logVisualParityTruth, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logL2BandContinuityTruth = () => {
      console.debug("[BOOKMAP_L2_BAND_CONTINUITY_TRUTH]", {
        ...l2BandContinuityTruthRef.current,
      });
    };
    logL2BandContinuityTruth();
    const id = window.setInterval(logL2BandContinuityTruth, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logPaletteParityTruth = () => {
      console.debug("[BOOKMAP_PALETTE_PARITY_TRUTH]", {
        ...paletteParityTruthRef.current,
      });
    };
    logPaletteParityTruth();
    const id = window.setInterval(logPaletteParityTruth, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logMicroHierarchyDiag = () => {
      console.debug("[BOOKMAP_MICRO_VISUAL_HIERARCHY_DIAG]", {
        ...microHierarchyTruthRef.current,
      });
    };
    logMicroHierarchyDiag();
    const id = window.setInterval(logMicroHierarchyDiag, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logHistoricalColorRetentionDiag = () => {
      console.debug("[BOOKMAP_HISTORICAL_COLOR_RETENTION_DIAG]", {
        ...historicalColorRetentionTruthRef.current,
      });
    };
    logHistoricalColorRetentionDiag();
    const id = window.setInterval(logHistoricalColorRetentionDiag, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logHistoricalColorLockAudit = () => {
      console.debug("[BOOKMAP_HISTORICAL_COLOR_LOCK_AUDIT]", {
        ...historicalColorLockAuditRef.current,
      });
    };
    logHistoricalColorLockAudit();
    const id = window.setInterval(logHistoricalColorLockAudit, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logHistoricalSpanColorAudit = () => {
      console.debug("[BOOKMAP_HISTORICAL_SPAN_COLOR_AUDIT]", {
        ...historicalSpanColorAuditRef.current,
      });
    };
    logHistoricalSpanColorAudit();
    const id = window.setInterval(logHistoricalSpanColorAudit, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logP74SpanAudit = () => {
      console.debug("[BOOKMAP_P74_SPAN_AUDIT]", {
        ...p74SpanAuditRef.current,
      });
    };
    logP74SpanAudit();
    const id = window.setInterval(logP74SpanAudit, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logSpanRenderContinuityAudit = () => {
      console.debug("[BOOKMAP_SPAN_RENDER_CONTINUITY_AUDIT]", {
        ...spanRenderContinuityAuditRef.current,
      });
    };
    logSpanRenderContinuityAudit();
    const id = window.setInterval(logSpanRenderContinuityAudit, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logSpanTextureBalanceAudit = () => {
      console.debug("[BOOKMAP_SPAN_TEXTURE_BALANCE_AUDIT]", {
        ...spanTextureBalanceAuditRef.current,
      });
    };
    logSpanTextureBalanceAudit();
    const id = window.setInterval(logSpanTextureBalanceAudit, 2_000);
    return () => window.clearInterval(id);
  }, [sourceMode, activeDomMarket]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logGeometryDiag = () => {
      const vp = timeScale.viewport;
      const geom = buildBookmapTextureGeometryDiag({
        renderData: engineRenderData,
        renderedTextureCellCount:
          textureRenderStatsRef.current.renderedTextureCellCount,
        avgTextureCellWidthPx:
          textureRenderStatsRef.current.avgTextureCellWidthPx,
        minTextureCellWidthPx:
          textureRenderStatsRef.current.minTextureCellWidthPx,
        maxTextureCellWidthPx:
          textureRenderStatsRef.current.maxTextureCellWidthPx,
        viewportMs: vp.visibleEndTime - vp.visibleStartTime,
        plotWidthPx: heatmapPlotWidth,
        drawCapHit: textureRenderStatsRef.current.textureDrawCapHit,
      });
      console.debug("[BOOKMAP_TEXTURE_GEOMETRY_DIAG]", geom);
    };
    logGeometryDiag();
    const id = window.setInterval(logGeometryDiag, 2_000);
    return () => window.clearInterval(id);
  }, [engineRenderData, timeScale.viewport, heatmapPlotWidth]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logLiveProjectionDiag = () => {
      const diag = buildBookmapLiveProjectionDiag({
        sourceMode,
        activeDomMarket,
        renderData: engineRenderData,
        timeViewport: {
          visibleStartTime: timeScale.viewport.visibleStartTime,
          visibleEndTime: timeScale.viewport.visibleEndTime,
          liveEdgeTime: timeScale.viewport.liveEdgeTime,
          dataEndTime: timeScale.viewport.dataEndTime,
          rightSpacePct: timeScale.viewport.rightSpacePct,
        },
        renderedLiveProjectionCount:
          liveProjectionRenderStatsRef.current.renderedLiveProjectionCount,
      });
      console.debug("[BOOKMAP_LIVE_LIQUIDITY_PROJECTION_DIAG]", diag);
      const geom = buildBookmapLiveProjectionGeometryDiag({
        sourceMode,
        activeDomMarket,
        renderData: engineRenderData,
        timeViewport: {
          visibleStartTime: timeScale.viewport.visibleStartTime,
          visibleEndTime: timeScale.viewport.visibleEndTime,
          liveEdgeTime: timeScale.viewport.liveEdgeTime,
          dataEndTime: timeScale.viewport.dataEndTime,
          rightSpacePct: timeScale.viewport.rightSpacePct,
        },
        projectionStartTime:
          liveProjectionRenderStatsRef.current.projectionStartTime,
        projectionEndTime:
          liveProjectionRenderStatsRef.current.projectionEndTime,
        avgProjectionWidthPx:
          liveProjectionRenderStatsRef.current.avgProjectionWidthPx,
        minProjectionWidthPx:
          liveProjectionRenderStatsRef.current.minProjectionWidthPx,
        maxProjectionWidthPx:
          liveProjectionRenderStatsRef.current.maxProjectionWidthPx,
        renderedLiveProjectionCount:
          liveProjectionRenderStatsRef.current.renderedLiveProjectionCount,
        projectionOverlapsHistory:
          liveProjectionRenderStatsRef.current.projectionOverlapsHistory,
      });
      console.debug("[BOOKMAP_LIVE_PROJECTION_GEOMETRY_DIAG]", geom);
    };
    logLiveProjectionDiag();
    const id = window.setInterval(logLiveProjectionDiag, 2_000);
    return () => window.clearInterval(id);
  }, [
    sourceMode,
    activeDomMarket,
    engineRenderData,
    timeScale.viewport,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const latestAgeMs =
      latestTradeTs != null ? Math.max(0, Date.now() - latestTradeTs) : null;
    console.debug("[BOOKMAP_TRADE_SOURCE]", {
      sourceMode,
      tradeSource,
      marketForTrades: activeTradeMarket,
      tradeFeedMarket,
      sseUrl: tradeSseUrl,
      connected: tradesStreamConnected,
      bufferKey: tradeBufferKey,
      tradesTotal: tradeBufferCount,
      receivedTradeCount,
      latestTradeTs,
      latestAgeMs,
      lastMessageTs,
      renderedDots: engineTradeDots.stats.dotCount,
    });
  }, [
    sourceMode,
    tradeSource,
    activeTradeMarket,
    tradeFeedMarket,
    tradeSseUrl,
    tradesStreamConnected,
    tradeBufferKey,
    tradeBufferCount,
    receivedTradeCount,
    latestTradeTs,
    lastMessageTs,
    tradeVersion,
    engineTradeDots.stats.dotCount,
  ]);

  const executionRailCount = useMemo(() => {
    if (!tradeDotsEnabled || !visualSettings.trades.executionRailsEnabled) return 0;
    if (!engineTradeDots.dots.length || heatmapPlotWidth < 10 || heatmapPlotHeight < 10) {
      return 0;
    }
    const plotW = heatmapPlotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right;
    const plotH = heatmapPlotHeight - HEATMAP_PAD.top - HEATMAP_PAD.bottom;
    if (plotW <= 0 || plotH <= 0) return 0;
    return countExecutionRails(
      engineTradeDots.dots,
      timeScale.timeToX,
      priceScale.priceToY,
      plotW,
      plotH,
      {
        verticalMode: priceScale.verticalMode,
        railLength: visualSettings.trades.executionRailLength,
        visual: tradeDotVisual,
      },
    );
  }, [
    tradeDotsEnabled,
    visualSettings.trades.executionRailsEnabled,
    visualSettings.trades.executionRailLength,
    engineTradeDots.dots,
    heatmapPlotWidth,
    heatmapPlotHeight,
    timeScale.timeToX,
    priceScale.priceToY,
    priceScale.verticalMode,
    tradeDotVisual,
  ]);

  const importantLevels: ImportantLiquidityLevel[] = useMemo(() => {
    if (!latest) return [];
    const ref = priceReference ?? tickerSpot;
    return detectImportantLiquidityLevels({
      bids: latest.bids,
      asks: latest.asks,
      spot: ref,
      priceStep: priceScale.domBucketSize,
    });
  }, [latest, priceReference, tickerSpot, priceScale.domBucketSize]);

  const farWallMarkers = useMemo(() => {
    if (!showImportantFarLevels) return undefined;

    if (useEngineRenderer && primaryHeatmapState) {
      const markerSource = majorWallsOnly
        ? primaryHeatmapState.majorWalls
        : [
            ...primaryHeatmapState.majorWalls,
            ...primaryHeatmapState.structuralWalls,
            ...primaryHeatmapState.importantWalls,
          ];
      const above = markerSource
        .filter((l) => l.side === "ask" && l.price > priceRange.maxPrice)
        .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
        .slice(0, 4);
      const below = markerSource
        .filter((l) => l.side === "bid" && l.price < priceRange.minPrice)
        .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
        .slice(0, 4);
      if (!above.length && !below.length) return undefined;
      return [
        ...above.map((l) => ({ side: l.side, price: l.price, sizeBtc: l.maxSeenSize })),
        ...below.map((l) => ({ side: l.side, price: l.price, sizeBtc: l.maxSeenSize })),
      ];
    }

    if (!latest || importantLevels.length === 0) {
      return undefined;
    }
    const markerSource = majorWallsOnly
      ? importantLevels.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC)
      : importantLevels;
    const above = markerSource
      .filter((l) => l.side === "ask" && l.price > priceRange.maxPrice)
      .sort((a, b) => b.sizeBtc - a.sizeBtc)
      .slice(0, 4);
    const below = markerSource
      .filter((l) => l.side === "bid" && l.price < priceRange.minPrice)
      .sort((a, b) => b.sizeBtc - a.sizeBtc)
      .slice(0, 4);
    if (!above.length && !below.length) return undefined;
    const map = (l: ImportantLiquidityLevel) => ({
      side: l.side,
      price: l.price,
      sizeBtc: l.sizeBtc,
    });
    return [...above.map(map), ...below.map(map)];
  }, [
    showImportantFarLevels,
    latest,
    importantLevels,
    priceRange,
    majorWallsOnly,
    useEngineRenderer,
    primaryHeatmapState,
  ]);

  const farDepthMarkers = useMemo(() => {
    if (!useEngineRenderer || !showImportantFarLevels) {
      return { above: [], below: [] };
    }
    const wallSource = engineRenderData?.walls ?? [];
    return computeFarDepthMarkers(
      priceReference ?? tickerSpot,
      wallSource,
      priceRange.minPrice,
      priceRange.maxPrice,
    );
  }, [
    useEngineRenderer,
    showImportantFarLevels,
    engineRenderData?.walls,
    priceReference,
    tickerSpot,
    priceRange.minPrice,
    priceRange.maxPrice,
  ]);

  const showDomImportantStrip =
    showImportantFarLevels && viewMode === "fullDepth";

  const safeDomWidth = useMemo(() => clampDomWidth(domWidth), [domWidth]);

  const viewportTooNarrow = useMemo(() => {
    if (bookmapBodyWidth <= 0) return false;
    return bookmapBodyWidth < getMinBookmapBodyWidth();
  }, [bookmapBodyWidth]);

  useEffect(() => {
    const last = getSnapshots().at(-1);
    if (last) {
      wallsTrackerRef.current.ingestSnapshot(last, priceScale.domBucketSize);
      setWallRevision((v) => v + 1);
    }
  }, [snapshotCount, priceScale.domBucketSize, getSnapshots]);

  const persistentWalls = useMemo(() => {
    if (!showPersistentWalls) return [];
    return wallsTrackerRef.current.getRenderableWalls();
  }, [showPersistentWalls, wallRevision]);

  const wallStats = useMemo(() => {
    return wallsTrackerRef.current.getStats();
  }, [wallRevision]);

  const tradeLayerDebug = useMemo(() => {
    const series = getSnapshots().slice(-MAX_LIQUIDITY_SNAPSHOTS);
    const buffered = getRecentTrades();
    const { visible, grouped } = prepareTradeBubblesForRender(
      buffered,
      series,
      priceRange.minPrice,
      priceRange.maxPrice,
      priceScale.domBucketSize,
    );
    const maxTradeSize =
      grouped.length > 0 ? Math.max(...grouped.map((t) => t.sizeBtc)) : 0;
    return {
      trades: tradeBufferCount,
      visibleTrades: visible.length,
      groupedTrades: grouped.length,
      receivedTrades: Number.isFinite(receivedTradeCount) ? receivedTradeCount : 0,
      firstVisibleTrade: visible[0] ?? null,
      lastVisibleTrade: visible[visible.length - 1] ?? null,
      maxTradeSize,
    };
  }, [
    tradeBufferCount,
    receivedTradeCount,
    tradeTick,
    snapshotCount,
    priceRange,
    priceScale.domBucketSize,
    getSnapshots,
    getRecentTrades,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const dtSec = (now - tradeRxSampleRef.current.atMs) / 1000;
      const received = Number.isFinite(receivedTradeCount) ? receivedTradeCount : 0;
      if (dtSec > 0.05) {
        const delta = received - tradeRxSampleRef.current.received;
        const rate = delta / dtSec;
        setTradeRxPerSec(Number.isFinite(rate) ? rate : null);
        tradeRxSampleRef.current = { atMs: now, received };
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [receivedTradeCount]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[BOOKMAP_TRADES_RENDER]", {
      bufferedTrades: tradeLayerDebug.trades,
      visibleTrades: tradeLayerDebug.visibleTrades,
      groupedTrades: tradeLayerDebug.groupedTrades,
      firstVisibleTrade: tradeLayerDebug.firstVisibleTrade,
      lastVisibleTrade: tradeLayerDebug.lastVisibleTrade,
      maxTradeSize: tradeLayerDebug.maxTradeSize,
      rxPerSec: tradeRxPerSec,
      streamConnected: tradesStreamConnected,
      showTrades,
    });
  }, [tradeLayerDebug, tradeRxPerSec, tradesStreamConnected, showTrades]);

  const importantDebug = useMemo(() => {
    const globalWalls = importantLevels.filter(
      (l) => l.kind === "MAJOR_WALL" || l.kind === "TOP_LIQUIDITY",
    ).length;
    const farWalls = importantLevels.filter((l) => l.kind === "FAR_WALL").length;
    const topBidWalls = importantLevels.filter(
      (l) => l.side === "bid" && l.kind === "TOP_LIQUIDITY",
    ).length;
    const topAskWalls = importantLevels.filter(
      (l) => l.side === "ask" && l.kind === "TOP_LIQUIDITY",
    ).length;
    return { globalWalls, farWalls, topBidWalls, topAskWalls };
  }, [importantLevels]);

  const stats = useMemo(
    () =>
      computeBookmapPipelineStats(
        latest,
        priceRange.minPrice,
        priceRange.maxPrice,
        minVisibleBtc,
        majorWallsOnly,
        priceScale.domBucketSize,
        pipelineStats.rawBids,
        pipelineStats.rawAsks,
      ),
    [
      latest,
      priceRange,
      minVisibleBtc,
      majorWallsOnly,
      priceScale.domBucketSize,
      pipelineStats.rawBids,
      pipelineStats.rawAsks,
    ],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[BOOKMAP_PIPELINE]", {
      rawBids: stats.rawBids,
      rawAsks: stats.rawAsks,
      normalizedBids: stats.normalizedBids,
      normalizedAsks: stats.normalizedAsks,
      visibleBids: stats.visibleBids,
      visibleAsks: stats.visibleAsks,
      domBuckets: stats.domBuckets,
      nonZeroBidBuckets: stats.nonZeroBidBuckets,
      nonZeroAskBuckets: stats.nonZeroAskBuckets,
      renderedHeatmap: stats.renderedHeatmap,
      aboveMinHeatmap: stats.aboveMinHeatmap,
      majorWallsHeatmap: stats.majorWallsHeatmap,
      globalWalls: importantDebug.globalWalls,
      farWalls: importantDebug.farWalls,
      topBidWalls: importantDebug.topBidWalls,
      topAskWalls: importantDebug.topAskWalls,
      minSize: minVisibleBtc,
      majorWallsOnly,
      priceRange,
      priceScale: priceScale.labelStep,
      bucket: priceScale.heatmapBucketSize,
    });
  }, [stats, minVisibleBtc, majorWallsOnly, priceRange, priceScale, importantDebug]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const norm = stats.normalizedBids + stats.normalizedAsks;
    const vis = stats.visibleBids + stats.visibleAsks;
    if (norm <= 0 || vis > 0) return;
    console.warn("[BOOKMAP_VISIBLE_EMPTY]", {
      tickerSpot,
      bookMid,
      priceReference,
      priceRange,
    });
  }, [
    stats.normalizedBids,
    stats.normalizedAsks,
    stats.visibleBids,
    stats.visibleAsks,
    tickerSpot,
    bookMid,
    priceReference,
    priceRange,
  ]);

  const resetView = useCallback(() => {
    hasUserAdjustedPriceViewportRef.current = false;
    lastPriceCenterContextRef.current = null;
    updatePrefs({ ladderAutoCenter: true });
    priceScale.resetToSpot();
    if (useEngineRenderer) timeScale.resetTimeView();
    tryAutoCenterPriceViewport("reset_view");
  }, [
    updatePrefs,
    priceScale,
    useEngineRenderer,
    timeScale,
    tryAutoCenterPriceViewport,
  ]);

  const onPriceInteractionStart = useCallback(() => {
    hasUserAdjustedPriceViewportRef.current = true;
    if (ladderAutoCenter) {
      updatePrefs({ ladderAutoCenter: false });
    }
  }, [ladderAutoCenter, updatePrefs]);

  const canvasInteraction = useBookmapCanvasInteraction({
    containerRef: heatmapContainerRef,
    useEngineRenderer,
    timeScale,
    priceScale,
    onPriceInteractionStart,
  });

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = heatmapContainerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 10 || h < 10) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (useEngineRenderer && engineRenderData) {
      const engineFrame = engineRenderData;
      const renderedLayerNames: string[] = [];
      if (engineFrame.textureModeEnabled && engineFrame.textureCells.length > 0) {
        renderedLayerNames.push("historical-texture");
      }
      if (engineFrame.liveProjectionLevels.length > 0) {
        renderedLayerNames.push("live-projection");
      }
      if (engineFrame.bands.length > 0) {
        renderedLayerNames.push("wall-bands");
      }
      if (sourceMode === "both" && engineOverlayRenderData) {
        if (
          engineOverlayRenderData.textureModeEnabled &&
          engineOverlayRenderData.textureCells.length > 0
        ) {
          renderedLayerNames.push("engine-overlay-texture");
        }
        renderedLayerNames.push("engine-overlay-bands");
      }
      if (sourceMode === "both" && passiveConfluenceLevels.length > 0) {
        renderedLayerNames.push("engine-confluence");
      }
      const tradeDotRenderStats = {
        rendererReceivedDotsCount: 0,
        rendererDrawnDotsCount: 0,
        rendererClippedTimeCount: 0,
        rendererClippedPriceCount: 0,
      };
      const textureRenderStats = {
        renderedTextureCellCount: 0,
        cellsFilteredByTime: 0,
        textureDrawCapHit: false,
        avgTextureCellWidthPx: 0,
        minTextureCellWidthPx: 0,
        maxTextureCellWidthPx: 0,
        effectiveTextureBucketMs: 0,
        textureContinuousMode: "",
      };
      const liveProjectionRenderStats = {
        renderedLiveProjectionCount: 0,
        projectionStartTime: 0,
        projectionEndTime: 0,
        avgProjectionWidthPx: 0,
        minProjectionWidthPx: 0,
        maxProjectionWidthPx: 0,
        projectionOverlapsHistory: false,
      };

      paintBookmapEngineHeatmapFrame(ctx, {
        width: w,
        height: h,
        minPrice: priceRange.minPrice,
        maxPrice: priceRange.maxPrice,
        spot: priceReference ?? tickerSpot,
        priceToY: priceScale.priceToY,
        heatmapBucketSize: priceScale.heatmapBucketSize,
        domBucketSize: priceScale.domBucketSize,
        crosshair,
        engine: engineFrame,
        overlayEngine:
          sourceMode === "both" && engineOverlayRenderData
            ? engineOverlayRenderData
            : undefined,
        overlayOpacity: sourceMode === "both" ? perpOverlayOpacity : undefined,
        confluenceLevels:
          sourceMode === "both" ? passiveConfluenceLevels : undefined,
        showConfluenceLabels: confluencePrefs.showConfluenceLabels,
        confluenceVisualOpacity: confluencePrefs.visualOpacity,
        confluenceRenderMode,
        confluenceMinDisplayTier: confluencePrefs.minDisplayTier,
        timeViewport: timeScale.viewport,
        showFarWallMarkers: showImportantFarLevels,
        tradeDots: tradeDotsEnabled ? engineTradeDots.dots : undefined,
        tradeDotRenderStatsOut: tradeDotRenderStats,
        tradeDotVerticalMode: priceScale.verticalMode,
        tradeDotVisual,
        executionRailsEnabled: visualSettings.trades.executionRailsEnabled,
        executionRailLength: visualSettings.trades.executionRailLength,
        bboHistoryPoints: bboHistory.points,
        showHistoricalBboPath: visualSettings.layout.showHistoricalBboPath,
        bboPathOpacity: visualSettings.layout.bboPathOpacity,
        bboGuide: domBbo,
        showBidAskLines: visualSettings.layout.showBidAskLines,
        bidAskLineOpacity: visualSettings.layout.bidAskLineOpacity,
        divergenceMarkers: divergenceMarkerSignals,
        showDivergenceMarkers:
          bothModeDivergence && visualSettings.divergence.showChartMarkers,
        visualSettings,
        sourceMode,
        activeDomMarket,
        perpFilterTruthOut: perpFilterTruthRef.current,
        visualParityTruthOut: visualParityTruthRef.current,
        l2BandContinuityTruthOut: l2BandContinuityTruthRef.current,
        paletteParityTruthOut: paletteParityTruthRef.current,
        microHierarchyTruthOut: microHierarchyTruthRef.current,
        historicalColorRetentionTruthOut: historicalColorRetentionTruthRef.current,
        historicalColorLockAuditOut: historicalColorLockAuditRef.current,
        historicalSpanColorAuditOut: historicalSpanColorAuditRef.current,
        p74SpanAuditOut: p74SpanAuditRef.current,
        spanRenderContinuityAuditOut: spanRenderContinuityAuditRef.current,
        spanTextureBalanceAuditOut: spanTextureBalanceAuditRef.current,
        spanPeakCache: historicalTextureSpanPeakCacheRef.current,
        textureRenderStatsOut: textureRenderStats,
        liveProjectionRenderStatsOut: liveProjectionRenderStats,
        layerAuditSink: layerAuditSinkRef.current,
        microScalpLayerAuditSink: microScalpLayerAuditSinkRef.current,
        renderArchitectureFrameStatsOut: renderArchitectureFrameStatsRef.current,
      });
      if (executionOrderLines.length > 0) {
        const plotW = w - HEATMAP_PAD.left - HEATMAP_PAD.right;
        const plotH = h - HEATMAP_PAD.top - HEATMAP_PAD.bottom;
        const drawnOrders = renderBookmapExecutionOrders(
          ctx,
          { plotW, plotH, priceToY: priceScale.priceToY },
          executionOrderLines,
          priceRange.minPrice,
          priceRange.maxPrice,
        );
        if (drawnOrders > 0) {
          renderedLayerNames.push("execution-orders");
        }
      }
      if (executionOrderLines.length > 0) {
        renderedLayerNames.push("execution-overlay");
      }
      if (tradeDotsEnabled && engineTradeDots.dots.length > 0) {
        renderedLayerNames.push("trade-dots");
      }
      textureRenderStatsRef.current = textureRenderStats;
      liveProjectionRenderStatsRef.current = liveProjectionRenderStats;
      textureDiagRef.current = buildBookmapTextureDiag({
        sourceMode,
        activeDomMarket,
        renderData: engineRenderData,
        renderedTextureCellCount: textureRenderStats.renderedTextureCellCount,
        textureDrawCapHit: textureRenderStats.textureDrawCapHit,
      });
      if (engineRenderData?.textureStats) {
        engineRenderData.textureStats.cellsFilteredByTime =
          textureRenderStats.cellsFilteredByTime;
        engineRenderData.textureStats.textureDrawCapHit =
          textureRenderStats.textureDrawCapHit;
      }
      forensicDrawRef.current = {
        legacyRendered: false,
        renderedLayerNames,
        ...tradeDotRenderStats,
      };
      return;
    }

    if (!legacyDebugEnabled) {
      forensicDrawRef.current = {
        legacyRendered: false,
        renderedLayerNames: [],
        rendererReceivedDotsCount: 0,
        rendererDrawnDotsCount: 0,
        rendererClippedTimeCount: 0,
        rendererClippedPriceCount: 0,
      };
      return;
    }

    forensicDrawRef.current = {
      legacyRendered: true,
      renderedLayerNames: ["legacy-snapshot-cells-debug"],
      rendererReceivedDotsCount: 0,
      rendererDrawnDotsCount: 0,
      rendererClippedTimeCount: 0,
      rendererClippedPriceCount: 0,
    };
    paintBookmapHeatmapFrame(ctx, {
      width: w,
      height: h,
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      spot: priceReference ?? tickerSpot,
      series: getSnapshots().slice(-MAX_LIQUIDITY_SNAPSHOTS),
      priceStep: priceScale.heatmapBucketSize,
      minVisibleBtc,
      majorWallsOnly,
      showTrades,
      trades: getRecentTrades(),
      showPersistentWalls,
      persistentWalls,
      crosshair,
      farWallMarkers,
      ladderRowHeightPx: Math.max(4, priceScale.heatmapBucketSize > 0 ? 8 : 4),
    });
  }, [
    legacyDebugEnabled,
    engineRenderBase,
    useEngineRenderer,
    engineRenderData,
    engineOverlayRenderData,
    sourceMode,
    perpOverlayOpacity,
    passiveConfluenceLevels,
    confluencePrefs.showConfluenceLabels,
    confluencePrefs.visualOpacity,
    confluenceRenderMode,
    confluencePrefs.minDisplayTier,
    timeScale.viewport,
    getSnapshots,
    priceRange,
    priceScale,
    minVisibleBtc,
    majorWallsOnly,
    priceReference,
    tickerSpot,
    showTrades,
    showPersistentWalls,
    persistentWalls,
    getRecentTrades,
    tradeTick,
    crosshair,
    farWallMarkers,
    showImportantFarLevels,
    tradeDotsEnabled,
    engineTradeDots,
    tradeDotVisual,
    visualSettings,
    visualSettings.trades.executionRailsEnabled,
    visualSettings.trades.executionRailLength,
    domBbo,
    effectiveBboMarket,
    bboHistory.points,
    bboHistory.clientVersion,
    bboFeaturesEnabled,
    visualSettings.layout.showHistoricalBboPath,
    visualSettings.layout.bboPathOpacity,
    visualSettings.layout.showBidAskLines,
    visualSettings.layout.bidAskLineOpacity,
    divergenceMarkerSignals,
    bothModeDivergence,
    executionOrderLines,
  ]);

  useEffect(() => {
    drawHeatmap();
  }, [
    drawHeatmap,
    snapshotCount,
    bookmapDataUpdatedAt,
    useEngineRenderer,
    priceScale.visibleRange,
    timeScale.viewport,
    timeScale.followLive,
    tradeTick,
    tradeVersion,
    engineTradeDots,
    bboHistory.points,
    bboHistory.clientVersion,
    visualSettings.layout.showHistoricalBboPath,
  ]);

  useEffect(() => {
    const el = heatmapContainerRef.current;
    if (!el) return;

    const syncPlotHeight = () => {
      setHeatmapPlotHeight(el.clientHeight);
      setHeatmapPlotWidth(el.clientWidth);
      drawHeatmap();
    };

    const ro = new ResizeObserver(syncPlotHeight);
    ro.observe(el);
    syncPlotHeight();
    return () => ro.disconnect();
  }, [drawHeatmap]);

  useEffect(() => {
    const el = bookmapBodyRef.current;
    if (!el) return;

    const syncWidth = () => setBookmapBodyWidth(el.clientWidth);
    const ro = new ResizeObserver(syncWidth);
    ro.observe(el);
    syncWidth();
    return () => ro.disconnect();
  }, []);

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = heatmapContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const price = priceScale.yToPrice(y);
      setCrosshair({ x, y, price });
    },
    [priceScale],
  );

  const handleCanvasMouseLeave = useCallback(() => {
    setCrosshair(null);
  }, []);

  const startDomResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      domResizeRef.current = { startX: e.clientX, startW: domWidth };
    },
    [domWidth],
  );

  const startVolumeResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      volResizeRef.current = { startY: e.clientY, startH: volumeHeight };
    },
    [volumeHeight],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (domResizeRef.current) {
        const delta = domResizeRef.current.startX - e.clientX;
        updatePrefs({ domWidth: domResizeRef.current.startW + delta });
      }
      if (volResizeRef.current) {
        const delta = volResizeRef.current.startY - e.clientY;
        updatePrefs({ volumeHeight: volResizeRef.current.startH + delta });
      }
    };
    const onUp = () => {
      domResizeRef.current = null;
      volResizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [updatePrefs]);

  const statusLabel =
    feedStatus === "live"
      ? "Live"
      : feedStatus === "loading"
        ? "Connecting…"
        : feedStatus === "offline"
          ? "Offline"
          : feedStatus === "error"
            ? "Error"
            : "No data";

  const showHeatmapOverlay =
    !useEngineRenderer &&
    snapshotCount === 0 &&
    (feedStatus === "empty" || feedStatus === "offline" || feedStatus === "error");

  const primaryMarket: BookmapMarketSource =
    sourceMode === "both" ? activeDomMarket : sourceMode === "perp" ? "perp" : "spot";

  const engineEverLoaded = Boolean(
    everLoadedByMarket[primaryMarket] ||
      (primaryHeatmapState != null && primaryHeatmapState.heatmapCells.length > 0),
  );

  const engineDebugLine = useMemo(() => {
    if (!USE_BOOKMAP_ENGINE) return null;
    if (!engineEverLoaded && bookmapEngineLoading && !primaryHeatmapState) {
      return "engine BOOKMAP · loading…";
    }
    if (!useEngineRenderer) {
      if (bookmapEngineError && !engineEverLoaded) {
        return `engine LEGACY (bookmap error) · ${bookmapEngineError instanceof Error ? bookmapEngineError.message : "failed"}`;
      }
      return "engine LEGACY · no bookmap data";
    }
    const statusTag = bookmapEngineFetching
      ? usingCachedBookmapState
        ? "refetching cached"
        : "refetching"
      : usingCachedBookmapState
        ? "cached state"
        : "live";
    const age =
      bookmapAgeMs != null ? `${Math.round(bookmapAgeMs)}ms` : "—";
    const st = engineRenderData?.stats;
    const domBook = effectiveDomState;
    const visMode = st?.visualMode ?? "—";
    const pLo = st?.pLow != null ? st.pLow.toFixed(2) : "—";
    const pHi = st?.pHigh != null ? st.pHigh.toFixed(2) : "—";
    const minI =
      st?.minRenderIntensity != null ? st.minRenderIntensity.toFixed(2) : "—";
    const td = engineTradeDots.stats;
    const tradeDbgParts: string[] = [];
    if (tradeDotsEnabled || deltaPanelEnabled) {
      const latestMs =
        latestTradeTs != null ? Math.max(0, Date.now() - latestTradeTs) : null;
      const latestLabel =
        latestMs != null
          ? latestMs >= BOOKMAP_OB_STALE_MS
            ? "STALE"
            : `${(latestMs / 1000).toFixed(1)}s`
          : "—";
      tradeDbgParts.push(
        `trade ${activeTradeMarket}`,
        `trades ${tradeBufferCount || td.tradeCount || bookmapTradeAgg.summary.tradeCount}`,
        `latest ${latestLabel}`,
      );
      if (tradeDotsEnabled) {
        tradeDbgParts.push(`dots ${td.dotCount}`);
      }
    }
    if (deltaPanelEnabled) {
      tradeDbgParts.push(
        `vol ${formatBtcCompact(bookmapTradeAgg.summary.volume)} BTC`,
        `delta ${formatBtcCompact(bookmapTradeAgg.summary.delta)} BTC`,
        `cvd ${formatBtcCompact(bookmapTradeAgg.summary.cvd)} BTC`,
      );
    }
    const tradeDbg = tradeDbgParts.length ? ` · ${tradeDbgParts.join(" · ")}` : "";
    const bboPathLatest =
      bboHistory.latestAgeMs != null
        ? `${(bboHistory.latestAgeMs / 1000).toFixed(1)}s`
        : "—";
    const bboPathDbg = bboFeaturesEnabled
      ? ` · bboPath ${effectiveBboMarket} · pts ${bboPathDebug.totalPoints} · rendered ${bboPathDebug.renderedSegments} · latest ${bboPathLatest}`
      : "";
    const bboDualDbg =
      import.meta.env.DEV && bboMarketDebug.spot && bboMarketDebug.perp
        ? ` · bboPath spot · pts ${bboMarketDebug.spot.points} · latest ${bboMarketDebug.spot.latestSec} · bboPath perp · pts ${bboMarketDebug.perp.points} · latest ${bboMarketDebug.perp.latestSec}`
        : "";
    const offsetSec = Math.round(timeScale.horizontalOffsetMs / 1000);
    const tspanMs =
      timeScale.viewport.visibleEndTime - timeScale.viewport.visibleStartTime;
    const interactionTag = `follow ${timeScale.followLive ? "ON" : "OFF"} · offset ${offsetSec}s · tspan ${formatBookmapTimeSpanMs(tspanMs)} · right ${rightSpacePct}%`;
    const wv = priceScale.visibleWallCounts;
    const bboTag =
      domBbo != null
        ? ` · bbo ${formatHeatmapPrice(domBbo.bestBid)} / ${formatHeatmapPrice(domBbo.bestAsk)}`
        : "";
    const sourceTag =
      sourceMode === "both"
        ? `source both · dom ${domSource} · bboPath ${effectiveBboMarket} · pts ${bboPathDebug.totalPoints} · spot cells ${effectiveSpot?.heatmapCells.length ?? 0} · perp cells ${effectivePerp?.heatmapCells.length ?? 0} · conf candidates ${passiveConfluenceDebug.candidateConfluences} · rejected strength ${passiveConfluenceDebug.rejectedByStrength} · rendered ${passiveConfluenceSummary.visible} · strong ${passiveConfluenceSummary.strong} · major ${passiveConfluenceSummary.major} · minTier ${confluencePrefs.minDisplayTier}${bboTag} · trade ${activeTradeMarket} · perpOpacity ${perpOverlayOpacityPct}%`
        : `source ${sourceMode} · bboPath ${effectiveBboMarket}${bboTag}`;
    const domWalls =
      domBook != null
        ? `${domBook.importantWalls.length}/${domBook.structuralWalls.length}/${domBook.majorWalls.length}`
        : "—/—/—";
    const tradeAgeDbg =
      latestTradeTs != null ? Math.round(Date.now() - latestTradeTs) : null;
    const obAgeDbg = orderbookAgeMs != null ? Math.round(orderbookAgeMs) : null;
    const perpBmAgeDbg = perpAgeMs != null ? Math.round(perpAgeMs) : null;
    const showPerpFreshness =
      sourceMode === "perp" || sourceMode === "both" || activeDomMarket === "perp";
    const perpFreshnessDbg = showPerpFreshness
      ? perpLiveStale
        ? ` · PERP STALE · ob ${obAgeDbg ?? "—"}ms · bm ${perpBmAgeDbg ?? "—"}ms · reconnecting`
        : ` · perp ob ${obAgeDbg ?? "—"}ms · tr ${tradeAgeDbg ?? "—"}ms · bbo ${domBboFresh ? "OK" : "—"}${
            domBboRaw && domBboFresh
              ? ` · spread ${Math.round(domBboRaw.bestAsk - domBboRaw.bestBid)}`
              : ""
          }`
      : "";
    const divDbg =
      bothModeDivergence && visualSettings.divergence.enabled
        ? ` · div candidates ${divergenceResult.debug.candidates} · filtered ${divergenceResult.debug.filtered} · active ${divergenceDisplaySignals.length} · high ${divergenceDisplaySignals.filter((s) => s.severity === "high").length}`
        : "";
    return (
      `BOOKMAP · ${sourceTag} · ${interactionTag} · ${statusTag} · verticalMode ${priceScale.verticalMode} · depth ${depthPresetLabel(depthRangePreset, localRangeUsd)} · range ${formatBookmapRangeShort(priceScale.visibleMinPrice)}–${formatBookmapRangeShort(priceScale.visibleMaxPrice)} · domWalls ${domWalls} · bands ${st?.visibleBandCount ?? 0}/${st?.renderedBandCount ?? 0} · age ${age}ms${perpFreshnessDbg}${bboPathDbg}${bboDualDbg}${divDbg}${tradeDbg}`
    );
  }, [
    sourceMode,
    domSource,
    effectiveBboMarket,
    effectiveSpot,
    effectivePerp,
    activeDomMarket,
    activeTradeMarket,
    bothModeDivergence,
    visualSettings.divergence.enabled,
    divergenceResult.debug,
    divergenceDisplaySignals,
    perpOverlayOpacityPct,
    passiveConfluenceSummary,
    confluencePrefs.minDisplayTier,
    passiveConfluenceDebug,
    domBbo,
    domBboRaw,
    domBboFresh,
    perpLiveStale,
    perpAgeMs,
    orderbookAgeMs,
    engineEverLoaded,
    bookmapEngineLoading,
    bookmapEngineFetching,
    primaryHeatmapState,
    effectiveDomState,
    bookmapEngineError,
    useEngineRenderer,
    usingCachedBookmapState,
    bookmapAgeMs,
    priceScale,
    engineRenderData,
    rightSpacePct,
    depthRangePreset,
    localRangeUsd,
    timeScale.followLive,
    timeScale.horizontalOffsetMs,
    tradeDotsEnabled,
    engineTradeDots.stats,
    tradeBufferCount,
    latestTradeTs,
    activeTradeMarket,
    executionRailCount,
    visualSettings.trades.executionRailsEnabled,
    deltaPanelEnabled,
    bookmapTradeAgg.summary,
    bboPathDebug,
    bboHistory.latestAgeMs,
    bboFeaturesEnabled,
    bboMarketDebug.spot,
    bboMarketDebug.perp,
    visualSettings.layout.showHistoricalBboPath,
  ]);

  const btnClass = bookmapToolbarBtnClass;

  const panelBtnClass = cn(
    btnClass,
    "border-cyan-500/30 text-cyan-200/90 hover:border-cyan-400/50",
  );

  const showToolbarPerpOpacity = sourceMode === "both" || sourceMode === "perp";

  const bookmapOperational = useMemo((): BookmapOperationalConfig => {
    return {
      sourceMode,
      onSourceModeChange: setSourceMode,
      domSource,
      onDomSourceChange: setDomSource,
      tradeSource,
      onTradeSourceChange: setTradeSource,
      perpOverlayOpacityPct,
      onPerpOverlayOpacityChange: setPerpOverlayOpacityPct,
      depthRangePreset,
      onDepthPresetChange: applyDepthPreset,
      localRangeUsd,
      onLocalRangeUsdChange: (v) => {
        updatePrefs({ localRangeUsd: v });
        if (priceScale.mode === "auto") {
          priceScale.applyDepthRange("local");
        }
      },
      depthPresetLabel: (p) =>
        depthPresetLabel(p, p === "local" ? localRangeUsd : undefined),
      ladderAutoCenter,
      onLadderAutoCenterChange: (on) => updatePrefs({ ladderAutoCenter: on }),
      followLive: timeScale.followLive,
      onFollowLiveChange: (on) => timeScale.setFollowLiveEnabled(on),
      followLiveDisabled: !useEngineRenderer,
      rightSpacePct: effectiveRightSpacePct,
      onRightSpacePctChange: (snapped) => {
        updatePrefs({ rightSpacePct: snapped });
        setVisualSettings(
          mergeBookmapVisualSettings(visualSettings, {
            layout: { rightSpacePct: snapped },
          }),
        );
      },
      rightSpaceDisabled: !useEngineRenderer,
      onFitWalls: () => {
        hasUserAdjustedPriceViewportRef.current = true;
        updatePrefs({ ladderAutoCenter: false });
        priceScale.fitToWalls();
      },
      onFitMajorWalls: () => {
        hasUserAdjustedPriceViewportRef.current = true;
        updatePrefs({ ladderAutoCenter: false });
        applyDepthPreset("majorWalls");
        priceScale.fitToMajorWalls();
      },
      onResetSpot: resetView,
      onZoomIn: priceScale.zoomIn,
      onZoomOut: priceScale.zoomOut,
      minVisibleBtc,
      minSizeOptions: MIN_SIZE_OPTIONS,
      onMinVisibleBtcChange: (btc) => updatePrefs({ minVisibleBtc: btc }),
      minSizeDisabled: majorWallsOnly,
      majorWallsOnly,
      onMajorWallsOnlyChange: (on) => updatePrefs({ majorWallsOnly: on }),
      showImportantFarLevels,
      onShowImportantFarLevelsChange: (on) =>
        updatePrefs({ showImportantFarLevels: on }),
      majorWallsPresetActive: depthRangePreset === "majorWalls",
    };
  }, [
    sourceMode,
    domSource,
    tradeSource,
    perpOverlayOpacityPct,
    depthRangePreset,
    localRangeUsd,
    ladderAutoCenter,
    timeScale.followLive,
    timeScale.setFollowLiveEnabled,
    useEngineRenderer,
    effectiveRightSpacePct,
    visualSettings,
    minVisibleBtc,
    majorWallsOnly,
    showImportantFarLevels,
    applyDepthPreset,
    updatePrefs,
    priceScale,
    resetView,
    setVisualSettings,
  ]);

  const spotDisplay = priceReference ?? tickerSpot;

  return (
    <div className="w-full h-full min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden bg-[#0a0e14]">
      <header className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-terminal-border/70 bg-[#0c111c]">
        <span className="text-[10px] font-bold tracking-widest text-terminal-accent uppercase shrink-0">
          Bookmap
        </span>
        {visualSettings.layout.showTopMetrics && (
          <>
            <span className="text-[10px] font-mono text-slate-300 shrink-0">{symbol}</span>
            <span className="text-[10px] font-mono text-terminal-muted shrink-0">
              {exchange} · {sourceMode}
              {sourceMode === "both" ? ` · dom ${activeDomMarket}` : ""}
            </span>
            {waitingMarkets.length > 0 && (
              <span className="text-[10px] font-mono text-amber-400/80 shrink-0">
                waiting {waitingMarkets.join(", ")}
              </span>
            )}
            <span className="text-[10px] font-mono text-cyan-400/80 shrink-0">
              {useEngineRenderer ? "Live Bookmap" : statusLabel}
            </span>
            <span className="text-[10px] font-mono text-emerald-400/90 shrink-0">
              {spotDisplay != null ? formatHeatmapPrice(spotDisplay) : "—"}
            </span>
            <span className="text-[10px] font-mono text-slate-500 shrink-0 hidden sm:inline">
              {formatBookmapRangeShort(priceRange.minPrice)}–
              {formatBookmapRangeShort(priceRange.maxPrice)}
            </span>
            <span
              className={cn(
                "text-[10px] font-mono shrink-0",
                showTrades && visualSettings.trades.enabled
                  ? "text-emerald-400/80"
                  : "text-slate-600",
              )}
            >
              Trades {showTrades && visualSettings.trades.enabled ? "ON" : "OFF"}
            </span>
            <span
              className={cn(
                "text-[10px] font-mono shrink-0",
                showPersistentWalls ? "text-violet-300/80" : "text-slate-600",
              )}
            >
              Persistent {showPersistentWalls ? "ON" : "OFF"}
            </span>
          </>
        )}

        {perpLiveStale && (
          <div className="pointer-events-none absolute left-2 top-2 z-20 rounded border border-amber-500/50 bg-amber-950/80 px-1.5 py-0.5 text-[9px] font-mono text-amber-200">
            PERP stale
          </div>
        )}
        {visualSettings.layout.showDebug && engineDebugLine && (
          <span
            className={cn(
              "w-full basis-full text-[9px] font-mono px-0.5 leading-relaxed",
              useEngineRenderer ? "text-cyan-400/75" : "text-amber-400/70",
            )}
          >
            {engineDebugLine}
          </span>
        )}

        {visualSettings.layout.showDebug && (
          <details className="w-full basis-full text-[9px] font-mono text-slate-500">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-400 select-none">
              Debug metrics
            </summary>
            <span className="block text-slate-500 mt-1 leading-relaxed">
              label {priceScale.labelStep} · bucket {priceScale.heatmapBucketSize} · trades{" "}
              {tradeLayerDebug.trades} · rightSpace {effectiveRightSpacePct}%
            </span>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-1 ml-auto shrink-0 justify-end">
          <BookmapSegmentGroup
            label="Source"
            value={sourceMode}
            options={[
              { value: "spot", label: "Spot" },
              { value: "perp", label: "Perp" },
              { value: "both", label: "Both" },
            ]}
            onChange={setSourceMode}
          />
          <BookmapToolbarDivider />
          <BookmapSegmentGroup
            label="DOM"
            value={domSource}
            options={[
              { value: "spot", label: "Spot" },
              { value: "perp", label: "Perp" },
            ]}
            onChange={setDomSource}
          />
          <BookmapSegmentGroup
            label="Trades"
            value={tradeSource}
            options={[
              { value: "spot", label: "Spot" },
              { value: "perp", label: "Perp" },
            ]}
            onChange={setTradeSource}
          />
          {showToolbarPerpOpacity && (
            <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted shrink-0">
              Perp
              <select
                value={perpOverlayOpacityPct}
                onChange={(e) =>
                  setPerpOverlayOpacityPct(
                    Number(e.target.value) as (typeof PERP_OVERLAY_OPACITY_OPTIONS)[number],
                  )
                }
                className="bg-[#0c111c] border border-terminal-border rounded px-1 py-0.5 text-[10px] text-slate-300 max-w-[52px]"
              >
                {PERP_OVERLAY_OPACITY_OPTIONS.map((pct) => (
                  <option key={pct} value={pct}>
                    {pct}%
                  </option>
                ))}
              </select>
            </label>
          )}
          <BookmapToolbarDivider />
          <button
            type="button"
            onClick={() => {
              setIndicatorsOpen(false);
              setConfigOpen((o) => !o);
            }}
            className={cn(panelBtnClass, configOpen && "border-cyan-400/60 bg-cyan-950/40")}
          >
            Config
          </button>
          <button
            type="button"
            onClick={() => {
              setConfigOpen(false);
              setIndicatorsOpen((o) => !o);
            }}
            className={cn(panelBtnClass, indicatorsOpen && "border-cyan-400/60 bg-cyan-950/40")}
          >
            Indicators
          </button>
          <BookmapToolbarDivider />
          <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted shrink-0">
            Depth
            <select
              value={depthRangePreset}
              onChange={(e) =>
                applyDepthPreset(e.target.value as DepthRangePreset)
              }
              className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-white text-[10px] max-w-[108px]"
            >
              {DEPTH_RANGE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {depthPresetLabel(p, p === "local" ? localRangeUsd : undefined)}
                </option>
              ))}
            </select>
          </label>
          <BookmapToolbarDivider />
          <BookmapToggleButton
            label={`Follow ${timeScale.followLive ? "ON" : "OFF"}`}
            active={timeScale.followLive}
            onClick={() => timeScale.setFollowLiveEnabled(!timeScale.followLive)}
            disabled={!useEngineRenderer}
            activeClassName="border-cyan-500/40 text-cyan-300"
          />
          <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted shrink-0">
            Right
            <select
              value={effectiveRightSpacePct}
              onChange={(e) => {
                const v = Number(e.target.value);
                bookmapOperational.onRightSpacePctChange(
                  RIGHT_SPACE_PCT_OPTIONS.includes(v as RightSpacePct)
                    ? (v as RightSpacePct)
                    : RIGHT_SPACE_PCT_OPTIONS.reduce((best, o) =>
                        Math.abs(o - v) < Math.abs(best - v) ? o : best,
                      ),
                );
              }}
              className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-white text-[10px] max-w-[56px]"
              disabled={!useEngineRenderer}
            >
              {RIGHT_SPACE_PCT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "OFF" : `${v}%`}
                </option>
              ))}
            </select>
          </label>
          <BookmapToolbarDivider />
          <BookmapToggleButton
            label={`Trades ${showTrades && visualSettings.trades.enabled ? "ON" : "OFF"}`}
            active={showTrades && visualSettings.trades.enabled}
            onClick={() => {
              const next = !showTrades;
              updatePrefs({ showTrades: next });
              setVisualSettings(
                mergeBookmapVisualSettings(visualSettings, {
                  trades: { enabled: next },
                }),
              );
            }}
            activeClassName="border-emerald-500/40 text-emerald-400"
          />
          <BookmapToggleButton
            label={`Persist ${showPersistentWalls ? "ON" : "OFF"}`}
            active={showPersistentWalls}
            onClick={() => {
              const next = !showPersistentWalls;
              updatePrefs({ showPersistentWalls: next });
              setVisualSettings(
                mergeBookmapVisualSettings(visualSettings, {
                  liquidity: { persistenceEnabled: next },
                }),
              );
            }}
            activeClassName="border-violet-500/40 text-violet-300"
          />
        </div>
      </header>

      <div
        ref={bookmapBodyRef}
        className="flex flex-1 min-h-0 min-w-0 overflow-hidden"
      >
        <div className="flex min-h-0 min-w-[240px] flex-1 flex-col overflow-hidden">
          <div
            ref={heatmapContainerRef}
            className={cn(
              "relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[#0b1220]",
              canvasInteraction.cursorClass,
            )}
            title={canvasInteraction.interactionTitle}
            onMouseDown={canvasInteraction.handleMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
          >
            {viewportTooNarrow && (
              <div className="absolute inset-0 z-[25] flex items-center justify-center bg-[#0b1220]/85 px-3 pointer-events-none">
                <p className="text-[11px] font-mono text-amber-200/90 text-center">
                  Viewport too narrow — widen panel or shrink DOM
                </p>
              </div>
            )}
            {import.meta.env.DEV && heatmapPlotHeight > 0 && (
              <>
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none border-t border-cyan-400/70"
                  style={{ top: BOOKMAP_PLOT_PAD.top }}
                />
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none border-b border-cyan-400/70"
                  style={{ top: heatmapPlotHeight - BOOKMAP_PLOT_PAD.bottom }}
                />
              </>
            )}
            {showHeatmapOverlay && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm font-mono text-terminal-muted pointer-events-none">
                No orderbook heatmap data available
              </div>
            )}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            {bothModeDivergence &&
              visualSettings.divergence.showPanel &&
              divergenceDisplaySignals.length > 0 && (
                <SpotPerpDivergencePanel
                  signals={divergenceDisplaySignals}
                  showInvalidation={visualSettings.divergence.showInvalidation}
                  showBias={visualSettings.divergence.showBias}
                  className="absolute left-2 bottom-2 z-[18]"
                />
              )}
            {configOpen && (
              <BookmapControlPanel
                settings={visualSettings}
                operational={bookmapOperational}
                confluence={{
                  bothMode: sourceMode === "both",
                  prefs: confluencePrefs,
                  onChange: (patch) => updatePrefs({ confluence: patch }),
                }}
                onChange={(next) =>
                  setVisualSettings(mergeBookmapVisualSettings(next, {}))
                }
                onClose={() => setConfigOpen(false)}
                onReset={() => {
                  resetVisualSettings();
                  setConfigOpen(false);
                }}
              />
            )}
            {indicatorsOpen && (
              <IndicatorsPanel onClose={() => setIndicatorsOpen(false)} />
            )}
            {useEngineRenderer &&
              (farDepthMarkers.above.length > 0 || farDepthMarkers.below.length > 0) && (
                <div className="absolute inset-0 z-[15] pointer-events-none">
                  {farDepthMarkers.above.map((m, i) => (
                    <button
                      key={`ask-${m.price}`}
                      type="button"
                      className="pointer-events-auto absolute left-1 max-w-[calc(100%-8px)] truncate rounded px-1 py-0 text-left text-[9px] font-mono text-rose-200/95 hover:bg-slate-900/80"
                      style={{ top: BOOKMAP_PLOT_PAD.top + 2 + i * 13 }}
                      onClick={() => {
                        hasUserAdjustedPriceViewportRef.current = true;
                        updatePrefs({ ladderAutoCenter: false });
                        priceScale.setCenterPrice(m.price);
                      }}
                    >
                      ↑ ASK WALL {formatHeatmapPrice(m.price)} · {Math.round(m.sizeBtc)} BTC ·{" "}
                      {m.pctFromSpot >= 0 ? "+" : ""}
                      {m.pctFromSpot.toFixed(1)}%
                    </button>
                  ))}
                  {farDepthMarkers.below.map((m, i) => (
                    <button
                      key={`bid-${m.price}`}
                      type="button"
                      className="pointer-events-auto absolute left-1 max-w-[calc(100%-8px)] truncate rounded px-1 py-0 text-left text-[9px] font-mono text-emerald-200/95 hover:bg-slate-900/80"
                      style={{ bottom: BOOKMAP_PLOT_PAD.bottom + 2 + i * 13 }}
                      onClick={() => {
                        hasUserAdjustedPriceViewportRef.current = true;
                        updatePrefs({ ladderAutoCenter: false });
                        priceScale.setCenterPrice(m.price);
                      }}
                    >
                      ↓ BID WALL {formatHeatmapPrice(m.price)} · {Math.round(m.sizeBtc)} BTC ·{" "}
                      {m.pctFromSpot.toFixed(1)}%
                    </button>
                  ))}
                </div>
              )}
          </div>

          <div className="shrink-0 flex flex-col">
            <div
              role="separator"
              aria-orientation="horizontal"
              className="shrink-0 h-1 cursor-row-resize bg-terminal-border/30 hover:bg-terminal-accent/40 transition-colors"
              onMouseDown={startVolumeResize}
            />
            <DeltaVolumeMatrixPanel
              enabled={deltaPanelEnabled}
              buckets={bookmapTradeAgg.buckets}
              bucketMs={bookmapTradeAgg.bucketMs}
              height={volumeHeight}
              cvd={bookmapTradeAgg.summary.cvd}
            />
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-r border-terminal-border/70",
            "bg-[#0c121a]",
            import.meta.env.DEV && "ring-1 ring-inset ring-cyan-500/35",
          )}
          style={{ width: PRICE_LADDER_WIDTH_PX, minWidth: PRICE_LADDER_WIDTH_PX }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <BookmapPriceLadder
              scale={priceScale}
              spot={priceReference ?? tickerSpot}
              onPriceInteractionStart={onPriceInteractionStart}
            />
          </div>
          <div
            className="shrink-0 border-t border-terminal-border/70 bg-terminal-bg/50"
            style={{ height: volumeHeight + VOLUME_RESIZE_HANDLE_PX }}
            aria-hidden
          />
        </div>

        {visualSettings.dom.enabled && (
        <aside
          className={cn(
            "relative flex min-h-0 shrink-0 flex-col overflow-hidden",
            "bg-[#0a0f18]",
            visualSettings.dom.compactMode && "opacity-95",
            import.meta.env.DEV && "ring-1 ring-inset ring-rose-500/30",
          )}
          style={{ width: safeDomWidth, minWidth: safeDomWidth }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize DOM width"
            className="absolute left-0 top-0 z-30 w-1 -translate-x-1/2 cursor-col-resize hover:bg-terminal-accent/35"
            style={{ bottom: volumeHeight + VOLUME_RESIZE_HANDLE_PX }}
            onMouseDown={startDomResize}
          />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <BookmapDomPanel
              engineMode={useEngineRenderer}
              engineBook={engineBookForDom}
              snapshot={useEngineRenderer ? undefined : latest}
              spot={spot}
              scale={priceScale}
              panelWidth={safeDomWidth}
              viewMode={viewMode}
              importantLevels={importantLevels}
              wallEntries={domWallEntries}
              showImportantStrip={showDomImportantStrip}
            />
          </div>
          <div
            className="flex shrink-0 items-center justify-center border-t border-terminal-border/70 bg-[#0a0f18] px-1"
            style={{ height: volumeHeight + VOLUME_RESIZE_HANDLE_PX }}
          >
            {deltaPanelEnabled ? (
              <BookmapCvdGauge
                value={bookmapTradeAgg.summary.cvd}
                width={Math.min(170, Math.max(120, safeDomWidth - 24))}
                height={Math.min(130, Math.max(90, volumeHeight + VOLUME_RESIZE_HANDLE_PX - 8))}
                cvdSamples={cvdSamples}
              />
            ) : (
              <div className="text-[9px] font-mono text-slate-600">CVD —</div>
            )}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
