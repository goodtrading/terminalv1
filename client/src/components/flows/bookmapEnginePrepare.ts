import {
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_ENGINE_MAX_RENDER_CELLS,
  BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3,
  BOOKMAP_HEATMAP_DEPTH_PASS_V2,
  BOOKMAP_HORIZONTAL_PERSISTENCE_V2,
  BOOKMAP_MATRIX_AUDIT_DIAG,
  BOOKMAP_MATRIX_TEXTURE_MODE_V1,
  BOOKMAP_NATURAL_MATRIX_LOGIC_V1,
  BOOKMAP_TEXTURE_CALIBRATION_V2,
  DEPTH_V2_MAX_VISIBILITY_INTENSITY,
  DEPTH_V2_NEAR_PRICE_PCT,
  DEPTH_V2_NEAR_PRICE_VISIBILITY_BOOST,
  DEPTH_V2_WEAK_INTENSITY_FLOOR_MACRO,
  DEPTH_V2_WEAK_INTENSITY_FLOOR_MICRO,
  H_PERSIST_V2_MACRO_NOISE_SIZE_BTC,
  H_PERSIST_V2_MAX_CONTINUITY_BOOST,
  H_PERSIST_V2_MERGE_GAP_MS,
  H_PERSIST_V2_MIN_RUN_FOR_BOOST,
  H_PERSIST_V2_PRICE_BRIDGE_USD,
  H_PERSIST_V2_CHUNK_OVERLAY_ALPHA,
  TEX_CALIB_V2_CHUNK_OVERLAY_ALPHA,
  V3_CHUNK_OVERLAY_MEDIUM,
  V3_MAX_VISIBILITY_INTENSITY,
  V3_NEAR_PRICE_VISIBILITY_BOOST,
  V3_WEAK_MEDIUM_CAP_RESERVE_PCT,
  MATRIX_V1_GRANULAR_CAP_PCT,
  MATRIX_V1_SPAN_MIN_INTENSITY,
  MATRIX_V1_SPAN_MIN_SIZE_BTC,
  NATURAL_MATRIX_MAX_FRAGMENT_BUCKETS,
  NATURAL_MATRIX_MIN_PERSISTENCE_MS,
  NATURAL_MATRIX_MIN_RUN_FRAGMENT,
  NATURAL_MATRIX_MIN_VI_FRAGMENT,
  NATURAL_MATRIX_MAX_VI_FRAGMENT,
  type BookmapZoomRegime,
  computeVisiblePriceRangePct,
  L2_MATERIAL_SIZE_CHANGE_BTC,
  L2_MATERIAL_SIZE_CHANGE_RELATIVE,
  L2_NEAR_HALF_PCT_MIN_BTC,
  L2_NEAR_QUARTER_PCT_MIN_BTC,
  L2_RELEVANT_MIN_BTC,
  L2_STABLE_MAX_SIZE_BLEND,
  L2_WEAK_GRANULAR_MAX_BTC,
  WALL_BAND_STABLE_INTENSITY_IMPORTANT,
  WALL_BAND_STABLE_INTENSITY_MAJOR,
  WALL_BAND_STABLE_INTENSITY_STRUCTURAL,
  PALETTE_ALPHA_ACTIVE_WEAK_MIN,
  PALETTE_RELEVANT_L2_ALPHA_FLOOR,
  PALETTE_STRONG_BAND_ALPHA_FLOOR,
  PERP_RENDER_ACTIVE_CAP,
  PERP_RENDER_CLOSED_CAP,
  PERP_RENDER_MIN_LIFETIME_MS,
  PERP_RENDER_ROW_MIN_GAP_PX,
  PERP_STRIPE_SATURATION_MAX_PCT,
  resolveZoomRegime,
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import {
  classifyMatrixTierByIntensity,
} from "@/lib/bookmapMatrixAudit";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { mapSizeToVisualIntensity } from "@/lib/bookmapIntensity";
import {
  aggregateBookLevelsByBucket,
  aggregateHeatmapCellsByBucket,
} from "@/lib/bookmapPriceScaleUtils";
import type { AdaptiveVisualScale } from "@/lib/bookmapIntensity";
import {
  calibrateMicroScalpRenderIntensity,
  computeLocalRankScore,
  computeMicroDataIntensity,
  historicalTextureCellKey,
  isMicroScalpMode,
  isMicroVisualHierarchyMode,
  microContinuityScore,
  microPersistenceScore,
  microProximityScore,
  computeTextureSpanAlphaFloor,
  computeTextureSpanPeakIntensity,
  historicalTextureRunKey,
  resolveHistoricalTextureSpanPeakLock,
  resolveHistoricalTextureVisualLock,
  type HistoricalTextureSpanPeakLock,
  type HistoricalTextureVisualLock,
  type MicroScalpContext,
} from "@/lib/bookmapIntensity";
import type { LiquiditySnapshot, OrderbookLevel } from "./liquidityHeatmapUtils";
import type { BookLevel, BookmapState, HeatmapCell } from "@/types/bookmapState";
import {
  prepareHeatmapBands,
  rescoreMergedBandsForViewport,
  type BandPrepareStats,
} from "./bookmapBandPrepare";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import {
  alphaForPassiveLiquidity,
  classifyPassiveIntensityBucket,
  MICRO_TEXTURE_ALPHA_MAX,
  MICRO_TEXTURE_ALPHA_MUL,
  microAlphaFromRenderIntensity,
  type PassiveLiquidityAlphaContext,
} from "@/lib/bookmapBandColors";
import {
  isWallTier,
  tierFromMaxSize,
  type HeatmapBand,
} from "./bookmapBandTypes";
import { bucketPrice } from "./domLadderUtils";
import {
  resolveLiveDomBookLevels,
  resolveLiveDomPriorityConfig,
  selectActiveLiveDomLevels,
  type ActiveLiveDomLevel,
  type LiveDomBookLevel,
  type LiveDomSelectionResult,
} from "./bookmapLiveDomPriority";
import {
  clampPulledRestingSpanEnds,
  materializeRestingLiquidityHeatmapCells,
  resolveRestingLiquidityWriteConfig,
} from "./bookmapRestingLiquidity";
import {
  applyLifecycleChunkTextureMod,
  blendLifecycleRunIntensity,
  canCoalesceLifecycleTextureTier,
  getLifecycleCellMeta,
  recordLifecycleTexturePrepareStats,
  type LifecycleTextureTier,
} from "./bookmapLifecycleTextureIntegration";
import {
  baseTextureAlphaForIntensity,
  BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY,
  classifyPassiveBaseTier,
  BOOKMAP_BASE_TEXTURE_NEAR035_MIN_BTC,
  classifyTextureSourceKind,
  computeBaseVisualIntensity,
  recordPassiveBaseTexturePrepareStats,
  resolveTextureSourceKindForPrepared,
  selectPassiveBaseTextureSources,
  type TextureSourceKind,
} from "./bookmapPassiveBaseTexture";
import {
  applyStableGapModulation,
  BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE,
  clampBookmapLikeRenderIntensity,
  finalizeColorHierarchyStats,
  nearTickPassiveMistAlpha,
  passesNearTickPassiveMistRule,
  resetBookmapVisualForceFrameStats,
  recordBaseLongFlatSpanCount,
  setNearTickPassiveMistCoverage,
  shouldForceGranularBookmapTexture,
} from "./bookmapVisualForceBookmapLike";
import { dedupeLiveProjectionAgainstActiveDom } from "./bookmapLayerResponsibilities";
import {
  buildAnchoredWallLayer,
  type AnchoredWallEntity,
  type MacroDomCoverageDiagStats,
  type WallAnchoringDiagStats,
} from "./bookmapWallAnchoring";
import {
  updateHistoricalLiquiditySurface,
  type ActiveRestingLiquidityLevel,
  type HistoricalLiquiditySurfaceCell,
  type HistoricalLiquiditySurfaceDiag,
} from "./bookmapHistoricalLiquiditySurface";

/** P7.2 — granular historical limit-order texture (not merged into bands). */
export const BOOKMAP_TEXTURE_MODE_ENABLED = true;
/** P7.3 — texture min for passive microstructure (was 5 BTC). */
export const BOOKMAP_TEXTURE_MIN_BTC = 2;
export const BOOKMAP_TEXTURE_WALL_BAND_MIN_BTC = WALL_IMPORTANT_BTC;
/** P8.1 — coarser price snap so maintained limits draw as one horizontal band. */
export const BOOKMAP_TEXTURE_PRICE_BUCKET_USD = 5;
/** P8 — prepare cap (raised for 90min retention under sampler). */
export const BOOKMAP_TEXTURE_MAX_PREPARE_CELLS = 24_000;
/** P8 — draw cap (raised; viewport-aware prioritization prefers visible history). */
export const BOOKMAP_TEXTURE_MAX_DRAW_CELLS = 16_000;
/** P8 — retention window aligned with server HEATMAP_RETENTION_MS. */
export const BOOKMAP_HISTORY_RETENTION_MS = 90 * 60 * 1000;
export const BOOKMAP_TEXTURE_MIN_RENDER_INTENSITY = 0.012;
export const BOOKMAP_TEXTURE_NEAR_MID_1_PCT = 1;
export const BOOKMAP_TEXTURE_NEAR_MID_PCT = 2.5;
/** P7.1 server passive snapshot interval — texture horizontal extent per sample. */
export const BOOKMAP_TEXTURE_SAMPLER_MS = 1_200;
/** Max gap between samples before a pull-gap (bridges brief sampler misses). */
export const BOOKMAP_TEXTURE_TIME_MERGE_GAP_MS = 18_000;
/** Drop isolated single-sample micro blips (maintained orders merge into runs). */
export const BOOKMAP_TEXTURE_ORPHAN_MAX_BTC = 8;
export const BOOKMAP_TEXTURE_ORPHAN_MIN_SAMPLES = 2;
/** P7.4 — texture cells extend to next sample / sampler interval, not engine bucket only. */
export const BOOKMAP_TEXTURE_CONTINUOUS_MODE = "sampler-interval-end";
/** P7.4 — overlap so consecutive spans form continuous horizontal bands. */
export const BOOKMAP_TEXTURE_CELL_OVERLAP_PX = 1.5;
export const BOOKMAP_TEXTURE_MIN_CELL_WIDTH_PX = 2;
/** Draw one solid base rect per resting run before optional chunk texture. */
export const BOOKMAP_TEXTURE_SPAN_BASE_RENDER_ENABLED = true;
/** Max overlay alpha as fraction of base body alpha (subtle grain only). */
export const BOOKMAP_TEXTURE_INTERNAL_CHUNK_OVERLAY_ALPHA = 0.14;
/** Skip chunk overlay when sampler columns are narrower than this. */
export const BOOKMAP_TEXTURE_CHUNK_OVERLAY_MIN_WIDTH_PX = 2.5;

/** P7.5/P7.6 — live forward projection from current orderbook into right-space only. */
export const BOOKMAP_LIVE_PROJECTION_ENABLED = true;
export const BOOKMAP_LIVE_PROJECTION_MIN_MAJOR_BTC = 100;
/** P7.6 — medium walls away from touch; majors always pass. */
export const BOOKMAP_LIVE_PROJECTION_MIN_MEDIUM_BTC = 20;
/** P7.6 — near-touch only within ±0.5%. */
export const BOOKMAP_LIVE_PROJECTION_MIN_NEAR_BTC = 5;
export const BOOKMAP_LIVE_PROJECTION_NEAR_MID_1_PCT = 0.5;
export const BOOKMAP_LIVE_PROJECTION_MAX_PER_SIDE = 45;
/** Visual parity — strong spans draw continuous; weaker spans subdivide into sampler cells. */
export const BOOKMAP_TEXTURE_CONTINUOUS_MIN_SIZE_BTC = 12;
export const BOOKMAP_TEXTURE_CONTINUOUS_MIN_INTENSITY = 0.48;
/** Right-edge overlap so active liquidity blends with historical texture. */
export const BOOKMAP_LIVE_PROJECTION_HISTORY_OVERLAP_MS = 600;
/** Right-space uses passive body alpha from palette (no extra fade). */
export const BOOKMAP_LIVE_PROJECTION_ALPHA_MUL = 1;
/** Skip faint micro-levels in right-space — fewer bars, same visual weight as history. */
export const BOOKMAP_LIVE_PROJECTION_MIN_RENDER_INTENSITY = 0.04;
export const BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS = 50;

export type PreparedEngineCell = {
  timeBucket: number;
  /** When set, texture span extends to this time (exclusive), like Bookmap resting limits. */
  endTimeBucket?: number;
  price: number;
  side: "bid" | "ask";
  intensity: number;
  isMajor: boolean;
  maxSizeInBucket: number;
  /** Existing hybrid intensity before micro render calibration. */
  dataIntensity?: number;
  /** Micro scalping render intensity — historical texture only. */
  microScalpRenderIntensity?: number;
  localRankScore?: number;
  persistenceMs?: number;
  continuityRunLength?: number;
  /** MAX render intensity reached — historical texture footprint floor. */
  historicalRenderIntensity?: number;
  /** Alpha floor hint only — renderer computes final alpha. */
  historicalRenderAlphaFloor?: number;
  /** @deprecated use historicalRenderAlphaFloor */
  historicalRenderAlpha?: number;
  historicalColorLocked?: boolean;
  /** First timeBucket of coalesced resting run. */
  runStartTimeBucket?: number;
  cellsInRun?: number;
  /** P4.1 — lifecycle historical texture integration */
  lifecycleHistorical?: boolean;
  lifecycleActive?: boolean;
  lifecyclePulled?: boolean;
  lifecycleFootprint?: boolean;
  lifecycleWall?: boolean;
  lifecycleStrong?: boolean;
  lifecycleTextureMod?: number;
  lifecycleTextureTier?: LifecycleTextureTier;
  lifecycleKey?: string;
  /** P5 — passive base vs lifecycle vs wall */
  textureSourceKind?: TextureSourceKind;
  /** B.3.1 — short time-bucket mosaic cell (not horizontal span). */
  isGranularMatrixCell?: boolean;
  /** B.3.2 — medium persistent mini-fragment (2–5 buckets). */
  isMiniFragment?: boolean;
  /** B.3.2 — derived liquidity lifecycle stage for historical render. */
  liquidityLifeStage?:
    | "new"
    | "persistent"
    | "reinforced"
    | "fading"
    | "stale"
    | "wall_candidate";
  /** B.3.2 — 0–1 continuity score from run length + persistence. */
  visualContinuityScore?: number;
  /** B.3.2 — 0–1 fade hint when size drops or level ends. */
  visualFadeScore?: number;
  /** B.3.2 — 0–1 refill hint when size increases vs prior bucket. */
  visualRefillScore?: number;
};

export type PreparedEngineTextureCell = PreparedEngineCell;

export type PreparedLiveProjectionLevel = {
  price: number;
  side: "bid" | "ask";
  sizeBtc: number;
  intensity: number;
  /** Right-edge live DOM — never use historical stableL2 fill. */
  isActiveLiveDom?: boolean;
  liveDomSource?: "best" | "near-tick" | "top-dom" | "viewport-top" | "wall";
  /** Rank-based right-side alpha (0.10–0.65). */
  microScalpAlpha?: number;
  selectionScore?: number;
  /** Smoothed visual score from live DOM cache (0–1). */
  liveDomVisualScore?: number;
  liveDomColorTier?: "low" | "medium" | "strong" | "wall";
  liveDomFadeAlpha?: number;
};

export type LiveProjectionPrepareStats = {
  liveProjectionEnabled: boolean;
  currentBidLevelCount: number;
  currentAskLevelCount: number;
  projectedBidLevelCount: number;
  projectedAskLevelCount: number;
  projectedLevelsFilteredBySize: number;
  projectedLevelsFilteredByPrice: number;
  minProjectedSizeBtc: number;
  maxProjectedSizeBtc: number;
  liveProjectionStartTime: number;
};

export type BookmapTexturePrepareStats = {
  rawHeatmapCellCount: number;
  preparedCellCount: number;
  preparedTextureCellCount: number;
  wallBandCount: number;
  cellsFilteredBySize: number;
  cellsFilteredByPrice: number;
  cellsFilteredByTime: number;
  texturePriceBucketSize: number;
  timeBucketMs: number;
  minRenderedSizeBtc: number;
  maxRenderedSizeBtc: number;
  mergeCompressionRatio: number;
  textureModeEnabled: boolean;
  texturePrepareCapHit: boolean;
  textureDrawCapHit: boolean;
  cellsFilteredByIntensity: number;
  textureSamplerMs: number;
  textureContinuousMode: string;
  cellsWithEndTime: number;
  cellsUsingSyntheticEndTime: number;
  matrixGranularCellCount?: number;
  horizontalSpanCellCount?: number;
};

export type BookmapTextureDiag = BookmapTexturePrepareStats & {
  sourceMode: string;
  activeDomMarket: string;
  textureCellCount: number;
  renderedBandCount: number;
  renderedTextureCellCount: number;
  historicalCellCount: number;
  spotSampledLevelsLastTick: number;
  perpSampledLevelsLastTick: number;
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
  /** P7.2 — per time/price bucket texture cells (not merged across time). */
  textureCells: PreparedEngineTextureCell[];
  textureStats: BookmapTexturePrepareStats;
  textureModeEnabled: boolean;
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
  /** P7.5 — current book levels projected into right-space (not historical cells). */
  liveProjectionLevels: PreparedLiveProjectionLevel[];
  liveProjectionStats: LiveProjectionPrepareStats;
  /** Fast-updating top/near-tick subset — diagnostic only; rendered via liveProjectionLevels. */
  activeDomBands: PreparedLiveProjectionLevel[];
  liveDomSelection?: LiveDomSelectionResult;
  /** Micro scalping visual context — historical texture hierarchy only. */
  microScalpVisual?: MicroScalpVisualContext;
  /** DEV — historical color retention stats from last prepare pass. */
  historicalColorRetention?: HistoricalColorRetentionStats;
  /** DEV — merged server + DOM-materialized heatmap cells for resting liquidity audit. */
  restingLiquidityRawCells?: HeatmapCell[];
  /** DEV — historical lock audit from last prepare pass. */
  historicalColorLockAudit?: HistoricalColorLockAudit;
  /** B.4 — persistent anchored wall entities. */
  anchoredWalls?: AnchoredWallEntity[];
  wallAnchoringDiag?: WallAnchoringDiagStats;
  macroDomCoverageDiag?: MacroDomCoverageDiagStats;
  /** B.6 — full current DOM book levels used in prepare (same source as lateral panel). */
  currentDomBookLevels?: LiveDomBookLevel[];
  /** STEP 1 — stateful priceLevel x timeBucket historical liquidity surface. */
  historicalSurfaceCells?: HistoricalLiquiditySurfaceCell[];
  activeRestingLiquidityLevels?: ActiveRestingLiquidityLevel[];
  historicalSurfaceDiag?: HistoricalLiquiditySurfaceDiag;
};

export type MicroScalpVisualContext = {
  microScalpMode: boolean;
  /** Micro vertical zoom — enables calibration + palette (broader than strict scalp). */
  microVisualHierarchyActive: boolean;
  verticalMode: string;
  visiblePriceRange: number;
  pxPerSample: number;
  pxPerPriceBucket: number;
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
  protectedPrices: Set<string>,
  maxCells: number,
): PreparedEngineCell[] {
  if (cells.length <= maxCells) return cells;

  const mustKeep = cells.filter((c) =>
    protectedPrices.has(`${c.side}:${c.price}`),
  );
  const rest = cells
    .filter((c) => !protectedPrices.has(`${c.side}:${c.price}`))
    .sort((a, b) => b.maxSizeInBucket - a.maxSizeInBucket);

  const budget = Math.max(maxCells - mustKeep.length, 0);
  return [...mustKeep, ...rest.slice(0, budget)];
}

export type PrepareEngineRenderOptions = {
  liveDomBook?: LiveDomBookLevel[] | null;
  liveDomTimestamp?: number | null;
};

function prepareLiveBookProjection(
  state: BookmapState,
  minPrice: number,
  maxPrice: number,
  spotPrice: number | null | undefined,
  visualScale: AdaptiveVisualScale,
  verticalMode?: VerticalCompressionMode,
  liveDomBook?: LiveDomBookLevel[] | null,
  liveDomTimestamp?: number | null,
): {
  levels: PreparedLiveProjectionLevel[];
  activeDomBands: PreparedLiveProjectionLevel[];
  selection: LiveDomSelectionResult;
  stats: LiveProjectionPrepareStats;
} {
  const emptyStats = (
    overrides: Partial<LiveProjectionPrepareStats> = {},
  ): LiveProjectionPrepareStats => ({
    liveProjectionEnabled: BOOKMAP_LIVE_PROJECTION_ENABLED,
    currentBidLevelCount: 0,
    currentAskLevelCount: 0,
    projectedBidLevelCount: 0,
    projectedAskLevelCount: 0,
    projectedLevelsFilteredBySize: 0,
    projectedLevelsFilteredByPrice: 0,
    minProjectedSizeBtc: 0,
    maxProjectedSizeBtc: 0,
    liveProjectionStartTime: state.timestamp || Date.now(),
    ...overrides,
  });

  if (!BOOKMAP_LIVE_PROJECTION_ENABLED) {
    const emptySelection: LiveDomSelectionResult = {
      levels: [],
      activeDomBands: [],
      candidateCount: 0,
      nearTickCount: 0,
      topDomCount: 0,
      wallCount: 0,
      selectedLiveProjectionCount: 0,
      selectedActiveDomBandCount: 0,
      pullingDetectedCount: 0,
      spoofingCandidateCount: 0,
      bestBid: null,
      bestAsk: null,
      midPrice: null,
      nearTickBidCount005: 0,
      nearTickAskCount005: 0,
      nearTickBidCount015: 0,
      nearTickAskCount015: 0,
      nearTickBidCount035: 0,
      nearTickAskCount035: 0,
      currentBookVisibleLevelsCount: 0,
      topDomBidSize: 0,
      topDomAskSize: 0,
      largestDomBidPrices: [],
      largestDomAskPrices: [],
      largestDomBidSizes: [],
      largestDomAskSizes: [],
      missingTopDomLevelsCount: 0,
      missingNearTickLevelsCount: 0,
      estimatedCoveragePct: 0,
    };
    return {
      levels: [],
      activeDomBands: [],
      selection: emptySelection,
      stats: emptyStats({ liveProjectionEnabled: false }),
    };
  }

  const config = resolveLiveDomPriorityConfig(
    verticalMode,
    maxPrice - minPrice,
  );
  const bookLevels = resolveLiveDomBookLevels(state, liveDomBook, liveDomTimestamp);
  const now = liveDomTimestamp ?? state.timestamp ?? Date.now();

  let currentBidLevelCount = 0;
  let currentAskLevelCount = 0;
  for (const level of bookLevels) {
    if (level.size > 0 && level.side === "bid") currentBidLevelCount += 1;
    if (level.size > 0 && level.side === "ask") currentAskLevelCount += 1;
  }

  const selection = selectActiveLiveDomLevels({
    levels: bookLevels,
    minPrice,
    maxPrice,
    midPrice: spotPrice,
    config,
    now,
    mapIntensity: (sizeBtc, price, pct) => {
      let intensity = mapTextureSizeToVisualIntensity(sizeBtc, visualScale);
      if (config.mode === "micro" && pct <= 0.15) {
        const nearBoost = pct <= 0.05 ? 1.35 : 1.12;
        intensity = Math.min(
          0.95,
          Math.max(intensity * nearBoost, 0.06 + Math.min(0.22, sizeBtc * 0.04)),
        );
      }
      return intensity;
    },
  });

  const mapLevel = (row: ActiveLiveDomLevel): PreparedLiveProjectionLevel => ({
    price: row.price,
    side: row.side,
    sizeBtc: row.sizeBtc,
    intensity: row.intensity,
    isActiveLiveDom: true,
    liveDomSource: row.liveDomSource,
    microScalpAlpha: row.microScalpAlpha,
    selectionScore: row.selectionScore,
  });

  const levels: PreparedLiveProjectionLevel[] = selection.levels.map(mapLevel);
  const activeDomBands: PreparedLiveProjectionLevel[] =
    selection.activeDomBands.map(mapLevel);

  let minProjectedSizeBtc = 0;
  let maxProjectedSizeBtc = 0;
  for (const level of levels) {
    if (minProjectedSizeBtc === 0 || level.sizeBtc < minProjectedSizeBtc) {
      minProjectedSizeBtc = level.sizeBtc;
    }
    if (level.sizeBtc > maxProjectedSizeBtc) maxProjectedSizeBtc = level.sizeBtc;
  }

  const projectedBidLevelCount = levels.filter((l) => l.side === "bid").length;
  const projectedAskLevelCount = levels.filter((l) => l.side === "ask").length;
  const projectedLevelsFilteredBySize = Math.max(
    0,
    selection.candidateCount - levels.length,
  );

  const liveDedup = dedupeLiveProjectionAgainstActiveDom(
    levels,
    activeDomBands,
    config.priceBucketUsd,
  );

  return {
    levels: liveDedup.deduped,
    activeDomBands,
    selection,
    stats: emptyStats({
      currentBidLevelCount,
      currentAskLevelCount,
      projectedBidLevelCount,
      projectedAskLevelCount,
      projectedLevelsFilteredBySize,
      projectedLevelsFilteredByPrice: 0,
      minProjectedSizeBtc,
      maxProjectedSizeBtc,
      liveProjectionStartTime: now,
    }),
  };
}

function textureCellRetentionAgeScore(
  cell: PreparedEngineTextureCell,
  timeMax: number,
): number {
  if (timeMax <= 0) return 0;
  const ageMs = Math.max(0, timeMax - cell.timeBucket);
  return Math.max(0, 1 - ageMs / BOOKMAP_HISTORY_RETENTION_MS);
}

function textureCellPriorityScore(
  cell: PreparedEngineTextureCell,
  midPrice: number | null | undefined,
  timeMax: number,
  visibleTimeMin?: number,
  visibleTimeMax?: number,
): number {
  const size = cell.maxSizeInBucket;
  const sizeScore = Math.sqrt(Math.max(0, size));
  const retentionAge = textureCellRetentionAgeScore(cell, timeMax);
  const spanEnd =
    cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
  let viewportScore = 0;
  if (
    visibleTimeMin != null &&
    visibleTimeMax != null &&
    spanEnd >= visibleTimeMin &&
    cell.timeBucket <= visibleTimeMax
  ) {
    viewportScore = 2.5;
  }
  let nearScore = 0;
  if (midPrice != null && midPrice > 0) {
    const pct = (Math.abs(cell.price - midPrice) / midPrice) * 100;
    if (pct <= BOOKMAP_TEXTURE_NEAR_MID_1_PCT) nearScore = 3;
    else if (pct <= BOOKMAP_TEXTURE_NEAR_MID_PCT) nearScore = 2;
    else if (pct <= 5) nearScore = 1;
  }
  return (
    sizeScore * 0.34 +
    retentionAge * 0.22 +
    nearScore * 0.28 +
    viewportScore * 0.42 +
    (BOOKMAP_HORIZONTAL_PERSISTENCE_V2 &&
    cell.continuityRunLength != null &&
    cell.continuityRunLength >= H_PERSIST_V2_MIN_RUN_FOR_BOOST
      ? Math.min(1.4, (cell.continuityRunLength - 1) * 0.12)
      : 0)
  );
}

function textureCellCapTier(
  cell: PreparedEngineTextureCell,
  midPrice: number | null | undefined,
): "strong" | "medium" | "weak" {
  const vi = cell.intensity ?? 0;
  const run = cell.continuityRunLength ?? 1;
  if (vi >= 0.52 || cell.maxSizeInBucket >= WALL_IMPORTANT_BTC) return "strong";
  if (vi >= 0.22 || run >= 2) return "medium";
  if (midPrice != null && midPrice > 0) {
    const pct = Math.abs(cell.price - midPrice) / midPrice;
    if (pct <= DEPTH_V2_NEAR_PRICE_PCT / 100 && run >= 2) return "medium";
  }
  return "weak";
}

function prioritizeAndCapTextureCellsV3(
  cells: PreparedEngineTextureCell[],
  midPrice: number | null | undefined,
  timeMax: number,
  maxCells: number,
  visibleTimeMin?: number,
  visibleTimeMax?: number,
): { cells: PreparedEngineTextureCell[]; capHit: boolean; skippedWeakFar: number } {
  const reserveCount = Math.max(
    64,
    Math.floor(maxCells * V3_WEAK_MEDIUM_CAP_RESERVE_PCT),
  );
  const strongBudget = Math.max(1, maxCells - reserveCount);
  const scored = cells.map((cell) => ({
    cell,
    score: textureCellPriorityScore(
      cell,
      midPrice,
      timeMax,
      visibleTimeMin,
      visibleTimeMax,
    ),
    tier: textureCellCapTier(cell, midPrice),
  }));

  const strongRows = scored
    .filter((row) => row.tier === "strong")
    .sort((a, b) => b.score - a.score);
  const mediumRows = scored
    .filter((row) => row.tier === "medium")
    .sort((a, b) => b.score - a.score);
  const weakRows = scored
    .filter((row) => row.tier === "weak")
    .sort((a, b) => b.score - a.score);

  const picked: PreparedEngineTextureCell[] = [];
  const pickedKeys = new Set<string>();

  const pushRow = (row: (typeof scored)[number]) => {
    const key = `${row.cell.side}:${row.cell.price}:${row.cell.timeBucket}`;
    if (pickedKeys.has(key)) return;
    pickedKeys.add(key);
    picked.push(row.cell);
  };

  for (const row of strongRows) {
    if (picked.length >= strongBudget) break;
    pushRow(row);
  }

  const reserveCandidates = [...mediumRows, ...weakRows].sort(
    (a, b) => b.score - a.score,
  );
  let reserveFilled = 0;
  for (const row of reserveCandidates) {
    if (reserveFilled >= reserveCount || picked.length >= maxCells) break;
    const before = picked.length;
    pushRow(row);
    if (picked.length > before) reserveFilled += 1;
  }

  for (const row of strongRows) {
    if (picked.length >= maxCells) break;
    pushRow(row);
  }

  const skippedWeakFar = weakRows.filter(
    (row) => !pickedKeys.has(`${row.cell.side}:${row.cell.price}:${row.cell.timeBucket}`),
  ).length;

  return { cells: picked, capHit: true, skippedWeakFar };
}

let lastAggressiveV3PrepareStats = {
  capHit: false,
  skippedWeakFar: 0,
  reserveFilled: 0,
  inputCellCount: 0,
  outputCellCount: 0,
};

export function getAggressiveHeatmapCalibrationV3PrepareStats() {
  return lastAggressiveV3PrepareStats;
}

function prioritizeAndCapTextureCells(
  cells: PreparedEngineTextureCell[],
  midPrice: number | null | undefined,
  timeMax: number,
  maxCells: number,
  visibleTimeMin?: number,
  visibleTimeMax?: number,
): { cells: PreparedEngineTextureCell[]; capHit: boolean } {
  if (cells.length <= maxCells) {
    lastAggressiveV3PrepareStats = {
      capHit: false,
      skippedWeakFar: 0,
      reserveFilled: 0,
      inputCellCount: cells.length,
      outputCellCount: cells.length,
    };
    return { cells, capHit: false };
  }
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    const v3 = prioritizeAndCapTextureCellsV3(
      cells,
      midPrice,
      timeMax,
      maxCells,
      visibleTimeMin,
      visibleTimeMax,
    );
    lastAggressiveV3PrepareStats = {
      capHit: true,
      skippedWeakFar: v3.skippedWeakFar,
      reserveFilled: Math.floor(maxCells * V3_WEAK_MEDIUM_CAP_RESERVE_PCT),
      inputCellCount: cells.length,
      outputCellCount: v3.cells.length,
    };
    return { cells: v3.cells, capHit: true };
  }
  const ranked = [...cells]
    .map((cell) => ({
      cell,
      score: textureCellPriorityScore(
        cell,
        midPrice,
        timeMax,
        visibleTimeMin,
        visibleTimeMax,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCells)
    .map((row) => row.cell);
  return { cells: ranked, capHit: true };
}

/** Bookmap palette — reserve yellow/orange/red for stronger resting sizes. */
function mapTextureSizeToVisualIntensity(
  sizeBtc: number,
  visualScale: AdaptiveVisualScale,
): number {
  const base = mapSizeToVisualIntensity(sizeBtc, visualScale, sizeBtc);
  if (sizeBtc >= WALL_MAJOR_BTC) return Math.max(base, WALL_BAND_STABLE_INTENSITY_MAJOR);
  if (sizeBtc >= WALL_STRUCTURAL_BTC) {
    return Math.max(base, WALL_BAND_STABLE_INTENSITY_STRUCTURAL);
  }
  if (sizeBtc >= WALL_IMPORTANT_BTC) {
    return Math.max(base, WALL_BAND_STABLE_INTENSITY_IMPORTANT);
  }
  if (sizeBtc < 2) return base;
  const sqrtNorm = Math.min(1, Math.sqrt(sizeBtc) / Math.sqrt(30));
  const mediumLift =
    sizeBtc <= 30 ? 0.14 + sqrtNorm * 0.32 : sqrtNorm * 0.14;
  const floor = sizeBtc >= 2 ? 0.14 + sqrtNorm * 0.2 : 0;
  return Math.min(0.95, Math.max(floor, base * (1 + mediumLift * 0.5) + mediumLift * 0.16));
}

function isHorizontalSpanCandidate(cell: PreparedEngineTextureCell): boolean {
  const vi = cell.intensity ?? 0;
  if (cell.maxSizeInBucket >= WALL_IMPORTANT_BTC) return true;
  if (
    cell.maxSizeInBucket >= MATRIX_V1_SPAN_MIN_SIZE_BTC &&
    vi >= MATRIX_V1_SPAN_MIN_INTENSITY
  ) {
    return true;
  }
  if (cell.lifecycleWall) return true;
  return false;
}

function toGranularMatrixCell(
  cell: PreparedEngineTextureCell,
): PreparedEngineTextureCell {
  return {
    ...cell,
    endTimeBucket: cell.timeBucket + BOOKMAP_ENGINE_BUCKET_MS,
    continuityRunLength: 1,
    isGranularMatrixCell: true,
  };
}

function granularPriceLevelKey(cell: PreparedEngineTextureCell): string {
  return `${cell.side}:${cell.price}`;
}

function isConsecutiveGranularBucket(
  prev: PreparedEngineTextureCell,
  cur: PreparedEngineTextureCell,
): boolean {
  return cur.timeBucket - prev.timeBucket <= BOOKMAP_ENGINE_BUCKET_MS * 1.5;
}

function finalizeGranularRun(
  group: PreparedEngineTextureCell[],
  start: number,
  end: number,
): void {
  const runLen = end - start + 1;
  const runStartTime = group[start]!.timeBucket;
  for (let i = start; i <= end; i++) {
    group[i] = {
      ...group[i]!,
      continuityRunLength: runLen,
      runStartTimeBucket: runStartTime,
      cellsInRun: runLen,
    };
  }
}

function computeGranularPriceRuns(
  cells: PreparedEngineTextureCell[],
): PreparedEngineTextureCell[] {
  const byLevel = new Map<string, PreparedEngineTextureCell[]>();
  for (const cell of cells) {
    const key = granularPriceLevelKey(cell);
    const bucket = byLevel.get(key);
    if (bucket) bucket.push(cell);
    else byLevel.set(key, [cell]);
  }
  const out: PreparedEngineTextureCell[] = [];
  for (const group of byLevel.values()) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);
    let runStart = 0;
    for (let i = 1; i < group.length; i++) {
      if (!isConsecutiveGranularBucket(group[i - 1]!, group[i]!)) {
        finalizeGranularRun(group, runStart, i - 1);
        runStart = i;
      }
    }
    finalizeGranularRun(group, runStart, group.length - 1);
    out.push(...group);
  }
  return out;
}

function deriveNaturalMatrixVisualFields(
  cell: PreparedEngineTextureCell,
  prevSameLevel: PreparedEngineTextureCell | null,
  nextSameLevel: PreparedEngineTextureCell | null,
): Pick<
  PreparedEngineCell,
  | "liquidityLifeStage"
  | "visualContinuityScore"
  | "visualFadeScore"
  | "visualRefillScore"
> {
  const vi = cell.intensity ?? 0;
  const runLen = cell.continuityRunLength ?? 1;
  const persistenceMs =
    cell.persistenceMs ?? runLen * BOOKMAP_ENGINE_BUCKET_MS;
  const size = cell.maxSizeInBucket;
  const prevSize = prevSameLevel?.maxSizeInBucket ?? size;

  const hasGapAfter =
    nextSameLevel == null ||
    nextSameLevel.timeBucket - cell.timeBucket >
      BOOKMAP_ENGINE_BUCKET_MS * 1.5;
  const refillScore =
    size > prevSize * 1.08
      ? Math.min(1, (size - prevSize) / Math.max(1, prevSize))
      : 0;
  const fadeScore =
    size < prevSize * 0.85
      ? Math.min(1, (prevSize - size) / Math.max(1, prevSize))
      : hasGapAfter && runLen <= 2
        ? 0.32
        : cell.lifecyclePulled
          ? 0.55
          : 0;

  let liquidityLifeStage: NonNullable<
    PreparedEngineCell["liquidityLifeStage"]
  >;
  if (
    size >= WALL_IMPORTANT_BTC * 0.55 ||
    vi >= 0.48 ||
    cell.lifecycleWall
  ) {
    liquidityLifeStage = "wall_candidate";
  } else if (cell.lifecyclePulled || (hasGapAfter && runLen === 1)) {
    liquidityLifeStage = "fading";
  } else if (
    persistenceMs >= NATURAL_MATRIX_MIN_PERSISTENCE_MS * 6 &&
    vi < 0.28
  ) {
    liquidityLifeStage = "stale";
  } else if (refillScore > 0.18 || (vi >= 0.36 && runLen >= 3)) {
    liquidityLifeStage = "reinforced";
  } else if (
    runLen >= 2 ||
    persistenceMs >= NATURAL_MATRIX_MIN_PERSISTENCE_MS * 2
  ) {
    liquidityLifeStage = "persistent";
  } else {
    liquidityLifeStage = "new";
  }

  const visualContinuityScore = Math.min(
    1,
    (runLen - 1) * 0.17 +
      persistenceMs / (BOOKMAP_TEXTURE_SAMPLER_MS * 8),
  );

  return {
    liquidityLifeStage,
    visualContinuityScore,
    visualFadeScore: fadeScore,
    visualRefillScore: refillScore,
  };
}

function buildMiniHistoricalFragments(
  cells: PreparedEngineTextureCell[],
): PreparedEngineTextureCell[] {
  const singles: PreparedEngineTextureCell[] = [];
  const fragments: PreparedEngineTextureCell[] = [];
  const byLevel = new Map<string, PreparedEngineTextureCell[]>();

  for (const cell of cells) {
    if (cell.liquidityLifeStage === "wall_candidate") {
      singles.push(cell);
      continue;
    }
    const key = granularPriceLevelKey(cell);
    const bucket = byLevel.get(key);
    if (bucket) bucket.push(cell);
    else byLevel.set(key, [cell]);
  }

  for (const group of byLevel.values()) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);
    let i = 0;
    while (i < group.length) {
      let j = i;
      while (
        j + 1 < group.length &&
        isConsecutiveGranularBucket(group[j]!, group[j + 1]!)
      ) {
        j += 1;
      }
      const run = group.slice(i, j + 1);
      const runLen = run.length;
      const avgVi =
        run.reduce((sum, c) => sum + (c.intensity ?? 0), 0) / runLen;
      const maxSize = Math.max(...run.map((c) => c.maxSizeInBucket));
      const totalPersistence = Math.max(
        ...run.map((c) => c.persistenceMs ?? 0),
      );
      const qualifies =
        runLen >= NATURAL_MATRIX_MIN_RUN_FRAGMENT &&
        runLen <= NATURAL_MATRIX_MAX_FRAGMENT_BUCKETS &&
        avgVi >= NATURAL_MATRIX_MIN_VI_FRAGMENT &&
        avgVi <= NATURAL_MATRIX_MAX_VI_FRAGMENT &&
        totalPersistence >= NATURAL_MATRIX_MIN_PERSISTENCE_MS &&
        maxSize < MATRIX_V1_SPAN_MIN_SIZE_BTC;

      if (qualifies) {
        const first = run[0]!;
        const last = run[run.length - 1]!;
        const peakVi = Math.max(...run.map((c) => c.intensity ?? 0));
        const peakContinuity = Math.max(
          ...run.map((c) => c.visualContinuityScore ?? 0),
        );
        fragments.push({
          ...first,
          intensity: peakVi,
          maxSizeInBucket: maxSize,
          endTimeBucket: last.timeBucket + BOOKMAP_ENGINE_BUCKET_MS,
          continuityRunLength: runLen,
          runStartTimeBucket: first.timeBucket,
          cellsInRun: runLen,
          isMiniFragment: true,
          isGranularMatrixCell: true,
          liquidityLifeStage:
            runLen >= 3 ? "persistent" : first.liquidityLifeStage,
          visualContinuityScore: Math.min(1, peakContinuity + runLen * 0.08),
          visualRefillScore: Math.max(
            ...run.map((c) => c.visualRefillScore ?? 0),
          ),
        });
      } else {
        singles.push(...run);
      }
      i = j + 1;
    }
  }

  return [...singles, ...fragments];
}

