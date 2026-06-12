/**
 * B.reset — Canonical Bookmap heatmap renderer.
 * Single visual grammar for historical matrix, live DOM, and anchored walls.
 */

import {
  BOOKMAP_CANONICAL_HEATMAP_DIAG,
  BOOKMAP_CANONICAL_HEATMAP_V1,
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1,
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
import {
  resolveLifecycleThermalSize,
  resolveLifecycleVisualAlpha,
  updateLimitOrderLifecycleEngine,
  type LimitOrderLifecycleLevel,
  type LimitOrderLifecycleState,
} from "./bookmapLimitOrderLifecycle";

export type CanonicalHeatLayer = "historical" | "live" | "projection" | "wall";

export type CanonicalBandGeometry = {
  yTop: number;
  bandHeightPx: number;
  bandInsetPx: number;
};

export type CanonicalLevelVisual = {
  thermalTier: SurfaceThermalTier;
  rgb: [number, number, number];
  bodyAlpha: number;
  glowAlpha: number;
  coreAlpha: number;
  bandHeightPx: number;
  bandInsetPx: number;
  shouldDrawCore: boolean;
  shouldProjectLive: boolean;
  distanceFade: number;
};

export type CanonicalHeatmapDiagStats = {
  canonicalRendererActive: boolean;
  historicalLevelsInput: number;
  historicalLevelsDrawn: number;
  liveLevelsInput: number;
  liveLevelsDrawn: number;
  anchoredWallsDrawn: number;
  macroFarLevelsDrawn: number;
  avgHistoricalBandHeightPx: number;
  avgLiveBandHeightPx: number;
  maxHistoricalBandHeightPx: number;
  maxLiveBandHeightPx: number;
  liveHistoricalHeightMismatchCount: number;
  dominantLevelsDrawn: number;
  mediumLevelsDrawn: number;
  weakLevelsDrawn: number;
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
  isLive: boolean;
  lifecycleState?: LimitOrderLifecycleState;
  firstSeenTime?: number;
  isWall: boolean;
};

let lastCanonicalDiag: CanonicalHeatmapDiagStats = {
  canonicalRendererActive: false,
  historicalLevelsInput: 0,
  historicalLevelsDrawn: 0,
  liveLevelsInput: 0,
  liveLevelsDrawn: 0,
  anchoredWallsDrawn: 0,
  macroFarLevelsDrawn: 0,
  avgHistoricalBandHeightPx: 0,
  avgLiveBandHeightPx: 0,
  maxHistoricalBandHeightPx: 0,
  maxLiveBandHeightPx: 0,
  liveHistoricalHeightMismatchCount: 0,
  dominantLevelsDrawn: 0,
  mediumLevelsDrawn: 0,
  weakLevelsDrawn: 0,
  zoomRegime: "macro",
  legacyMismatchCause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
  timestamp: 0,
};

let lastCanonicalDiagLogMs = 0;

const heightByPriceLayer = new Map<string, number>();

function pctFromMid(price: number, mid: number | null): number {
  if (mid == null || mid <= 0) return 50;
  return (Math.abs(price - mid) / mid) * 100;
}

function distanceFadeMul(pct: number, regime: BookmapZoomRegime): number {
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

/** Shared band geometry — same height/inset for historical and live. */
export function resolveCanonicalBandGeometry(
  price: number,
  priceToY: (price: number) => number,
  domBucketSize: number,
): CanonicalBandGeometry {
  const half = Math.max(1, domBucketSize * 0.5);
  const yTop = priceToY(price + half);
  const yBot = priceToY(price - half);
  const bandHeightPx = Math.max(1, Math.abs(yBot - yTop));
  const bandInsetPx = Math.max(0, Math.min(1, bandHeightPx * 0.06));
  return { yTop: Math.min(yTop, yBot), bandHeightPx, bandInsetPx };
}

/** Single visual mapping for historical, live, projection, and walls. */
export function resolveCanonicalHeatLevelVisual(
  sizeBtc: number,
  opts: {
    layer: CanonicalHeatLayer;
    regime: BookmapZoomRegime;
    distancePct: number;
    heatmapOpacity: number;
    isWall?: boolean;
    lifecycleState?: LimitOrderLifecycleState;
    intensityHint?: number;
  },
): CanonicalLevelVisual {
  const thermal =
    opts.intensityHint != null
      ? resolveSurfaceHistoricalThermal(opts.intensityHint, sizeBtc)
      : resolveSurfaceThermalFromSize(sizeBtc);

  const distanceFade = distanceFadeMul(opts.distancePct, opts.regime);
  let bodyAlpha = thermal.alpha * distanceFade * opts.heatmapOpacity;

  if (opts.lifecycleState === "pulling") bodyAlpha *= 0.58;
  else if (opts.lifecycleState === "fading") bodyAlpha *= 0.42;
  else if (opts.lifecycleState === "new") bodyAlpha *= 0.72;
  else if (opts.lifecycleState === "reinforced") bodyAlpha *= 1.06;

  const isDominant = sizeBtc >= CANONICAL_DOMINANT_SIZE_BTC;
  const isWall = opts.isWall === true || sizeBtc >= CANONICAL_WALL_SIZE_BTC;
  const shouldDrawCore = isWall && (isDominant || opts.lifecycleState === "reinforced");
  const shouldProjectLive =
    opts.layer === "projection" ||
    (opts.layer === "live" && opts.lifecycleState !== "pulling" && opts.lifecycleState !== "fading");

  bodyAlpha = Math.min(0.88, Math.max(0.08, bodyAlpha));
  const glowAlpha = bodyAlpha * (isWall ? 0.28 : 0.18);
  const coreAlpha = shouldDrawCore ? bodyAlpha * 0.82 : 0;

  return {
    thermalTier: thermal.tier,
    rgb: thermal.rgb,
    bodyAlpha,
    glowAlpha,
    coreAlpha,
    bandHeightPx: 0,
    bandInsetPx: 0,
    shouldDrawCore,
    shouldProjectLive,
    distanceFade,
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

function recordBandHeight(
  price: number,
  layer: "historical" | "live",
  height: number,
  diag: CanonicalHeatmapDiagStats,
): void {
  const key = `${price}:${layer}`;
  heightByPriceLayer.set(key, height);
  if (layer === "historical") {
    diag.maxHistoricalBandHeightPx = Math.max(diag.maxHistoricalBandHeightPx, height);
  } else {
    diag.maxLiveBandHeightPx = Math.max(diag.maxLiveBandHeightPx, height);
  }
  const other = heightByPriceLayer.get(`${price}:${layer === "historical" ? "live" : "historical"}`);
  if (other != null && Math.abs(other - height) > 0.5) {
    diag.liveHistoricalHeightMismatchCount += 1;
  }
}

function bucketWidthPx(
  timeMs: number,
  timeToX: (t: number) => number,
): number {
  return Math.max(1, timeToX(timeMs + BOOKMAP_ENGINE_BUCKET_MS) - timeToX(timeMs));
}

function drawCanonicalBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  geom: CanonicalBandGeometry,
  visual: CanonicalLevelVisual,
  layer: "historical" | "live",
  price: number,
  diag: CanonicalHeatmapDiagStats,
): void {
  const y = geom.yTop + geom.bandInsetPx;
  const h = Math.max(1, geom.bandHeightPx - geom.bandInsetPx * 2);
  recordBandHeight(price, layer, h, diag);

  fillRgba(ctx, x, w, y, h, visual.rgb, visual.bodyAlpha);
  if (visual.shouldDrawCore && w >= 2) {
    const coreH = h * 0.42;
    const coreY = y + (h - coreH) * 0.5;
    fillRgba(
      ctx,
      x + w * 0.12,
      Math.max(1, w * 0.52),
      coreY,
      coreH,
      visual.rgb,
      visual.coreAlpha,
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

function collectCanonicalLiveLevels(
  engine: PreparedEngineRenderData,
  lifecycleLevels: LimitOrderLifecycleLevel[],
  minPrice: number,
  maxPrice: number,
  minSize: number,
): CanonicalLiveLevel[] {
  if (BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1 && lifecycleLevels.length > 0) {
    return lifecycleLevels
      .filter((l) => l.price >= minPrice && l.price <= maxPrice)
      .filter((l) => l.isLive || l.state === "fading")
      .filter((l) => resolveLifecycleThermalSize(l) >= minSize * 0.85)
      .map((l) => ({
        side: l.side,
        price: l.price,
        sizeBtc: resolveLifecycleThermalSize(l),
        isLive: l.isLive,
        lifecycleState: l.state,
        firstSeenTime: l.firstSeenTime,
        isWall: l.isWall,
      }));
  }

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
        isLive: true,
        isWall: sizeBtc >= CANONICAL_WALL_SIZE_BTC,
      });
    }
  };

  for (const row of engine.currentDomBookLevels ?? []) {
    add(row.side, row.price, row.size);
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
  else if (tier === "strong" || tier === "extreme") diag.dominantLevelsDrawn += 1;
}

function emitCanonicalDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_CANONICAL_HEATMAP_DIAG) return;
  const now = Date.now();
  if (now - lastCanonicalDiagLogMs < 2_000) return;
  lastCanonicalDiagLogMs = now;
  console.debug("[BOOKMAP_CANONICAL_HEATMAP_V1_DIAG]", { ...lastCanonicalDiag });
  if (lastCanonicalDiag.liveHistoricalHeightMismatchCount > 0) {
    console.debug("[BOOKMAP_CANONICAL_HEATMAP_V1_MISMATCH]", {
      cause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
      liveHistoricalHeightMismatchCount: lastCanonicalDiag.liveHistoricalHeightMismatchCount,
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
    anchoredWallsDrawn: 0,
    macroFarLevelsDrawn: 0,
    avgHistoricalBandHeightPx: 0,
    avgLiveBandHeightPx: 0,
    maxHistoricalBandHeightPx: 0,
    maxLiveBandHeightPx: 0,
    liveHistoricalHeightMismatchCount: 0,
    dominantLevelsDrawn: 0,
    mediumLevelsDrawn: 0,
    weakLevelsDrawn: 0,
    zoomRegime: regime,
    legacyMismatchCause: CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE,
    timestamp: Date.now(),
  };

  let histHeightSum = 0;
  let liveHeightSum = 0;

  // ── Layer 1: Historical matrix ──
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

    const geom = resolveCanonicalBandGeometry(
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

    const visual = resolveCanonicalHeatLevelVisual(cell.maxSizeInBucket, {
      layer: "historical",
      regime,
      distancePct: pctFromMid(cell.price, params.spot),
      heatmapOpacity,
      intensityHint: vi,
    });
    visual.bandHeightPx = geom.bandHeightPx;
    visual.bandInsetPx = geom.bandInsetPx;
    recordTier(visual.thermalTier, diag);
    drawCanonicalBand(ctx, x0, w, geom, visual, "historical", cell.price, diag);
    histHeightSum += geom.bandHeightPx;
    diag.historicalLevelsDrawn += 1;

    if (regime === "macro" && pctFromMid(cell.price, params.spot) > 6) {
      diag.macroFarLevelsDrawn += 1;
    }
  }

  // Lifecycle update (behaviour) — visual still canonical
  const lifecycleLevels = BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1
    ? updateLimitOrderLifecycleEngine({
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
      })
    : [];

  const liveLevels = collectCanonicalLiveLevels(
    engine,
    lifecycleLevels,
    minPrice,
    maxPrice,
    minSize,
  );
  diag.liveLevelsInput = liveLevels.length;

  const livePriceKeys = new Set<string>();

  // ── Layer 2+3: Live continuation (single pass, bucket grammar) ──
  const projEnd = visibleEnd;
  const projX0 = dataEdgeX;
  const projX1 = metrics.timeToX(projEnd);
  const projW = Math.max(0, projX1 - projX0);
  const hasProjection = projW >= 2 && projEnd > dataEndTime + BOOKMAP_LIVE_PROJECTION_MIN_GAP_MS;

  for (const level of liveLevels) {
    if (level.lifecycleState === "stale") continue;
    if (regime !== "macro") {
      const pct = pctFromMid(level.price, params.spot);
      if (
        pct > 8 &&
        level.sizeBtc < CANONICAL_WALL_SIZE_BTC &&
        !level.isWall
      ) {
        continue;
      }
    }

    const geom = resolveCanonicalBandGeometry(
      level.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (geom.yTop + geom.bandHeightPx < HEATMAP_PAD.top - 2) continue;
    if (geom.yTop > HEATMAP_PAD.top + metrics.plotH + 2) continue;

    const distPct = pctFromMid(level.price, params.spot);
    if (regime === "macro" && distPct > 6 && level.sizeBtc >= minSize) {
      diag.macroFarLevelsDrawn += 1;
    }

    // Fading trail: bucket-tiled historical footprint (same geometry as matrix)
    if (level.lifecycleState === "fading" && level.firstSeenTime != null) {
      const trailStart = Math.max(visibleStart, level.firstSeenTime);
      for (
        let t = trailStart;
        t < dataEndTime;
        t += BOOKMAP_ENGINE_BUCKET_MS
      ) {
        const x = metrics.timeToX(t);
        if (x >= dataEdgeX) break;
        const w = Math.min(bucketWidthPx(t, metrics.timeToX), dataEdgeX - x);
        const visual = resolveCanonicalHeatLevelVisual(level.sizeBtc, {
          layer: "historical",
          regime,
          distancePct: distPct,
          heatmapOpacity,
          lifecycleState: "fading",
          isWall: level.isWall,
        });
        drawCanonicalBand(ctx, x, w, geom, visual, "historical", level.price, diag);
        diag.historicalLevelsDrawn += 1;
      }
      continue;
    }

    if (!level.isLive) continue;

    const liveVisual = resolveCanonicalHeatLevelVisual(level.sizeBtc, {
      layer: "live",
      regime,
      distancePct: distPct,
      heatmapOpacity,
      lifecycleState: level.lifecycleState,
      isWall: level.isWall,
    });
    recordTier(liveVisual.thermalTier, diag);

    // Data-edge seam: exactly ONE bucket wide (matches historical cell width)
    const edgeBucketStart = dataEndTime - BOOKMAP_ENGINE_BUCKET_MS;
    const edgeX = metrics.timeToX(edgeBucketStart);
    const edgeW = Math.min(bucketW, Math.max(1, dataEdgeX - edgeX));
    drawCanonicalBand(ctx, edgeX, edgeW, geom, liveVisual, "live", level.price, diag);
    livePriceKeys.add(`${level.side}:${level.price}`);
    liveHeightSum += geom.bandHeightPx;
    diag.liveLevelsDrawn += 1;

    // Projection: same band height/alpha, tiled by bucket width (no dual-layer fattening)
    if (hasProjection && liveVisual.shouldProjectLive) {
      const projVisual = resolveCanonicalHeatLevelVisual(level.sizeBtc, {
        layer: "projection",
        regime,
        distancePct: distPct,
        heatmapOpacity,
        lifecycleState: level.lifecycleState,
        isWall: level.isWall,
      });
      for (let x = projX0; x < projX1; x += bucketW) {
        const w = Math.min(bucketW, projX1 - x);
        drawCanonicalBand(ctx, x, w, geom, projVisual, "live", level.price, diag);
      }
    }
  }

  // ── Layer 2: Anchored important walls (single grammar) ──
  const wallKeys = new Set<string>();
  const wallEntries: Array<{
    price: number;
    side: "bid" | "ask";
    size: number;
    isLive: boolean;
  }> = [];

  for (const w of engine.walls ?? []) {
    if (w.maxSeenSize >= CANONICAL_WALL_SIZE_BTC) {
      wallEntries.push({
        price: w.price,
        side: w.side,
        size: w.maxSeenSize,
        isLive: !w.stale,
      });
    }
  }
  for (const b of engine.bands ?? []) {
    if (isWallTier(b.tier) || b.maxSize >= CANONICAL_WALL_SIZE_BTC) {
      wallEntries.push({
        price: b.price,
        side: b.side,
        size: b.maxSize,
        isLive: true,
      });
    }
  }

  for (const wall of wallEntries) {
    const key = `${wall.side}:${wall.price}`;
    if (wallKeys.has(key)) continue;
    wallKeys.add(key);
    if (livePriceKeys.has(key)) continue;

    const geom = resolveCanonicalBandGeometry(
      wall.price,
      metrics.priceToY,
      metrics.domBucketSize,
    );
    if (geom.yTop + geom.bandHeightPx < HEATMAP_PAD.top - 2) continue;

    const distPct = pctFromMid(wall.price, params.spot);
    const wallVisual = resolveCanonicalHeatLevelVisual(wall.size, {
      layer: "wall",
      regime,
      distancePct: distPct,
      heatmapOpacity,
      isWall: true,
    });

    const histStart = metrics.timeToX(visibleStart);
    const histW = Math.max(1, dataEdgeX - histStart);
    drawCanonicalBand(
      ctx,
      histStart,
      histW,
      geom,
      wallVisual,
      "historical",
      wall.price,
      diag,
    );

    if (wall.isLive && hasProjection) {
      for (let x = projX0; x < projX1; x += bucketW) {
        const w = Math.min(bucketW, projX1 - x);
        drawCanonicalBand(ctx, x, w, geom, wallVisual, "live", wall.price, diag);
      }
    }
    diag.anchoredWallsDrawn += 1;
  }

  if (diag.historicalLevelsDrawn > 0) {
    diag.avgHistoricalBandHeightPx = histHeightSum / diag.historicalLevelsDrawn;
  }
  if (diag.liveLevelsDrawn > 0) {
    diag.avgLiveBandHeightPx = liveHeightSum / diag.liveLevelsDrawn;
  }

  lastCanonicalDiag = diag;
  emitCanonicalDiag();
  void visibleEnd;
  return diag;
}

export function getCanonicalHeatmapDiagStats(): CanonicalHeatmapDiagStats {
  return lastCanonicalDiag;
}
