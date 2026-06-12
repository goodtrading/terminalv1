import {
  BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3,
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_GRANULAR_ALPHA_MOD_MIN,
  BOOKMAP_GRANULAR_ALPHA_MOD_RANGE,
  BOOKMAP_GRANULAR_LIVE_PROJECTION_ALPHA_MUL,
  BOOKMAP_GRANULAR_MATRIX_RENDERER_V1,
  BOOKMAP_GRANULAR_MAX_WIDTH_MACRO_PX,
  BOOKMAP_GRANULAR_MAX_WIDTH_SCALP_PX,
  BOOKMAP_GRANULAR_MAX_WIDTH_STD_PX,
  BOOKMAP_HEATMAP_DEPTH_PASS_V2,
  BOOKMAP_HORIZONTAL_PERSISTENCE_V2,
  BOOKMAP_MATRIX_AUDIT_DIAG,
  BOOKMAP_MATRIX_TEXTURE_MODE_V1,
  BOOKMAP_NATURAL_MATRIX_LOGIC_V1,
  BOOKMAP_PERSISTENT_WALL_ANCHORING_V1,
  BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1,
  BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1,
  BOOKMAP_SURFACE_RENDERER_V1,
  BOOKMAP_CANONICAL_HEATMAP_V1,
  ANCHORED_WALL_BASE_ALPHA_MUL,
  ANCHORED_WALL_CORE_ALPHA_MUL,
  ANCHORED_WALL_GLOW_ALPHA_MUL,
  ANCHORED_WALL_PROJECTION_ALPHA_MUL,
  ANCHORED_WALL_SEAM_BLEND_PCT,
  computeVisiblePriceRangePct,
  resolveZoomRegime,
  NATURAL_MATRIX_ALPHA_FADING,
  NATURAL_MATRIX_ALPHA_NEW,
  NATURAL_MATRIX_ALPHA_PERSISTENT,
  NATURAL_MATRIX_ALPHA_REINFORCED,
  NATURAL_MATRIX_ALPHA_STALE,
  NATURAL_MATRIX_JITTER_X_MAX_PX,
  NATURAL_MATRIX_MAX_FRAGMENT_BUCKETS,
  NATURAL_MATRIX_WEAK_VISIBILITY_BOOST,
  NATURAL_MATRIX_WIDTH_VARIANCE,
  BOOKMAP_RENDER_PATH_PROOF_DIAG,
  BOOKMAP_TEXTURE_CALIBRATION_V2,
  computeVisiblePriceRangePct,
  DEPTH_V2_NEAR_PRICE_PCT,
  H_PERSIST_V2_SOLID_BASE_ALPHA_MUL,
  H_PERSIST_V2_SOLID_BASE_MIN_INTENSITY,
  PALETTE_ALPHA_CLOSED_OLD_MUL,
  PALETTE_ALPHA_CLOSED_RECENT_MUL,
  PERP_RENDER_ACTIVE_CAP,
  PERP_RENDER_CLOSED_CAP,
  resolveZoomRegime,
  TEX_CALIB_V2_INNER_CORE_ALPHA_MUL,
  TEX_CALIB_V2_INNER_CORE_WIDTH_PCT,
  TEX_CALIB_V2_ORGANIC_EDGE_FADE_PCT,
  TEX_CALIB_V2_STRONG_BASE_ALPHA_CAP,
  TEX_CALIB_V2_WEAK_DEPTH_ALPHA_MUL,
  TEX_CALIB_V2_WEAK_TEXTURE_MIN_INTENSITY,
  V3_INNER_CORE_MIN_INTENSITY,
  V3_ORGANIC_EDGE_FADE_PCT,
  V3_ORGANIC_MIN_INTENSITY,
  V3_SOLID_BASE_REINFORCE_MUL,
  V3_STRONG_BASE_ALPHA_CAP,
  V3_WEAK_DEPTH_ALPHA_MUL,
  V3_WEAK_TEXTURE_MIN_INTENSITY,
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
  type BookmapZoomRegime,
} from "@/lib/bookmapEngineConfig";
import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import { formatHeatmapPrice } from "./liquidityHeatmapUtils";
import type {
  BookmapL2BandContinuityTruth,
  BookmapMicroVisualHierarchyTruth,
  BookmapPaletteParityTruth,
  BookmapPerpFilterTruth,
  BookmapVisualParityTruth,
  BookmapVisualRenderStats,
  BookmapP74SpanAudit,
  HistoricalColorLockAudit,
  HistoricalColorRetentionTruth,
  HistoricalSpanColorAudit,
  PreparedL2BandDrawSegment,
  SpanRenderContinuityAudit,
  SpanTextureBalanceAudit,
  MicroScalpVisualContext,
  PreparedEngineRenderData,
  PreparedEngineTextureCell,
  PreparedLiveProjectionLevel,
  StableL2FillEntry,
} from "./bookmapEnginePrepare";
import {
  applyPerpRenderSpanFilter,
  buildBookmapL2BandContinuityTruth,
  buildBookmapMicroVisualHierarchyTruth,
  BOOKMAP_TEXTURE_CHUNK_OVERLAY_MIN_WIDTH_PX,
  BOOKMAP_TEXTURE_INTERNAL_CHUNK_OVERLAY_ALPHA,
  BOOKMAP_TEXTURE_SPAN_BASE_RENDER_ENABLED,
  buildBookmapP74SpanAudit,
  buildHistoricalColorLockAuditFromRetention,
  createEmptySpanRenderContinuityAudit,
  createEmptySpanTextureBalanceAudit,
  buildBookmapPaletteParityTruth,
  buildBookmapVisualParityTruth,
  buildPassiveLiquidityAlphaContext,
  resolveEffectiveChunkOverlayAlpha,
  getAggressiveHeatmapCalibrationV3PrepareStats,
  computeBookmapVisualWeight,
  computeViewportSizeStats,
  createEmptyBookmapL2BandContinuityStats,
  createEmptyBookmapMicroVisualHierarchyStats,
  createEmptyBookmapPaletteParityStats,
  createEmptyBookmapVisualRenderStats,
  isRelevantL2Liquidity,
  mapWallSizeToStableVisualIntensity,
  prepareL2BandDrawQueue,
  prepareWallBandsForContinuousRender,
  recordBookmapMicroVisualHierarchySample,
  recordBookmapPaletteParitySample,
  recordBookmapVisualAlphaSample,
  resolvePerpRenderFilterTarget,
  stableL2FillKey,
} from "./bookmapEnginePrepare";
import {
  computeMicroDataIntensity,
  microContinuityScore,
  microPersistenceScore,
  microProximityScore,
  type HistoricalTextureSpanPeakLock,
} from "@/lib/bookmapIntensity";
import type { BookmapSourceMode } from "@shared/bookmapSourceMode";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import {
  BOOKMAP_LIVE_PROJECTION_HISTORY_OVERLAP_MS,
  BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS,
  BOOKMAP_LIVE_PROJECTION_MIN_MAJOR_BTC,
  BOOKMAP_LIVE_PROJECTION_MIN_RENDER_INTENSITY,
  BOOKMAP_TEXTURE_CELL_OVERLAP_PX,
  BOOKMAP_TEXTURE_CONTINUOUS_MODE,
  BOOKMAP_TEXTURE_MAX_DRAW_CELLS,
  BOOKMAP_TEXTURE_MIN_CELL_WIDTH_PX,
  BOOKMAP_TEXTURE_MIN_RENDER_INTENSITY,
  BOOKMAP_TEXTURE_NEAR_MID_1_PCT,
  BOOKMAP_TEXTURE_NEAR_MID_PCT,
  BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
  BOOKMAP_TEXTURE_SAMPLER_MS,
} from "./bookmapEnginePrepare";
import { bucketPrice } from "./domLadderUtils";
import { pickWallLabels, type WallLabelPlacement } from "./bookmapBandPrepare";
import {
  isWallTier,
  tierFromMaxSize,
  type HeatmapBand,
} from "./bookmapBandTypes";

/** Texture global opacity — solid Bookmap-class fills on dark canvas. */
const BOOKMAP_TEXTURE_OPACITY_MUL = 1;
const BOOKMAP_TEXTURE_OVERLAY_OPACITY_MUL = 0.72;
/** Passive bands use body alpha from palette — global heatmap opacity only. */
const BOOKMAP_WALL_BAND_OPACITY_MUL = 1;
import {
  alphaForPassiveLiquidity,
  alphaForTextureIntensity,
  getBookmapBandStroke,
  getHistoricalTextureFill,
  getPassiveLiquidityFill,
  intensityToMicroHistoricalTextureRgb,
  intensityToPassiveLiquidityRgb,
  getWallLabelColor,
  getWallLabelText,
  microAlphaFromRenderIntensity,
  MICRO_TEXTURE_ALPHA_MAX,
  MICRO_TEXTURE_ALPHA_MUL,
  resolveDepthPassNearPriceAlphaBoost,
  resolveOrganicWallBodyAlpha,
  resolveOrganicWallCoreIntensity,
  resolveAggressiveOverlayScale,
  qualifiesOrganicInnerCore,
  resolveAnchoredWallBodyRgb,
  resolveAnchoredWallCoreRgb,
  resolveAnchoredWallGlowRgb,
  resolveAnchoredWallLifecycleAlphaMul,
} from "@/lib/bookmapBandColors";
import { getBookmapPerpOverlayFill } from "@/lib/bookmapPerpOverlayColors";
import {
  HEATMAP_PAD,
  renderCrosshair,
  renderHeatmapBackground,
  renderPriceGrid,
  renderSpotLine,
  type BookmapCrosshair,
  type BookmapHeatmapRenderParams,
} from "./bookmapHeatmapRenderer";
import type { BookmapPlotMetrics } from "./bookmapHeatmapRenderer";
import type { BookmapVisualSettings } from "@/components/terminal/bookmap/bookmapSettings";
import {
  renderBookmapBidAskGuideLines,
  type BookmapBbo,
  type BidAskLineOpacity,
} from "./bookmapBboGuideLines";
import {
  getBboPathPlotBounds,
  renderHistoricalBboPath,
  type BboPathRenderStats,
} from "./bookmapBboHistoryPath";
import type { BookmapBboPoint } from "@shared/bookmapBboHistory";
import { renderDivergenceMarkers } from "./bookmapDivergenceMarkers";
import type { SpotPerpDivergenceSignal } from "./bookmapDivergenceEngine";
import { renderEngineExecutionRails } from "./bookmapExecutionRails";
import {
  EMPTY_TRADE_DOT_RENDER_STATS,
  renderEngineTradeDots,
  type EngineTradeDot,
  type EngineTradeDotRenderStats,
  type TradeDotVisualContext,
} from "./bookmapEngineTradeDots";
import {
  drawSurfaceRendererWatermark,
  paintBookmapSurfaceRendererFrame,
} from "./bookmapSurfaceRenderer";
import {
  drawCanonicalHeatmapWatermark,
  paintBookmapCanonicalHeatmapFrame,
} from "./bookmapCanonicalHeatmap";
import type { ExecutionRailLength } from "@/components/terminal/bookmap/bookmapSettings";
import type { PassiveConfluenceLevel } from "./bookmapConfluence";
import type { BookmapLayerAudit } from "./bookmapLayerAudit";
import { buildBookmapLayerAudit } from "./bookmapLayerAudit";
import type { MicroScalpLayerRenderStats } from "./bookmapMicroScalpLayerAudit";
import type { BookmapRenderArchitectureFrameStats } from "./bookmapRenderArchitectureAudit";
import {
  clipHistoricalSpanToDataEdge,
  dedupeLiveProjectionAgainstActiveDom,
  filterWallBandsForLiveSeam,
  resolveLiveProjectionStrictStart,
  resolveWallBandRenderEndTime,
} from "./bookmapLayerResponsibilities";
import {
  applyLiveDomHierarchyVisual,
  buildLiquidityContinuityPlan,
  computeLiveDomVisualScore,
  createEmptyLiveDomRenderCapture,
  enrichLiquidityContinuityStatsFromRender,
  getLiquidityVisualKey,
  lookupLiveContinuityResolution,
  normalizeLiquidityBucketPrice,
  resolveLiveDomAlphaCap,
  resolveLiveDomContinuationVisual,
  type LiquidityContinuityPlan,
  type LiveDomRenderCapture,
} from "./bookmapLiquidityVisualIdentity";
import {
  applyQuantileVisualExpansion,
  computeScoreQuantiles,
  createEmptyRightSideDensityCapture,
  isProtectedLiveDomLevel,
  recordLiveDomDensityTier,
  resolveWallBandRightSideAlphaCap,
  shouldSkipLiveDomForDensity,
  type RightSideDensityRenderCapture,
} from "./bookmapRightSideDensity";
import {
  applyRightSideTemporalFade,
  BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY,
  classifyRightSideFadeTier,
  resolveTextureSourceKindForPrepared,
} from "./bookmapPassiveBaseTexture";
import {
  applyStableGapModulation,
  applyWallBandBaseIntegrationAlpha,
  BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE,
  clampBookmapLikeRenderIntensity,
  classifyRightSideLengthTier,
  finalizeDotsReadabilityStats,
  finalizeColorHierarchyStats,
  recordHeatmapAlphaNearDots,
  resolveRightSideVisualLengthFraction,
  stableVisualHash,
} from "./bookmapVisualForceBookmapLike";
import type {
  ConfluenceMinDisplayTier,
  ConfluenceVisualOpacity,
} from "./bookmapConfluenceConfig";
import {
  pickConfluenceLabels,
  renderConfluenceLabels,
  renderPassiveConfluenceOverlay,
  type ConfluenceRenderMode,
} from "./bookmapConfluenceRenderer";
import {
  resolveAnchoredWallAlphaMultiplier,
  type AnchoredWallEntity,
  type MacroDomCoverageDiagStats,
  type WallAnchoringDiagStats,
} from "./bookmapWallAnchoring";

export type BookmapEngineFrameParams = {
  width: number;
  height: number;
  minPrice: number;
  maxPrice: number;
  spot: number | null;
  priceToY: (price: number) => number;
  heatmapBucketSize: number;
  /** DOM ladder tick step for BBO guide line row snapping. */
  domBucketSize?: number;
  crosshair?: BookmapCrosshair;
  engine: PreparedEngineRenderData;
  timeViewport: BookmapTimeViewport;
  showFarWallMarkers?: boolean;
  /** Clustered trade dots (engine overlay). */
  tradeDots?: EngineTradeDot[];
  /** Optional scalar counters for forensic dot-clip diagnosis (DEV). */
  tradeDotRenderStatsOut?: EngineTradeDotRenderStats;
  tradeDotVerticalMode?: VerticalCompressionMode;
  tradeDotVisual?: TradeDotVisualContext;
  executionRailsEnabled?: boolean;
  executionRailLength?: ExecutionRailLength;
  visualSettings?: BookmapVisualSettings;
  /** Perp ghost layer in Both mode (drawn after primary bands). */
  overlayEngine?: PreparedEngineRenderData;
  overlayOpacity?: number;
  /** Passive S+P confluence (Both mode only). */
  confluenceLevels?: PassiveConfluenceLevel[];
  showConfluenceLabels?: boolean;
  confluenceVisualOpacity?: ConfluenceVisualOpacity;
  confluenceRenderMode?: ConfluenceRenderMode;
  confluenceMinDisplayTier?: ConfluenceMinDisplayTier;
  /** Historical bid/ask paths (time series). */
  bboHistoryPoints?: BookmapBboPoint[];
  showHistoricalBboPath?: boolean;
  bboPathOpacity?: BidAskLineOpacity;
  /** Live-edge BBO guide (not full-history). */
  bboGuide?: BookmapBbo | null;
  showBidAskLines?: boolean;
  bidAskLineOpacity?: BidAskLineOpacity;
  divergenceMarkers?: SpotPerpDivergenceSignal[];
  /** Phase 6A — PERP render filter scope (spot unchanged). */
  sourceMode?: BookmapSourceMode;
  activeDomMarket?: BookmapMarketSource;
  /** DEV — PERP filter truth snap (scalar, no arrays). */
  perpFilterTruthOut?: BookmapPerpFilterTruth;
  /** DEV — visual parity truth snap (scalar, no arrays). */
  visualParityTruthOut?: BookmapVisualParityTruth;
  /** DEV — L2 band continuity truth snap (scalar, no arrays). */
  l2BandContinuityTruthOut?: BookmapL2BandContinuityTruth;
  /** DEV — palette parity truth snap (scalar, no arrays). */
  paletteParityTruthOut?: BookmapPaletteParityTruth;
  /** DEV — micro scalping visual hierarchy truth (historical texture only). */
  microHierarchyTruthOut?: BookmapMicroVisualHierarchyTruth;
  /** DEV — historical texture color retention truth. */
  historicalColorRetentionTruthOut?: HistoricalColorRetentionTruth;
  /** DEV — historical lock audit truth. */
  historicalColorLockAuditOut?: HistoricalColorLockAudit;
  /** DEV — historical span color audit. */
  historicalSpanColorAuditOut?: HistoricalSpanColorAudit;
  /** DEV — P7.4 span audit. */
  p74SpanAuditOut?: BookmapP74SpanAudit;
  /** DEV — span render continuity audit. */
  spanRenderContinuityAuditOut?: SpanRenderContinuityAudit;
  /** DEV — span texture balance audit. */
  spanTextureBalanceAuditOut?: SpanTextureBalanceAudit;
  /** Session cache — span peak intensity per resting run. */
  spanPeakCache?: Map<string, HistoricalTextureSpanPeakLock>;
  /** P7.2/P7.4 — optional texture draw counters (DEV diagnostics). */
  textureRenderStatsOut?: {
    renderedTextureCellCount: number;
    cellsFilteredByTime: number;
    textureDrawCapHit: boolean;
    avgTextureCellWidthPx?: number;
    minTextureCellWidthPx?: number;
    maxTextureCellWidthPx?: number;
    effectiveTextureBucketMs?: number;
    textureContinuousMode?: string;
  };
  /** P7.5/P7.6 — live book forward projection stats (DEV diagnostics). */
  liveProjectionRenderStatsOut?: {
    renderedLiveProjectionCount: number;
    projectionStartTime?: number;
    projectionEndTime?: number;
    avgProjectionWidthPx?: number;
    minProjectionWidthPx?: number;
    maxProjectionWidthPx?: number;
    projectionOverlapsHistory?: boolean;
  };
  /** DEV — populated each frame with [BOOKMAP_LAYER_AUDIT] payload. */
  layerAuditSink?: { audit: BookmapLayerAudit | null };
  /** DEV — micro scalping right-side render counters. */
  microScalpLayerAuditSink?: { stats: MicroScalpLayerRenderStats | null };
  /** DEV — render architecture frame counters (scalar, per frame). */
  renderArchitectureFrameStatsOut?: BookmapRenderArchitectureFrameStats;
  showDivergenceMarkers?: boolean;
};

export type { BboPathRenderStats };

type EnginePlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
  priceStep: number;
  domBucketSize: number;
};

function buildEnginePlotMetrics(params: BookmapEngineFrameParams): EnginePlotMetrics | null {
  const { width: w, height: h, timeViewport } = params;
  const plotW = w - HEATMAP_PAD.left - HEATMAP_PAD.right;
  const plotH = h - HEATMAP_PAD.top - HEATMAP_PAD.bottom;
  const timeSpan = timeViewport.visibleEndTime - timeViewport.visibleStartTime;

  if (plotW <= 0 || plotH <= 0 || timeSpan <= 0) return null;

  const plotLeft = HEATMAP_PAD.left;
  const timeToX = (timeMs: number) => {
    const t = (timeMs - timeViewport.visibleStartTime) / timeSpan;
    return plotLeft + Math.max(0, Math.min(1, t)) * plotW;
  };

  return {
    plotW,
    plotH,
    priceToY: params.priceToY,
    timeToX,
    priceStep: Math.max(1, params.heatmapBucketSize),
    domBucketSize: Math.max(1, params.domBucketSize ?? params.heatmapBucketSize),
  };
}

function metricsForCrosshair(metrics: EnginePlotMetrics): BookmapPlotMetrics {
  return {
    plotW: metrics.plotW,
    plotH: metrics.plotH,
    priceToY: metrics.priceToY,
    columnWidth: 4,
    colOffset: 0,
    cellHeight: 4,
    priceStep: metrics.priceStep,
    columns: [],
    maxForIntensity: 1,
    minVisibleBtc: 1,
    majorWallsOnly: false,
    totalCells: 0,
  };
}

function renderEngineTimeGrid(ctx: CanvasRenderingContext2D, metrics: EnginePlotMetrics) {
  const { plotW, plotH } = metrics;
  ctx.strokeStyle = "rgba(30, 58, 95, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = HEATMAP_PAD.left + (i / 10) * plotW;
    ctx.beginPath();
    ctx.moveTo(x, HEATMAP_PAD.top);
    ctx.lineTo(x, HEATMAP_PAD.top + plotH);
    ctx.stroke();
  }
}

/** Live data edge — boundary before right-side projection zone. */
function renderLiveDataEdge(
  ctx: CanvasRenderingContext2D,
  metrics: EnginePlotMetrics,
  timeViewport: BookmapTimeViewport,
) {
  if (timeViewport.rightSpacePct <= 0) return;
  if (timeViewport.dataEndTime >= timeViewport.visibleEndTime - 500) return;

  const x = metrics.timeToX(timeViewport.dataEndTime);
  if (x <= HEATMAP_PAD.left || x >= HEATMAP_PAD.left + metrics.plotW) return;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, HEATMAP_PAD.top);
  ctx.lineTo(x, HEATMAP_PAD.top + metrics.plotH);
  ctx.stroke();
  ctx.setLineDash([]);
}

function resolveBandEndTime(
  band: HeatmapBand,
  dataEndTime: number,
  _projectionEndTime: number,
): number {
  return resolveWallBandRenderEndTime(band, dataEndTime);
}

/** Single vertical geometry for texture, wall bands, and live projection. */
function heatmapLevelVerticalBounds(
  price: number,
  priceToY: (p: number) => number,
  priceStep: number,
): { yTop: number; height: number } {
  const yCenter = priceToY(price);
  const yEdge = priceToY(price - priceStep);
  const bucketH = Math.max(2, Math.abs(yEdge - yCenter) || 3);
  return {
    yTop: yCenter - bucketH / 2,
    height: bucketH + 0.5,
  };
}

function bandVerticalBounds(
  band: HeatmapBand,
  priceToY: (p: number) => number,
  priceStep: number,
): { yTop: number; height: number } {
  return heatmapLevelVerticalBounds(band.price, priceToY, priceStep);
}

/** P7.4 — DOM-aligned texture row height (same bucket as ladder). */
function textureCellVerticalBounds(
  price: number,
  priceToY: (p: number) => number,
  domBucketSize: number,
): { yTop: number; height: number } {
  const alignedPrice = bucketPrice(price, domBucketSize);
  const yCenter = priceToY(alignedPrice);
  const yEdge = priceToY(alignedPrice - domBucketSize);
  const bucketH = Math.max(2, Math.abs(yEdge - yCenter) || 2);
  const height = Math.max(3, Math.min(bucketH + 0.5, 10));
  return {
    yTop: yCenter - height / 2,
    height,
  };
}

/** Merge adjacent spans at the same price so maintained limits draw as one band. */
function coalesceAdjacentTextureSpans(
  cells: PreparedEngineTextureCell[],
): PreparedEngineTextureCell[] {
  if (cells.length <= 1) return cells;

  const byKey = new Map<string, PreparedEngineTextureCell[]>();
  for (const cell of cells) {
    const key = `${cell.side}:${cell.price}`;
    const group = byKey.get(key) ?? [];
    group.push(cell);
    byKey.set(key, group);
  }

  const merged: PreparedEngineTextureCell[] = [];
  for (const group of Array.from(byKey.values())) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);
    let current: PreparedEngineTextureCell = { ...group[0]! };
    let currentEnd =
      current.endTimeBucket ??
      current.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;

    for (let i = 1; i < group.length; i += 1) {
      const next = group[i]!;
      const nextEnd =
        next.endTimeBucket ?? next.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
      const gap = next.timeBucket - currentEnd;
      if (gap <= BOOKMAP_TEXTURE_SAMPLER_MS * 2) {
        currentEnd = Math.max(currentEnd, nextEnd);
        current = {
          ...current,
          endTimeBucket: currentEnd,
          maxSizeInBucket: Math.max(
            current.maxSizeInBucket,
            next.maxSizeInBucket,
          ),
          intensity: Math.max(current.intensity ?? 0, next.intensity ?? 0),
        };
      } else {
        merged.push({ ...current, endTimeBucket: currentEnd });
        current = { ...next };
        currentEnd = nextEnd;
      }
    }
    merged.push({ ...current, endTimeBucket: currentEnd });
  }

  return merged;
}

