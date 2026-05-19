import { percentile } from "@/components/flows/liquidityHeatmapUtils";
import {
  noiseConfigForMode,
  resolveVisualMode,
  smoothPercentileCutoff,
  type BookmapVisualMode,
  type VisibleVisualContext,
} from "@/lib/bookmapVisualContext";
import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";

/** @deprecated Legacy scale — prefer AdaptiveVisualScale */
export type LogPercentileScale = {
  lower: number;
  upper: number;
};

export type AdaptiveVisualScale = {
  visualMode: BookmapVisualMode;
  pLow: number;
  pHigh: number;
  logP60: number;
  logP80: number;
  logP92: number;
  logP97: number;
  logP99: number;
  logMax: number;
};

export type AdaptiveIntensityMeta = {
  scale: AdaptiveVisualScale;
  pLow: number;
  pHigh: number;
};

function logSizes(sizes: number[]): number[] {
  return sizes.filter((s) => s > 0 && Number.isFinite(s)).map((s) => Math.log1p(s));
}

function modePercentileAnchors(mode: BookmapVisualMode): {
  p60: number;
  p80: number;
  p92: number;
  p97: number;
  p99: number;
} {
  switch (mode) {
    case "micro":
      return { p60: 0.42, p80: 0.68, p92: 0.86, p97: 0.94, p99: 0.98 };
    case "macro":
      return { p60: 0.68, p80: 0.86, p92: 0.94, p97: 0.98, p99: 0.995 };
    case "fullDepth":
      return { p60: 0.7, p80: 0.88, p92: 0.95, p97: 0.985, p99: 0.996 };
    default:
      return { p60: 0.6, p80: 0.8, p92: 0.92, p97: 0.97, p99: 0.99 };
  }
}

/**
 * Build visible-band distribution scale with smoothed percentile cutoffs.
 */
