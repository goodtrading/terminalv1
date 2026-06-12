/**
 * B.5 — Bookmap surface renderer: direct depth surface without experimental pipeline.
 */

import {
  BOOKMAP_CANONICAL_HEATMAP_V1,
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1,
  BOOKMAP_SURFACE_RENDERER_DIAG,
  BOOKMAP_SURFACE_RENDERER_V1,
  LIMIT_ORDER_DOMINANT_SIZE_BTC,
  SURFACE_FAR_DISTANCE_ALPHA_MUL,
  SURFACE_HISTORICAL_MAX_DRAW,
  SURFACE_LIVE_MAX_PER_SIDE,
  SURFACE_MACRO_MIN_SIZE_BTC,
  SURFACE_MICRO_MIN_SIZE_BTC,
  computeVisiblePriceRangePct,
  resolveZoomRegime,
  WALL_IMPORTANT_BTC,
  type BookmapZoomRegime,
} from "@/lib/bookmapEngineConfig";
import {
  resolveSurfaceHistoricalThermal,
  resolveSurfaceThermalFromSize,
  type SurfaceThermalTier,
} from "@/lib/bookmapBandColors";
import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { BookmapVisualSettings } from "@/components/terminal/bookmap/bookmapSettings";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";
import {
  BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS,
  BOOKMAP_TEXTURE_SAMPLER_MS,
  type PreparedEngineRenderData,
  type PreparedEngineTextureCell,
  type PreparedEngineWall,
} from "./bookmapEnginePrepare";
import { isWallTier, type HeatmapBand } from "./bookmapBandTypes";
import {
  resolveLifecycleThermalSize,
  resolveLifecycleVisualAlpha,
  setLimitOrderLifecycleVisibleDrawn,
  updateLimitOrderLifecycleEngine,
  type LimitOrderLifecycleLevel,
} from "./bookmapLimitOrderLifecycle";

export type SurfaceRendererDiagStats = {
  surfaceRendererActive: boolean;
  historicalCellsInput: number;
  historicalCellsDrawn: number;
  liveDomLevelsInput: number;
  liveDomLevelsDrawn: number;
  bidLevelsDrawn: number;
  askLevelsDrawn: number;
  weakLevelsDrawn: number;
  mediumLevelsDrawn: number;
  strongLevelsDrawn: number;
  extremeLevelsDrawn: number;
  visiblePriceMin: number;
  visiblePriceMax: number;
  zoomRegime: BookmapZoomRegime;
  drawMode: string;
  liveDomSource: string;
  lifecycleLevelsInput: number;
  lifecycleLevelsDrawn: number;
  lifecycleLiveDrawn: number;
  lifecycleHistoricalDrawn: number;
  lifecycleFadingDrawn: number;
  timestamp: number;
};

export type BookmapSurfaceFrameParams = {
  width: number;
  height: number;
  minPrice: number;
  maxPrice: number;
  spot: number | null;
  engine: PreparedEngineRenderData;
  timeViewport: BookmapTimeViewport;
  visualSettings?: BookmapVisualSettings;
  domBucketSize: number;
};

export type SurfacePlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
  domBucketSize: number;
};

type SurfaceLevel = {
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  source: string;
};

let lastSurfaceRendererDiag: SurfaceRendererDiagStats = {
  surfaceRendererActive: false,
  historicalCellsInput: 0,
  historicalCellsDrawn: 0,
  liveDomLevelsInput: 0,
  liveDomLevelsDrawn: 0,
  bidLevelsDrawn: 0,
  askLevelsDrawn: 0,
  weakLevelsDrawn: 0,
  mediumLevelsDrawn: 0,
  strongLevelsDrawn: 0,
  extremeLevelsDrawn: 0,
  visiblePriceMin: 0,
  visiblePriceMax: 0,
  zoomRegime: "macro",
  drawMode: "surface_v1",
  liveDomSource: "none",
  lifecycleLevelsInput: 0,
  lifecycleLevelsDrawn: 0,
  lifecycleLiveDrawn: 0,
  lifecycleHistoricalDrawn: 0,
  lifecycleFadingDrawn: 0,
  timestamp: 0,
};

let lastSurfaceRendererDiagLogMs = 0;

export function getSurfaceRendererDiagStats(): SurfaceRendererDiagStats {
  return lastSurfaceRendererDiag;
}

function emitSurfaceRendererDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_SURFACE_RENDERER_DIAG) return;
  const now = Date.now();
  if (now - lastSurfaceRendererDiagLogMs < 2_000) return;
  lastSurfaceRendererDiagLogMs = now;
  console.debug("[BOOKMAP_SURFACE_RENDERER_V1_DIAG]", {
    ...lastSurfaceRendererDiag,
  });
}

export function drawSurfaceRendererWatermark(ctx: CanvasRenderingContext2D): void {
  if (BOOKMAP_CANONICAL_HEATMAP_V1) return;
  if (!import.meta.env.DEV || !BOOKMAP_SURFACE_RENDERER_DIAG) return;
  ctx.save();
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 3;
  const x = HEATMAP_PAD.left + 6;
  let y = HEATMAP_PAD.top + 14;
  ctx.fillStyle = "rgba(34, 211, 238, 0.96)";
  ctx.strokeText("SURFACE RENDERER V1 ACTIVE", x, y);
  ctx.fillText("SURFACE RENDERER V1 ACTIVE", x, y);
  if (BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1) {
    y += 14;
    ctx.fillStyle = "rgba(52, 211, 153, 0.96)";
    ctx.strokeText("LIMIT ORDER LIFECYCLE V1 ACTIVE", x, y);
    ctx.fillText("LIMIT ORDER LIFECYCLE V1 ACTIVE", x, y);
  }
  ctx.restore();
}

function fillRgba(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  y: number,
  h: number,
  rgb: [number, number, number],
  alpha: number,
): void {
  if (alpha <= 0.004 || w <= 0 || h <= 0) return;
  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  ctx.fillRect(x, y, w, h);
}

function priceBandBounds(
  price: number,
  priceToY: (p: number) => number,
  bucketSize: number,
): { yTop: number; height: number } {
  const yMid = priceToY(price);
  const half = Math.max(1, bucketSize * 0.5);
  const yTop = priceToY(price + half);
  const yBot = priceToY(price - half);
  return { yTop: Math.min(yTop, yBot), height: Math.max(1, Math.abs(yBot - yTop)) };
}

function pctFromMid(price: number, mid: number | null): number {
  if (mid == null || mid <= 0) return 50;
  return (Math.abs(price - mid) / mid) * 100;
}

function distanceAlphaMul(pct: number, regime: BookmapZoomRegime): number {
  if (regime !== "macro") {
    if (pct > 8) return 0.55;
    if (pct > 4) return 0.72;
    return 1;
  }
  if (pct > 12) return SURFACE_FAR_DISTANCE_ALPHA_MUL * 0.88;
  if (pct > 6) return SURFACE_FAR_DISTANCE_ALPHA_MUL;
  if (pct > 3) return 0.92;
  return 1;
}

function recordTier(
  tier: SurfaceThermalTier,
  diag: { weak: number; medium: number; strong: number; extreme: number },
): void {
  if (tier === "very_weak" || tier === "weak") diag.weak += 1;
  else if (tier === "medium") diag.medium += 1;
  else if (tier === "strong") diag.strong += 1;
  else diag.extreme += 1;
}

function collectHistoricalCells(
  engine: PreparedEngineRenderData,
  dataEndTime: number,
  minPrice: number,
  maxPrice: number,
  visibleStart: number,
  visibleEnd: number,
): PreparedEngineTextureCell[] {
  const primary = engine.textureCells ?? [];
  if (primary.length > 0) {
    return primary.filter((c) => {
      const end = c.endTimeBucket ?? c.timeBucket + BOOKMAP_ENGINE_BUCKET_MS;
      if (end < visibleStart || c.timeBucket > visibleEnd) return false;
      if (c.timeBucket >= dataEndTime) return false;
      return c.price >= minPrice && c.price <= maxPrice;
    });
  }
  const raw = engine.restingLiquidityRawCells ?? [];
  return raw
    .filter((c) => {
      if (c.timeBucket >= dataEndTime) return false;
      if (c.timeBucket < visibleStart || c.timeBucket > visibleEnd) return false;
      return c.price >= minPrice && c.price <= maxPrice && c.maxSizeInBucket > 0;
    })
    .map(
      (c): PreparedEngineTextureCell => ({
        timeBucket: c.timeBucket,
        price: c.price,
        side: c.side,
        intensity: Math.min(1, c.maxSizeInBucket / 50),
        isMajor: false,
        maxSizeInBucket: c.maxSizeInBucket,
      }),
    );
}