function textureDrawPriorityScore(
  cell: PreparedEngineTextureCell,
  midPrice: number | null | undefined,
  timeMax: number,
  visibleStart: number,
  visibleEnd: number,
): number {
  const sizeScore = Math.sqrt(Math.max(0, cell.maxSizeInBucket));
  const ageMs = timeMax > 0 ? Math.max(0, timeMax - cell.timeBucket) : 0;
  const retentionAge = Math.max(0, 1 - ageMs / (90 * 60 * 1000));
  const spanEnd =
    cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
  const inViewport =
    spanEnd >= visibleStart && cell.timeBucket <= visibleEnd ? 2.8 : 0;
  let nearScore = 0;
  if (midPrice != null && midPrice > 0) {
    const pct = (Math.abs(cell.price - midPrice) / midPrice) * 100;
    if (pct <= BOOKMAP_TEXTURE_NEAR_MID_1_PCT) nearScore = 3;
    else if (pct <= BOOKMAP_TEXTURE_NEAR_MID_PCT) nearScore = 2;
    else if (pct <= 5) nearScore = 1;
  }
  return (
    sizeScore * 0.32 +
    retentionAge * 0.18 +
    nearScore * 0.28 +
    inViewport * 0.45
  );
}

type TextureVisualRenderContext = {
  regime: BookmapZoomRegime;
  midPrice: number | null;
  dataEndTime: number;
  now: number;
  viewportMaxSize: number;
  visualStats?: BookmapVisualRenderStats;
  l2Stats?: ReturnType<typeof createEmptyBookmapL2BandContinuityStats>;
  paletteStats?: ReturnType<typeof createEmptyBookmapPaletteParityStats>;
  microHierarchyStats?: ReturnType<
    typeof createEmptyBookmapMicroVisualHierarchyStats
  >;
  historicalColorLockAudit?: {
    alphaFrozenCellCount: number;
    alphaFinalSum: number;
    intensityFinalSum: number;
    renderSampleCount: number;
  };
  spanColorAuditOut?: HistoricalSpanColorAudit;
  spanRenderContinuityAuditOut?: SpanRenderContinuityAudit;
  spanTextureBalanceAuditOut?: SpanTextureBalanceAudit;
  spanPeakCache?: Map<string, HistoricalTextureSpanPeakLock>;
  microScalpMode?: boolean;
  microVisualHierarchyActive?: boolean;
  microScalpVisual?: MicroScalpVisualContext;
  stableL2FillByKey?: Map<string, StableL2FillEntry>;
  historicalActiveAlphaByKey?: Map<string, number>;
};

type TextureSpanRenderGroup = {
  key: string;
  spanStart: number;
  spanEnd: number;
  peakIntensity: number;
  segments: PreparedL2BandDrawSegment[];
  representative: PreparedL2BandDrawSegment;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveInternalOverlayRatioBounds(
  microVisualMode: boolean,
  regime: BookmapZoomRegime,
): { min: number; max: number } {
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    if (microVisualMode) return { min: 0.24, max: 0.34 };
    if (regime === "ultra_micro" || regime === "scalp") {
      return { min: 0.18, max: 0.28 };
    }
    if (regime === "micro") return { min: 0.14, max: 0.24 };
    return { min: 0.1, max: 0.16 };
  }
  if (BOOKMAP_TEXTURE_CALIBRATION_V2) {
    if (microVisualMode) return { min: 0.2, max: 0.28 };
    if (regime === "ultra_micro" || regime === "scalp") {
      return { min: 0.14, max: 0.22 };
    }
    if (regime === "micro") return { min: 0.12, max: 0.18 };
    return { min: 0.06, max: 0.11 };
  }
  if (microVisualMode) return { min: 0.18, max: 0.26 };
  if (regime === "scalp" || regime === "micro") return { min: 0.12, max: 0.2 };
  return { min: 0.08, max: 0.14 };
}

type WallOrganicRenderDiagStats = {
  organicSpanCount: number;
  innerCoreCount: number;
  edgeFadeCount: number;
  weakDepthCount: number;
  nearPriceBoostCount: number;
  skippedOverlayCount: number;
  overlaySpanCount: number;
  baseAlphaMin: number;
  baseAlphaMax: number;
  weakSpansDrawn: number;
  mediumSpansDrawn: number;
  strongSpansDrawn: number;
  solidBaseAlphaSum: number;
  solidBaseAlphaCount: number;
  textureOverlayAlphaSum: number;
  textureOverlayAlphaCount: number;
};

let lastWallOrganicRenderDiagStats: WallOrganicRenderDiagStats = {
  organicSpanCount: 0,
  innerCoreCount: 0,
  edgeFadeCount: 0,
  weakDepthCount: 0,
  nearPriceBoostCount: 0,
  skippedOverlayCount: 0,
  overlaySpanCount: 0,
  baseAlphaMin: 0,
  baseAlphaMax: 0,
  weakSpansDrawn: 0,
  mediumSpansDrawn: 0,
  strongSpansDrawn: 0,
  solidBaseAlphaSum: 0,
  solidBaseAlphaCount: 0,
  textureOverlayAlphaSum: 0,
  textureOverlayAlphaCount: 0,
};

export function getAggressiveHeatmapCalibrationV3RenderStats(): WallOrganicRenderDiagStats {
  return lastWallOrganicRenderDiagStats;
}

export type RenderMatrixDiagStats = {
  visibleTextureCells: number;
  visibleSpans: number;
  weakDrawn: number;
  mediumDrawn: number;
  strongDrawn: number;
  liveProjectionSpans: number;
  historicalSpans: number;
  granularMatrixCells: number;
  solidBaseSpans: number;
  granularOverlaySpans: number;
  skippedForAlpha: number;
  skippedForSize: number;
  skippedForViewport: number;
  timestamp: number;
};

let lastRenderMatrixDiag: RenderMatrixDiagStats = {
  visibleTextureCells: 0,
  visibleSpans: 0,
  weakDrawn: 0,
  mediumDrawn: 0,
  strongDrawn: 0,
  liveProjectionSpans: 0,
  historicalSpans: 0,
  granularMatrixCells: 0,
  solidBaseSpans: 0,
  granularOverlaySpans: 0,
  skippedForAlpha: 0,
  skippedForSize: 0,
  skippedForViewport: 0,
  timestamp: 0,
};

export function getRenderMatrixDiagStats(): RenderMatrixDiagStats {
  return lastRenderMatrixDiag;
}

export type LiveVsHistoricalDiagStats = {
  historicalTextureCount: number;
  liveProjectionCount: number;
  historicalAlphaAvg: number;
  liveProjectionAlphaAvg: number;
  liveProjectionDominates: boolean;
  projectionWidthPx: number;
  historicalWidthPx: number;
  timestamp: number;
};

let lastLiveVsHistoricalDiag: LiveVsHistoricalDiagStats = {
  historicalTextureCount: 0,
  liveProjectionCount: 0,
  historicalAlphaAvg: 0,
  liveProjectionAlphaAvg: 0,
  liveProjectionDominates: false,
  projectionWidthPx: 0,
  historicalWidthPx: 0,
  timestamp: 0,
};

let lastRenderMatrixDiagLogMs = 0;
let lastLiveVsHistoricalDiagLogMs = 0;

export function getLiveVsHistoricalDiagStats(): LiveVsHistoricalDiagStats {
  return lastLiveVsHistoricalDiag;
}

export type GranularMatrixRendererDiagStats = {
  granularCellsInput: number;
  granularCellsDrawn: number;
  avgGranularWidthPx: number;
  maxGranularWidthPx: number;
  granularCellsOverSpanWidthCount: number;
  weakGranularDrawn: number;
  mediumGranularDrawn: number;
  strongSpanDrawn: number;
  liveProjectionDrawn: number;
  timestamp: number;
};

let lastGranularMatrixRendererDiag: GranularMatrixRendererDiagStats = {
  granularCellsInput: 0,
  granularCellsDrawn: 0,
  avgGranularWidthPx: 0,
  maxGranularWidthPx: 0,
  granularCellsOverSpanWidthCount: 0,
  weakGranularDrawn: 0,
  mediumGranularDrawn: 0,
  strongSpanDrawn: 0,
  liveProjectionDrawn: 0,
  timestamp: 0,
};

let lastGranularMatrixRendererDiagLogMs = 0;

export function getGranularMatrixRendererDiagStats(): GranularMatrixRendererDiagStats {
  return lastGranularMatrixRendererDiag;
}

function emitGranularMatrixRendererDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_GRANULAR_MATRIX_RENDERER_V1) return;
  const now = Date.now();
  if (now - lastGranularMatrixRendererDiagLogMs < 2_000) return;
  lastGranularMatrixRendererDiagLogMs = now;
  console.debug("[BOOKMAP_GRANULAR_MATRIX_RENDERER_V1_DIAG]", {
    ...lastGranularMatrixRendererDiag,
  });
}

export type NaturalMatrixLogicDiagStats = {
  granularCellsInput: number;
  granularCellsDrawn: number;
  miniFragmentsDrawn: number;
  persistentFragments: number;
  newCells: number;
  fadingCells: number;
  reinforcedCells: number;
  wallCandidates: number;
  avgCellWidthPx: number;
  avgFragmentWidthPx: number;
  avgAlphaWeak: number;
  avgAlphaMedium: number;
  avgAlphaStrong: number;
  gridUniformityScore: number;
  timestamp: number;
};

let lastNaturalMatrixLogicDiag: NaturalMatrixLogicDiagStats = {
  granularCellsInput: 0,
  granularCellsDrawn: 0,
  miniFragmentsDrawn: 0,
  persistentFragments: 0,
  newCells: 0,
  fadingCells: 0,
  reinforcedCells: 0,
  wallCandidates: 0,
  avgCellWidthPx: 0,
  avgFragmentWidthPx: 0,
  avgAlphaWeak: 0,
  avgAlphaMedium: 0,
  avgAlphaStrong: 0,
  gridUniformityScore: 1,
  timestamp: 0,
};

let lastNaturalMatrixLogicDiagLogMs = 0;

export function getNaturalMatrixLogicDiagStats(): NaturalMatrixLogicDiagStats {
  return lastNaturalMatrixLogicDiag;
}

function emitNaturalMatrixLogicDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_NATURAL_MATRIX_LOGIC_V1) return;
  const now = Date.now();
  if (now - lastNaturalMatrixLogicDiagLogMs < 2_000) return;
  lastNaturalMatrixLogicDiagLogMs = now;
  console.debug("[BOOKMAP_NATURAL_MATRIX_LOGIC_V1_DIAG]", {
    ...lastNaturalMatrixLogicDiag,
  });
}

let lastWallAnchoringDiag: WallAnchoringDiagStats = {
  wallCandidates: 0,
  anchoredWalls: 0,
  activeWalls: 0,
  historicalWalls: 0,
  farMacroWalls: 0,
  fadingWalls: 0,
  reinforcedWalls: 0,
  pullingWalls: 0,
  touchedWalls: 0,
  dominantWalls: 0,
  avgWallAgeSec: 0,
  maxWallAgeSec: 0,
  avgPersistenceSec: 0,
  maxPersistenceSec: 0,
  liveProjectionConnected: 0,
  timestamp: 0,
};

let lastMacroDomCoverageDiag: MacroDomCoverageDiagStats = {
  zoomRegime: "macro",
  visiblePriceMin: 0,
  visiblePriceMax: 0,
  domLevelsVisible: 0,
  domLargeLevelsVisible: 0,
  domLargeLevelsRendered: 0,
  farBidWallsRendered: 0,
  farAskWallsRendered: 0,
  domMatchedAnchors: 0,
  domUnmatchedLargeWalls: 0,
  skippedByDistance: 0,
  skippedByCap: 0,
  skippedBySize: 0,
  timestamp: 0,
};

let lastWallAnchoringDiagLogMs = 0;
let lastMacroDomCoverageDiagLogMs = 0;

export function getWallAnchoringDiagStats(): WallAnchoringDiagStats {
  return lastWallAnchoringDiag;
}

export function getMacroDomCoverageDiagStats(): MacroDomCoverageDiagStats {
  return lastMacroDomCoverageDiag;
}

function emitWallAnchoringDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_PERSISTENT_WALL_ANCHORING_V1) return;
  const now = Date.now();
  if (now - lastWallAnchoringDiagLogMs < 2_000) return;
  lastWallAnchoringDiagLogMs = now;
  console.debug("[BOOKMAP_WALL_ANCHORING_V1_DIAG]", { ...lastWallAnchoringDiag });
}

function emitMacroDomCoverageDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1) return;
  const now = Date.now();
  if (now - lastMacroDomCoverageDiagLogMs < 2_000) return;
  lastMacroDomCoverageDiagLogMs = now;
  console.debug("[BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1_DIAG]", {
    ...lastMacroDomCoverageDiag,
  });
}

type AnchoredWallRenderResult = {
  historicalTrails: number;
  activeBodies: number;
  liveProjections: number;
  farMacroWalls: number;
  visualIntegrationDiag: AnchoredWallVisualIntegrationDiagStats;
};

export type AnchoredWallVisualIntegrationDiagStats = {
  anchoredWallsDrawn: number;
  dominantWallCores: number;
  mediumDomWallsDrawn: number;
  farWallsDrawn: number;
  avgWallAlpha: number;
  avgCoreAlpha: number;
  avgOuterGlowAlpha: number;
  matrixPreservedUnderWalls: number;
  liveProjectionConnected: number;
  fadedWallsDrawn: number;
  pullingWallsDrawn: number;
  touchedWallsDrawn: number;
  timestamp: number;
};

let lastAnchoredWallVisualDiag: AnchoredWallVisualIntegrationDiagStats = {
  anchoredWallsDrawn: 0,
  dominantWallCores: 0,
  mediumDomWallsDrawn: 0,
  farWallsDrawn: 0,
  avgWallAlpha: 0,
  avgCoreAlpha: 0,
  avgOuterGlowAlpha: 0,
  matrixPreservedUnderWalls: 1,
  liveProjectionConnected: 0,
  fadedWallsDrawn: 0,
  pullingWallsDrawn: 0,
  touchedWallsDrawn: 0,
  timestamp: 0,
};

let lastAnchoredWallVisualDiagLogMs = 0;

export function getAnchoredWallVisualIntegrationDiagStats(): AnchoredWallVisualIntegrationDiagStats {
  return lastAnchoredWallVisualDiag;
}

function emitAnchoredWallVisualIntegrationDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1) return;
  const now = Date.now();
  if (now - lastAnchoredWallVisualDiagLogMs < 2_000) return;
  lastAnchoredWallVisualDiagLogMs = now;
  console.debug("[BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1_DIAG]", {
    ...lastAnchoredWallVisualDiag,
  });
}

type AnchoredWallVisualDrawAcc = {
  wallAlphaSum: number;
  wallAlphaCount: number;
  coreAlphaSum: number;
  coreAlphaCount: number;
  glowAlphaSum: number;
  glowAlphaCount: number;
  dominantWallCores: number;
  mediumDomWallsDrawn: number;
  farWallsDrawn: number;
  fadedWallsDrawn: number;
  pullingWallsDrawn: number;
  touchedWallsDrawn: number;
  liveProjectionConnected: number;
  wallsDrawn: number;
};

function anchoredWallTextureHash(
  price: number,
  xSeed: number,
  slot: number,
): number {
  const x =
    Math.sin(price * 0.017 + xSeed * 0.0009 + slot * 1.73) * 43_758.5453;
  return x - Math.floor(x);
}

function drawIntegratedAnchoredWallSpan(
  ctx: CanvasRenderingContext2D,
  x0: number,
  spanW: number,
  yTop: number,
  height: number,
  wall: AnchoredWallEntity,
  vi: number,
  bodyAlphaBase: number,
  layer: "historical" | "active" | "projection",
  acc: AnchoredWallVisualDrawAcc,
): void {
  if (spanW < 0.5) return;

  const lifecycle = wall.state;
  const lifecycleMul = resolveAnchoredWallLifecycleAlphaMul(lifecycle, layer);
  const integrationMul = BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1
    ? ANCHORED_WALL_BASE_ALPHA_MUL
    : 1;
  let bodyAlpha = Math.min(
    layer === "projection" ? 0.68 : 0.74,
    bodyAlphaBase * lifecycleMul * integrationMul,
  );
  if (wall.visualTier === "far") bodyAlpha *= 0.82;
  if (wall.visualTier === "weak") bodyAlpha *= 0.88;
  if (layer === "projection") bodyAlpha *= ANCHORED_WALL_PROJECTION_ALPHA_MUL;

  const bodyRgb = resolveAnchoredWallBodyRgb(vi, wall.visualTier, lifecycle);
  const glowRgb = resolveAnchoredWallGlowRgb(bodyRgb, vi);
  const glowAlpha =
    bodyAlpha * ANCHORED_WALL_GLOW_ALPHA_MUL * (wall.visualTier === "far" ? 0.75 : 1);
  const glowH = height * (wall.visualTier === "dominant" ? 1.28 : 1.18);
  const glowY = yTop - (glowH - height) * 0.5;

  acc.wallAlphaSum += bodyAlpha;
  acc.wallAlphaCount += 1;
  acc.glowAlphaSum += glowAlpha;
  acc.glowAlphaCount += 1;
  acc.wallsDrawn += 1;
  if (wall.visualTier === "medium") acc.mediumDomWallsDrawn += 1;
  if (wall.visualTier === "far") acc.farWallsDrawn += 1;
  if (lifecycle === "fading" || lifecycle === "stale") acc.fadedWallsDrawn += 1;
  if (lifecycle === "pulling") acc.pullingWallsDrawn += 1;
  if (lifecycle === "touched") acc.touchedWallsDrawn += 1;
  if (layer === "projection") acc.liveProjectionConnected += 1;

  fillSpanRgba(
    ctx,
    x0 - 0.5,
    spanW + 1,
    glowY,
    glowH,
    glowRgb,
    glowAlpha,
  );

  if (lifecycle === "pulling" && spanW >= 4) {
    const fragCount = 3;
    for (let i = 0; i < fragCount; i += 1) {
      const fw = (spanW / fragCount) * 0.68;
      const fx = x0 + (spanW / fragCount) * i + spanW * 0.04;
      fillSpanRgba(ctx, fx, fw, yTop, height, bodyRgb, bodyAlpha * 0.72);
    }
  } else {
    const edgePct = 0.22;
    const edgeW = Math.max(1, spanW * edgePct);
    const centerW = Math.max(1, spanW - edgeW * 2);
    fillSpanRgba(ctx, x0, edgeW, yTop, height, bodyRgb, bodyAlpha * 0.42);
    fillSpanRgba(ctx, x0 + edgeW, centerW, yTop, height, bodyRgb, bodyAlpha * 0.78);
    fillSpanRgba(
      ctx,
      x0 + edgeW + centerW,
      edgeW,
      yTop,
      height,
      bodyRgb,
      bodyAlpha * 0.38,
    );
  }

  const stripCount = Math.min(5, Math.max(2, Math.floor(spanW / 10)));
  for (let i = 0; i < stripCount; i += 1) {
    const h = anchoredWallTextureHash(wall.anchorPrice, x0, i);
    const stripX = x0 + (spanW * (i + 0.35)) / (stripCount + 0.5);
    const stripW = Math.max(0.8, spanW / (stripCount * 2.8));
    fillSpanRgba(
      ctx,
      stripX,
      stripW,
      yTop + height * 0.12,
      height * 0.76,
      bodyRgb,
      bodyAlpha * (0.1 + h * 0.14),
    );
  }

  const showCore =
    (wall.visualTier === "dominant" || lifecycle === "reinforced") &&
    lifecycle !== "fading" &&
    lifecycle !== "stale" &&
    lifecycle !== "pulling";
  if (showCore && qualifiesOrganicInnerCore(vi, wall.runLength, wall.maxSizeBtc, wall.isNearPrice)) {
    const coreRgb = resolveAnchoredWallCoreRgb(vi);
    const coreH = height * 0.42;
    const coreY = yTop + height * 0.29;
    const coreW = spanW * (layer === "projection" ? 0.82 : 0.58);
    const coreX = x0 + (spanW - coreW) * (layer === "historical" ? 0.12 : 0.06);
    const coreAlpha = bodyAlpha * ANCHORED_WALL_CORE_ALPHA_MUL;
    fillSpanRgba(ctx, coreX, coreW, coreY, coreH, coreRgb, coreAlpha);
    acc.coreAlphaSum += coreAlpha;
    acc.coreAlphaCount += 1;
    acc.dominantWallCores += 1;
  }
}

function drawAnchoredWallSeamBlend(
  ctx: CanvasRenderingContext2D,
  seamX: number,
  projW: number,
  yTop: number,
  height: number,
  rgb: [number, number, number],
  histAlpha: number,
  projAlpha: number,
): void {
  const blendW = Math.max(2, projW * ANCHORED_WALL_SEAM_BLEND_PCT);
  fillSpanRgba(ctx, seamX - blendW * 0.35, blendW, yTop, height, rgb, histAlpha * 0.55);
  fillSpanRgba(
    ctx,
    seamX + blendW * 0.15,
    blendW * 0.85,
    yTop,
    height,
    rgb,
    (histAlpha + projAlpha) * 0.45,
  );
}

function textureCellVerticalBoundsForWall(
  price: number,
  priceToY: (p: number) => number,
  domBucketSize: number,
): { yTop: number; height: number } {
  return textureCellVerticalBounds(price, priceToY, domBucketSize);
}

