import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";

export type ConfluenceTier = "weak" | "medium" | "strong" | "major";

export type ConfluenceMinDisplayTier = "medium" | "strong" | "major";

export type ConfluenceSensitivity = "low" | "normal" | "high";

export type ConfluenceVisualOpacity = "low" | "normal" | "high";

export type BookmapConfluencePrefs = {
  passiveConfluenceEnabled: boolean;
  minDisplayTier: ConfluenceMinDisplayTier;
  sensitivity: ConfluenceSensitivity;
  showConfluenceLabels: boolean;
  visualOpacity: ConfluenceVisualOpacity;
};

export const DEFAULT_BOOKMAP_CONFLUENCE_PREFS: BookmapConfluencePrefs = {
  passiveConfluenceEnabled: true,
  minDisplayTier: "strong",
  sensitivity: "normal",
  showConfluenceLabels: true,
  visualOpacity: "normal",
};

/** Multiplier applied to confluence band tint alphas. */
export const CONFLUENCE_VISUAL_OPACITY_MUL: Record<ConfluenceVisualOpacity, number> = {
  low: 0.72,
  normal: 1,
  high: 1.28,
};

const TIER_RANK: Record<ConfluenceTier, number> = {
  weak: 0,
  medium: 1,
  strong: 2,
  major: 3,
};

const MIN_DISPLAY_RANK: Record<ConfluenceMinDisplayTier, number> = {
  medium: 1,
  strong: 2,
  major: 3,
};

const BASE_MIN_STRENGTH: Record<VerticalCompressionMode, number> = {
  micro: 0.7,
  intraday: 0.6,
  macro: 0.55,
  fullDepth: 0.55,
};

export function tierFromConfluenceScore(score: number): ConfluenceTier {
  if (score >= 0.88) return "major";
  if (score >= 0.75) return "strong";
  if (score >= 0.6) return "medium";
  if (score >= 0.45) return "weak";
  return "weak";
}

export function confluenceTierMeetsMin(
  tier: ConfluenceTier,
  minDisplay: ConfluenceMinDisplayTier,
): boolean {
  return TIER_RANK[tier] >= MIN_DISPLAY_RANK[minDisplay];
}

/** Both spot and perp must meet this normalized strength (p95-relative). */
export function confluenceMinStrengthThreshold(
  verticalMode: VerticalCompressionMode,
  sensitivity: ConfluenceSensitivity,
): number {
  const base = BASE_MIN_STRENGTH[verticalMode] ?? 0.6;
  const adj =
    sensitivity === "low" ? 0.1 : sensitivity === "high" ? -0.1 : 0;
  return Math.max(0.45, base + adj);
}

export function maxConfluenceBucketDistance(
  verticalMode: VerticalCompressionMode,
): number {
  switch (verticalMode) {
    case "micro":
    case "intraday":
      return 1;
    case "macro":
    case "fullDepth":
    default:
      return 2;
  }
}

export function proximityScoreFromBucketDistance(bucketDist: number): number {
  if (bucketDist === 0) return 1;
  if (bucketDist === 1) return 0.7;
  if (bucketDist === 2) return 0.4;
  return 0;
}

export function parseConfluenceVisualOpacity(value: unknown): ConfluenceVisualOpacity {
  const s = String(value ?? "").toLowerCase();
  if (s === "low") return "low";
  if (s === "high") return "high";
  return "normal";
}
