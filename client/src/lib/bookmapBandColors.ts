import type { HeatmapBand } from "@/components/flows/bookmapBandTypes";
import { isWallTier } from "@/components/flows/bookmapBandTypes";
import {
  PALETTE_ALPHA_ACTIVE_EXTREME_MAX,
  PALETTE_ALPHA_ACTIVE_STRONG_MIN,
  PALETTE_ALPHA_ACTIVE_WEAK_MIN,
  PALETTE_ALPHA_CLOSED_OLD_MUL,
  PALETTE_ALPHA_CLOSED_RECENT_MUL,
  BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3,
  BOOKMAP_HEATMAP_DEPTH_PASS_V2,
  BOOKMAP_HORIZONTAL_PERSISTENCE_V2,
  BOOKMAP_TEXTURE_CALIBRATION_V2,
  DEPTH_V2_NEAR_PRICE_ALPHA_BOOST,
  DEPTH_V2_NEAR_PRICE_PCT,
  H_PERSIST_V2_WEAK_HISTORICAL_ALPHA_MUL,
  TEX_CALIB_V2_LONG_WEAK_BASE_ALPHA_MUL,
  TEX_CALIB_V2_STRONG_BASE_ALPHA_CAP,
  V3_INNER_CORE_MIN_INTENSITY,
  V3_INNER_CORE_MIN_RUN,
  V3_INNER_CORE_MIN_SIZE_BTC,
  V3_NEAR_PRICE_ALPHA_BOOST,
  V3_NEAR_PRICE_MIN_INTENSITY,
  V3_NEAR_PRICE_MIN_SIZE_OR_RUN,
  V3_STRONG_BASE_ALPHA_CAP,
  V3_SOLID_BASE_ALPHA_MUL,
  WALL_IMPORTANT_BTC,
  type BookmapZoomRegime,
} from "@/lib/bookmapEngineConfig";

/**
 * Intensity-first Bookmap palette (side does not dominate hue).
 * Passive liquidity: navy → blue → cyan → yellow → orange → red → hot highlight.
 */

/** Micro scalping historical texture alpha — local contrast without global wash. */
export const MICRO_TEXTURE_ALPHA_MUL = 1.12;
export const MICRO_TEXTURE_ALPHA_MAX = 0.72;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

/** Bookmap passive liquidity ramp — 10-stop reference palette. */
const PASSIVE_PALETTE_STOPS: readonly (readonly [number, number, number])[] = [
  [11, 26, 43],
  [16, 50, 74],
  [22, 89, 120],
  [29, 137, 179],
  [79, 195, 247],
  [212, 217, 74],
  [240, 160, 32],
  [227, 91, 43],
  [214, 40, 40],
  [255, 240, 208],
];

/** B.2 — darker weak end, sharper warm transition for dominant walls. */
const PASSIVE_PALETTE_STOPS_V2: readonly (readonly [number, number, number])[] = [
  [8, 18, 32],
  [12, 34, 58],
  [18, 62, 92],
  [24, 98, 138],
  [52, 156, 210],
  [198, 208, 58],
  [238, 152, 28],
  [224, 82, 36],
  [208, 34, 34],
  [255, 228, 188],
];

/** B.2.1 — thermal ramp: darker navy weak end, smoother blue→cyan→yellow→orange. */
const PASSIVE_PALETTE_STOPS_CALIB_V2: readonly (readonly [number, number, number])[] = [
  [6, 14, 28],
  [10, 30, 52],
  [16, 56, 86],
  [22, 94, 132],
  [46, 148, 196],
  [172, 192, 48],
  [234, 146, 26],
  [216, 76, 34],
  [198, 30, 30],
  [255, 218, 172],
];

/** B.2.3 — brighter weak blues, earlier yellow/orange on persistent liquidity. */
const PASSIVE_PALETTE_STOPS_V3: readonly (readonly [number, number, number])[] = [
  [4, 10, 22],
  [8, 24, 46],
  [14, 48, 78],
  [20, 86, 124],
  [40, 138, 184],
  [148, 178, 38],
  [232, 138, 22],
  [208, 68, 30],
  [186, 26, 26],
  [255, 206, 160],
];

function activePassivePaletteStops(): readonly (readonly [number, number, number])[] {
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    return PASSIVE_PALETTE_STOPS_V3;
  }
  if (BOOKMAP_TEXTURE_CALIBRATION_V2) {
    return PASSIVE_PALETTE_STOPS_CALIB_V2;
  }
  return BOOKMAP_HORIZONTAL_PERSISTENCE_V2
    ? PASSIVE_PALETTE_STOPS_V2
    : PASSIVE_PALETTE_STOPS;
}

