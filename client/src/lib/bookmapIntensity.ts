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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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

// ─── Micro scalping visual hierarchy (historical texture only) ───────────────

export type MicroScalpContext = {
  verticalMode: string;
  visiblePriceRange: number;
  pxPerSample?: number;
  pxPerPriceBucket?: number;
};

/** Broader micro view — calibration + palette (matches panel microContext). */
export function isMicroVisualHierarchyMode(ctx: MicroScalpContext): boolean {
  return ctx.verticalMode === "micro" && ctx.visiblePriceRange <= 1_500;
}

export function isMicroScalpMode(ctx: MicroScalpContext): boolean {
  if (ctx.verticalMode !== "micro") return false;
  if (ctx.visiblePriceRange > 600) return false;
  const pxSample = ctx.pxPerSample;
  const pxBucket = ctx.pxPerPriceBucket;
  if (
    pxSample != null &&
    Number.isFinite(pxSample) &&
    pxBucket != null &&
    Number.isFinite(pxBucket)
  ) {
    return pxSample >= 4 || pxBucket >= 1.0;
  }
  return true;
}

export function microSizeScore(size: number): number {
  if (size < 2) return 0.06;
  if (size < 5) return 0.22;
  if (size < 10) return 0.38;
  if (size < 30) return 0.62;
  if (size < 70) return 0.82;
  return 0.94;
}

export function microProximityScore(distPct: number): number {
  if (distPct <= 0.0005) return 1.0;
  if (distPct <= 0.0015) return 0.78;
  if (distPct <= 0.0035) return 0.48;
  return 0.14;
}

export function microPersistenceScore(ms: number): number {
  if (ms < 1000) return 0.1;
  if (ms < 4000) return 0.32;
  if (ms < 10000) return 0.58;
  if (ms < 20000) return 0.76;
  return 0.9;
}

export function microContinuityScore(runLength: number): number {
  if (runLength <= 1) return 0.1;
  if (runLength === 2) return 0.28;
  if (runLength <= 4) return 0.52;
  if (runLength <= 8) return 0.74;
  return 0.88;
}

export function microRenderCurve(x: number): number {
  const v = clamp01(x);
  if (v < 0.1) return v * 0.8;
  if (v < 0.25) return 0.08 + (v - 0.1) * 1.35;
  if (v < 0.45) return 0.28 + (v - 0.25) * 1.25;
  if (v < 0.7) return 0.53 + (v - 0.45) * 1.0;
  return Math.min(0.96, 0.78 + (v - 0.7) * 0.6);
}

function microRenderIntensityCapBySize(sizeBtc: number): number {
  if (sizeBtc < 2) return 0.18;
  if (sizeBtc < 5) return 0.38;
  if (sizeBtc < 10) return 0.52;
  if (sizeBtc < 30) return 0.7;
  if (sizeBtc < 70) return 0.84;
  return 0.96;
}

export function computeMicroDataIntensity(params: {
  sizeBtc: number;
  localRankScore: number;
  proximityScore: number;
  persistenceScore: number;
  continuityScore?: number;
}): number {
  const continuity =
    params.continuityScore ?? params.persistenceScore;
  return clamp01(
    microSizeScore(params.sizeBtc) * 0.22 +
      clamp01(params.localRankScore) * 0.28 +
      clamp01(params.proximityScore) * 0.24 +
      clamp01(params.persistenceScore) * 0.14 +
      clamp01(continuity) * 0.12,
  );
}

export function calibrateMicroScalpRenderIntensity(params: {
  dataIntensity: number;
  sizeBtc: number;
  localRankScore: number;
  proximityScore: number;
  persistenceScore: number;
  continuityScore?: number;
}): number {
  const microData = computeMicroDataIntensity(params);
  const curved = microRenderCurve(microData);
  const existing = clamp01(params.dataIntensity);
  const combined = Math.max(existing, curved);
  const cap = microRenderIntensityCapBySize(params.sizeBtc);
  return Math.min(cap, combined);
}

