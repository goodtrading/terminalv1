import type { PreparedEngineRenderData, PreparedLiveProjectionLevel } from "./bookmapEnginePrepare";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import type { BookmapSourceMode } from "@shared/bookmapSourceMode";

export type BookmapLayerAudit = {
  market: string;
  sourceMode: string;
  verticalMode: string;
  legacyRendererActive: boolean;
  engineRendererActive: boolean;
  historicalTextureActive: boolean;
  pulledHistoricalFootprintActive: boolean;
  liveProjectionActive: boolean;
  currentBookAnchorsActive: boolean;
  activeDomBandsActive: boolean;
  wallBandsActive: boolean;
  structuralWallsActive: boolean;
  majorWallsActive: boolean;
  executionOverlayActive: boolean;
  tradeDotsActive: boolean;
  renderedLayerOrder: string[];
  renderedHistoricalTextureCount: number;
  renderedHistoricalFootprintCount: number;
  renderedLiveProjectionCount: number;
  renderedCurrentBookAnchorCount: number;
  renderedActiveDomBandCount: number;
  renderedWallBandCount: number;
  renderedStructuralWallCount: number;
  renderedMajorWallCount: number;
  duplicatedPriceLevelsCount: number;
  duplicatedLiveLevelsCount: number;
  ghostLayerDetected: boolean;
  ghostLayerCandidates: string[];
  layerAuditOk: boolean;
};

export type BuildBookmapLayerAuditOpts = {
  market: BookmapMarketSource;
  sourceMode: BookmapSourceMode;
  verticalMode: VerticalCompressionMode | string;
  legacyRendererActive: boolean;
  engineRendererActive: boolean;
  renderData?: PreparedEngineRenderData | null;
  renderedLayerOrder: string[];
  renderedHistoricalTextureCount: number;
  renderedHistoricalFootprintCount: number;
  renderedLiveProjectionCount: number;
  renderedWallBandCount: number;
  executionOverlayActive: boolean;
  tradeDotsActive: boolean;
  /** Prepare-path flags — anchors should stay false after cleanup. */
  currentBookAnchorsInPrepare?: boolean;
};

function countWallTiers(renderData: PreparedEngineRenderData | null | undefined) {
  if (!renderData) {
    return { structural: 0, major: 0 };
  }
  let structural = 0;
  let major = 0;
  for (const band of renderData.bands) {
    if (band.tier === "structural") structural += 1;
    if (band.tier === "major") major += 1;
  }
  return { structural, major };
}

function duplicatedLiveLevelKeys(
  liveLevels: PreparedLiveProjectionLevel[],
  activeDomBands: PreparedLiveProjectionLevel[],
): number {
  const liveKeys = new Set(liveLevels.map((l) => `${l.side}:${l.price}`));
  let dup = 0;
  for (const band of activeDomBands) {
    if (liveKeys.has(`${band.side}:${band.price}`)) dup += 1;
  }
  return dup;
}

function wallLiveOverlapCount(
  renderData: PreparedEngineRenderData | null | undefined,
  liveLevels: PreparedLiveProjectionLevel[],
): number {
  if (!renderData) return 0;
  const liveKeys = new Set(liveLevels.map((l) => `${l.side}:${l.price}`));
  let overlap = 0;
  for (const band of renderData.bands) {
    if (liveKeys.has(`${band.side}:${band.price}`)) overlap += 1;
  }
  return overlap;
}

export function buildBookmapLayerAudit(
  opts: BuildBookmapLayerAuditOpts,
): BookmapLayerAudit {
  const rd = opts.renderData;
  const liveLevels = rd?.liveProjectionLevels ?? [];
  const activeDomBands = rd?.activeDomBands ?? [];
  const tiers = countWallTiers(rd);

  const duplicatedLiveLevelsCount = duplicatedLiveLevelKeys(
    liveLevels,
    activeDomBands,
  );
  const wallLiveOverlap = wallLiveOverlapCount(rd, liveLevels);
  const duplicatedPriceLevelsCount = duplicatedLiveLevelsCount + wallLiveOverlap;

  const ghostLayerCandidates: string[] = [];
  if (opts.currentBookAnchorsInPrepare) {
    ghostLayerCandidates.push("current-book-anchors-in-prepare");
  }
  if (opts.legacyRendererActive && opts.engineRendererActive) {
    ghostLayerCandidates.push("legacy-and-engine-both-active");
  }

  const historicalTextureActive = Boolean(
    rd?.textureModeEnabled && (rd?.textureCells.length ?? 0) > 0,
  );
  const liveProjectionActive = liveLevels.length > 0;
  const activeDomBandsActive = activeDomBands.length > 0;
  const wallBandsActive = (rd?.bands.length ?? 0) > 0;

  const layerAuditOk =
    ghostLayerCandidates.length === 0 &&
    !opts.currentBookAnchorsInPrepare &&
    !(opts.legacyRendererActive && opts.engineRendererActive);

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    verticalMode: String(opts.verticalMode),
    legacyRendererActive: opts.legacyRendererActive,
    engineRendererActive: opts.engineRendererActive,
    historicalTextureActive,
    pulledHistoricalFootprintActive: opts.renderedHistoricalFootprintCount > 0,
    liveProjectionActive,
    currentBookAnchorsActive: Boolean(opts.currentBookAnchorsInPrepare),
    activeDomBandsActive,
    wallBandsActive,
    structuralWallsActive: tiers.structural > 0,
    majorWallsActive: tiers.major > 0,
    executionOverlayActive: opts.executionOverlayActive,
    tradeDotsActive: opts.tradeDotsActive,
    renderedLayerOrder: opts.renderedLayerOrder,
    renderedHistoricalTextureCount: opts.renderedHistoricalTextureCount,
    renderedHistoricalFootprintCount: opts.renderedHistoricalFootprintCount,
    renderedLiveProjectionCount: opts.renderedLiveProjectionCount,
    renderedCurrentBookAnchorCount: 0,
    renderedActiveDomBandCount: activeDomBands.length,
    renderedWallBandCount: opts.renderedWallBandCount,
    renderedStructuralWallCount: tiers.structural,
    renderedMajorWallCount: tiers.major,
    duplicatedPriceLevelsCount,
    duplicatedLiveLevelsCount,
    ghostLayerDetected: ghostLayerCandidates.length > 0,
    ghostLayerCandidates,
    layerAuditOk,
  };
}