export type PassiveIntensityBucket = "weak" | "medium" | "strong" | "extreme";

export function classifyPassiveIntensityBucket(
  intensity: number,
): PassiveIntensityBucket {
  const t = clamp01(intensity);
  if (BOOKMAP_HORIZONTAL_PERSISTENCE_V2) {
    if (t < 0.18) return "weak";
    if (t < 0.48) return "medium";
    if (t < 0.72) return "strong";
    return "extreme";
  }
  if (t < 0.22) return "weak";
  if (t < 0.52) return "medium";
  if (t < 0.78) return "strong";
  return "extreme";
}

/** Unified Bookmap passive ramp — texture and wall bands share the same hue steps. */
export function intensityToPassiveLiquidityRgb(
  intensity: number,
): [number, number, number] {
  const t = clamp01(intensity);
  const stops = activePassivePaletteStops();
  const scaled = t * (stops.length - 1);
  const idx = Math.floor(scaled);
  const frac = scaled - idx;
  const a = stops[Math.min(idx, stops.length - 1)]!;
  const b = stops[Math.min(idx + 1, stops.length - 1)]!;
  return lerpRgb(a, b, frac);
}

/** @deprecated alias — same passive ramp */
export function intensityToRgb(intensity: number): [number, number, number] {
  return intensityToPassiveLiquidityRgb(intensity);
}

/** Texture path uses identical ramp (no separate cyan-flat compression). */
export function intensityToTextureRgb(intensity: number): [number, number, number] {
  return intensityToPassiveLiquidityRgb(intensity);
}

/** Micro scalping historical texture ramp — sharper local hierarchy breakpoints. */
const MICRO_HISTORICAL_BREAKPOINTS = [0, 0.14, 0.28, 0.46, 0.62, 0.78, 1] as const;
const MICRO_HISTORICAL_STOPS: readonly (readonly [number, number, number])[] = [
  [11, 26, 43],
  [16, 50, 74],
  [22, 89, 120],
  [29, 137, 179],
  [79, 195, 247],
  [212, 217, 74],
  [240, 160, 32],
  [227, 91, 43],
];

export function intensityToMicroHistoricalTextureRgb(
  intensity: number,
): [number, number, number] {
  const t = clamp01(intensity);
  let seg = MICRO_HISTORICAL_BREAKPOINTS.length - 2;
  for (let i = 0; i < MICRO_HISTORICAL_BREAKPOINTS.length - 1; i += 1) {
    if (t <= MICRO_HISTORICAL_BREAKPOINTS[i + 1]!) {
      seg = i;
      break;
    }
  }
  const lo = MICRO_HISTORICAL_BREAKPOINTS[seg]!;
  const hi = MICRO_HISTORICAL_BREAKPOINTS[seg + 1]!;
  const frac = hi > lo ? (t - lo) / (hi - lo) : 0;
  const a = MICRO_HISTORICAL_STOPS[seg]!;
  const b = MICRO_HISTORICAL_STOPS[seg + 1]!;
  return lerpRgb(a, b, frac);
}

export function microAlphaFromRenderIntensity(t: number): number {
  const v = clamp01(t);
  if (v < 0.15) return 0.07 + v * 0.35;
  if (v < 0.35) return 0.14 + (v - 0.15) * 0.55;
  if (v < 0.6) return 0.25 + (v - 0.35) * 0.6;
  return 0.4 + (v - 0.6) * 0.45;
}

export type HistoricalTextureFillOptions = {
  microScalpMode?: boolean;
};

