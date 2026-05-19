import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";

export type HeatmapBandTier =
  | "low"
  | "medium"
  | "important"
  | "structural"
  | "major";

export type HeatmapBandSide = "bid" | "ask";

export interface HeatmapBand {
  price: number;
  side: HeatmapBandSide;
  startTime: number;
  endTime: number;
  size: number;
  maxSize: number;
  /** Legacy rank from preparation — use visualIntensity for rendering. */
  intensity: number;
  /** Macro-adaptive 0–1 score used for color and alpha. */
  visualIntensity: number;
  persistenceMs: number;
  tier: HeatmapBandTier;
  stale?: boolean;
}

const TIER_RANK: Record<HeatmapBandTier, number> = {
  low: 0,
  medium: 1,
  important: 2,
  structural: 3,
  major: 4,
};

export function tierFromMaxSize(maxSize: number): HeatmapBandTier {
  if (maxSize >= WALL_MAJOR_BTC) return "major";
  if (maxSize >= WALL_STRUCTURAL_BTC) return "structural";
  if (maxSize >= WALL_IMPORTANT_BTC) return "important";
  return "low";
}

export function refineTierFromIntensity(
  base: HeatmapBandTier,
  intensity: number,
  maxSize: number,
): HeatmapBandTier {
  const sizeTier = tierFromMaxSize(maxSize);
  if (TIER_RANK[sizeTier] >= TIER_RANK.important) return sizeTier;
  if (intensity >= 0.42) return "medium";
  return base === "low" ? "low" : base;
}

export function higherBandTier(a: HeatmapBandTier, b: HeatmapBandTier): HeatmapBandTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function isWallTier(tier: HeatmapBandTier): boolean {
  return tier === "important" || tier === "structural" || tier === "major";
}