export function computeAdaptiveVisualScale(
  bandMaxSizes: number[],
  ctx: VisibleVisualContext,
  options?: { skipSmoothing?: boolean },
): AdaptiveIntensityMeta {
  const mode = resolveVisualMode(ctx);
  const logs = logSizes(bandMaxSizes);
  const anchors = modePercentileAnchors(mode);

  const smoothCutoffs = (low: number, high: number) =>
    options?.skipSmoothing
      ? { pLow: low, pHigh: high }
      : smoothPercentileCutoff(low, high);

  if (!logs.length) {
    const emptyLow = mode === "micro" ? 0.03 : 0.1;
    const emptyHigh = mode === "micro" ? 0.91 : 0.98;
    const { pLow, pHigh } = smoothCutoffs(emptyLow, emptyHigh);
    return {
      scale: {
        visualMode: mode,
        pLow,
        pHigh,
        logP60: 0,
        logP80: 1,
        logP92: 2,
        logP97: 3,
        logP99: 4,
        logMax: 5,
      },
      pLow,
      pHigh,
    };
  }

  const sorted = [...logs].sort((a, b) => a - b);
  const logP60 = percentile(sorted, anchors.p60);
  const logP80 = percentile(sorted, anchors.p80);
  const logP92 = Math.max(logP60, percentile(sorted, anchors.p92));
  const logP97 = Math.max(logP92, percentile(sorted, anchors.p97));
  const logP99 = Math.max(logP97, percentile(sorted, anchors.p99));
  const logMax = Math.max(logP99, sorted[sorted.length - 1] ?? logP99);

  let targetLowPct: number;
  let targetHighPct: number;
  if (mode === "micro") {
    targetLowPct = 0.03;
    targetHighPct = 0.91;
  } else if (mode === "macro" || mode === "fullDepth") {
    targetLowPct = 0.65;
    targetHighPct = 0.995;
  } else {
    targetLowPct = 0.55;
    targetHighPct = 0.99;
  }

  const targetLow = percentile(sorted, targetLowPct);
  const targetHigh = percentile(sorted, targetHighPct);
  const useSmooth = mode !== "micro" && !options?.skipSmoothing;
  const { pLow, pHigh } = useSmooth
    ? smoothPercentileCutoff(
        targetLow / Math.max(logMax, 1e-9),
        targetHigh / Math.max(logMax, 1e-9),
      )
    : {
        pLow: targetLow / Math.max(logMax, 1e-9),
        pHigh: targetHigh / Math.max(logMax, 1e-9),
      };

  return {
    scale: {
      visualMode: mode,
      pLow,
      pHigh,
      logP60,
      logP80,
      logP92,
      logP97,
      logP99,
      logMax,
    },
    pLow,
    pHigh,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function segmentMap(logSize: number, lo: number, hi: number, outLo: number, outHi: number): number {
  if (hi <= lo) return outHi;
  const t = Math.max(0, Math.min(1, (logSize - lo) / (hi - lo)));
  return lerp(outLo, outHi, t);
}

/** Map log1p(size) to 0–1 visual intensity using visible distribution curve. */
export function mapLogSizeToVisualIntensity(
  logSize: number,
  scale: AdaptiveVisualScale,
): number {
  const { logP60, logP80, logP92, logP97, logP99, logMax, visualMode } = scale;
  const cfg = noiseConfigForMode(visualMode);

  if (logSize <= logP60) {
    const t = logP60 > 0 ? Math.max(0, logSize / logP60) : 0;
    const lowGain = visualMode === "micro" ? 0.4 : 0.22;
    const v = t * lowGain * cfg.backgroundCompress;
    return v;
  }
  if (logSize <= logP80) {
    return visualMode === "micro"
      ? segmentMap(logSize, logP60, logP80, 0.12, 0.44)
      : segmentMap(logSize, logP60, logP80, 0.08, 0.38);
  }
  if (logSize <= logP92) {
    return visualMode === "micro"
      ? segmentMap(logSize, logP80, logP92, 0.44, 0.62)
      : segmentMap(logSize, logP80, logP92, 0.38, 0.58);
  }
  if (logSize <= logP97) {
    return segmentMap(logSize, logP92, logP97, 0.58, 0.76);
  }
  if (logSize <= logP99) {
    return segmentMap(logSize, logP97, logP99, 0.76, 0.9);
  }
  return segmentMap(logSize, logP99, logMax, 0.9, 1);
}

export function mapSizeToVisualIntensity(
  size: number,
  scale: AdaptiveVisualScale,
  peakSize?: number,
): number {
  const logSize = Math.log1p(Math.max(0, size));
  let v = mapLogSizeToVisualIntensity(logSize, scale);

  const peak = peakSize != null && Number.isFinite(peakSize) ? peakSize : size;
  if (peak >= WALL_MAJOR_BTC) v = Math.max(v, 0.88);
  else if (peak >= WALL_STRUCTURAL_BTC) v = Math.max(v, 0.76);
  else if (peak >= WALL_IMPORTANT_BTC) v = Math.max(v, 0.62);

  return Math.max(0, Math.min(1, v));
}

export function applyPersistenceBoost(
  visualIntensity: number,
  persistenceMs: number,
  mode: BookmapVisualMode,
): number {
  const cap = noiseConfigForMode(mode).persistenceCap;
  const refMs = 12 * 60 * 1000;
  const persist = Math.min(1, persistenceMs / refMs);
  const boost = persist * cap * (0.5 + visualIntensity * 0.5);
  return Math.min(1, visualIntensity + boost);
}

/** Legacy helpers — kept for any non-engine paths */
export function computeLogPercentileScale(sizes: number[]): LogPercentileScale {
  const positive = sizes.filter((s) => Number.isFinite(s) && s > 0);
  if (!positive.length) return { lower: 0, upper: 1 };
  return {
    lower: percentile(positive, 0.1),
    upper: Math.max(
      percentile(positive, 0.1) + 1e-9,
      percentile(positive, 0.98),
    ),
  };
}

export function logPercentileIntensity(
  size: number,
  scale: LogPercentileScale,
  peakSize?: number,
): number {
  const logLower = Math.log1p(Math.max(0, scale.lower));
  const logUpper = Math.log1p(Math.max(scale.upper, scale.lower + 1e-9));
  const denom = Math.max(logUpper - logLower, 1e-9);
  const raw = (Math.log1p(Math.max(0, size)) - logLower) / denom;
  let intensity = Math.max(0, Math.min(1, raw));
  const peak = peakSize != null && Number.isFinite(peakSize) ? peakSize : size;
  if (peak >= WALL_MAJOR_BTC) intensity = Math.max(intensity, 0.95);
  else if (peak >= WALL_STRUCTURAL_BTC) intensity = Math.max(intensity, 0.85);
  else if (peak >= WALL_IMPORTANT_BTC) intensity = Math.max(intensity, 0.7);
  return Math.max(0, Math.min(1, intensity));
}