function renderAnchoredWallsPass(
  ctx: CanvasRenderingContext2D,
  metrics: EnginePlotMetrics,
  walls: AnchoredWallEntity[],
  timeViewport: BookmapTimeViewport,
  visualSettings: BookmapVisualSettings | undefined,
  opts: {
    midPrice: number | null;
    dataEndTime: number;
    textureOpacityMul: number;
    domBucketSize: number;
    minPrice: number;
    maxPrice: number;
  },
): AnchoredWallRenderResult {
  const emptyVisualDiag: AnchoredWallVisualIntegrationDiagStats = {
    anchoredWallsDrawn: 0,
    dominantWallCores: 0,
    mediumDomWallsDrawn: 0,
    farWallsDrawn: 0,
    avgWallAlpha: 0,
    avgCoreAlpha: 0,
    avgOuterGlowAlpha: 0,
    matrixPreservedUnderWalls: 1,
    liveProjectionConnected: 0,
    fadedWallsDrawn: 0,
    pullingWallsDrawn: 0,
    touchedWallsDrawn: 0,
    timestamp: Date.now(),
  };
  const empty: AnchoredWallRenderResult = {
    historicalTrails: 0,
    activeBodies: 0,
    liveProjections: 0,
    farMacroWalls: 0,
    visualIntegrationDiag: emptyVisualDiag,
  };
  if (!BOOKMAP_PERSISTENT_WALL_ANCHORING_V1 || !walls.length) return empty;

  const { priceToY, timeToX } = metrics;
  const zoomRegime = resolveZoomRegime(
    computeVisiblePriceRangePct(opts.minPrice, opts.maxPrice),
  );
  const heatmapOpacity = visualSettings?.heatmap.opacity ?? 1;
  const globalMul = BOOKMAP_TEXTURE_OPACITY_MUL * heatmapOpacity * opts.textureOpacityMul;
  const dataEdgeX = timeToX(opts.dataEndTime);
  const sorted = [...walls].sort(
    (a, b) => a.peakIntensity - b.peakIntensity || a.maxSizeBtc - b.maxSizeBtc,
  );

  let historicalTrails = 0;
  let activeBodies = 0;
  let liveProjections = 0;
  let farMacroWalls = 0;
  const visualAcc: AnchoredWallVisualDrawAcc = {
    wallAlphaSum: 0,
    wallAlphaCount: 0,
    coreAlphaSum: 0,
    coreAlphaCount: 0,
    glowAlphaSum: 0,
    glowAlphaCount: 0,
    dominantWallCores: 0,
    mediumDomWallsDrawn: 0,
    farWallsDrawn: 0,
    fadedWallsDrawn: 0,
    pullingWallsDrawn: 0,
    touchedWallsDrawn: 0,
    liveProjectionConnected: 0,
    wallsDrawn: 0,
  };

  ctx.save();
  for (const wall of sorted) {
    const vi = Math.max(
      wall.peakIntensity,
      mapWallSizeToStableVisualIntensity(wall.maxSizeBtc),
      wall.currentIntensity,
    );
    const alphaMul = resolveAnchoredWallAlphaMultiplier(wall, zoomRegime);
    const { yTop, height } = textureCellVerticalBoundsForWall(
      wall.anchorPrice,
      priceToY,
      opts.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const alphaCtx = buildPassiveLiquidityAlphaContext({
      intensity: vi,
      isActive: wall.isLive,
      stableSizeBtc: wall.maxSizeBtc,
      weight: computeBookmapVisualWeight({
        sizeBtc: wall.maxSizeBtc,
        price: wall.anchorPrice,
        midPrice: opts.midPrice,
        regime: zoomRegime,
        baseIntensity: vi,
        isActive: wall.isLive,
      }),
    });
    let bodyAlphaBase = alphaForPassiveLiquidity(alphaCtx) * globalMul * alphaMul;
    bodyAlphaBase = Math.min(0.72, Math.max(0.1, bodyAlphaBase));

    const drawSpan = (
      x0: number,
      spanW: number,
      layer: "historical" | "active" | "projection",
    ) => {
      if (BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1) {
        drawIntegratedAnchoredWallSpan(
          ctx,
          x0,
          spanW,
          yTop,
          height,
          wall,
          vi,
          bodyAlphaBase,
          layer,
          visualAcc,
        );
        return;
      }
      const rgb = intensityToPassiveLiquidityRgb(vi);
      drawOrganicSpanBody(
        ctx,
        x0,
        spanW,
        yTop,
        height,
        {
          rgb,
          bodyAlpha: bodyAlphaBase,
          vi,
          runLength: wall.runLength,
          sizeBtc: wall.maxSizeBtc,
          reinforcedBase: wall.state === "reinforced",
          nearPrice: wall.isNearPrice,
        },
        lastWallOrganicRenderDiagStats,
      );
    };

    let drewHistorical = false;

    if (wall.isHistorical && wall.state !== "new") {
      const histStart = Math.max(
        wall.historicalStartTime,
        timeViewport.visibleStartTime,
      );
      const histEnd = Math.min(
        opts.dataEndTime,
        wall.historicalEndTime,
        timeViewport.visibleEndTime,
      );
      if (histEnd > histStart) {
        const x0 = timeToX(histStart);
        let spanW = timeToX(histEnd) - x0;
        if (spanW >= 1 && x0 < dataEdgeX) {
          spanW = Math.min(spanW, Math.max(1, dataEdgeX - x0));
          drawSpan(x0, spanW, "historical");
          historicalTrails += 1;
          drewHistorical = true;
        }
      }
    }

    const skipStrongLive =
      wall.state === "fading" ||
      wall.state === "stale" ||
      (wall.state === "pulling" && !wall.isDominant);

    if (wall.isLive && !skipStrongLive) {
      const liveStart = Math.max(
        opts.dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS * 2,
        timeViewport.visibleStartTime,
      );
      if (opts.dataEndTime > liveStart) {
        const x0 = Math.max(timeToX(liveStart), dataEdgeX - 6);
        const spanW = Math.max(1, dataEdgeX - x0);
        if (spanW >= 1) {
          drawSpan(x0, spanW, "active");
          activeBodies += 1;
        }
      }

      const projEnd = timeViewport.visibleEndTime;
      if (
        projEnd > opts.dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS &&
        wall.state !== "fading" &&
        wall.state !== "stale"
      ) {
        const x0 = timeToX(opts.dataEndTime);
        const x1 = timeToX(projEnd);
        let projW = x1 - x0;
        if (projW >= 2) {
          if (BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1 && drewHistorical) {
            const bodyRgb = resolveAnchoredWallBodyRgb(
              vi,
              wall.visualTier,
              wall.state,
            );
            const histAlpha =
              bodyAlphaBase *
              ANCHORED_WALL_BASE_ALPHA_MUL *
              resolveAnchoredWallLifecycleAlphaMul(wall.state, "historical");
            const projAlpha =
              bodyAlphaBase *
              ANCHORED_WALL_BASE_ALPHA_MUL *
              ANCHORED_WALL_PROJECTION_ALPHA_MUL *
              resolveAnchoredWallLifecycleAlphaMul(wall.state, "projection");
            drawAnchoredWallSeamBlend(
              ctx,
              x0,
              projW,
              yTop,
              height,
              bodyRgb,
              histAlpha,
              projAlpha,
            );
          }
          drawSpan(x0, projW, "projection");
          liveProjections += 1;
        }
      }
    } else if (
      (wall.state === "fading" || wall.state === "stale") &&
      wall.isHistorical
    ) {
      const histStart = Math.max(
        wall.historicalStartTime,
        timeViewport.visibleStartTime,
      );
      const histEnd = Math.min(opts.dataEndTime, wall.historicalEndTime);
      if (histEnd > histStart) {
        const x0 = timeToX(histStart);
        const spanW = Math.min(timeToX(histEnd) - x0, Math.max(1, dataEdgeX - x0));
        if (spanW >= 1) {
          drawSpan(x0, spanW, "historical");
        }
      }
    }

    if (wall.isFarButImportant) farMacroWalls += 1;
  }
  ctx.restore();

  const visualIntegrationDiag: AnchoredWallVisualIntegrationDiagStats = {
    anchoredWallsDrawn: visualAcc.wallsDrawn,
    dominantWallCores: visualAcc.dominantWallCores,
    mediumDomWallsDrawn: visualAcc.mediumDomWallsDrawn,
    farWallsDrawn: visualAcc.farWallsDrawn,
    avgWallAlpha:
      visualAcc.wallAlphaCount > 0
        ? Number((visualAcc.wallAlphaSum / visualAcc.wallAlphaCount).toFixed(3))
        : 0,
    avgCoreAlpha:
      visualAcc.coreAlphaCount > 0
        ? Number((visualAcc.coreAlphaSum / visualAcc.coreAlphaCount).toFixed(3))
        : 0,
    avgOuterGlowAlpha:
      visualAcc.glowAlphaCount > 0
        ? Number((visualAcc.glowAlphaSum / visualAcc.glowAlphaCount).toFixed(3))
        : 0,
    matrixPreservedUnderWalls: BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1 ? 1 : 0,
    liveProjectionConnected: visualAcc.liveProjectionConnected,
    fadedWallsDrawn: visualAcc.fadedWallsDrawn,
    pullingWallsDrawn: visualAcc.pullingWallsDrawn,
    touchedWallsDrawn: visualAcc.touchedWallsDrawn,
    timestamp: Date.now(),
  };
  lastAnchoredWallVisualDiag = visualIntegrationDiag;
  emitAnchoredWallVisualIntegrationDiag();

  return {
    historicalTrails,
    activeBodies,
    liveProjections,
    farMacroWalls,
    visualIntegrationDiag,
  };
}

function computeGridUniformityScore(widths: number[]): number {
  if (widths.length < 4) return 0.5;
  const mean = widths.reduce((a, b) => a + b, 0) / widths.length;
  const variance =
    widths.reduce((sum, w) => sum + (w - mean) ** 2, 0) / widths.length;
  const cv = Math.sqrt(variance) / Math.max(0.001, mean);
  return Math.max(0, Math.min(1, 1 - cv / 0.42));
}

function resolveNaturalMatrixAlphaMultiplier(
  cell: PreparedEngineTextureCell,
): number {
  if (!BOOKMAP_NATURAL_MATRIX_LOGIC_V1) return 1;
  const stage = cell.liquidityLifeStage;
  const fade = cell.visualFadeScore ?? 0;
  const refill = cell.visualRefillScore ?? 0;
  const continuity = cell.visualContinuityScore ?? 0;
  switch (stage) {
    case "new":
      return NATURAL_MATRIX_ALPHA_NEW;
    case "persistent":
      return NATURAL_MATRIX_ALPHA_PERSISTENT * (0.94 + continuity * 0.12);
    case "reinforced":
      return NATURAL_MATRIX_ALPHA_REINFORCED * (0.96 + refill * 0.1);
    case "fading":
      return NATURAL_MATRIX_ALPHA_FADING * (1 - fade * 0.28);
    case "stale":
      return NATURAL_MATRIX_ALPHA_STALE;
    case "wall_candidate":
      return 1.04;
    default:
      return 1;
  }
}

function resolveNaturalGranularDrawGeom(
  cell: PreparedEngineTextureCell,
  timeToX: (t: number) => number,
  regime: BookmapZoomRegime,
): { x0: number; w: number } {
  const hash = granularCellDeterministicHash(cell.price, cell.timeBucket);
  const hash2 = granularCellDeterministicHash(
    cell.price * 1.7,
    cell.timeBucket + 17,
  );

  if (cell.isMiniFragment) {
    const bucketCount = Math.min(
      NATURAL_MATRIX_MAX_FRAGMENT_BUCKETS,
      cell.continuityRunLength ?? 2,
    );
    const endTime =
      cell.endTimeBucket ??
      cell.timeBucket + bucketCount * BOOKMAP_ENGINE_BUCKET_MS;
    const baseX = timeToX(cell.timeBucket);
    let w = Math.max(2, timeToX(endTime) - baseX);
    const maxW =
      resolveGranularMaxWidthPx(regime) * (1.15 + bucketCount * 0.32);
    w = Math.min(w, maxW);
    w *= 0.88 + hash2 * NATURAL_MATRIX_WIDTH_VARIANCE;
    const jitter =
      (hash - 0.5) * 2 * NATURAL_MATRIX_JITTER_X_MAX_PX * 0.45;
    return { x0: baseX + jitter, w: Math.max(1.5, w) };
  }

  const baseW = resolveGranularCellWidthPx(
    timeToX,
    cell.timeBucket,
    regime,
  );
  const stage = cell.liquidityLifeStage;
  const stageMul =
    stage === "new"
      ? 0.8
      : stage === "persistent"
        ? 0.96 + (cell.visualContinuityScore ?? 0) * 0.14
        : stage === "reinforced"
          ? 1.08
          : stage === "fading"
            ? 0.72
            : stage === "stale"
              ? 0.68
              : 0.9;
  const widthMul = (0.76 + hash * NATURAL_MATRIX_WIDTH_VARIANCE * 2) * stageMul;
  const w = Math.max(1, baseW * widthMul);
  const jitter = (hash2 - 0.5) * 2 * NATURAL_MATRIX_JITTER_X_MAX_PX;
  return {
    x0: timeToX(cell.timeBucket) + jitter,
    w,
  };
}

function emitRenderMatrixDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_MATRIX_AUDIT_DIAG) return;
  const now = Date.now();
  if (now - lastRenderMatrixDiagLogMs < 2_000) return;
  lastRenderMatrixDiagLogMs = now;
  console.debug("[BOOKMAP_RENDER_MATRIX_DIAG]", {
    ...lastRenderMatrixDiag,
  });
}

function emitLiveVsHistoricalDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_MATRIX_AUDIT_DIAG) return;
  const now = Date.now();
  if (now - lastLiveVsHistoricalDiagLogMs < 2_000) return;
  lastLiveVsHistoricalDiagLogMs = now;
  console.debug("[BOOKMAP_LIVE_VS_HISTORICAL_DIAG]", {
    ...lastLiveVsHistoricalDiag,
  });
}

export function getWallOrganicRenderDiagStats(): WallOrganicRenderDiagStats {
  return lastWallOrganicRenderDiagStats;
}

const RENDERER_FILE_PATH =
  "client/src/components/flows/bookmapEngineRenderer.ts";

type RenderPathProofDiagStats = {
  rendererFile: string;
  textureCalibration: boolean;
  horizontalPersistence: boolean;
  depthPass: boolean;
  visibleSpans: number;
  strongSpans: number;
  weakTextureSpans: number;
  timestamp: number;
};

let lastRenderPathProofDiagStats: RenderPathProofDiagStats = {
  rendererFile: RENDERER_FILE_PATH,
  textureCalibration: BOOKMAP_TEXTURE_CALIBRATION_V2,
  horizontalPersistence: BOOKMAP_HORIZONTAL_PERSISTENCE_V2,
  depthPass: BOOKMAP_HEATMAP_DEPTH_PASS_V2,
  visibleSpans: 0,
  strongSpans: 0,
  weakTextureSpans: 0,
  timestamp: 0,
};

let lastRenderPathProofLogMs = 0;

export function getRenderPathProofDiagStats(): RenderPathProofDiagStats {
  return lastRenderPathProofDiagStats;
}

function emitRenderPathProofDiag(
  spanAudit: SpanRenderContinuityAudit | undefined,
  organicDiag: WallOrganicRenderDiagStats,
): void {
  lastRenderPathProofDiagStats = {
    rendererFile: RENDERER_FILE_PATH,
    textureCalibration: BOOKMAP_TEXTURE_CALIBRATION_V2,
    horizontalPersistence: BOOKMAP_HORIZONTAL_PERSISTENCE_V2,
    depthPass: BOOKMAP_HEATMAP_DEPTH_PASS_V2,
    visibleSpans: spanAudit?.renderedSpanCount ?? organicDiag.organicSpanCount,
    strongSpans: organicDiag.innerCoreCount + organicDiag.edgeFadeCount,
    weakTextureSpans: organicDiag.weakDepthCount,
    timestamp: Date.now(),
  };

  if (!import.meta.env.DEV || !BOOKMAP_RENDER_PATH_PROOF_DIAG) return;
  const now = Date.now();
  if (now - lastRenderPathProofLogMs < 2_000) return;
  lastRenderPathProofLogMs = now;
  console.debug("[BOOKMAP_RENDER_PATH_PROOF_DIAG]", {
    ...lastRenderPathProofDiagStats,
  });
}

function drawRenderPathProofWatermark(ctx: CanvasRenderingContext2D): void {
  if (BOOKMAP_CANONICAL_HEATMAP_V1 || BOOKMAP_SURFACE_RENDERER_V1) return;
  if (!import.meta.env.DEV || !BOOKMAP_RENDER_PATH_PROOF_DIAG) return;
  ctx.save();
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.fillStyle = "rgba(250, 204, 21, 0.92)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 3;
  const label = "V2.1 RENDER ACTIVE";
  const x = HEATMAP_PAD.left + 6;
  const y = HEATMAP_PAD.top + 14;
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    ctx.fillStyle = "rgba(251, 146, 60, 0.95)";
    ctx.strokeText("V3 AGGRESSIVE ACTIVE", x, y + 14);
    ctx.fillText("V3 AGGRESSIVE ACTIVE", x, y + 14);
  }
  if (BOOKMAP_MATRIX_AUDIT_DIAG) {
    ctx.fillStyle = "rgba(96, 165, 250, 0.95)";
    const matrixY = y + (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 28 : 14);
    ctx.strokeText("MATRIX AUDIT ACTIVE", x, matrixY);
    ctx.fillText("MATRIX AUDIT ACTIVE", x, matrixY);
  }
  if (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1) {
    ctx.fillStyle = "rgba(52, 211, 153, 0.95)";
    const granularY =
      y +
      (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 42 : 28) +
      (BOOKMAP_MATRIX_AUDIT_DIAG ? 14 : 0);
    ctx.strokeText("GRANULAR MATRIX V1 ACTIVE", x, granularY);
    ctx.fillText("GRANULAR MATRIX V1 ACTIVE", x, granularY);
  }
  if (BOOKMAP_NATURAL_MATRIX_LOGIC_V1) {
    ctx.fillStyle = "rgba(167, 139, 250, 0.95)";
    const naturalY =
      y +
      (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 56 : 42) +
      (BOOKMAP_MATRIX_AUDIT_DIAG ? 14 : 0) +
      (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1 ? 14 : 0);
    ctx.strokeText("NATURAL MATRIX LOGIC V1 ACTIVE", x, naturalY);
    ctx.fillText("NATURAL MATRIX LOGIC V1 ACTIVE", x, naturalY);
  }
  if (BOOKMAP_PERSISTENT_WALL_ANCHORING_V1) {
    ctx.fillStyle = "rgba(244, 114, 182, 0.95)";
    const anchorY =
      y +
      (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 70 : 56) +
      (BOOKMAP_MATRIX_AUDIT_DIAG ? 14 : 0) +
      (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1 ? 14 : 0) +
      (BOOKMAP_NATURAL_MATRIX_LOGIC_V1 ? 14 : 0);
    ctx.strokeText("WALL ANCHORING V1 ACTIVE", x, anchorY);
    ctx.fillText("WALL ANCHORING V1 ACTIVE", x, anchorY);
  }
  if (BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1) {
    ctx.fillStyle = "rgba(251, 191, 36, 0.95)";
    const macroY =
      y +
      (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 84 : 70) +
      (BOOKMAP_MATRIX_AUDIT_DIAG ? 14 : 0) +
      (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1 ? 14 : 0) +
      (BOOKMAP_NATURAL_MATRIX_LOGIC_V1 ? 14 : 0) +
      (BOOKMAP_PERSISTENT_WALL_ANCHORING_V1 ? 14 : 0);
    ctx.strokeText("MACRO DOM DEPTH V1 ACTIVE", x, macroY);
    ctx.fillText("MACRO DOM DEPTH V1 ACTIVE", x, macroY);
  }
  if (BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1) {
    ctx.fillStyle = "rgba(244, 114, 182, 0.95)";
    const visualY =
      y +
      (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 98 : 84) +
      (BOOKMAP_MATRIX_AUDIT_DIAG ? 14 : 0) +
      (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1 ? 14 : 0) +
      (BOOKMAP_NATURAL_MATRIX_LOGIC_V1 ? 14 : 0) +
      (BOOKMAP_PERSISTENT_WALL_ANCHORING_V1 ? 14 : 0) +
      (BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1 ? 14 : 0);
    ctx.strokeText("ANCHORED WALL VISUAL V1 ACTIVE", x, visualY);
    ctx.fillText("ANCHORED WALL VISUAL V1 ACTIVE", x, visualY);
  }
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
  const pathY =
    y +
    (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 28 : 12) +
    (BOOKMAP_MATRIX_AUDIT_DIAG ? 14 : 0);
  ctx.fillText(RENDERER_FILE_PATH, x, pathY);
  ctx.restore();
}

let lastAggressiveV3DiagLogMs = 0;

function emitAggressiveHeatmapCalibrationV3Diag(
  spanAudit: SpanRenderContinuityAudit | undefined,
  organicDiag: WallOrganicRenderDiagStats,
  drawCapHit: boolean,
  skippedWeakFar: number,
): void {
  if (!import.meta.env.DEV || !BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) return;
  const now = Date.now();
  if (now - lastAggressiveV3DiagLogMs < 2_000) return;
  lastAggressiveV3DiagLogMs = now;
  const solidBaseAlphaAvg =
    organicDiag.solidBaseAlphaCount > 0
      ? organicDiag.solidBaseAlphaSum / organicDiag.solidBaseAlphaCount
      : 0;
  const textureOverlayAlphaAvg =
    organicDiag.textureOverlayAlphaCount > 0
      ? organicDiag.textureOverlayAlphaSum / organicDiag.textureOverlayAlphaCount
      : 0;
  console.debug("[BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3_DIAG]", {
    visibleSpans: spanAudit?.renderedSpanCount ?? organicDiag.organicSpanCount,
    weakSpansDrawn: organicDiag.weakSpansDrawn,
    mediumSpansDrawn: organicDiag.mediumSpansDrawn,
    strongSpansDrawn: organicDiag.strongSpansDrawn,
    organicSpans: organicDiag.organicSpanCount,
    solidBaseAlphaAvg: Number(solidBaseAlphaAvg.toFixed(3)),
    textureOverlayAlphaAvg: Number(textureOverlayAlphaAvg.toFixed(3)),
    nearPriceBoosted: organicDiag.nearPriceBoostCount,
    drawCap: drawCapHit,
    skippedWeakFar,
    timestamp: now,
  });
}