export function computeLocalRankScore(
  sizeBtc: number,
  sortedSizes: number[],
): number {
  if (!sortedSizes.length || !Number.isFinite(sizeBtc) || sizeBtc <= 0) {
    return 0;
  }
  let rank = 0;
  for (const s of sortedSizes) {
    if (s <= sizeBtc) rank += 1;
  }
  if (sortedSizes.length <= 1) return sizeBtc > 0 ? 0.5 : 0;
  return clamp01((rank - 1) / (sortedSizes.length - 1));
}

// ─── Historical texture visual lock (frozen footprint intensity) ─────────────

/** Minimum intensity gain to flag a semantic upgrade (max() always applies). */
export const HISTORICAL_INTENSITY_UPGRADE_DELTA = 0.015;

export type HistoricalTextureVisualLock = {
  renderIntensity: number;
  renderAlphaFloor: number;
  createdAt: number;
};

export type HistoricalTextureVisualLockResult = {
  renderIntensity: number;
  renderAlphaFloor: number;
  locked: boolean;
  upgraded: boolean;
  downgradePrevented: boolean;
  firstLockBelowMedium: boolean;
  deniedUpgrade: boolean;
};

export function historicalTextureCellKey(
  side: "bid" | "ask",
  price: number,
  timeBucket: number,
  visualRegime: "micro" | "std" = "std",
): string {
  return `${side}:${price}:${timeBucket}:${visualRegime}`;
}

/**
 * Session cache — stores MAX render intensity reached per key.
 * Never downgrade intensity; alpha is a floor hint only (renderer computes final).
 */
export function resolveHistoricalTextureVisualLock(params: {
  key: string;
  currentRenderIntensity: number;
  currentRenderAlpha: number;
  cache?: Map<string, HistoricalTextureVisualLock>;
}): HistoricalTextureVisualLockResult {
  const currentI = clamp01(params.currentRenderIntensity);
  const currentA = clamp01(params.currentRenderAlpha);
  const cache = params.cache;

  if (!cache) {
    return {
      renderIntensity: currentI,
      renderAlphaFloor: currentA,
      locked: false,
      upgraded: false,
      downgradePrevented: false,
      firstLockBelowMedium: currentI < 0.25,
      deniedUpgrade: false,
    };
  }

  const existing = cache.get(params.key);
  if (!existing) {
    cache.set(params.key, {
      renderIntensity: currentI,
      renderAlphaFloor: currentA,
      createdAt: Date.now(),
    });
    return {
      renderIntensity: currentI,
      renderAlphaFloor: currentA,
      locked: true,
      upgraded: false,
      downgradePrevented: false,
      firstLockBelowMedium: currentI < 0.25,
      deniedUpgrade: false,
    };
  }

  const nextIntensity = Math.max(existing.renderIntensity, currentI);
  const upgraded =
    currentI > existing.renderIntensity + HISTORICAL_INTENSITY_UPGRADE_DELTA;
  const downgradePrevented =
    currentI < existing.renderIntensity - HISTORICAL_INTENSITY_UPGRADE_DELTA;
  const deniedUpgrade =
    currentI > existing.renderIntensity &&
    currentI <= existing.renderIntensity + HISTORICAL_INTENSITY_UPGRADE_DELTA &&
    !upgraded;
  const nextAlphaFloor = upgraded
    ? Math.max(existing.renderAlphaFloor, currentA)
    : existing.renderAlphaFloor;

  cache.set(params.key, {
    renderIntensity: nextIntensity,
    renderAlphaFloor: nextAlphaFloor,
    createdAt: existing.createdAt,
  });

  return {
    renderIntensity: nextIntensity,
    renderAlphaFloor: nextAlphaFloor,
    locked: true,
    upgraded,
    downgradePrevented,
    firstLockBelowMedium: false,
    deniedUpgrade,
  };
}