function collectSurfaceLiveLevels(
  engine: PreparedEngineRenderData,
  minPrice: number,
  maxPrice: number,
  dataEndTime: number,
  regime: BookmapZoomRegime,
  minSize: number,
): { levels: SurfaceLevel[]; source: string } {
  const map = new Map<string, SurfaceLevel>();
  const sources = new Set<string>();

  const add = (
    side: "bid" | "ask",
    price: number,
    sizeBtc: number,
    source: string,
  ) => {
    if (price < minPrice || price > maxPrice || sizeBtc < minSize) return;
    sources.add(source);
    const key = `${side}:${price}`;
    const prev = map.get(key);
    if (!prev || sizeBtc > prev.sizeBtc) {
      map.set(key, { side, price, sizeBtc, source });
    }
  };

  for (const level of [
    ...(engine.activeDomBands ?? []),
    ...(engine.liveProjectionLevels ?? []),
  ]) {
    add(level.side, level.price, level.sizeBtc, "liveProjection");
  }

  const sel = engine.liveDomSelection;
  if (sel) {
    for (let i = 0; i < sel.largestDomBidPrices.length; i += 1) {
      add(
        "bid",
        sel.largestDomBidPrices[i]!,
        sel.largestDomBidSizes[i] ?? 0,
        "liveDomSelection",
      );
    }
    for (let i = 0; i < sel.largestDomAskPrices.length; i += 1) {
      add(
        "ask",
        sel.largestDomAskPrices[i]!,
        sel.largestDomAskSizes[i] ?? 0,
        "liveDomSelection",
      );
    }
  }

  if (regime === "macro" && engine.restingLiquidityRawCells?.length) {
    const latest = new Map<string, { size: number; time: number }>();
    for (const cell of engine.restingLiquidityRawCells) {
      if (cell.price < minPrice || cell.price > maxPrice) continue;
      if (cell.timeBucket < dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS * 4) continue;
      const key = `${cell.side}:${cell.price}`;
      const prev = latest.get(key);
      if (!prev || cell.timeBucket > prev.time) {
        latest.set(key, { size: cell.maxSizeInBucket, time: cell.timeBucket });
      }
    }
    for (const [key, entry] of latest) {
      const [side, priceStr] = key.split(":");
      add(side as "bid" | "ask", Number(priceStr), entry.size, "restingRaw");
    }
  }

  let levels = Array.from(map.values());
  levels.sort((a, b) => b.sizeBtc - a.sizeBtc);
  const bid = levels.filter((l) => l.side === "bid").slice(0, SURFACE_LIVE_MAX_PER_SIDE);
  const ask = levels.filter((l) => l.side === "ask").slice(0, SURFACE_LIVE_MAX_PER_SIDE);
  levels = [...bid, ...ask];

  return {
    levels,
    source: sources.size ? [...sources].join("+") : "none",
  };
}

