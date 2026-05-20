import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { BookLevel, BookmapState, HeatmapCell } from "@/types/bookmapState";
import { bucketPrice } from "./domLadderUtils";
import {
  confluenceMinStrengthThreshold,
  confluenceTierMeetsMin,
  maxConfluenceBucketDistance,
  proximityScoreFromBucketDistance,
  tierFromConfluenceScore,
  type BookmapConfluencePrefs,
  type ConfluenceTier,
} from "./bookmapConfluenceConfig";

export interface PassiveConfluenceLevel {
  /** Spot passive bucket (label Y position). */
  priceBucket: number;
  /** Matched perp passive bucket (may differ by 1 bucket in macro). */
  perpPriceBucket: number;
  side: "bid" | "ask";
  spotSize: number;
  perpSize: number;
  spotStrength: number;
  perpStrength: number;
  confluenceScore: number;
  tier: ConfluenceTier;
  label: string;
}

export type PassiveConfluenceDebugStats = {
  candidateConfluences: number;
  rejectedBySide: number;
  rejectedByStrength: number;
  rejectedByDistance: number;
  rejectedByMinTier: number;
  renderedConfluences: number;
  strong: number;
  major: number;
};

type SideBucketAgg = {
  priceBucket: number;
  side: "bid" | "ask";
  size: number;
  persistenceMs: number;
};

export type DetectPassiveConfluenceParams = {
  spotState: BookmapState;
  perpState: BookmapState;
  minPrice: number;
  maxPrice: number;
  heatmapBucketSize: number;
  domBucketSize: number;
  verticalMode: VerticalCompressionMode;
  prefs: BookmapConfluencePrefs;
  nowMs?: number;
};

export type PassiveConfluenceDetectResult = {
  levels: PassiveConfluenceLevel[];
  debug: PassiveConfluenceDebugStats;
};

export type PassiveConfluenceSummary = {
  total: number;
  visible: number;
  medium: number;
  strong: number;
  major: number;
  debug: PassiveConfluenceDebugStats;
};