/** Historical texture fill — optional micro scalping palette/alpha branch. */
export function getHistoricalTextureFill(
  side: "bid" | "ask",
  intensity: number,
  alphaCtx: PassiveLiquidityAlphaContext,
  globalMul = 1,
  opts?: HistoricalTextureFillOptions,
): string {
  if (!opts?.microScalpMode) {
    return getPassiveLiquidityFill(side, intensity, alphaCtx, globalMul);
  }

  const rgb = intensityToMicroHistoricalTextureRgb(intensity);
  const tinted =
    intensity < 0.55 ? applySubtleSideTint(rgb, side, intensity) : rgb;
  let a = microAlphaFromRenderIntensity(intensity) * MICRO_TEXTURE_ALPHA_MUL * globalMul;
  a = Math.min(MICRO_TEXTURE_ALPHA_MAX, a);

  if (!alphaCtx.isActive) {
    const ageMs = alphaCtx.closedAgeMs ?? 0;
    const closedMul =
      ageMs < 60_000
        ? PALETTE_ALPHA_CLOSED_RECENT_MUL
        : ageMs < 300_000
          ? 0.32
          : PALETTE_ALPHA_CLOSED_OLD_MUL;
    a *= closedMul;
  } else if (
    alphaCtx.farDistanceFade != null &&
    alphaCtx.farDistanceFade < 1 &&
    !alphaCtx.isRelevantL2
  ) {
    a *= 0.55 + alphaCtx.farDistanceFade * 0.45;
  }

  const [r, g, b] = tinted;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0.07, a)})`;
}

/** Subtle side tint at low intensities only (±4 on green channel). */
function applySubtleSideTint(
  rgb: [number, number, number],
  side: "bid" | "ask",
  intensity: number,
): [number, number, number] {
  if (intensity > 0.55) return rgb;
  const [r, g, b] = rgb;
  if (side === "bid") return [r, Math.min(255, g + 4), b];
  return [Math.min(255, r + 3), g, b];
}

export type PassiveLiquidityAlphaContext = {
  intensity: number;
  isActive: boolean;
  isRelevantL2?: boolean;
  isWeakGranular?: boolean;
  closedAgeMs?: number;
  isRightContinuation?: boolean;
  /** 0–1 zoom distance fade — hierarchy via alpha, not hue shift */
  farDistanceFade?: number;
};

/**
 * Body opacity driven by intensity bucket — not low-alpha pastel washes.
 */
export function alphaForPassiveLiquidity(
  ctx: PassiveLiquidityAlphaContext,
): number {
  const t = clamp01(ctx.intensity);
  let body: number;

  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    if (t < 0.22) {
      body = 0.22 + (t / 0.22) * (0.36 - 0.22);
    } else if (t < 0.52) {
      body = 0.34 + ((t - 0.22) / 0.3) * (0.52 - 0.34);
    } else if (t < 0.78) {
      body = 0.55 + ((t - 0.52) / 0.26) * (0.76 - 0.55);
    } else {
      body = Math.min(0.82, 0.68 + ((t - 0.78) / 0.22) * 0.14);
    }
  } else if (t < 0.22) {
    body =
      PALETTE_ALPHA_ACTIVE_WEAK_MIN + (t / 0.22) * (0.36 - PALETTE_ALPHA_ACTIVE_WEAK_MIN);
    if (BOOKMAP_TEXTURE_CALIBRATION_V2) {
      body *= 0.78;
    } else if (BOOKMAP_HORIZONTAL_PERSISTENCE_V2) {
      body *= H_PERSIST_V2_WEAK_HISTORICAL_ALPHA_MUL;
    }
  } else if (t < 0.52) {
    body = 0.45 + ((t - 0.22) / 0.3) * 0.17;
  } else if (t < 0.78) {
    body =
      PALETTE_ALPHA_ACTIVE_STRONG_MIN + ((t - 0.52) / 0.26) * 0.2;
  } else {
    body =
      PALETTE_ALPHA_ACTIVE_STRONG_MIN +
      0.2 +
      ((t - 0.78) / 0.22) *
        (PALETTE_ALPHA_ACTIVE_EXTREME_MAX - PALETTE_ALPHA_ACTIVE_STRONG_MIN - 0.2);
    if (BOOKMAP_HORIZONTAL_PERSISTENCE_V2 && ctx.isActive) {
      body = Math.min(PALETTE_ALPHA_ACTIVE_EXTREME_MAX, body * 1.06);
    }
  }

  if (ctx.isRelevantL2 && ctx.isActive) {
    body = Math.max(body, t >= 0.52 ? 0.78 : t >= 0.22 ? 0.55 : 0.42);
  }

  if (ctx.isWeakGranular && ctx.isActive) {
    body *= 0.94;
  }

  if (!ctx.isActive) {
    const ageMs = ctx.closedAgeMs ?? 0;
    let closedMul =
      ageMs < 60_000
        ? PALETTE_ALPHA_CLOSED_RECENT_MUL
        : ageMs < 300_000
          ? 0.32
          : PALETTE_ALPHA_CLOSED_OLD_MUL;
    if (t >= 0.52 && ageMs < 120_000) {
      closedMul = Math.max(closedMul, 0.48);
    }
    body *= closedMul;
  }

  if (ctx.isRightContinuation && ctx.isActive) {
    body = Math.max(body, t >= 0.52 ? 0.72 : t >= 0.22 ? 0.48 : body);
  }

  if (
    ctx.farDistanceFade != null &&
    ctx.farDistanceFade < 1 &&
    !ctx.isRelevantL2
  ) {
    body *= 0.55 + ctx.farDistanceFade * 0.45;
  }

  return Math.min(
    BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.82 : PALETTE_ALPHA_ACTIVE_EXTREME_MAX,
    Math.max(0.14, body),
  );
}

export function getPassiveLiquidityFill(
  side: "bid" | "ask",
  intensity: number,
  alphaCtx: PassiveLiquidityAlphaContext,
  globalMul = 1,
): string {
  const rgb = intensityToPassiveLiquidityRgb(intensity);
  const tinted =
    intensity < 0.55 ? applySubtleSideTint(rgb, side, intensity) : rgb;
  const a = alphaForPassiveLiquidity(alphaCtx) * globalMul;
  const [r, g, b] = tinted;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Legacy wall-band alpha — delegates to passive body opacity. */
export function alphaForVisualIntensity(intensity: number, stale = false): number {
  return alphaForPassiveLiquidity({
    intensity,
    isActive: !stale,
    closedAgeMs: stale ? 120_000 : 0,
  });
}

export function getBookmapBandFill(band: HeatmapBand, alphaMul = 1): string {
  const intensity = band.visualIntensity ?? band.intensity;
  return getPassiveLiquidityFill(
    band.side,
    intensity,
    {
      intensity,
      isActive: !band.stale,
      isRelevantL2: isWallTier(band.tier) || band.maxSize >= 100,
      closedAgeMs: band.stale ? 90_000 : 0,
    },
    alphaMul,
  );
}

/** Legacy texture alpha helper — matches passive body opacity. */
export function alphaForTextureIntensity(
  intensity: number,
  alphaCtx?: Partial<PassiveLiquidityAlphaContext>,
): number {
  return alphaForPassiveLiquidity({
    intensity,
    isActive: alphaCtx?.isActive ?? true,
    isRelevantL2: alphaCtx?.isRelevantL2,
    isWeakGranular: alphaCtx?.isWeakGranular,
    closedAgeMs: alphaCtx?.closedAgeMs,
    isRightContinuation: alphaCtx?.isRightContinuation,
    farDistanceFade: alphaCtx?.farDistanceFade,
  });
}

/** Bookmap-style passive microstructure — unified ramp + solid body alpha. */
export function getBookmapTextureFill(
  side: "bid" | "ask",
  intensity: number,
  alphaMul = 1,
  alphaCtx?: Partial<PassiveLiquidityAlphaContext>,
): string {
  return getPassiveLiquidityFill(
    side,
    intensity,
    {
      intensity,
      isActive: alphaCtx?.isActive ?? true,
      isRelevantL2: alphaCtx?.isRelevantL2,
      isWeakGranular: alphaCtx?.isWeakGranular,
      closedAgeMs: alphaCtx?.closedAgeMs,
      isRightContinuation: alphaCtx?.isRightContinuation,
      farDistanceFade: alphaCtx?.farDistanceFade,
    },
    alphaMul,
  );
}

export type LiveDomMicrostructureTier = "low" | "medium" | "strong" | "wall";

/** Live DOM right-edge palette — distinct from historical texture ramp. */
export function getLiveDomMicrostructureFill(
  side: "bid" | "ask",
  tier: LiveDomMicrostructureTier,
  alpha: number,
): string {
  const sideBias =
    side === "bid"
      ? ([-6, 8, 4] as const)
      : ([8, -4, -6] as const);
  const palettes: Record<LiveDomMicrostructureTier, [number, number, number]> = {
    low: [14, 38, 58],
    medium: [24, 118, 148],
    strong: [196, 178, 72],
    wall: side === "bid" ? [214, 118, 48] : [208, 72, 52],
  };
  const base = palettes[tier];
  const rgb: [number, number, number] = [
    Math.max(0, Math.min(255, base[0] + sideBias[0])),
    Math.max(0, Math.min(255, base[1] + sideBias[1])),
    Math.max(0, Math.min(255, base[2] + sideBias[2])),
  ];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(0.65, Math.max(0.08, alpha))})`;
}