function drawHistoricalSurface(
  ctx: CanvasRenderingContext2D,
  cells: PreparedEngineTextureCell[],
  metrics: SurfacePlotMetrics,
  dataEndTime: number,
  heatmapOpacity: number,
  tierDiag: { weak: number; medium: number; strong: number; extreme: number },
): number {
  const sorted = [...cells].sort(
    (a, b) => (a.intensity ?? 0) - (b.intensity ?? 0),
  );
  const drawPool =
    sorted.length > SURFACE_HISTORICAL_MAX_DRAW
      ? sorted.slice(-SURFACE_HISTORICAL_MAX_DRAW)
      : sorted;

  let drawn = 0;
  const dataEdgeX = metrics.timeToX(dataEndTime);

  for (const cell of drawPool) {
    const vi = cell.intensity ?? 0;
    if (vi < 0.04 && cell.maxSizeInBucket < 0.5) continue;

    const thermal = resolveSurfaceHistoricalThermal(vi, cell.maxSizeInBucket);
    recordTier(thermal.tier, tierDiag);

    const { yTop, height } = priceBandBounds(
      cell.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const x0 = metrics.timeToX(cell.timeBucket);
    if (x0 >= dataEdgeX) continue;
    let w = Math.max(
      1,
      metrics.timeToX(cell.timeBucket + BOOKMAP_ENGINE_BUCKET_MS) - x0,
    );
    w = Math.min(w, Math.max(1, dataEdgeX - x0));
    const alpha = thermal.alpha * heatmapOpacity * 0.92;
    fillRgba(ctx, x0, w, yTop, height, thermal.rgb, alpha);
    drawn += 1;
  }
  return drawn;
}

function drawLiveDepthSurface(
  ctx: CanvasRenderingContext2D,
  levels: SurfaceLevel[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  regime: BookmapZoomRegime,
  dataEndTime: number,
  tierDiag: { weak: number; medium: number; strong: number; extreme: number },
  sideFilter?: "bid" | "ask",
): { drawn: number; bid: number; ask: number } {
  const heatmapOpacity = params.visualSettings?.heatmap.opacity ?? 1;
  const x0 = metrics.timeToX(
    Math.max(
      params.timeViewport.visibleStartTime,
      dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS * 2,
    ),
  );
  const x1 = metrics.timeToX(dataEndTime);
  const colW = Math.max(1, x1 - x0);
  let drawn = 0;
  let bid = 0;
  let ask = 0;

  for (const level of levels) {
    if (sideFilter && level.side !== sideFilter) continue;
    const thermal = resolveSurfaceThermalFromSize(level.sizeBtc);
    recordTier(thermal.tier, tierDiag);
    const distMul = distanceAlphaMul(pctFromMid(level.price, params.spot), regime);
    const alpha = thermal.alpha * distMul * heatmapOpacity * 0.88;

    const { yTop, height } = priceBandBounds(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    fillRgba(ctx, x0, colW, yTop, height, thermal.rgb, alpha * 0.72);
    drawn += 1;
    if (level.side === "bid") bid += 1;
    else ask += 1;
  }

  return { drawn, bid, ask };
}

function drawLiveProjectionSurface(
  ctx: CanvasRenderingContext2D,
  levels: SurfaceLevel[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  regime: BookmapZoomRegime,
  dataEndTime: number,
): number {
  const projEnd = params.timeViewport.visibleEndTime;
  if (projEnd <= dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS) return 0;

  const x0 = metrics.timeToX(dataEndTime);
  const x1 = metrics.timeToX(projEnd);
  const spanW = x1 - x0;
  if (spanW < 2) return 0;

  const heatmapOpacity = params.visualSettings?.heatmap.opacity ?? 1;
  let drawn = 0;

  for (const level of levels) {
    const thermal = resolveSurfaceThermalFromSize(level.sizeBtc);
    const distMul = distanceAlphaMul(pctFromMid(level.price, params.spot), regime);
    const alpha = thermal.alpha * distMul * heatmapOpacity * 0.9;

    const { yTop, height } = priceBandBounds(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const edgeW = Math.max(1, spanW * 0.14);
    fillRgba(ctx, x0, edgeW, yTop, height, thermal.rgb, alpha * 0.55);
    fillRgba(
      ctx,
      x0 + edgeW,
      Math.max(1, spanW - edgeW),
      yTop,
      height,
      thermal.rgb,
      alpha * 0.82,
    );
    drawn += 1;
  }
  return drawn;
}

function drawImportantWalls(
  ctx: CanvasRenderingContext2D,
  walls: PreparedEngineWall[],
  bands: HeatmapBand[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  dataEndTime: number,
  heatmapOpacity: number,
): number {
  const visibleStart = params.timeViewport.visibleStartTime;
  const visibleEnd = params.timeViewport.visibleEndTime;
  const xHistEnd = metrics.timeToX(dataEndTime);
  const xProjEnd = metrics.timeToX(visibleEnd);
  let drawn = 0;

  const wallEntries: Array<{ price: number; side: "bid" | "ask"; size: number }> =
    [];
  for (const w of walls) {
    if (w.maxSeenSize >= 20) {
      wallEntries.push({
        price: w.price,
        side: w.side,
        size: w.maxSeenSize,
      });
    }
  }
  for (const b of bands) {
    if (isWallTier(b.tier) || b.maxSize >= WALL_IMPORTANT_BTC) {
      wallEntries.push({ price: b.price, side: b.side, size: b.maxSize });
    }
  }

  const deduped = new Map<string, { price: number; side: "bid" | "ask"; size: number }>();
  for (const w of wallEntries) {
    const key = `${w.side}:${w.price}`;
    const prev = deduped.get(key);
    if (!prev || w.size > prev.size) deduped.set(key, w);
  }

  const sorted = [...deduped.values()].sort((a, b) => a.size - b.size);
  for (const wall of sorted) {
    const thermal = resolveSurfaceThermalFromSize(wall.size);
    const { yTop, height } = priceBandBounds(
      wall.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;

    const histStart = metrics.timeToX(visibleStart);
    const histW = Math.max(1, xHistEnd - histStart);
    const bodyAlpha = thermal.alpha * heatmapOpacity * 0.62;
    const glowAlpha = bodyAlpha * 0.34;
    const glowH = height * 1.22;
    const glowY = yTop - (glowH - height) * 0.5;

    fillRgba(
      ctx,
      histStart,
      histW,
      glowY,
      glowH,
      thermal.rgb,
      glowAlpha,
    );

    const edgeW = Math.max(1, histW * 0.12);
    fillRgba(ctx, histStart, edgeW, yTop, height, thermal.rgb, bodyAlpha * 0.45);
    fillRgba(
      ctx,
      histStart + edgeW,
      Math.max(1, histW - edgeW * 2),
      yTop,
      height,
      thermal.rgb,
      bodyAlpha * 0.78,
    );

    if (wall.size >= 50) {
      const coreH = height * 0.42;
      const coreY = yTop + height * 0.29;
      const coreRgb = resolveSurfaceThermalFromSize(wall.size * 1.08).rgb;
      fillRgba(
        ctx,
        histStart + histW * 0.08,
        histW * 0.55,
        coreY,
        coreH,
        coreRgb,
        bodyAlpha * 0.85,
      );
    }

    if (xProjEnd > xHistEnd + 2) {
      const projW = xProjEnd - xHistEnd;
      fillRgba(ctx, xHistEnd, projW, yTop, height, thermal.rgb, bodyAlpha * 0.72);
    }
    drawn += 1;
  }
  return drawn;
}

function shouldDrawLifecycleLevel(
  level: LimitOrderLifecycleLevel,
  regime: BookmapZoomRegime,
  spot: number | null,
): boolean {
  if (level.state === "stale" && level.fadeAlpha < 0.06) return false;
  if (regime === "macro") return true;
  const pct = pctFromMid(level.price, spot);
  if (level.isDominant || level.isWall) return true;
  if (level.isLive && pct <= 6) return true;
  if (level.isNearPrice) return true;
  if (!level.isLive && level.peakSizeBtc >= LIMIT_ORDER_DOMINANT_SIZE_BTC) return true;
  return pct <= 4 && level.peakSizeBtc >= SURFACE_MICRO_MIN_SIZE_BTC;
}

function drawLifecycleHistoricalTrail(
  ctx: CanvasRenderingContext2D,
  levels: LimitOrderLifecycleLevel[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  regime: BookmapZoomRegime,
  dataEndTime: number,
  heatmapOpacity: number,
  tierDiag: { weak: number; medium: number; strong: number; extreme: number },
): { drawn: number; historical: number; fading: number } {
  const visibleStart = params.timeViewport.visibleStartTime;
  const dataEdgeX = metrics.timeToX(dataEndTime);
  let drawn = 0;
  let historical = 0;
  let fading = 0;

  for (const level of levels) {
    if (!shouldDrawLifecycleLevel(level, regime, params.spot)) continue;
    if (level.state === "new" && !level.isHistorical) continue;

    const thermalSize = resolveLifecycleThermalSize(level);
    const thermal = resolveSurfaceThermalFromSize(thermalSize);
    recordTier(thermal.tier, tierDiag);
    const lifeAlpha = resolveLifecycleVisualAlpha(level);
    const distMul = distanceAlphaMul(pctFromMid(level.price, params.spot), regime);
    const alpha = thermal.alpha * lifeAlpha * distMul * heatmapOpacity;

    const { yTop, height } = priceBandBounds(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const trailStart = Math.max(visibleStart, level.firstSeenTime);
    const trailEnd = level.isLive
      ? dataEndTime
      : Math.min(
          dataEndTime,
          level.disappearedAt ?? level.lastActiveTime,
        );
    if (trailEnd <= trailStart) continue;

    const x0 = metrics.timeToX(trailStart);
    const x1 = Math.min(dataEdgeX, metrics.timeToX(trailEnd));
    const w = Math.max(1, x1 - x0);
    if (w <= 0 || x0 >= dataEdgeX) continue;

    if (level.state === "pulling") {
      const seg = Math.max(2, w / 5);
      for (let i = 0; i < 5; i += 1) {
        if (i % 2 === 1) continue;
        fillRgba(
          ctx,
          x0 + i * seg,
          Math.max(1, seg * 0.85),
          yTop,
          height,
          thermal.rgb,
          alpha * 0.55,
        );
      }
    } else if (level.state === "reinforced" || level.isWall) {
      fillRgba(ctx, x0, w, yTop, height, thermal.rgb, alpha * 0.48);
      const coreRgb = resolveSurfaceThermalFromSize(thermalSize * 1.06).rgb;
      fillRgba(
        ctx,
        x0 + w * 0.15,
        w * 0.55,
        yTop + height * 0.28,
        height * 0.44,
        coreRgb,
        alpha * 0.72,
      );
    } else {
      fillRgba(ctx, x0, w, yTop, height, thermal.rgb, alpha * 0.68);
    }

    drawn += 1;
    if (level.isLive) historical += 1;
    else if (level.state === "fading" || level.state === "stale") fading += 1;
    else historical += 1;
  }

  return { drawn, historical, fading };
}

function drawLifecycleLiveSurface(
  ctx: CanvasRenderingContext2D,
  levels: LimitOrderLifecycleLevel[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  regime: BookmapZoomRegime,
  dataEndTime: number,
  heatmapOpacity: number,
  tierDiag: { weak: number; medium: number; strong: number; extreme: number },
): { drawn: number; live: number; bid: number; ask: number } {
  const x0 = metrics.timeToX(
    Math.max(
      params.timeViewport.visibleStartTime,
      dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS * 2,
    ),
  );
  const x1 = metrics.timeToX(dataEndTime);
  const colW = Math.max(1, x1 - x0);
  let drawn = 0;
  let live = 0;
  let bid = 0;
  let ask = 0;

  for (const level of levels) {
    if (!level.isLive) continue;
    if (level.state === "fading" || level.state === "stale") continue;
    if (!shouldDrawLifecycleLevel(level, regime, params.spot)) continue;

    const thermalSize = resolveLifecycleThermalSize(level);
    const thermal = resolveSurfaceThermalFromSize(thermalSize);
    recordTier(thermal.tier, tierDiag);
    const lifeAlpha = resolveLifecycleVisualAlpha(level);
    const distMul = distanceAlphaMul(pctFromMid(level.price, params.spot), regime);
    const alpha = thermal.alpha * lifeAlpha * distMul * heatmapOpacity * 0.9;

    const { yTop, height } = priceBandBounds(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    if (level.state === "new") {
      fillRgba(ctx, x0, colW, yTop, height, thermal.rgb, alpha * 0.55);
    } else if (level.state === "pulling") {
      fillRgba(ctx, x0, colW * 0.45, yTop, height, thermal.rgb, alpha * 0.42);
      fillRgba(
        ctx,
        x0 + colW * 0.55,
        colW * 0.45,
        yTop,
        height,
        thermal.rgb,
        alpha * 0.38,
      );
    } else {
      fillRgba(ctx, x0, colW, yTop, height, thermal.rgb, alpha * 0.78);
    }

    drawn += 1;
    live += 1;
    if (level.side === "bid") bid += 1;
    else ask += 1;
  }

  return { drawn, live, bid, ask };
}

function drawLifecycleLiveProjection(
  ctx: CanvasRenderingContext2D,
  levels: LimitOrderLifecycleLevel[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  regime: BookmapZoomRegime,
  dataEndTime: number,
  heatmapOpacity: number,
): number {
  const projEnd = params.timeViewport.visibleEndTime;
  if (projEnd <= dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS) return 0;

  const x0 = metrics.timeToX(dataEndTime);
  const x1 = metrics.timeToX(projEnd);
  const spanW = x1 - x0;
  if (spanW < 2) return 0;

  let drawn = 0;
  for (const level of levels) {
    if (!level.isLive) continue;
    if (level.state === "fading" || level.state === "stale" || level.state === "pulling") {
      continue;
    }
    if (!shouldDrawLifecycleLevel(level, regime, params.spot)) continue;

    const thermalSize = resolveLifecycleThermalSize(level);
    const thermal = resolveSurfaceThermalFromSize(thermalSize);
    const lifeAlpha = resolveLifecycleVisualAlpha(level);
    const distMul = distanceAlphaMul(pctFromMid(level.price, params.spot), regime);
    const alpha = thermal.alpha * lifeAlpha * distMul * heatmapOpacity * 0.88;

    const { yTop, height } = priceBandBounds(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;
    if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const edgeW = Math.max(1, spanW * 0.14);
    fillRgba(ctx, x0, edgeW, yTop, height, thermal.rgb, alpha * 0.52);
    fillRgba(
      ctx,
      x0 + edgeW,
      Math.max(1, spanW - edgeW),
      yTop,
      height,
      thermal.rgb,
      alpha * 0.84,
    );
    drawn += 1;
  }
  return drawn;
}

function drawLifecycleWalls(
  ctx: CanvasRenderingContext2D,
  levels: LimitOrderLifecycleLevel[],
  metrics: SurfacePlotMetrics,
  params: BookmapSurfaceFrameParams,
  dataEndTime: number,
  heatmapOpacity: number,
): number {
  const visibleStart = params.timeViewport.visibleStartTime;
  const visibleEnd = params.timeViewport.visibleEndTime;
  const xHistEnd = metrics.timeToX(dataEndTime);
  const xProjEnd = metrics.timeToX(visibleEnd);
  let drawn = 0;

  const walls = levels
    .filter((l) => l.isWall && l.state !== "stale")
    .sort((a, b) => a.peakSizeBtc - b.peakSizeBtc);

  for (const wall of walls) {
    const thermalSize = Math.max(wall.peakSizeBtc, wall.currentSizeBtc);
    const thermal = resolveSurfaceThermalFromSize(thermalSize);
    const lifeAlpha = resolveLifecycleVisualAlpha(wall);
    const { yTop, height } = priceBandBounds(
      wall.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (yTop + height < HEATMAP_PAD.top - 2) continue;

    const histStart = metrics.timeToX(
      wall.isHistorical ? Math.max(visibleStart, wall.firstSeenTime) : visibleStart,
    );
    const histW = Math.max(1, xHistEnd - histStart);
    const bodyAlpha = thermal.alpha * lifeAlpha * heatmapOpacity * 0.64;

    fillRgba(
      ctx,
      histStart,
      histW,
      yTop - height * 0.1,
      height * 1.2,
      thermal.rgb,
      bodyAlpha * 0.32,
    );
    fillRgba(ctx, histStart, histW, yTop, height, thermal.rgb, bodyAlpha * 0.72);

    if (wall.isDominant || wall.state === "reinforced") {
      const coreRgb = resolveSurfaceThermalFromSize(thermalSize * 1.1).rgb;
      fillRgba(
        ctx,
        histStart + histW * 0.1,
        histW * 0.5,
        yTop + height * 0.28,
        height * 0.44,
        coreRgb,
        bodyAlpha * 0.88,
      );
    }

    if (wall.isLive && xProjEnd > xHistEnd + 2) {
      fillRgba(
        ctx,
        xHistEnd,
        xProjEnd - xHistEnd,
        yTop,
        height,
        thermal.rgb,
        bodyAlpha * 0.76,
      );
    }
    drawn += 1;
  }
  return drawn;
}

export function paintBookmapSurfaceRendererFrame(
  ctx: CanvasRenderingContext2D,
  params: BookmapSurfaceFrameParams,
  metrics: SurfacePlotMetrics,
): SurfaceRendererDiagStats {
  if (!BOOKMAP_SURFACE_RENDERER_V1) {
    return { ...lastSurfaceRendererDiag, surfaceRendererActive: false };
  }

  const { engine, timeViewport, minPrice, maxPrice } = params;
  const dataEndTime = timeViewport.dataEndTime;
  const visibleStart = timeViewport.visibleStartTime;
  const visibleEnd = timeViewport.visibleEndTime;
  const regime = resolveZoomRegime(computeVisiblePriceRangePct(minPrice, maxPrice));
  const minSize =
    regime === "macro" ? SURFACE_MACRO_MIN_SIZE_BTC : SURFACE_MICRO_MIN_SIZE_BTC;
  const heatmapOpacity = params.visualSettings?.heatmap.opacity ?? 1;

  const tierDiag = { weak: 0, medium: 0, strong: 0, extreme: 0 };

  const historicalInput = collectHistoricalCells(
    engine,
    dataEndTime,
    minPrice,
    maxPrice,
    visibleStart,
    visibleEnd,
  );
  const historicalDrawn = drawHistoricalSurface(
    ctx,
    historicalInput,
    metrics,
    dataEndTime,
    heatmapOpacity,
    tierDiag,
  );

  const { levels: liveLevels, source: liveDomSource } = collectSurfaceLiveLevels(
    engine,
    minPrice,
    maxPrice,
    dataEndTime,
    regime,
    minSize,
  );

  let lifecycleLevels: LimitOrderLifecycleLevel[] = [];
  let lifecycleLevelsDrawn = 0;
  let lifecycleLiveDrawn = 0;
  let lifecycleHistoricalDrawn = 0;
  let lifecycleFadingDrawn = 0;
  let domDraw = { drawn: 0, bid: 0, ask: 0 };

  if (BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1) {
    lifecycleLevels = updateLimitOrderLifecycleEngine({
      engine,
      minPrice,
      maxPrice,
      spot: params.spot,
      bestBid: engine.liveDomSelection?.bestBid ?? null,
      bestAsk: engine.liveDomSelection?.bestAsk ?? null,
      dataEndTime,
      now: Date.now(),
      regime,
      priceBucketUsd: params.domBucketSize,
    });

    const trail = drawLifecycleHistoricalTrail(
      ctx,
      lifecycleLevels,
      metrics,
      params,
      regime,
      dataEndTime,
      heatmapOpacity,
      tierDiag,
    );
    const liveSurf = drawLifecycleLiveSurface(
      ctx,
      lifecycleLevels,
      metrics,
      params,
      regime,
      dataEndTime,
      heatmapOpacity,
      tierDiag,
    );
    drawLifecycleLiveProjection(
      ctx,
      lifecycleLevels,
      metrics,
      params,
      regime,
      dataEndTime,
      heatmapOpacity,
    );
    drawLifecycleWalls(ctx, lifecycleLevels, metrics, params, dataEndTime, heatmapOpacity);

    lifecycleLevelsDrawn = trail.drawn + liveSurf.drawn;
    lifecycleLiveDrawn = liveSurf.live;
    lifecycleHistoricalDrawn = trail.historical;
    lifecycleFadingDrawn = trail.fading;
    domDraw = { drawn: liveSurf.drawn, bid: liveSurf.bid, ask: liveSurf.ask };
    setLimitOrderLifecycleVisibleDrawn(lifecycleLevelsDrawn);
  } else {
    domDraw = drawLiveDepthSurface(
      ctx,
      liveLevels,
      metrics,
      params,
      regime,
      dataEndTime,
      tierDiag,
    );
    drawLiveProjectionSurface(
      ctx,
      liveLevels,
      metrics,
      params,
      regime,
      dataEndTime,
    );
    drawImportantWalls(
      ctx,
      engine.walls ?? [],
      engine.bands ?? [],
      metrics,
      params,
      dataEndTime,
      heatmapOpacity,
    );
  }

  lastSurfaceRendererDiag = {
    surfaceRendererActive: true,
    historicalCellsInput: historicalInput.length,
    historicalCellsDrawn: historicalDrawn,
    liveDomLevelsInput: liveLevels.length,
    liveDomLevelsDrawn: domDraw.drawn,
    bidLevelsDrawn: domDraw.bid,
    askLevelsDrawn: domDraw.ask,
    weakLevelsDrawn: tierDiag.weak,
    mediumLevelsDrawn: tierDiag.medium,
    strongLevelsDrawn: tierDiag.strong,
    extremeLevelsDrawn: tierDiag.extreme,
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    zoomRegime: regime,
    drawMode: BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1 ? "surface_v1+lifecycle" : "surface_v1",
    liveDomSource,
    lifecycleLevelsInput: lifecycleLevels.length,
    lifecycleLevelsDrawn,
    lifecycleLiveDrawn,
    lifecycleHistoricalDrawn,
    lifecycleFadingDrawn,
    timestamp: Date.now(),
  };
  emitSurfaceRendererDiag();
  return lastSurfaceRendererDiag;
}