function emptyDebug(): PassiveConfluenceDebugStats {
  return {
    candidateConfluences: 0,
    rejectedBySide: 0,
    rejectedByStrength: 0,
    rejectedByDistance: 0,
    rejectedByMinTier: 0,
    renderedConfluences: 0,
    strong: 0,
    major: 0,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function bucketKey(side: "bid" | "ask", priceBucket: number): string {
  return `${side}:${priceBucket}`;
}

function mergeBucket(
  map: Map<string, SideBucketAgg>,
  side: "bid" | "ask",
  price: number,
  size: number,
  step: number,
  persistenceMs: number,
) {
  if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return;
  const priceBucket = bucketPrice(price, step);
  const key = bucketKey(side, priceBucket);
  const prev = map.get(key);
  if (!prev) {
    map.set(key, { priceBucket, side, size, persistenceMs });
    return;
  }
  map.set(key, {
    priceBucket,
    side,
    size: Math.max(prev.size, size),
    persistenceMs: Math.max(prev.persistenceMs, persistenceMs),
  });
}

function ingestBookLevels(
  map: Map<string, SideBucketAgg>,
  levels: BookLevel[],
  minPrice: number,
  maxPrice: number,
  step: number,
  nowMs: number,
) {
  for (const level of levels) {
    if (level.price < minPrice || level.price > maxPrice) continue;
    const size = Math.max(level.maxSeenSize, level.size);
    const persistenceMs = Math.max(0, nowMs - level.firstSeenTs);
    mergeBucket(map, level.side, level.price, size, step, persistenceMs);
  }
}

function ingestHeatmapCells(
  map: Map<string, SideBucketAgg>,
  cells: HeatmapCell[],
  minPrice: number,
  maxPrice: number,
  step: number,
  nowMs: number,
) {
  for (const cell of cells) {
    if (cell.price < minPrice || cell.price > maxPrice) continue;
    const size = Math.max(cell.maxSizeInBucket, cell.size, cell.lastSizeInBucket);
    if (size <= 0) continue;
    const persistenceMs = Math.max(0, nowMs - (cell.lastUpdateTs || nowMs));
    mergeBucket(map, cell.side, cell.price, size, step, persistenceMs);
  }
}

function buildMarketBuckets(
  state: BookmapState,
  minPrice: number,
  maxPrice: number,
  heatmapBucketSize: number,
  nowMs: number,
): Map<string, SideBucketAgg> {
  const map = new Map<string, SideBucketAgg>();
  const step = Math.max(1, heatmapBucketSize);
  ingestBookLevels(map, state.bids, minPrice, maxPrice, step, nowMs);
  ingestBookLevels(map, state.asks, minPrice, maxPrice, step, nowMs);
  ingestHeatmapCells(map, state.heatmapCells, minPrice, maxPrice, step, nowMs);

  for (const wall of [
    ...state.importantWalls,
    ...state.structuralWalls,
    ...state.majorWalls,
  ]) {
    if (wall.price < minPrice || wall.price > maxPrice) continue;
    const size = Math.max(wall.maxSeenSize, wall.size);
    const persistenceMs = Math.max(0, nowMs - wall.firstSeenTs);
    mergeBucket(map, wall.side, wall.price, size, step, persistenceMs);
  }

  return map;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function normalizeStrength(size: number, p95: number): number {
  if (p95 <= 0) return 0;
  return clamp01(size / p95);
}

function bucketDistance(a: number, b: number, step: number): number {
  return Math.round(Math.abs(a - b) / Math.max(1, step));
}

function persistenceScore(spotMs: number, perpMs: number): number {
  const minMs = Math.min(spotMs, perpMs);
  if (minMs >= 120_000) return 1;
  if (minMs >= 60_000) return 0.85;
  if (minMs >= 15_000) return 0.65;
  if (minMs > 0) return 0.5;
  return 0.5;
}

function formatConfluenceLabel(
  side: "bid" | "ask",
  spotSize: number,
  perpSize: number,
): string {
  const sideTag = side === "bid" ? "BID" : "ASK";
  return `S+P ${sideTag} ${Math.round(spotSize)}/${Math.round(perpSize)}`;
}

function strengthsForMarket(map: Map<string, SideBucketAgg>) {
  const sizes = [...map.values()].map((b) => b.size);
  const p95 = percentile(sizes, 0.95);
  const out = new Map<string, { strength: number; agg: SideBucketAgg }>();
  for (const [key, agg] of map) {
    out.set(key, {
      agg,
      strength: normalizeStrength(agg.size, p95),
    });
  }
  return out;
}

export function detectPassiveConfluence(
  params: DetectPassiveConfluenceParams,
): PassiveConfluenceDetectResult {
  const debug = emptyDebug();
  const {
    spotState,
    perpState,
    minPrice,
    maxPrice,
    heatmapBucketSize,
    verticalMode,
    prefs,
    nowMs = Date.now(),
  } = params;

  if (!prefs.passiveConfluenceEnabled) {
    return { levels: [], debug };
  }

  const step = Math.max(1, heatmapBucketSize);
  const spotMap = buildMarketBuckets(spotState, minPrice, maxPrice, heatmapBucketSize, nowMs);
  const perpMap = buildMarketBuckets(perpState, minPrice, maxPrice, heatmapBucketSize, nowMs);

  if (spotMap.size === 0 || perpMap.size === 0) {
    return { levels: [], debug };
  }

  const spotStrengths = strengthsForMarket(spotMap);
  const perpStrengths = strengthsForMarket(perpMap);
  const minStrength = confluenceMinStrengthThreshold(verticalMode, prefs.sensitivity);
  const maxBuckets = maxConfluenceBucketDistance(verticalMode);

  const perpBySide = { bid: [] as SideBucketAgg[], ask: [] as SideBucketAgg[] };
  for (const agg of perpMap.values()) {
    perpBySide[agg.side].push(agg);
  }

  const results: PassiveConfluenceLevel[] = [];
  const usedPerpKeys = new Set<string>();

  for (const [, spotEntry] of spotStrengths) {
    const { agg: spotAgg } = spotEntry;
    const spotStr = spotEntry.strength;

    let bestPerp: {
      agg: SideBucketAgg;
      strength: number;
      proximity: number;
      bucketDist: number;
    } | null = null;

    for (const perpAgg of perpBySide[spotAgg.side]) {
      const bucketDist = bucketDistance(spotAgg.priceBucket, perpAgg.priceBucket, step);
      if (bucketDist > maxBuckets) continue;

      const proximity = proximityScoreFromBucketDistance(bucketDist);
      if (proximity <= 0) continue;

      const perpKey = bucketKey(perpAgg.side, perpAgg.priceBucket);
      const perpStr = perpStrengths.get(perpKey)?.strength ?? 0;
      const rank = perpStr * 0.65 + proximity * 0.35;
      const bestRank = bestPerp
        ? bestPerp.strength * 0.65 + bestPerp.proximity * 0.35
        : -1;
      if (rank > bestRank) {
        bestPerp = { agg: perpAgg, strength: perpStr, proximity, bucketDist };
      }
    }

    if (!bestPerp) {
      debug.rejectedByDistance += 1;
      continue;
    }

    debug.candidateConfluences += 1;

    if (spotStr < minStrength || bestPerp.strength < minStrength) {
      debug.rejectedByStrength += 1;
      continue;
    }

    const perpKey = bucketKey(bestPerp.agg.side, bestPerp.agg.priceBucket);
    const pairKey = `${bucketKey(spotAgg.side, spotAgg.priceBucket)}|${perpKey}`;
    if (usedPerpKeys.has(pairKey)) continue;
    usedPerpKeys.add(pairKey);

    const persist = persistenceScore(spotAgg.persistenceMs, bestPerp.agg.persistenceMs);
    const score = clamp01(
      spotStr * 0.4 +
        bestPerp.strength * 0.4 +
        persist * 0.15 +
        bestPerp.proximity * 0.05,
    );
    const tier = tierFromConfluenceScore(score);

    if (!confluenceTierMeetsMin(tier, prefs.minDisplayTier)) {
      debug.rejectedByMinTier += 1;
    }

    results.push({
      priceBucket: spotAgg.priceBucket,
      perpPriceBucket: bestPerp.agg.priceBucket,
      side: spotAgg.side,
      spotSize: spotAgg.size,
      perpSize: bestPerp.agg.size,
      spotStrength: spotStr,
      perpStrength: bestPerp.strength,
      confluenceScore: score,
      tier,
      label: formatConfluenceLabel(spotAgg.side, spotAgg.size, bestPerp.agg.size),
    });
  }

  const visible = results.filter((l) =>
    confluenceTierMeetsMin(l.tier, prefs.minDisplayTier),
  );
  debug.renderedConfluences = visible.length;
  debug.strong = visible.filter((l) => l.tier === "strong").length;
  debug.major = visible.filter((l) => l.tier === "major").length;

  return {
    levels: results.sort((a, b) => b.confluenceScore - a.confluenceScore),
    debug,
  };
}

export function summarizePassiveConfluence(
  levels: PassiveConfluenceLevel[],
  minDisplayTier: BookmapConfluencePrefs["minDisplayTier"],
  debug: PassiveConfluenceDebugStats = emptyDebug(),
): PassiveConfluenceSummary {
  const visible = levels.filter((l) => confluenceTierMeetsMin(l.tier, minDisplayTier));
  return {
    total: levels.length,
    visible: visible.length,
    medium: levels.filter((l) => l.tier === "medium").length,
    strong: levels.filter((l) => l.tier === "strong").length,
    major: levels.filter((l) => l.tier === "major").length,
    debug,
  };
}