function fillSpanRgba(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  y: number,
  h: number,
  rgb: [number, number, number],
  alpha: number,
): void {
  if (alpha <= 0.005 || w < 0.5) return;
  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(1, alpha)})`;
  ctx.fillRect(x, y, w, h);
}

type OrganicSpanDrawParams = {
  rgb: [number, number, number];
  bodyAlpha: number;
  vi: number;
  runLength: number;
  sizeBtc: number;
  reinforcedBase: boolean;
  nearPrice: boolean;
};

function recordSpanIntensityTier(diag: WallOrganicRenderDiagStats, vi: number): void {
  if (vi >= 0.52) diag.strongSpansDrawn += 1;
  else if (vi >= 0.22) diag.mediumSpansDrawn += 1;
  else diag.weakSpansDrawn += 1;
}

function drawOrganicSpanBody(
  ctx: CanvasRenderingContext2D,
  x0: number,
  spanW: number,
  yTop: number,
  height: number,
  params: OrganicSpanDrawParams,
  diag: WallOrganicRenderDiagStats,
): void {
  const { rgb, bodyAlpha, vi, runLength, sizeBtc, reinforcedBase, nearPrice } =
    params;
  const isStrongWall =
    vi >= H_PERSIST_V2_SOLID_BASE_MIN_INTENSITY &&
    (sizeBtc >= WALL_IMPORTANT_BTC || runLength >= 3);

  if (!BOOKMAP_TEXTURE_CALIBRATION_V2) {
    fillSpanRgba(ctx, x0, spanW, yTop, height, rgb, bodyAlpha);
    if (reinforcedBase) {
      fillSpanRgba(
        ctx,
        x0,
        spanW,
        yTop,
        height,
        rgb,
        bodyAlpha * H_PERSIST_V2_SOLID_BASE_ALPHA_MUL,
      );
    }
    recordSpanIntensityTier(diag, vi);
    return;
  }

  diag.organicSpanCount += 1;
  recordSpanIntensityTier(diag, vi);
  const modAlpha = resolveOrganicWallBodyAlpha(bodyAlpha, vi, runLength, sizeBtc);
  if (modAlpha < diag.baseAlphaMin || diag.baseAlphaMin === 0) {
    diag.baseAlphaMin = modAlpha;
  }
  if (modAlpha > diag.baseAlphaMax) {
    diag.baseAlphaMax = modAlpha;
  }

  const weakMinI = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_WEAK_TEXTURE_MIN_INTENSITY
    : TEX_CALIB_V2_WEAK_TEXTURE_MIN_INTENSITY;
  const weakDepthMul = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_WEAK_DEPTH_ALPHA_MUL
    : TEX_CALIB_V2_WEAK_DEPTH_ALPHA_MUL;
  const weakDepthMaxVi = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.45 : 0.3;

  if (
    BOOKMAP_HEATMAP_DEPTH_PASS_V2 &&
    vi < weakDepthMaxVi &&
    vi >= weakMinI
  ) {
    fillSpanRgba(
      ctx,
      x0,
      spanW,
      yTop,
      height,
      rgb,
      modAlpha * weakDepthMul,
    );
    diag.weakDepthCount += 1;
  }

  const edgePct = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_ORGANIC_EDGE_FADE_PCT
    : TEX_CALIB_V2_ORGANIC_EDGE_FADE_PCT;
  const useOrganicEdge = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? vi >= V3_ORGANIC_MIN_INTENSITY && spanW >= 4
    : isStrongWall && spanW >= 6;

  let centerAlpha = modAlpha;
  if (reinforcedBase && isStrongWall) {
    const reinforceMul = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
      ? H_PERSIST_V2_SOLID_BASE_ALPHA_MUL * V3_SOLID_BASE_REINFORCE_MUL
      : H_PERSIST_V2_SOLID_BASE_ALPHA_MUL * 0.92;
    const cap = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
      ? V3_STRONG_BASE_ALPHA_CAP
      : TEX_CALIB_V2_STRONG_BASE_ALPHA_CAP;
    centerAlpha = Math.min(modAlpha * reinforceMul, cap);
  }

  let edgeAlphaMul = 0.38;
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    if (vi >= 0.65) edgeAlphaMul = 0.3;
    else if (vi >= 0.45) edgeAlphaMul = 0.34;
    else edgeAlphaMul = 0.26;
  }

  if (useOrganicEdge) {
    diag.edgeFadeCount += 1;
    const edgeW = Math.min(spanW * 0.48, Math.max(1, spanW * edgePct));
    const centerW = Math.max(1, spanW - edgeW * 2);
    fillSpanRgba(ctx, x0, edgeW, yTop, height, rgb, centerAlpha * edgeAlphaMul);
    fillSpanRgba(ctx, x0 + edgeW, centerW, yTop, height, rgb, centerAlpha);
    fillSpanRgba(
      ctx,
      x0 + edgeW + centerW,
      edgeW,
      yTop,
      height,
      rgb,
      centerAlpha * edgeAlphaMul,
    );
    diag.solidBaseAlphaSum += centerAlpha;
    diag.solidBaseAlphaCount += 1;
  } else {
    fillSpanRgba(ctx, x0, spanW, yTop, height, rgb, centerAlpha);
    diag.solidBaseAlphaSum += centerAlpha;
    diag.solidBaseAlphaCount += 1;
  }

  if (
    BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 &&
    vi >= 0.45 &&
    vi < 0.65 &&
    spanW >= 6
  ) {
    const softCoreW = Math.max(2, spanW * 0.38);
    const softCoreX = x0 + (spanW - softCoreW) / 2;
    const softRgb = intensityToPassiveLiquidityRgb(Math.min(0.98, vi + 0.05));
    fillSpanRgba(
      ctx,
      softCoreX,
      softCoreW,
      yTop,
      height,
      softRgb,
      Math.min(0.72, centerAlpha * 0.44),
    );
  }

  const coreMinSpanW = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 6 : 8;
  if (
    qualifiesOrganicInnerCore(vi, runLength, sizeBtc, nearPrice) &&
    spanW >= coreMinSpanW
  ) {
    const coreWidthPct = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
      ? 0.48
      : TEX_CALIB_V2_INNER_CORE_WIDTH_PCT;
    const coreW = Math.max(2, spanW * coreWidthPct);
    const coreX = x0 + (spanW - coreW) / 2;
    const coreRgb = intensityToPassiveLiquidityRgb(
      resolveOrganicWallCoreIntensity(vi),
    );
    const coreAlphaMul = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 1.32 : TEX_CALIB_V2_INNER_CORE_ALPHA_MUL;
    fillSpanRgba(
      ctx,
      coreX,
      coreW,
      yTop,
      height,
      coreRgb,
      Math.min(0.82, centerAlpha * coreAlphaMul),
    );
    diag.innerCoreCount += 1;
  }
}

function chunkIntensityFromSizeVariance(
  chunkSizeBtc: number,
  spanPeakSizeBtc: number,
  baseIntensity: number,
): number {
  if (spanPeakSizeBtc <= 0) return baseIntensity;
  const relative = clamp01(chunkSizeBtc / spanPeakSizeBtc);
  return Math.max(baseIntensity * 0.92, baseIntensity * (0.92 + relative * 0.08));
}

function computeInternalOverlayAlpha(
  baseAlpha: number,
  chunkRelativeStrength: number,
  ratioBounds: { min: number; max: number },
  microVisualMode: boolean,
  ratioScale = 1,
): number {
  const microCap = microVisualMode ? 0.28 : ratioBounds.max;
  const rawRatio = clamp01(0.08 + chunkRelativeStrength * 0.18);
  const scaledMin = ratioBounds.min * ratioScale;
  const scaledMax = Math.min(microCap, ratioBounds.max * ratioScale);
  const ratio = Math.max(scaledMin, Math.min(scaledMax, rawRatio));
  return baseAlpha * ratio;
}

type InternalOverlayDrawOp = {
  x0: number;
  x1: number;
  chunkRelativeStrength: number;
  overlayIntensity: number;
};

function buildInternalOverlayDrawOps(
  group: TextureSpanRenderGroup,
  baseIntensity: number,
  spanPeakSizeBtc: number,
  timeToX: (time: number) => number,
): InternalOverlayDrawOp[] {
  const granular = group.segments.filter((seg) => seg.usesGranularBlocks);
  if (granular.length === 0) return [];

  const ops: InternalOverlayDrawOp[] = [];
  let batchStart = -1;
  let batchEnd = -1;
  let batchSizeSum = 0;
  let batchCount = 0;

  const flushBatch = () => {
    if (batchCount <= 0 || batchStart < 0) return;
    const avgSize = batchSizeSum / batchCount;
    const relative = spanPeakSizeBtc > 0 ? clamp01(avgSize / spanPeakSizeBtc) : 1;
    ops.push({
      x0: batchStart,
      x1: batchEnd,
      chunkRelativeStrength: relative,
      overlayIntensity: chunkIntensityFromSizeVariance(
        avgSize,
        spanPeakSizeBtc,
        baseIntensity,
      ),
    });
    batchStart = -1;
    batchEnd = -1;
    batchSizeSum = 0;
    batchCount = 0;
  };

  for (const chunkSeg of granular) {
    const cx0 = timeToX(chunkSeg.spanStart);
    const cx1 = timeToX(chunkSeg.spanEnd);
    let chunkW = cx1 - cx0;
    if (chunkW < BOOKMAP_TEXTURE_MIN_CELL_WIDTH_PX) {
      chunkW = BOOKMAP_TEXTURE_MIN_CELL_WIDTH_PX;
    }

    const chunkSizeBtc =
      chunkSeg.chunkSizeBtc ?? chunkSeg.stableSizeBtc ?? spanPeakSizeBtc;

    if (chunkW < BOOKMAP_TEXTURE_CHUNK_OVERLAY_MIN_WIDTH_PX) {
      if (batchStart < 0) batchStart = cx0;
      batchEnd = Math.max(batchEnd, cx0 + chunkW);
      batchSizeSum += chunkSizeBtc;
      batchCount += 1;
      continue;
    }

    flushBatch();
    const relative =
      spanPeakSizeBtc > 0 ? clamp01(chunkSizeBtc / spanPeakSizeBtc) : 1;
    ops.push({
      x0: cx0,
      x1: cx0 + chunkW,
      chunkRelativeStrength: relative,
      overlayIntensity: chunkIntensityFromSizeVariance(
        chunkSizeBtc,
        spanPeakSizeBtc,
        baseIntensity,
      ),
    });
  }

  flushBatch();
  return ops;
}

function buildTextureSpanRenderGroups(
  segments: PreparedL2BandDrawSegment[],
): TextureSpanRenderGroup[] {
  const map = new Map<string, TextureSpanRenderGroup>();
  for (const segment of segments) {
    if (segment.spanEnd <= segment.spanStart) continue;
    const key = segment.spanRenderGroupKey;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        spanStart: segment.spanStart,
        spanEnd: segment.spanEnd,
        peakIntensity: segment.peakIntensity,
        segments: [segment],
        representative: segment,
      });
      continue;
    }
    existing.spanStart = Math.min(existing.spanStart, segment.spanStart);
    existing.spanEnd = Math.max(existing.spanEnd, segment.spanEnd);
    existing.peakIntensity = Math.max(
      existing.peakIntensity,
      segment.peakIntensity,
    );
    existing.segments.push(segment);
  }
  return Array.from(map.values());
}

function resolveTextureSegmentIntensity(
  segment: PreparedL2BandDrawSegment,
  intensityOverride?: number,
): number {
  const adaptiveIntensity = Math.max(
    0,
    Math.min(1, segment.stableIntensity),
  );
  const spanPeak = segment.peakIntensity ?? adaptiveIntensity;
  const lockedFloor = segment.cell.historicalRenderIntensity ?? 0;
  const base =
    intensityOverride ??
    Math.max(spanPeak, adaptiveIntensity, lockedFloor);
  return Math.max(0, Math.min(1, base));
}

function resolveTextureSegmentBodyAlpha(
  segment: PreparedL2BandDrawSegment,
  vi: number,
  renderCtx: TextureVisualRenderContext,
  textureOpacityMul: number,
  mode: "primary" | "perp-overlay",
): number {
  const { cell, weight, isActive, closedAgeMs } = segment;
  const globalMul =
    textureOpacityMul * (mode === "perp-overlay" ? 0.88 : 1);
  const alphaCtx = buildPassiveLiquidityAlphaContext({
    intensity: vi,
    isActive,
    bandClass: segment.bandClass,
    closedAgeMs,
    weight,
    stableSizeBtc: segment.stableSizeBtc,
  });
  const microVisualMode = renderCtx.microVisualHierarchyActive === true;
  let bodyAlpha: number;
  if (microVisualMode) {
    bodyAlpha = Math.min(
      MICRO_TEXTURE_ALPHA_MAX,
      microAlphaFromRenderIntensity(vi) * MICRO_TEXTURE_ALPHA_MUL * globalMul,
    );
  } else {
    bodyAlpha = alphaForPassiveLiquidity(alphaCtx) * globalMul;
  }
  const lifecycleAlphaFloor = segment.cell.historicalRenderAlphaFloor;
  if (
    segment.cell.lifecycleHistorical &&
    lifecycleAlphaFloor != null &&
    lifecycleAlphaFloor > 0
  ) {
    bodyAlpha = Math.min(bodyAlpha, lifecycleAlphaFloor * globalMul);
  }
  const alphaFloor =
    segment.alphaFloor ??
    cell.historicalRenderAlphaFloor ??
    cell.historicalRenderAlpha;
  if (alphaFloor != null && alphaFloor > 0) {
    bodyAlpha = Math.max(bodyAlpha, alphaFloor * globalMul);
  }
  if (!isActive) {
    const closedMul =
      closedAgeMs < 60_000
        ? PALETTE_ALPHA_CLOSED_RECENT_MUL
        : closedAgeMs < 300_000
          ? 0.32
          : PALETTE_ALPHA_CLOSED_OLD_MUL;
    bodyAlpha *= closedMul;
  }
  return bodyAlpha;
}

function granularCellDeterministicHash(
  price: number,
  timeBucket: number,
): number {
  const x = Math.sin(price * 0.013 + timeBucket * 0.0007) * 43_758.5453;
  return x - Math.floor(x);
}

function resolveGranularMaxWidthPx(regime: BookmapZoomRegime): number {
  if (regime === "macro") return BOOKMAP_GRANULAR_MAX_WIDTH_MACRO_PX;
  if (regime.includes("scalp") || regime === "ultra_micro") {
    return BOOKMAP_GRANULAR_MAX_WIDTH_SCALP_PX;
  }
  return BOOKMAP_GRANULAR_MAX_WIDTH_STD_PX;
}

function resolveGranularCellWidthPx(
  timeToX: (t: number) => number,
  timeBucket: number,
  regime: BookmapZoomRegime,
): number {
  const x0 = timeToX(timeBucket);
  const x1 = timeToX(timeBucket + BOOKMAP_ENGINE_BUCKET_MS);
  let w = Math.max(1, x1 - x0);
  const minW = regime === "macro" ? 1 : 2;
  w = Math.max(minW, w);
  w = Math.min(w, resolveGranularMaxWidthPx(regime));
  w += BOOKMAP_TEXTURE_CELL_OVERLAP_PX * 0.35;
  return w;
}

type GranularMatrixDrawPassResult = {
  drawn: number;
  widthSum: number;
  widthMin: number;
  widthMax: number;
  overSpanWidthCount: number;
  weakDrawn: number;
  mediumDrawn: number;
  miniFragmentsDrawn: number;
  persistentFragments: number;
  newCells: number;
  fadingCells: number;
  reinforcedCells: number;
  wallCandidates: number;
  cellWidthSum: number;
  cellWidthCount: number;
  fragmentWidthSum: number;
  fragmentWidthCount: number;
  weakAlphaSum: number;
  weakAlphaCount: number;
  mediumAlphaSum: number;
  mediumAlphaCount: number;
  strongAlphaSum: number;
  strongAlphaCount: number;
  drawnWidths: number[];
};

function drawGranularMatrixCellsPass(
  ctx: CanvasRenderingContext2D,
  cells: PreparedEngineTextureCell[],
  metrics: EnginePlotMetrics,
  renderCtx: TextureVisualRenderContext,
  textureOpacityMul: number,
  mode: "primary" | "perp-overlay",
  historyEnd: number,
  microVisualMode: boolean,
): GranularMatrixDrawPassResult {
  const empty: GranularMatrixDrawPassResult = {
    drawn: 0,
    widthSum: 0,
    widthMin: 0,
    widthMax: 0,
    overSpanWidthCount: 0,
    weakDrawn: 0,
    mediumDrawn: 0,
    miniFragmentsDrawn: 0,
    persistentFragments: 0,
    newCells: 0,
    fadingCells: 0,
    reinforcedCells: 0,
    wallCandidates: 0,
    cellWidthSum: 0,
    cellWidthCount: 0,
    fragmentWidthSum: 0,
    fragmentWidthCount: 0,
    weakAlphaSum: 0,
    weakAlphaCount: 0,
    mediumAlphaSum: 0,
    mediumAlphaCount: 0,
    strongAlphaSum: 0,
    strongAlphaCount: 0,
    drawnWidths: [],
  };
  if (!cells.length) return empty;

  const { priceToY, timeToX } = metrics;
  const dataEdgeX = timeToX(historyEnd);
  const maxGranularW = resolveGranularMaxWidthPx(renderCtx.regime);
  const overSpanThreshold = maxGranularW * 1.35;
  const globalMul =
    textureOpacityMul * (mode === "perp-overlay" ? 0.88 : 1);
  const weakMinI = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_WEAK_TEXTURE_MIN_INTENSITY
    : TEX_CALIB_V2_WEAK_TEXTURE_MIN_INTENSITY;
  const weakDepthMul = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_WEAK_DEPTH_ALPHA_MUL
    : TEX_CALIB_V2_WEAK_DEPTH_ALPHA_MUL;
  const weakDepthMaxVi = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.45 : 0.3;

  const sorted = [...cells].sort(
    (a, b) => (a.intensity ?? 0) - (b.intensity ?? 0),
  );

  let drawn = 0;
  let widthSum = 0;
  let widthMin = Infinity;
  let widthMax = 0;
  let overSpanWidthCount = 0;
  let weakDrawn = 0;
  let mediumDrawn = 0;
  let miniFragmentsDrawn = 0;
  let persistentFragments = 0;
  let newCells = 0;
  let fadingCells = 0;
  let reinforcedCells = 0;
  let wallCandidates = 0;
  let cellWidthSum = 0;
  let cellWidthCount = 0;
  let fragmentWidthSum = 0;
  let fragmentWidthCount = 0;
  let weakAlphaSum = 0;
  let weakAlphaCount = 0;
  let mediumAlphaSum = 0;
  let mediumAlphaCount = 0;
  let strongAlphaSum = 0;
  let strongAlphaCount = 0;
  const drawnWidths: number[] = [];

  for (const cell of sorted) {
    const viRaw = cell.intensity ?? 0;
    const minRenderI =
      resolveTextureSourceKindForPrepared(cell) === "base"
        ? BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY
        : BOOKMAP_TEXTURE_MIN_RENDER_INTENSITY;
    if (viRaw < minRenderI) continue;

    const sourceKind = resolveTextureSourceKindForPrepared(cell);
    const maxSize = renderCtx.viewportMaxSize ?? cell.maxSizeInBucket;
    const localRank = Math.min(1, cell.maxSizeInBucket / Math.max(1, maxSize));
    const vi = BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE
      ? clampBookmapLikeRenderIntensity({
          intensity: viRaw,
          sourceKind,
          lifecycleTier: cell.lifecycleTextureTier,
          tier:
            sourceKind === "base"
              ? cell.maxSizeInBucket >= 8
                ? "strong"
                : cell.maxSizeInBucket >= 2
                  ? "medium"
                  : "low"
              : undefined,
          localRankScore: localRank,
          absoluteSizeScore: localRank,
          isStructuralWall: cell.maxSizeInBucket >= WALL_STRUCTURAL_BTC,
          isMajorWall: cell.maxSizeInBucket >= WALL_MAJOR_BTC || cell.isMajor,
        })
      : viRaw;

    const weight = computeBookmapVisualWeight({
      sizeBtc: cell.maxSizeInBucket,
      price: cell.price,
      midPrice: renderCtx.midPrice,
      regime: renderCtx.regime,
      baseIntensity: vi,
      isActive: false,
      viewportMaxSize: renderCtx.viewportMaxSize,
    });
    const alphaCtx = buildPassiveLiquidityAlphaContext({
      intensity: vi,
      isActive: false,
      weight,
      stableSizeBtc: cell.maxSizeInBucket,
    });
    let bodyAlpha = alphaForPassiveLiquidity(alphaCtx) * globalMul;
    const alphaFloor =
      cell.historicalRenderAlphaFloor ?? cell.historicalRenderAlpha;
    if (alphaFloor != null && alphaFloor > 0) {
      bodyAlpha = Math.max(bodyAlpha, alphaFloor * globalMul);
    }
    const depthAlphaBoost = resolveDepthPassNearPriceAlphaBoost(
      weight.pctFromMid,
      renderCtx.regime,
      cell.maxSizeInBucket,
      vi,
      1,
    );
    const bodyAlphaCap = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.82 : 0.72;
    if (depthAlphaBoost > 0) {
      bodyAlpha = Math.min(bodyAlphaCap, bodyAlpha * (1 + depthAlphaBoost));
    }

    const hash = granularCellDeterministicHash(cell.price, cell.timeBucket);
    bodyAlpha *=
      BOOKMAP_GRANULAR_ALPHA_MOD_MIN + hash * BOOKMAP_GRANULAR_ALPHA_MOD_RANGE;
    bodyAlpha *= resolveNaturalMatrixAlphaMultiplier(cell);
    if (vi < 0.22) {
      bodyAlpha *= NATURAL_MATRIX_WEAK_VISIBILITY_BOOST;
    }

    const { yTop, height } = textureCellVerticalBounds(
      cell.price,
      priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const { x0, w: cellWRaw } = resolveNaturalGranularDrawGeom(
      cell,
      timeToX,
      renderCtx.regime,
    );
    if (x0 >= dataEdgeX) continue;
    let cellW = cellWRaw;
    if (x0 + cellW > dataEdgeX) {
      cellW = Math.max(1, dataEdgeX - x0);
    }
    if (cellW > overSpanThreshold && !cell.isMiniFragment) {
      overSpanWidthCount += 1;
    }

    let drawVi = vi;
    if (
      BOOKMAP_NATURAL_MATRIX_LOGIC_V1 &&
      cell.liquidityLifeStage === "reinforced"
    ) {
      drawVi = Math.min(0.92, vi * (1.04 + (cell.visualRefillScore ?? 0) * 0.08));
    } else if (
      BOOKMAP_NATURAL_MATRIX_LOGIC_V1 &&
      (cell.liquidityLifeStage === "fading" || cell.liquidityLifeStage === "stale")
    ) {
      drawVi = vi * 0.92;
    }

    const rgb: [number, number, number] = microVisualMode
      ? intensityToMicroHistoricalTextureRgb(drawVi)
      : intensityToPassiveLiquidityRgb(drawVi);

    if (cell.isMiniFragment && cellW >= 3) {
      drawOrganicSpanBody(
        ctx,
        x0,
        cellW,
        yTop,
        height,
        {
          rgb,
          bodyAlpha,
          vi: drawVi,
          runLength: cell.continuityRunLength ?? 2,
          sizeBtc: cell.maxSizeInBucket,
          reinforcedBase: false,
          nearPrice: weight.pctFromMid <= DEPTH_V2_NEAR_PRICE_PCT,
        },
        lastWallOrganicRenderDiagStats,
      );
      miniFragmentsDrawn += 1;
      fragmentWidthSum += cellW;
      fragmentWidthCount += 1;
    } else if (
      BOOKMAP_HEATMAP_DEPTH_PASS_V2 &&
      drawVi < weakDepthMaxVi &&
      drawVi >= weakMinI
    ) {
      fillSpanRgba(ctx, x0, cellW, yTop, height, rgb, bodyAlpha * weakDepthMul);
    } else {
      fillSpanRgba(ctx, x0, cellW, yTop, height, rgb, bodyAlpha);
    }

    drawn += 1;
    widthSum += cellW;
    drawnWidths.push(cellW);
    if (cellW < widthMin) widthMin = cellW;
    if (cellW > widthMax) widthMax = cellW;
    if (vi < 0.22) {
      weakDrawn += 1;
      weakAlphaSum += bodyAlpha;
      weakAlphaCount += 1;
    } else if (vi < 0.52) {
      mediumDrawn += 1;
      mediumAlphaSum += bodyAlpha;
      mediumAlphaCount += 1;
    } else {
      strongAlphaSum += bodyAlpha;
      strongAlphaCount += 1;
    }
    if (!cell.isMiniFragment) {
      cellWidthSum += cellW;
      cellWidthCount += 1;
    }
    switch (cell.liquidityLifeStage) {
      case "new":
        newCells += 1;
        break;
      case "persistent":
        persistentFragments += 1;
        break;
      case "reinforced":
        reinforcedCells += 1;
        break;
      case "fading":
        fadingCells += 1;
        break;
      case "wall_candidate":
        wallCandidates += 1;
        break;
      default:
        break;
    }
  }

  return {
    drawn,
    widthSum,
    widthMin: drawn > 0 ? widthMin : 0,
    widthMax,
    overSpanWidthCount,
    weakDrawn,
    mediumDrawn,
    miniFragmentsDrawn,
    persistentFragments,
    newCells,
    fadingCells,
    reinforcedCells,
    wallCandidates,
    cellWidthSum,
    cellWidthCount,
    fragmentWidthSum,
    fragmentWidthCount,
    weakAlphaSum,
    weakAlphaCount,
    mediumAlphaSum,
    mediumAlphaCount,
    strongAlphaSum,
    strongAlphaCount,
    drawnWidths,
  };
}

function renderHeatmapTextureCells(
  ctx: CanvasRenderingContext2D,
  metrics: EnginePlotMetrics,
  cells: PreparedEngineTextureCell[],
  timeViewport: BookmapTimeViewport,
  visualSettings: BookmapVisualSettings | undefined,
  mode: "primary" | "perp-overlay" = "primary",
  overlayOpacityMul = 1,
  priceBucketSize = BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
  midPrice: number | null = null,
  timeMax = 0,
  timeMin = 0,
  historicalMaxTime?: number,
  visualCtx?: TextureVisualRenderContext,
): {
  rendered: number;
  filteredByTime: number;
  drawCapHit: boolean;
  avgTextureCellWidthPx: number;
  minTextureCellWidthPx: number;
  maxTextureCellWidthPx: number;
  historicalTextureLeftSideCount: number;
  historicalTextureRightSideCount: number;
  pulledFootprintLeftSideCount: number;
  pulledFootprintRightSideCount: number;
  beforeHistoricalRightSideCount: number;
  phase2ClipApplied: boolean;
  spanColorAudit: HistoricalSpanColorAudit;
  spanRenderContinuityAudit: SpanRenderContinuityAudit;
  spanTextureBalanceAudit: SpanTextureBalanceAudit;
} {
  if (!cells.length) {
    const emptyContinuity = createEmptySpanRenderContinuityAudit();
    return {
      rendered: 0,
      filteredByTime: 0,
      drawCapHit: false,
      avgTextureCellWidthPx: 0,
      minTextureCellWidthPx: 0,
      maxTextureCellWidthPx: 0,
      historicalTextureLeftSideCount: 0,
      historicalTextureRightSideCount: 0,
      pulledFootprintLeftSideCount: 0,
      pulledFootprintRightSideCount: 0,
      beforeHistoricalRightSideCount: 0,
      phase2ClipApplied: true,
      spanColorAudit: {
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
        historicalSpanColorProblemClassification: "empty",
      },
      spanRenderContinuityAudit: emptyContinuity,
      spanTextureBalanceAudit: createEmptySpanTextureBalanceAudit(),
    };
  }

  const { priceToY, timeToX } = metrics;
  const bucketMs = BOOKMAP_ENGINE_BUCKET_MS;
  const effectiveTextureBucketMs = BOOKMAP_TEXTURE_SAMPLER_MS;
  const visibleStart = Math.max(
    timeViewport.visibleStartTime - bucketMs,
    timeMin > 0 ? timeMin - bucketMs : timeViewport.dataStartTime - bucketMs,
  );
  const visibleEnd = Math.min(
    timeViewport.visibleEndTime + bucketMs,
    timeMax > 0 ? timeMax + bucketMs : timeViewport.dataEndTime + bucketMs,
  );
  const heatmapOpacity =
    mode === "perp-overlay" ? 1 : (visualSettings?.heatmap.opacity ?? 1);
  const textureOpacityMul =
    mode === "perp-overlay"
      ? BOOKMAP_TEXTURE_OVERLAY_OPACITY_MUL * overlayOpacityMul
      : BOOKMAP_TEXTURE_OPACITY_MUL * heatmapOpacity;
  const dataTimeMax = timeMax > 0 ? timeMax : visibleEnd;
  const historyEnd =
    historicalMaxTime != null && historicalMaxTime > 0
      ? historicalMaxTime
      : timeViewport.dataEndTime;

  const inViewport = cells.filter((cell) => {
    const spanEnd =
      cell.endTimeBucket ?? cell.timeBucket + effectiveTextureBucketMs;
    if (spanEnd < visibleStart || cell.timeBucket > visibleEnd) return false;
    return true;
  });
  const filteredByTime = cells.length - inViewport.length;

  const eligible = inViewport.filter((c) => {
    const minI =
      resolveTextureSourceKindForPrepared(c) === "base"
        ? BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY
        : BOOKMAP_TEXTURE_MIN_RENDER_INTENSITY;
    return (c.intensity ?? 0) >= minI;
  });
  const drawCapHit = eligible.length > BOOKMAP_TEXTURE_MAX_DRAW_CELLS;
  const drawPool = drawCapHit
    ? [...eligible]
        .sort(
          (a, b) =>
            textureDrawPriorityScore(
              b,
              midPrice,
              dataTimeMax,
              visibleStart,
              visibleEnd,
            ) -
            textureDrawPriorityScore(
              a,
              midPrice,
              dataTimeMax,
              visibleStart,
              visibleEnd,
            ),
        )
        .slice(0, BOOKMAP_TEXTURE_MAX_DRAW_CELLS)
    : eligible;

  const granularPool =
    BOOKMAP_GRANULAR_MATRIX_RENDERER_V1
      ? drawPool.filter((c) => c.isGranularMatrixCell === true)
      : [];
  const spanPool =
    BOOKMAP_GRANULAR_MATRIX_RENDERER_V1
      ? drawPool.filter((c) => c.isGranularMatrixCell !== true)
      : drawPool;

  const renderCtx: TextureVisualRenderContext =
    visualCtx ??
    ({
      regime: "micro",
      midPrice,
      dataEndTime: historyEnd,
      now: Date.now(),
      viewportMaxSize: computeViewportSizeStats(drawPool).maxSize,
    } satisfies TextureVisualRenderContext);

  const { segments, stableFillByKey, spanColorAudit } = prepareL2BandDrawQueue({
    cells: spanPool,
    regime: renderCtx.regime,
    midPrice: renderCtx.midPrice,
    dataEndTime: renderCtx.dataEndTime,
    now: renderCtx.now,
    viewportMaxSize: renderCtx.viewportMaxSize,
    visibleStart,
    visibleEnd,
    historyEnd,
    samplerMs: effectiveTextureBucketMs,
    l2Stats: renderCtx.l2Stats,
    microVisualHierarchyActive: renderCtx.microVisualHierarchyActive,
    spanPeakCache: renderCtx.spanPeakCache,
    visualRegime: renderCtx.microVisualHierarchyActive ? "micro" : "std",
  });
  if (renderCtx.spanColorAuditOut) {
    Object.assign(renderCtx.spanColorAuditOut, spanColorAudit);
  }

  if (renderCtx.stableL2FillByKey) {
    for (const [key, entry] of stableFillByKey) {
      renderCtx.stableL2FillByKey.set(key, entry);
    }
  } else {
    renderCtx.stableL2FillByKey = stableFillByKey;
  }

  if (renderCtx.visualStats) {
    for (const segment of segments) {
      if (segment.usesGranularBlocks) {
        renderCtx.visualStats.granularDrawCount += 1;
      } else {
        renderCtx.visualStats.continuousDrawCount += 1;
      }
      if (
        (segment.bandClass === "stableActiveL2Band" ||
          segment.bandClass === "closedRelevantHistoryBand") &&
        segment.usesGranularBlocks &&
        renderCtx.l2Stats
      ) {
        renderCtx.l2Stats.stableBandsIncorrectlySplitByChunkColorCount += 1;
      }
    }
  }

  const spanGroups = buildTextureSpanRenderGroups(segments);
  const sortedGroups = [...spanGroups].sort(
    (a, b) => a.peakIntensity - b.peakIntensity,
  );
  const microVisualMode = renderCtx.microVisualHierarchyActive === true;
  const spanBaseEnabled = BOOKMAP_TEXTURE_SPAN_BASE_RENDER_ENABLED;
  const effectiveChunkOverlayAlpha = resolveEffectiveChunkOverlayAlpha();
  const overlayEnabled = spanBaseEnabled && effectiveChunkOverlayAlpha > 0;
  const overlayRatioBounds = resolveInternalOverlayRatioBounds(
    microVisualMode,
    renderCtx.regime,
  );

  let thinOverlayCandidates = 0;
  let overlayCandidates = 0;
  if (overlayEnabled) {
    for (const group of spanGroups) {
      for (const chunkSeg of group.segments) {
        if (!chunkSeg.usesGranularBlocks) continue;
        overlayCandidates += 1;
        const chunkW =
          timeToX(chunkSeg.spanEnd) - timeToX(chunkSeg.spanStart);
        if (chunkW < BOOKMAP_TEXTURE_CHUNK_OVERLAY_MIN_WIDTH_PX) {
          thinOverlayCandidates += 1;
        }
      }
    }
  }
  const fragmentationRate =
    overlayCandidates > 0 ? thinOverlayCandidates / overlayCandidates : 0;
  const overlayRatioScale = fragmentationRate > 0.1 ? 0.65 : 1;

  const continuityAudit = createEmptySpanRenderContinuityAudit();
  continuityAudit.spanBaseLayerEnabled = spanBaseEnabled;
  continuityAudit.spanTextureOverlayEnabled = overlayEnabled;
  continuityAudit.renderedSpanCount = spanGroups.length;
  continuityAudit.renderedChunkCount = segments.length;

  const textureBalanceAudit = createEmptySpanTextureBalanceAudit();
  textureBalanceAudit.renderedSpanCount = spanGroups.length;
  textureBalanceAudit.spanBaseLayerEnabled = spanBaseEnabled;
  textureBalanceAudit.internalTextureOverlayEnabled = overlayEnabled;

  ctx.save();
  lastWallOrganicRenderDiagStats = {
    organicSpanCount: 0,
    innerCoreCount: 0,
    edgeFadeCount: 0,
    weakDepthCount: 0,
    nearPriceBoostCount: 0,
    skippedOverlayCount: 0,
    overlaySpanCount: 0,
    baseAlphaMin: 0,
    baseAlphaMax: 0,
    weakSpansDrawn: 0,
    mediumSpansDrawn: 0,
    strongSpansDrawn: 0,
    solidBaseAlphaSum: 0,
    solidBaseAlphaCount: 0,
    textureOverlayAlphaSum: 0,
    textureOverlayAlphaCount: 0,
  };
  const organicDiag = lastWallOrganicRenderDiagStats;
  const matrixDiagAcc = {
    visibleTextureCells: 0,
    visibleSpans: 0,
    weakDrawn: 0,
    mediumDrawn: 0,
    strongDrawn: 0,
    historicalSpans: 0,
    granularMatrixCells: 0,
    solidBaseSpans: 0,
    granularOverlaySpans: 0,
    skippedForAlpha: 0,
    skippedForSize: 0,
    skippedForViewport: filteredByTime,
  };

  let rendered = 0;
  let widthSum = 0;
  let widthMin = Infinity;
  let widthMax = 0;
  let spanWidthSum = 0;
  let chunkWidthSum = 0;
  let chunkWidthCount = 0;
  let maxChunksPerSpan = 0;
  let spansAsSingleRect = 0;
  let spansAsChunks = 0;
  let baseAlphaSum = 0;
  let baseAlphaCount = 0;
  let overlayAlphaSum = 0;
  let overlayAlphaCount = 0;
  let internalSizeVarianceSum = 0;
  let internalSizeVarianceCount = 0;
  let spansWithInternalVariation = 0;
  let spansTooFlatCount = 0;
  let spansTooFragmentedCount = 0;
  let spansWithOverlay = 0;
  let historicalTextureLeftSideCount = 0;
  let historicalTextureRightSideCount = 0;
  let pulledFootprintLeftSideCount = 0;
  let pulledFootprintRightSideCount = 0;
  let beforeHistoricalRightSideCount = 0;
  const dataEdgeMs = historyEnd;
  const dataEdgeX = timeToX(dataEdgeMs);

  const microVisualModeForGranular =
    renderCtx.microVisualHierarchyActive === true;
  const granularDrawResult =
    BOOKMAP_GRANULAR_MATRIX_RENDERER_V1 && granularPool.length > 0
      ? drawGranularMatrixCellsPass(
          ctx,
          granularPool,
          metrics,
          renderCtx,
          textureOpacityMul,
          mode,
          historyEnd,
          microVisualModeForGranular,
        )
      : null;

  for (const group of sortedGroups) {
    const rep = group.representative;
    const { cell, weight, isActive, closedAgeMs } = rep;
    const chunkCount = group.segments.length;
    if (chunkCount > maxChunksPerSpan) maxChunksPerSpan = chunkCount;
    if (chunkCount > 1) spansAsChunks += 1;
    else spansAsSingleRect += 1;

    const viRaw = resolveTextureSegmentIntensity(rep, group.peakIntensity);
    const minRenderI =
      resolveTextureSourceKindForPrepared(cell) === "base"
        ? BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY
        : BOOKMAP_TEXTURE_MIN_RENDER_INTENSITY;
    if (viRaw < minRenderI) {
      matrixDiagAcc.skippedForAlpha += 1;
      continue;
    }

    const sourceKind = resolveTextureSourceKindForPrepared(cell);
    const maxSize = renderCtx.viewportMaxSize ?? rep.stableSizeBtc;
    const localRank = Math.min(1, rep.stableSizeBtc / Math.max(1, maxSize));
    let vi = BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE
      ? clampBookmapLikeRenderIntensity({
          intensity: viRaw,
          sourceKind,
          lifecycleTier: cell.lifecycleTextureTier,
          tier:
            sourceKind === "base"
              ? rep.stableSizeBtc >= 8
                ? "strong"
                : rep.stableSizeBtc >= 2
                  ? "medium"
                  : "low"
              : undefined,
          localRankScore: localRank,
          absoluteSizeScore: localRank,
          isStructuralWall:
            cell.maxSizeInBucket >= WALL_STRUCTURAL_BTC,
          isMajorWall: cell.maxSizeInBucket >= WALL_MAJOR_BTC || cell.isMajor,
        })
      : viRaw;

    if (BOOKMAP_NATURAL_MATRIX_LOGIC_V1 && cell.liquidityLifeStage) {
      if (
        cell.liquidityLifeStage === "reinforced" ||
        cell.liquidityLifeStage === "wall_candidate"
      ) {
        vi = Math.min(
          0.96,
          vi * (1.03 + (cell.visualRefillScore ?? 0) * 0.06),
        );
      } else if (
        cell.liquidityLifeStage === "fading" ||
        cell.liquidityLifeStage === "stale"
      ) {
        vi *= 0.94;
      }
    }

    const bodyAlpha = resolveTextureSegmentBodyAlpha(
      rep,
      vi,
      renderCtx,
      textureOpacityMul,
      mode,
    );
    const depthAlphaBoost = resolveDepthPassNearPriceAlphaBoost(
      weight.pctFromMid,
      renderCtx.regime,
      rep.stableSizeBtc,
      vi,
      cell.continuityRunLength ?? 1,
    );
    const bodyAlphaCap = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.82 : 0.72;
    let adjustedBodyAlpha =
      depthAlphaBoost > 0
        ? Math.min(bodyAlphaCap, bodyAlpha * (1 + depthAlphaBoost))
        : bodyAlpha;
    if (BOOKMAP_NATURAL_MATRIX_LOGIC_V1 && cell.liquidityLifeStage) {
      adjustedBodyAlpha *= resolveNaturalMatrixAlphaMultiplier(cell);
    }
    if (depthAlphaBoost > 0) organicDiag.nearPriceBoostCount += 1;
    const globalMul =
      textureOpacityMul * (mode === "perp-overlay" ? 0.88 : 1);
    const alphaCtx = buildPassiveLiquidityAlphaContext({
      intensity: vi,
      isActive,
      bandClass: rep.bandClass,
      closedAgeMs,
      weight,
      stableSizeBtc: rep.stableSizeBtc,
    });

    if (renderCtx.historicalColorLockAudit) {
      renderCtx.historicalColorLockAudit.renderSampleCount += 1;
      renderCtx.historicalColorLockAudit.intensityFinalSum += vi;
      renderCtx.historicalColorLockAudit.alphaFinalSum += bodyAlpha;
    }

    const nearRecentDots =
      cell.timeBucket >= dataEdgeMs - effectiveTextureBucketMs * 4 &&
      weight.pctFromMid <= 0.25;
    recordHeatmapAlphaNearDots(bodyAlpha, nearRecentDots);

    const { yTop, height } = textureCellVerticalBounds(
      cell.price,
      priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) {
      matrixDiagAcc.skippedForViewport += 1;
      continue;
    }
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) {
      matrixDiagAcc.skippedForViewport += 1;
      continue;
    }

    if (spanBaseEnabled) {
      const clip = clipHistoricalSpanToDataEdge(
        group.spanStart,
        group.spanEnd,
        dataEdgeMs,
      );
      if (!clip) continue;

      const isPulledFootprint = rep.bandClass === "closedRelevantHistoryBand";
      if (clip.wouldExtendPastEdge) {
        beforeHistoricalRightSideCount += 1;
      }
      historicalTextureLeftSideCount += 1;
      if (isPulledFootprint) pulledFootprintLeftSideCount += 1;

      const x0 = timeToX(clip.clippedStart);
      let x1 = timeToX(clip.clippedEnd);
      let spanW = x1 - x0;
      if (spanW < BOOKMAP_TEXTURE_MIN_CELL_WIDTH_PX) {
        spanW = BOOKMAP_TEXTURE_MIN_CELL_WIDTH_PX;
        x1 = x0 + spanW;
      }
      spanW += BOOKMAP_TEXTURE_CELL_OVERLAP_PX;
      if (x0 >= dataEdgeX) continue;
      if (x1 > dataEdgeX) {
        spanW = Math.max(0, dataEdgeX - x0) + BOOKMAP_TEXTURE_CELL_OVERLAP_PX;
        x1 = dataEdgeX;
      }

      const runLength = cell.continuityRunLength ?? 1;
      const nearPrice = weight.pctFromMid <= DEPTH_V2_NEAR_PRICE_PCT;
      const reinforcedBase =
        BOOKMAP_HORIZONTAL_PERSISTENCE_V2 &&
        vi >= H_PERSIST_V2_SOLID_BASE_MIN_INTENSITY &&
        (rep.stableSizeBtc >= WALL_IMPORTANT_BTC || runLength >= 3);
      const spanRgb: [number, number, number] = microVisualMode
        ? intensityToMicroHistoricalTextureRgb(vi)
        : intensityToPassiveLiquidityRgb(vi);

      drawOrganicSpanBody(
        ctx,
        x0,
        spanW,
        yTop,
        height,
        {
          rgb: spanRgb,
          bodyAlpha: adjustedBodyAlpha,
          vi,
          runLength,
          sizeBtc: rep.stableSizeBtc,
          reinforcedBase,
          nearPrice,
        },
        organicDiag,
      );

      matrixDiagAcc.visibleTextureCells += 1;
      matrixDiagAcc.visibleSpans += 1;
      if (runLength <= 1) matrixDiagAcc.granularMatrixCells += 1;
      else matrixDiagAcc.historicalSpans += 1;
      if (spanBaseEnabled) matrixDiagAcc.solidBaseSpans += 1;
      if (vi < 0.22) matrixDiagAcc.weakDrawn += 1;
      else if (vi < 0.52) matrixDiagAcc.mediumDrawn += 1;
      else matrixDiagAcc.strongDrawn += 1;

      rendered += 1;
      widthSum += spanW;
      spanWidthSum += spanW;
      if (spanW < widthMin) widthMin = spanW;
      if (spanW > widthMax) widthMax = spanW;
    }

    if (isActive && renderCtx.historicalActiveAlphaByKey) {
      renderCtx.historicalActiveAlphaByKey.set(
        stableL2FillKey(cell.side, cell.price),
        bodyAlpha,
      );
    }

    if (renderCtx.paletteStats) {
      recordBookmapPaletteParitySample(renderCtx.paletteStats, {
        intensity: vi,
        alpha: bodyAlpha,
        isActive,
        isRelevantL2:
          rep.bandClass === "stableActiveL2Band" ||
          rep.stableSizeBtc >= WALL_IMPORTANT_BTC,
        regime: renderCtx.regime,
        nearPriceBoost: weight.nearPriceContrastBoost,
        farFade: weight.farDistanceFade,
      });
    }

    if (renderCtx.microHierarchyStats && microVisualMode) {
      const existingIntensity = cell.dataIntensity ?? cell.intensity ?? vi;
      const microRenderIntensity = cell.microScalpRenderIntensity ?? vi;
      const distPct =
        renderCtx.midPrice != null && renderCtx.midPrice > 0
          ? Math.abs(cell.price - renderCtx.midPrice) / renderCtx.midPrice
          : 1;
      const microDataIntensity = computeMicroDataIntensity({
        sizeBtc: rep.stableSizeBtc,
        localRankScore: cell.localRankScore ?? 0,
        proximityScore: microProximityScore(distPct),
        persistenceScore: microPersistenceScore(cell.persistenceMs ?? 0),
        continuityScore:
          cell.continuityRunLength != null
            ? microContinuityScore(cell.continuityRunLength)
            : undefined,
      });
      recordBookmapMicroVisualHierarchySample(renderCtx.microHierarchyStats, {
        sizeBtc: rep.stableSizeBtc,
        existingIntensity,
        microDataIntensity,
        microRenderIntensity,
        historicalAlpha: bodyAlpha,
        nearTouch: weight.pctFromMid <= 0.15,
      });
    }

    if (renderCtx.visualStats) {
      recordBookmapVisualAlphaSample(renderCtx.visualStats, {
        alpha: bodyAlpha,
        pctFromMid: weight.pctFromMid,
        isActive,
        closedAgeMs,
        isRecentPullCandidate: weight.isRecentPullCandidate,
        isWallPullCandidate: weight.isWallPullCandidate,
        regime: renderCtx.regime,
      });
    }

    if (spanBaseEnabled) {
      baseAlphaSum += bodyAlpha;
      baseAlphaCount += 1;
    }

    const spanPeakSizeBtc = rep.peakSizeBtc ?? rep.stableSizeBtc;
    const granularSizes = group.segments
      .filter((seg) => seg.usesGranularBlocks)
      .map((seg) => seg.chunkSizeBtc ?? seg.stableSizeBtc);
    if (granularSizes.length > 1 && spanPeakSizeBtc > 0) {
      const minSize = Math.min(...granularSizes);
      const maxSize = Math.max(...granularSizes);
      const variance = maxSize > 0 ? (maxSize - minSize) / maxSize : 0;
      internalSizeVarianceSum += variance;
      internalSizeVarianceCount += 1;
      if (variance > 0.05 || maxSize / Math.max(minSize, 0.001) > 1.1) {
        spansWithInternalVariation += 1;
      }
    }

    if (overlayEnabled && chunkCount > 1) {
      const skipWeakOverlay =
        !BOOKMAP_TEXTURE_CALIBRATION_V2 &&
        BOOKMAP_HORIZONTAL_PERSISTENCE_V2 &&
        vi >= H_PERSIST_V2_SOLID_BASE_MIN_INTENSITY &&
        chunkCount <= 3;
      if (skipWeakOverlay) organicDiag.skippedOverlayCount += 1;
      const overlayOps = skipWeakOverlay
        ? []
        : buildInternalOverlayDrawOps(
            group,
            vi,
            spanPeakSizeBtc,
            timeToX,
          );
      if (overlayOps.length > 0) {
        organicDiag.overlaySpanCount += 1;
        matrixDiagAcc.granularOverlaySpans += 1;
        spansWithOverlay += 1;
        let spanOverlayAlphaSum = 0;
        let spanOverlayAlphaMax = 0;
        let spanThinOps = 0;

        for (const op of overlayOps) {
          if (op.x0 >= dataEdgeX) continue;
          const clippedX1 = Math.min(op.x1, dataEdgeX);
          const opW = clippedX1 - op.x0;
          if (opW < 1) continue;

          const overlayVi = Math.max(
            vi * 0.92,
            Math.min(op.overlayIntensity, vi * 1.04),
          );
          const overlayAlpha =
            computeInternalOverlayAlpha(
              adjustedBodyAlpha,
              op.chunkRelativeStrength,
              overlayRatioBounds,
              microVisualMode,
              overlayRatioScale,
            ) *
            (BOOKMAP_HORIZONTAL_PERSISTENCE_V2
              ? effectiveChunkOverlayAlpha /
                  BOOKMAP_TEXTURE_INTERNAL_CHUNK_OVERLAY_ALPHA
              : 1);
          const overlayScale = resolveAggressiveOverlayScale(vi);
          const legacyStrongWallScale =
            !BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 &&
            BOOKMAP_TEXTURE_CALIBRATION_V2 &&
            vi >= H_PERSIST_V2_SOLID_BASE_MIN_INTENSITY
              ? 0.72
              : 1;
          const finalOverlayAlpha = overlayAlpha * overlayScale * legacyStrongWallScale;
          spanOverlayAlphaSum += finalOverlayAlpha;
          if (finalOverlayAlpha > spanOverlayAlphaMax) {
            spanOverlayAlphaMax = finalOverlayAlpha;
          }

          chunkWidthSum += opW;
          chunkWidthCount += 1;
          if (opW < BOOKMAP_TEXTURE_CHUNK_OVERLAY_MIN_WIDTH_PX) {
            spanThinOps += 1;
          }

          overlayAlphaSum += finalOverlayAlpha;
          overlayAlphaCount += 1;
          organicDiag.textureOverlayAlphaSum += finalOverlayAlpha;
          organicDiag.textureOverlayAlphaCount += 1;

          const [r, g, b] = intensityToPassiveLiquidityRgb(overlayVi);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${finalOverlayAlpha})`;
          ctx.fillRect(op.x0, yTop, opW, height);
        }

        const spanAvgOverlay =
          overlayOps.length > 0 ? spanOverlayAlphaSum / overlayOps.length : 0;
        if (spanAvgOverlay < bodyAlpha * 0.08) spansTooFlatCount += 1;
        if (
          overlayOps.length > 2 &&
          spanThinOps / overlayOps.length > 0.35
        ) {
          spansTooFragmentedCount += 1;
        }
      } else if (chunkCount > 1) {
        spansTooFlatCount += 1;
      }
    }
  }

  lastRenderMatrixDiag = {
    ...matrixDiagAcc,
    liveProjectionSpans: lastRenderMatrixDiag.liveProjectionSpans,
    timestamp: Date.now(),
  };

  if (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1) {
    lastGranularMatrixRendererDiag = {
      granularCellsInput: granularPool.length,
      granularCellsDrawn: granularDrawResult?.drawn ?? 0,
      avgGranularWidthPx:
        granularDrawResult != null && granularDrawResult.drawn > 0
          ? Number(
              (granularDrawResult.widthSum / granularDrawResult.drawn).toFixed(
                2,
              ),
            )
          : 0,
      maxGranularWidthPx: granularDrawResult?.widthMax ?? 0,
      granularCellsOverSpanWidthCount:
        granularDrawResult?.overSpanWidthCount ?? 0,
      weakGranularDrawn: granularDrawResult?.weakDrawn ?? 0,
      mediumGranularDrawn: granularDrawResult?.mediumDrawn ?? 0,
      strongSpanDrawn: matrixDiagAcc.strongDrawn,
      liveProjectionDrawn: lastGranularMatrixRendererDiag.liveProjectionDrawn,
      timestamp: Date.now(),
    };
    emitGranularMatrixRendererDiag();
  }

  if (BOOKMAP_NATURAL_MATRIX_LOGIC_V1) {
    const g = granularDrawResult;
    lastNaturalMatrixLogicDiag = {
      granularCellsInput: granularPool.length,
      granularCellsDrawn: g?.drawn ?? 0,
      miniFragmentsDrawn: g?.miniFragmentsDrawn ?? 0,
      persistentFragments: g?.persistentFragments ?? 0,
      newCells: g?.newCells ?? 0,
      fadingCells: g?.fadingCells ?? 0,
      reinforcedCells: g?.reinforcedCells ?? 0,
      wallCandidates: g?.wallCandidates ?? 0,
      avgCellWidthPx:
        g != null && g.cellWidthCount > 0
          ? Number((g.cellWidthSum / g.cellWidthCount).toFixed(2))
          : 0,
      avgFragmentWidthPx:
        g != null && g.fragmentWidthCount > 0
          ? Number((g.fragmentWidthSum / g.fragmentWidthCount).toFixed(2))
          : 0,
      avgAlphaWeak:
        g != null && g.weakAlphaCount > 0
          ? Number((g.weakAlphaSum / g.weakAlphaCount).toFixed(3))
          : 0,
      avgAlphaMedium:
        g != null && g.mediumAlphaCount > 0
          ? Number((g.mediumAlphaSum / g.mediumAlphaCount).toFixed(3))
          : 0,
      avgAlphaStrong:
        g != null && g.strongAlphaCount > 0
          ? Number((g.strongAlphaSum / g.strongAlphaCount).toFixed(3))
          : 0,
      gridUniformityScore: Number(
        computeGridUniformityScore(g?.drawnWidths ?? []).toFixed(3),
      ),
      timestamp: Date.now(),
    };
    emitNaturalMatrixLogicDiag();
  }

  ctx.restore();

  const spanN = Math.max(1, spanGroups.length);
  const chunkN = Math.max(1, chunkWidthCount);
  continuityAudit.avgChunksPerSpan = Number(
    (segments.length / spanN).toFixed(2),
  );
  continuityAudit.maxChunksPerSpan = maxChunksPerSpan;
  continuityAudit.spansRenderedAsSingleRect = spansAsSingleRect;
  continuityAudit.spansRenderedAsChunks = spansAsChunks;
  continuityAudit.avgSpanWidthPx = Number(
    (spanWidthSum / Math.max(1, rendered)).toFixed(2),
  );
  continuityAudit.avgChunkWidthPx = Number((chunkWidthSum / chunkN).toFixed(2));
  continuityAudit.chunkFragmentationDetected =
    overlayEnabled &&
    spansAsChunks > 0 &&
    continuityAudit.avgChunkWidthPx < BOOKMAP_TEXTURE_CHUNK_OVERLAY_MIN_WIDTH_PX;
  continuityAudit.spanContinuityOk =
    spanBaseEnabled &&
    rendered > 0 &&
    spansAsSingleRect / spanN >= 0.9;
  continuityAudit.problemClassification = continuityAudit.spanContinuityOk
    ? "healthy_continuous_span"
    : !spanBaseEnabled
      ? "base_span_missing"
      : spansAsChunks > spanN * 0.5
        ? "span_detected_rendered_as_chunks"
        : overlayEnabled
          ? "chunk_alpha_too_strong"
          : "pending";

  if (renderCtx.spanRenderContinuityAuditOut) {
    Object.assign(renderCtx.spanRenderContinuityAuditOut, continuityAudit);
  }

  const avgBaseAlpha =
    baseAlphaCount > 0 ? baseAlphaSum / baseAlphaCount : 0;
  const avgOverlayAlpha =
    overlayAlphaCount > 0 ? overlayAlphaSum / overlayAlphaCount : 0;
  const overlayToBaseAlphaRatio =
    avgBaseAlpha > 0 ? avgOverlayAlpha / avgBaseAlpha : 0;
  const spansTooFlat =
    spansWithOverlay > 0 &&
    spansTooFlatCount / Math.max(1, spansWithOverlay) > 0.25;
  const spansTooFragmented =
    spansWithOverlay > 0 &&
    spansTooFragmentedCount / Math.max(1, spansWithOverlay) > 0.1;

  textureBalanceAudit.avgBaseAlpha = Number(avgBaseAlpha.toFixed(4));
  textureBalanceAudit.avgOverlayAlpha = Number(avgOverlayAlpha.toFixed(4));
  textureBalanceAudit.overlayToBaseAlphaRatio = Number(
    overlayToBaseAlphaRatio.toFixed(4),
  );
  textureBalanceAudit.avgInternalSizeVariance =
    internalSizeVarianceCount > 0
      ? Number(
          (internalSizeVarianceSum / internalSizeVarianceCount).toFixed(4),
        )
      : 0;
  textureBalanceAudit.spansWithInternalVariation = spansWithInternalVariation;
  textureBalanceAudit.spansTooFlat = spansTooFlat;
  textureBalanceAudit.spansTooFragmented = spansTooFragmented;
  textureBalanceAudit.bookmapTextureBalanceOk =
    spanBaseEnabled &&
    overlayEnabled &&
    overlayToBaseAlphaRatio >= 0.12 &&
    overlayToBaseAlphaRatio <= 0.28 &&
    !spansTooFlat &&
    !spansTooFragmented;
  textureBalanceAudit.problemClassification = !spanBaseEnabled
    ? "base_span_missing"
    : spansWithInternalVariation === 0
      ? "no_internal_size_variance"
      : spansTooFlat
        ? "internal_texture_too_weak"
        : spansTooFragmented
          ? "overlay_too_strong_fragmentation_risk"
          : textureBalanceAudit.bookmapTextureBalanceOk
            ? "healthy_bookmap_texture_balance"
            : overlayToBaseAlphaRatio < 0.12
              ? "internal_texture_too_weak"
              : overlayToBaseAlphaRatio > 0.28
                ? "overlay_too_strong_fragmentation_risk"
                : "pending";

  if (renderCtx.spanTextureBalanceAuditOut) {
    Object.assign(renderCtx.spanTextureBalanceAuditOut, textureBalanceAudit);
  }

  return {
    rendered,
    filteredByTime,
    drawCapHit,
    avgTextureCellWidthPx: rendered > 0 ? widthSum / rendered : 0,
    minTextureCellWidthPx: rendered > 0 && widthMin !== Infinity ? widthMin : 0,
    maxTextureCellWidthPx: widthMax,
    historicalTextureLeftSideCount,
    historicalTextureRightSideCount,
    pulledFootprintLeftSideCount,
    pulledFootprintRightSideCount,
    beforeHistoricalRightSideCount,
    phase2ClipApplied: true,
    spanColorAudit,
    spanRenderContinuityAudit: continuityAudit,
    spanTextureBalanceAudit: textureBalanceAudit,
  };
}

