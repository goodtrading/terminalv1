/**
 * B.rebuild.1 — Canonical Bookmap heatmap foundation.
 * Single geometry + single visual mapping for historical, live, and walls.
 */

import {
  BOOKMAP_CANONICAL_HEATMAP_DIAG,
  BOOKMAP_CANONICAL_HEATMAP_V1,
  BOOKMAP_ENGINE_BUCKET_MS,
  CANONICAL_DOMINANT_SIZE_BTC,
  CANONICAL_FAR_DISTANCE_ALPHA_MUL,
  CANONICAL_HISTORICAL_MAX_DRAW,
  CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
  CANONICAL_LIVE_MAX_PER_SIDE,
  CANONICAL_MACRO_MIN_SIZE_BTC,
  CANONICAL_MICRO_MIN_SIZE_BTC,
  CANONICAL_WALL_SIZE_BTC,
  computeVisiblePriceRangePct,
  resolveZoomRegime,
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
  type PreparedEngineRenderData,
  type PreparedEngineTextureCell,
} from "./bookmapEnginePrepare";
import { isWallTier, type HeatmapBand } from "./bookmapBandTypes";

export type CanonicalHeatLayer = "historical" | "live" | "projection" | "wall";

export type CanonicalPriceBandGeometry = {
  yTop: number;
  bandHeightPx: number;
  bandInsetPx: number;
};

export type CanonicalLiquidityVisual = {
  thermalTier: SurfaceThermalTier;
  color: [number, number, number];
  alpha: number;
  bandHeightPx: number;
  coreHeightPx: number;
  glowHeightPx: number;
  shouldDrawCore: boolean;
  shouldDrawGlow: boolean;
  distanceAlphaMul: number;
};

export type CanonicalHeatmapDiagStats = {
  canonicalRendererActive: boolean;
  historicalLevelsInput: number;
  historicalLevelsDrawn: number;
  liveLevelsInput: number;
  liveLevelsDrawn: number;
  wallLevelsDrawn: number;
  macroDomLevelsDrawn: number;
  weakLevelsDrawn: number;
  mediumLevelsDrawn: number;
  strongLevelsDrawn: number;
  extremeLevelsDrawn: number;
  avgHistoricalBandHeightPx: number;
  avgLiveBandHeightPx: number;
  maxHistoricalBandHeightPx: number;
  maxLiveBandHeightPx: number;
  liveHistoricalHeightMismatchCount: number;
  liveHistoricalAlphaMismatchCount: number;
  visiblePriceMin: number;
  visiblePriceMax: number;
  zoomRegime: BookmapZoomRegime;
  legacyMismatchCause: string;
  timestamp: number;
};

export type BookmapCanonicalFrameParams = {
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

export type CanonicalPlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
  domBucketSize: number;
};

type CanonicalLiveLevel = {
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  isWall: boolean;
};

let lastCanonicalDiag: CanonicalHeatmapDiagStats = {
  canonicalRendererActive: false,
  historicalLevelsInput: 0,
  historicalLevelsDrawn: 0,
  liveLevelsInput: 0,
  liveLevelsDrawn: 0,
  wallLevelsDrawn: 0,
  macroDomLevelsDrawn: 0,
  weakLevelsDrawn: 0,
  mediumLevelsDrawn: 0,
  strongLevelsDrawn: 0,
  extremeLevelsDrawn: 0,
  avgHistoricalBandHeightPx: 0,
  avgLiveBandHeightPx: 0,
  maxHistoricalBandHeightPx: 0,
  maxLiveBandHeightPx: 0,
  liveHistoricalHeightMismatchCount: 0,
  liveHistoricalAlphaMismatchCount: 0,
  visiblePriceMin: 0,
  visiblePriceMax: 0,
  zoomRegime: "macro",
  legacyMismatchCause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
  timestamp: 0,
};

let lastCanonicalDiagLogMs = 0;

const heightByPriceLayer = new Map<string, number>();
const alphaByPriceLayer = new Map<string, number>();