export function getBookmapBandStroke(band: HeatmapBand): string | null {
  const intensity = band.visualIntensity ?? band.intensity;
  if (!isWallTier(band.tier) && intensity < 0.72) return null;
  const [r, g, b] = intensityToPassiveLiquidityRgb(intensity);
  const a = intensity >= 0.85 ? 0.55 : 0.38;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function getWallLabelText(band: HeatmapBand): string {
  const side = band.side === "bid" ? "BID" : "ASK";
  const btc = Math.round(band.maxSize);
  if (band.tier === "major") return `MAJOR ${side} ${btc} BTC`;
  if (band.tier === "structural") return `${side} WALL ${btc} BTC`;
  return `${side} WALL ${btc} BTC`;
}

/** Labels use wall tier hue, not bid/ask split */
export function getWallLabelColor(band: HeatmapBand): string {
  const intensity = band.visualIntensity ?? band.intensity;
  if (intensity >= 0.88) return "rgba(255, 200, 120, 0.95)";
  if (intensity >= 0.72) return "rgba(253, 224, 71, 0.95)";
  return "rgba(180, 220, 255, 0.9)";
}

/** B.2.1 — near-price alpha boost for weak/medium historical depth (no wall inflation). */
export function resolveDepthPassNearPriceAlphaBoost(
  pctFromMid: number,
  regime: BookmapZoomRegime,
  sizeBtc: number,
  intensity = 0,
  runLength = 1,
): number {
  if (!BOOKMAP_HEATMAP_DEPTH_PASS_V2) return 0;
  if (sizeBtc >= WALL_IMPORTANT_BTC) return 0;
  const nearPct = DEPTH_V2_NEAR_PRICE_PCT;
  if (pctFromMid > nearPct) return 0;

  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    if (
      intensity < V3_NEAR_PRICE_MIN_INTENSITY &&
      sizeBtc < V3_NEAR_PRICE_MIN_SIZE_OR_RUN &&
      runLength < 2
    ) {
      return 0;
    }
    const proximity = 1 - pctFromMid / nearPct;
    let boost = V3_NEAR_PRICE_ALPHA_BOOST * proximity;
    if (runLength >= 2) boost *= 1 + Math.min(0.35, (runLength - 1) * 0.08);
    if (regime === "macro") boost *= 0.65;
    else if (regime === "scalp" || regime === "ultra_micro") boost *= 1.18;
    return Math.max(0, Math.min(0.32, boost));
  }

  const proximity = 1 - pctFromMid / nearPct;
  let boost = DEPTH_V2_NEAR_PRICE_ALPHA_BOOST * proximity;
  if (regime === "macro") boost *= 0.55;
  else if (regime === "scalp" || regime === "ultra_micro") boost *= 1.12;
  return Math.max(0, Math.min(0.28, boost));
}