export type LiveProjectionRenderResult = {
  rendered: number;
  projectionStartTime: number;
  projectionEndTime: number;
  avgProjectionWidthPx: number;
  minProjectionWidthPx: number;
  maxProjectionWidthPx: number;
  projectionOverlapsHistory: boolean;
};

function resolveLiveProjectionWindow(
  timeViewport: BookmapTimeViewport,
  strictDataEdgeStart = false,
  forceNoHistoryOverlap = false,
): {
  startTime: number;
  endTime: number;
  overlapsHistory: boolean;
} | null {
  const dataEdge = timeViewport.dataEndTime;
  const projectionEnd = timeViewport.visibleEndTime;
  if (projectionEnd <= dataEdge + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS) {
    return null;
  }
  const overlapStart = Math.max(
    timeViewport.visibleStartTime,
    dataEdge - BOOKMAP_LIVE_PROJECTION_HISTORY_OVERLAP_MS,
  );
  const useStrict = strictDataEdgeStart || forceNoHistoryOverlap;
  const startTime = useStrict ? dataEdge : overlapStart;
  return {
    startTime,
    endTime: projectionEnd,
    overlapsHistory: !useStrict && startTime < dataEdge,
  };
}

function emptyMicroScalpRenderStats(): MicroScalpLayerRenderStats {
  return {
    liveProjectionRectCount: 0,
    activeDomBandRectCount: 0,
    wallBandRightSideRectCount: 0,
    structuralWallRightSideRectCount: 0,
    majorWallRightSideRectCount: 0,
    rightSideTotalRectCount: 0,
    rightSideCoveragePct: 0,
    rightSideDominantLayer: "none",
    rightSideWidthPx: 0,
    duplicatedActiveDomAndProjectionBucketsCount: 0,
    duplicatedWallAndLiveBucketsCount: 0,
    avgRightSideAlpha: 0,
    maxRightSideAlpha: 0,
  };
}