function pctFromMid(price: number, mid: number | null): number {
  if (mid == null || mid <= 0) return 50;
  return (Math.abs(price - mid) / mid) * 100;
}

function distanceAlphaMul(pct: number, regime: BookmapZoomRegime): number {
  if (regime !== "macro") {
    if (pct > 8) return 0.58;
    if (pct > 4) return 0.74;
    return 1;
  }
  if (pct > 12) return CANONICAL_FAR_DISTANCE_ALPHA_MUL * 0.88;
  if (pct > 6) return CANONICAL_FAR_DISTANCE_ALPHA_MUL;
  if (pct > 3) return 0.92;
  return 1;
}

/** B.rebuild.1 — single price-band geometry for historical, live, and walls. */
export function resolveCanonicalPriceBandGeometry(
  price: number,
  priceToY: (price: number) => number,
  domBucketSize: number,
): CanonicalPriceBandGeometry {
  const half = Math.max(1, domBucketSize * 0.5);
  const yTop = priceToY(price + half);
  const yBot = priceToY(price - half);
  const bandHeightPx = Math.max(1, Math.abs(yBot - yTop));
  const bandInsetPx = Math.max(0, Math.min(1, bandHeightPx * 0.06));
  return { yTop: Math.min(yTop, yBot), bandHeightPx, bandInsetPx };
}

/** @deprecated alias */
export const resolveCanonicalBandGeometry = resolveCanonicalPriceBandGeometry;

