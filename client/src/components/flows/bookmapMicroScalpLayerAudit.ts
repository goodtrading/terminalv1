import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { PreparedEngineRenderData } from "./bookmapEnginePrepare";
import type { LiveDomSelectionResult } from "./bookmapLiveDomPriority";

export type MicroScalpLayerRenderStats = {
  liveProjectionRectCount: number;
  activeDomBandRectCount: number;
  wallBandRightSideRectCount: number;
  structuralWallRightSideRectCount: number;
  majorWallRightSideRectCount: number;
  rightSideTotalRectCount: number;
  rightSideCoveragePct: number;
  rightSideDominantLayer: string;
  rightSideWidthPx: number;
  duplicatedActiveDomAndProjectionBucketsCount: number;
  duplicatedWallAndLiveBucketsCount: number;
  avgRightSideAlpha: number;
  maxRightSideAlpha: number;
};

export type BookmapMicroScalpLayerAudit = {
  market: string;
  sourceMode: string;
  domSource: string;
  tradeSource: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  dataEndTime: number;
  visibleEndTime: number;
  rightSideWidthPx: number;
  rightSidePct: number;
  historicalTextureRendered: number;
  liveProjectionRendered: number;
  activeDomBandsRendered: number;
  currentBookAnchorsRendered: number;
  wallBandsRendered: number;
  structuralWallsRendered: number;
  majorWallsRendered: number;
  liveProjectionRectCount: number;
  activeDomBandRectCount: number;
  currentBookAnchorRectCount: number;
  wallBandRightSideRectCount: number;
  structuralWallRightSideRectCount: number;
  majorWallRightSideRectCount: number;
  rightSideTotalRectCount: number;
  rightSideCoveragePct: number;
  rightSideDominantLayer: string;
  currentBookBidCount: number;
  currentBookAskCount: number;
  currentBookVisibleLevelsCount: number;
  currentBookNearTickCount_005pct: number;
  currentBookNearTickCount_015pct: number;
  currentBookNearTickCount_035pct: number;
  selectedLiveProjectionCount: number;
  selectedActiveDomBandCount: number;
  selectedNearTickCount: number;
  selectedTopDomCount: number;
  selectedWallCount: number;
  topDomBidPrices: number[];
  topDomAskPrices: number[];
  topDomBidSizes: number[];
  topDomAskSizes: number[];
  duplicatedLivePriceBucketsCount: number;
  duplicatedWallAndLiveBucketsCount: number;
  duplicatedActiveDomAndProjectionBucketsCount: number;
  avgRightSideAlpha: number;
  maxRightSideAlpha: number;
  microScalpLayerTooDense: boolean;
  microScalpLayerTooWide: boolean;
  microScalpLayerTooOpaque: boolean;
  microScalpLayerDuplicated: boolean;
  microScalpLayerOk: boolean;
};

