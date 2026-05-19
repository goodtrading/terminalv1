import type { HeatmapBand } from "@/components/flows/bookmapBandTypes";
import { isWallTier } from "@/components/flows/bookmapBandTypes";

/**
 * Intensity-first Bookmap palette (side does not dominate hue).
 * very low → navy, low → blue, medium → cyan, medium-high → yellow, high → orange, extreme → red
 */

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

/** Unified heat ramp — same for bid and ask. */
export function intensityToRgb(intensity: number): [number, number, number] {
  const t = clamp01(intensity);

  if (t < 0.12) {
    return lerpRgb([4, 8, 18], [12, 28, 58], t / 0.12);
  }
  if (t < 0.32) {
    return lerpRgb([12, 28, 58], [22, 72, 128], (t - 0.12) / 0.2);
  }
  if (t < 0.52) {
    return lerpRgb([22, 72, 128], [34, 175, 168], (t - 0.32) / 0.2);
  }
  if (t < 0.72) {
    return lerpRgb([34, 175, 168], [250, 204, 21], (t - 0.52) / 0.2);
  }
  if (t < 0.88) {
    return lerpRgb([250, 204, 21], [255, 140, 40], (t - 0.72) / 0.16);
  }
  return lerpRgb([255, 140, 40], [235, 45, 45], (t - 0.88) / 0.12);
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

/**
 * Alpha ramps slowly for low intensity; high opacity only for dominant liquidity.
 */
export function alphaForVisualIntensity(intensity: number, stale = false): number {
  const t = clamp01(intensity);
  let a: number;
  if (t < 0.15) a = 0.08 + t * 0.35;
  else if (t < 0.4) a = 0.13 + t * 0.4;
  else if (t < 0.7) a = 0.28 + t * 0.45;
  else a = 0.5 + t * 0.42;
  if (stale) a *= 0.78;
  return Math.min(0.92, a);
}

export function getBookmapBandFill(band: HeatmapBand, alphaMul = 1): string {
  const intensity = band.visualIntensity ?? band.intensity;
  let rgb = intensityToRgb(intensity);
  rgb = applySubtleSideTint(rgb, band.side, intensity);
  const a = alphaForVisualIntensity(intensity, band.stale) * alphaMul;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function getBookmapBandStroke(band: HeatmapBand): string | null {
  const intensity = band.visualIntensity ?? band.intensity;
  if (!isWallTier(band.tier) && intensity < 0.72) return null;
  const [r, g, b] = intensityToRgb(intensity);
  const a = intensity >= 0.85 ? 0.45 : 0.28;
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
