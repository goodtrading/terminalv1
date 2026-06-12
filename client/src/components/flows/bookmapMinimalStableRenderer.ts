/**
 * B.CLEAN.1 — Minimal stable bookmap heatmap renderer (no experimental layers).
 */

import {
  BOOKMAP_CLEAN_BASELINE_DIAG,
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG,
  BOOKMAP_MINIMAL_STABLE_RENDERER_V1,
  HISTORICAL_SURFACE_MICROCELL_GAP_PX,
  HISTORICAL_SURFACE_MICROCELL_MIN_WIDTH_PX,
  HISTORICAL_SURFACE_MICROCELL_TEXTURE_V1,
  HISTORICAL_SURFACE_MIN_CELL_WIDTH_MS,
  HISTORICAL_SURFACE_PERSISTENT_CELL_WIDTH_MS,
  HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1,
  HISTORICAL_SURFACE_ROW_HEIGHT_USD,
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
import { bucketPrice as bucketDomPrice } from "./domLadderUtils";

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

function domAlignedPrice(price: number, domBucketSize: number): number {
  return bucketDomPrice(price, Math.max(1, domBucketSize || 1));
}

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

function surfaceBandGeom(
  price: number,
  priceToY: (p: number) => number,
): BandGeom {
  const half = HISTORICAL_SURFACE_ROW_HEIGHT_USD * 0.5;
  const yTop = priceToY(price + half);
  const yBot = priceToY(price - half);
  const rawTop = Math.min(yTop, yBot);
  const rawHeight = Math.max(1, Math.abs(yBot - yTop));
  const gap = rawHeight >= 4 ? 1 : rawHeight >= 2 ? 0.5 : 0;
  return {
    yTop: rawTop + gap * 0.5,
    height: Math.max(1, rawHeight - gap),
  };
}

function thermalFromSurfaceCell(cell: HistoricalLiquiditySurfaceCell): {
  rgb: [number, number, number];
  alpha: number;
  intensity: number;
} {
  const intensity = Math.max(cell.intensity, Math.min(1, cell.maxSize / 120));
  const persistenceBoost = Math.min(0.2, cell.persistenceMs / 90_000);
  const weakFloor = cell.maxSize < 1 ? 0.075 : cell.maxSize < 5 ? 0.105 : 0.145;
  const alpha =
    Math.max(weakFloor, 0.095 + intensity * 0.38 + persistenceBoost * 0.45) *
    cell.decay *
    (cell.coldStartSeeded ? 0.52 : 1);
  return {
    intensity,
    rgb: intensityToPassiveLiquidityRgb(intensity),
    alpha,
  };
}

function bucketWidthPx(timeMs: number, timeToX: (t: number) => number): number {
  return Math.max(1, timeToX(timeMs + BOOKMAP_ENGINE_BUCKET_MS) - timeToX(timeMs));
}

function surfaceCellWidthPx(
  cell: HistoricalLiquiditySurfaceCell,
  timeToX: (t: number) => number,
): number {
  const raw = bucketWidthPx(cell.timeBucket, timeToX);
  const textureMod = cell.textureMod ?? 1;
  const baseMin =
    timeToX(cell.timeBucket + HISTORICAL_SURFACE_MIN_CELL_WIDTH_MS) -
    timeToX(cell.timeBucket);
  const persistentMin =
    timeToX(cell.timeBucket + HISTORICAL_SURFACE_PERSISTENT_CELL_WIDTH_MS) -
    timeToX(cell.timeBucket);
  if (cell.coldStartSeeded) {
    return Math.max(raw, baseMin * (0.38 + textureMod * 0.12), 1);
  }
  if (cell.persistenceMs > 30_000 && cell.intensity >= 0.28) {
    return Math.max(raw, persistentMin, 1);
  }
  return Math.max(raw, baseMin * (0.62 + textureMod * 0.12), 1);
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

function textureSeed(price: number, timeOrX: number, sideSalt: number): number {
  const v = Math.sin(price * 0.017 + timeOrX * 0.000_083 + sideSalt) * 10_000;
  return v - Math.floor(v);
}

function textureAlphaMod(price: number, timeOrX: number, side: "bid" | "ask"): number {
  const seed = textureSeed(price, timeOrX, side === "bid" ? 2.1 : 3.4);
  return 0.82 + seed * 0.3;
}

function fillTexturedSurfaceCell(
  ctx: CanvasRenderingContext2D,
  cell: HistoricalLiquiditySurfaceCell,
  x: number,
  w: number,
  geom: BandGeom,
  rgb: [number, number, number],
  alpha: number,
): { fragments: number; alphaSum: number; varianceSamples: number[] } {
  if (!HISTORICAL_SURFACE_MICROCELL_TEXTURE_V1 || w < HISTORICAL_SURFACE_MICROCELL_MIN_WIDTH_PX) {
    fillBand(ctx, x, w, geom, rgb, alpha);
    return { fragments: 1, alphaSum: alpha, varianceSamples: [alpha] };
  }

  const maxFragments = cell.coldStartSeeded ? 2 : cell.persistenceMs > 30_000 ? 4 : 3;
  const fragments = Math.max(
    1,
    Math.min(maxFragments, Math.floor(w / HISTORICAL_SURFACE_MICROCELL_MIN_WIDTH_PX)),
  );
  const gap = Math.min(HISTORICAL_SURFACE_MICROCELL_GAP_PX, Math.max(0, w / fragments - 1));
  const fragmentW = Math.max(1, (w - gap * (fragments - 1)) / fragments);
  let alphaSum = 0;
  const samples: number[] = [];
  for (let i = 0; i < fragments; i += 1) {
    const fx = x + i * (fragmentW + gap);
    const mod = textureAlphaMod(cell.price, cell.timeBucket + i * 137, cell.side);
    const fa = alpha * mod;
    fillBand(ctx, fx, fragmentW, geom, rgb, fa);
    alphaSum += fa;
    samples.push(fa);
  }
  return { fragments, alphaSum, varianceSamples: samples };
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
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
  domBucketSize: number,
): HistoricalLiquiditySurfaceCell[] {
  return (engine.historicalSurfaceCells ?? []).filter((cell) => {
    const end = cell.timeBucket + BOOKMAP_ENGINE_BUCKET_MS;
    if (end < visibleStart || cell.timeBucket > visibleEnd) return false;
    if (cell.timeBucket >= dataEndTime + BOOKMAP_ENGINE_BUCKET_MS) return false;
    const rowPrice = domAlignedPrice(cell.price, domBucketSize);
    return rowPrice >= minPrice && rowPrice <= maxPrice && cell.maxSize > 0;
  });
}

function collectLiveLevels(
  engine: PreparedEngineRenderData,
  domBucketSize: number,
): PreparedLiveProjectionLevel[] {
  const map = new Map<string, PreparedLiveProjectionLevel>();
  const add = (level: PreparedLiveProjectionLevel) => {
    const rowPrice = domAlignedPrice(level.price, domBucketSize);
    const key = `${level.side}:${rowPrice}`;
    const prev = map.get(key);
    if (!prev || level.sizeBtc > prev.sizeBtc) map.set(key, { ...level, price: rowPrice });
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
  const domBucketSize = Math.max(1, metrics.domBucketSize || 1);
  const dataEndTime = timeViewport.dataEndTime;
  const dataEdgeX = metrics.timeToX(dataEndTime);
  const opacity = params.visualSettings?.heatmap.opacity ?? 1;
  const bucketW = bucketWidthPx(dataEndTime - BOOKMAP_ENGINE_BUCKET_MS, metrics.timeToX);
  const renderSkips = {
    clippedTime: 0,
    clippedPrice: 0,
    tinyAlpha: 0,
  };
  const widthStats = {
    min: Number.POSITIVE_INFINITY,
    max: 0,
    sum: 0,
    count: 0,
  };
  const heightStats = {
    min: Number.POSITIVE_INFINITY,
    max: 0,
    sum: 0,
    count: 0,
  };
  const renderedTiers = {
    weak: 0,
    medium: 0,
    strong: 0,
  };
  const rowAlphaSamples = new Map<number, number[]>();
  let microcellFragmentCount = 0;
  let coldStartCellsRendered = 0;
  let liveCellsRendered = 0;
  let projectedCellCount = 0;
  let projectedAlphaSum = 0;
  let projectedWidthSum = 0;
  const renderedRows = new Set<number>();
  const renderedBuckets = new Set<number>();
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  const surfaceCells = collectHistoricalSurfaceCells(
    engine,
    dataEndTime,
    minPrice,
    maxPrice,
    timeViewport.visibleStartTime,
    timeViewport.visibleEndTime,
    domBucketSize,
  );

  if (surfaceCells.length > 0) {
    for (const cell of surfaceCells) {
      const rowPrice = domAlignedPrice(cell.price, domBucketSize);
      const renderCell =
        rowPrice === cell.price ? cell : { ...cell, price: rowPrice };
      const geom = surfaceBandGeom(rowPrice, metrics.priceToY);
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
        surfaceCellWidthPx(cell, metrics.timeToX),
        Math.max(1, dataEdgeX - x0),
      );

      const thermal = thermalFromSurfaceCell(renderCell);
      const alpha = thermal.alpha * opacity * 0.88;
      if (alpha <= 0.004) {
        renderSkips.tinyAlpha += 1;
        continue;
      }
      const texture = fillTexturedSurfaceCell(ctx, renderCell, x0, w, geom, thermal.rgb, alpha);
      microcellFragmentCount += texture.fragments;
      const rowSamples = rowAlphaSamples.get(rowPrice) ?? [];
      rowSamples.push(...texture.varianceSamples);
      rowAlphaSamples.set(rowPrice, rowSamples);
      widthStats.min = Math.min(widthStats.min, w);
      widthStats.max = Math.max(widthStats.max, w);
      widthStats.sum += w;
      widthStats.count += 1;
      heightStats.min = Math.min(heightStats.min, geom.height);
      heightStats.max = Math.max(heightStats.max, geom.height);
      heightStats.sum += geom.height;
      heightStats.count += 1;
      if (cell.intensity < 0.12) renderedTiers.weak += 1;
      else if (cell.intensity < 0.38) renderedTiers.medium += 1;
      else renderedTiers.strong += 1;
      if (cell.coldStartSeeded) coldStartCellsRendered += 1;
      else liveCellsRendered += 1;
      renderedRows.add(rowPrice);
      renderedBuckets.add(cell.timeBucket);
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
  ctx.imageSmoothingEnabled = prevSmoothing;

  const projX1 = metrics.timeToX(timeViewport.visibleEndTime);
  const hasProjection =
    projX1 - dataEdgeX >= 2 &&
    timeViewport.visibleEndTime > dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS;

  for (const level of collectLiveLevels(engine, domBucketSize)) {
    if (level.price < minPrice || level.price > maxPrice) continue;
    if (level.sizeBtc < 0.25) continue;

    const geom = surfaceBandGeom(level.price, metrics.priceToY);
    if (geom.yTop + geom.height < HEATMAP_PAD.top - 2) continue;
    if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const thermal = thermalFromSize(level.sizeBtc);
    const edgeX = metrics.timeToX(dataEndTime - BOOKMAP_ENGINE_BUCKET_MS);
    const edgeW = Math.min(bucketW, Math.max(1, dataEdgeX - edgeX));
    const edgeMod = HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1
      ? textureAlphaMod(level.price, dataEndTime, level.side)
      : 1;
    const edgeDrawW = HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1
      ? Math.max(1, edgeW * 0.82)
      : edgeW;
    const edgeAlpha = thermal.alpha * opacity * 0.66 * edgeMod;
    fillBand(ctx, edgeX, edgeDrawW, geom, thermal.rgb, edgeAlpha);
    projectedCellCount += 1;
    projectedAlphaSum += edgeAlpha;
    projectedWidthSum += edgeDrawW;

    if (hasProjection) {
      for (let x = dataEdgeX; x < projX1; x += bucketW) {
        const w = Math.min(bucketW, projX1 - x);
        const mod = HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1
          ? textureAlphaMod(level.price, x, level.side)
          : 1;
        const drawW = HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1
          ? Math.max(1, w * (0.58 + mod * 0.18))
          : w;
        const alpha = thermal.alpha * opacity * 0.58 * mod;
        fillBand(
          ctx,
          x,
          drawW,
          geom,
          thermal.rgb,
          alpha,
        );
        projectedCellCount += 1;
        projectedAlphaSum += alpha;
        projectedWidthSum += drawW;
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

  if (engine.historicalSurfaceDiag) {
    engine.historicalSurfaceDiag.renderCellCountPerFrame = result.visibleHeatmapCells;
    if (import.meta.env.DEV && BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG) {
      const now = Date.now();
      if (now - lastHistoricalSurfaceRenderDiagMs >= 2_000) {
        lastHistoricalSurfaceRenderDiagMs = now;
        const rowVariances = Array.from(rowAlphaSamples.values()).map(variance);
        const averageRowVariance =
          rowVariances.length > 0
            ? rowVariances.reduce((sum, v) => sum + v, 0) / rowVariances.length
            : 0;
        console.debug("[BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_RENDER]", {
          ...engine.historicalSurfaceDiag,
          rendererPathActuallyUsed: "bookmapMinimalStableRenderer.surface",
          visibleHistoricalCellCount: surfaceCells.length,
          domLadderTickSize: domBucketSize,
          heatmapPriceBucketSize: engine.bandPrepareMeta.heatmapBucketSize,
          effectiveRenderPriceStep: domBucketSize,
          priceAxisStep: engine.bandPrepareMeta.labelStep,
          visiblePriceMin: minPrice,
          visiblePriceMax: maxPrice,
          visibleRangeAbovePrice:
            params.spot != null && Number.isFinite(params.spot) ? Math.max(0, maxPrice - params.spot) : 0,
          visibleRangeBelowPrice:
            params.spot != null && Number.isFinite(params.spot) ? Math.max(0, params.spot - minPrice) : 0,
          renderedPriceRows: renderedRows.size,
          domRowCount: Math.max(0, Math.floor((maxPrice - minPrice) / domBucketSize) + 1),
          heatmapRowsAlignedToDom: Array.from(renderedRows).every(
            (price) => Math.abs(domAlignedPrice(price, domBucketSize) - price) < 0.000_001,
          ),
          skippedRowsDueToRange: renderSkips.clippedPrice,
          priceRoundingModeUsedByHeatmap: "nearest-dom-bucket",
          priceRoundingModeUsedByDomCob: "nearest-dom-bucket",
          renderCellCountPerFrame: result.visibleHeatmapCells,
          renderSkippedCells: renderSkips,
          averageRenderedCellWidthPx:
            widthStats.count > 0 ? widthStats.sum / widthStats.count : 0,
          minRenderedCellWidthPx: Number.isFinite(widthStats.min) ? widthStats.min : 0,
          maxRenderedCellWidthPx: widthStats.max,
          averageRenderedCellHeightPx:
            heightStats.count > 0 ? heightStats.sum / heightStats.count : 0,
          minRenderedCellHeightPx: Number.isFinite(heightStats.min) ? heightStats.min : 0,
          maxRenderedCellHeightPx: heightStats.max,
          bucketMergeFactor: engine.historicalSurfaceDiag.bucketMergeFactor,
          priceLevelMergeFactor: engine.historicalSurfaceDiag.priceLevelMergeFactor,
          priceLevelsCollapsedPerRow: 1,
          timeBucketsStretchedPerCell:
            widthStats.count > 0
              ? (widthStats.sum / widthStats.count) /
                Math.max(1, bucketWidthPx(dataEndTime - BOOKMAP_ENGINE_BUCKET_MS, metrics.timeToX))
              : 0,
          smoothingEnabled: false,
          alphaAccumulationMode: "single-rect-source-over",
          coldStartCellsRendered,
          realLiveCellsRendered: liveCellsRendered,
          renderedDarkGapCount:
            engine.historicalSurfaceDiag.inactiveLevelCount +
            Math.max(0, engine.historicalSurfaceDiag.visiblePriceLevels - renderedRows.size),
          inactiveLevelCount: engine.historicalSurfaceDiag.inactiveLevelCount,
          renderedTimeBucketCount: renderedBuckets.size,
          renderedCellsByIntensityTier: renderedTiers,
          microcellTextureEnabled: HISTORICAL_SURFACE_MICROCELL_TEXTURE_V1,
          microcellFragmentCount,
          averageRowUniformity: 1 / (1 + averageRowVariance * 1_000),
          perRowIntensityVariance: averageRowVariance,
          projectionTextureEnabled: HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1,
          projectedRightSideRenderedCellCount: projectedCellCount,
          averageProjectedCellWidthPx:
            projectedCellCount > 0 ? projectedWidthSum / projectedCellCount : 0,
          averageProjectedCellAlpha:
            projectedCellCount > 0 ? projectedAlphaSum / projectedCellCount : 0,
        });
      }
    }
  }

  return result;
}
