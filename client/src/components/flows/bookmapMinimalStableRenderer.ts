/**
 * B.CLEAN.1 — Minimal stable bookmap heatmap renderer (no experimental layers).
 */

import {
  BOOKMAP_CLEAN_BASELINE_DIAG,
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG,
  BOOKMAP_MINIMAL_STABLE_RENDERER_V1,
  HISTORICAL_SURFACE_MIN_CELL_WIDTH_MS,
} from "@/lib/bookmapEngineConfig";
import {
  intensityToPassiveLiquidityRgb,
} from "@/lib/bookmapBandColors";
import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { BookmapVisualSettings } from "@/components/terminal/bookmap/bookmapSettings";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";
import {
  BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS,
  type PreparedEngineRenderData,
  type PreparedEngineTextureCell,
  type PreparedLiveProjectionLevel,
} from "./bookmapEnginePrepare";
import type { HistoricalLiquiditySurfaceCell } from "./bookmapHistoricalLiquiditySurface";

export type MinimalStablePlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
  domBucketSize: number;
};

export type MinimalStableFrameParams = {
  minPrice: number;
  maxPrice: number;
  spot: number | null;
  engine: PreparedEngineRenderData;
  timeViewport: BookmapTimeViewport;
  visualSettings?: BookmapVisualSettings;
};

export type MinimalStableRenderResult = {
  visibleHeatmapCells: number;
  visibleLiveLevels: number;
  visibleWallBands: number;
};

type BandGeom = { yTop: number; height: number };

let lastHistoricalSurfaceRenderDiagMs = 0;

function bandGeom(
  price: number,
  priceToY: (p: number) => number,
  bucketSize: number,
): BandGeom {
  const half = Math.max(1, bucketSize * 0.5);
  const yTop = priceToY(price + half);
  const yBot = priceToY(price - half);
  return { yTop: Math.min(yTop, yBot), height: Math.max(1, Math.abs(yBot - yTop)) };
}

function thermalFromSize(sizeBtc: number): {
  rgb: [number, number, number];
  alpha: number;
  intensity: number;
} {
  const intensity = Math.min(1, sizeBtc / 100);
  return {
    intensity,
    rgb: intensityToPassiveLiquidityRgb(intensity),
    alpha: 0.22 + intensity * 0.52,
  };
}

function thermalFromSurfaceCell(cell: HistoricalLiquiditySurfaceCell): {
  rgb: [number, number, number];
  alpha: number;
  intensity: number;
} {
  const intensity = Math.max(cell.intensity, Math.min(1, cell.maxSize / 120));
  const persistenceBoost = Math.min(0.2, cell.persistenceMs / 90_000);
  const weakFloor = cell.maxSize < 1 ? 0.12 : cell.maxSize < 5 ? 0.16 : 0.2;
  const alpha =
    Math.max(weakFloor, 0.15 + intensity * 0.5 + persistenceBoost) * cell.decay;
  return {
    intensity,
    rgb: intensityToPassiveLiquidityRgb(intensity),
    alpha,
  };
}

function bucketWidthPx(timeMs: number, timeToX: (t: number) => number): number {
  return Math.max(1, timeToX(timeMs + BOOKMAP_ENGINE_BUCKET_MS) - timeToX(timeMs));
}

function minSurfaceCellWidthPx(timeMs: number, timeToX: (t: number) => number): number {
  return Math.max(
    bucketWidthPx(timeMs, timeToX),
    timeToX(timeMs + HISTORICAL_SURFACE_MIN_CELL_WIDTH_MS) - timeToX(timeMs),
    1,
  );
}

function fillBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  geom: BandGeom,
  rgb: [number, number, number],
  alpha: number,
): void {
  if (alpha <= 0.004 || w <= 0) return;
  ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  ctx.fillRect(x, geom.yTop, w, geom.height);
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
  return (engine.restingLiquidityRawCells ?? [])
    .filter((c) => {
      if (c.timeBucket >= dataEndTime) return false;
      if (c.timeBucket < visibleStart || c.timeBucket > visibleEnd) return false;
      return c.price >= minPrice && c.price <= maxPrice && c.maxSizeInBucket > 0;
    })
    .map((c) => ({
      timeBucket: c.timeBucket,
      price: c.price,
      side: c.side,
      intensity: Math.min(1, c.maxSizeInBucket / 50),
      isMajor: false,
      maxSizeInBucket: c.maxSizeInBucket,
    }));
}

