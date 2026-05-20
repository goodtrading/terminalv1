import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import { BOOKMAP_ENGINE_BUCKET_MS } from "@/lib/bookmapEngineConfig";
import type { DepthRangePreset, VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import {
  CONFLUENCE_VISUAL_OPACITY_MUL,
  confluenceTierMeetsMin,
  type ConfluenceMinDisplayTier,
  type ConfluenceTier,
  type ConfluenceVisualOpacity,
} from "./bookmapConfluenceConfig";
import type { PassiveConfluenceLevel } from "./bookmapConfluence";
import type { HeatmapBand } from "./bookmapBandTypes";
import { bucketPrice } from "./domLadderUtils";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";

export type ConfluenceRenderMode = "micro" | "intraday" | "macro";

export function resolveConfluenceRenderMode(
  verticalMode: VerticalCompressionMode,
  depthPreset?: DepthRangePreset,
): ConfluenceRenderMode {
  if (verticalMode === "micro" || depthPreset === "local") return "micro";
  if (verticalMode === "intraday") return "intraday";
  return "macro";
}

export function confluenceLabelLimits(mode: ConfluenceRenderMode): {
  maxTotal: number;
  maxAbove: number;
  maxBelow: number;
} {
  if (mode === "micro") {
    return { maxTotal: 4, maxAbove: 2, maxBelow: 2 };
  }
  return { maxTotal: 6, maxAbove: 3, maxBelow: 3 };
}

type PlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
  priceStep: number;
};

const TIER_TINT_ALPHA: Record<ConfluenceTier, number> = {
  weak: 0.08,
  medium: 0.12,
  strong: 0.22,
  major: 0.32,
};

const TIER_TINT_RGB: Record<ConfluenceTier, [number, number, number]> = {
  weak: [160, 80, 255],
  medium: [160, 80, 255],
  strong: [190, 95, 255],
  major: [230, 140, 255],
};

function clampAlpha(a: number): number {
  return Math.max(0, Math.min(0.5, a));
}

