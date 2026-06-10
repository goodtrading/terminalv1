/**
 * FASE 2 — Bookmap liquidity layer responsibilities (single source of truth per layer).
 *
 * 1. historicalTexture
 *    - Source: heatmapCells / materializedRestingLiquidity (server sampler + prepare merge).
 *    - Render: time <= dataEndTime only (hard clip at render).
 *    - Role: historical memory of resting liquidity.
 *
 * 2. pulledFootprint
 *    - Source: closedRelevantHistoryBand segments inside historical texture queue.
 *    - Render: time <= dataEndTime only (same clip as historicalTexture).
 *    - Role: pulled / closed L2 footprint near the data edge.
 *
 * 3. activeDomBands
 *    - Source: current state.bids / state.asks (selectActiveLiveDomLevels).
 *    - Render: dataEndTime → visibleEndTime, strictDataEdgeStart = true.
 *    - Role: primary live DOM in micro mode.
 *
 * 4. liveProjection
 *    - Source: current state.bids / state.asks.
 *    - Render: dataEndTime → visibleEndTime; strict start when activeDomBands active.
 *    - Role: primary live projection in intraday/wide; never duplicates activeDomBands.
 *
 * 5. wallBands
 *    - Source: wall tracker / structural levels (engine.bands).
 *    - Render: historical span + edge stripe to dataEndTime; no right-side future extension.
 *    - Role: structural emphasis only; must not duplicate normal live DOM buckets at the seam.
 *
 * FASE 3 — seam visual continuity (no temporal overlap):
 * activeDomBands / liveProjection use buildLiquidityContinuityPlan() + resolveLiveDomContinuationVisual()
 * so live buckets inherit historical intensity/alpha base from historicalEdgeBuckets near dataEndTime.
 */

import {
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
  BOOKMAP_ENGINE_BUCKET_MS,
} from "@/lib/bookmapEngineConfig";
import { bucketPrice } from "./domLadderUtils";
import type { HeatmapBand } from "./bookmapBandTypes";
import { isWallTier } from "./bookmapBandTypes";
import type { PreparedLiveProjectionLevel } from "./bookmapEnginePrepare";

export const BOOKMAP_LAYER_HISTORICAL_MAX_TIME = "dataEndTime" as const;
export const BOOKMAP_LAYER_LIVE_MIN_TIME = "dataEndTime" as const;

export function liveDomBucketKey(
  side: string,
  price: number,
  priceBucketUsd: number,
): string {
  return `${side}:${bucketPrice(price, priceBucketUsd)}`;
}

export function buildLiveDomBucketKeySet(
  levels: PreparedLiveProjectionLevel[],
  priceBucketUsd: number,
): Set<string> {
  const keys = new Set<string>();
  for (const level of levels) {
    keys.add(liveDomBucketKey(level.side, level.price, priceBucketUsd));
  }
  return keys;
}

/** Prepare/render dedup: liveProjection must not repeat activeDomBands buckets. */
export function dedupeLiveProjectionAgainstActiveDom(
  liveProjection: PreparedLiveProjectionLevel[],
  activeDomBands: PreparedLiveProjectionLevel[],
  priceBucketUsd: number,
): {
  deduped: PreparedLiveProjectionLevel[];
  beforeOverlapCount: number;
  afterOverlapCount: number;
} {
  const activeDomKeys = buildLiveDomBucketKeySet(activeDomBands, priceBucketUsd);
  let beforeOverlapCount = 0;
  for (const level of liveProjection) {
    if (activeDomKeys.has(liveDomBucketKey(level.side, level.price, priceBucketUsd))) {
      beforeOverlapCount += 1;
    }
  }
  const deduped = liveProjection.filter(
    (level) =>
      !activeDomKeys.has(liveDomBucketKey(level.side, level.price, priceBucketUsd)),
  );
  return { deduped, beforeOverlapCount, afterOverlapCount: 0 };
}

export function isStructuralWallEmphasis(band: HeatmapBand): boolean {
  if (band.tier === "major" && band.maxSize >= WALL_MAJOR_BTC) return true;
  if (band.tier === "structural" && band.maxSize >= WALL_STRUCTURAL_BTC) {
    return true;
  }
  return false;
}

/**
 * Wall bands at the live seam: keep only structural/major emphasis.
 * Normal DOM buckets are owned by activeDomBands / liveProjection.
 */
export function filterWallBandsForLiveSeam(
  bands: HeatmapBand[],
  activeDomKeys: Set<string>,
  liveProjectionKeys: Set<string>,
): {
  filtered: HeatmapBand[];
  beforeActiveDomOverlap: number;
  beforeLiveOverlap: number;
  afterActiveDomOverlap: number;
  afterLiveOverlap: number;
} {
  let beforeActiveDomOverlap = 0;
  let beforeLiveOverlap = 0;

  for (const band of bands) {
    const key = `${band.side}:${band.price}`;
    if (activeDomKeys.has(key)) beforeActiveDomOverlap += 1;
    else if (liveProjectionKeys.has(key)) beforeLiveOverlap += 1;
  }

  const filtered = bands.filter((band) => {
    const key = `${band.side}:${band.price}`;
    const overlapsLive =
      activeDomKeys.has(key) || liveProjectionKeys.has(key);
    if (!overlapsLive) return true;
    if (!isStructuralWallEmphasis(band)) return false;
    if (band.tier === "major") {
      return (
        band.persistenceMs >= 1_500 ||
        band.maxSize >= WALL_MAJOR_BTC * 1.2
      );
    }
    if (band.tier === "structural") {
      return (
        band.persistenceMs >= 3_000 ||
        band.maxSize >= WALL_STRUCTURAL_BTC * 1.15
      );
    }
    return false;
  });

  return {
    filtered,
    beforeActiveDomOverlap,
    beforeLiveOverlap,
    afterActiveDomOverlap: 0,
    afterLiveOverlap: 0,
  };
}

/** Clip historical span render to dataEndTime — model data unchanged, render only. */
export function clipHistoricalSpanToDataEdge(
  spanStart: number,
  spanEnd: number,
  dataEndTime: number,
): {
  clippedStart: number;
  clippedEnd: number;
  wouldExtendPastEdge: boolean;
} | null {
  const wouldExtendPastEdge = spanEnd > dataEndTime;
  const clippedEnd = Math.min(spanEnd, dataEndTime);
  if (clippedEnd <= spanStart) return null;
  return { clippedStart: spanStart, clippedEnd, wouldExtendPastEdge };
}

export function resolveLiveProjectionStrictStart(
  hasActiveDomBands: boolean,
  microScalpMode: boolean,
): boolean {
  if (hasActiveDomBands) return true;
  return microScalpMode;
}

/** Live walls stop at dataEndTime — never extend into right-side future. */
export function resolveWallBandRenderEndTime(
  band: HeatmapBand,
  dataEndTime: number,
): number {
  if (band.stale) return Math.min(band.endTime, dataEndTime);
  if (!isWallTier(band.tier)) return Math.min(band.endTime, dataEndTime);
  const liveSlack = BOOKMAP_ENGINE_BUCKET_MS * 2;
  if (band.endTime >= dataEndTime - liveSlack) {
    return dataEndTime;
  }
  return Math.min(band.endTime, dataEndTime);
}