type LiveProjectionRenderOpts = {
  strictDataEdgeStart?: boolean;
  forceNoHistoryOverlap?: boolean;
  layerTag?: "active-dom" | "live-projection";
  statsOut?: MicroScalpLayerRenderStats;
  activeDomPriceKeys?: Set<string>;
  priceBucketStep?: number;
  minPrice?: number;
  maxPrice?: number;
  continuityPlan?: LiquidityContinuityPlan | null;
  continuityRenderStatsOut?: {
    seamBlendAppliedCount: number;
    continuingFromHistoricalRenderCount: number;
    liveOnlyFadeRenderCount: number;
  };
  liveDomRenderCaptureOut?: LiveDomRenderCapture;
  rightSideDensityCaptureOut?: RightSideDensityRenderCapture;
  midPrice?: number | null;
  verticalMode?: string;
};

/** P7.5/P7.6 — project current resting limits into right-space only (not historical). */
function renderLiveBookProjection(
  ctx: CanvasRenderingContext2D,
  metrics: EnginePlotMetrics,
  levels: PreparedLiveProjectionLevel[],
  timeViewport: BookmapTimeViewport,
  visualSettings: BookmapVisualSettings | undefined,
  visualCtx?: TextureVisualRenderContext,
  renderOpts?: LiveProjectionRenderOpts,
): LiveProjectionRenderResult {
  const empty: LiveProjectionRenderResult = {
    rendered: 0,
    projectionStartTime: timeViewport.dataEndTime,
    projectionEndTime: timeViewport.visibleEndTime,
    avgProjectionWidthPx: 0,
    minProjectionWidthPx: 0,
    maxProjectionWidthPx: 0,
    projectionOverlapsHistory: false,
  };

  const window = resolveLiveProjectionWindow(
    timeViewport,
    renderOpts?.strictDataEdgeStart ?? false,
    renderOpts?.forceNoHistoryOverlap ?? false,
  );
  if (!window || !levels.length) return empty;

  const { priceToY, timeToX } = metrics;
  const x0 = timeToX(window.startTime);
  const x1 = timeToX(window.endTime);
  const w = Math.max(0, x1 - x0);
  if (w < 2 || x1 <= HEATMAP_PAD.left) {
    return { ...empty, projectionOverlapsHistory: window.overlapsHistory };
  }

  if (renderOpts?.statsOut) {
    renderOpts.statsOut.rightSideWidthPx = w;
  }

  const heatmapOpacity = visualSettings?.heatmap.opacity ?? 1;
  const renderCtx: TextureVisualRenderContext =
    visualCtx ??
    ({
      regime: "micro",
      midPrice: null,
      dataEndTime: timeViewport.dataEndTime,
      now: Date.now(),
      viewportMaxSize: computeViewportSizeStats(
        levels.map((l) => ({
          timeBucket: 0,
          price: l.price,
          side: l.side,
          intensity: l.intensity,
          isMajor: false,
          maxSizeInBucket: l.sizeBtc,
        })),
      ).maxSize,
    } satisfies TextureVisualRenderContext);

  const sorted = [...levels].sort((a, b) => a.intensity - b.intensity);
  let rendered = 0;
  let alphaSum = 0;
  let alphaMax = 0;
  const renderedPriceKeys = new Set<string>();

  const bucketStep = renderOpts?.priceBucketStep ?? metrics.domBucketSize;
  const domBucketSize = metrics.domBucketSize;
  const verticalMode = renderOpts?.verticalMode ?? renderCtx.regime;
  const priceSpan =
    renderOpts?.maxPrice != null && renderOpts?.minPrice != null
      ? Math.max(1, renderOpts.maxPrice - renderOpts.minPrice)
      : 1;
  const viewportBuckets = Math.max(
    1,
    Math.ceil(priceSpan / Math.max(1, bucketStep)),
  );

  if (renderOpts?.rightSideDensityCaptureOut) {
    renderOpts.rightSideDensityCaptureOut.plotHeightPx = metrics.plotH;
    renderOpts.rightSideDensityCaptureOut.rightSideWidthPx = w;
    renderOpts.rightSideDensityCaptureOut.viewportPriceBucketCount =
      viewportBuckets;
  }

  type PreScore = { level: PreparedLiveProjectionLevel; visualScore: number };
  const preScores: PreScore[] = [];
  for (const level of sorted) {
    const baseVi = Math.max(0, Math.min(1, level.intensity));
    const minIntensity =
      level.isActiveLiveDom === true
        ? Math.min(BOOKMAP_LIVE_PROJECTION_MIN_RENDER_INTENSITY, 0.016)
        : BOOKMAP_LIVE_PROJECTION_MIN_RENDER_INTENSITY;
    if (baseVi < minIntensity) continue;

    const liveIsNearTick =
      level.liveDomSource === "near-tick" || level.liveDomSource === "best";
    const liveIsTopDom =
      level.liveDomSource === "top-dom" ||
      level.liveDomSource === "viewport-top";
    const liveIsWall =
      level.liveDomSource === "wall" || level.sizeBtc >= WALL_IMPORTANT_BTC;

    preScores.push({
      level,
      visualScore: computeLiveDomVisualScore({
        liveRank: level.selectionScore,
        liveDomVisualScore: level.liveDomVisualScore,
        sizeBtc: level.sizeBtc,
        viewportMaxSize: renderCtx.viewportMaxSize,
        liveIsNearTick,
        liveIsTopDom,
        liveIsWallCandidate: liveIsWall,
        midPrice: renderCtx.midPrice,
        price: level.price,
      }),
    });
  }

  const scoreQuantiles = computeScoreQuantiles(
    preScores.map((p) => p.visualScore),
  );
  if (renderOpts?.rightSideDensityCaptureOut) {
    renderOpts.rightSideDensityCaptureOut.liveScoreP50 = scoreQuantiles.p50;
    renderOpts.rightSideDensityCaptureOut.liveScoreP80 = scoreQuantiles.p80;
    renderOpts.rightSideDensityCaptureOut.liveScoreP95 = scoreQuantiles.p95;
    renderOpts.rightSideDensityCaptureOut.scoreContrastExpanded =
      preScores.length >= 3;
  }

  const projectedCoverage = preScores.length / viewportBuckets;
  const densityTrimActive =
    projectedCoverage > 0.45 &&
    (verticalMode === "micro" || verticalMode.includes("micro"));

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    x0,
    HEATMAP_PAD.top,
    Math.max(0, w + 1),
    metrics.plotH,
  );
  ctx.clip();

  for (const level of sorted) {
    const baseVi = Math.max(0, Math.min(1, level.intensity));
    const minIntensity =
      level.isActiveLiveDom === true
        ? Math.min(BOOKMAP_LIVE_PROJECTION_MIN_RENDER_INTENSITY, 0.016)
        : BOOKMAP_LIVE_PROJECTION_MIN_RENDER_INTENSITY;
    if (baseVi < minIntensity) continue;

    const fillKey = stableL2FillKey(level.side, level.price);
    const stableFill =
      level.isActiveLiveDom === true
        ? undefined
        : renderCtx.stableL2FillByKey?.get(fillKey);

    let vi: number;
    let pctFromMid: number;

    const pctFromMidPre =
      renderCtx.midPrice != null && renderCtx.midPrice > 0
        ? (Math.abs(level.price - renderCtx.midPrice) / renderCtx.midPrice) * 100
        : 50;
    const relevantRightEdge = isRelevantL2Liquidity({
      sizeBtc: level.sizeBtc,
      maxSizeBtc: level.sizeBtc,
      pctFromMid: pctFromMidPre,
      isActive: true,
      isWallPullCandidate: false,
    });

    const isLargeWall = level.sizeBtc >= WALL_IMPORTANT_BTC;

    if (stableFill) {
      vi = stableFill.stableIntensity;
      pctFromMid = pctFromMidPre;
      if (renderCtx.l2Stats) {
        renderCtx.l2Stats.rightEdgeStableBandCount += 1;
        renderCtx.l2Stats.rightEdgeColorMatchesHistoryCount += 1;
      }
    } else if (isLargeWall) {
      vi = mapWallSizeToStableVisualIntensity(level.sizeBtc);
      pctFromMid = pctFromMidPre;
      if (renderCtx.l2Stats && relevantRightEdge) {
        renderCtx.l2Stats.rightEdgeColorMismatchCount += 1;
      }
    } else {
      const weight = computeBookmapVisualWeight({
        sizeBtc: level.sizeBtc,
        price: level.price,
        midPrice: renderCtx.midPrice,
        regime: renderCtx.regime,
        baseIntensity: baseVi,
        isActive: true,
        viewportMaxSize: renderCtx.viewportMaxSize,
      });
      vi = weight.visualIntensity;
      pctFromMid = weight.pctFromMid;
      if (renderCtx.l2Stats && relevantRightEdge) {
        renderCtx.l2Stats.rightEdgeColorMismatchCount += 1;
      }
    }

    const globalMul =
      BOOKMAP_TEXTURE_OPACITY_MUL * heatmapOpacity;

    const { yTop, height } = textureCellVerticalBounds(
      level.price,
      priceToY,
      domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const historicalAlpha =
      level.isActiveLiveDom === true
        ? undefined
        : renderCtx.historicalActiveAlphaByKey?.get(fillKey);
    const liveWeight =
      stableFill == null
        ? computeBookmapVisualWeight({
            sizeBtc: level.sizeBtc,
            price: level.price,
            midPrice: renderCtx.midPrice,
            regime: renderCtx.regime,
            baseIntensity: vi,
            isActive: true,
            viewportMaxSize: renderCtx.viewportMaxSize,
          })
        : undefined;
    const rightAlphaCtx = buildPassiveLiquidityAlphaContext({
      intensity: vi,
      isActive: true,
      isRightContinuation: true,
      stableSizeBtc: level.sizeBtc,
      bandClass:
        relevantRightEdge || isLargeWall ? "stableActiveL2Band" : undefined,
      weight: liveWeight,
    });
    let rightBodyAlpha =
      level.isActiveLiveDom === true && level.microScalpAlpha != null
        ? level.microScalpAlpha * globalMul
        : alphaForPassiveLiquidity(rightAlphaCtx) * globalMul;

    const liveIsNearTick =
      level.liveDomSource === "near-tick" || level.liveDomSource === "best";
    const liveIsTopDom =
      level.liveDomSource === "top-dom" ||
      level.liveDomSource === "viewport-top";
    const liveIsWall =
      level.liveDomSource === "wall" || level.sizeBtc >= WALL_IMPORTANT_BTC;

    const continuityRes = renderOpts?.continuityPlan
      ? lookupLiveContinuityResolution(
          renderOpts.continuityPlan,
          level.side,
          level.price,
          bucketStep,
        )
      : null;

    const visualScore = computeLiveDomVisualScore({
      liveRank: level.selectionScore,
      liveDomVisualScore: level.liveDomVisualScore,
      sizeBtc: level.sizeBtc,
      viewportMaxSize: renderCtx.viewportMaxSize,
      liveIsNearTick,
      liveIsTopDom,
      liveIsWallCandidate: liveIsWall,
      midPrice: renderCtx.midPrice,
      price: level.price,
    });

    const protectedLevel = isProtectedLiveDomLevel({
      liveIsNearTick,
      liveIsTopDom,
      liveIsWall,
      continuingFromHistorical: continuityRes?.continuingFromHistorical === true,
      historicalWasStrong:
        renderOpts?.continuityPlan?.historicalEdgeBuckets.get(
          getLiquidityVisualKey(
            level.side,
            normalizeLiquidityBucketPrice(level.price, bucketStep),
          ),
        )?.historicalWasStrongNearEdge ?? false,
    });

    const activeDomCoverageEstimate =
      (rendered + (densityTrimActive ? 0 : 1)) / viewportBuckets;
    if (
      densityTrimActive &&
      shouldSkipLiveDomForDensity({
        visualScore,
        quantiles: scoreQuantiles,
        protectedLevel,
        activeDomCoveragePct: activeDomCoverageEstimate,
        verticalMode,
      })
    ) {
      continue;
    }

    let blendedAlpha = rightBodyAlpha / Math.max(globalMul, 0.001);

    if (continuityRes?.liveActive) {
      const blend = resolveLiveDomContinuationVisual({
        liveIntensity: vi,
        liveAlpha: blendedAlpha,
        historicalIntensityNearEdge: continuityRes.historicalIntensity,
        historicalAlphaNearEdge: continuityRes.historicalAlpha,
        continuingFromHistorical: continuityRes.continuingFromHistorical,
        liveOnly: continuityRes.liveOnly,
        verticalMode: renderCtx.regime,
        liveIsWallCandidate: liveIsWall,
        liveIsTopDom,
        liveIsNearTick,
        liveFadeAlpha: level.liveDomFadeAlpha,
      });
      vi = blend.intensity;
      blendedAlpha = blend.alpha;

      if (renderOpts?.continuityRenderStatsOut) {
        renderOpts.continuityRenderStatsOut.seamBlendAppliedCount += 1;
        if (continuityRes.continuingFromHistorical) {
          renderOpts.continuityRenderStatsOut.continuingFromHistoricalRenderCount += 1;
        }
        if (blend.liveOnlyFadeApplied) {
          renderOpts.continuityRenderStatsOut.liveOnlyFadeRenderCount += 1;
        }
      }
    }

    const hierarchy = applyLiveDomHierarchyVisual(vi, blendedAlpha, visualScore, {
      liveIsWallCandidate: liveIsWall,
      verticalMode,
    });
    vi = hierarchy.intensity;
    blendedAlpha = hierarchy.alpha;

    const quantileExpanded = applyQuantileVisualExpansion(
      visualScore,
      vi,
      blendedAlpha,
      scoreQuantiles,
      { protectedLevel },
    );
    vi = quantileExpanded.intensity;
    blendedAlpha = quantileExpanded.alpha;

    const alphaCap = resolveLiveDomAlphaCap(verticalMode);
    rightBodyAlpha = Math.min(alphaCap * globalMul, blendedAlpha * globalMul);
    if (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1) {
      rightBodyAlpha *= BOOKMAP_GRANULAR_LIVE_PROJECTION_ALPHA_MUL;
    }

    const fadeTier = classifyRightSideFadeTier({
      liveIsNearTick,
      liveIsTopDom,
      liveIsWall,
      protectedLevel,
      quantileTier: quantileExpanded.tier,
    });
    const lengthTier = classifyRightSideLengthTier({
      liveIsNearTick,
      liveIsTopDom,
      liveIsWall,
      protectedLevel,
      quantileTier: quantileExpanded.tier,
      sizeBtc: level.sizeBtc,
    });
    const lengthFrac = resolveRightSideVisualLengthFraction({
      tier: lengthTier,
      side: level.side,
      price: level.price,
    });
    const visualW = Math.max(2, w * lengthFrac);

    if (renderOpts?.rightSideDensityCaptureOut) {
      const densityCap = renderOpts.rightSideDensityCaptureOut;
      densityCap.renderedVisualScores.push(visualScore);
      recordLiveDomDensityTier(densityCap, quantileExpanded.tier);
      if (fadeTier === "protected") {
        densityCap.protectedNoFadeCount += 1;
      } else {
        densityCap.lowMidFadeAppliedCount += 1;
      }
      densityCap.uniformLengthRenderCount += 1;
      if (renderOpts.layerTag === "active-dom") {
        densityCap.activeDomAlphas.push(blendedAlpha);
        densityCap.activeDomRenderedCount += 1;
      }
    }

    const drawRightSideBar = (alpha: number, xStart: number, width: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = getPassiveLiquidityFill(
        level.side,
        vi,
        {
          ...rightAlphaCtx,
          intensity: vi,
          isRightContinuation: true,
        },
        globalMul,
      );
      ctx.fillRect(xStart, yTop, width + 1, height);
    };

    if (fadeTier !== "protected" && visualW > 6) {
      const splitX = x0 + visualW * 0.38;
      const leftAlpha = rightBodyAlpha;
      const rightAlpha = applyRightSideTemporalFade(
        rightBodyAlpha,
        1,
        fadeTier,
      );
      drawRightSideBar(leftAlpha, x0, splitX - x0);
      drawRightSideBar(rightAlpha, splitX, x0 + visualW - splitX);
    } else {
      const fadedAlpha =
        fadeTier === "protected"
          ? applyRightSideTemporalFade(rightBodyAlpha, 0.5, fadeTier)
          : rightBodyAlpha;
      drawRightSideBar(fadedAlpha, x0, visualW);
    }
    ctx.globalAlpha = 1;

    if (renderOpts?.liveDomRenderCaptureOut) {
      renderOpts.liveDomRenderCaptureOut.renderedIntensities.push(vi);
      renderOpts.liveDomRenderCaptureOut.renderedAlphas.push(blendedAlpha);
      renderOpts.liveDomRenderCaptureOut.renderedVisualScores.push(visualScore);
      if (liveIsTopDom || level.liveDomSource === "viewport-top") {
        renderOpts.liveDomRenderCaptureOut.topDomVisualMapping.push({
          side: level.side,
          price: level.price,
          bucketPrice: normalizeLiquidityBucketPrice(level.price, bucketStep),
          size: level.sizeBtc,
          rank: level.selectionScore ?? visualScore,
          finalIntensity: vi,
          finalAlpha: blendedAlpha,
          visible: true,
          visualOk: blendedAlpha >= 0.255 && vi >= 0.35,
        });
      }
    }

    rendered += 1;
    alphaSum += rightBodyAlpha;
    if (rightBodyAlpha > alphaMax) alphaMax = rightBodyAlpha;
    renderedPriceKeys.add(`${level.side}:${level.price}`);

    if (renderOpts?.statsOut) {
      const tag = renderOpts.layerTag ?? "live-projection";
      if (tag === "active-dom") {
        renderOpts.statsOut.activeDomBandRectCount += 1;
      } else {
        renderOpts.statsOut.liveProjectionRectCount += 1;
      }
      renderOpts.statsOut.rightSideTotalRectCount += 1;
    }

    if (renderCtx.paletteStats) {
      recordBookmapPaletteParitySample(renderCtx.paletteStats, {
        intensity: vi,
        alpha: rightBodyAlpha,
        isActive: true,
        isRelevantL2: relevantRightEdge || isLargeWall,
        isRightContinuation: true,
        historicalAlpha,
        regime: renderCtx.regime,
      });
    }

    if (renderCtx.visualStats) {
      recordBookmapVisualAlphaSample(renderCtx.visualStats, {
        alpha: rightBodyAlpha,
        pctFromMid,
        isActive: true,
        closedAgeMs: 0,
        isRecentPullCandidate: false,
        isWallPullCandidate: false,
        isRightSide: true,
        regime: renderCtx.regime,
      });
    }
  }
  ctx.restore();

  if (renderOpts?.statsOut && rendered > 0) {
    renderOpts.statsOut.avgRightSideAlpha = alphaSum / rendered;
    renderOpts.statsOut.maxRightSideAlpha = Math.max(
      renderOpts.statsOut.maxRightSideAlpha,
      alphaMax,
    );
    const priceSpan =
      renderOpts.maxPrice != null && renderOpts.minPrice != null
        ? Math.max(1, renderOpts.maxPrice - renderOpts.minPrice)
        : 1;
    const bucketStep = renderOpts.priceBucketStep ?? metrics.priceStep;
    const viewportBuckets = Math.max(1, Math.ceil(priceSpan / Math.max(1, bucketStep)));
    renderOpts.statsOut.rightSideCoveragePct =
      renderedPriceKeys.size / viewportBuckets;
    const domCount = renderOpts.statsOut.activeDomBandRectCount;
    const lpCount = renderOpts.statsOut.liveProjectionRectCount;
    renderOpts.statsOut.rightSideDominantLayer =
      domCount >= lpCount && domCount > 0
        ? "active-dom"
        : lpCount > 0
          ? "live-projection"
          : "none";
  }

  return {
    rendered,
    projectionStartTime: window.startTime,
    projectionEndTime: window.endTime,
    avgProjectionWidthPx: w,
    minProjectionWidthPx: w,
    maxProjectionWidthPx: w,
    projectionOverlapsHistory: window.overlapsHistory,
  };
}