function collectHistoricalSurfaceCells(
  engine: PreparedEngineRenderData,
  dataEndTime: number,
  minPrice: number,
  maxPrice: number,
  visibleStart: number,
  visibleEnd: number,
): HistoricalLiquiditySurfaceCell[] {
  return (engine.historicalSurfaceCells ?? []).filter((cell) => {
    const end = cell.timeBucket + BOOKMAP_ENGINE_BUCKET_MS;
    if (end < visibleStart || cell.timeBucket > visibleEnd) return false;
    if (cell.timeBucket >= dataEndTime + BOOKMAP_ENGINE_BUCKET_MS) return false;
    return cell.price >= minPrice && cell.price <= maxPrice && cell.maxSize > 0;
  });
}

function collectLiveLevels(engine: PreparedEngineRenderData): PreparedLiveProjectionLevel[] {
  const map = new Map<string, PreparedLiveProjectionLevel>();
  const add = (level: PreparedLiveProjectionLevel) => {
    const key = `${level.side}:${level.price}`;
    const prev = map.get(key);
    if (!prev || level.sizeBtc > prev.sizeBtc) map.set(key, level);
  };
  for (const level of [
    ...(engine.activeDomBands ?? []),
    ...(engine.liveProjectionLevels ?? []),
  ]) {
    add(level);
  }
  const sel = engine.liveDomSelection;
  if (sel) {
    for (const level of [...sel.levels, ...sel.activeDomBands]) {
      add(level);
    }
  }
  return Array.from(map.values());
}

export function drawMinimalStableWatermark(ctx: CanvasRenderingContext2D): void {
  if (!import.meta.env.DEV || !BOOKMAP_CLEAN_BASELINE_DIAG) return;
  ctx.save();
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 3;
  const x = HEATMAP_PAD.left + 6;
  let y = HEATMAP_PAD.top + 14;
  ctx.fillStyle = "rgba(148, 163, 184, 0.92)";
  ctx.strokeText("MINIMAL STABLE BOOKMAP V1 ACTIVE", x, y);
  ctx.fillText("MINIMAL STABLE BOOKMAP V1 ACTIVE", x, y);
  y += 14;
  ctx.fillStyle = "rgba(34, 211, 238, 0.94)";
  ctx.strokeText("HISTORICAL LIQUIDITY SURFACE V1 ACTIVE", x, y);
  ctx.fillText("HISTORICAL LIQUIDITY SURFACE V1 ACTIVE", x, y);
  ctx.restore();
}