function applyNaturalMatrixVisualState(
  cells: PreparedEngineTextureCell[],
): PreparedEngineTextureCell[] {
  if (!BOOKMAP_NATURAL_MATRIX_LOGIC_V1) return cells;

  const withRuns = computeGranularPriceRuns(cells);
  const byLevel = new Map<string, PreparedEngineTextureCell[]>();
  for (const cell of withRuns) {
    const key = granularPriceLevelKey(cell);
    const bucket = byLevel.get(key);
    if (bucket) bucket.push(cell);
    else byLevel.set(key, [cell]);
  }

  const enriched: PreparedEngineTextureCell[] = [];
  for (const group of byLevel.values()) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);
    for (let i = 0; i < group.length; i++) {
      const derived = deriveNaturalMatrixVisualFields(
        group[i]!,
        i > 0 ? group[i - 1]! : null,
        i < group.length - 1 ? group[i + 1]! : null,
      );
      enriched.push({ ...group[i]!, ...derived });
    }
  }

  return buildMiniHistoricalFragments(enriched);
}

function enrichSpanCellsWithNaturalState(
  cells: PreparedEngineTextureCell[],
): PreparedEngineTextureCell[] {
  if (!BOOKMAP_NATURAL_MATRIX_LOGIC_V1) return cells;
  return cells.map((cell) => {
    const derived = deriveNaturalMatrixVisualFields(cell, null, null);
    return {
      ...cell,
      ...derived,
      liquidityLifeStage:
        isHorizontalSpanCandidate(cell) ? "wall_candidate" : derived.liquidityLifeStage,
      visualContinuityScore: Math.max(
        derived.visualContinuityScore ?? 0,
        Math.min(1, (cell.continuityRunLength ?? 1) * 0.15),
      ),
    };
  });
}

export type PrepareMatrixDiagStats = {
  inputCells: number;
  outputTextureCells: number;
  outputSpans: number;
  mergedSpans: number;
  bridgeMergedSpans: number;
  granularMatrixCells: number;
  horizontalSpanCells: number;
  weakInput: number;
  weakOutput: number;
  mediumInput: number;
  mediumOutput: number;
  strongInput: number;
  strongOutput: number;
  capHit: boolean;
  capLimit: number;
  removedByCap: number;
  removedWeak: number;
  removedMedium: number;
  removedStrong: number;
  avgSpanDurationSec: number;
  maxSpanDurationSec: number;
  avgRunLength: number;
  maxRunLength: number;
  timestamp: number;
};

let lastPrepareMatrixDiag: PrepareMatrixDiagStats = {
  inputCells: 0,
  outputTextureCells: 0,
  outputSpans: 0,
  mergedSpans: 0,
  bridgeMergedSpans: 0,
  granularMatrixCells: 0,
  horizontalSpanCells: 0,
  weakInput: 0,
  weakOutput: 0,
  mediumInput: 0,
  mediumOutput: 0,
  strongInput: 0,
  strongOutput: 0,
  capHit: false,
  capLimit: 0,
  removedByCap: 0,
  removedWeak: 0,
  removedMedium: 0,
  removedStrong: 0,
  avgSpanDurationSec: 0,
  maxSpanDurationSec: 0,
  avgRunLength: 0,
  maxRunLength: 0,
  timestamp: 0,
};

let lastPrepareMatrixLogMs = 0;

export function getPrepareMatrixDiagStats(): PrepareMatrixDiagStats {
  return lastPrepareMatrixDiag;
}

function countMatrixTiers(cells: PreparedEngineTextureCell[]): {
  weak: number;
  medium: number;
  strong: number;
} {
  let weak = 0;
  let medium = 0;
  let strong = 0;
  for (const cell of cells) {
    const tier = classifyMatrixTierByIntensity(
      cell.intensity ?? 0,
      cell.maxSizeInBucket,
    );
    if (tier === "weak") weak += 1;
    else if (tier === "medium") medium += 1;
    else strong += 1;
  }
  return { weak, medium, strong };
}

function countRemovedTiers(
  before: PreparedEngineTextureCell[],
  after: PreparedEngineTextureCell[],
): { weak: number; medium: number; strong: number } {
  const afterKeys = new Set(
    after.map((c) => `${c.timeBucket}:${c.side}:${c.price}:${c.endTimeBucket ?? 0}`),
  );
  let weak = 0;
  let medium = 0;
  let strong = 0;
  for (const cell of before) {
    const key = `${cell.timeBucket}:${cell.side}:${cell.price}:${cell.endTimeBucket ?? 0}`;
    if (afterKeys.has(key)) continue;
    const tier = classifyMatrixTierByIntensity(
      cell.intensity ?? 0,
      cell.maxSizeInBucket,
    );
    if (tier === "weak") weak += 1;
    else if (tier === "medium") medium += 1;
    else strong += 1;
  }
  return { weak, medium, strong };
}

function recordPrepareMatrixDiag(
  visible: PreparedEngineTextureCell[],
  preCap: PreparedEngineTextureCell[],
  postCap: PreparedEngineTextureCell[],
  opts: {
    mergedSpanCount: number;
    bridgeMergedSpanCount: number;
    granularCount: number;
    horizontalSpanCount: number;
    capHit: boolean;
    capLimit: number;
  },
): void {
  const inputTiers = countMatrixTiers(visible);
  const outputTiers = countMatrixTiers(postCap);
  const removedTiers = countRemovedTiers(preCap, postCap);
  const runLengths = postCap.map((c) => c.continuityRunLength ?? 1);
  const spanDurations = postCap
    .filter((c) => (c.continuityRunLength ?? 1) > 1 || c.endTimeBucket != null)
    .map(
      (c) =>
        ((c.endTimeBucket ?? c.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS) -
          c.timeBucket) /
        1000,
    );
  const avgRun =
    runLengths.length > 0
      ? runLengths.reduce((a, b) => a + b, 0) / runLengths.length
      : 0;
  lastPrepareMatrixDiag = {
    inputCells: visible.length,
    outputTextureCells: postCap.length,
    outputSpans: postCap.length,
    mergedSpans: opts.mergedSpanCount,
    bridgeMergedSpans: opts.bridgeMergedSpanCount,
    granularMatrixCells: opts.granularCount,
    horizontalSpanCells: opts.horizontalSpanCount,
    weakInput: inputTiers.weak,
    weakOutput: outputTiers.weak,
    mediumInput: inputTiers.medium,
    mediumOutput: outputTiers.medium,
    strongInput: inputTiers.strong,
    strongOutput: outputTiers.strong,
    capHit: opts.capHit,
    capLimit: opts.capLimit,
    removedByCap: Math.max(0, preCap.length - postCap.length),
    removedWeak: removedTiers.weak,
    removedMedium: removedTiers.medium,
    removedStrong: removedTiers.strong,
    avgSpanDurationSec:
      spanDurations.length > 0
        ? Number(
            (
              spanDurations.reduce((a, b) => a + b, 0) / spanDurations.length
            ).toFixed(2),
          )
        : 0,
    maxSpanDurationSec:
      spanDurations.length > 0 ? Number(Math.max(...spanDurations).toFixed(2)) : 0,
    avgRunLength: Number(avgRun.toFixed(2)),
    maxRunLength: runLengths.length ? Math.max(...runLengths) : 0,
    timestamp: Date.now(),
  };

  if (import.meta.env.DEV && BOOKMAP_MATRIX_AUDIT_DIAG) {
    const now = Date.now();
    if (now - lastPrepareMatrixLogMs >= 2_000) {
      lastPrepareMatrixLogMs = now;
      console.debug("[BOOKMAP_PREPARE_MATRIX_DIAG]", {
        inputCells: lastPrepareMatrixDiag.inputCells,
        outputTextureCells: lastPrepareMatrixDiag.outputTextureCells,
        outputSpans: lastPrepareMatrixDiag.outputSpans,
        mergedSpans: lastPrepareMatrixDiag.mergedSpans,
        bridgeMergedSpans: lastPrepareMatrixDiag.bridgeMergedSpans,
        granularMatrixCells: lastPrepareMatrixDiag.granularMatrixCells,
        horizontalSpanCells: lastPrepareMatrixDiag.horizontalSpanCells,
        weakInput: lastPrepareMatrixDiag.weakInput,
        weakOutput: lastPrepareMatrixDiag.weakOutput,
        mediumInput: lastPrepareMatrixDiag.mediumInput,
        mediumOutput: lastPrepareMatrixDiag.mediumOutput,
        strongInput: lastPrepareMatrixDiag.strongInput,
        strongOutput: lastPrepareMatrixDiag.strongOutput,
        capHit: lastPrepareMatrixDiag.capHit,
        capLimit: lastPrepareMatrixDiag.capLimit,
        removedByCap: lastPrepareMatrixDiag.removedByCap,
        removedWeak: lastPrepareMatrixDiag.removedWeak,
        removedMedium: lastPrepareMatrixDiag.removedMedium,
        removedStrong: lastPrepareMatrixDiag.removedStrong,
        avgSpanDurationSec: lastPrepareMatrixDiag.avgSpanDurationSec,
        maxSpanDurationSec: lastPrepareMatrixDiag.maxSpanDurationSec,
        avgRunLength: lastPrepareMatrixDiag.avgRunLength,
        maxRunLength: lastPrepareMatrixDiag.maxRunLength,
        timestamp: now,
      });
    }
  }
}

function prioritizeMatrixTextureCells(
  granular: PreparedEngineTextureCell[],
  spans: PreparedEngineTextureCell[],
  midPrice: number | null | undefined,
  timeMax: number,
  maxCells: number,
): { cells: PreparedEngineTextureCell[]; capHit: boolean } {
  const granularBudget = Math.max(
    128,
    Math.floor(maxCells * MATRIX_V1_GRANULAR_CAP_PCT),
  );
  const spanBudget = Math.max(64, maxCells - granularBudget);
  const cappedGranular = prioritizeAndCapTextureCells(
    granular,
    midPrice,
    timeMax,
    granularBudget,
  );
  const cappedSpans = prioritizeAndCapTextureCells(
    spans,
    midPrice,
    timeMax,
    spanBudget,
  );
  return {
    cells: [...cappedGranular.cells, ...cappedSpans.cells],
    capHit: cappedGranular.capHit || cappedSpans.capHit,
  };
}

function applyHorizontalSpanPreparePass(
  cells: PreparedEngineTextureCell[],
  midPrice: number | null | undefined,
  minPrice: number,
  maxPrice: number,
): PreparedEngineTextureCell[] {
  if (
    !BOOKMAP_HORIZONTAL_PERSISTENCE_V2 ||
    minPrice == null ||
    maxPrice == null ||
    maxPrice <= minPrice
  ) {
    return cells;
  }
  let mergedCells = mergeAdjacentPriceTextureSpansV2(
    cells,
    H_PERSIST_V2_PRICE_BRIDGE_USD,
    resolveEffectiveTextureMergeGapMs(),
  );
  mergedCells = applyHorizontalPersistenceV2PreparePass(
    mergedCells,
    midPrice,
    minPrice,
    maxPrice,
  );
  if (BOOKMAP_HEATMAP_DEPTH_PASS_V2) {
    mergedCells = applyHeatmapDepthPassV2(
      mergedCells,
      midPrice,
      minPrice,
      maxPrice,
    );
  }
  return mergedCells;
}