export function buildBookmapMicroScalpLayerAudit(opts: {
  market: string;
  sourceMode: string;
  domSource: string;
  tradeSource: string;
  verticalMode: string;
  spotPrice: number | null;
  selection?: LiveDomSelectionResult | null;
  renderData?: PreparedEngineRenderData | null;
  timeViewport: BookmapTimeViewport;
  rightSideWidthPx: number;
  renderStats?: MicroScalpLayerRenderStats | null;
  historicalTextureRendered: number;
  wallBandsRendered: number;
}): BookmapMicroScalpLayerAudit {
  const sel = opts.selection;
  const rs = opts.renderStats;
  const spread =
    sel?.bestBid != null && sel?.bestAsk != null
      ? sel.bestAsk - sel.bestBid
      : null;

  const duplicatedActiveDomAndProjectionBucketsCount =
    rs?.duplicatedActiveDomAndProjectionBucketsCount ?? 0;
  const duplicatedWallAndLiveBucketsCount =
    rs?.duplicatedWallAndLiveBucketsCount ?? 0;
  const rightSideCoveragePct =
    rs?.rightSideCoveragePct ?? sel?.estimatedCoveragePct ?? 0;

  const microScalpLayerTooDense = rightSideCoveragePct > 0.45;
  const microScalpLayerTooWide = (rs?.rightSideWidthPx ?? opts.rightSideWidthPx) > opts.rightSideWidthPx * 1.15;
  const microScalpLayerTooOpaque = (rs?.maxRightSideAlpha ?? 0) > 0.72;
  const microScalpLayerDuplicated =
    duplicatedActiveDomAndProjectionBucketsCount > 0 ||
    duplicatedWallAndLiveBucketsCount > 3;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    domSource: opts.domSource,
    tradeSource: opts.tradeSource,
    verticalMode: opts.verticalMode,
    spotPrice: opts.spotPrice,
    bestBid: sel?.bestBid ?? null,
    bestAsk: sel?.bestAsk ?? null,
    spread,
    dataEndTime: opts.timeViewport.dataEndTime,
    visibleEndTime: opts.timeViewport.visibleEndTime,
    rightSideWidthPx: rs?.rightSideWidthPx ?? opts.rightSideWidthPx,
    rightSidePct: opts.timeViewport.rightSpacePct,
    historicalTextureRendered: opts.historicalTextureRendered,
    liveProjectionRendered: rs?.liveProjectionRectCount ?? 0,
    activeDomBandsRendered: rs?.activeDomBandRectCount ?? 0,
    currentBookAnchorsRendered: 0,
    wallBandsRendered: opts.wallBandsRendered,
    structuralWallsRendered: rs?.structuralWallRightSideRectCount ?? 0,
    majorWallsRendered: rs?.majorWallRightSideRectCount ?? 0,
    liveProjectionRectCount: rs?.liveProjectionRectCount ?? 0,
    activeDomBandRectCount: rs?.activeDomBandRectCount ?? 0,
    currentBookAnchorRectCount: 0,
    wallBandRightSideRectCount: rs?.wallBandRightSideRectCount ?? 0,
    structuralWallRightSideRectCount: rs?.structuralWallRightSideRectCount ?? 0,
    majorWallRightSideRectCount: rs?.majorWallRightSideRectCount ?? 0,
    rightSideTotalRectCount: rs?.rightSideTotalRectCount ?? 0,
    rightSideCoveragePct,
    rightSideDominantLayer: rs?.rightSideDominantLayer ?? "none",
    currentBookBidCount: sel ? opts.renderData?.liveProjectionStats.currentBidLevelCount ?? 0 : 0,
    currentBookAskCount: sel ? opts.renderData?.liveProjectionStats.currentAskLevelCount ?? 0 : 0,
    currentBookVisibleLevelsCount: sel?.currentBookVisibleLevelsCount ?? 0,
    currentBookNearTickCount_005pct:
      (sel?.nearTickBidCount005 ?? 0) + (sel?.nearTickAskCount005 ?? 0),
    currentBookNearTickCount_015pct: (sel?.nearTickBidCount015 ?? 0) + (sel?.nearTickAskCount015 ?? 0),
    currentBookNearTickCount_035pct: (sel?.nearTickBidCount035 ?? 0) + (sel?.nearTickAskCount035 ?? 0),
    selectedLiveProjectionCount: sel?.selectedLiveProjectionCount ?? 0,
    selectedActiveDomBandCount: sel?.selectedActiveDomBandCount ?? 0,
    selectedNearTickCount: sel?.nearTickCount ?? 0,
    selectedTopDomCount: sel?.topDomCount ?? 0,
    selectedWallCount: sel?.wallCount ?? 0,
    topDomBidPrices: sel?.largestDomBidPrices ?? [],
    topDomAskPrices: sel?.largestDomAskPrices ?? [],
    topDomBidSizes: sel?.largestDomBidSizes ?? [],
    topDomAskSizes: sel?.largestDomAskSizes ?? [],
    duplicatedLivePriceBucketsCount:
      duplicatedActiveDomAndProjectionBucketsCount + duplicatedWallAndLiveBucketsCount,
    duplicatedWallAndLiveBucketsCount,
    duplicatedActiveDomAndProjectionBucketsCount,
    avgRightSideAlpha: rs?.avgRightSideAlpha ?? 0,
    maxRightSideAlpha: rs?.maxRightSideAlpha ?? 0,
    microScalpLayerTooDense,
    microScalpLayerTooWide,
    microScalpLayerTooOpaque,
    microScalpLayerDuplicated,
    microScalpLayerOk:
      !microScalpLayerTooDense &&
      !microScalpLayerTooWide &&
      !microScalpLayerTooOpaque &&
      !microScalpLayerDuplicated &&
      (rs?.rightSideTotalRectCount ?? 0) > 0,
  };
}
