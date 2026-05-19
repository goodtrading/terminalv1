import type { HeatmapBand } from "@/components/flows/bookmapBandTypes";

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * Monochrome ghost overlay for perp liquidity in Both mode.
 * Does not use bid/ask hue — intensity maps to blue-gray → white.
 */
export function getBookmapPerpOverlayFill(
  band: HeatmapBand,
  globalOpacityMul: number,
): string {
  const intensity = clamp01(band.visualIntensity ?? band.intensity);
  const stale = band.stale ?? false;

  let r: number;
  let g: number;
  let b: number;
  let baseA: number;

  if (intensity < 0.12) {
    r = 28;
    g = 32;
    b = 40;
    baseA = 0.02;
  } else if (intensity < 0.4) {
    const t = (intensity - 0.12) / 0.28;
    r = Math.round(28 + t * (190 - 28));
    g = Math.round(32 + t * (210 - 32));
    b = Math.round(40 + t * (230 - 40));
    baseA = 0.04 + t * 0.14;
  } else if (intensity < 0.72) {
    const t = (intensity - 0.4) / 0.32;
    r = Math.round(190 + t * (220 - 190));
    g = Math.round(210 + t * (235 - 210));
    b = Math.round(230 + t * (255 - 230));
    baseA = 0.18 + t * 0.14;
  } else {
    const t = (intensity - 0.72) / 0.28;
    r = Math.round(220 + t * (255 - 220));
    g = Math.round(235 + t * (255 - 235));
    b = 255;
    baseA = 0.32 + t * 0.13;
  }

  if (stale) baseA *= 0.75;
  const a = Math.min(0.55, baseA * clamp01(globalOpacityMul));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