// ─── Historical texture span/run peak lock ───────────────────────────────────

export type HistoricalTextureSpanPeakLock = {
  peakIntensity: number;
  alphaFloor: number;
  peakSize: number;
  updatedAt: number;
};

export type HistoricalTextureSpanPeakLockResult = {
  peakIntensity: number;
  alphaFloor: number;
  peakSize: number;
  upgraded: boolean;
  downgradePrevented: boolean;
};

export type TextureSpanPeakCellLike = {
  intensity?: number;
  dataIntensity?: number;
  microScalpRenderIntensity?: number;
  historicalRenderIntensity?: number;
  historicalRenderAlphaFloor?: number;
  historicalRenderAlpha?: number;
  maxSizeInBucket?: number;
};

export function computeTextureSpanPeakIntensity(
  cell: TextureSpanPeakCellLike,
): number {
  return clamp01(
    Math.max(
      cell.microScalpRenderIntensity ?? 0,
      cell.historicalRenderIntensity ?? 0,
      cell.intensity ?? 0,
      cell.dataIntensity ?? 0,
    ),
  );
}

export function computeTextureSpanAlphaFloor(
  cell: TextureSpanPeakCellLike,
): number {
  return clamp01(
    Math.max(
      cell.historicalRenderAlphaFloor ?? 0,
      cell.historicalRenderAlpha ?? 0,
    ),
  );
}

export function historicalTextureRunKey(
  side: "bid" | "ask",
  price: number,
  firstTimeBucket: number,
  visualRegime: "micro" | "std" = "std",
): string {
  return `run:${side}:${price}:${firstTimeBucket}:${visualRegime}`;
}

/** Session cache — MAX peak intensity per resting run (side+price+runStart). */
export function resolveHistoricalTextureSpanPeakLock(params: {
  key: string;
  currentPeakIntensity: number;
  currentAlphaFloor: number;
  currentPeakSize: number;
  cache?: Map<string, HistoricalTextureSpanPeakLock>;
}): HistoricalTextureSpanPeakLockResult {
  const currentI = clamp01(params.currentPeakIntensity);
  const currentA = clamp01(params.currentAlphaFloor);
  const currentSize = Math.max(0, params.currentPeakSize);
  const cache = params.cache;

  if (!cache) {
    return {
      peakIntensity: currentI,
      alphaFloor: currentA,
      peakSize: currentSize,
      upgraded: false,
      downgradePrevented: false,
    };
  }

  const existing = cache.get(params.key);
  if (!existing) {
    cache.set(params.key, {
      peakIntensity: currentI,
      alphaFloor: currentA,
      peakSize: currentSize,
      updatedAt: Date.now(),
    });
    return {
      peakIntensity: currentI,
      alphaFloor: currentA,
      peakSize: currentSize,
      upgraded: false,
      downgradePrevented: false,
    };
  }

  const nextIntensity = Math.max(existing.peakIntensity, currentI);
  const upgraded =
    currentI > existing.peakIntensity + HISTORICAL_INTENSITY_UPGRADE_DELTA;
  const downgradePrevented =
    currentI < existing.peakIntensity - HISTORICAL_INTENSITY_UPGRADE_DELTA;
  const nextAlphaFloor =
    nextIntensity > existing.peakIntensity
      ? Math.max(existing.alphaFloor, currentA)
      : existing.alphaFloor;
  const nextPeakSize = Math.max(existing.peakSize, currentSize);

  cache.set(params.key, {
    peakIntensity: nextIntensity,
    alphaFloor: nextAlphaFloor,
    peakSize: nextPeakSize,
    updatedAt: existing.updatedAt,
  });

  return {
    peakIntensity: nextIntensity,
    alphaFloor: nextAlphaFloor,
    peakSize: nextPeakSize,
    upgraded,
    downgradePrevented,
  };
}
