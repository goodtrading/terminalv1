import { BOOKMAP_ENGINE_BUCKET_MS } from "@/lib/bookmapEngineConfig";
import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import { formatHeatmapPrice } from "./liquidityHeatmapUtils";
import type { PreparedEngineRenderData } from "./bookmapEnginePrepare";
import { pickWallLabels, type WallLabelPlacement } from "./bookmapBandPrepare";
import type { HeatmapBand } from "./bookmapBandTypes";
import {
  getBookmapBandFill,
  getBookmapBandStroke,
  getWallLabelColor,
  getWallLabelText,
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
import type { ExecutionRailLength } from "@/components/terminal/bookmap/bookmapSettings";
import type { PassiveConfluenceLevel } from "./bookmapConfluence";
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
  showDivergenceMarkers?: boolean;
};

export type { BboPathRenderStats };

type EnginePlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
  priceStep: number;
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
  projectionEndTime: number,
): number {
  if (band.stale) return band.endTime;
  const liveSlack = BOOKMAP_ENGINE_BUCKET_MS * 2;
  if (band.endTime >= dataEndTime - liveSlack) {
    return Math.max(band.endTime, projectionEndTime);
  }
  return band.endTime;
}

function bandVerticalBounds(
  band: HeatmapBand,
  priceToY: (p: number) => number,
  priceStep: number,
): { yTop: number; height: number } {
  const yCenter = priceToY(band.price);
  const yEdge = priceToY(band.price - priceStep);
  const bucketH = Math.max(2, Math.abs(yEdge - yCenter) || 3);
  return {
    yTop: yCenter - bucketH / 2,
    height: bucketH + 0.5,
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
    let vi = band.visualIntensity ?? band.intensity;
    vi = Math.max(0, Math.min(1, (vi - 0.5) * heatmapContrast + 0.5));
    if (vi < viFloor) continue;

    const endTime = resolveBandEndTime(band, dataEndTime, projectionEndTime);
    const x0 = timeToX(band.startTime);
    const x1 = timeToX(endTime);
    const w = Math.max(1.5, x1 - x0);
    const { yTop, height } = bandVerticalBounds(band, priceToY, priceStep);

    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const drawBand = { ...band, visualIntensity: vi, intensity: vi };
    ctx.fillStyle =
      mode === "perp-overlay"
        ? getBookmapPerpOverlayFill(drawBand, overlayOpacityMul)
        : getBookmapBandFill(drawBand, heatmapOpacity);
    ctx.fillRect(x0, yTop, w, height);

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

  renderEngineTimeGrid(ctx, metrics);
  renderLiveDataEdge(ctx, metrics, timeViewport);
  renderPriceGrid(ctx, w, crosshairMetrics, minPrice, maxPrice);

  const hasBands = engine.bands.length > 0;

  if (!hasBands) {
    ctx.fillStyle = "#64748b";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("No engine liquidity in viewport", HEATMAP_PAD.left + 8, HEATMAP_PAD.top + 24);
  } else {
    renderHeatmapBands(
      ctx,
      metrics,
      engine.bands,
      timeViewport.dataEndTime,
      timeViewport.liveEdgeTime,
      params.visualSettings,
      "primary",
    );
    if (params.overlayEngine && params.overlayEngine.bands.length > 0) {
      renderHeatmapBands(
        ctx,
        metrics,
        params.overlayEngine.bands,
        timeViewport.dataEndTime,
        timeViewport.liveEdgeTime,
        params.visualSettings,
        "perp-overlay",
        params.overlayOpacity ?? 0.35,
      );
    }
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
}

export type { BookmapHeatmapRenderParams };