function tintRgba(tier: ConfluenceTier, opacityMul: number): string {
  const [r, g, b] = TIER_TINT_RGB[tier];
  return `rgba(${r}, ${g}, ${b}, ${clampAlpha(TIER_TINT_ALPHA[tier] * opacityMul)})`;
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

function bandsForConfluenceBucket(
  bands: HeatmapBand[],
  side: "bid" | "ask",
  priceBucket: number,
  priceStep: number,
): HeatmapBand[] {
  const step = Math.max(1, priceStep);
  return bands.filter((band) => {
    if (band.side !== side) return false;
    return bucketPrice(band.price, step) === priceBucket;
  });
}

function tintBandSegment(
  ctx: CanvasRenderingContext2D,
  band: HeatmapBand,
  metrics: PlotMetrics,
  tint: string,
  dataEndTime: number,
  projectionEndTime: number,
  renderMode: ConfluenceRenderMode,
  tier: ConfluenceTier,
) {
  const endTime = resolveBandEndTime(band, dataEndTime, projectionEndTime);
  const x0 = metrics.timeToX(band.startTime);
  const x1 = metrics.timeToX(endTime);
  const w = Math.max(1.5, x1 - x0);
  const { yTop, height } = bandVerticalBounds(band, metrics.priceToY, metrics.priceStep);

  if (yTop + height < HEATMAP_PAD.top - 2) return;
  if (yTop > HEATMAP_PAD.top + metrics.plotH + 2) return;

  ctx.fillStyle = tint;
  ctx.fillRect(x0, yTop, w, height);

  if (renderMode === "macro" && tier === "major" && w > 6) {
    ctx.save();
    ctx.strokeStyle = "rgba(230, 140, 255, 0.38)";
    ctx.lineWidth = 0.75;
    ctx.shadowColor = "rgba(230, 140, 255, 0.14)";
    ctx.shadowBlur = 3;
    ctx.strokeRect(x0, yTop, w, height);
    ctx.restore();
  }
}

export function renderPassiveConfluenceOverlay(
  ctx: CanvasRenderingContext2D,
  metrics: PlotMetrics,
  levels: PassiveConfluenceLevel[],
  spotBands: HeatmapBand[],
  timeViewport: BookmapTimeViewport,
  visualOpacity: ConfluenceVisualOpacity = "normal",
  renderMode: ConfluenceRenderMode = "intraday",
  minDisplayTier: ConfluenceMinDisplayTier = "strong",
  perpBands?: HeatmapBand[],
) {
  const visible = levels.filter((l) => confluenceTierMeetsMin(l.tier, minDisplayTier));
  if (visible.length === 0) return;

  const opacityMul = CONFLUENCE_VISUAL_OPACITY_MUL[visualOpacity];
  const dataEnd = timeViewport.dataEndTime;
  const liveEdge = timeViewport.liveEdgeTime;

  const sorted = [...visible].sort(
    (a, b) => a.confluenceScore - b.confluenceScore,
  );

  for (const level of sorted) {
    const tint = tintRgba(level.tier, opacityMul);
    const spotMatches = bandsForConfluenceBucket(
      spotBands,
      level.side,
      level.priceBucket,
      metrics.priceStep,
    );
    for (const band of spotMatches) {
      tintBandSegment(
        ctx,
        band,
        metrics,
        tint,
        dataEnd,
        liveEdge,
        renderMode,
        level.tier,
      );
    }
    if (perpBands?.length) {
      const perpMatches = bandsForConfluenceBucket(
        perpBands,
        level.side,
        level.perpPriceBucket,
        metrics.priceStep,
      );
      for (const band of perpMatches) {
        tintBandSegment(
          ctx,
          band,
          metrics,
          tint,
          dataEnd,
          liveEdge,
          renderMode,
          level.tier,
        );
      }
    }
  }
}

export type ConfluenceLabelPlacement = {
  level: PassiveConfluenceLevel;
  x: number;
  y: number;
  text: string;
};

export function pickConfluenceLabels(
  levels: PassiveConfluenceLevel[],
  priceToY: (price: number) => number,
  plotRight: number,
  spot: number | null,
  reservedYs: number[],
  renderMode: ConfluenceRenderMode = "intraday",
  minDisplayTier: ConfluenceMinDisplayTier = "strong",
): ConfluenceLabelPlacement[] {
  const { maxTotal, maxAbove, maxBelow } = confluenceLabelLimits(renderMode);
  const labelTiers: ConfluenceTier[] = ["major", "strong"];
  const candidates = levels
    .filter(
      (l) =>
        labelTiers.includes(l.tier) &&
        confluenceTierMeetsMin(l.tier, minDisplayTier),
    )
    .sort((a, b) => b.confluenceScore - a.confluenceScore);

  const placed: ConfluenceLabelPlacement[] = [];
  const usedY: number[] = [...reservedYs];
  const minGap = renderMode === "micro" ? 16 : 14;
  let above = 0;
  let below = 0;

  for (const level of candidates) {
    if (placed.length >= maxTotal) break;
    if (spot != null && Number.isFinite(spot)) {
      if (level.priceBucket >= spot && above >= maxAbove) continue;
      if (level.priceBucket < spot && below >= maxBelow) continue;
    }

    const y = priceToY(level.priceBucket) - 2;
    if (usedY.some((uy) => Math.abs(uy - y) < minGap)) continue;

    placed.push({
      level,
      x: plotRight - 4,
      y,
      text: level.label,
    });
    usedY.push(y);
    if (spot != null && level.priceBucket >= spot) above++;
    else below++;
  }

  return placed;
}

export function renderConfluenceLabels(
  ctx: CanvasRenderingContext2D,
  placements: ConfluenceLabelPlacement[],
) {
  if (placements.length === 0) return;

  ctx.font = "8px ui-monospace, monospace";
  ctx.textAlign = "right";

  for (const p of placements) {
    const textW = ctx.measureText(p.text).width;
    const x = p.x;
    const y = p.y;
    const tier = p.level.tier;

    ctx.fillStyle = "rgba(28, 10, 40, 0.72)";
    ctx.fillRect(x - textW - 4, y - 8, textW + 7, 10);

    ctx.fillStyle =
      tier === "major"
        ? "rgba(255, 235, 255, 0.95)"
        : "rgba(230, 190, 255, 0.88)";
    ctx.fillText(p.text, x, y);
  }

  ctx.textAlign = "left";
}