/** B.2.3 — tiered granular overlay scale by span intensity. */
export function resolveAggressiveOverlayScale(intensity: number): number {
  if (!BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) return 1;
  const t = clamp01(intensity);
  if (t >= 0.65) return 2.55;
  if (t >= 0.45) return 1.75;
  if (t >= 0.22) return 1.15;
  return 0.95;
}

/** B.2.1 — cap and modulate strong-wall body alpha for organic rendering. */
export function resolveOrganicWallBodyAlpha(
  bodyAlpha: number,
  intensity: number,
  runLength: number,
  sizeBtc: number,
): number {
  if (!BOOKMAP_TEXTURE_CALIBRATION_V2) return bodyAlpha;
  const t = clamp01(intensity);
  let alpha = bodyAlpha;
  const strongCap = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_STRONG_BASE_ALPHA_CAP
    : TEX_CALIB_V2_STRONG_BASE_ALPHA_CAP;
  const strongThreshold = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.52 : 0.62;
  const strongSize = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_INNER_CORE_MIN_SIZE_BTC
    : WALL_IMPORTANT_BTC;
  const strongRun = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_INNER_CORE_MIN_RUN
    : 4;

  if (t >= strongThreshold && (sizeBtc >= strongSize || runLength >= strongRun)) {
    alpha = Math.min(strongCap, alpha);
  } else if (runLength >= 5 && t < 0.48) {
    alpha *= TEX_CALIB_V2_LONG_WEAK_BASE_ALPHA_MUL;
  }

  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    alpha *= V3_SOLID_BASE_ALPHA_MUL;
  }

  return Math.max(0.1, alpha);
}

/** B.2.1 — inner heat-core intensity bump for dominant walls. */
export function resolveOrganicWallCoreIntensity(intensity: number): number {
  const t = clamp01(intensity);
  const bump = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 ? 0.1 : 0.06;
  return Math.min(0.98, t + bump + t * 0.05);
}