/** B.rebuild.1 — single size→visual mapping for all layers. */
export function resolveCanonicalLiquidityVisual(
  sizeBtc: number,
  opts: {
    layer: CanonicalHeatLayer;
    regime: BookmapZoomRegime;
    distancePct: number;
    heatmapOpacity: number;
    geometry: CanonicalPriceBandGeometry;
    isWall?: boolean;
    intensityHint?: number;
  },
): CanonicalLiquidityVisual {
  const thermal =
    opts.intensityHint != null
      ? resolveSurfaceHistoricalThermal(opts.intensityHint, sizeBtc)
      : resolveSurfaceThermalFromSize(sizeBtc);

  const distanceAlphaMulValue = distanceAlphaMul(opts.distancePct, opts.regime);
  const alpha = Math.min(
    0.86,
    Math.max(0.08, thermal.alpha * distanceAlphaMulValue * opts.heatmapOpacity),
  );

  const isWall = opts.isWall === true || sizeBtc >= CANONICAL_WALL_SIZE_BTC;
  const isDominant = sizeBtc >= CANONICAL_DOMINANT_SIZE_BTC;
  const bodyH = Math.max(1, opts.geometry.bandHeightPx - opts.geometry.bandInsetPx * 2);
  const shouldDrawCore = isWall && (isDominant || sizeBtc >= CANONICAL_WALL_SIZE_BTC * 2.5);
  const shouldDrawGlow = false;

  const coreHeightPx = shouldDrawCore ? Math.min(bodyH, bodyH * 0.42) : 0;
  const glowHeightPx = bodyH;

  void opts.layer;

  return {
    thermalTier: thermal.tier,
    color: thermal.rgb,
    alpha,
    bandHeightPx: bodyH,
    coreHeightPx,
    glowHeightPx,
    shouldDrawCore,
    shouldDrawGlow,
    distanceAlphaMul: distanceAlphaMulValue,
  };
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

function recordDrawMetrics(
  price: number,
  layer: "historical" | "live",
  height: number,
  alpha: number,
  diag: CanonicalHeatmapDiagStats,
): void {
  heightByPriceLayer.set(`${price}:${layer}`, height);
  alphaByPriceLayer.set(`${price}:${layer}`, alpha);

  if (layer === "historical") {
    diag.maxHistoricalBandHeightPx = Math.max(diag.maxHistoricalBandHeightPx, height);
  } else {
    diag.maxLiveBandHeightPx = Math.max(diag.maxLiveBandHeightPx, height);
  }

  const otherLayer = layer === "historical" ? "live" : "historical";
  const otherH = heightByPriceLayer.get(`${price}:${otherLayer}`);
  const otherA = alphaByPriceLayer.get(`${price}:${otherLayer}`);
  if (otherH != null && Math.abs(otherH - height) > 0.5) {
    diag.liveHistoricalHeightMismatchCount += 1;
  }
  if (otherA != null && Math.abs(otherA - alpha) > 0.12) {
    diag.liveHistoricalAlphaMismatchCount += 1;
  }
}

function bucketWidthPx(timeMs: number, timeToX: (t: number) => number): number {
  return Math.max(1, timeToX(timeMs + BOOKMAP_ENGINE_BUCKET_MS) - timeToX(timeMs));
}

function drawCanonicalLevel(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  geom: CanonicalPriceBandGeometry,
  visual: CanonicalLiquidityVisual,
  layer: "historical" | "live",
  price: number,
  diag: CanonicalHeatmapDiagStats,
): void {
  const y = geom.yTop + geom.bandInsetPx;
  const h = visual.bandHeightPx;
  recordDrawMetrics(price, layer, h, visual.alpha, diag);
  fillRgba(ctx, x, w, y, h, visual.color, visual.alpha);

  if (visual.shouldDrawCore && visual.coreHeightPx > 0 && w >= 2) {
    const coreY = y + (h - visual.coreHeightPx) * 0.5;
    fillRgba(
      ctx,
      x + w * 0.15,
      Math.max(1, w * 0.5),
      coreY,
      visual.coreHeightPx,
      visual.color,
      visual.alpha * 0.85,
    );
  }
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

function collectCanonicalLiveLevels(
  engine: PreparedEngineRenderData,
  minPrice: number,
  maxPrice: number,
  minSize: number,
): CanonicalLiveLevel[] {
  const map = new Map<string, CanonicalLiveLevel>();
  const add = (side: "bid" | "ask", price: number, sizeBtc: number) => {
    if (price < minPrice || price > maxPrice || sizeBtc < minSize) return;
    const key = `${side}:${price}`;
    const prev = map.get(key);
    if (!prev || sizeBtc > prev.sizeBtc) {
      map.set(key, {
        side,
        price,
        sizeBtc,
        isWall: sizeBtc >= CANONICAL_WALL_SIZE_BTC,
      });
    }
  };

  for (const row of engine.currentDomBookLevels ?? []) {
    add(row.side, row.price, row.size);
  }
  const sel = engine.liveDomSelection;
  if (sel) {
    for (const level of [...sel.levels, ...sel.activeDomBands]) {
      add(level.side, level.price, level.sizeBtc);
    }
  }
  for (const level of [
    ...(engine.activeDomBands ?? []),
    ...(engine.liveProjectionLevels ?? []),
  ]) {
    add(level.side, level.price, level.sizeBtc);
  }

  let levels = Array.from(map.values());
  levels.sort((a, b) => b.sizeBtc - a.sizeBtc);
  const bid = levels.filter((l) => l.side === "bid").slice(0, CANONICAL_LIVE_MAX_PER_SIDE);
  const ask = levels.filter((l) => l.side === "ask").slice(0, CANONICAL_LIVE_MAX_PER_SIDE);
  return [...bid, ...ask];
}

function recordTier(tier: SurfaceThermalTier, diag: CanonicalHeatmapDiagStats): void {
  if (tier === "very_weak" || tier === "weak") diag.weakLevelsDrawn += 1;
  else if (tier === "medium") diag.mediumLevelsDrawn += 1;
  else if (tier === "strong") diag.strongLevelsDrawn += 1;
  else if (tier === "extreme") diag.extremeLevelsDrawn += 1;
}

function emitCanonicalDiag(diag: CanonicalHeatmapDiagStats): void {
  if (!import.meta.env.DEV || !BOOKMAP_CANONICAL_HEATMAP_DIAG) return;
  const now = Date.now();
  if (now - lastCanonicalDiagLogMs < 2_000) return;
  lastCanonicalDiagLogMs = now;

  console.debug("[BOOKMAP_CANONICAL_HEATMAP_V1_DIAG]", { ...diag });

  const hRatio =
    diag.avgHistoricalBandHeightPx > 0
      ? diag.avgLiveBandHeightPx / diag.avgHistoricalBandHeightPx
      : 1;
  if (hRatio > 1.1 || hRatio < 0.9) {
    console.warn("[BOOKMAP_CANONICAL_HEATMAP_V1_HEIGHT_MISMATCH]", {
      avgHistoricalBandHeightPx: diag.avgHistoricalBandHeightPx,
      avgLiveBandHeightPx: diag.avgLiveBandHeightPx,
      ratio: hRatio,
      cause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
      fix:
        "Unified resolveCanonicalPriceBandGeometry + resolveCanonicalLiquidityVisual; " +
        "live uses one bucket-width seam + bucket-tiled projection with same band height.",
    });
  }
  if (diag.liveHistoricalHeightMismatchCount > 0 || diag.liveHistoricalAlphaMismatchCount > 0) {
    console.debug("[BOOKMAP_CANONICAL_HEATMAP_V1_MISMATCH]", {
      liveHistoricalHeightMismatchCount: diag.liveHistoricalHeightMismatchCount,
      liveHistoricalAlphaMismatchCount: diag.liveHistoricalAlphaMismatchCount,
      legacyCause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
    });
  }
}

export function drawCanonicalHeatmapWatermark(ctx: CanvasRenderingContext2D): void {
  if (!import.meta.env.DEV || !BOOKMAP_CANONICAL_HEATMAP_DIAG) return;
  ctx.save();
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = 3;
  const x = HEATMAP_PAD.left + 6;
  const y = HEATMAP_PAD.top + 14;
  ctx.fillStyle = "rgba(250, 204, 21, 0.96)";
  ctx.strokeText("CANONICAL HEATMAP V1 ACTIVE", x, y);
  ctx.fillText("CANONICAL HEATMAP V1 ACTIVE", x, y);
  ctx.restore();
}

export function paintBookmapCanonicalHeatmapFrame(
  ctx: CanvasRenderingContext2D,
  params: BookmapCanonicalFrameParams,
  metrics: CanonicalPlotMetrics,
): CanonicalHeatmapDiagStats {
  heightByPriceLayer.clear();
  alphaByPriceLayer.clear();

  if (!BOOKMAP_CANONICAL_HEATMAP_V1) {
    return { ...lastCanonicalDiag, canonicalRendererActive: false };
  }

  const { engine, timeViewport, minPrice, maxPrice } = params;
  const dataEndTime = timeViewport.dataEndTime;
  const visibleStart = timeViewport.visibleStartTime;
  const visibleEnd = timeViewport.visibleEndTime;
  const regime = resolveZoomRegime(computeVisiblePriceRangePct(minPrice, maxPrice));
  const minSize =
    regime === "macro" ? CANONICAL_MACRO_MIN_SIZE_BTC : CANONICAL_MICRO_MIN_SIZE_BTC;
  const heatmapOpacity = params.visualSettings?.heatmap.opacity ?? 1;
  const dataEdgeX = metrics.timeToX(dataEndTime);
  const bucketW = bucketWidthPx(dataEndTime - BOOKMAP_ENGINE_BUCKET_MS, metrics.timeToX);

  const diag: CanonicalHeatmapDiagStats = {
    canonicalRendererActive: true,
    historicalLevelsInput: 0,
    historicalLevelsDrawn: 0,
    liveLevelsInput: 0,
    liveLevelsDrawn: 0,
    wallLevelsDrawn: 0,
    macroDomLevelsDrawn: 0,
    weakLevelsDrawn: 0,
    mediumLevelsDrawn: 0,
    strongLevelsDrawn: 0,
    extremeLevelsDrawn: 0,
    avgHistoricalBandHeightPx: 0,
    avgLiveBandHeightPx: 0,
    maxHistoricalBandHeightPx: 0,
    maxLiveBandHeightPx: 0,
    liveHistoricalHeightMismatchCount: 0,
    liveHistoricalAlphaMismatchCount: 0,
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    zoomRegime: regime,
    legacyMismatchCause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
    timestamp: Date.now(),
  };

  let histHeightSum = 0;
  let histHeightCount = 0;
  let liveHeightSum = 0;
  let liveHeightCount = 0;

  const historicalInput = collectHistoricalCells(
    engine,
    dataEndTime,
    minPrice,
    maxPrice,
    visibleStart,
    visibleEnd,
  );
  diag.historicalLevelsInput = historicalInput.length;

  const histPool =
    historicalInput.length > CANONICAL_HISTORICAL_MAX_DRAW
      ? [...historicalInput]
          .sort((a, b) => (a.intensity ?? 0) - (b.intensity ?? 0))
          .slice(-CANONICAL_HISTORICAL_MAX_DRAW)
      : historicalInput;

  for (const cell of histPool) {
    const vi = cell.intensity ?? 0;
    if (vi < 0.04 && cell.maxSizeInBucket < 0.5) continue;

    const geom = resolveCanonicalPriceBandGeometry(
      cell.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (geom.yTop + geom.bandHeightPx < HEATMAP_PAD.top - 2) continue;
    if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const x0 = metrics.timeToX(cell.timeBucket);
    if (x0 >= dataEdgeX) continue;
    let w = bucketWidthPx(cell.timeBucket, metrics.timeToX);
    w = Math.min(w, Math.max(1, dataEdgeX - x0));

    const visual = resolveCanonicalLiquidityVisual(cell.maxSizeInBucket, {
      layer: "historical",
      regime,
      distancePct: pctFromMid(cell.price, params.spot),
      heatmapOpacity,
      geometry: geom,
      intensityHint: vi,
    });
    recordTier(visual.thermalTier, diag);
    drawCanonicalLevel(ctx, x0, w, geom, visual, "historical", cell.price, diag);
    histHeightSum += visual.bandHeightPx;
    histHeightCount += 1;
    diag.historicalLevelsDrawn += 1;
  }

  const liveLevels = collectCanonicalLiveLevels(engine, minPrice, maxPrice, minSize);
  diag.liveLevelsInput = liveLevels.length;

  const projX0 = dataEdgeX;
  const projX1 = metrics.timeToX(visibleEnd);
  const hasProjection =
    projX1 - projX0 >= 2 &&
    visibleEnd > dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS;

  const livePriceKeys = new Set<string>();

  for (const level of liveLevels) {
    if (regime !== "macro") {
      const pct = pctFromMid(level.price, params.spot);
      if (pct > 8 && level.sizeBtc < CANONICAL_WALL_SIZE_BTC) continue;
    }

    const geom = resolveCanonicalPriceBandGeometry(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (geom.yTop + geom.bandHeightPx < HEATMAP_PAD.top - 2) continue;
    if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const distPct = pctFromMid(level.price, params.spot);
    if (regime === "macro" && distPct > 3 && level.sizeBtc >= minSize) {
      diag.macroDomLevelsDrawn += 1;
    }

    const liveVisual = resolveCanonicalLiquidityVisual(level.sizeBtc, {
      layer: "live",
      regime,
      distancePct: distPct,
      heatmapOpacity,
      geometry: geom,
      isWall: level.isWall,
    });
    recordTier(liveVisual.thermalTier, diag);

    const edgeBucketStart = dataEndTime - BOOKMAP_ENGINE_BUCKET_MS;
    const edgeX = metrics.timeToX(edgeBucketStart);
    const edgeW = Math.min(bucketW, Math.max(1, dataEdgeX - edgeX));
    drawCanonicalLevel(ctx, edgeX, edgeW, geom, liveVisual, "live", level.price, diag);
    livePriceKeys.add(`${level.side}:${level.price}`);
    liveHeightSum += liveVisual.bandHeightPx;
    liveHeightCount += 1;
    diag.liveLevelsDrawn += 1;

    if (hasProjection) {
      const projVisual = resolveCanonicalLiquidityVisual(level.sizeBtc, {
        layer: "projection",
        regime,
        distancePct: distPct,
        heatmapOpacity,
        geometry: geom,
        isWall: level.isWall,
      });
      for (let x = projX0; x < projX1; x += bucketW) {
        const w = Math.min(bucketW, projX1 - x);
        drawCanonicalLevel(ctx, x, w, geom, projVisual, "live", level.price, diag);
      }
    }
  }

  const wallSeen = new Set<string>();
  for (const w of engine.walls ?? []) {
    if (w.maxSeenSize < CANONICAL_WALL_SIZE_BTC) continue;
    const key = `${w.side}:${w.price}`;
    if (wallSeen.has(key) || livePriceKeys.has(key)) continue;
    wallSeen.add(key);

    const geom = resolveCanonicalPriceBandGeometry(
      w.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (geom.yTop + geom.bandHeightPx < HEATMAP_PAD.top - 2) continue;

    const wallVisual = resolveCanonicalLiquidityVisual(w.maxSeenSize, {
      layer: "wall",
      regime,
      distancePct: pctFromMid(w.price, params.spot),
      heatmapOpacity,
      geometry: geom,
      isWall: true,
    });
    recordTier(wallVisual.thermalTier, diag);

    const histStart = metrics.timeToX(visibleStart);
    const histW = Math.max(1, dataEdgeX - histStart);
    drawCanonicalLevel(ctx, histStart, histW, geom, wallVisual, "historical", w.price, diag);

    if (hasProjection) {
      for (let x = projX0; x < projX1; x += bucketW) {
        const bw = Math.min(bucketW, projX1 - x);
        drawCanonicalLevel(ctx, x, bw, geom, wallVisual, "live", w.price, diag);
      }
    }
    diag.wallLevelsDrawn += 1;
  }

  for (const b of engine.bands ?? []) {
    if (!isWallTier(b.tier) && b.maxSize < CANONICAL_WALL_SIZE_BTC) continue;
    const key = `${b.side}:${b.price}`;
    if (wallSeen.has(key) || livePriceKeys.has(key)) continue;
    wallSeen.add(key);

    const geom = resolveCanonicalPriceBandGeometry(
      b.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (geom.yTop + geom.bandHeightPx < HEATMAP_PAD.top - 2) continue;

    const wallVisual = resolveCanonicalLiquidityVisual(b.maxSize, {
      layer: "wall",
      regime,
      distancePct: pctFromMid(b.price, params.spot),
      heatmapOpacity,
      geometry: geom,
      isWall: true,
    });
    recordTier(wallVisual.thermalTier, diag);

    const histStart = metrics.timeToX(visibleStart);
    const histW = Math.max(1, dataEdgeX - histStart);
    drawCanonicalLevel(ctx, histStart, histW, geom, wallVisual, "historical", b.price, diag);

    if (hasProjection) {
      for (let x = projX0; x < projX1; x += bucketW) {
        const bw = Math.min(bucketW, projX1 - x);
        drawCanonicalLevel(ctx, x, bw, geom, wallVisual, "live", b.price, diag);
      }
    }
    diag.wallLevelsDrawn += 1;
  }

  if (histHeightCount > 0) {
    diag.avgHistoricalBandHeightPx = histHeightSum / histHeightCount;
  }
  if (liveHeightCount > 0) {
    diag.avgLiveBandHeightPx = liveHeightSum / liveHeightCount;
  }

  lastCanonicalDiag = diag;
  emitCanonicalDiag(diag);
  return diag;
}

export function getCanonicalHeatmapDiagStats(): CanonicalHeatmapDiagStats {
  return lastCanonicalDiag;
}