function renderHeatmapBands(
  ctx: CanvasRenderingContext2D,
  metrics: EnginePlotMetrics,
  bands: HeatmapBand[],
  dataEndTime: number,
  projectionEndTime: number,
  visualSettings?: BookmapVisualSettings,
  mode: "primary" | "perp-overlay" = "primary",
  overlayOpacityMul = 1,
  sideStatsOut?: {
    leftCount: number;
    rightCount: number;
    structuralLeft: number;
    structuralRight: number;
    majorLeft: number;
    majorRight: number;
  },
  wallRenderOpts?: {
    midPrice?: number | null;
    verticalMode?: string;
    densityCaptureOut?: RightSideDensityRenderCapture;
    wallBandCoveragePct?: number;
    baseTexturePriceKeys?: Set<string>;
  },
) {
  const { priceToY, timeToX, priceStep } = metrics;

  const sorted = [...bands].sort(
    (a, b) => (a.visualIntensity ?? a.intensity) - (b.visualIntensity ?? b.intensity),
  );

  const heatmapOpacity =
    mode === "perp-overlay" ? 1 : (visualSettings?.heatmap.opacity ?? 1);
  const heatmapContrast = mode === "perp-overlay" ? 1 : (visualSettings?.heatmap.contrast ?? 1);
  const viFloor = mode === "perp-overlay" ? 0.02 : 0.04;

  for (const band of sorted) {
    const isLargeWall =
      isWallTier(band.tier) || band.maxSize >= WALL_IMPORTANT_BTC;
    let vi = isLargeWall
      ? mapWallSizeToStableVisualIntensity(band.maxSize)
      : (band.visualIntensity ?? band.intensity);
    if (!isLargeWall) {
      vi = Math.max(0, Math.min(1, (vi - 0.5) * heatmapContrast + 0.5));
    }
    if (vi < viFloor) continue;

    const endTime = resolveBandEndTime(band, dataEndTime, projectionEndTime);
    const x0 = timeToX(band.startTime);
    const x1 = timeToX(endTime);
    const w = Math.max(1.5, x1 - x0);
    const { yTop, height } = textureCellVerticalBounds(
      band.price,
      priceToY,
      metrics.domBucketSize,
    );

    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const liveSlack = BOOKMAP_ENGINE_BUCKET_MS * 2;
    const isRightSide = endTime >= dataEndTime - liveSlack;

    const isLive =
      !band.stale && band.endTime >= dataEndTime - BOOKMAP_ENGINE_BUCKET_MS * 2;
    const drawBand = { ...band, visualIntensity: vi, intensity: vi };
    const bandAlphaMul =
      mode === "perp-overlay" ? overlayOpacityMul : heatmapOpacity;
    const wallAlphaCtx = buildPassiveLiquidityAlphaContext({
      intensity: vi,
      isActive: isLive,
      closedAgeMs: band.stale ? 90_000 : 0,
      stableSizeBtc: band.maxSize,
    });
    let wallBodyAlpha = alphaForPassiveLiquidity(wallAlphaCtx) * bandAlphaMul;
    if (mode === "primary" && isRightSide && isLargeWall) {
      const alphaCap = resolveWallBandRightSideAlphaCap(
        band,
        wallRenderOpts?.midPrice ?? null,
        wallRenderOpts?.verticalMode ?? "micro",
        wallRenderOpts?.wallBandCoveragePct ?? 0,
      );
      wallBodyAlpha = Math.min(alphaCap * bandAlphaMul, wallBodyAlpha);
    }
    const bucketPrice = Math.round(band.price / Math.max(1, priceStep)) * priceStep;
    const hasBaseUnder = wallRenderOpts?.baseTexturePriceKeys?.has(
      `${band.side}:${bucketPrice}`,
    );
    const isStructuralOrMajor =
      band.tier === "structural" || band.tier === "major";
    const wallTexMod =
      0.94 +
      stableVisualHash(`${band.side}:${bucketPrice}`, band.startTime) * 0.1;
    wallBodyAlpha = applyWallBandBaseIntegrationAlpha(
      wallBodyAlpha,
      hasBaseUnder === true,
      isStructuralOrMajor,
      wallTexMod,
    );
    if (
      BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE &&
      !isStructuralOrMajor &&
      isLargeWall &&
      (wallRenderOpts?.wallBandCoveragePct ?? 0) > 0.25
    ) {
      vi = Math.min(vi, 0.52);
    }
    ctx.globalAlpha = wallBodyAlpha;
    ctx.fillStyle =
      mode === "perp-overlay"
        ? getBookmapPerpOverlayFill(drawBand, bandAlphaMul)
        : getPassiveLiquidityFill(band.side, vi, wallAlphaCtx, bandAlphaMul);
    ctx.fillRect(x0, yTop, w, height);
    ctx.globalAlpha = 1;

    if (mode === "primary" && isRightSide && wallRenderOpts?.densityCaptureOut) {
      const cap = wallRenderOpts.densityCaptureOut;
      cap.wallBandAlphas.push(wallBodyAlpha / Math.max(bandAlphaMul, 0.001));
      cap.wallBandRenderedCount += 1;
      if (band.tier === "structural") {
        cap.structuralWallAlphas.push(wallBodyAlpha / Math.max(bandAlphaMul, 0.001));
        cap.structuralWallRenderedCount += 1;
      }
      if (band.tier === "major") {
        cap.majorWallAlphas.push(wallBodyAlpha / Math.max(bandAlphaMul, 0.001));
        cap.majorWallRenderedCount += 1;
      }
    }

    if (mode === "primary" && sideStatsOut) {
      if (isRightSide) {
        sideStatsOut.rightCount += 1;
        if (band.tier === "structural") sideStatsOut.structuralRight += 1;
        if (band.tier === "major") sideStatsOut.majorRight += 1;
      } else {
        sideStatsOut.leftCount += 1;
        if (band.tier === "structural") sideStatsOut.structuralLeft += 1;
        if (band.tier === "major") sideStatsOut.majorLeft += 1;
      }
    }

    if (mode === "primary") {
      const stroke = getBookmapBandStroke(drawBand);
      if (stroke && w > 3 && vi >= 0.55) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = vi >= 0.85 ? 1.1 : 0.65;
        ctx.strokeRect(x0, yTop, w, height);
      }
    }
  }
}

function renderWallLabelPlacements(
  ctx: CanvasRenderingContext2D,
  plotRight: number,
  placements: WallLabelPlacement[],
) {
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "right";

  for (const placement of placements) {
    const band = placement.band;
    const text = getWallLabelText(band);
    const textW = ctx.measureText(text).width;
    const x = plotRight - 6;
    const y = placement.y;

    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.fillRect(x - textW - 4, y - 9, textW + 8, 12);

    ctx.fillStyle = getWallLabelColor(band);
    ctx.fillText(text, x, y);
  }

  ctx.textAlign = "left";
}

function renderWallLabels(
  ctx: CanvasRenderingContext2D,
  metrics: EnginePlotMetrics,
  bands: HeatmapBand[],
) {
  const plotRight = HEATMAP_PAD.left + metrics.plotW;
  const placements = pickWallLabels(bands, metrics.priceToY, plotRight);
  renderWallLabelPlacements(ctx, plotRight, placements);
}