function prepareTextureCells(
  cells: PreparedEngineTextureCell[],
  visualScale: AdaptiveVisualScale,
  midPrice: number | null | undefined,
  timeMax: number,
  maxCells: number,
  viewportMaxSize?: number,
  minPrice?: number,
  maxPrice?: number,
): {
  cells: PreparedEngineTextureCell[];
  filteredByIntensity: number;
  capHit: boolean;
  cellsWithEndTime?: number;
  cellsUsingSyntheticEndTime?: number;
} {
  const maxSize = Math.max(viewportMaxSize ?? 10, 1);
  const scored = cells.map((cell) => {
    const kind = resolveTextureSourceKindForPrepared(cell);
    const sizeIntensity = mapTextureSizeToVisualIntensity(
      cell.maxSizeInBucket,
      visualScale,
    );

    if (kind === "lifecycle" && cell.lifecycleHistorical) {
      const lifecycleIntensity = Math.max(
        cell.intensity ?? 0,
        sizeIntensity * 0.55,
      );
      const clampedLifecycle = clampBookmapLikeRenderIntensity({
        intensity: lifecycleIntensity,
        sourceKind: "lifecycle",
        lifecycleTier: cell.lifecycleTextureTier,
        isStructuralWall: cell.lifecycleWall && cell.maxSizeInBucket >= WALL_STRUCTURAL_BTC,
        isMajorWall: cell.maxSizeInBucket >= WALL_MAJOR_BTC,
      });
      return {
        ...cell,
        textureSourceKind: "lifecycle" as const,
        intensity: clampedLifecycle,
        historicalRenderIntensity: Math.max(
          cell.historicalRenderIntensity ?? 0,
          cell.intensity ?? 0,
          clampedLifecycle,
        ),
        historicalRenderAlphaFloor: Math.max(
          cell.historicalRenderAlphaFloor ?? 0,
          (cell.intensity ?? clampedLifecycle) * 0.45,
        ),
      };
    }

    const pct =
      midPrice != null && midPrice > 0
        ? (Math.abs(cell.price - midPrice) / midPrice) * 100
        : 50;
    const tier = classifyPassiveBaseTier(cell.maxSizeInBucket, pct);
    let baseIntensity = computeBaseVisualIntensity({
      sizeBtc: cell.maxSizeInBucket,
      price: cell.price,
      midPrice,
      localRankScore: cell.localRankScore,
      persistenceMs: cell.persistenceMs,
      viewportMaxSize: maxSize,
      tier,
    });
    const localRank = Math.min(1, cell.maxSizeInBucket / maxSize);
    baseIntensity = clampBookmapLikeRenderIntensity({
      intensity: baseIntensity,
      sourceKind: kind === "wall" ? "wall" : "base",
      tier,
      localRankScore: localRank,
      absoluteSizeScore: localRank,
      topPercentile: localRank >= 0.95,
    });
    let baseAlpha = baseTextureAlphaForIntensity(baseIntensity, tier);
    if (
      BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE &&
      pct <= 0.35 &&
      passesNearTickPassiveMistRule(cell.maxSizeInBucket, cell.price, midPrice)
    ) {
      baseAlpha = Math.max(
        baseAlpha,
        nearTickPassiveMistAlpha(cell.price, midPrice, cell.maxSizeInBucket),
      );
    }
    return {
      ...cell,
      textureSourceKind: kind === "wall" ? ("wall" as const) : ("base" as const),
      intensity: baseIntensity,
      dataIntensity: sizeIntensity,
      historicalRenderIntensity: baseIntensity,
      historicalRenderAlphaFloor: baseAlpha,
    };
  });

  const minRender =
    scored.some((c) => resolveTextureSourceKindForPrepared(c) === "base")
      ? BOOKMAP_BASE_TEXTURE_MIN_RENDER_INTENSITY
      : BOOKMAP_TEXTURE_MIN_RENDER_INTENSITY;

  const visible = scored.filter((c) => c.intensity >= minRender);
  const filteredByIntensity = scored.length - visible.length;
  const mergeGapMs = resolveEffectiveTextureMergeGapMs();

  if (BOOKMAP_MATRIX_TEXTURE_MODE_V1) {
    const granularInput = visible.filter((c) => !isHorizontalSpanCandidate(c));
    const spanInput = visible.filter((c) => isHorizontalSpanCandidate(c));
    let granularCells = granularInput.map(toGranularMatrixCell);
    if (
      BOOKMAP_HEATMAP_DEPTH_PASS_V2 &&
      minPrice != null &&
      maxPrice != null &&
      maxPrice > minPrice
    ) {
      granularCells = applyHeatmapDepthPassV2(
        granularCells,
        midPrice,
        minPrice,
        maxPrice,
      );
    }
    granularCells = applyNaturalMatrixVisualState(granularCells);
    const merged = mergeTextureCellsToTimeSpans(
      spanInput,
      mergeGapMs,
      BOOKMAP_TEXTURE_SAMPLER_MS,
      timeMax,
    );
    let spanCells = merged.cells;
    const bridgeBefore = spanCells.length;
    if (
      minPrice != null &&
      maxPrice != null &&
      maxPrice > minPrice &&
      BOOKMAP_HORIZONTAL_PERSISTENCE_V2
    ) {
      spanCells = applyHorizontalSpanPreparePass(
        spanCells,
        midPrice,
        minPrice,
        maxPrice,
      );
    } else if (BOOKMAP_HEATMAP_DEPTH_PASS_V2) {
      spanCells = applyHeatmapDepthPassV2(
        spanCells,
        midPrice,
        minPrice ?? 0,
        maxPrice ?? 0,
      );
    }
    spanCells = enrichSpanCellsWithNaturalState(spanCells);
    const preCapCombined = [...granularCells, ...spanCells];
    const capped = prioritizeMatrixTextureCells(
      granularCells,
      spanCells,
      midPrice,
      timeMax,
      maxCells,
    );
    recordPrepareMatrixDiag(visible, preCapCombined, capped.cells, {
      mergedSpanCount: merged.cells.length,
      bridgeMergedSpanCount: Math.max(0, bridgeBefore - spanCells.length),
      granularCount: capped.cells.filter((c) => c.isGranularMatrixCell === true)
        .length,
      horizontalSpanCount: capped.cells.filter(
        (c) => c.isGranularMatrixCell !== true,
      ).length,
      capHit: capped.capHit,
      capLimit: maxCells,
    });
    return {
      cells: capped.cells,
      filteredByIntensity,
      capHit: capped.capHit,
      cellsWithEndTime: merged.cellsWithEndTime,
      cellsUsingSyntheticEndTime: merged.cellsUsingSyntheticEndTime,
      matrixGranularCellCount: granularCells.length,
      horizontalSpanCellCount: spanCells.length,
    };
  }

  const merged = mergeTextureCellsToTimeSpans(
    visible,
    mergeGapMs,
    BOOKMAP_TEXTURE_SAMPLER_MS,
    timeMax,
  );
  let mergedCells = merged.cells;
  if (
    BOOKMAP_HORIZONTAL_PERSISTENCE_V2 &&
    minPrice != null &&
    maxPrice != null &&
    maxPrice > minPrice
  ) {
    lastHorizontalPersistenceV2Stats = {
      enabled: true,
      inputCellCount: visible.length,
      afterTimeMergeCount: merged.cells.length,
      afterPriceBridgeCount: 0,
      boostedCellCount: 0,
      avgContinuityRunLength: 0,
      maxContinuityRunLength: 0,
      mergeGapMs,
    };
    mergedCells = mergeAdjacentPriceTextureSpansV2(
      mergedCells,
      H_PERSIST_V2_PRICE_BRIDGE_USD,
      mergeGapMs,
    );
    lastHorizontalPersistenceV2Stats.afterPriceBridgeCount = mergedCells.length;
    mergedCells = applyHorizontalPersistenceV2PreparePass(
      mergedCells,
      midPrice,
      minPrice,
      maxPrice,
    );
    if (BOOKMAP_HEATMAP_DEPTH_PASS_V2) {
      mergedCells = applyHeatmapDepthPassV2(
        mergedCells,
        midPrice,
        minPrice,
        maxPrice,
      );
    }
  } else {
    lastHorizontalPersistenceV2Stats.enabled = false;
  }
  const capped = prioritizeAndCapTextureCells(
    mergedCells,
    midPrice,
    timeMax,
    maxCells,
  );
  recordPrepareMatrixDiag(visible, mergedCells, capped.cells, {
    mergedSpanCount: merged.cells.length,
    bridgeMergedSpanCount: Math.max(
      0,
      lastHorizontalPersistenceV2Stats.afterTimeMergeCount -
        lastHorizontalPersistenceV2Stats.afterPriceBridgeCount,
    ),
    granularCount: 0,
    horizontalSpanCount: capped.cells.length,
    capHit: capped.capHit,
    capLimit: maxCells,
  });
  return {
    cells: capped.cells,
    filteredByIntensity,
    capHit: capped.capHit,
    cellsWithEndTime: merged.cellsWithEndTime,
    cellsUsingSyntheticEndTime: merged.cellsUsingSyntheticEndTime,
  };
}

/**
 * P7.4 — assign endTime per side+price level, then merge consecutive runs.
 * Consecutive bucket → bridges to next.timeBucket; run end = lastBucket + samplerMs.
 */
function mergeTextureCellsToTimeSpans(
  cells: PreparedEngineTextureCell[],
  maxGapMs: number,
  samplerMs: number,
  dataEndTime: number,
): {
  cells: PreparedEngineTextureCell[];
  cellsWithEndTime: number;
  cellsUsingSyntheticEndTime: number;
} {
  if (!cells.length) {
    return { cells: [], cellsWithEndTime: 0, cellsUsingSyntheticEndTime: 0 };
  }

  const dataEdge =
    dataEndTime > 0
      ? Math.floor(dataEndTime / BOOKMAP_ENGINE_BUCKET_MS) *
        BOOKMAP_ENGINE_BUCKET_MS
      : Number.POSITIVE_INFINITY;

  const byKey = new Map<string, PreparedEngineTextureCell[]>();
  for (const cell of cells) {
    const key = `${cell.side}:${cell.price}`;
    const group = byKey.get(key) ?? [];
    group.push(cell);
    byKey.set(key, group);
  }

  const merged: PreparedEngineTextureCell[] = [];
  let cellsWithEndTime = 0;
  let cellsUsingSyntheticEndTime = 0;

  const flushRun = (
    runStart: PreparedEngineTextureCell,
    runLast: PreparedEngineTextureCell,
    runMaxSize: number,
    runIntensity: number,
    bridged: boolean,
    sampleCount: number,
  ) => {
    if (
      !bridged &&
      sampleCount < BOOKMAP_TEXTURE_ORPHAN_MIN_SAMPLES &&
      runMaxSize < BOOKMAP_TEXTURE_ORPHAN_MAX_BTC &&
      runMaxSize < BOOKMAP_BASE_TEXTURE_NEAR035_MIN_BTC &&
      !runStart.lifecycleHistorical
    ) {
      return;
    }
    const endTimeBucket = Math.min(runLast.timeBucket + samplerMs, dataEdge);
    merged.push({
      ...runStart,
      endTimeBucket,
      maxSizeInBucket: runMaxSize,
      intensity: runIntensity,
      continuityRunLength: sampleCount,
    });
    cellsUsingSyntheticEndTime += 1;
    if (bridged || sampleCount >= BOOKMAP_TEXTURE_ORPHAN_MIN_SAMPLES) {
      cellsWithEndTime += 1;
    }
  };

  for (const group of Array.from(byKey.values())) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);

    let runStart = group[0]!;
    let runLast = group[0]!;
    let runMaxSize = group[0]!.maxSizeInBucket;
    let runIntensity = group[0]!.intensity ?? 0;
    let runBridged = false;
    let runSampleCount = 1;

    for (let i = 1; i < group.length; i += 1) {
      const prev = group[i - 1]!;
      const next = group[i]!;
      const gap = next.timeBucket - prev.timeBucket;
      if (gap <= maxGapMs) {
        runLast = next;
        runMaxSize = Math.max(runMaxSize, next.maxSizeInBucket);
        runIntensity = Math.max(runIntensity, next.intensity ?? 0);
        runBridged = true;
        runSampleCount += 1;
      } else {
        flushRun(
          runStart,
          runLast,
          runMaxSize,
          runIntensity,
          runBridged,
          runSampleCount,
        );
        runStart = next;
        runLast = next;
        runMaxSize = next.maxSizeInBucket;
        runIntensity = next.intensity ?? 0;
        runBridged = false;
        runSampleCount = 1;
      }
    }

    flushRun(
      runStart,
      runLast,
      runMaxSize,
      runIntensity,
      runBridged,
      runSampleCount,
    );
  }

  return { cells: merged, cellsWithEndTime, cellsUsingSyntheticEndTime };
}

export type HorizontalPersistenceV2PrepareStats = {
  enabled: boolean;
  inputCellCount: number;
  afterTimeMergeCount: number;
  afterPriceBridgeCount: number;
  boostedCellCount: number;
  avgContinuityRunLength: number;
  maxContinuityRunLength: number;
  mergeGapMs: number;
};

let lastHorizontalPersistenceV2Stats: HorizontalPersistenceV2PrepareStats = {
  enabled: false,
  inputCellCount: 0,
  afterTimeMergeCount: 0,
  afterPriceBridgeCount: 0,
  boostedCellCount: 0,
  avgContinuityRunLength: 0,
  maxContinuityRunLength: 0,
  mergeGapMs: BOOKMAP_TEXTURE_TIME_MERGE_GAP_MS,
};

export function getHorizontalPersistenceV2PrepareStats(): HorizontalPersistenceV2PrepareStats {
  return lastHorizontalPersistenceV2Stats;
}

export function resolveEffectiveTextureMergeGapMs(): number {
  return BOOKMAP_HORIZONTAL_PERSISTENCE_V2
    ? H_PERSIST_V2_MERGE_GAP_MS
    : BOOKMAP_TEXTURE_TIME_MERGE_GAP_MS;
}

export function resolveEffectiveChunkOverlayAlpha(): number {
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    return V3_CHUNK_OVERLAY_MEDIUM;
  }
  if (BOOKMAP_TEXTURE_CALIBRATION_V2) {
    return TEX_CALIB_V2_CHUNK_OVERLAY_ALPHA;
  }
  return BOOKMAP_HORIZONTAL_PERSISTENCE_V2
    ? H_PERSIST_V2_CHUNK_OVERLAY_ALPHA
    : BOOKMAP_TEXTURE_INTERNAL_CHUNK_OVERLAY_ALPHA;
}

export type TextureCalibrationV2PrepareStats = {
  enabled: boolean;
  depthPassEnabled: boolean;
  inputCellCount: number;
  depthBoostedCount: number;
  nearPriceCount: number;
  weakTextureCount: number;
  avgIntensityBoost: number;
};

let lastTextureCalibrationV2Stats: TextureCalibrationV2PrepareStats = {
  enabled: false,
  depthPassEnabled: false,
  inputCellCount: 0,
  depthBoostedCount: 0,
  nearPriceCount: 0,
  weakTextureCount: 0,
  avgIntensityBoost: 0,
};

export function getTextureCalibrationV2PrepareStats(): TextureCalibrationV2PrepareStats {
  return lastTextureCalibrationV2Stats;
}

function applyHeatmapDepthPassV2(
  cells: PreparedEngineTextureCell[],
  midPrice: number | null | undefined,
  minPrice: number,
  maxPrice: number,
): PreparedEngineTextureCell[] {
  const zoomRegime = resolveZoomRegime(
    computeVisiblePriceRangePct(minPrice, maxPrice),
  );
  const isMacro = zoomRegime === "macro";
  const nearPriceBand = DEPTH_V2_NEAR_PRICE_PCT / 100;
  let depthBoostedCount = 0;
  let nearPriceCount = 0;
  let weakTextureCount = 0;
  let intensityBoostSum = 0;

  const result = cells.map((cell) => {
    let intensity = cell.intensity ?? 0;
    const prevIntensity = intensity;
    let alphaFloor = cell.historicalRenderAlphaFloor ?? 0;

    if (intensity < 0.28) weakTextureCount += 1;

    if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
      const runLen = cell.continuityRunLength ?? 1;
      const persistenceMs = cell.persistenceMs ?? 0;
      if (runLen >= 2 && intensity < 0.52) {
        intensity = Math.min(
          V3_MAX_VISIBILITY_INTENSITY,
          intensity + 0.035 * Math.min(runLen, 6),
        );
      }
      if (persistenceMs >= BOOKMAP_TEXTURE_SAMPLER_MS * 4 && intensity < 0.48) {
        intensity = Math.min(
          V3_MAX_VISIBILITY_INTENSITY,
          intensity + 0.04,
        );
      }
    }

    if (midPrice != null && midPrice > 0) {
      const pctFromMid = Math.abs(cell.price - midPrice) / midPrice;
      const nearPrice = pctFromMid <= nearPriceBand;
      if (nearPrice) {
        nearPriceCount += 1;
        const runLen = cell.continuityRunLength ?? 1;
        const visibilityBoost = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
          ? V3_NEAR_PRICE_VISIBILITY_BOOST
          : DEPTH_V2_NEAR_PRICE_VISIBILITY_BOOST;
        const maxVis = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
          ? V3_MAX_VISIBILITY_INTENSITY
          : DEPTH_V2_MAX_VISIBILITY_INTENSITY;
        if (cell.maxSizeInBucket < WALL_IMPORTANT_BTC) {
          const proximity = 1 - pctFromMid / nearPriceBand;
          let boost = visibilityBoost * proximity;
          if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 && runLen >= 2) {
            boost += 0.03 * Math.min(runLen, 5) * proximity;
          }
          intensity = Math.min(maxVis, intensity + boost);
          const alphaTarget = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
            ? Math.min(0.42, intensity * 0.48 + 0.08 * proximity)
            : Math.min(0.32, intensity * 0.38 + 0.05 * proximity);
          alphaFloor = Math.max(alphaFloor, alphaTarget);
        }
      } else if (
        isMacro &&
        cell.maxSizeInBucket < H_PERSIST_V2_MACRO_NOISE_SIZE_BTC &&
        (cell.continuityRunLength ?? 1) < 2
      ) {
        intensity *= 0.78;
      }
    }

    if (!isMacro && intensity < DEPTH_V2_WEAK_INTENSITY_FLOOR_MICRO) {
      intensity = Math.max(intensity, DEPTH_V2_WEAK_INTENSITY_FLOOR_MICRO);
    } else if (isMacro && intensity < DEPTH_V2_WEAK_INTENSITY_FLOOR_MACRO) {
      intensity = Math.max(intensity, DEPTH_V2_WEAK_INTENSITY_FLOOR_MACRO);
    }

    const boosted = intensity > prevIntensity + 0.001;
    if (boosted) {
      depthBoostedCount += 1;
      intensityBoostSum += intensity - prevIntensity;
    }

    const finalIntensity = Math.max(intensity, cell.historicalRenderIntensity ?? 0);
    return {
      ...cell,
      intensity: finalIntensity,
      historicalRenderIntensity: finalIntensity,
      historicalRenderAlphaFloor: Math.max(alphaFloor, cell.historicalRenderAlphaFloor ?? 0),
    };
  });

  lastTextureCalibrationV2Stats = {
    enabled: BOOKMAP_TEXTURE_CALIBRATION_V2,
    depthPassEnabled: BOOKMAP_HEATMAP_DEPTH_PASS_V2,
    inputCellCount: cells.length,
    depthBoostedCount,
    nearPriceCount,
    weakTextureCount,
    avgIntensityBoost:
      depthBoostedCount > 0
        ? Number((intensityBoostSum / depthBoostedCount).toFixed(4))
        : 0,
  };

  return result;
}

function applyHorizontalPersistenceV2IntensityBoost(
  cell: PreparedEngineTextureCell,
  midPrice: number | null | undefined,
  zoomRegime: BookmapZoomRegime,
): PreparedEngineTextureCell {
  const runLen = Math.max(1, cell.continuityRunLength ?? 1);
  const persistenceMs = Math.max(
    0,
    (cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS) -
      cell.timeBucket,
  );
  let intensity = cell.intensity ?? 0;

  if (runLen >= H_PERSIST_V2_MIN_RUN_FOR_BOOST) {
    const runBoost = Math.min(
      H_PERSIST_V2_MAX_CONTINUITY_BOOST,
      (runLen - H_PERSIST_V2_MIN_RUN_FOR_BOOST + 1) * 0.045,
    );
    intensity = Math.min(0.98, intensity + runBoost);
  }

  if (persistenceMs >= BOOKMAP_TEXTURE_SAMPLER_MS * 3) {
    intensity = Math.min(
      0.98,
      intensity +
        0.05 *
          Math.min(1, persistenceMs / (BOOKMAP_TEXTURE_SAMPLER_MS * 24)),
    );
  }

  if (
    midPrice != null &&
    midPrice > 0 &&
    cell.maxSizeInBucket >= WALL_IMPORTANT_BTC
  ) {
    const pct = (Math.abs(cell.price - midPrice) / midPrice) * 100;
    if (pct <= 1.25) intensity = Math.min(0.98, intensity + 0.07);
    else if (pct <= 2.5) intensity = Math.min(0.96, intensity + 0.04);
  }

  if (
    zoomRegime === "macro" &&
    cell.maxSizeInBucket < H_PERSIST_V2_MACRO_NOISE_SIZE_BTC &&
    runLen < 2
  ) {
    intensity *= 0.82;
  }

  const boosted = Math.max(intensity, cell.historicalRenderIntensity ?? 0);
  return {
    ...cell,
    intensity: boosted,
    persistenceMs,
    historicalRenderIntensity: boosted,
    historicalRenderAlphaFloor: Math.max(
      cell.historicalRenderAlphaFloor ?? 0,
      boosted * 0.42,
    ),
  };
}

/** Bridge adjacent price levels into longer horizontal resting runs. */
function mergeAdjacentPriceTextureSpansV2(
  cells: PreparedEngineTextureCell[],
  maxPriceGapUsd: number,
  maxTimeGapMs: number,
): PreparedEngineTextureCell[] {
  if (!cells.length) return cells;

  const bySide = new Map<"bid" | "ask", PreparedEngineTextureCell[]>();
  for (const cell of cells) {
    const list = bySide.get(cell.side) ?? [];
    list.push(cell);
    bySide.set(cell.side, list);
  }

  const merged: PreparedEngineTextureCell[] = [];

  for (const group of Array.from(bySide.values())) {
    group.sort(
      (a, b) => a.price - b.price || a.timeBucket - b.timeBucket,
    );

    let run = { ...group[0]! };
    let runEnd =
      group[0]!.endTimeBucket ??
      group[0]!.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
    let runSamples = group[0]!.continuityRunLength ?? 1;

    const flush = () => {
      merged.push({
        ...run,
        endTimeBucket: runEnd,
        continuityRunLength: runSamples,
      });
    };

    for (let i = 1; i < group.length; i += 1) {
      const next = group[i]!;
      const nextEnd =
        next.endTimeBucket ?? next.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
      const priceGap = Math.abs(next.price - run.price);
      const timeGap = next.timeBucket - runEnd;
      const minIntensity = Math.min(run.intensity ?? 0, next.intensity ?? 0);
      const minSize = Math.min(run.maxSizeInBucket, next.maxSizeInBucket);
      const canBridge =
        priceGap <= maxPriceGapUsd &&
        timeGap <= maxTimeGapMs &&
        minIntensity >= 0.015 &&
        minSize >= 1.2;

      if (canBridge) {
        const dominant =
          next.maxSizeInBucket > run.maxSizeInBucket ? next : run;
        runEnd = Math.max(runEnd, nextEnd);
        run = {
          ...run,
          price: dominant.price,
          side: run.side,
          maxSizeInBucket: Math.max(run.maxSizeInBucket, next.maxSizeInBucket),
          intensity: Math.max(run.intensity ?? 0, next.intensity ?? 0),
          historicalRenderIntensity: Math.max(
            run.historicalRenderIntensity ?? 0,
            next.historicalRenderIntensity ?? 0,
          ),
          endTimeBucket: runEnd,
          continuityRunLength:
            runSamples + (next.continuityRunLength ?? 1),
        };
        runSamples += next.continuityRunLength ?? 1;
      } else {
        flush();
        run = { ...next };
        runEnd = nextEnd;
        runSamples = next.continuityRunLength ?? 1;
      }
    }
    flush();
  }

  return merged;
}

function applyHorizontalPersistenceV2PreparePass(
  cells: PreparedEngineTextureCell[],
  midPrice: number | null | undefined,
  minPrice: number,
  maxPrice: number,
): PreparedEngineTextureCell[] {
  const zoomRegime = resolveZoomRegime(
    computeVisiblePriceRangePct(minPrice, maxPrice),
  );
  let boostedCount = 0;
  const boosted = cells.map((cell) => {
    const next = applyHorizontalPersistenceV2IntensityBoost(
      cell,
      midPrice,
      zoomRegime,
    );
    if ((next.intensity ?? 0) > (cell.intensity ?? 0) + 0.001) {
      boostedCount += 1;
    }
    return next;
  });
  const runLengths = boosted.map((c) => c.continuityRunLength ?? 1);
  const avgRun =
    runLengths.length > 0
      ? runLengths.reduce((a, b) => a + b, 0) / runLengths.length
      : 0;
  lastHorizontalPersistenceV2Stats = {
    ...lastHorizontalPersistenceV2Stats,
    boostedCellCount: boostedCount,
    avgContinuityRunLength: Number(avgRun.toFixed(2)),
    maxContinuityRunLength: runLengths.length ? Math.max(...runLengths) : 0,
  };
  return boosted;
}

