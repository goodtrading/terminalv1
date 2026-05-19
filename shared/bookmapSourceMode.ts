import type { BookmapMarketSource } from "./bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET } from "./bookmapMarket";

/** Visual source mode for Composite Bookmap Phase 2+. */
export type BookmapSourceMode = "spot" | "perp" | "both";

export const DEFAULT_BOOKMAP_SOURCE_MODE: BookmapSourceMode = "spot";

export const PERP_OVERLAY_OPACITY_OPTIONS = [20, 35, 50, 70] as const;
export type PerpOverlayOpacityPct = (typeof PERP_OVERLAY_OPACITY_OPTIONS)[number];

export const DEFAULT_PERP_OVERLAY_OPACITY_PCT: PerpOverlayOpacityPct = 35;

export function parseBookmapSourceMode(
  value: unknown,
  fallback: BookmapSourceMode = DEFAULT_BOOKMAP_SOURCE_MODE,
): BookmapSourceMode {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "both" || s === "composite") return "both";
  if (s === "perp" || s === "futures") return "perp";
  if (s === "spot") return "spot";
  return fallback;
}

/** DOM / trade sub-source when `sourceMode === "both"`. */
export function resolveActiveMarket(
  sourceMode: BookmapSourceMode,
  subSource: BookmapMarketSource,
): BookmapMarketSource {
  if (sourceMode === "both") return subSource;
  return sourceMode === "perp" ? "perp" : "spot";
}