function renderEngineFarWallMarkers(
  ctx: CanvasRenderingContext2D,
  params: BookmapEngineFrameParams,
  metrics: EnginePlotMetrics,
) {
  const { minPrice, maxPrice, engine } = params;
  const { plotH } = metrics;
  const yTop = HEATMAP_PAD.top + 2;
  const yBot = HEATMAP_PAD.top + plotH - 10;

  const above = engine.walls
    .filter((w) => w.side === "ask" && w.price > maxPrice)
    .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
    .slice(0, 4);
  const below = engine.walls
    .filter((w) => w.side === "bid" && w.price < minPrice)
    .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
    .slice(0, 4);

  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "left";

  const spot = params.spot;
  const pctLabel = (price: number) => {
    if (spot == null || spot <= 0) return "";
    const pct = ((price - spot) / spot) * 100;
    return ` · ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };

  above.forEach((m, i) => {
    ctx.fillStyle = "rgba(252, 165, 165, 0.95)";
    ctx.fillText(
      `↑ ASK WALL ${formatHeatmapPrice(m.price)} · ${Math.round(m.maxSeenSize)} BTC${pctLabel(m.price)}`,
      HEATMAP_PAD.left + 4,
      yTop + i * 11,
    );
  });

  below.forEach((m, i) => {
    ctx.fillStyle = "rgba(110, 231, 183, 0.95)";
    ctx.fillText(
      `↓ BID WALL ${formatHeatmapPrice(m.price)} · ${Math.round(m.maxSeenSize)} BTC${pctLabel(m.price)}`,
      HEATMAP_PAD.left + 4,
      yBot - i * 11,
    );
  });
}

export function paintBookmapEngineHeatmapFrame(
  ctx: CanvasRenderingContext2D,
  params: BookmapEngineFrameParams,
) {
  const { width: w, height: h, minPrice, maxPrice, spot, engine, timeViewport } = params;

  renderHeatmapBackground(ctx, w, h);

  const metrics = buildEnginePlotMetrics(params);
  if (!metrics) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("Bookmap engine: no visible range", HEATMAP_PAD.left + 8, HEATMAP_PAD.top + 20);
    return;
  }

  const crosshairMetrics = metricsForCrosshair(metrics);

  const renderCanonicalOrSurfaceOverlays = () => {
    if (
      params.showHistoricalBboPath === true &&
      params.bboHistoryPoints &&
      params.bboHistoryPoints.length >= 2
    ) {
      const bounds = getBboPathPlotBounds(w, h);
      renderHistoricalBboPath(ctx, {
        points: params.bboHistoryPoints,
        plotW: bounds.plotW,
        plotH: bounds.plotH,
        plotLeft: bounds.plotLeft,
        plotTop: bounds.plotTop,
        plotBottom: bounds.plotBottom,
        minPrice,
        maxPrice,
        timeToX: metrics.timeToX,
        priceToY: params.priceToY,
        timeViewport,
        verticalMode: params.tradeDotVerticalMode ?? "intraday",
        opacity: params.bboPathOpacity ?? "normal",
      });
    }

    if (
      params.showDivergenceMarkers !== false &&
      params.divergenceMarkers &&
      params.divergenceMarkers.length > 0
    ) {
      renderDivergenceMarkers(ctx, params.divergenceMarkers, {
        plotW: metrics.plotW,
        plotH: metrics.plotH,
        priceToY: params.priceToY,
        timeToX: metrics.timeToX,
        timeViewport,
        minPrice,
        maxPrice,
      });
    }

    if (params.showBidAskLines !== false && params.bboGuide) {
      renderBookmapBidAskGuideLines(
        ctx,
        params.bboGuide,
        metrics,
        timeViewport,
        params.tradeDotVerticalMode ?? "intraday",
        params.bidAskLineOpacity ?? "normal",
        Math.max(1, params.domBucketSize ?? params.heatmapBucketSize),
      );
    }

    if (params.tradeDotRenderStatsOut) {
      Object.assign(params.tradeDotRenderStatsOut, EMPTY_TRADE_DOT_RENDER_STATS);
    }
    if (params.tradeDots && params.tradeDots.length > 0) {
      if (params.executionRailsEnabled !== false) {
        renderEngineExecutionRails(
          ctx,
          params.tradeDots,
          metrics.timeToX,
          metrics.priceToY,
          metrics.plotW,
          metrics.plotH,
          {
            verticalMode: params.tradeDotVerticalMode ?? "intraday",
            railLength: params.executionRailLength ?? "normal",
            visual: params.tradeDotVisual,
          },
        );
      }
      renderEngineTradeDots(
        ctx,
        params.tradeDots,
        metrics.timeToX,
        metrics.priceToY,
        metrics.plotW,
        metrics.plotH,
        params.tradeDotVerticalMode ?? "intraday",
        params.tradeDotVisual,
        params.tradeDotRenderStatsOut,
      );
    }

    if (spot != null) {
      renderSpotLine(ctx, w, crosshairMetrics, spot, minPrice, maxPrice);
    }

    if (params.showFarWallMarkers !== false) {
      renderEngineFarWallMarkers(ctx, params, metrics);
    }

    if (params.crosshair) {
      renderCrosshair(ctx, w, h, params.crosshair, crosshairMetrics);
    }
  };

  if (BOOKMAP_CANONICAL_HEATMAP_V1) {
    paintBookmapCanonicalHeatmapFrame(
      ctx,
      {
        width: w,
        height: h,
        minPrice,
        maxPrice,
        spot,
        engine,
        timeViewport,
        visualSettings: params.visualSettings,
        domBucketSize: Math.max(1, params.domBucketSize ?? params.heatmapBucketSize),
      },
      {
        plotW: metrics.plotW,
        plotH: metrics.plotH,
        priceToY: params.priceToY,
        timeToX: metrics.timeToX,
        domBucketSize: metrics.domBucketSize,
      },
    );
    renderCanonicalOrSurfaceOverlays();
    drawCanonicalHeatmapWatermark(ctx);
    return;
  }

  if (BOOKMAP_SURFACE_RENDERER_V1) {
    paintBookmapSurfaceRendererFrame(
      ctx,
      {
        width: w,
        height: h,
        minPrice,
        maxPrice,
        spot,
        engine,
        timeViewport,
        visualSettings: params.visualSettings,
        domBucketSize: Math.max(1, params.domBucketSize ?? params.heatmapBucketSize),
      },
      {
        plotW: metrics.plotW,
        plotH: metrics.plotH,
        priceToY: params.priceToY,
        timeToX: metrics.timeToX,
        domBucketSize: metrics.domBucketSize,
      },
    );

    renderCanonicalOrSurfaceOverlays();
    drawSurfaceRendererWatermark(ctx);
    return;
  }

  const visiblePriceRangePct = computeVisiblePriceRangePct(
    minPrice,
    maxPrice,
  );
  const zoomRegime = resolveZoomRegime(visiblePriceRangePct);
  const visualRenderStats = createEmptyBookmapVisualRenderStats();
  const l2BandContinuityStats = createEmptyBookmapL2BandContinuityStats();
  const paletteParityStats = createEmptyBookmapPaletteParityStats(zoomRegime);
  const microHierarchyStats = createEmptyBookmapMicroVisualHierarchyStats();
  const historicalColorLockAudit = {
    alphaFrozenCellCount: 0,
    alphaFinalSum: 0,
    intensityFinalSum: 0,
    renderSampleCount: 0,
  };
  const microScalpVisual = engine.microScalpVisual ?? {
    microScalpMode: false,
    microVisualHierarchyActive: false,
    verticalMode: "macro",
    visiblePriceRange: maxPrice - minPrice,
    pxPerSample: 0,
    pxPerPriceBucket: 0,
  };
  const stableL2FillByKey = new Map<string, StableL2FillEntry>();
  const historicalActiveAlphaByKey = new Map<string, number>();
  const textureVisualCtx: TextureVisualRenderContext = {
    regime: zoomRegime,
    midPrice: spot,
    dataEndTime: timeViewport.dataEndTime,
    now: Date.now(),
    viewportMaxSize: 0,
    visualStats: visualRenderStats,
    l2Stats: l2BandContinuityStats,
    paletteStats: paletteParityStats,
    microHierarchyStats,
    historicalColorLockAudit,
    microScalpMode: microScalpVisual.microScalpMode,
    microVisualHierarchyActive: microScalpVisual.microVisualHierarchyActive,
    microScalpVisual,
    spanColorAuditOut: params.historicalSpanColorAuditOut,
    spanRenderContinuityAuditOut: params.spanRenderContinuityAuditOut,
    spanTextureBalanceAuditOut: params.spanTextureBalanceAuditOut,
    spanPeakCache: params.spanPeakCache,
    stableL2FillByKey,
    historicalActiveAlphaByKey,
  };

  const sourceMode = params.sourceMode ?? "spot";
  const activeDomMarket = params.activeDomMarket ?? "spot";
  const filterPrimary = resolvePerpRenderFilterTarget(
    sourceMode,
    activeDomMarket,
    "primary",
  );
  const filterOverlay = resolvePerpRenderFilterTarget(
    sourceMode,
    activeDomMarket,
    "overlay",
  );

  let primaryTextureCells = engine.textureCells ?? [];
  let primaryActiveDomBands = engine.activeDomBands ?? [];
  let primaryProjectionLevels = engine.liveProjectionLevels ?? [];

  if (filterPrimary) {
    const combinedProjection = [
      ...primaryActiveDomBands,
      ...primaryProjectionLevels,
    ];
    const activeDomKeySet = new Set(
      primaryActiveDomBands.map((l) => `${l.side}:${l.price}`),
    );
    const filtered = applyPerpRenderSpanFilter({
      textureCells: primaryTextureCells,
      projectionLevels: combinedProjection,
      midPrice: spot,
      dataEndTime: timeViewport.dataEndTime,
      priceToY: params.priceToY,
      plotHeightPx: metrics.plotH,
      enabled: true,
      minPrice,
      maxPrice,
      zoomRegime,
    });
    primaryTextureCells = filtered.textureCells;
    const filteredProjection = filtered.projectionLevels;
    primaryActiveDomBands = filteredProjection.filter((l) =>
      activeDomKeySet.has(`${l.side}:${l.price}`),
    );
    primaryProjectionLevels = filteredProjection.filter(
      (l) => !activeDomKeySet.has(`${l.side}:${l.price}`),
    );
    if (params.perpFilterTruthOut) {
      Object.assign(params.perpFilterTruthOut, filtered.truth);
    }
  }

  let overlayTextureCells = params.overlayEngine?.textureCells ?? [];
  if (filterOverlay && params.overlayEngine) {
    const filtered = applyPerpRenderSpanFilter({
      textureCells: overlayTextureCells,
      projectionLevels: [],
      midPrice: spot,
      dataEndTime: timeViewport.dataEndTime,
      priceToY: params.priceToY,
      plotHeightPx: metrics.plotH,
      enabled: true,
      minPrice,
      maxPrice,
      zoomRegime,
    });
    overlayTextureCells = filtered.textureCells;
    if (params.perpFilterTruthOut) {
      Object.assign(params.perpFilterTruthOut, filtered.truth);
    }
  } else if (!filterPrimary && params.perpFilterTruthOut) {
    Object.assign(params.perpFilterTruthOut, {
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
  }

  const hasTexture =
    engine.textureModeEnabled && primaryTextureCells.length > 0;
  const hasBands = engine.bands.length > 0;
  const hasOverlayTexture =
    params.overlayEngine?.textureModeEnabled && overlayTextureCells.length > 0;
  const hasOverlayBands = (params.overlayEngine?.bands.length ?? 0) > 0;
  const hasActiveDomBands = primaryActiveDomBands.length > 0;
  const hasLiveProjection = primaryProjectionLevels.length > 0;

  if (
    !hasBands &&
    !hasTexture &&
    !hasOverlayTexture &&
    !hasOverlayBands &&
    !hasLiveProjection &&
    !hasActiveDomBands
  ) {
    ctx.fillStyle = "#64748b";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("No engine liquidity in viewport", HEATMAP_PAD.left + 8, HEATMAP_PAD.top + 24);
  }

  textureVisualCtx.viewportMaxSize = computeViewportSizeStats(
    primaryTextureCells,
  ).maxSize;

  const preparedPrimaryWalls = hasBands
    ? prepareWallBandsForContinuousRender(
        engine.bands,
        timeViewport.dataEndTime,
        timeViewport.visibleEndTime,
        BOOKMAP_TEXTURE_SAMPLER_MS,
      )
    : null;
  if (preparedPrimaryWalls) {
    for (const [key, entry] of preparedPrimaryWalls.stableWallFills) {
      stableL2FillByKey.set(key, entry);
    }
  }

  let renderedTextureTotal = 0;
  let filteredByTimeTotal = 0;
  let renderedWallBandCount = 0;
  const renderedLayerOrder: string[] = [];
  let primaryTextureDraw: ReturnType<typeof renderHeatmapTextureCells> | null =
    null;
  let wallSideStats: {
    leftCount: number;
    rightCount: number;
    structuralLeft: number;
    structuralRight: number;
    majorLeft: number;
    majorRight: number;
  } | null = null;

  if (hasTexture) {
    renderedLayerOrder.push("historicalTexture");
    const textureDraw = renderHeatmapTextureCells(
      ctx,
      metrics,
      primaryTextureCells,
      timeViewport,
      params.visualSettings,
      "primary",
      1,
      engine.textureStats?.texturePriceBucketSize ??
        BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
      spot,
      engine.timeMax,
      engine.timeMin,
      timeViewport.dataEndTime,
      textureVisualCtx,
    );
    primaryTextureDraw = textureDraw;
    renderedTextureTotal += textureDraw.rendered;
    filteredByTimeTotal += textureDraw.filteredByTime;
    if (
      textureDraw.pulledFootprintLeftSideCount +
        textureDraw.pulledFootprintRightSideCount >
      0
    ) {
      renderedLayerOrder.push("pulledFootprint");
    }
    if (textureDraw.drawCapHit && params.textureRenderStatsOut) {
      params.textureRenderStatsOut.textureDrawCapHit = true;
    }
  }

  const anchoredWalls = engine.anchoredWalls ?? [];
  let anchoredWallRender: AnchoredWallRenderResult | null = null;
  if (BOOKMAP_PERSISTENT_WALL_ANCHORING_V1 && anchoredWalls.length > 0) {
    renderedLayerOrder.push("anchoredWalls");
    anchoredWallRender = renderAnchoredWallsPass(
      ctx,
      metrics,
      anchoredWalls,
      timeViewport,
      params.visualSettings,
      {
        midPrice: spot,
        dataEndTime: timeViewport.dataEndTime,
        textureOpacityMul: 1,
        domBucketSize: metrics.domBucketSize,
        minPrice,
        maxPrice,
      },
    );
    if (engine.wallAnchoringDiag) {
      lastWallAnchoringDiag = {
        ...engine.wallAnchoringDiag,
        liveProjectionConnected: anchoredWallRender.liveProjections,
      };
    }
    if (engine.macroDomCoverageDiag) {
      lastMacroDomCoverageDiag = engine.macroDomCoverageDiag;
    }
    emitWallAnchoringDiag();
    emitMacroDomCoverageDiag();
  }

  const microScalpStats = emptyMicroScalpRenderStats();
  const priceBucketStep =
    engine.textureStats?.texturePriceBucketSize ??
    BOOKMAP_TEXTURE_PRICE_BUCKET_USD;
  const activeDomPriceKeys = new Set(
    primaryActiveDomBands.map((l) => `${l.side}:${l.price}`),
  );

  const liveDomDedup = dedupeLiveProjectionAgainstActiveDom(
    primaryProjectionLevels,
    primaryActiveDomBands,
    priceBucketStep,
  );
  const dedupedProjectionLevels = liveDomDedup.deduped;
  microScalpStats.duplicatedActiveDomAndProjectionBucketsCount =
    liveDomDedup.afterOverlapCount;

  const microScalpMode = microScalpVisual.microScalpMode;
  const skipLiveProjectionRender = microScalpMode && hasActiveDomBands;
  const liveProjectionStrictStart = resolveLiveProjectionStrictStart(
    hasActiveDomBands,
    microScalpMode,
  );
  const phase2LiveDedupApplied = liveDomDedup.beforeOverlapCount > 0;
  const phase2StrictLiveStartApplied =
    hasActiveDomBands || liveProjectionStrictStart;

  const liveLevelsForContinuity = [
    ...primaryActiveDomBands,
    ...(skipLiveProjectionRender ? [] : dedupedProjectionLevels),
  ];
  const continuityRenderStats = {
    seamBlendAppliedCount: 0,
    continuingFromHistoricalRenderCount: 0,
    liveOnlyFadeRenderCount: 0,
  };
  const liveDomRenderCapture = createEmptyLiveDomRenderCapture();
  const rightSideDensityCapture = createEmptyRightSideDensityCapture();
  const continuityPlan =
    liveLevelsForContinuity.length > 0
      ? buildLiquidityContinuityPlan({
          textureCells: primaryTextureCells,
          liveLevels: liveLevelsForContinuity,
          dataEndTime: timeViewport.dataEndTime,
          verticalMode: microScalpVisual.verticalMode,
          priceBucketUsd: priceBucketStep,
          historicalActiveAlphaByKey: historicalActiveAlphaByKey,
        })
      : null;

  const liveProjectionCtxBase = (
    levels: PreparedLiveProjectionLevel[],
  ): TextureVisualRenderContext => ({
    ...textureVisualCtx,
    viewportMaxSize: Math.max(
      textureVisualCtx.viewportMaxSize,
      computeViewportSizeStats(
        levels.map((l) => ({
          timeBucket: 0,
          price: l.price,
          side: l.side,
          intensity: l.intensity,
          isMajor: false,
          maxSizeInBucket: l.sizeBtc,
        })),
      ).maxSize,
    ),
  });

  const liveRenderOptsBase = {
    statsOut: microScalpStats,
    priceBucketStep,
    minPrice,
    maxPrice,
    continuityPlan,
    continuityRenderStatsOut: continuityRenderStats,
    liveDomRenderCaptureOut: liveDomRenderCapture,
    rightSideDensityCaptureOut: rightSideDensityCapture,
    midPrice: spot,
    verticalMode: microScalpVisual.verticalMode,
  };

  let activeDomDraw: LiveProjectionRenderResult = {
    rendered: 0,
    projectionStartTime: timeViewport.dataEndTime,
    projectionEndTime: timeViewport.visibleEndTime,
    avgProjectionWidthPx: 0,
    minProjectionWidthPx: 0,
    maxProjectionWidthPx: 0,
    projectionOverlapsHistory: false,
  };
  let liveProjectionDraw: LiveProjectionRenderResult = activeDomDraw;

  if (hasActiveDomBands) {
    renderedLayerOrder.push("activeDomBands");
    activeDomDraw = renderLiveBookProjection(
      ctx,
      metrics,
      primaryActiveDomBands,
      timeViewport,
      params.visualSettings,
      liveProjectionCtxBase(primaryActiveDomBands),
      {
        ...liveRenderOptsBase,
        strictDataEdgeStart: true,
        layerTag: "active-dom",
      },
    );
  }

  if (!skipLiveProjectionRender && dedupedProjectionLevels.length > 0) {
    renderedLayerOrder.push("liveProjection");
    liveProjectionDraw = renderLiveBookProjection(
      ctx,
      metrics,
      dedupedProjectionLevels,
      timeViewport,
      params.visualSettings,
      liveProjectionCtxBase(dedupedProjectionLevels),
      {
        ...liveRenderOptsBase,
        strictDataEdgeStart: liveProjectionStrictStart,
        forceNoHistoryOverlap: hasActiveDomBands,
        layerTag: "live-projection",
      },
    );
  }

  const combinedLiveDraw: LiveProjectionRenderResult = {
    rendered: activeDomDraw.rendered + liveProjectionDraw.rendered,
    projectionStartTime: Math.min(
      activeDomDraw.projectionStartTime,
      liveProjectionDraw.projectionStartTime,
    ),
    projectionEndTime: Math.max(
      activeDomDraw.projectionEndTime,
      liveProjectionDraw.projectionEndTime,
    ),
    avgProjectionWidthPx: Math.max(
      activeDomDraw.avgProjectionWidthPx,
      liveProjectionDraw.avgProjectionWidthPx,
    ),
    minProjectionWidthPx: Math.min(
      activeDomDraw.minProjectionWidthPx || Infinity,
      liveProjectionDraw.minProjectionWidthPx || Infinity,
    ) || 0,
    maxProjectionWidthPx: Math.max(
      activeDomDraw.maxProjectionWidthPx,
      liveProjectionDraw.maxProjectionWidthPx,
    ),
    projectionOverlapsHistory:
      activeDomDraw.projectionOverlapsHistory ||
      liveProjectionDraw.projectionOverlapsHistory,
  };

  const liveProjectionPriceKeys = new Set(
    dedupedProjectionLevels.map((l) => `${l.side}:${l.price}`),
  );
  let filteredWallBands = preparedPrimaryWalls?.bands ?? [];
  let beforeDuplicatedWallAndActiveDomCount = 0;
  let beforeDuplicatedWallAndLiveCount = 0;
  let phase2WallDedupApplied = false;
  if (preparedPrimaryWalls) {
    const wallFilter = filterWallBandsForLiveSeam(
      preparedPrimaryWalls.bands,
      activeDomPriceKeys,
      liveProjectionPriceKeys,
    );
    filteredWallBands = wallFilter.filtered;
    beforeDuplicatedWallAndActiveDomCount = wallFilter.beforeActiveDomOverlap;
    beforeDuplicatedWallAndLiveCount = wallFilter.beforeLiveOverlap;
    phase2WallDedupApplied =
      beforeDuplicatedWallAndActiveDomCount + beforeDuplicatedWallAndLiveCount > 0;
    microScalpStats.duplicatedWallAndLiveBucketsCount =
      wallFilter.afterLiveOverlap;
  }

  const liveDomPriceKeys = new Set<string>(activeDomPriceKeys);
  for (const level of dedupedProjectionLevels) {
    liveDomPriceKeys.add(`${level.side}:${level.price}`);
  }

  if (params.liveProjectionRenderStatsOut) {
    params.liveProjectionRenderStatsOut.renderedLiveProjectionCount =
      combinedLiveDraw.rendered;
    params.liveProjectionRenderStatsOut.projectionStartTime =
      combinedLiveDraw.projectionStartTime;
    params.liveProjectionRenderStatsOut.projectionEndTime =
      combinedLiveDraw.projectionEndTime;
    params.liveProjectionRenderStatsOut.avgProjectionWidthPx =
      combinedLiveDraw.avgProjectionWidthPx;
    params.liveProjectionRenderStatsOut.minProjectionWidthPx =
      combinedLiveDraw.minProjectionWidthPx;
    params.liveProjectionRenderStatsOut.maxProjectionWidthPx =
      combinedLiveDraw.maxProjectionWidthPx;
    params.liveProjectionRenderStatsOut.projectionOverlapsHistory =
      combinedLiveDraw.projectionOverlapsHistory;
  }

  lastRenderMatrixDiag = {
    ...lastRenderMatrixDiag,
    liveProjectionSpans: combinedLiveDraw.rendered,
  };
  if (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1) {
    lastGranularMatrixRendererDiag = {
      ...lastGranularMatrixRendererDiag,
      liveProjectionDrawn: combinedLiveDraw.rendered,
      timestamp: Date.now(),
    };
  }
  const historicalAlphaAvg =
    lastWallOrganicRenderDiagStats.solidBaseAlphaCount > 0
      ? lastWallOrganicRenderDiagStats.solidBaseAlphaSum /
        lastWallOrganicRenderDiagStats.solidBaseAlphaCount
      : 0;
  const historicalWidthPx = primaryTextureDraw?.avgTextureCellWidthPx ?? 0;
  lastLiveVsHistoricalDiag = {
    historicalTextureCount: renderedTextureTotal,
    liveProjectionCount: combinedLiveDraw.rendered,
    historicalAlphaAvg: Number(historicalAlphaAvg.toFixed(3)),
    liveProjectionAlphaAvg: Number(
      (combinedLiveDraw.avgProjectionWidthPx > 0 ? 0.55 : 0).toFixed(3),
    ),
    liveProjectionDominates:
      combinedLiveDraw.avgProjectionWidthPx >
      Math.max(1, historicalWidthPx) * 1.35,
    projectionWidthPx: Number(combinedLiveDraw.avgProjectionWidthPx.toFixed(2)),
    historicalWidthPx: Number(historicalWidthPx.toFixed(2)),
    timestamp: Date.now(),
  };

  if (hasBands && preparedPrimaryWalls) {
    renderedLayerOrder.push("wallBands");
    const baseTexturePriceKeys = new Set<string>();
    for (const cell of primaryTextureCells) {
      if (resolveTextureSourceKindForPrepared(cell) === "base") {
        baseTexturePriceKeys.add(`${cell.side}:${cell.price}`);
      }
    }
    wallSideStats = {
      leftCount: 0,
      rightCount: 0,
      structuralLeft: 0,
      structuralRight: 0,
      majorLeft: 0,
      majorRight: 0,
    };
    const viewportBucketsForWalls = Math.max(
      1,
      rightSideDensityCapture.viewportPriceBucketCount,
    );
    const wallLiveSlack = BOOKMAP_ENGINE_BUCKET_MS * 2;
    const rightEdgeWallCount = filteredWallBands.filter((band) => {
      if (!isWallTier(band.tier)) return false;
      const endTime = resolveBandEndTime(
        band,
        timeViewport.dataEndTime,
        timeViewport.visibleEndTime,
      );
      return endTime >= timeViewport.dataEndTime - wallLiveSlack;
    }).length;
    const wallBandCoveragePct = rightEdgeWallCount / viewportBucketsForWalls;
    renderHeatmapBands(
      ctx,
      metrics,
      filteredWallBands,
      timeViewport.dataEndTime,
      timeViewport.dataEndTime,
      params.visualSettings,
      "primary",
      1,
      wallSideStats,
      {
        midPrice: spot,
        verticalMode: microScalpVisual.verticalMode,
        densityCaptureOut: rightSideDensityCapture,
        wallBandCoveragePct,
        baseTexturePriceKeys,
      },
    );
    renderedWallBandCount = filteredWallBands.length;
    for (const band of filteredWallBands) {
      if (!isWallTier(band.tier)) continue;
      const endTime = resolveBandEndTime(
        band,
        timeViewport.dataEndTime,
        timeViewport.visibleEndTime,
      );
      if (endTime >= timeViewport.dataEndTime - BOOKMAP_ENGINE_BUCKET_MS) {
        microScalpStats.wallBandRightSideRectCount += 1;
        if (band.tier === "structural") {
          microScalpStats.structuralWallRightSideRectCount += 1;
        }
        if (band.tier === "major") {
          microScalpStats.majorWallRightSideRectCount += 1;
        }
      }
    }
  }

  if (params.microScalpLayerAuditSink) {
    params.microScalpLayerAuditSink.stats = microScalpStats;
  }

  if (hasOverlayTexture && params.overlayEngine) {
    renderedLayerOrder.push("overlayTexture");
    const overlayVisualCtx: TextureVisualRenderContext = {
      ...textureVisualCtx,
      viewportMaxSize: computeViewportSizeStats(overlayTextureCells).maxSize,
    };
    const overlayTextureDraw = renderHeatmapTextureCells(
      ctx,
      metrics,
      overlayTextureCells,
      timeViewport,
      params.visualSettings,
      "perp-overlay",
      params.overlayOpacity ?? 0.35,
      params.overlayEngine.textureStats?.texturePriceBucketSize ??
        BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
      spot,
      params.overlayEngine.timeMax,
      params.overlayEngine.timeMin,
      timeViewport.dataEndTime,
      overlayVisualCtx,
    );
    renderedTextureTotal += overlayTextureDraw.rendered;
    filteredByTimeTotal += overlayTextureDraw.filteredByTime;
    if (overlayTextureDraw.drawCapHit && params.textureRenderStatsOut) {
      params.textureRenderStatsOut.textureDrawCapHit = true;
    }
  }

  if (hasOverlayBands && params.overlayEngine) {
    renderedLayerOrder.push("overlayWallBands");
    const preparedOverlayWalls = prepareWallBandsForContinuousRender(
      params.overlayEngine.bands,
      timeViewport.dataEndTime,
      timeViewport.visibleEndTime,
      BOOKMAP_TEXTURE_SAMPLER_MS,
    );
    renderHeatmapBands(
      ctx,
      metrics,
      preparedOverlayWalls.bands,
      timeViewport.dataEndTime,
      timeViewport.dataEndTime,
      params.visualSettings,
      "perp-overlay",
      params.overlayOpacity ?? 0.35,
    );
  }

  if (params.layerAuditSink) {
    params.layerAuditSink.audit = buildBookmapLayerAudit({
      market: activeDomMarket,
      sourceMode,
      verticalMode: microScalpVisual.verticalMode,
      legacyRendererActive: false,
      engineRendererActive: true,
      renderData: engine,
      renderedLayerOrder,
      renderedHistoricalTextureCount: renderedTextureTotal,
      renderedHistoricalFootprintCount:
        l2BandContinuityStats.pulledRelevantBandCount,
      renderedLiveProjectionCount: combinedLiveDraw.rendered,
      renderedWallBandCount: filteredWallBands.length,
      executionOverlayActive: false,
      tradeDotsActive: Boolean(params.tradeDots?.length),
      currentBookAnchorsInPrepare: false,
    });
  }

  if (params.visualParityTruthOut) {
    const perpTruth = params.perpFilterTruthOut;
    Object.assign(
      params.visualParityTruthOut,
      buildBookmapVisualParityTruth({
        minPrice,
        maxPrice,
        renderStats: visualRenderStats,
        perpFilterEnabled: perpTruth?.perpFilterEnabled ?? false,
        perpFilterOk: perpTruth?.perpFilterOk ?? true,
        perpDensityTooHigh: perpTruth?.perpDensityTooHigh ?? false,
      }),
    );
  }

  if (params.l2BandContinuityTruthOut) {
    Object.assign(
      params.l2BandContinuityTruthOut,
      buildBookmapL2BandContinuityTruth(l2BandContinuityStats),
    );
  }

  if (params.paletteParityTruthOut) {
    Object.assign(
      params.paletteParityTruthOut,
      buildBookmapPaletteParityTruth(paletteParityStats),
    );
  }

  if (params.microHierarchyTruthOut) {
    Object.assign(
      params.microHierarchyTruthOut,
      buildBookmapMicroVisualHierarchyTruth(
        microHierarchyStats,
        microScalpVisual,
      ),
    );
  }

  if (params.historicalColorRetentionTruthOut && engine.historicalColorRetention) {
    const alphaFrozenAsFinalDetected =
      historicalColorLockAudit.alphaFrozenCellCount > 0;
    const renderN = Math.max(1, historicalColorLockAudit.renderSampleCount);
    Object.assign(params.historicalColorRetentionTruthOut, {
      ...engine.historicalColorRetention,
      alphaFrozenAsFinalDetected,
      avgFinalRenderIntensity: Number(
        (historicalColorLockAudit.intensityFinalSum / renderN).toFixed(4),
      ),
    });
  }

  if (params.historicalSpanColorAuditOut && primaryTextureDraw?.spanColorAudit) {
    Object.assign(
      params.historicalSpanColorAuditOut,
      primaryTextureDraw.spanColorAudit,
    );
  }

  if (params.spanRenderContinuityAuditOut && primaryTextureDraw?.spanRenderContinuityAudit) {
    Object.assign(
      params.spanRenderContinuityAuditOut,
      primaryTextureDraw.spanRenderContinuityAudit,
    );
  }

  if (params.spanTextureBalanceAuditOut && primaryTextureDraw?.spanTextureBalanceAudit) {
    Object.assign(
      params.spanTextureBalanceAuditOut,
      primaryTextureDraw.spanTextureBalanceAudit,
    );
  }

  if (params.p74SpanAuditOut && primaryTextureDraw?.spanColorAudit) {
    Object.assign(
      params.p74SpanAuditOut,
      buildBookmapP74SpanAudit(
        primaryTextureDraw.spanColorAudit,
        primaryTextureDraw.avgTextureCellWidthPx,
        primaryTextureDraw.spanRenderContinuityAudit,
        primaryTextureDraw.spanTextureBalanceAudit,
      ),
    );
  }

  if (params.historicalColorLockAuditOut) {
    const renderN = Math.max(1, historicalColorLockAudit.renderSampleCount);
    const baseAudit = buildHistoricalColorLockAuditFromRetention(
      engine.historicalColorRetention ?? {
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
      },
      engine.historicalColorLockAudit,
    );
    Object.assign(params.historicalColorLockAuditOut, {
      ...baseAudit,
      alphaFrozenCellCount: historicalColorLockAudit.alphaFrozenCellCount,
      alphaFinalAvg: Number(
        (historicalColorLockAudit.alphaFinalSum / renderN).toFixed(4),
      ),
      intensityFinalAvg: Number(
        (historicalColorLockAudit.intensityFinalSum / renderN).toFixed(4),
      ),
    });
  }

  if (params.textureRenderStatsOut) {
    params.textureRenderStatsOut.renderedTextureCellCount =
      renderedTextureTotal;
    params.textureRenderStatsOut.cellsFilteredByTime = filteredByTimeTotal;
    if (primaryTextureDraw) {
      params.textureRenderStatsOut.avgTextureCellWidthPx =
        primaryTextureDraw.avgTextureCellWidthPx;
      params.textureRenderStatsOut.minTextureCellWidthPx =
        primaryTextureDraw.minTextureCellWidthPx;
      params.textureRenderStatsOut.maxTextureCellWidthPx =
        primaryTextureDraw.maxTextureCellWidthPx;
    }
    params.textureRenderStatsOut.effectiveTextureBucketMs =
      BOOKMAP_TEXTURE_SAMPLER_MS;
    params.textureRenderStatsOut.textureContinuousMode =
      BOOKMAP_TEXTURE_CONTINUOUS_MODE;
  }

  renderEngineTimeGrid(ctx, metrics);
  renderLiveDataEdge(ctx, metrics, timeViewport);
  renderPriceGrid(ctx, w, crosshairMetrics, minPrice, maxPrice);

  if (hasBands || hasTexture || hasOverlayTexture || hasOverlayBands) {
    if (params.confluenceLevels && params.confluenceLevels.length > 0) {
      renderPassiveConfluenceOverlay(
        ctx,
        {
          plotW: metrics.plotW,
          plotH: metrics.plotH,
          priceToY: metrics.priceToY,
          timeToX: metrics.timeToX,
          priceStep: params.heatmapBucketSize,
        },
        params.confluenceLevels,
        engine.bands,
        timeViewport,
        params.confluenceVisualOpacity ?? "normal",
        params.confluenceRenderMode ?? "intraday",
        params.confluenceMinDisplayTier ?? "strong",
        params.overlayEngine?.bands,
      );
    }
    const plotRight = HEATMAP_PAD.left + metrics.plotW;
    const wallPlacements = pickWallLabels(
      engine.bands,
      metrics.priceToY,
      plotRight,
    );
    if (
      params.showConfluenceLabels !== false &&
      params.confluenceLevels &&
      params.confluenceLevels.length > 0
    ) {
      const reservedYs = wallPlacements.map((p) => p.y);
      const confLabels = pickConfluenceLabels(
        params.confluenceLevels,
        metrics.priceToY,
        plotRight,
        spot,
        reservedYs,
        params.confluenceRenderMode ?? "intraday",
        params.confluenceMinDisplayTier ?? "strong",
      );
      renderConfluenceLabels(ctx, confLabels);
    }
    renderWallLabelPlacements(ctx, plotRight, wallPlacements);
  }

  if (
    params.showHistoricalBboPath === true &&
    params.bboHistoryPoints &&
    params.bboHistoryPoints.length >= 2
  ) {
    renderedLayerOrder.push("bboHistoryPath");
    const bounds = getBboPathPlotBounds(w, h);
    renderHistoricalBboPath(ctx, {
      points: params.bboHistoryPoints,
      plotW: bounds.plotW,
      plotH: bounds.plotH,
      plotLeft: bounds.plotLeft,
      plotTop: bounds.plotTop,
      plotBottom: bounds.plotBottom,
      minPrice,
      maxPrice,
      timeToX: metrics.timeToX,
      priceToY: params.priceToY,
      timeViewport,
      verticalMode: params.tradeDotVerticalMode ?? "intraday",
      opacity: params.bboPathOpacity ?? "normal",
    });
  }

  if (
    params.showDivergenceMarkers !== false &&
    params.divergenceMarkers &&
    params.divergenceMarkers.length > 0
  ) {
    renderDivergenceMarkers(ctx, params.divergenceMarkers, {
      plotW: metrics.plotW,
      plotH: metrics.plotH,
      priceToY: params.priceToY,
      timeToX: metrics.timeToX,
      timeViewport,
      minPrice,
      maxPrice,
    });
  }

  if (
    params.showBidAskLines !== false &&
    params.bboGuide &&
    metrics
  ) {
    renderedLayerOrder.push("priceLines");
    renderBookmapBidAskGuideLines(
      ctx,
      params.bboGuide,
      metrics,
      timeViewport,
      params.tradeDotVerticalMode ?? "intraday",
      params.bidAskLineOpacity ?? "normal",
      Math.max(1, params.domBucketSize ?? params.heatmapBucketSize),
    );
  }

  if (params.tradeDotRenderStatsOut) {
    Object.assign(params.tradeDotRenderStatsOut, EMPTY_TRADE_DOT_RENDER_STATS);
  }
  if (params.tradeDots && params.tradeDots.length > 0) {
    if (params.executionRailsEnabled !== false) {
      renderedLayerOrder.push("executionOverlay");
      renderEngineExecutionRails(
        ctx,
        params.tradeDots,
        metrics.timeToX,
        metrics.priceToY,
        metrics.plotW,
        metrics.plotH,
        {
          verticalMode: params.tradeDotVerticalMode ?? "intraday",
          railLength: params.executionRailLength ?? "normal",
          visual: params.tradeDotVisual,
        },
      );
    }
    renderedLayerOrder.push("tradeDots");
    renderEngineTradeDots(
      ctx,
      params.tradeDots,
      metrics.timeToX,
      metrics.priceToY,
      metrics.plotW,
      metrics.plotH,
      params.tradeDotVerticalMode ?? "intraday",
      params.tradeDotVisual,
      params.tradeDotRenderStatsOut,
    );
  }

  if (spot != null) {
    renderSpotLine(ctx, w, crosshairMetrics, spot, minPrice, maxPrice);
  }

  if (params.showFarWallMarkers !== false) {
    renderEngineFarWallMarkers(ctx, params, metrics);
  }

  if (params.crosshair) {
    renderCrosshair(ctx, w, h, params.crosshair, crosshairMetrics);
  }

  if (params.renderArchitectureFrameStatsOut) {
    let afterDuplicatedWallAndActiveDomCount = 0;
    for (const band of filteredWallBands) {
      const key = `${band.side}:${band.price}`;
      if (
        activeDomPriceKeys.has(key) &&
        band.tier !== "structural" &&
        band.tier !== "major"
      ) {
        afterDuplicatedWallAndActiveDomCount += 1;
      }
    }
    const textureLeft = primaryTextureDraw?.historicalTextureLeftSideCount ?? 0;
    const textureRight =
      primaryTextureDraw?.historicalTextureRightSideCount ?? 0;
    const wallLeft = wallSideStats?.leftCount ?? 0;
    const wallRight = wallSideStats?.rightCount ?? 0;
    Object.assign(params.renderArchitectureFrameStatsOut, {
      renderedLayerOrder: [...renderedLayerOrder],
      historicalTextureLeftSideCount: textureLeft,
      historicalTextureRightSideCount: textureRight,
      pulledFootprintLeftSideCount:
        primaryTextureDraw?.pulledFootprintLeftSideCount ?? 0,
      pulledFootprintRightSideCount:
        primaryTextureDraw?.pulledFootprintRightSideCount ?? 0,
      wallBandLeftSideCount: wallLeft,
      wallBandRightSideCount: wallRight,
      structuralWallLeftSideCount: wallSideStats?.structuralLeft ?? 0,
      structuralWallRightSideCount: wallSideStats?.structuralRight ?? 0,
      majorWallLeftSideCount: wallSideStats?.majorLeft ?? 0,
      majorWallRightSideCount: wallSideStats?.majorRight ?? 0,
      leftSideRenderedCount: textureLeft + wallLeft,
      rightSideRenderedCount:
        textureRight +
        microScalpStats.activeDomBandRectCount +
        microScalpStats.liveProjectionRectCount +
        wallRight,
      duplicatedWallAndActiveDomCount: afterDuplicatedWallAndActiveDomCount,
      duplicatedAnchorAndLiveCount: 0,
      executionOverlayActive:
        Boolean(params.tradeDots?.length) &&
        params.executionRailsEnabled !== false,
      tradeDotsActive: Boolean(params.tradeDots?.length),
      phase2ClipApplied: primaryTextureDraw?.phase2ClipApplied ?? true,
      phase2LiveDedupApplied,
      phase2WallDedupApplied,
      phase2StrictLiveStartApplied,
      beforeHistoricalRightSideCount:
        primaryTextureDraw?.beforeHistoricalRightSideCount ?? 0,
      afterHistoricalRightSideCount: textureRight,
      beforeDuplicatedLiveProjectionAndActiveDomCount:
        liveDomDedup.beforeOverlapCount,
      afterDuplicatedLiveProjectionAndActiveDomCount:
        liveDomDedup.afterOverlapCount,
      beforeDuplicatedWallAndActiveDomCount,
      afterDuplicatedWallAndActiveDomCount,
      phase3ContinuityIdentityApplied: continuityPlan != null,
      phase3SeamBlendApplied:
        continuityPlan?.stats.seamBlendApplied ??
        continuityRenderStats.seamBlendAppliedCount > 0,
      phase3LiveUsesHistoricalVisualBase:
        continuityRenderStats.continuingFromHistoricalRenderCount > 0,
      liquidityContinuityStats: continuityPlan
        ? enrichLiquidityContinuityStatsFromRender(
            continuityPlan.stats,
            liveDomRenderCapture,
            microScalpVisual.verticalMode,
          )
        : null,
      rightSideDensityCapture: rightSideDensityCapture,
    });
  }

  finalizeDotsReadabilityStats();
  finalizeColorHierarchyStats();

  emitRenderPathProofDiag(
    primaryTextureDraw?.spanRenderContinuityAudit,
    lastWallOrganicRenderDiagStats,
  );
  emitAggressiveHeatmapCalibrationV3Diag(
    primaryTextureDraw?.spanRenderContinuityAudit,
    lastWallOrganicRenderDiagStats,
    params.textureRenderStatsOut?.textureDrawCapHit ?? false,
    getAggressiveHeatmapCalibrationV3PrepareStats().skippedWeakFar,
  );
  emitRenderMatrixDiag();
  emitLiveVsHistoricalDiag();
  drawRenderPathProofWatermark(ctx);
}

export type { BookmapHeatmapRenderParams };