/** B.2.3 — whether span qualifies for inner heat-core rendering. */
export function qualifiesOrganicInnerCore(
  intensity: number,
  runLength: number,
  sizeBtc: number,
  nearPrice: boolean,
): boolean {
  if (!BOOKMAP_TEXTURE_CALIBRATION_V2) return false;
  const t = clamp01(intensity);
  const minI = BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3
    ? V3_INNER_CORE_MIN_INTENSITY
    : 0.58;
  if (t < minI) return false;

  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) {
    if (sizeBtc >= V3_INNER_CORE_MIN_SIZE_BTC && runLength >= V3_INNER_CORE_MIN_RUN) {
      return true;
    }
    if (nearPrice && runLength >= 3 && sizeBtc >= V3_NEAR_PRICE_MIN_SIZE_OR_RUN && t >= 0.52) {
      return true;
    }
    return false;
  }

  return sizeBtc >= WALL_IMPORTANT_BTC || runLength >= 3;
}

export type AnchoredWallVisualTier = "dominant" | "medium" | "weak" | "far";

function desaturateRgb(
  rgb: [number, number, number],
  amount: number,
): [number, number, number] {
  const gray = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  const a = clamp01(amount);
  return [
    Math.round(rgb[0] * (1 - a) + gray * a),
    Math.round(rgb[1] * (1 - a) + gray * a),
    Math.round(rgb[2] * (1 - a) + gray * a),
  ];
}

/** B.4.1 — tiered anchored wall body color (not flat red blocks). */
export function resolveAnchoredWallBodyRgb(
  intensity: number,
  tier: AnchoredWallVisualTier,
  lifecycle:
    | "new"
    | "persistent"
    | "reinforced"
    | "pulling"
    | "fading"
    | "stale"
    | "touched",
): [number, number, number] {
  let vi = clamp01(intensity);
  if (tier === "weak") vi = Math.min(0.38, Math.max(0.16, vi * 0.82));
  else if (tier === "medium") vi = Math.min(0.52, Math.max(0.24, vi * 0.9));
  else if (tier === "far") vi = Math.min(0.62, vi * 0.88);

  let rgb = intensityToPassiveLiquidityRgb(vi);
  if (tier === "medium" || tier === "weak") {
    rgb = intensityToPassiveLiquidityRgb(Math.min(0.48, vi + 0.06));
  }
  if (tier === "far") rgb = desaturateRgb(rgb, 0.28);
  if (lifecycle === "pulling" || lifecycle === "fading") {
    rgb = desaturateRgb(rgb, 0.22);
  }
  if (lifecycle === "stale") rgb = desaturateRgb(rgb, 0.45);
  return rgb;
}

/** B.4.1 — soft outer glow (cooler / wider halo). */
export function resolveAnchoredWallGlowRgb(
  bodyRgb: [number, number, number],
  intensity: number,
): [number, number, number] {
  const cool: [number, number, number] = [
    Math.min(255, bodyRgb[0] * 0.55 + 18),
    Math.min(255, bodyRgb[1] * 0.72 + 28),
    Math.min(255, bodyRgb[2] * 0.95 + 36),
  ];
  const t = clamp01(intensity);
  return lerpRgb(bodyRgb, cool, 0.35 + t * 0.2);
}

/** B.4.1 — warm inner core for reinforced/dominant walls. */
export function resolveAnchoredWallCoreRgb(intensity: number): [number, number, number] {
  const coreI = resolveOrganicWallCoreIntensity(intensity);
  return intensityToPassiveLiquidityRgb(Math.min(0.98, coreI + 0.04));
}

/** B.4.1 — lifecycle alpha multiplier for integrated wall layers. */
export function resolveAnchoredWallLifecycleAlphaMul(
  lifecycle:
    | "new"
    | "persistent"
    | "reinforced"
    | "pulling"
    | "fading"
    | "stale"
    | "touched",
  layer: "historical" | "active" | "projection",
): number {
  switch (lifecycle) {
    case "new":
      return layer === "projection" ? 0.78 : 0.62;
    case "persistent":
      return layer === "projection" ? 0.92 : 0.84;
    case "reinforced":
      return layer === "projection" ? 1.02 : 0.94;
    case "pulling":
      return layer === "projection" ? 0.62 : 0.58;
    case "fading":
      return layer === "historical" ? 0.42 : 0.28;
    case "stale":
      return 0.22;
    case "touched":
      return layer === "projection" ? 0.86 : 0.78;
    default:
      return 0.8;
  }
}
