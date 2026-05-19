/**
 * Macro-aware visual context for Bookmap heatmap hierarchy.
 */

import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";

export type BookmapVisualMode = "micro" | "intraday" | "macro" | "fullDepth";

export type VisibleVisualContext = {
  visibleTimeSpanMs: number;
  priceSpan: number;
  labelStep: number;
  heatmapBucketSize: number;
  domBucketSize: number;
  spotPrice?: number | null;
  dataEndTime?: number;
  /** Price-scale vertical mode (local / micro depth preset). */
  verticalCompressionMode?: VerticalCompressionMode;
};

const SMOOTH_ALPHA = 0.22;

let smoothedPLow = 0.1;
let smoothedPHigh = 0.98;

/** Local/micro heatmap context from visible viewport metrics. */
export function isMicroVisualContext(ctx: VisibleVisualContext): boolean {
  return (
    ctx.priceSpan <= 1_500 ||
    ctx.labelStep <= 50 ||
    ctx.heatmapBucketSize <= 25
  );
}

export function resolveVisualMode(ctx: VisibleVisualContext): BookmapVisualMode {
  const { visibleTimeSpanMs: t, priceSpan: p } = ctx;
  if (ctx.verticalCompressionMode === "micro" || isMicroVisualContext(ctx)) {
    return "micro";
  }
  if (p > 25_000) return "fullDepth";
  if (t > 18 * 60 * 1000 || p > 7_500) return "macro";
  if (isMicroVisualContext(ctx)) return "micro";
  if (t < 4 * 60 * 1000 && p < 1_800) return "micro";
  return "intraday";
}

export function smoothPercentileCutoff(
  targetLow: number,
  targetHigh: number,
): { pLow: number; pHigh: number } {
  smoothedPLow = smoothedPLow + SMOOTH_ALPHA * (targetLow - smoothedPLow);
  smoothedPHigh = smoothedPHigh + SMOOTH_ALPHA * (targetHigh - smoothedPHigh);
  if (smoothedPHigh <= smoothedPLow + 0.02) {
    smoothedPHigh = smoothedPLow + 0.02;
  }
  return { pLow: smoothedPLow, pHigh: smoothedPHigh };
}

export function resetVisualSmoothing(): void {
  smoothedPLow = 0.1;
  smoothedPHigh = 0.98;
}

export type ModeNoiseConfig = {
  /** Min visual intensity to render non-wall bands. */
  minRenderIntensity: number;
  /** Compress values below this mapped intensity toward background. */
  backgroundCompress: number;
  /** Persistence boost multiplier cap. */
  persistenceCap: number;
};

export function noiseConfigForMode(mode: BookmapVisualMode): ModeNoiseConfig {
  switch (mode) {
    case "micro":
      return {
        minRenderIntensity: 0.05,
        backgroundCompress: 0.72,
        persistenceCap: 0.14,
      };
    case "macro":
      return {
        minRenderIntensity: 0.22,
        backgroundCompress: 0.35,
        persistenceCap: 0.2,
      };
    case "fullDepth":
      return {
        minRenderIntensity: 0.26,
        backgroundCompress: 0.32,
        persistenceCap: 0.22,
      };
    default:
      return {
        minRenderIntensity: 0.1,
        backgroundCompress: 0.45,
        persistenceCap: 0.16,
      };
  }
}