function textureSizeBounds(cells: PreparedEngineTextureCell[]): {
  min: number;
  max: number;
} {
  if (!cells.length) return { min: 0, max: 0 };
  let min = Infinity;
  let max = 0;
  for (const cell of cells) {
    if (cell.maxSizeInBucket < min) min = cell.maxSizeInBucket;
    if (cell.maxSizeInBucket > max) max = cell.maxSizeInBucket;
  }
  return {
    min: min === Infinity ? 0 : min,
    max,
  };
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
  options?: PrepareEngineRenderOptions,
): PreparedEngineRenderData | null {
  const priceSpan = maxPrice - minPrice;
  const restingConfig = resolveRestingLiquidityWriteConfig(
    verticalCompressionMode,
    priceSpan,
  );
  const bookLevels = resolveLiveDomBookLevels(
    state,
    options?.liveDomBook,
    options?.liveDomTimestamp,
  );
  const staleBookLevels = [...state.bids, ...state.asks].filter(
    (l) => l.stale || l.size <= 0,
  );
  const dataEndTime = state.timestamp || Date.now();
  const materializedHeatmapCells = materializeRestingLiquidityHeatmapCells({
    serverCells: state.heatmapCells,
    bookLevels,
    staleBookLevels,
    midPrice: spotPrice ?? null,
    minPrice,
    maxPrice,
    dataEndTime,
    config: restingConfig,
    verticalMode: verticalCompressionMode,
    bestBid: state.bids.find((b) => b.size > 0 && !b.stale)?.price ?? null,
    bestAsk: state.asks.find((a) => a.size > 0 && !a.stale)?.price ?? null,
    structuralWalls: state.structuralWalls,
    majorWalls: state.majorWalls,
  });

  const rawHeatmapCellCount = materializedHeatmapCells.length;
  const rawInRange = materializedHeatmapCells.filter(
    (c) => c.price >= minPrice && c.price <= maxPrice && c.maxSizeInBucket > 0,
  );
  const cellsFilteredByPrice = rawHeatmapCellCount - rawInRange.length;

  const passiveBase = selectPassiveBaseTextureSources({
    cells: rawInRange,
    midPrice: spotPrice ?? null,
    minPrice,
    maxPrice,
    verticalMode: verticalCompressionMode,
    bookLevels,
    dataEndTime,
    priceBucketUsd: restingConfig.priceBucketUsd,
  });

  const lifecycleTextureSource = rawInRange.filter((c) => {
    const meta = getLifecycleCellMeta(c.timeBucket, c.side, c.price);
    return meta != null;
  });

  const textureSourceMap = new Map<string, HeatmapCell>();
  for (const cell of passiveBase.baseCells) {
    textureSourceMap.set(
      `${cell.timeBucket}:${cell.side}:${cell.price}`,
      cell,
    );
  }
  for (const cell of passiveBase.degradedWallBaseCells) {
    const key = `${cell.timeBucket}:${cell.side}:${cell.price}`;
    if (!textureSourceMap.has(key)) textureSourceMap.set(key, cell);
  }
  for (const cell of lifecycleTextureSource) {
    textureSourceMap.set(
      `${cell.timeBucket}:${cell.side}:${cell.price}`,
      cell,
    );
  }
  const textureSource = Array.from(textureSourceMap.values());

  const wallBandSource = passiveBase.trueWallCells;
  const usedTextureKeys = new Set<string>();
  for (const c of textureSource) {
    usedTextureKeys.add(`${c.timeBucket}:${c.side}:${c.price}`);
  }
  for (const c of wallBandSource) {
    usedTextureKeys.add(`${c.timeBucket}:${c.side}:${c.price}`);
  }
  const cellsFilteredBySize = rawInRange.filter(
    (c) => !usedTextureKeys.has(`${c.timeBucket}:${c.side}:${c.price}`),
  ).length;

  const textureAgg = aggregateHeatmapCellsByBucket(
    textureSource,
    BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
    minPrice,
    maxPrice,
  );
  const wallCellsInRange = aggregateHeatmapCellsByBucket(
    wallBandSource,
    heatmapBucketSize,
    minPrice,
    maxPrice,
  );

  if (
    !textureAgg.length &&
    !wallCellsInRange.length &&
    !state.importantWalls.length &&
    !state.structuralWalls.length &&
    !state.majorWalls.length &&
    !bookLevels.some((l) => l.size > 0)
  ) {
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
  const protectedPrices = new Set(wallPrices);

  const preparedWallCells: PreparedEngineCell[] = wallCellsInRange.map((cell) =>
    cellToPrepared(cell),
  );

  const cappedWallCells = capCells(preparedWallCells, protectedPrices, maxCells);

  const timeMax = state.timestamp || Date.now();

  const preparedTextureRaw: PreparedEngineTextureCell[] = textureAgg.map((cell) =>
    cellToPrepared(cell),
  );
  const viewportMaxSize = Math.max(
    1,
    ...preparedTextureRaw.map((c) => c.maxSizeInBucket),
    ...bookLevels.map((l) => l.size),
    WALL_IMPORTANT_BTC,
  );
  const bucketTimes = [
    ...cappedWallCells.map((c) => c.timeBucket),
    ...preparedTextureRaw.map((c) => c.timeBucket),
  ];
  const timeMin =
    bucketTimes.length > 0
      ? Math.min(...bucketTimes)
      : timeMax - 15 * 60 * 1000;

  const {
    bands,
    mergedBands,
    stats,
    visualScale,
  } = prepareHeatmapBands({
    cells: cappedWallCells,
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

  const texturePrepared = BOOKMAP_TEXTURE_MODE_ENABLED
    ? prepareTextureCells(
        preparedTextureRaw,
        visualScale,
        spotPrice,
        timeMax,
        BOOKMAP_TEXTURE_MAX_PREPARE_CELLS,
        viewportMaxSize,
        minPrice,
        maxPrice,
      )
    : {
        cells: [] as PreparedEngineTextureCell[],
        filteredByIntensity: 0,
        capHit: false,
        cellsWithEndTime: 0,
        cellsUsingSyntheticEndTime: 0,
      };
  const textureCells = clampPulledRestingSpanEnds(
    texturePrepared.cells,
    staleBookLevels,
    BOOKMAP_TEXTURE_SAMPLER_MS,
  );
  const lifecycleMerged = textureCells.filter((c) => c.lifecycleHistorical).length;
  const lifecycleSpanDurations = textureCells
    .filter((c) => c.lifecycleHistorical && c.endTimeBucket != null)
    .map((c) => (c.endTimeBucket ?? c.timeBucket) - c.timeBucket);
  recordLifecycleTexturePrepareStats({
    mergedCount: lifecycleMerged,
    renderedCount: lifecycleMerged,
    spanDurationsMs: lifecycleSpanDurations,
  });
  const textureBounds = textureSizeBounds(textureCells);
  const viewportPriceBucketCount = Math.max(
    1,
    Math.ceil(priceSpan / Math.max(1, BOOKMAP_TEXTURE_PRICE_BUCKET_USD)),
  );
  recordPassiveBaseTexturePrepareStats({
    preparedCells: textureCells,
    wallBandCellCount: wallBandSource.length,
    viewportPriceBucketCount,
    midPrice: spotPrice ?? null,
  });
  resetBookmapVisualForceFrameStats(viewportPriceBucketCount);
  setNearTickPassiveMistCoverage(viewportPriceBucketCount);
  finalizeColorHierarchyStats();
  const wallBandCount = bands.filter(
    (b) => b.maxSize >= BOOKMAP_TEXTURE_WALL_BAND_MIN_BTC || b.tier !== "low",
  ).length;
  const mergeCompressionRatio =
    stats.renderedBandCount > 0
      ? rawInRange.length / stats.renderedBandCount
      : rawInRange.length;

  const liveProjection = prepareLiveBookProjection(
    state,
    minPrice,
    maxPrice,
    spotPrice,
    visualScale,
    verticalCompressionMode,
    options?.liveDomBook,
    options?.liveDomTimestamp,
  );
  const historicalSurface = updateHistoricalLiquiditySurface({
    state,
    levels: bookLevels,
    sourceKey: `${state.exchange}:${state.market ?? "spot"}:${state.symbol}`,
    priceBucketSize: Math.max(1, heatmapBucketSize || domBucketSize || 1),
    visibleStartTime: dataEndTime - BOOKMAP_HISTORY_RETENTION_MS,
    visibleEndTime: dataEndTime + BOOKMAP_ENGINE_BUCKET_MS,
    minPrice,
    maxPrice,
    midPrice: spotPrice ?? null,
  });

  const bestBid =
    state.bids.find((b) => b.size > 0 && !b.stale)?.price ?? null;
  const bestAsk =
    state.asks.find((a) => a.size > 0 && !a.stale)?.price ?? null;
  const wallAnchorLayer = buildAnchoredWallLayer({
    textureCells,
    walls,
    bands,
    liveProjectionLevels: liveProjection.levels,
    activeDomLevels: liveProjection.activeDomBands,
    bookLevels,
    minPrice,
    maxPrice,
    midPrice: spotPrice ?? null,
    dataEndTime: timeMax,
    timeMin,
    bestBid,
    bestAsk,
    viewportMaxSize,
  });

  const textureStats: BookmapTexturePrepareStats = {
    rawHeatmapCellCount,
    preparedCellCount: preparedTextureRaw.length + cappedWallCells.length,
    preparedTextureCellCount: textureCells.length,
    wallBandCount,
    cellsFilteredBySize,
    cellsFilteredByPrice,
    cellsFilteredByTime: 0,
    cellsFilteredByIntensity: texturePrepared.filteredByIntensity,
    texturePriceBucketSize: BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
    timeBucketMs: BOOKMAP_ENGINE_BUCKET_MS,
    minRenderedSizeBtc: textureBounds.min,
    maxRenderedSizeBtc: textureBounds.max,
    mergeCompressionRatio,
    textureModeEnabled: BOOKMAP_TEXTURE_MODE_ENABLED,
    texturePrepareCapHit: texturePrepared.capHit,
    textureDrawCapHit: false,
    textureSamplerMs: BOOKMAP_TEXTURE_SAMPLER_MS,
    textureContinuousMode: BOOKMAP_TEXTURE_CONTINUOUS_MODE,
    cellsWithEndTime: texturePrepared.cellsWithEndTime,
    cellsUsingSyntheticEndTime: texturePrepared.cellsUsingSyntheticEndTime,
    matrixGranularCellCount: texturePrepared.matrixGranularCellCount,
    horizontalSpanCellCount: texturePrepared.horizontalSpanCellCount,
  };

  return {
    bands,
    mergedBands,
    cells: cappedWallCells,
    textureCells,
    textureStats,
    textureModeEnabled: BOOKMAP_TEXTURE_MODE_ENABLED,
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
    liveProjectionLevels: liveProjection.levels,
    liveProjectionStats: liveProjection.stats,
    activeDomBands: liveProjection.activeDomBands,
    liveDomSelection: liveProjection.selection,
    restingLiquidityRawCells: materializedHeatmapCells,
    anchoredWalls: wallAnchorLayer.walls,
    wallAnchoringDiag: wallAnchorLayer.wallAnchoringDiag,
    macroDomCoverageDiag: wallAnchorLayer.macroDomCoverageDiag,
    currentDomBookLevels: bookLevels,
    historicalSurfaceCells: historicalSurface.cells,
    activeRestingLiquidityLevels: historicalSurface.activeLevels,
    historicalSurfaceDiag: historicalSurface.diag,
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
    liveProjectionLevels: data.liveProjectionLevels,
    liveProjectionStats: data.liveProjectionStats,
    textureCells: data.textureCells,
    textureStats: {
      ...data.textureStats,
      mergeCompressionRatio:
        stats.renderedBandCount > 0
          ? data.textureStats.rawHeatmapCellCount / stats.renderedBandCount
          : data.textureStats.rawHeatmapCellCount,
    },
    microScalpVisual: data.microScalpVisual,
  };
}

export function applyMicroScalpTextureCalibration(
  data: PreparedEngineRenderData,
  opts: {
    verticalMode: string;
    visiblePriceRange: number;
    pxPerSample?: number;
    pxPerPriceBucket?: number;
    spotPrice?: number | null;
    minPrice: number;
    maxPrice: number;
    visibleStartTime: number;
    visibleEndTime: number;
  },
): PreparedEngineRenderData {
  const scalpCtx: MicroScalpContext = {
    verticalMode: opts.verticalMode,
    visiblePriceRange: opts.visiblePriceRange,
    pxPerSample: opts.pxPerSample,
    pxPerPriceBucket: opts.pxPerPriceBucket,
  };
  const microScalpMode = isMicroScalpMode(scalpCtx);
  const microVisualHierarchyActive = isMicroVisualHierarchyMode(scalpCtx);
  const microScalpVisual: MicroScalpVisualContext = {
    microScalpMode,
    microVisualHierarchyActive,
    verticalMode: opts.verticalMode,
    visiblePriceRange: opts.visiblePriceRange,
    pxPerSample: opts.pxPerSample ?? 0,
    pxPerPriceBucket: opts.pxPerPriceBucket ?? 0,
  };

  if (!microVisualHierarchyActive) {
    return { ...data, microScalpVisual };
  }

  const spot = opts.spotPrice;
  const sortedSizes = data.textureCells
    .map((c) => c.maxSizeInBucket)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);

  const textureCells = data.textureCells.map((cell) => {
    const dataIntensity = cell.intensity ?? 0;
    const sizeBtc = cell.maxSizeInBucket;
    const persistenceMs = Math.max(
      0,
      (cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS) -
        cell.timeBucket,
    );
    const runLength = Math.max(
      1,
      cell.continuityRunLength ??
        Math.round(persistenceMs / BOOKMAP_TEXTURE_SAMPLER_MS),
    );
    const continuityScore = microContinuityScore(runLength);
    const persistenceScore = microPersistenceScore(persistenceMs);

    let proximityScore = 0.14;
    if (spot != null && spot > 0) {
      proximityScore = microProximityScore(Math.abs(cell.price - spot) / spot);
    }

    const localRankScore = computeLocalRankScore(sizeBtc, sortedSizes);
    const microScalpRenderIntensity = calibrateMicroScalpRenderIntensity({
      dataIntensity,
      sizeBtc,
      localRankScore,
      proximityScore,
      persistenceScore,
      continuityScore,
    });

    return {
      ...cell,
      dataIntensity,
      microScalpRenderIntensity,
      localRankScore,
      persistenceMs,
      continuityRunLength: runLength,
    };
  });

  return { ...data, textureCells, microScalpVisual };
}

export type HistoricalColorRetentionStats = {
  historicalTextureCellCount: number;
  visualCacheSize: number;
  cellsWithFrozenRenderIntensity: number;
  cellsWithoutFrozenRenderIntensity: number;
  avgFrozenRenderIntensity: number;
  avgCurrentRenderIntensity: number;
  avgFinalRenderIntensity: number;
  avgIntensityDrift: number;
  maxIntensityDrift: number;
  downgradedHistoricalCellsPrevented: number;
  upgradedHistoricalCells: number;
  cellsStuckBelow025: number;
  activeCellsUsingFrozenLowIntensity: number;
  historicalColorRetentionOk: boolean;
  historicalColorTooMuted: boolean;
  alphaFrozenAsFinalDetected: boolean;
  recalculatingHistoricalColors: boolean;
  microScalpMode: boolean;
};

export type HistoricalColorLockAudit = {
  historicalTextureCellCount: number;
  visualCacheSize: number;
  firstLockBelowMediumCount: number;
  cachedIntensityAvg: number;
  currentCandidateIntensityAvg: number;
  upgradedHistoricalCells: number;
  downgradedHistoricalCellsPrevented: number;
  alphaFrozenCellCount: number;
  alphaFinalAvg: number;
  intensityFinalAvg: number;
  cellsStuckBelow025: number;
  cellsEligibleForUpgrade: number;
  cellsDeniedUpgrade: number;
  activeCellsUsingFrozenLowIntensity: number;
  historicalLockProblemClassification: string;
};

export type HistoricalColorRetentionTruth = HistoricalColorRetentionStats;

function computeHistoricalTextureCurrentRenderIntensity(
  cell: PreparedEngineTextureCell,
  microVisualHierarchyActive: boolean,
): number {
  const base = cell.intensity ?? 0;
  if (microVisualHierarchyActive && cell.microScalpRenderIntensity != null) {
    return Math.max(base, cell.microScalpRenderIntensity);
  }
  return base;
}

function computeHistoricalTextureCurrentRenderAlpha(
  intensity: number,
  microVisualHierarchyActive: boolean,
): number {
  if (microVisualHierarchyActive) {
    return Math.min(
      MICRO_TEXTURE_ALPHA_MAX,
      microAlphaFromRenderIntensity(intensity) * MICRO_TEXTURE_ALPHA_MUL,
    );
  }
  return alphaForPassiveLiquidity({ intensity, isActive: true });
}

/**
 * Freeze historical texture render intensity/alpha via session cache.
 * Viewport/micro rescoring must not downgrade existing footprints.
 */
export function applyHistoricalTextureVisualLock(
  data: PreparedEngineRenderData,
  opts: {
    cache: Map<string, HistoricalTextureVisualLock>;
    microScalpMode?: boolean;
    microVisualHierarchyActive?: boolean;
    dataEndTime?: number;
  },
): PreparedEngineRenderData {
  const microVisualHierarchyActive =
    opts.microVisualHierarchyActive ??
    data.microScalpVisual?.microVisualHierarchyActive ??
    false;
  const microScalpMode = opts.microScalpMode ?? data.microScalpVisual?.microScalpMode ?? false;
  const dataEndTime = opts.dataEndTime ?? data.timeMax ?? 0;
  const visualRegime: "micro" | "std" = microVisualHierarchyActive ? "micro" : "std";
  let cellsWithFrozen = 0;
  let cellsWithoutFrozen = 0;
  let sumFrozen = 0;
  let sumCurrent = 0;
  let sumFinal = 0;
  let sumDrift = 0;
  let maxDrift = 0;
  let downgradedPrevented = 0;
  let upgraded = 0;
  let cellsStuckBelow025 = 0;
  let activeCellsUsingFrozenLowIntensity = 0;
  let firstLockBelowMediumCount = 0;
  let cellsEligibleForUpgrade = 0;
  let cellsDeniedUpgrade = 0;
  let sumCached = 0;

  const textureCells = data.textureCells.map((cell) => {
    const naturalEnd =
      cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
    const isActiveFootprint =
      dataEndTime > 0 &&
      naturalEnd >= dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS;

    const currentRenderIntensity = computeHistoricalTextureCurrentRenderIntensity(
      cell,
      microVisualHierarchyActive,
    );
    const currentRenderAlpha = computeHistoricalTextureCurrentRenderAlpha(
      currentRenderIntensity,
      microVisualHierarchyActive,
    );
    const bucketPrice = cell.price;
    const key = historicalTextureCellKey(
      cell.side,
      bucketPrice,
      cell.timeBucket,
      visualRegime,
    );
    const priorCached = opts.cache.get(key)?.renderIntensity;
    if (priorCached != null && currentRenderIntensity > priorCached) {
      cellsEligibleForUpgrade += 1;
    }

    const lock = resolveHistoricalTextureVisualLock({
      key,
      currentRenderIntensity,
      currentRenderAlpha,
      cache: opts.cache,
    });

    if (lock.firstLockBelowMedium) firstLockBelowMediumCount += 1;
    if (lock.downgradePrevented) downgradedPrevented += 1;
    if (lock.upgraded) upgraded += 1;
    if (lock.deniedUpgrade) cellsDeniedUpgrade += 1;
    if (priorCached != null) sumCached += priorCached;

    const finalIntensity = Math.max(
      currentRenderIntensity,
      lock.renderIntensity,
    );
    const drift = Math.abs(currentRenderIntensity - lock.renderIntensity);
    sumDrift += drift;
    if (drift > maxDrift) maxDrift = drift;
    sumCurrent += currentRenderIntensity;
    sumFrozen += lock.renderIntensity;
    sumFinal += finalIntensity;

    if (finalIntensity < 0.25) cellsStuckBelow025 += 1;
    if (
      isActiveFootprint &&
      lock.renderIntensity > currentRenderIntensity + 0.02 &&
      currentRenderIntensity < 0.25
    ) {
      activeCellsUsingFrozenLowIntensity += 1;
    }

    if (!isActiveFootprint && lock.locked) {
      cellsWithFrozen += 1;
    } else {
      cellsWithoutFrozen += 1;
    }

    return {
      ...cell,
      historicalRenderIntensity: lock.renderIntensity,
      historicalRenderAlphaFloor: lock.renderAlphaFloor,
      historicalColorLocked: !isActiveFootprint && lock.locked,
    };
  });

  const count = Math.max(1, textureCells.length);
  const frozenRatio = cellsWithFrozen / Math.max(1, textureCells.length);
  const avgDrift = sumDrift / count;
  const avgFinal = sumFinal / count;
  const avgFrozen = sumFrozen / count;
  const recalculatingHistoricalColors =
    textureCells.length > 0 &&
    downgradedPrevented === 0 &&
    avgDrift > 0.05 &&
    frozenRatio < 0.5;
  const historicalColorTooMuted =
    microVisualHierarchyActive &&
    textureCells.length > 40 &&
    avgFinal < 0.22 &&
    cellsStuckBelow025 / count > 0.65;
  const historicalColorRetention: HistoricalColorRetentionStats = {
    historicalTextureCellCount: textureCells.length,
    visualCacheSize: opts.cache.size,
    cellsWithFrozenRenderIntensity: cellsWithFrozen,
    cellsWithoutFrozenRenderIntensity: cellsWithoutFrozen,
    avgFrozenRenderIntensity: Number(avgFrozen.toFixed(4)),
    avgCurrentRenderIntensity: Number((sumCurrent / count).toFixed(4)),
    avgFinalRenderIntensity: Number(avgFinal.toFixed(4)),
    avgIntensityDrift: Number(avgDrift.toFixed(4)),
    maxIntensityDrift: Number(maxDrift.toFixed(4)),
    downgradedHistoricalCellsPrevented: downgradedPrevented,
    upgradedHistoricalCells: upgraded,
    cellsStuckBelow025,
    activeCellsUsingFrozenLowIntensity,
    historicalColorRetentionOk:
      (frozenRatio >= 0.9 || textureCells.length < 20) &&
      !recalculatingHistoricalColors &&
      !historicalColorTooMuted,
    historicalColorTooMuted,
    alphaFrozenAsFinalDetected: false,
    recalculatingHistoricalColors,
    microScalpMode,
  };

  const lockAudit: HistoricalColorLockAudit = {
    historicalTextureCellCount: textureCells.length,
    visualCacheSize: opts.cache.size,
    firstLockBelowMediumCount,
    cachedIntensityAvg: Number(
      (sumCached / Math.max(1, cellsEligibleForUpgrade + cellsWithFrozen)).toFixed(4),
    ),
    currentCandidateIntensityAvg: Number((sumCurrent / count).toFixed(4)),
    upgradedHistoricalCells: upgraded,
    downgradedHistoricalCellsPrevented: downgradedPrevented,
    alphaFrozenCellCount: 0,
    alphaFinalAvg: 0,
    intensityFinalAvg: Number(avgFinal.toFixed(4)),
    cellsStuckBelow025,
    cellsEligibleForUpgrade,
    cellsDeniedUpgrade,
    activeCellsUsingFrozenLowIntensity,
    historicalLockProblemClassification: classifyHistoricalLockProblem({
      firstLockBelowMediumCount,
      historicalColorTooMuted,
      activeCellsUsingFrozenLowIntensity,
      cellsStuckBelow025,
      cellCount: textureCells.length,
      upgraded,
      downgradedPrevented,
    }),
  };

  return {
    ...data,
    textureCells,
    historicalColorRetention,
    historicalColorLockAudit: lockAudit,
  };
}

function classifyHistoricalLockProblem(opts: {
  firstLockBelowMediumCount: number;
  historicalColorTooMuted: boolean;
  activeCellsUsingFrozenLowIntensity: number;
  cellsStuckBelow025: number;
  cellCount: number;
  upgraded: number;
  downgradedPrevented: number;
}): string {
  if (opts.historicalColorTooMuted) return "muted_max_intensity_too_low";
  if (opts.activeCellsUsingFrozenLowIntensity > 0) {
    return "active_cells_frozen_low";
  }
  if (
    opts.cellCount > 0 &&
    opts.cellsStuckBelow025 / opts.cellCount > 0.7
  ) {
    return "cells_stuck_below_medium";
  }
  if (opts.firstLockBelowMediumCount > opts.cellCount * 0.5) {
    return "first_lock_too_weak";
  }
  if (opts.downgradedPrevented > 0 && opts.upgraded > 0) {
    return "healthy_max_retention";
  }
  if (opts.upgraded > 0) return "upgrading";
  return "ok";
}

export function buildHistoricalColorLockAuditFromRetention(
  retention: HistoricalColorRetentionStats,
  audit?: HistoricalColorLockAudit,
): HistoricalColorLockAudit {
  if (audit) {
    return {
      ...audit,
      alphaFrozenCellCount: retention.alphaFrozenAsFinalDetected ? 1 : 0,
      intensityFinalAvg: retention.avgFinalRenderIntensity,
    };
  }
  return {
    historicalTextureCellCount: retention.historicalTextureCellCount,
    visualCacheSize: retention.visualCacheSize,
    firstLockBelowMediumCount: 0,
    cachedIntensityAvg: retention.avgFrozenRenderIntensity,
    currentCandidateIntensityAvg: retention.avgCurrentRenderIntensity,
    upgradedHistoricalCells: retention.upgradedHistoricalCells,
    downgradedHistoricalCellsPrevented:
      retention.downgradedHistoricalCellsPrevented,
    alphaFrozenCellCount: retention.alphaFrozenAsFinalDetected ? 1 : 0,
    alphaFinalAvg: 0,
    intensityFinalAvg: retention.avgFinalRenderIntensity,
    cellsStuckBelow025: retention.cellsStuckBelow025,
    cellsEligibleForUpgrade: 0,
    cellsDeniedUpgrade: 0,
    activeCellsUsingFrozenLowIntensity:
      retention.activeCellsUsingFrozenLowIntensity,
    historicalLockProblemClassification: retention.historicalColorTooMuted
      ? "muted_max_intensity_too_low"
      : "ok",
  };
}

/** P7.3 — scalar classification for texture tuning (A–F). */
export function classifyBookmapTextureDiag(
  diag: Pick<
    BookmapTextureDiag,
    | "rawHeatmapCellCount"
    | "textureCellCount"
    | "renderedTextureCellCount"
    | "cellsFilteredBySize"
    | "cellsFilteredByTime"
    | "texturePrepareCapHit"
    | "textureDrawCapHit"
    | "renderedBandCount"
    | "wallBandCount"
  >,
  opts?: {
    spotSampledLevelsLastTick?: number;
    perpSampledLevelsLastTick?: number;
  },
): string {
  const sampled = Math.max(
    opts?.spotSampledLevelsLastTick ?? 0,
    opts?.perpSampledLevelsLastTick ?? 0,
  );
  if (diag.rawHeatmapCellCount < 500 || sampled < 40) return "A";
  if (
    diag.cellsFilteredBySize > diag.rawHeatmapCellCount * 0.45 ||
    diag.texturePrepareCapHit
  ) {
    return "B";
  }
  if (diag.textureDrawCapHit) return "F";
  if (diag.cellsFilteredByTime > diag.textureCellCount * 0.5) return "E";
  if (
    diag.renderedBandCount > 8 &&
    diag.wallBandCount >= Math.max(1, diag.renderedBandCount * 0.5)
  ) {
    return "D";
  }
  if (
    diag.textureCellCount >= 80 &&
    diag.renderedTextureCellCount >= 40 &&
    diag.renderedTextureCellCount >= diag.textureCellCount * 0.25
  ) {
    return "C";
  }
  if (diag.renderedTextureCellCount === 0 && diag.textureCellCount > 0) return "E";
  return "OK";
}

export type BookmapHistoryRetentionDiag = {
  sourceMode: string;
  activeDomMarket: string;
  rawHeatmapCellCount: number;
  historicalCellCount: number;
  textureCellCount: number;
  renderedTextureCellCount: number;
  oldestCellAgeMs: number;
  newestCellAgeMs: number;
  engineCoverageMs: number;
  retentionMs: number;
  maxHeatmapCells: number;
  trimByRetentionCount: number;
  trimByCapCount: number;
  cellsDroppedByPrepareSize: number;
  cellsDroppedByPreparePrice: number;
  cellsDroppedByPrepareTime: number;
  textureCapHit: boolean;
  textureDrawCapHit: boolean;
  liveProjectionRenderedCount: number;
  wallBandCount: number;
  historicalCellsHiddenByLayerEstimate: number;
  currentBookLevelCount: number;
  classification: string;
};

function heatmapCellAgeBoundsMs(
  cells: Array<{ timeBucket: number }>,
  now: number,
): { oldestAgeMs: number; newestAgeMs: number; coverageMs: number } {
  if (!cells.length) {
    return { oldestAgeMs: 0, newestAgeMs: 0, coverageMs: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const cell of cells) {
    if (cell.timeBucket < min) min = cell.timeBucket;
    if (cell.timeBucket > max) max = cell.timeBucket;
  }
  return {
    oldestAgeMs: min === Infinity ? 0 : Math.max(0, now - min),
    newestAgeMs: max === -Infinity ? 0 : Math.max(0, now - max),
    coverageMs: min === Infinity ? 0 : Math.max(0, max - min),
  };
}

export function classifyBookmapHistoryRetention(
  diag: Pick<
    BookmapHistoryRetentionDiag,
    | "rawHeatmapCellCount"
    | "historicalCellCount"
    | "renderedTextureCellCount"
    | "engineCoverageMs"
    | "retentionMs"
    | "trimByCapCount"
    | "cellsDroppedByPrepareSize"
    | "cellsDroppedByPrepareTime"
    | "textureCapHit"
    | "textureDrawCapHit"
    | "liveProjectionRenderedCount"
    | "wallBandCount"
    | "historicalCellsHiddenByLayerEstimate"
  >,
): string {
  if (diag.rawHeatmapCellCount < 200 || diag.engineCoverageMs < 60_000) {
    return "A";
  }
  if (diag.trimByCapCount > 0 || diag.textureCapHit) {
    return "B";
  }
  if (
    diag.cellsDroppedByPrepareSize > diag.rawHeatmapCellCount * 0.4 ||
    diag.cellsDroppedByPrepareTime > diag.historicalCellCount * 0.35
  ) {
    return "C";
  }
  if (
    diag.renderedTextureCellCount === 0 &&
    diag.historicalCellCount > 0
  ) {
    return "D";
  }
  if (
    diag.historicalCellsHiddenByLayerEstimate > diag.renderedTextureCellCount * 0.35 ||
    (diag.liveProjectionRenderedCount > 40 && diag.wallBandCount > 12)
  ) {
    return "E";
  }
  if (
    diag.renderedTextureCellCount > 0 &&
    diag.renderedTextureCellCount < diag.historicalCellCount * 0.2
  ) {
    return "F";
  }
  return "OK";
}

export function buildBookmapHistoryRetentionDiag(opts: {
  sourceMode: string;
  activeDomMarket: string;
  renderData: PreparedEngineRenderData | null;
  rawHeatmapCells: Array<{ timeBucket: number }>;
  renderedTextureCellCount: number;
  textureDrawCapHit: boolean;
  liveProjectionRenderedCount: number;
  currentBookLevelCount: number;
  retentionMs?: number;
  maxHeatmapCells?: number;
  trimByRetentionCount?: number;
  trimByCapCount?: number;
}): BookmapHistoryRetentionDiag {
  const now = Date.now();
  const ts = opts.renderData?.textureStats;
  const ages = heatmapCellAgeBoundsMs(opts.rawHeatmapCells, now);
  const historicalCellCount = ts?.preparedTextureCellCount ?? 0;
  const renderedTextureCellCount = opts.renderedTextureCellCount;
  const hiddenEstimate = Math.max(
    0,
    historicalCellCount - renderedTextureCellCount,
  );
  const base = {
    sourceMode: opts.sourceMode,
    activeDomMarket: opts.activeDomMarket,
    rawHeatmapCellCount: ts?.rawHeatmapCellCount ?? opts.rawHeatmapCells.length,
    historicalCellCount,
    textureCellCount: historicalCellCount,
    renderedTextureCellCount,
    oldestCellAgeMs: ages.oldestAgeMs,
    newestCellAgeMs: ages.newestAgeMs,
    engineCoverageMs: ages.coverageMs,
    retentionMs: opts.retentionMs ?? BOOKMAP_HISTORY_RETENTION_MS,
    maxHeatmapCells: opts.maxHeatmapCells ?? 500_000,
    trimByRetentionCount: opts.trimByRetentionCount ?? 0,
    trimByCapCount: opts.trimByCapCount ?? 0,
    cellsDroppedByPrepareSize: ts?.cellsFilteredBySize ?? 0,
    cellsDroppedByPreparePrice: ts?.cellsFilteredByPrice ?? 0,
    cellsDroppedByPrepareTime: ts?.cellsFilteredByTime ?? 0,
    textureCapHit: ts?.texturePrepareCapHit ?? false,
    textureDrawCapHit: opts.textureDrawCapHit,
    liveProjectionRenderedCount: opts.liveProjectionRenderedCount,
    wallBandCount: ts?.wallBandCount ?? 0,
    historicalCellsHiddenByLayerEstimate: hiddenEstimate,
    currentBookLevelCount: opts.currentBookLevelCount,
  };
  return {
    ...base,
    classification: classifyBookmapHistoryRetention(base),
  };
}

export function buildBookmapTextureDiag(opts: {
  sourceMode: string;
  activeDomMarket: string;
  renderData: PreparedEngineRenderData | null;
  renderedTextureCellCount?: number;
  textureDrawCapHit?: boolean;
  spotSampledLevelsLastTick?: number;
  perpSampledLevelsLastTick?: number;
}): BookmapTextureDiag {
  const data = opts.renderData;
  const ts = data?.textureStats;
  const textureCellCount = ts?.preparedTextureCellCount ?? 0;
  return {
    sourceMode: opts.sourceMode,
    activeDomMarket: opts.activeDomMarket,
    rawHeatmapCellCount: ts?.rawHeatmapCellCount ?? 0,
    preparedCellCount: ts?.preparedCellCount ?? 0,
    textureCellCount,
    renderedBandCount: data?.stats.renderedBandCount ?? 0,
    renderedTextureCellCount:
      opts.renderedTextureCellCount ?? ts?.preparedTextureCellCount ?? 0,
    historicalCellCount: textureCellCount,
    wallBandCount: ts?.wallBandCount ?? 0,
    minRenderedSizeBtc: ts?.minRenderedSizeBtc ?? 0,
    maxRenderedSizeBtc: ts?.maxRenderedSizeBtc ?? 0,
    priceBucketSize: ts?.texturePriceBucketSize ?? BOOKMAP_TEXTURE_PRICE_BUCKET_USD,
    timeBucketMs: ts?.timeBucketMs ?? BOOKMAP_ENGINE_BUCKET_MS,
    cellsFilteredBySize: ts?.cellsFilteredBySize ?? 0,
    cellsFilteredByPrice: ts?.cellsFilteredByPrice ?? 0,
    cellsFilteredByTime: ts?.cellsFilteredByTime ?? 0,
    cellsFilteredByIntensity: ts?.cellsFilteredByIntensity ?? 0,
    mergeCompressionRatio: ts?.mergeCompressionRatio ?? 0,
    textureModeEnabled: ts?.textureModeEnabled ?? BOOKMAP_TEXTURE_MODE_ENABLED,
    preparedTextureCellCount: textureCellCount,
    texturePrepareCapHit: ts?.texturePrepareCapHit ?? false,
    textureDrawCapHit:
      opts.textureDrawCapHit ?? ts?.textureDrawCapHit ?? false,
    spotSampledLevelsLastTick: opts.spotSampledLevelsLastTick ?? 0,
    perpSampledLevelsLastTick: opts.perpSampledLevelsLastTick ?? 0,
    textureSamplerMs: ts?.textureSamplerMs ?? BOOKMAP_TEXTURE_SAMPLER_MS,
    textureContinuousMode: ts?.textureContinuousMode ?? BOOKMAP_TEXTURE_CONTINUOUS_MODE,
    cellsWithEndTime: ts?.cellsWithEndTime ?? 0,
    cellsUsingSyntheticEndTime: ts?.cellsUsingSyntheticEndTime ?? 0,
  };
}

export type BookmapTextureGeometryDiag = {
  textureCellCount: number;
  renderedTextureCellCount: number;
  avgTextureCellWidthPx: number;
  minTextureCellWidthPx: number;
  maxTextureCellWidthPx: number;
  timeBucketMs: number;
  samplerMs: number;
  viewportMs: number;
  plotWidthPx: number;
  textureContinuousMode: string;
  cellsWithEndTime: number;
  cellsUsingSyntheticEndTime: number;
  drawCapHit: boolean;
};

export function buildBookmapTextureGeometryDiag(opts: {
  renderData: PreparedEngineRenderData | null;
  renderedTextureCellCount: number;
  avgTextureCellWidthPx: number;
  minTextureCellWidthPx: number;
  maxTextureCellWidthPx: number;
  viewportMs: number;
  plotWidthPx: number;
  drawCapHit: boolean;
}): BookmapTextureGeometryDiag {
  const ts = opts.renderData?.textureStats;
  return {
    textureCellCount: ts?.preparedTextureCellCount ?? 0,
    renderedTextureCellCount: opts.renderedTextureCellCount,
    avgTextureCellWidthPx: Number(opts.avgTextureCellWidthPx.toFixed(2)),
    minTextureCellWidthPx: Number(opts.minTextureCellWidthPx.toFixed(2)),
    maxTextureCellWidthPx: Number(opts.maxTextureCellWidthPx.toFixed(2)),
    timeBucketMs: ts?.timeBucketMs ?? BOOKMAP_ENGINE_BUCKET_MS,
    samplerMs: ts?.textureSamplerMs ?? BOOKMAP_TEXTURE_SAMPLER_MS,
    viewportMs: Math.round(opts.viewportMs),
    plotWidthPx: Math.round(opts.plotWidthPx),
    textureContinuousMode: ts?.textureContinuousMode ?? BOOKMAP_TEXTURE_CONTINUOUS_MODE,
    cellsWithEndTime: ts?.cellsWithEndTime ?? 0,
    cellsUsingSyntheticEndTime: ts?.cellsUsingSyntheticEndTime ?? 0,
    drawCapHit: opts.drawCapHit,
  };
}

export type BookmapLiveProjectionDiag = {
  sourceMode: string;
  activeDomMarket: string;
  currentBidLevelCount: number;
  currentAskLevelCount: number;
  projectedBidLevelCount: number;
  projectedAskLevelCount: number;
  liveProjectionEnabled: boolean;
  liveProjectionStartTime: number;
  liveProjectionEndTime: number;
  viewportStart: number;
  viewportEnd: number;
  liveEdgeTime: number;
  rightSpaceMs: number;
  minProjectedSizeBtc: number;
  maxProjectedSizeBtc: number;
  projectedLevelsFilteredBySize: number;
  projectedLevelsFilteredByPrice: number;
  renderedLiveProjectionCount: number;
};

export type BookmapLiveProjectionGeometryDiag = {
  sourceMode: string;
  activeDomMarket: string;
  liveProjectionStartTime: number;
  liveProjectionEndTime: number;
  dataEndTime: number;
  visibleEndTime: number;
  liveEdgeTime: number;
  rightSpaceMs: number;
  projectionWidthMs: number;
  avgProjectionWidthPx: number;
  minProjectionWidthPx: number;
  maxProjectionWidthPx: number;
  projectedBidLevelCount: number;
  projectedAskLevelCount: number;
  renderedLiveProjectionCount: number;
  projectionOverlapsHistory: boolean;
  liveProjectionAlpha: number;
  minProjectedSizeBtc: number;
  maxProjectedSizeBtc: number;
};

export function buildBookmapLiveProjectionGeometryDiag(opts: {
  sourceMode: string;
  activeDomMarket: string;
  renderData: PreparedEngineRenderData | null;
  timeViewport: {
    visibleStartTime: number;
    visibleEndTime: number;
    liveEdgeTime: number;
    dataEndTime: number;
    rightSpacePct: number;
  };
  projectionStartTime: number;
  projectionEndTime: number;
  avgProjectionWidthPx: number;
  minProjectionWidthPx: number;
  maxProjectionWidthPx: number;
  renderedLiveProjectionCount: number;
  projectionOverlapsHistory: boolean;
}): BookmapLiveProjectionGeometryDiag {
  const lp = opts.renderData?.liveProjectionStats;
  const dataEnd = opts.timeViewport.dataEndTime;
  const visibleEnd = opts.timeViewport.visibleEndTime;
  const rightSpaceMs = Math.max(0, visibleEnd - dataEnd);
  const projectionWidthMs = Math.max(
    0,
    opts.projectionEndTime - opts.projectionStartTime,
  );
  return {
    sourceMode: opts.sourceMode,
    activeDomMarket: opts.activeDomMarket,
    liveProjectionStartTime: opts.projectionStartTime,
    liveProjectionEndTime: opts.projectionEndTime,
    dataEndTime: dataEnd,
    visibleEndTime: visibleEnd,
    liveEdgeTime: opts.timeViewport.liveEdgeTime,
    rightSpaceMs: Math.round(rightSpaceMs),
    projectionWidthMs: Math.round(projectionWidthMs),
    avgProjectionWidthPx: Number(opts.avgProjectionWidthPx.toFixed(2)),
    minProjectionWidthPx: Number(opts.minProjectionWidthPx.toFixed(2)),
    maxProjectionWidthPx: Number(opts.maxProjectionWidthPx.toFixed(2)),
    projectedBidLevelCount: lp?.projectedBidLevelCount ?? 0,
    projectedAskLevelCount: lp?.projectedAskLevelCount ?? 0,
    renderedLiveProjectionCount: opts.renderedLiveProjectionCount,
    projectionOverlapsHistory: opts.projectionOverlapsHistory,
    liveProjectionAlpha: BOOKMAP_LIVE_PROJECTION_ALPHA_MUL,
    minProjectedSizeBtc: lp?.minProjectedSizeBtc ?? 0,
    maxProjectedSizeBtc: lp?.maxProjectedSizeBtc ?? 0,
  };
}

export function buildBookmapLiveProjectionDiag(opts: {
  sourceMode: string;
  activeDomMarket: string;
  renderData: PreparedEngineRenderData | null;
  timeViewport: {
    visibleStartTime: number;
    visibleEndTime: number;
    liveEdgeTime: number;
    dataEndTime: number;
    rightSpacePct: number;
  };
  renderedLiveProjectionCount: number;
}): BookmapLiveProjectionDiag {
  const lp = opts.renderData?.liveProjectionStats;
  const dataEnd = opts.timeViewport.dataEndTime;
  const visibleEnd = opts.timeViewport.visibleEndTime;
  const rightSpaceMs = Math.max(0, visibleEnd - dataEnd);
  return {
    sourceMode: opts.sourceMode,
    activeDomMarket: opts.activeDomMarket,
    currentBidLevelCount: lp?.currentBidLevelCount ?? 0,
    currentAskLevelCount: lp?.currentAskLevelCount ?? 0,
    projectedBidLevelCount: lp?.projectedBidLevelCount ?? 0,
    projectedAskLevelCount: lp?.projectedAskLevelCount ?? 0,
    liveProjectionEnabled: lp?.liveProjectionEnabled ?? false,
    liveProjectionStartTime: lp?.liveProjectionStartTime ?? dataEnd,
    liveProjectionEndTime: visibleEnd,
    viewportStart: opts.timeViewport.visibleStartTime,
    viewportEnd: visibleEnd,
    liveEdgeTime: opts.timeViewport.liveEdgeTime,
    rightSpaceMs: Math.round(rightSpaceMs),
    minProjectedSizeBtc: lp?.minProjectedSizeBtc ?? 0,
    maxProjectedSizeBtc: lp?.maxProjectedSizeBtc ?? 0,
    projectedLevelsFilteredBySize: lp?.projectedLevelsFilteredBySize ?? 0,
    projectedLevelsFilteredByPrice: lp?.projectedLevelsFilteredByPrice ?? 0,
    renderedLiveProjectionCount: opts.renderedLiveProjectionCount,
  };
}

function cellToPrepared(cell: HeatmapCell): PreparedEngineCell {
  const size = cell.maxSizeInBucket;
  const meta = getLifecycleCellMeta(cell.timeBucket, cell.side, cell.price);
  const textureSourceKind = classifyTextureSourceKind(cell);
  const lifecycleKey = meta
    ? (`${cell.side}:${cell.price}` as `${"bid" | "ask"}:${number}`)
    : undefined;

  return {
    timeBucket: cell.timeBucket,
    price: cell.price,
    side: cell.side,
    intensity: meta?.historicalLifecycleIntensity ?? 0,
    isMajor: size >= WALL_MAJOR_BTC,
    maxSizeInBucket: size,
    historicalRenderIntensity: meta?.peakRetentionFloor,
    historicalRenderAlphaFloor: meta?.historicalLifecycleAlpha,
    lifecycleHistorical: meta != null,
    lifecycleActive: meta?.lifecycleActive,
    lifecyclePulled: meta?.lifecyclePulled,
    lifecycleFootprint: meta?.lifecycleFootprint,
    lifecycleWall: meta?.lifecycleWall,
    lifecycleStrong: meta?.lifecycleStrong,
    lifecycleTextureMod: meta?.lifecycleTextureMod,
    lifecycleTextureTier: meta?.lifecycleTier,
    lifecycleKey,
    persistenceMs: meta?.persistenceMs,
    textureSourceKind,
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

export type BookmapVisualWeightInput = {
  sizeBtc: number;
  price: number;
  midPrice: number | null;
  regime: BookmapZoomRegime;
  baseIntensity: number;
  isActive: boolean;
  closedAgeMs?: number;
  lifetimeMs?: number;
  viewportMaxSize?: number;
};

export type BookmapVisualWeightResult = {
  visualIntensity: number;
  /** Legacy multiplier — prefer farDistanceFade + passive alpha ctx */
  alphaMul: number;
  farDistanceFade: number;
  nearPriceContrastBoost: boolean;
  absoluteSizeComponent: number;
  viewportRelativeSizeComponent: number;
  distanceWeight: number;
  activeVsClosedWeight: number;
  closedAgeWeight: number;
  recentPullWeight: number;
  wallPullWeight: number;
  isRecentPullCandidate: boolean;
  isWallPullCandidate: boolean;
  pctFromMid: number;
};

export type BookmapVisualRenderStats = {
  viewportVisibleSpanCount: number;
  viewportActiveSpanCount: number;
  viewportClosedSpanCount: number;
  activeNearAlphaSum: number;
  activeNearAlphaCount: number;
  activeFarAlphaSum: number;
  activeFarAlphaCount: number;
  closedRecentAlphaSum: number;
  closedRecentAlphaCount: number;
  closedOldAlphaSum: number;
  closedOldAlphaCount: number;
  granularDrawCount: number;
  continuousDrawCount: number;
  rightSideDrawCount: number;
  rightSideAlphaSum: number;
  recentPullCandidateCount: number;
  wallPullVisualCandidateCount: number;
  microZoomBoostApplied: boolean;
  scalpZoomBoostApplied: boolean;
  usesAbsoluteSizeComponent: boolean;
  usesViewportRelativeSizeComponent: boolean;
  usesDistanceWeighting: boolean;
  usesClosedAgeWeighting: boolean;
  usesRecentPullWeighting: boolean;
};

export type BookmapVisualParityTruth = {
  perpFilterAligned: boolean;
  historicalTextureGranular: boolean;
  rightSideContinuityOk: boolean;
  adaptiveColorHierarchyEnabled: boolean;
  visiblePriceRangePct: number;
  zoomRegime: BookmapZoomRegime;
  viewportVisibleSpanCount: number;
  viewportActiveSpanCount: number;
  viewportClosedSpanCount: number;
  usesAbsoluteSizeComponent: boolean;
  usesViewportRelativeSizeComponent: boolean;
  usesDistanceWeighting: boolean;
  usesClosedAgeWeighting: boolean;
  usesRecentPullWeighting: boolean;
  activeNearAvgAlpha: number;
  activeFarAvgAlpha: number;
  closedRecentAvgAlpha: number;
  closedOldAvgAlpha: number;
  nearVsFarAlphaRatio: number;
  activeVsClosedAlphaRatio: number;
  recentPullCandidateCount: number;
  wallPullVisualCandidateCount: number;
  textureLooksStripedOnly: boolean;
  textureLooksGranular: boolean;
  rightSideLooksOverlayed: boolean;
  rightSideFeelsContinuous: boolean;
  visualFloodingInPerp: boolean;
  microZoomBoostApplied: boolean;
  scalpZoomBoostApplied: boolean;
  visualParityOk: boolean;
};

export function createEmptyBookmapVisualRenderStats(): BookmapVisualRenderStats {
  return {
    viewportVisibleSpanCount: 0,
    viewportActiveSpanCount: 0,
    viewportClosedSpanCount: 0,
    activeNearAlphaSum: 0,
    activeNearAlphaCount: 0,
    activeFarAlphaSum: 0,
    activeFarAlphaCount: 0,
    closedRecentAlphaSum: 0,
    closedRecentAlphaCount: 0,
    closedOldAlphaSum: 0,
    closedOldAlphaCount: 0,
    granularDrawCount: 0,
    continuousDrawCount: 0,
    rightSideDrawCount: 0,
    rightSideAlphaSum: 0,
    recentPullCandidateCount: 0,
    wallPullVisualCandidateCount: 0,
    microZoomBoostApplied: false,
    scalpZoomBoostApplied: false,
    usesAbsoluteSizeComponent: true,
    usesViewportRelativeSizeComponent: true,
    usesDistanceWeighting: true,
    usesClosedAgeWeighting: true,
    usesRecentPullWeighting: true,
  };
}

function distanceWeightForRegime(
  pctFromMid: number,
  regime: BookmapZoomRegime,
): number {
  const near = pctFromMid <= 0.35;
  const mid = pctFromMid <= 1;
  const far = pctFromMid <= 3;
  switch (regime) {
    case "ultra_micro":
      if (near) return 1.55;
      if (mid) return 0.72;
      if (far) return 0.12;
      return 0.04;
    case "scalp":
      if (near) return 1.5;
      if (mid) return 0.78;
      if (far) return 0.18;
      return 0.06;
    case "micro":
      if (near) return 1.4;
      if (mid) return 0.85;
      if (far) return 0.28;
      return 0.12;
    default:
      if (near) return 1.5;
      if (mid) return 1;
      if (far) return 0.45;
      return 0.22;
  }
}

function closedAgeWeightForRegime(
  closedAgeMs: number,
  regime: BookmapZoomRegime,
): number {
  const ageSec = closedAgeMs / 1000;
  const base =
    ageSec < 30 ? 0.62 : ageSec < 90 ? 0.42 : ageSec < 300 ? 0.28 : 0.16;
  if (regime === "scalp" || regime === "ultra_micro") {
    return ageSec < 45 ? base * 1.15 : base * 0.88;
  }
  return base;
}

export function computeViewportSizeStats(
  cells: PreparedEngineTextureCell[],
): { maxSize: number; p75Size: number } {
  if (!cells.length) return { maxSize: 0, p75Size: 0 };
  const sizes = cells
    .map((c) => c.maxSizeInBucket)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  if (!sizes.length) return { maxSize: 0, p75Size: 0 };
  const p75Idx = Math.floor(sizes.length * 0.75);
  return {
    maxSize: sizes[sizes.length - 1]!,
    p75Size: sizes[p75Idx] ?? sizes[sizes.length - 1]!,
  };
}

export function computeBookmapVisualWeight(
  input: BookmapVisualWeightInput,
): BookmapVisualWeightResult {
  const pctFromMid =
    input.midPrice != null && input.midPrice > 0
      ? (Math.abs(input.price - input.midPrice) / input.midPrice) * 100
      : 50;
  const absoluteSizeComponent = Math.min(
    1,
    Math.log1p(Math.max(0, input.sizeBtc)) / Math.log1p(150),
  );
  const vpMax = Math.max(1, input.viewportMaxSize ?? 50);
  const viewportRelativeSizeComponent = Math.min(1, input.sizeBtc / vpMax);

  const distanceWeight = distanceWeightForRegime(pctFromMid, input.regime);
  const closedAgeMs = input.closedAgeMs ?? 0;
  const lifetimeMs = input.lifetimeMs ?? 0;
  const closedAgeWeight = input.isActive
    ? 1
    : closedAgeWeightForRegime(closedAgeMs, input.regime);
  const activeVsClosedWeight = input.isActive ? 1.08 : closedAgeWeight;

  const isRecentPullCandidate =
    !input.isActive &&
    closedAgeMs < 60_000 &&
    lifetimeMs >= PERP_RENDER_MIN_LIFETIME_MS;
  const recentPullWeight = isRecentPullCandidate
    ? input.regime === "macro"
      ? 1.25
      : 1.55
    : 1;

  const isWallPullCandidate =
    !input.isActive && input.sizeBtc >= 50 && closedAgeMs < 120_000;
  const wallPullWeight = isWallPullCandidate ? 1.35 : 1;

  const regimeSizeBlend =
    input.regime === "macro"
      ? 0.55
      : input.regime === "ultra_micro"
        ? 0.25
        : 0.38;
  const sizeBlend =
    absoluteSizeComponent * regimeSizeBlend +
    viewportRelativeSizeComponent * (1 - regimeSizeBlend);

  let visualIntensity = input.baseIntensity;
  visualIntensity *= 0.35 + sizeBlend * 0.65;
  visualIntensity *= distanceWeight;
  visualIntensity *= activeVsClosedWeight;
  visualIntensity *= recentPullWeight;
  visualIntensity *= wallPullWeight;

  if (
    (input.regime === "micro" ||
      input.regime === "scalp" ||
      input.regime === "ultra_micro") &&
    pctFromMid <= 0.5
  ) {
    visualIntensity *= input.regime === "ultra_micro" ? 1.27 : 1.12;
  }

  visualIntensity = Math.min(0.97, Math.max(0.01, visualIntensity));

  let farDistanceFade = 1;
  if (input.regime === "macro" && pctFromMid > 3) farDistanceFade = 0.75;
  else if (input.regime === "micro" && pctFromMid > 2) farDistanceFade = 0.62;
  else if (
    (input.regime === "scalp" || input.regime === "ultra_micro") &&
    pctFromMid > 1
  ) {
    farDistanceFade = 0.38;
  } else if (
    input.regime === "ultra_micro" &&
    pctFromMid > 0.5
  ) {
    farDistanceFade = 0.55;
  }

  const nearPriceContrastBoost =
    (input.regime === "micro" ||
      input.regime === "scalp" ||
      input.regime === "ultra_micro") &&
    pctFromMid <= 0.5;

  const alphaMul = input.isActive ? 1 : 0.85 + closedAgeWeight * 0.15;

  return {
    visualIntensity,
    alphaMul,
    farDistanceFade,
    nearPriceContrastBoost,
    absoluteSizeComponent,
    viewportRelativeSizeComponent,
    distanceWeight,
    activeVsClosedWeight,
    closedAgeWeight,
    recentPullWeight,
    wallPullWeight,
    isRecentPullCandidate,
    isWallPullCandidate,
    pctFromMid,
  };
}

export function isTextureSpanContinuous(cell: PreparedEngineTextureCell): boolean {
  const intensity = cell.intensity ?? 0;
  return (
    cell.maxSizeInBucket >= BOOKMAP_TEXTURE_CONTINUOUS_MIN_SIZE_BTC ||
    intensity >= BOOKMAP_TEXTURE_CONTINUOUS_MIN_INTENSITY
  );
}

export type L2BandRenderClass =
  | "stableActiveL2Band"
  | "normalActiveMicroBand"
  | "closedRelevantHistoryBand"
  | "weakGranularTextureBand";

export type StableL2FillRenderMode = "texture" | "wallBand";

export type StableL2FillEntry = {
  bandClass: L2BandRenderClass;
  stableIntensity: number;
  stableAlphaMul: number;
  stableSizeBtc: number;
  renderMode?: StableL2FillRenderMode;
};

/** Fixed orange/red intensity by wall size — not viewport-relative. */
export function mapWallSizeToStableVisualIntensity(maxSizeBtc: number): number {
  if (maxSizeBtc >= WALL_MAJOR_BTC) return WALL_BAND_STABLE_INTENSITY_MAJOR;
  if (maxSizeBtc >= WALL_STRUCTURAL_BTC) {
    return WALL_BAND_STABLE_INTENSITY_STRUCTURAL;
  }
  if (maxSizeBtc >= WALL_IMPORTANT_BTC) {
    return WALL_BAND_STABLE_INTENSITY_IMPORTANT;
  }
  return 0.65;
}

function extendActiveWallBandEnd(
  band: HeatmapBand,
  dataEndTime: number,
  _visibleEndTime: number,
  samplerMs: number,
): HeatmapBand {
  const isLive =
    !band.stale && band.endTime >= dataEndTime - samplerMs * 2;
  if (isLive && (isWallTier(band.tier) || band.maxSize >= WALL_IMPORTANT_BTC)) {
    // Right-space is owned exclusively by live projection — wall bands stop at data edge.
    return {
      ...band,
      endTime: Math.max(band.endTime, dataEndTime),
    };
  }
  return band;
}

/**
 * Merge wall-tier bands at the same price into continuous spans with stable
 * orange/red intensity. Active walls extend to dataEndTime only (not right-space).
 */
export function prepareWallBandsForContinuousRender(
  bands: HeatmapBand[],
  dataEndTime: number,
  visibleEndTime: number,
  samplerMs: number = BOOKMAP_TEXTURE_SAMPLER_MS,
): {
  bands: HeatmapBand[];
  stableWallFills: Map<string, StableL2FillEntry>;
} {
  const isWallBand = (b: HeatmapBand) =>
    isWallTier(b.tier) || b.maxSize >= WALL_IMPORTANT_BTC;
  const wallCandidates = bands.filter(isWallBand);
  const rest = bands.filter((b) => !isWallBand(b));

  const byKey = new Map<string, HeatmapBand[]>();
  for (const band of wallCandidates) {
    const key = `${band.side}:${band.price}`;
    const list = byKey.get(key) ?? [];
    list.push(band);
    byKey.set(key, list);
  }

  const coalesced: HeatmapBand[] = [];
  const stableWallFills = new Map<string, StableL2FillEntry>();

  for (const group of Array.from(byKey.values())) {
    group.sort((a, b) => a.startTime - b.startTime);
    let current: HeatmapBand = { ...group[0]! };
    const stableVi = mapWallSizeToStableVisualIntensity(current.maxSize);
    current.visualIntensity = stableVi;
    current.intensity = stableVi;
    current.tier = tierFromMaxSize(current.maxSize);

    for (let i = 1; i < group.length; i += 1) {
      const next = group[i]!;
      const gap = next.startTime - current.endTime;
      if (gap <= resolveEffectiveTextureMergeGapMs()) {
        current.endTime = Math.max(current.endTime, next.endTime);
        current.maxSize = Math.max(current.maxSize, next.maxSize);
        current.size = Math.max(current.size, next.size);
        current.stale = Boolean(current.stale && next.stale);
        current.tier = tierFromMaxSize(current.maxSize);
        const mergedVi = mapWallSizeToStableVisualIntensity(current.maxSize);
        current.visualIntensity = mergedVi;
        current.intensity = mergedVi;
      } else {
        coalesced.push(
          extendActiveWallBandEnd(
            current,
            dataEndTime,
            visibleEndTime,
            samplerMs,
          ),
        );
        current = { ...next };
        const nextVi = mapWallSizeToStableVisualIntensity(current.maxSize);
        current.visualIntensity = nextVi;
        current.intensity = nextVi;
        current.tier = tierFromMaxSize(current.maxSize);
      }
    }
    coalesced.push(
      extendActiveWallBandEnd(current, dataEndTime, visibleEndTime, samplerMs),
    );
  }

  for (const band of coalesced) {
    const vi = band.visualIntensity ?? mapWallSizeToStableVisualIntensity(band.maxSize);
    stableWallFills.set(stableL2FillKey(band.side, band.price), {
      bandClass: "stableActiveL2Band",
      stableIntensity: vi,
      stableAlphaMul: 1,
      stableSizeBtc: band.maxSize,
      renderMode: "wallBand",
    });
  }

  return { bands: [...coalesced, ...rest], stableWallFills };
}

export type PreparedL2BandDrawSegment = {
  cell: PreparedEngineTextureCell;
  bandClass: L2BandRenderClass;
  spanStart: number;
  spanEnd: number;
  isActive: boolean;
  stableSizeBtc: number;
  stableIntensity: number;
  stableAlphaMul: number;
  closedAgeMs: number;
  isRelevantL2: boolean;
  weight: BookmapVisualWeightResult;
  usesGranularBlocks: boolean;
  materialSizeSplit: boolean;
  /** Peak intensity for the full resting run — single color per span. */
  peakIntensity: number;
  alphaFloor: number;
  peakSizeBtc: number;
  cellsInSpan: number;
  runStartTimeBucket: number;
  hasLockedColor: boolean;
  spanPeakIntensityMode: boolean;
  /** DEV — intensity variance across source cells before peak unify. */
  sourceIntensityMin?: number;
  sourceIntensityMax?: number;
  /** Groups chunk segments belonging to the same resting run. */
  spanRenderGroupKey: string;
  /** Per-sampler bucket size for internal texture overlay variance. */
  chunkSizeBtc?: number;
};

export type HistoricalSpanColorAudit = {
  textureCellCount: number;
  renderedSpanCount: number;
  multiBucketSpanCount: number;
  avgCellsPerSpan: number;
  spansWithMixedIntensity: number;
  avgIntensityVarianceWithinSpan: number;
  maxIntensityVarianceWithinSpan: number;
  spansUsingPeakIntensity: number;
  spansDowngradePrevented: number;
  avgSpanPeakIntensity: number;
  avgSpanFinalIntensity: number;
  historicalSpanColorRetentionOk: boolean;
  historicalSpanColorProblemClassification: string;
};

export type SpanRenderContinuityAudit = {
  renderedSpanCount: number;
  renderedChunkCount: number;
  avgChunksPerSpan: number;
  maxChunksPerSpan: number;
  spansRenderedAsSingleRect: number;
  spansRenderedAsChunks: number;
  chunkFragmentationDetected: boolean;
  avgSpanWidthPx: number;
  avgChunkWidthPx: number;
  spanBaseLayerEnabled: boolean;
  spanTextureOverlayEnabled: boolean;
  spanContinuityOk: boolean;
  problemClassification: string;
};

export type SpanTextureBalanceAudit = {
  renderedSpanCount: number;
  spanBaseLayerEnabled: boolean;
  internalTextureOverlayEnabled: boolean;
  avgBaseAlpha: number;
  avgOverlayAlpha: number;
  overlayToBaseAlphaRatio: number;
  avgInternalSizeVariance: number;
  spansWithInternalVariation: number;
  spansTooFlat: boolean;
  spansTooFragmented: boolean;
  bookmapTextureBalanceOk: boolean;
  problemClassification: string;
};

export type BookmapP74SpanAudit = {
  renderedSpanCount: number;
  avgCellsPerSpan: number;
  avgSpanWidthPx: number;
  avgSpanPeakIntensity: number;
  spanPeakIntensityMode: boolean;
  spanBaseLayerEnabled: boolean;
  internalChunkOverlayAlpha: number;
  spanContinuityOk: boolean;
  internalTextureOverlayEnabled: boolean;
  overlayToBaseAlphaRatio: number;
  bookmapTextureBalanceOk: boolean;
};

export type BookmapL2BandContinuityStats = {
  l2BandContinuityFixEnabled: boolean;
  relevantActiveL2CandidateCount: number;
  stableActiveL2BandCount: number;
  normalActiveMicroBandCount: number;
  closedRelevantHistoryBandCount: number;
  weakGranularTextureBandCount: number;
  stableBandsUsingSingleColorCount: number;
  stableBandsSplitByMaterialSizeChangeCount: number;
  stableBandsIncorrectlySplitByChunkColorCount: number;
  rightEdgeStableBandCount: number;
  rightEdgeColorMatchesHistoryCount: number;
  rightEdgeColorMismatchCount: number;
  pulledRelevantBandCount: number;
  pulledRelevantBandsStopAtCloseTimeCount: number;
  pulledRelevantBandsIncorrectlyExtendRightCount: number;
  granularAppliedToWeakOnly: boolean;
  granularAppliedToRelevantL2Count: number;
};

export type BookmapL2BandContinuityTruth = BookmapL2BandContinuityStats & {
  stableL2BandContinuityOk: boolean;
  rightEdgeContinuityOk: boolean;
  pulledL2HistoryOk: boolean;
  l2BandVisualOk: boolean;
};

export function createEmptyBookmapL2BandContinuityStats(): BookmapL2BandContinuityStats {
  return {
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
  };
}

export function stableL2FillKey(side: "bid" | "ask", price: number): string {
  return `${side}:${price}`;
}

export function relevantL2SizeBucket(sizeBtc: number): number {
  if (sizeBtc < 5) return 0;
  if (sizeBtc < 8) return 1;
  if (sizeBtc < 20) return 2;
  if (sizeBtc < 50) return 3;
  return 4;
}

export function isMaterialL2SizeChange(
  prevSizeBtc: number,
  nextSizeBtc: number,
): boolean {
  const absDelta = Math.abs(nextSizeBtc - prevSizeBtc);
  if (absDelta >= L2_MATERIAL_SIZE_CHANGE_BTC) return true;
  const denom = Math.max(prevSizeBtc, nextSizeBtc, 0.01);
  if (absDelta / denom >= L2_MATERIAL_SIZE_CHANGE_RELATIVE) return true;
  return (
    relevantL2SizeBucket(prevSizeBtc) !== relevantL2SizeBucket(nextSizeBtc)
  );
}

export function computeStableL2SizeReference(
  isActive: boolean,
  currentSizeBtc: number,
  maxSizeSeenBtc: number,
): number {
  if (isActive) {
    return Math.max(currentSizeBtc, maxSizeSeenBtc * L2_STABLE_MAX_SIZE_BLEND);
  }
  return maxSizeSeenBtc;
}

export function isRelevantL2Liquidity(opts: {
  sizeBtc: number;
  maxSizeBtc: number;
  pctFromMid: number;
  isActive: boolean;
  isWallPullCandidate: boolean;
}): boolean {
  if (opts.isWallPullCandidate) return true;
  if (opts.sizeBtc >= L2_RELEVANT_MIN_BTC || opts.maxSizeBtc >= L2_RELEVANT_MIN_BTC) {
    return true;
  }
  if (opts.isActive && opts.sizeBtc >= L2_NEAR_HALF_PCT_MIN_BTC && opts.pctFromMid <= 0.5) {
    return true;
  }
  if (
    opts.isActive &&
    opts.sizeBtc >= L2_NEAR_QUARTER_PCT_MIN_BTC &&
    opts.pctFromMid <= 0.25
  ) {
    return true;
  }
  if (!opts.isActive && opts.maxSizeBtc >= L2_RELEVANT_MIN_BTC) {
    return true;
  }
  return false;
}

export function classifyL2BandRenderSpan(opts: {
  sizeBtc: number;
  maxSizeBtc: number;
  pctFromMid: number;
  isActive: boolean;
  isWallPullCandidate: boolean;
}): L2BandRenderClass {
  const relevant = isRelevantL2Liquidity(opts);
  if (relevant) {
    return opts.isActive ? "stableActiveL2Band" : "closedRelevantHistoryBand";
  }
  if (
    opts.sizeBtc < L2_WEAK_GRANULAR_MAX_BTC &&
    opts.pctFromMid > 0.5 &&
    !opts.isWallPullCandidate
  ) {
    return "weakGranularTextureBand";
  }
  return opts.isActive ? "normalActiveMicroBand" : "weakGranularTextureBand";
}

export function allowsL2GranularTexture(bandClass: L2BandRenderClass): boolean {
  return bandClass === "weakGranularTextureBand";
}

function lifecycleRunAlphaCap(
  run: PreparedEngineTextureCell,
  next: PreparedEngineTextureCell,
): number {
  const tiers = [run.lifecycleTextureTier, next.lifecycleTextureTier];
  const footprint = run.lifecycleFootprint || next.lifecycleFootprint;
  const wall =
    run.lifecycleWall ||
    next.lifecycleWall ||
    tiers.includes("wall");
  const strong =
    run.lifecycleStrong ||
    next.lifecycleStrong ||
    tiers.includes("strong");

  if (footprint) {
    if (wall) return 0.34;
    if (strong) return 0.24;
    return 0.18;
  }
  if (wall) return 0.52;
  if (strong) return 0.34;
  if (tiers.includes("trace")) return 0.12;
  return 0.22;
}

function mergeTextureRunCellPeaks(
  run: PreparedEngineTextureCell,
  next: PreparedEngineTextureCell,
  runEnd: number,
  runMaxSize: number,
  cellsInRun: number,
): PreparedEngineTextureCell {
  const lifecycleRun = run.lifecycleHistorical && next.lifecycleHistorical;
  const mergedIntensity = lifecycleRun
    ? blendLifecycleRunIntensity(run.intensity ?? 0, next.intensity ?? 0)
    : Math.max(run.intensity ?? 0, next.intensity ?? 0);

  return {
    ...run,
    endTimeBucket: runEnd,
    maxSizeInBucket: runMaxSize,
    cellsInRun,
    runStartTimeBucket: run.runStartTimeBucket ?? run.timeBucket,
    intensity: mergedIntensity,
    dataIntensity: lifecycleRun
      ? blendLifecycleRunIntensity(run.dataIntensity ?? 0, next.dataIntensity ?? 0)
      : Math.max(run.dataIntensity ?? 0, next.dataIntensity ?? 0),
    microScalpRenderIntensity: lifecycleRun
      ? blendLifecycleRunIntensity(
          run.microScalpRenderIntensity ?? 0,
          next.microScalpRenderIntensity ?? 0,
        )
      : Math.max(
          run.microScalpRenderIntensity ?? 0,
          next.microScalpRenderIntensity ?? 0,
        ),
    historicalRenderIntensity: Math.max(
      run.historicalRenderIntensity ?? 0,
      next.historicalRenderIntensity ?? 0,
    ),
    historicalRenderAlphaFloor: Math.min(
      Math.max(
        run.historicalRenderAlphaFloor ?? 0,
        next.historicalRenderAlphaFloor ?? 0,
        run.historicalRenderAlpha ?? 0,
        next.historicalRenderAlpha ?? 0,
      ),
      lifecycleRun ? lifecycleRunAlphaCap(run, next) : 0.22,
    ),
    historicalColorLocked:
      run.historicalColorLocked === true || next.historicalColorLocked === true,
    continuityRunLength:
      (run.continuityRunLength ?? 1) + (next.continuityRunLength ?? 1),
    lifecycleHistorical: lifecycleRun || run.lifecycleHistorical || next.lifecycleHistorical,
    lifecycleFootprint: run.lifecycleFootprint || next.lifecycleFootprint,
    lifecycleWall: run.lifecycleWall || next.lifecycleWall,
    lifecycleStrong: run.lifecycleStrong || next.lifecycleStrong,
    lifecycleTextureTier:
      run.lifecycleTextureTier === "wall" || next.lifecycleTextureTier === "wall"
        ? "wall"
        : run.lifecycleTextureTier === "strong" ||
            next.lifecycleTextureTier === "strong"
          ? "strong"
          : run.lifecycleTextureTier === "normal" ||
              next.lifecycleTextureTier === "normal"
            ? "normal"
            : run.lifecycleTextureTier ?? next.lifecycleTextureTier,
    lifecycleKey: run.lifecycleKey ?? next.lifecycleKey,
  };
}

export function coalesceL2TextureSpans(
  cells: PreparedEngineTextureCell[],
  samplerMs: number,
): {
  merged: PreparedEngineTextureCell[];
  materialSplitCount: number;
  longFlatSpanCount: number;
  runSourceIntensityVariance: Array<{
    min: number;
    max: number;
    cellsInRun: number;
  }>;
} {
  if (cells.length <= 1) {
    const only = cells[0];
    const peak = only ? computeTextureSpanPeakIntensity(only) : 0;
    return {
      merged: cells.map((c) => ({
        ...c,
        runStartTimeBucket: c.timeBucket,
        cellsInRun: 1,
      })),
      materialSplitCount: 0,
      longFlatSpanCount: 0,
      runSourceIntensityVariance: only
        ? [{ min: peak, max: peak, cellsInRun: 1 }]
        : [],
    };
  }

  const byKey = new Map<string, PreparedEngineTextureCell[]>();
  for (const cell of cells) {
    const key = `${cell.side}:${cell.price}`;
    const group = byKey.get(key) ?? [];
    group.push(cell);
    byKey.set(key, group);
  }

  const merged: PreparedEngineTextureCell[] = [];
  const runSourceIntensityVariance: Array<{
    min: number;
    max: number;
    cellsInRun: number;
  }> = [];
  let materialSplitCount = 0;
  let longFlatSpanCount = 0;

  for (const group of Array.from(byKey.values())) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);
    let current: PreparedEngineTextureCell = {
      ...group[0]!,
      runStartTimeBucket: group[0]!.timeBucket,
      cellsInRun: 1,
    };
    let currentEnd =
      current.endTimeBucket ?? current.timeBucket + samplerMs;
    let runMaxSize = current.maxSizeInBucket;
    let runIntensityMin = computeTextureSpanPeakIntensity(current);
    let runIntensityMax = runIntensityMin;
    let cellsInRun = 1;

    const flushRun = () => {
      const intensitySpread = runIntensityMax - runIntensityMin;
      if (
        cellsInRun >= 5 &&
        intensitySpread < 0.06 &&
        current.lifecycleHistorical &&
        (current.lifecycleTextureTier === "trace" ||
          current.lifecycleTextureTier === "normal" ||
          !canCoalesceLifecycleTextureTier(current.lifecycleTextureTier))
      ) {
        longFlatSpanCount += 1;
      }
      if (
        cellsInRun >= 5 &&
        intensitySpread < 0.06 &&
        !current.lifecycleHistorical &&
        (current.textureSourceKind === "base" || !current.textureSourceKind)
      ) {
        recordBaseLongFlatSpanCount(1);
      }
      merged.push({
        ...current,
        endTimeBucket: currentEnd,
        maxSizeInBucket: runMaxSize,
        cellsInRun,
        runStartTimeBucket: current.runStartTimeBucket ?? current.timeBucket,
      });
      runSourceIntensityVariance.push({
        min: runIntensityMin,
        max: runIntensityMax,
        cellsInRun,
      });
    };

    for (let i = 1; i < group.length; i += 1) {
      const next = group[i]!;
      const nextEnd = next.endTimeBucket ?? next.timeBucket + samplerMs;
      const gap = next.timeBucket - currentEnd;
      const materialChange = isMaterialL2SizeChange(
        runMaxSize,
        next.maxSizeInBucket,
      );
      const nextPeak = computeTextureSpanPeakIntensity(next);
      const canMergeLifecycle =
        !current.lifecycleHistorical ||
        !next.lifecycleHistorical ||
        (canCoalesceLifecycleTextureTier(current.lifecycleTextureTier) &&
          canCoalesceLifecycleTextureTier(next.lifecycleTextureTier));
      if (gap <= samplerMs * 2 && !materialChange && canMergeLifecycle) {
        currentEnd = Math.max(currentEnd, nextEnd);
        runMaxSize = Math.max(runMaxSize, next.maxSizeInBucket);
        cellsInRun += 1;
        runIntensityMin = Math.min(runIntensityMin, nextPeak);
        runIntensityMax = Math.max(runIntensityMax, nextPeak);
        current = mergeTextureRunCellPeaks(
          current,
          next,
          currentEnd,
          runMaxSize,
          cellsInRun,
        );
      } else {
        flushRun();
        if (materialChange) materialSplitCount += 1;
        current = {
          ...next,
          runStartTimeBucket: next.timeBucket,
          cellsInRun: 1,
        };
        currentEnd = nextEnd;
        runMaxSize = next.maxSizeInBucket;
        runIntensityMin = nextPeak;
        runIntensityMax = nextPeak;
        cellsInRun = 1;
      }
    }
    flushRun();
  }

  return { merged, materialSplitCount, longFlatSpanCount, runSourceIntensityVariance };
}

function buildTextureBucketSizeLookup(
  cells: PreparedEngineTextureCell[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const cell of cells) {
    const key = `${cell.side}:${cell.price}:${cell.timeBucket}`;
    map.set(key, Math.max(map.get(key) ?? 0, cell.maxSizeInBucket));
  }
  return map;
}

export function subdivideTextureSpanIntoGranularChunks(
  cell: PreparedEngineTextureCell,
  samplerMs: number,
  spanStart: number,
  spanEnd: number,
  peakIntensity?: number,
): PreparedEngineTextureCell[] {
  if (spanEnd <= spanStart) return [];
  const stableIntensity = peakIntensity ?? cell.intensity ?? 0;
  const alphaFloor = cell.historicalRenderAlphaFloor ?? stableIntensity * 0.45;
  const chunks: PreparedEngineTextureCell[] = [];
  let t = spanStart;
  while (t < spanEnd) {
    const end = Math.min(t + samplerMs, spanEnd);
    let chunkIntensity = stableIntensity;
    let chunkAlpha = alphaFloor;
    if (cell.lifecycleHistorical && cell.lifecycleKey) {
      const modulated = applyLifecycleChunkTextureMod(
        stableIntensity,
        alphaFloor,
        cell.lifecycleKey,
        t,
      );
      chunkIntensity = modulated.intensity;
      chunkAlpha = modulated.alpha;
    } else if (BOOKMAP_VISUAL_FORCE_BOOKMAP_LIKE) {
      const gapKey = `${cell.side}:${cell.price}`;
      const modulated = applyStableGapModulation({
        key: gapKey,
        timeBucket: t,
        alpha: alphaFloor,
        intensity: stableIntensity,
        protectedNearTick: false,
        lifecycleTier: cell.lifecycleTextureTier,
        sourceKind: cell.textureSourceKind ?? "base",
      });
      chunkIntensity = modulated.intensity;
      chunkAlpha = modulated.alpha;
    }
    chunks.push({
      ...cell,
      timeBucket: t,
      endTimeBucket: end,
      intensity: chunkIntensity,
      microScalpRenderIntensity: chunkIntensity,
      historicalRenderIntensity: Math.max(
        cell.historicalRenderIntensity ?? 0,
        chunkIntensity,
      ),
      historicalRenderAlphaFloor: chunkAlpha,
    });
    t = end;
  }
  return chunks;
}

export type PrepareL2BandDrawQueueOpts = {
  cells: PreparedEngineTextureCell[];
  regime: BookmapZoomRegime;
  midPrice: number | null;
  dataEndTime: number;
  now: number;
  viewportMaxSize: number;
  visibleStart: number;
  visibleEnd: number;
  historyEnd: number;
  samplerMs: number;
  l2Stats?: BookmapL2BandContinuityStats;
  /** Micro visual hierarchy — historical texture render intensity only. */
  microVisualHierarchyActive?: boolean;
  spanPeakCache?: Map<string, HistoricalTextureSpanPeakLock>;
  visualRegime?: "micro" | "std";
};

export function prepareL2BandDrawQueue(
  opts: PrepareL2BandDrawQueueOpts,
): {
  segments: PreparedL2BandDrawSegment[];
  stableFillByKey: Map<string, StableL2FillEntry>;
  spanColorAudit: HistoricalSpanColorAudit;
} {
  const visualRegime =
    opts.visualRegime ??
    (opts.microVisualHierarchyActive ? "micro" : "std");
  const bucketSizeLookup = buildTextureBucketSizeLookup(opts.cells);
  const { merged, materialSplitCount, runSourceIntensityVariance, longFlatSpanCount } =
    coalesceL2TextureSpans(opts.cells, opts.samplerMs);
  recordLifecycleTexturePrepareStats({
    mergedCount: merged.filter((c) => c.lifecycleHistorical).length,
    renderedCount: merged.filter((c) => c.lifecycleHistorical).length,
    spanDurationsMs: merged
      .filter((c) => c.lifecycleHistorical && c.endTimeBucket != null)
      .map((c) => (c.endTimeBucket ?? c.timeBucket) - c.timeBucket),
    longFlatSpanCount,
  });
  if (opts.l2Stats && materialSplitCount > 0) {
    opts.l2Stats.stableBandsSplitByMaterialSizeChangeCount += materialSplitCount;
  }

  const segments: PreparedL2BandDrawSegment[] = [];
  const stableFillByKey = new Map<string, StableL2FillEntry>();
  let spansWithMixedIntensity = 0;
  let sumIntensityVariance = 0;
  let maxIntensityVariance = 0;
  let spansUsingPeakIntensity = 0;
  let spansDowngradePrevented = 0;
  let sumSpanPeak = 0;
  let sumSpanFinal = 0;
  let multiBucketSpanCount = 0;
  let sumCellsPerSpan = 0;

  for (let runIdx = 0; runIdx < merged.length; runIdx += 1) {
    const cell = merged[runIdx]!;
    const runVariance = runSourceIntensityVariance[runIdx];
    if (runVariance) {
      const variance = runVariance.max - runVariance.min;
      sumIntensityVariance += variance;
      if (variance > maxIntensityVariance) maxIntensityVariance = variance;
      if (variance > 0.015) spansWithMixedIntensity += 1;
      if (runVariance.cellsInRun > 1) multiBucketSpanCount += 1;
      sumCellsPerSpan += runVariance.cellsInRun;
    }
    const naturalEnd =
      cell.endTimeBucket ?? cell.timeBucket + opts.samplerMs;
    const spanStart = Math.max(cell.timeBucket, opts.visibleStart);
    const isActive = naturalEnd >= opts.dataEndTime - opts.samplerMs;
    const closedEnd = Math.min(naturalEnd, opts.historyEnd, opts.visibleEnd);
    const spanEnd = isActive ? opts.visibleEnd : closedEnd;
    if (spanEnd <= spanStart) continue;

    const closedAgeMs = isActive ? 0 : Math.max(0, opts.now - naturalEnd);
    const maxSizeSeen = cell.maxSizeInBucket;
    const stableSizeBtc = computeStableL2SizeReference(
      isActive,
      maxSizeSeen,
      maxSizeSeen,
    );
    const existingRenderIntensity = cell.intensity ?? 0.2;
    const adaptiveIntensity =
      cell.microScalpRenderIntensity != null
        ? Math.max(existingRenderIntensity, cell.microScalpRenderIntensity)
        : existingRenderIntensity;
    const lockedFloor = cell.historicalRenderIntensity ?? 0;
    const baseIntensity = Math.max(adaptiveIntensity, lockedFloor);

    const weight = computeBookmapVisualWeight({
      sizeBtc: stableSizeBtc,
      price: cell.price,
      midPrice: opts.midPrice,
      regime: opts.regime,
      baseIntensity,
      isActive,
      closedAgeMs,
      lifetimeMs: Math.max(0, naturalEnd - cell.timeBucket),
      viewportMaxSize: opts.viewportMaxSize,
    });

    const bandClass = classifyL2BandRenderSpan({
      sizeBtc: stableSizeBtc,
      maxSizeBtc: maxSizeSeen,
      pctFromMid: weight.pctFromMid,
      isActive,
      isWallPullCandidate: weight.isWallPullCandidate,
    });

    const isRelevantL2 = isRelevantL2Liquidity({
      sizeBtc: stableSizeBtc,
      maxSizeBtc: maxSizeSeen,
      pctFromMid: weight.pctFromMid,
      isActive,
      isWallPullCandidate: weight.isWallPullCandidate,
    });

    const usesGranularBlocks =
      allowsL2GranularTexture(bandClass) ||
      shouldForceGranularBookmapTexture(
        cell,
        spanEnd - spanStart,
        opts.samplerMs,
      );

    if (opts.l2Stats) {
      if (isActive && isRelevantL2) {
        opts.l2Stats.relevantActiveL2CandidateCount += 1;
      }
      switch (bandClass) {
        case "stableActiveL2Band":
          opts.l2Stats.stableActiveL2BandCount += 1;
          break;
        case "normalActiveMicroBand":
          opts.l2Stats.normalActiveMicroBandCount += 1;
          break;
        case "closedRelevantHistoryBand":
          opts.l2Stats.closedRelevantHistoryBandCount += 1;
          break;
        case "weakGranularTextureBand":
          opts.l2Stats.weakGranularTextureBandCount += 1;
          break;
      }
      if (bandClass === "stableActiveL2Band" || bandClass === "closedRelevantHistoryBand") {
        opts.l2Stats.stableBandsUsingSingleColorCount += 1;
      }
      if (!isActive && isRelevantL2) {
        opts.l2Stats.pulledRelevantBandCount += 1;
        if (spanEnd <= naturalEnd + 1) {
          opts.l2Stats.pulledRelevantBandsStopAtCloseTimeCount += 1;
        }
        if (spanEnd > naturalEnd + opts.samplerMs) {
          opts.l2Stats.pulledRelevantBandsIncorrectlyExtendRightCount += 1;
        }
      }
      if (usesGranularBlocks && isRelevantL2) {
        opts.l2Stats.granularAppliedToRelevantL2Count += 1;
        opts.l2Stats.granularAppliedToWeakOnly = false;
      }
    }

    const isLargeWall = stableSizeBtc >= WALL_IMPORTANT_BTC;
    const stableIntensity = isLargeWall
      ? mapWallSizeToStableVisualIntensity(stableSizeBtc)
      : Math.max(
          weight.visualIntensity,
          baseIntensity,
          lockedFloor,
        );

    const runStart = cell.runStartTimeBucket ?? cell.timeBucket;
    const spanPeakFromCells = computeTextureSpanPeakIntensity(cell);
    const spanAlphaFloor = computeTextureSpanAlphaFloor(cell);
    const spanPeakSize = cell.maxSizeInBucket;
    const spanLock = resolveHistoricalTextureSpanPeakLock({
      key: historicalTextureRunKey(cell.side, cell.price, runStart, visualRegime),
      currentPeakIntensity: Math.max(stableIntensity, spanPeakFromCells),
      currentAlphaFloor: spanAlphaFloor,
      currentPeakSize: spanPeakSize,
      cache: opts.spanPeakCache,
    });
    if (spanLock.downgradePrevented) spansDowngradePrevented += 1;

    const finalSpanIntensity = Math.max(
      stableIntensity,
      spanPeakFromCells,
      spanLock.peakIntensity,
    );
    spansUsingPeakIntensity += 1;
    sumSpanPeak += spanPeakFromCells;
    sumSpanFinal += finalSpanIntensity;

    const stableAlphaMul = weight.alphaMul;
    const cellsInSpan =
      cell.cellsInRun ??
      Math.max(
        1,
        Math.round((spanEnd - spanStart) / Math.max(1, opts.samplerMs)),
      );

    if (isActive && bandClass === "stableActiveL2Band") {
      stableFillByKey.set(stableL2FillKey(cell.side, cell.price), {
        bandClass,
        stableIntensity,
        stableAlphaMul,
        stableSizeBtc,
        renderMode: isLargeWall ? "wallBand" : "texture",
      });
    }

    const spanRenderGroupKey = `${cell.side}:${cell.price}:${runStart}:${isActive ? "a" : "c"}`;

    const parentSegment: PreparedL2BandDrawSegment = {
      cell,
      bandClass,
      spanStart,
      spanEnd,
      isActive,
      stableSizeBtc,
      stableIntensity: finalSpanIntensity,
      stableAlphaMul,
      closedAgeMs,
      isRelevantL2,
      weight,
      usesGranularBlocks,
      materialSizeSplit: false,
      peakIntensity: finalSpanIntensity,
      alphaFloor: spanLock.alphaFloor,
      peakSizeBtc: spanLock.peakSize,
      cellsInSpan,
      runStartTimeBucket: runStart,
      hasLockedColor: cell.historicalColorLocked === true,
      spanPeakIntensityMode: true,
      sourceIntensityMin: runVariance?.min,
      sourceIntensityMax: runVariance?.max,
      spanRenderGroupKey,
    };

    if (usesGranularBlocks) {
      const chunks = subdivideTextureSpanIntoGranularChunks(
        {
          ...cell,
          intensity: finalSpanIntensity,
          microScalpRenderIntensity: finalSpanIntensity,
          historicalRenderIntensity: finalSpanIntensity,
        },
        opts.samplerMs,
        spanStart,
        spanEnd,
        finalSpanIntensity,
      );
      for (const chunk of chunks) {
        const bucketKey = `${cell.side}:${cell.price}:${chunk.timeBucket}`;
        const chunkSizeBtc =
          bucketSizeLookup.get(bucketKey) ?? chunk.maxSizeInBucket;
        segments.push({
          ...parentSegment,
          spanStart: chunk.timeBucket,
          spanEnd: chunk.endTimeBucket ?? spanEnd,
          cell: chunk,
          chunkSizeBtc,
        });
      }
    } else {
      segments.push({
        ...parentSegment,
        chunkSizeBtc: stableSizeBtc,
      });
    }
  }

  const renderedSpanCount = segments.length;
  const spanColorAudit: HistoricalSpanColorAudit = {
    textureCellCount: opts.cells.length,
    renderedSpanCount,
    multiBucketSpanCount,
    avgCellsPerSpan:
      merged.length > 0 ? Number((sumCellsPerSpan / merged.length).toFixed(2)) : 0,
    spansWithMixedIntensity,
    avgIntensityVarianceWithinSpan:
      merged.length > 0
        ? Number((sumIntensityVariance / merged.length).toFixed(4))
        : 0,
    maxIntensityVarianceWithinSpan: Number(maxIntensityVariance.toFixed(4)),
    spansUsingPeakIntensity,
    spansDowngradePrevented,
    avgSpanPeakIntensity:
      merged.length > 0
        ? Number((sumSpanPeak / merged.length).toFixed(4))
        : 0,
    avgSpanFinalIntensity:
      merged.length > 0
        ? Number((sumSpanFinal / merged.length).toFixed(4))
        : 0,
    historicalSpanColorRetentionOk:
      renderedSpanCount > 0 &&
      spansUsingPeakIntensity / renderedSpanCount >= 0.9,
    historicalSpanColorProblemClassification:
      renderedSpanCount > 0 &&
      spansUsingPeakIntensity / renderedSpanCount >= 0.9
        ? spansWithMixedIntensity > 0
          ? "healthy_span_peak"
          : "healthy"
        : spansWithMixedIntensity > 0
          ? "lock_applied_per_cell_only"
          : "span_peak_not_applied",
  };

  return { segments, stableFillByKey, spanColorAudit };
}

export function buildBookmapP74SpanAudit(
  spanColorAudit: HistoricalSpanColorAudit,
  avgSpanWidthPx = 0,
  continuity?: Pick<
    SpanRenderContinuityAudit,
    "spanBaseLayerEnabled" | "spanContinuityOk"
  >,
  textureBalance?: Pick<
    SpanTextureBalanceAudit,
    | "internalTextureOverlayEnabled"
    | "overlayToBaseAlphaRatio"
    | "bookmapTextureBalanceOk"
  >,
): BookmapP74SpanAudit {
  return {
    renderedSpanCount: spanColorAudit.renderedSpanCount,
    avgCellsPerSpan: spanColorAudit.avgCellsPerSpan,
    avgSpanWidthPx: Number(avgSpanWidthPx.toFixed(2)),
    avgSpanPeakIntensity: spanColorAudit.avgSpanFinalIntensity,
    spanPeakIntensityMode: true,
    spanBaseLayerEnabled:
      continuity?.spanBaseLayerEnabled ?? BOOKMAP_TEXTURE_SPAN_BASE_RENDER_ENABLED,
    internalChunkOverlayAlpha: BOOKMAP_TEXTURE_INTERNAL_CHUNK_OVERLAY_ALPHA,
    spanContinuityOk: continuity?.spanContinuityOk ?? false,
    internalTextureOverlayEnabled:
      textureBalance?.internalTextureOverlayEnabled ?? false,
    overlayToBaseAlphaRatio:
      textureBalance?.overlayToBaseAlphaRatio ?? 0,
    bookmapTextureBalanceOk:
      textureBalance?.bookmapTextureBalanceOk ?? false,
  };
}

export function createEmptySpanTextureBalanceAudit(): SpanTextureBalanceAudit {
  return {
    renderedSpanCount: 0,
    spanBaseLayerEnabled: BOOKMAP_TEXTURE_SPAN_BASE_RENDER_ENABLED,
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
  };
}

export function createEmptySpanRenderContinuityAudit(): SpanRenderContinuityAudit {
  return {
    renderedSpanCount: 0,
    renderedChunkCount: 0,
    avgChunksPerSpan: 0,
    maxChunksPerSpan: 0,
    spansRenderedAsSingleRect: 0,
    spansRenderedAsChunks: 0,
    chunkFragmentationDetected: false,
    avgSpanWidthPx: 0,
    avgChunkWidthPx: 0,
    spanBaseLayerEnabled: BOOKMAP_TEXTURE_SPAN_BASE_RENDER_ENABLED,
    spanTextureOverlayEnabled: false,
    spanContinuityOk: false,
    problemClassification: "pending",
  };
}

export function buildPassiveLiquidityAlphaContext(opts: {
  intensity: number;
  isActive: boolean;
  bandClass?: L2BandRenderClass;
  closedAgeMs?: number;
  isRightContinuation?: boolean;
  weight?: BookmapVisualWeightResult;
  stableSizeBtc?: number;
}): PassiveLiquidityAlphaContext {
  const isRelevantL2 =
    opts.bandClass === "stableActiveL2Band" ||
    opts.bandClass === "closedRelevantHistoryBand" ||
    (opts.stableSizeBtc ?? 0) >= WALL_IMPORTANT_BTC;
  return {
    intensity: opts.intensity,
    isActive: opts.isActive,
    isRelevantL2,
    isWeakGranular: opts.bandClass === "weakGranularTextureBand",
    closedAgeMs: opts.closedAgeMs,
    isRightContinuation: opts.isRightContinuation,
    farDistanceFade: isRelevantL2 ? 1 : opts.weight?.farDistanceFade,
  };
}

export type BookmapPaletteParityStats = {
  paletteFixEnabled: boolean;
  activeBandMinAlpha: number;
  activeBandMaxAlpha: number;
  closedBandMinAlpha: number;
  closedBandMaxAlpha: number;
  weakBandCount: number;
  mediumBandCount: number;
  strongBandCount: number;
  extremeBandCount: number;
  weakBandsTooTransparentCount: number;
  strongBandsTooTransparentCount: number;
  activeRelevantBandsWashedOutCount: number;
  liveRightContinuationCount: number;
  liveRightContinuationToneMismatchCount: number;
  liveRightContinuationAlphaMismatchCount: number;
  zoomRegime: BookmapZoomRegime;
  nearPriceContrastBoostActive: boolean;
  farLiquidityFadeActive: boolean;
};

export type BookmapPaletteParityTruth = BookmapPaletteParityStats & {
  paletteUsesBookmapStyleRamp: boolean;
  opacityHierarchyOk: boolean;
  rightContinuationVisualMatchOk: boolean;
  relevantActiveBandsSolidEnough: boolean;
  paletteParityOk: boolean;
};

export function createEmptyBookmapPaletteParityStats(
  zoomRegime: BookmapZoomRegime = "micro",
): BookmapPaletteParityStats {
  return {
    paletteFixEnabled: true,
    activeBandMinAlpha: Number.POSITIVE_INFINITY,
    activeBandMaxAlpha: 0,
    closedBandMinAlpha: Number.POSITIVE_INFINITY,
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
    zoomRegime,
    nearPriceContrastBoostActive: false,
    farLiquidityFadeActive: false,
  };
}

export function recordBookmapPaletteParitySample(
  stats: BookmapPaletteParityStats,
  opts: {
    intensity: number;
    alpha: number;
    isActive: boolean;
    isRelevantL2?: boolean;
    isRightContinuation?: boolean;
    historicalAlpha?: number;
    regime?: BookmapZoomRegime;
    nearPriceBoost?: boolean;
    farFade?: number;
  },
): void {
  const bucket = classifyPassiveIntensityBucket(opts.intensity);
  switch (bucket) {
    case "weak":
      stats.weakBandCount += 1;
      break;
    case "medium":
      stats.mediumBandCount += 1;
      break;
    case "strong":
      stats.strongBandCount += 1;
      break;
    case "extreme":
      stats.extremeBandCount += 1;
      break;
  }

  if (opts.isActive) {
    stats.activeBandMinAlpha = Math.min(stats.activeBandMinAlpha, opts.alpha);
    stats.activeBandMaxAlpha = Math.max(stats.activeBandMaxAlpha, opts.alpha);
    if (bucket === "weak" && opts.alpha < PALETTE_ALPHA_ACTIVE_WEAK_MIN - 0.04) {
      stats.weakBandsTooTransparentCount += 1;
    }
    if (
      (bucket === "strong" || bucket === "extreme") &&
      opts.alpha < PALETTE_STRONG_BAND_ALPHA_FLOOR
    ) {
      stats.strongBandsTooTransparentCount += 1;
    }
    if (
      opts.isRelevantL2 &&
      opts.alpha < PALETTE_RELEVANT_L2_ALPHA_FLOOR
    ) {
      stats.activeRelevantBandsWashedOutCount += 1;
    }
  } else {
    stats.closedBandMinAlpha = Math.min(stats.closedBandMinAlpha, opts.alpha);
    stats.closedBandMaxAlpha = Math.max(stats.closedBandMaxAlpha, opts.alpha);
  }

  if (opts.isRightContinuation) {
    stats.liveRightContinuationCount += 1;
    if (
      opts.historicalAlpha != null &&
      Math.abs(opts.alpha - opts.historicalAlpha) > 0.22
    ) {
      stats.liveRightContinuationAlphaMismatchCount += 1;
    }
  }

  if (opts.regime) stats.zoomRegime = opts.regime;
  if (opts.nearPriceBoost) stats.nearPriceContrastBoostActive = true;
  if (opts.farFade != null && opts.farFade < 0.95) {
    stats.farLiquidityFadeActive = true;
  }
}

export function buildBookmapPaletteParityTruth(
  stats: BookmapPaletteParityStats,
): BookmapPaletteParityTruth {
  const paletteUsesBookmapStyleRamp = stats.paletteFixEnabled;
  const opacityHierarchyOk =
    stats.strongBandsTooTransparentCount === 0 &&
    stats.activeRelevantBandsWashedOutCount === 0 &&
    stats.activeBandMaxAlpha >= PALETTE_STRONG_BAND_ALPHA_FLOOR;
  const rightContinuationVisualMatchOk =
    stats.liveRightContinuationAlphaMismatchCount === 0 &&
    stats.liveRightContinuationToneMismatchCount === 0;
  const relevantActiveBandsSolidEnough =
    stats.activeRelevantBandsWashedOutCount === 0;
  const paletteParityOk =
    paletteUsesBookmapStyleRamp &&
    opacityHierarchyOk &&
    rightContinuationVisualMatchOk &&
    relevantActiveBandsSolidEnough &&
    stats.strongBandsTooTransparentCount === 0;

  const activeBandMinAlpha = Number.isFinite(stats.activeBandMinAlpha)
    ? stats.activeBandMinAlpha
    : 0;
  const closedBandMinAlpha = Number.isFinite(stats.closedBandMinAlpha)
    ? stats.closedBandMinAlpha
    : 0;

  return {
    ...stats,
    activeBandMinAlpha: Number(activeBandMinAlpha.toFixed(4)),
    closedBandMinAlpha: Number(closedBandMinAlpha.toFixed(4)),
    activeBandMaxAlpha: Number(stats.activeBandMaxAlpha.toFixed(4)),
    closedBandMaxAlpha: Number(stats.closedBandMaxAlpha.toFixed(4)),
    paletteUsesBookmapStyleRamp,
    opacityHierarchyOk,
    rightContinuationVisualMatchOk,
    relevantActiveBandsSolidEnough,
    paletteParityOk,
  };
}

export type BookmapMicroVisualHierarchyStats = {
  visibleTextureCellCount: number;
  nearTouchCellCount: number;
  mediumCellCount_2to10: number;
  strongCellCount_10to30: number;
  majorCellCount_30plus: number;
  sumExistingIntensity: number;
  sumMicroDataIntensity: number;
  sumMicroRenderIntensity: number;
  sumNearTouchRender: number;
  sumMediumRender: number;
  sumStrongRender: number;
  sumMajorRender: number;
  sumHistoricalAlpha: number;
  sampleCount: number;
};

export type BookmapMicroVisualHierarchyTruth = MicroScalpVisualContext & {
  visibleTextureCellCount: number;
  nearTouchCellCount: number;
  mediumCellCount_2to10: number;
  strongCellCount_10to30: number;
  majorCellCount_30plus: number;
  avgExistingIntensity: number;
  avgMicroDataIntensity: number;
  avgMicroRenderIntensity: number;
  nearTouchAvgRenderIntensity: number;
  mediumRenderAvg: number;
  strongRenderAvg: number;
  majorRenderAvg: number;
  avgHistoricalTextureAlpha: number;
  microAlphaMul: number;
  mediumVisible: boolean;
  strongVisible: boolean;
  hierarchyGap_mediumToStrong: number;
  hierarchyGap_strongToMajor: number;
  overbrightRisk: boolean;
  microHierarchyOk: boolean;
};

export function createEmptyBookmapMicroVisualHierarchyStats(): BookmapMicroVisualHierarchyStats {
  return {
    visibleTextureCellCount: 0,
    nearTouchCellCount: 0,
    mediumCellCount_2to10: 0,
    strongCellCount_10to30: 0,
    majorCellCount_30plus: 0,
    sumExistingIntensity: 0,
    sumMicroDataIntensity: 0,
    sumMicroRenderIntensity: 0,
    sumNearTouchRender: 0,
    sumMediumRender: 0,
    sumStrongRender: 0,
    sumMajorRender: 0,
    sumHistoricalAlpha: 0,
    sampleCount: 0,
  };
}

export function recordBookmapMicroVisualHierarchySample(
  stats: BookmapMicroVisualHierarchyStats,
  opts: {
    sizeBtc: number;
    existingIntensity: number;
    microDataIntensity: number;
    microRenderIntensity: number;
    historicalAlpha: number;
    nearTouch: boolean;
  },
): void {
  stats.visibleTextureCellCount += 1;
  stats.sampleCount += 1;
  stats.sumExistingIntensity += opts.existingIntensity;
  stats.sumMicroDataIntensity += opts.microDataIntensity;
  stats.sumMicroRenderIntensity += opts.microRenderIntensity;
  stats.sumHistoricalAlpha += opts.historicalAlpha;

  if (opts.nearTouch) {
    stats.nearTouchCellCount += 1;
    stats.sumNearTouchRender += opts.microRenderIntensity;
  }
  if (opts.sizeBtc >= 2 && opts.sizeBtc < 10) {
    stats.mediumCellCount_2to10 += 1;
    stats.sumMediumRender += opts.microRenderIntensity;
  } else if (opts.sizeBtc >= 10 && opts.sizeBtc < 30) {
    stats.strongCellCount_10to30 += 1;
    stats.sumStrongRender += opts.microRenderIntensity;
  } else if (opts.sizeBtc >= 30) {
    stats.majorCellCount_30plus += 1;
    stats.sumMajorRender += opts.microRenderIntensity;
  }
}

export function buildBookmapMicroVisualHierarchyTruth(
  stats: BookmapMicroVisualHierarchyStats,
  ctx: MicroScalpVisualContext,
): BookmapMicroVisualHierarchyTruth {
  const n = Math.max(1, stats.sampleCount);
  const avgExistingIntensity = stats.sumExistingIntensity / n;
  const avgMicroDataIntensity = stats.sumMicroDataIntensity / n;
  const avgMicroRenderIntensity = stats.sumMicroRenderIntensity / n;
  const nearTouchAvgRenderIntensity =
    stats.nearTouchCellCount > 0
      ? stats.sumNearTouchRender / stats.nearTouchCellCount
      : 0;
  const mediumRenderAvg =
    stats.mediumCellCount_2to10 > 0
      ? stats.sumMediumRender / stats.mediumCellCount_2to10
      : 0;
  const strongRenderAvg =
    stats.strongCellCount_10to30 > 0
      ? stats.sumStrongRender / stats.strongCellCount_10to30
      : 0;
  const majorRenderAvg =
    stats.majorCellCount_30plus > 0
      ? stats.sumMajorRender / stats.majorCellCount_30plus
      : 0;
  const avgHistoricalTextureAlpha = stats.sumHistoricalAlpha / n;

  const hierarchyGap_mediumToStrong = strongRenderAvg - mediumRenderAvg;
  const hierarchyGap_strongToMajor = majorRenderAvg - strongRenderAvg;
  const mediumVisible =
    stats.mediumCellCount_2to10 > 0 &&
    mediumRenderAvg >= 0.28 &&
    mediumRenderAvg <= 0.48;
  const strongVisible =
    stats.strongCellCount_10to30 > 0 &&
    strongRenderAvg >= 0.52 &&
    strongRenderAvg <= 0.7;
  const overbrightRisk =
    mediumRenderAvg > 0.65 ||
    majorRenderAvg > 0.92 ||
    avgMicroRenderIntensity > 0.75;
  const microHierarchyOk =
    ctx.microScalpMode &&
    (stats.mediumCellCount_2to10 === 0 || mediumVisible) &&
    (stats.strongCellCount_10to30 === 0 || strongVisible) &&
    (stats.majorCellCount_30plus === 0 ||
      (majorRenderAvg >= 0.7 && majorRenderAvg <= 0.9)) &&
    (stats.mediumCellCount_2to10 === 0 ||
      stats.strongCellCount_10to30 === 0 ||
      hierarchyGap_mediumToStrong >= 0.12) &&
    (stats.strongCellCount_10to30 === 0 ||
      stats.majorCellCount_30plus === 0 ||
      hierarchyGap_strongToMajor >= 0.1) &&
    !overbrightRisk;

  const round4 = (v: number) => Number(v.toFixed(4));

  return {
    ...ctx,
    visibleTextureCellCount: stats.visibleTextureCellCount,
    nearTouchCellCount: stats.nearTouchCellCount,
    mediumCellCount_2to10: stats.mediumCellCount_2to10,
    strongCellCount_10to30: stats.strongCellCount_10to30,
    majorCellCount_30plus: stats.majorCellCount_30plus,
    avgExistingIntensity: round4(avgExistingIntensity),
    avgMicroDataIntensity: round4(avgMicroDataIntensity),
    avgMicroRenderIntensity: round4(avgMicroRenderIntensity),
    nearTouchAvgRenderIntensity: round4(nearTouchAvgRenderIntensity),
    mediumRenderAvg: round4(mediumRenderAvg),
    strongRenderAvg: round4(strongRenderAvg),
    majorRenderAvg: round4(majorRenderAvg),
    avgHistoricalTextureAlpha: round4(avgHistoricalTextureAlpha),
    microAlphaMul: MICRO_TEXTURE_ALPHA_MUL,
    mediumVisible,
    strongVisible,
    hierarchyGap_mediumToStrong: round4(hierarchyGap_mediumToStrong),
    hierarchyGap_strongToMajor: round4(hierarchyGap_strongToMajor),
    overbrightRisk,
    microHierarchyOk,
  };
}

export function buildBookmapL2BandContinuityTruth(
  stats: BookmapL2BandContinuityStats,
): BookmapL2BandContinuityTruth {
  const stableL2BandContinuityOk =
    stats.stableBandsIncorrectlySplitByChunkColorCount === 0 &&
    stats.granularAppliedToRelevantL2Count === 0;
  const rightEdgeContinuityOk = stats.rightEdgeColorMismatchCount === 0;
  const pulledL2HistoryOk =
    stats.pulledRelevantBandsIncorrectlyExtendRightCount === 0;
  const l2BandVisualOk =
    stableL2BandContinuityOk &&
    rightEdgeContinuityOk &&
    pulledL2HistoryOk &&
    stats.l2BandContinuityFixEnabled;

  return {
    ...stats,
    stableL2BandContinuityOk,
    rightEdgeContinuityOk,
    pulledL2HistoryOk,
    l2BandVisualOk,
  };
}

export function recordBookmapVisualAlphaSample(
  stats: BookmapVisualRenderStats,
  opts: {
    alpha: number;
    pctFromMid: number;
    isActive: boolean;
    closedAgeMs: number;
    isRecentPullCandidate: boolean;
    isWallPullCandidate: boolean;
    isRightSide?: boolean;
    regime: BookmapZoomRegime;
  },
): void {
  stats.viewportVisibleSpanCount += 1;
  if (opts.isActive) stats.viewportActiveSpanCount += 1;
  else stats.viewportClosedSpanCount += 1;

  const near = opts.pctFromMid <= 0.5;
  const recentClosed = !opts.isActive && opts.closedAgeMs < 60_000;

  if (opts.isActive) {
    if (near) {
      stats.activeNearAlphaSum += opts.alpha;
      stats.activeNearAlphaCount += 1;
    } else {
      stats.activeFarAlphaSum += opts.alpha;
      stats.activeFarAlphaCount += 1;
    }
  } else if (recentClosed) {
    stats.closedRecentAlphaSum += opts.alpha;
    stats.closedRecentAlphaCount += 1;
  } else {
    stats.closedOldAlphaSum += opts.alpha;
    stats.closedOldAlphaCount += 1;
  }

  if (opts.isRecentPullCandidate) stats.recentPullCandidateCount += 1;
  if (opts.isWallPullCandidate) stats.wallPullVisualCandidateCount += 1;
  if (opts.isRightSide) {
    stats.rightSideDrawCount += 1;
    stats.rightSideAlphaSum += opts.alpha;
  }
  if (opts.regime === "micro") stats.microZoomBoostApplied = true;
  if (opts.regime === "scalp" || opts.regime === "ultra_micro") {
    stats.scalpZoomBoostApplied = true;
  }
}

export function buildBookmapVisualParityTruth(opts: {
  minPrice: number;
  maxPrice: number;
  renderStats: BookmapVisualRenderStats;
  perpFilterEnabled: boolean;
  perpFilterOk: boolean;
  perpDensityTooHigh: boolean;
}): BookmapVisualParityTruth {
  const visiblePriceRangePct = computeVisiblePriceRangePct(
    opts.minPrice,
    opts.maxPrice,
  );
  const zoomRegime = resolveZoomRegime(visiblePriceRangePct);

  const activeNearAvgAlpha =
    opts.renderStats.activeNearAlphaCount > 0
      ? opts.renderStats.activeNearAlphaSum /
        opts.renderStats.activeNearAlphaCount
      : 0;
  const activeFarAvgAlpha =
    opts.renderStats.activeFarAlphaCount > 0
      ? opts.renderStats.activeFarAlphaSum / opts.renderStats.activeFarAlphaCount
      : 0;
  const closedRecentAvgAlpha =
    opts.renderStats.closedRecentAlphaCount > 0
      ? opts.renderStats.closedRecentAlphaSum /
        opts.renderStats.closedRecentAlphaCount
      : 0;
  const closedOldAvgAlpha =
    opts.renderStats.closedOldAlphaCount > 0
      ? opts.renderStats.closedOldAlphaSum / opts.renderStats.closedOldAlphaCount
      : 0;

  const nearVsFarAlphaRatio =
    activeFarAvgAlpha > 0.001
      ? activeNearAvgAlpha / activeFarAvgAlpha
      : activeNearAvgAlpha > 0
        ? 99
        : 0;

  const activeAvg =
    opts.renderStats.activeNearAlphaCount + opts.renderStats.activeFarAlphaCount >
    0
      ? (opts.renderStats.activeNearAlphaSum +
          opts.renderStats.activeFarAlphaSum) /
        (opts.renderStats.activeNearAlphaCount +
          opts.renderStats.activeFarAlphaCount)
      : 0;
  const closedAvg =
    opts.renderStats.closedRecentAlphaCount +
      opts.renderStats.closedOldAlphaCount >
    0
      ? (opts.renderStats.closedRecentAlphaSum +
          opts.renderStats.closedOldAlphaSum) /
        (opts.renderStats.closedRecentAlphaCount +
          opts.renderStats.closedOldAlphaCount)
      : 0;
  const activeVsClosedAlphaRatio =
    closedAvg > 0.001 ? activeAvg / closedAvg : activeAvg > 0 ? 99 : 0;

  const granularRatio =
    opts.renderStats.granularDrawCount + opts.renderStats.continuousDrawCount > 0
      ? opts.renderStats.granularDrawCount /
        (opts.renderStats.granularDrawCount +
          opts.renderStats.continuousDrawCount)
      : 0;
  const textureLooksGranular =
    opts.renderStats.granularDrawCount >= 8 && granularRatio >= 0.22;
  const textureLooksStripedOnly =
    opts.renderStats.continuousDrawCount > 0 &&
    opts.renderStats.granularDrawCount < 4;

  const rightSideAvgAlpha =
    opts.renderStats.rightSideDrawCount > 0
      ? opts.renderStats.rightSideAlphaSum / opts.renderStats.rightSideDrawCount
      : 0;
  const rightSideFeelsContinuous =
    opts.renderStats.rightSideDrawCount === 0 ||
    (activeNearAvgAlpha > 0 &&
      Math.abs(rightSideAvgAlpha - activeNearAvgAlpha) / activeNearAvgAlpha <
        0.55);
  const rightSideLooksOverlayed =
    opts.renderStats.rightSideDrawCount > 0 &&
    activeNearAvgAlpha > 0 &&
    rightSideAvgAlpha < activeNearAvgAlpha * 0.35;

  const perpFilterAligned =
    !opts.perpFilterEnabled || (opts.perpFilterOk && !opts.perpDensityTooHigh);
  const historicalTextureGranular = textureLooksGranular;
  const rightSideContinuityOk =
    opts.renderStats.rightSideDrawCount === 0 || rightSideFeelsContinuous;
  const adaptiveColorHierarchyEnabled =
    opts.renderStats.usesAbsoluteSizeComponent &&
    opts.renderStats.usesViewportRelativeSizeComponent &&
    opts.renderStats.usesDistanceWeighting;
  const visualFloodingInPerp =
    opts.perpFilterEnabled && opts.perpDensityTooHigh;

  const nearFarThreshold =
    zoomRegime === "macro" ? 1.3 : 1.8;

  const visualParityOk =
    perpFilterAligned &&
    historicalTextureGranular &&
    rightSideContinuityOk &&
    adaptiveColorHierarchyEnabled &&
    nearVsFarAlphaRatio > nearFarThreshold &&
    activeVsClosedAlphaRatio > 2 &&
    !textureLooksStripedOnly &&
    textureLooksGranular &&
    !rightSideLooksOverlayed &&
    rightSideFeelsContinuous &&
    !visualFloodingInPerp;

  return {
    perpFilterAligned,
    historicalTextureGranular,
    rightSideContinuityOk,
    adaptiveColorHierarchyEnabled,
    visiblePriceRangePct: Number(visiblePriceRangePct.toFixed(3)),
    zoomRegime,
    viewportVisibleSpanCount: opts.renderStats.viewportVisibleSpanCount,
    viewportActiveSpanCount: opts.renderStats.viewportActiveSpanCount,
    viewportClosedSpanCount: opts.renderStats.viewportClosedSpanCount,
    usesAbsoluteSizeComponent: opts.renderStats.usesAbsoluteSizeComponent,
    usesViewportRelativeSizeComponent:
      opts.renderStats.usesViewportRelativeSizeComponent,
    usesDistanceWeighting: opts.renderStats.usesDistanceWeighting,
    usesClosedAgeWeighting: opts.renderStats.usesClosedAgeWeighting,
    usesRecentPullWeighting: opts.renderStats.usesRecentPullWeighting,
    activeNearAvgAlpha: Number(activeNearAvgAlpha.toFixed(4)),
    activeFarAvgAlpha: Number(activeFarAvgAlpha.toFixed(4)),
    closedRecentAvgAlpha: Number(closedRecentAvgAlpha.toFixed(4)),
    closedOldAvgAlpha: Number(closedOldAvgAlpha.toFixed(4)),
    nearVsFarAlphaRatio: Number(nearVsFarAlphaRatio.toFixed(3)),
    activeVsClosedAlphaRatio: Number(activeVsClosedAlphaRatio.toFixed(3)),
    recentPullCandidateCount: opts.renderStats.recentPullCandidateCount,
    wallPullVisualCandidateCount: opts.renderStats.wallPullVisualCandidateCount,
    textureLooksStripedOnly,
    textureLooksGranular,
    rightSideLooksOverlayed,
    rightSideFeelsContinuous,
    visualFloodingInPerp,
    microZoomBoostApplied: opts.renderStats.microZoomBoostApplied,
    scalpZoomBoostApplied: opts.renderStats.scalpZoomBoostApplied,
    visualParityOk,
  };
}

/** Phase 6A — render-only PERP span (maps texture / projection; registry untouched). */
export type PerpRenderSpanKind = "active" | "closed";

export type PerpRenderSpan = {
  kind: PerpRenderSpanKind;
  price: number;
  side: "bid" | "ask";
  sizeBtc: number;
  firstSeenTime: number;
  lastSeenTime: number;
  updateCount: number;
  lifetimeMs: number;
  textureCell?: PreparedEngineTextureCell;
  projectionLevel?: PreparedLiveProjectionLevel;
};

export type PerpRenderFilterResult = {
  textureCells: PreparedEngineTextureCell[];
  projectionLevels: PreparedLiveProjectionLevel[];
  truth: BookmapPerpFilterTruth;
};

export type BookmapPerpFilterTruth = {
  perpFilterEnabled: boolean;
  activeCandidatesBeforePerpFilter: number;
  closedCandidatesBeforePerpFilter: number;
  activeAfterPerpFilter: number;
  closedAfterPerpFilter: number;
  activeDroppedByPerpSizeDistance: number;
  closedDroppedByPerpAgeSizeDistance: number;
  activeDroppedByPerpRowSuppression: number;
  closedDroppedByPerpRowSuppression: number;
  perpActiveCap: number;
  perpClosedCap: number;
  renderedPerpActiveSpanCount: number;
  renderedPerpClosedSpanCount: number;
  renderedPerpTotalSpanCount: number;
  perpStripeSaturationPct: number;
  perpDensityTooHigh: boolean;
  perpFilterOk: boolean;
};

const EMPTY_PERP_FILTER_TRUTH: BookmapPerpFilterTruth = {
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
};

export function resolvePerpRenderFilterTarget(
  sourceMode: BookmapSourceMode,
  activeDomMarket: BookmapMarketSource,
  layer: "primary" | "overlay",
): boolean {
  if (sourceMode === "perp") return layer === "primary";
  if (sourceMode === "both") {
    if (activeDomMarket === "perp") return layer === "primary";
    return layer === "overlay";
  }
  return false;
}

function pctDistanceFromMid(price: number, midPrice: number | null): number {
  if (midPrice == null || midPrice <= 0) return 100;
  return (Math.abs(price - midPrice) / midPrice) * 100;
}

function perpActiveMinSizeBtc(
  pctFromMid: number,
  regime: BookmapZoomRegime,
): number {
  switch (regime) {
    case "ultra_micro":
      if (pctFromMid <= 0.25) return 2;
      if (pctFromMid <= 0.5) return 5;
      if (pctFromMid <= 1) return 15;
      return 40;
    case "scalp":
      if (pctFromMid <= 0.25) return 1.8;
      if (pctFromMid <= 0.5) return 4;
      if (pctFromMid <= 1) return 10;
      return 30;
    case "micro":
      if (pctFromMid <= 0.25) return 1.5;
      if (pctFromMid <= 0.5) return 3.5;
      if (pctFromMid <= 1) return 9;
      return 25;
    default:
      if (pctFromMid <= 0.25) return 1.5;
      if (pctFromMid <= 0.5) return 3;
      if (pctFromMid <= 1) return 8;
      return 20;
  }
}

function passesPerpActiveSpanFilter(
  sizeBtc: number,
  pctFromMid: number,
  regime: BookmapZoomRegime,
): boolean {
  return sizeBtc >= perpActiveMinSizeBtc(pctFromMid, regime);
}

function passesPerpClosedSpanFilter(
  sizeBtc: number,
  pctFromMid: number,
  ageMs: number,
  lifetimeMs: number,
  regime: BookmapZoomRegime,
): boolean {
  if (lifetimeMs < PERP_RENDER_MIN_LIFETIME_MS) return false;
  const nearBoost =
    regime === "ultra_micro" || regime === "scalp" ? 1.15 : 1;
  if (ageMs < 30_000) {
    if (pctFromMid <= 0.5 && sizeBtc >= 6 * nearBoost) return true;
    if (pctFromMid <= 1 && sizeBtc >= 12 * nearBoost) return true;
    if (regime === "macro" && pctFromMid <= 2 && sizeBtc >= 20) return true;
    return false;
  }
  if (ageMs <= 90_000) {
    if (pctFromMid <= 0.5 && sizeBtc >= 12 * nearBoost) return true;
    if (regime !== "ultra_micro" && pctFromMid <= 1 && sizeBtc >= 18) {
      return true;
    }
    return false;
  }
  return sizeBtc >= (regime === "macro" ? 25 : 30);
}

function perpSpanPriority(
  span: PerpRenderSpan,
  midPrice: number | null,
  now: number,
): number {
  const pct = pctDistanceFromMid(span.price, midPrice);
  const nearScore = Math.max(0, 4 - pct * 0.8);
  const sizeScore = Math.sqrt(Math.max(0, span.sizeBtc));
  const recency =
    span.kind === "active"
      ? 2.5
      : Math.max(0, 1.2 - Math.max(0, now - span.lastSeenTime) / 120_000);
  const updateScore = Math.min(2, Math.log1p(span.updateCount));
  return nearScore * 0.38 + sizeScore * 0.34 + recency * 0.18 + updateScore * 0.1;
}

function textureCellToPerpSpan(
  cell: PreparedEngineTextureCell,
  dataEndTime: number,
  now: number,
): PerpRenderSpan {
  const end =
    cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS;
  const lifetimeMs = Math.max(0, end - cell.timeBucket);
  const updateCount = Math.max(
    1,
    Math.round(lifetimeMs / BOOKMAP_TEXTURE_SAMPLER_MS),
  );
  const isActive = end >= dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS;
  return {
    kind: isActive ? "active" : "closed",
    price: cell.price,
    side: cell.side,
    sizeBtc: cell.maxSizeInBucket,
    firstSeenTime: cell.timeBucket,
    lastSeenTime: end,
    updateCount,
    lifetimeMs,
    textureCell: cell,
  };
}

function projectionLevelToPerpSpan(level: PreparedLiveProjectionLevel): PerpRenderSpan {
  const now = Date.now();
  return {
    kind: "active",
    price: level.price,
    side: level.side,
    sizeBtc: level.sizeBtc,
    firstSeenTime: now,
    lastSeenTime: now,
    updateCount: 1,
    lifetimeMs: PERP_RENDER_MIN_LIFETIME_MS,
    projectionLevel: level,
  };
}

function applyPerpSpanCaps(
  active: PerpRenderSpan[],
  closed: PerpRenderSpan[],
  midPrice: number | null,
  now: number,
): { active: PerpRenderSpan[]; closed: PerpRenderSpan[] } {
  const rank = (spans: PerpRenderSpan[]) =>
    [...spans]
      .map((span) => ({ span, score: perpSpanPriority(span, midPrice, now) }))
      .sort((a, b) => b.score - a.score)
      .map((row) => row.span);

  return {
    active: rank(active).slice(0, PERP_RENDER_ACTIVE_CAP),
    closed: rank(closed).slice(0, PERP_RENDER_CLOSED_CAP),
  };
}

function applyPerpRowSuppression(
  active: PerpRenderSpan[],
  closed: PerpRenderSpan[],
  priceToY: (price: number) => number,
): {
  active: PerpRenderSpan[];
  closed: PerpRenderSpan[];
  activeDropped: number;
  closedDropped: number;
} {
  const rowOf = (price: number) =>
    Math.round(priceToY(price) / PERP_RENDER_ROW_MIN_GAP_PX);

  const activeByRow = new Map<number, PerpRenderSpan>();
  let activeDropped = 0;
  for (const span of active) {
    const row = rowOf(span.price);
    const prev = activeByRow.get(row);
    if (!prev) {
      activeByRow.set(row, span);
      continue;
    }
    if (span.sizeBtc > prev.sizeBtc) {
      activeByRow.set(row, span);
    } else {
      activeDropped += 1;
    }
  }

  const keptActive = Array.from(activeByRow.values());
  const activeRows = new Set(activeByRow.keys());
  const closedByRow = new Map<number, PerpRenderSpan>();
  let closedDropped = 0;

  for (const span of closed) {
    const row = rowOf(span.price);
    if (activeRows.has(row)) {
      closedDropped += 1;
      continue;
    }
    const prev = closedByRow.get(row);
    if (!prev) {
      closedByRow.set(row, span);
      continue;
    }
    if (span.sizeBtc > prev.sizeBtc) {
      closedByRow.set(row, span);
    } else {
      closedDropped += 1;
    }
  }

  return {
    active: keptActive,
    closed: Array.from(closedByRow.values()),
    activeDropped,
    closedDropped,
  };
}

export function applyPerpRenderSpanFilter(opts: {
  textureCells: PreparedEngineTextureCell[];
  projectionLevels: PreparedLiveProjectionLevel[];
  midPrice: number | null;
  dataEndTime: number;
  now?: number;
  priceToY: (price: number) => number;
  plotHeightPx: number;
  enabled: boolean;
  minPrice?: number;
  maxPrice?: number;
  zoomRegime?: BookmapZoomRegime;
}): PerpRenderFilterResult {
  if (!opts.enabled) {
    return {
      textureCells: opts.textureCells,
      projectionLevels: opts.projectionLevels,
      truth: { ...EMPTY_PERP_FILTER_TRUTH },
    };
  }

  const now = opts.now ?? Date.now();
  const zoomRegime =
    opts.zoomRegime ??
    (opts.minPrice != null && opts.maxPrice != null
      ? resolveZoomRegime(
          computeVisiblePriceRangePct(opts.minPrice, opts.maxPrice),
        )
      : "micro");
  const candidates: PerpRenderSpan[] = [
    ...opts.textureCells.map((cell) =>
      textureCellToPerpSpan(cell, opts.dataEndTime, now),
    ),
    ...opts.projectionLevels.map(projectionLevelToPerpSpan),
  ];

  const activeCandidates = candidates.filter((s) => s.kind === "active");
  const closedCandidates = candidates.filter((s) => s.kind === "closed");

  let activeDroppedBySize = 0;
  let closedDroppedByAgeSize = 0;

  const activeFiltered = activeCandidates.filter((span) => {
    const pct = pctDistanceFromMid(span.price, opts.midPrice);
    const ok = passesPerpActiveSpanFilter(span.sizeBtc, pct, zoomRegime);
    if (!ok) activeDroppedBySize += 1;
    return ok;
  });

  const closedFiltered = closedCandidates.filter((span) => {
    const pct = pctDistanceFromMid(span.price, opts.midPrice);
    const ageMs = Math.max(0, now - span.lastSeenTime);
    const ok = passesPerpClosedSpanFilter(
      span.sizeBtc,
      pct,
      ageMs,
      span.lifetimeMs,
      zoomRegime,
    );
    if (!ok) closedDroppedByAgeSize += 1;
    return ok;
  });

  const capped = applyPerpSpanCaps(
    activeFiltered,
    closedFiltered,
    opts.midPrice,
    now,
  );

  const rowSuppressed = applyPerpRowSuppression(
    capped.active,
    capped.closed,
    opts.priceToY,
  );

  const textureCells: PreparedEngineTextureCell[] = [];
  const projectionLevels: PreparedLiveProjectionLevel[] = [];
  const seenTexture = new Set<string>();
  const seenProjection = new Set<string>();

  for (const span of [...rowSuppressed.active, ...rowSuppressed.closed]) {
    if (span.textureCell) {
      const key = `${span.textureCell.side}:${span.textureCell.price}:${span.textureCell.timeBucket}`;
      if (!seenTexture.has(key)) {
        seenTexture.add(key);
        const pct = pctDistanceFromMid(span.price, opts.midPrice);
        const weight = computeBookmapVisualWeight({
          sizeBtc: span.sizeBtc,
          price: span.price,
          midPrice: opts.midPrice,
          regime: zoomRegime,
          baseIntensity: span.textureCell.intensity ?? 0.2,
          isActive: span.kind === "active",
          closedAgeMs:
            span.kind === "closed"
              ? Math.max(0, now - span.lastSeenTime)
              : 0,
          lifetimeMs: span.lifetimeMs,
        });
        const farDim =
          pct > 1 && zoomRegime !== "macro"
            ? Math.max(0.35, weight.distanceWeight)
            : 1;
        textureCells.push({
          ...span.textureCell,
          intensity: Math.min(0.95, weight.visualIntensity * farDim),
        });
      }
    }
    if (span.projectionLevel) {
      const key = `${span.projectionLevel.side}:${span.projectionLevel.price}`;
      if (!seenProjection.has(key)) {
        seenProjection.add(key);
        projectionLevels.push(span.projectionLevel);
      }
    }
  }

  const renderedActive = rowSuppressed.active.length;
  const renderedClosed = rowSuppressed.closed.length;
  const renderedTotal = renderedActive + renderedClosed;
  const uniqueRows = new Set(
    [...rowSuppressed.active, ...rowSuppressed.closed].map((s) =>
      Math.round(opts.priceToY(s.price) / PERP_RENDER_ROW_MIN_GAP_PX),
    ),
  ).size;
  const plotRows = Math.max(
    1,
    Math.floor(opts.plotHeightPx / PERP_RENDER_ROW_MIN_GAP_PX),
  );
  const perpStripeSaturationPct = (uniqueRows / plotRows) * 100;
  const perpDensityTooHigh =
    perpStripeSaturationPct >= PERP_STRIPE_SATURATION_MAX_PCT;
  const perpFilterOk = !perpDensityTooHigh;

  const truth: BookmapPerpFilterTruth = {
    perpFilterEnabled: true,
    activeCandidatesBeforePerpFilter: activeCandidates.length,
    closedCandidatesBeforePerpFilter: closedCandidates.length,
    activeAfterPerpFilter: rowSuppressed.active.length,
    closedAfterPerpFilter: rowSuppressed.closed.length,
    activeDroppedByPerpSizeDistance: activeDroppedBySize,
    closedDroppedByPerpAgeSizeDistance: closedDroppedByAgeSize,
    activeDroppedByPerpRowSuppression: rowSuppressed.activeDropped,
    closedDroppedByPerpRowSuppression: rowSuppressed.closedDropped,
    perpActiveCap: PERP_RENDER_ACTIVE_CAP,
    perpClosedCap: PERP_RENDER_CLOSED_CAP,
    renderedPerpActiveSpanCount: renderedActive,
    renderedPerpClosedSpanCount: renderedClosed,
    renderedPerpTotalSpanCount: renderedTotal,
    perpStripeSaturationPct: Number(perpStripeSaturationPct.toFixed(2)),
    perpDensityTooHigh,
    perpFilterOk,
  };

  return { textureCells, projectionLevels, truth };
}