export function paintMinimalStableBookmapFrame(
  ctx: CanvasRenderingContext2D,
  params: MinimalStableFrameParams,
  metrics: MinimalStablePlotMetrics,
): MinimalStableRenderResult {
  const result: MinimalStableRenderResult = {
    visibleHeatmapCells: 0,
    visibleLiveLevels: 0,
    visibleWallBands: 0,
  };

  if (!BOOKMAP_MINIMAL_STABLE_RENDERER_V1) return result;

  const { engine, timeViewport, minPrice, maxPrice } = params;
  const dataEndTime = timeViewport.dataEndTime;
  const dataEdgeX = metrics.timeToX(dataEndTime);
  const opacity = params.visualSettings?.heatmap.opacity ?? 1;
  const bucketW = bucketWidthPx(dataEndTime - BOOKMAP_ENGINE_BUCKET_MS, metrics.timeToX);
  const renderSkips = {
    clippedTime: 0,
    clippedPrice: 0,
    tinyAlpha: 0,
  };

  const surfaceCells = collectHistoricalSurfaceCells(
    engine,
    dataEndTime,
    minPrice,
    maxPrice,
    timeViewport.visibleStartTime,
    timeViewport.visibleEndTime,
  );

  if (surfaceCells.length > 0) {
    for (const cell of surfaceCells) {
      const geom = bandGeom(cell.price, metrics.priceToY, metrics.domBucketSize);
      if (geom.yTop + geom.height < HEATMAP_PAD.top - 2) {
        renderSkips.clippedPrice += 1;
        continue;
      }
      if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) {
        renderSkips.clippedPrice += 1;
        continue;
      }

      const x0 = metrics.timeToX(cell.timeBucket);
      if (x0 >= dataEdgeX) {
        renderSkips.clippedTime += 1;
        continue;
      }
      const w = Math.min(
        minSurfaceCellWidthPx(cell.timeBucket, metrics.timeToX),
        Math.max(1, dataEdgeX - x0),
      );

      const thermal = thermalFromSurfaceCell(cell);
      const alpha = thermal.alpha * opacity * 0.88;
      if (alpha <= 0.004) {
        renderSkips.tinyAlpha += 1;
        continue;
      }
      fillBand(ctx, x0, w, geom, thermal.rgb, alpha);
      result.visibleHeatmapCells += 1;
    }
  } else {
    for (const cell of collectHistoricalCells(
      engine,
      dataEndTime,
      minPrice,
      maxPrice,
      timeViewport.visibleStartTime,
      timeViewport.visibleEndTime,
    )) {
      const size = cell.maxSizeInBucket;
      const vi = cell.intensity ?? Math.min(1, size / 50);
      if (vi < 0.03 && size < 0.5) continue;

      const geom = bandGeom(cell.price, metrics.priceToY, metrics.domBucketSize);
      if (geom.yTop + geom.height < HEATMAP_PAD.top - 2) continue;
      if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

      const x0 = metrics.timeToX(cell.timeBucket);
      if (x0 >= dataEdgeX) continue;
      let w = bucketWidthPx(cell.timeBucket, metrics.timeToX);
      w = Math.min(w, Math.max(1, dataEdgeX - x0));

      const thermal = thermalFromSize(size);
      const rgb = intensityToPassiveLiquidityRgb(Math.max(vi, thermal.intensity * 0.85));
      fillBand(ctx, x0, w, geom, rgb, thermal.alpha * opacity * 0.75);
      result.visibleHeatmapCells += 1;
    }
  }

  if (engine.historicalSurfaceDiag) {
    engine.historicalSurfaceDiag.renderCellCountPerFrame = result.visibleHeatmapCells;
    if (import.meta.env.DEV && BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG) {
      const now = Date.now();
      if (now - lastHistoricalSurfaceRenderDiagMs >= 2_000) {
        lastHistoricalSurfaceRenderDiagMs = now;
        console.debug("[BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_RENDER]", {
          ...engine.historicalSurfaceDiag,
          rendererPathActuallyUsed: "bookmapMinimalStableRenderer.surface",
          visibleHistoricalCellCount: surfaceCells.length,
          renderCellCountPerFrame: result.visibleHeatmapCells,
          renderSkippedCells: renderSkips,
        });
      }
    }
  }

  const projX1 = metrics.timeToX(timeViewport.visibleEndTime);
  const hasProjection =
    projX1 - dataEdgeX >= 2 &&
    timeViewport.visibleEndTime > dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS;

  for (const level of collectLiveLevels(engine)) {
    if (level.price < minPrice || level.price > maxPrice) continue;
    if (level.sizeBtc < 0.25) continue;

    const geom = bandGeom(level.price, metrics.priceToY, metrics.domBucketSize);
    if (geom.yTop + geom.height < HEATMAP_PAD.top - 2) continue;
    if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const thermal = thermalFromSize(level.sizeBtc);
    const edgeX = metrics.timeToX(dataEndTime - BOOKMAP_ENGINE_BUCKET_MS);
    const edgeW = Math.min(bucketW, Math.max(1, dataEdgeX - edgeX));
    fillBand(ctx, edgeX, edgeW, geom, thermal.rgb, thermal.alpha * opacity * 0.75);

    if (hasProjection) {
      for (let x = dataEdgeX; x < projX1; x += bucketW) {
        fillBand(
          ctx,
          x,
          Math.min(bucketW, projX1 - x),
          geom,
          thermal.rgb,
          thermal.alpha * opacity * 0.72,
        );
      }
    }
    result.visibleLiveLevels += 1;
  }

  for (const band of engine.bands ?? []) {
    if (band.maxSize < 20) continue;
    if (band.price < minPrice || band.price > maxPrice) continue;

    const geom = bandGeom(band.price, metrics.priceToY, metrics.domBucketSize);
    if (geom.yTop + geom.height < HEATMAP_PAD.top - 2) continue;

    const thermal = thermalFromSize(band.maxSize);
    const x0 = metrics.timeToX(timeViewport.visibleStartTime);
    fillBand(
      ctx,
      x0,
      Math.max(1, dataEdgeX - x0),
      geom,
      thermal.rgb,
      thermal.alpha * opacity * 0.68,
    );
    if (hasProjection) {
      for (let x = dataEdgeX; x < projX1; x += bucketW) {
        fillBand(
          ctx,
          x,
          Math.min(bucketW, projX1 - x),
          geom,
          thermal.rgb,
          thermal.alpha * opacity * 0.65,
        );
      }
    }
    result.visibleWallBands += 1;
  }

  return result;
}
