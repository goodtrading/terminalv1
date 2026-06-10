/**
 * FASE 4 — Resting limit order lifecycle (client-side cache + historical materialization).
 *
 * Tracks DOM levels as persistent objects with smoothing, historical writes,
 * footprint retention, peak intensity, and pull/spoof detection.
 */

import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { BookLevel, HeatmapCell } from "@/types/bookmapState";
import { bucketPrice } from "./domLadderUtils";
import type { LiveDomBookLevel } from "./bookmapLiveDomPriority";
import type { RestingLiquidityWriteConfig } from "./bookmapRestingLiquidity";
import {
  buildLifecycleHistoricalCellMeta,
  clearLifecycleTextureIntegrationFrame,
  registerLifecycleHistoricalCellMeta,
  recordLifecycleWriteDecimationStats,
  scaleLifecycleAlphaForBaseDensity,
  BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER,
} from "./bookmapLifecycleTextureIntegration";

export type LiquidityLifecycleKey = `${"bid" | "ask"}:${number}`;

export type LiquidityLifecycleLevel = {
  key: LiquidityLifecycleKey;
  side: "bid" | "ask";
  price: number;
  bucketPrice: number;

  rawSize: number;
  smoothedSize: number;
  peakSize: number;

  firstSeenAt: number;
  lastSeenAt: number;
  lastUpdatedAt: number;
  disappearedAt?: number;

  active: boolean;
  wasActive: boolean;
  pulled: boolean;
  refilled: boolean;

  activeDurationMs: number;
  inactiveDurationMs: number;

  historicalWritten: boolean;
  historicalWriteCount: number;
  lastHistoricalWriteAt?: number;

  visualIntensity: number;
  visualAlpha: number;
  peakVisualIntensity: number;
  peakVisualAlpha: number;

  nearTick: boolean;
  topDomCandidate: boolean;
  wallCandidate: boolean;
  structuralCandidate: boolean;

  shouldWriteHistorical: boolean;
  shouldLeaveFootprint: boolean;

  pullingCandidate: boolean;
  spoofingCandidate: boolean;

  /** Previous frame raw/smoothed size for pull detection. */
  previousFrameSize: number;
};

export type LiquidityLifecycleFrameStats = {
  newLevelsThisFrame: number;
  updatedLevelsThisFrame: number;
  disappearedLevelsThisFrame: number;
  removedExpiredLevelsThisFrame: number;
  historicalWriteCandidateCount: number;
  historicalWriteCount: number;
  skippedHistoricalWriteCount: number;
};

export type TopLifecycleLevelAuditRow = {
  side: "bid" | "ask";
  price: number;
  bucketPrice: number;
  rawSize: number;
  smoothedSize: number;
  peakSize: number;
  active: boolean;
  activeDurationMs: number;
  pulled: boolean;
  refilled: boolean;
  historicalWritten: boolean;
  historicalWriteCount: number;
  shouldWriteHistorical: boolean;
  shouldLeaveFootprint: boolean;
  visualIntensity: number;
  peakVisualIntensity: number;
};

export type BookmapLiquidityLifecycleAudit = {
  market: string;
  sourceMode: string;
  domSource: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;

  lifecycleCacheSize: number;
  activeLifecycleCount: number;
  inactiveLifecycleCount: number;
  pulledLifecycleCount: number;
  footprintLifecycleCount: number;

  newLevelsThisFrame: number;
  updatedLevelsThisFrame: number;
  disappearedLevelsThisFrame: number;
  removedExpiredLevelsThisFrame: number;

  historicalWriteCandidateCount: number;
  historicalWriteCount: number;
  skippedHistoricalWriteCount: number;

  topDomLifecycleCount: number;
  nearTickLifecycleCount: number;
  wallLifecycleCount: number;

  pullingCandidateCount: number;
  spoofingCandidateCount: number;
  refilledLevelCount: number;

  avgActiveDurationMs: number;
  medianActiveDurationMs: number;
  avgVisibleDurationMs: number;
  medianVisibleDurationMs: number;

  lifecycleHistoricalWriteOk: boolean;
  lifecycleFootprintOk: boolean;
  lifecycleStabilityOk: boolean;

  topLifecycleLevels: TopLifecycleLevelAuditRow[];
};

const lifecycleCache = new Map<LiquidityLifecycleKey, LiquidityLifecycleLevel>();
let lastFrameStats: LiquidityLifecycleFrameStats = emptyFrameStats();

const FOOTPRINT_RETENTION_MS = 90_000;
const CACHE_EXPIRE_MS = 180_000;
const NEAR_TICK_TOP_PER_SIDE = 3;
const MICRO_WRITE_DENSITY_SOFT = 24;
const MICRO_WRITE_DENSITY_HARD = 40;

export type LifecycleWriteAction = "write" | "trace" | "skip";

export function resolveEffectiveLifecycleWriteConfig(
  config: RestingLiquidityWriteConfig,
): RestingLiquidityWriteConfig {
  if (!BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER || config.mode !== "micro") {
    return config;
  }
  return {
    ...config,
    near035MinBtc: 2,
    viewportMinBtc: 8,
    topPerSide: 6,
    wallMinBtc: 50,
  };
}

function emptyFrameStats(): LiquidityLifecycleFrameStats {
  return {
    newLevelsThisFrame: 0,
    updatedLevelsThisFrame: 0,
    disappearedLevelsThisFrame: 0,
    removedExpiredLevelsThisFrame: 0,
    historicalWriteCandidateCount: 0,
    historicalWriteCount: 0,
    skippedHistoricalWriteCount: 0,
  };
}

export function getLiquidityLifecycleCache(): ReadonlyMap<
  LiquidityLifecycleKey,
  LiquidityLifecycleLevel
> {
  return lifecycleCache;
}

export function getLiquidityLifecycleLastFrameStats(): LiquidityLifecycleFrameStats {
  return lastFrameStats;
}

export function lifecycleKeyFrom(
  side: "bid" | "ask",
  bucketPrice: number,
): LiquidityLifecycleKey {
  return `${side}:${bucketPrice}`;
}

function pctFromMid(price: number, mid: number): number {
  if (mid <= 0) return 100;
  return (Math.abs(price - mid) / mid) * 100;
}

export function resolveLifecycleGapMs(
  verticalMode?: VerticalCompressionMode | string,
): number {
  const mode = (verticalMode ?? "intraday").toString().toLowerCase();
  if (mode === "micro" || mode.includes("micro")) return 2_200;
  if (mode === "wide" || mode.includes("wide")) return 10_000;
  return 5_000;
}

export function smoothLifecycleSize(
  previousSmoothed: number,
  rawSize: number,
): number {
  if (rawSize <= 0) {
    if (previousSmoothed <= 0) return 0;
    return previousSmoothed * 0.88;
  }
  if (previousSmoothed <= 0) return rawSize;
  if (rawSize > previousSmoothed * 1.8) {
    return previousSmoothed * 0.35 + rawSize * 0.65;
  }
  if (rawSize < previousSmoothed * 0.5) {
    return previousSmoothed * 0.82 + rawSize * 0.18;
  }
  return previousSmoothed * 0.65 + rawSize * 0.35;
}

function computeVisualFromSize(
  smoothedSize: number,
  peakSize: number,
  viewportMaxSize: number,
): { intensity: number; alpha: number } {
  const ref = Math.max(smoothedSize, peakSize * 0.88);
  const denom = Math.max(1, viewportMaxSize, WALL_IMPORTANT_BTC);
  const intensity = Math.max(0.06, Math.min(1, ref / denom));
  const alpha = Math.max(0.12, Math.min(0.68, 0.18 + intensity * 0.5));
  return { intensity, alpha };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function selectTopBySmoothedSize(
  levels: Array<{ side: "bid" | "ask"; bucketPrice: number; smoothedSize: number }>,
  side: "bid" | "ask",
  n: number,
): Set<number> {
  return new Set(
    levels
      .filter((l) => l.side === side)
      .sort((a, b) => b.smoothedSize - a.smoothedSize)
      .slice(0, n)
      .map((l) => l.bucketPrice),
  );
}

function selectNearTickTopPerSide(
  levels: LiveDomBookLevel[],
  midPrice: number | null,
  perSide: number,
  bucketUsd: number,
  nearPct: number,
): Set<string> {
  if (midPrice == null || midPrice <= 0) return new Set();
  const keys = new Set<string>();
  for (const side of ["bid", "ask"] as const) {
    const top = levels
      .filter(
        (l) =>
          l.side === side &&
          l.size > 0 &&
          pctFromMid(l.price, midPrice) <= nearPct,
      )
      .sort((a, b) => b.size - a.size)
      .slice(0, perSide);
    for (const l of top) {
      keys.add(lifecycleKeyFrom(l.side, bucketPrice(l.price, bucketUsd)));
    }
  }
  return keys;
}

function isLifecycleWriteProtected(
  level: LiquidityLifecycleLevel,
  nearTickKeys: Set<string>,
  globalTopKeys: Set<LiquidityLifecycleKey>,
): boolean {
  if (
    level.structuralCandidate ||
    level.peakSize >= WALL_STRUCTURAL_BTC ||
    level.peakSize >= WALL_MAJOR_BTC
  ) {
    return true;
  }
  if (nearTickKeys.has(level.key)) return true;
  if (globalTopKeys.has(level.key)) return true;
  if (
    level.historicalWritten &&
    level.peakSize >= 5 &&
    level.activeDurationMs >= 2_500
  ) {
    return true;
  }
  return false;
}

function lifecycleWriteScore(level: LiquidityLifecycleLevel): number {
  return (
    level.peakSize * 0.55 +
    level.smoothedSize * 0.25 +
    level.activeDurationMs / 10_000 +
    (level.structuralCandidate ? 5 : 0) +
    (level.wallCandidate ? 2 : 0)
  );
}

export function resolveLifecycleWriteActions(
  levels: LiquidityLifecycleLevel[],
  config: RestingLiquidityWriteConfig,
  nearTickKeys: Set<string>,
): Map<LiquidityLifecycleKey, LifecycleWriteAction> {
  const actions = new Map<LiquidityLifecycleKey, LifecycleWriteAction>();
  const candidates = levels.filter(
    (l) => l.shouldWriteHistorical && (l.active || l.shouldLeaveFootprint),
  );

  const globalTopKeys = new Set(
    [...levels]
      .sort((a, b) => b.peakSize - a.peakSize)
      .slice(0, 6)
      .map((l) => l.key),
  );

  for (const level of candidates) {
    actions.set(level.key, "write");
  }

  if (
    !BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER ||
    config.mode !== "micro" ||
    candidates.length <= MICRO_WRITE_DENSITY_SOFT
  ) {
    recordLifecycleWriteDecimationStats({
      densityHigh: candidates.length > MICRO_WRITE_DENSITY_SOFT,
      decimatedCount: 0,
      skippedCount: 0,
      protectedCount: candidates.filter((l) =>
        isLifecycleWriteProtected(l, nearTickKeys, globalTopKeys),
      ).length,
    });
    return actions;
  }

  let decimated = 0;
  let skipped = 0;
  let protectedCount = 0;

  const sorted = [...candidates].sort(
    (a, b) => lifecycleWriteScore(b) - lifecycleWriteScore(a),
  );

  for (const level of sorted) {
    const protectedLevel = isLifecycleWriteProtected(
      level,
      nearTickKeys,
      globalTopKeys,
    );
    if (protectedLevel) {
      protectedCount += 1;
      actions.set(level.key, "write");
      continue;
    }

    if (candidates.length > MICRO_WRITE_DENSITY_HARD) {
      if (lifecycleWriteScore(level) < 1.2) {
        actions.set(level.key, "skip");
        skipped += 1;
        continue;
      }
    }

    if (candidates.length > MICRO_WRITE_DENSITY_SOFT) {
      actions.set(level.key, "trace");
      decimated += 1;
    }
  }

  recordLifecycleWriteDecimationStats({
    densityHigh: true,
    decimatedCount: decimated,
    skippedCount: skipped,
    protectedCount,
  });

  return actions;
}

export function resolveShouldWriteHistorical(opts: {
  level: LiquidityLifecycleLevel;
  config: RestingLiquidityWriteConfig;
  midPrice: number | null;
  minPrice: number;
  maxPrice: number;
  topBidBuckets: Set<number>;
  topAskBuckets: Set<number>;
  nearTickKeys: Set<string>;
}): boolean {
  const { level, config, midPrice, minPrice, maxPrice } = opts;
  if (level.bucketPrice < minPrice || level.bucketPrice > maxPrice) return false;

  const size = Math.max(level.smoothedSize, level.peakSize);
  if (size <= 0) return level.historicalWritten;

  const effective = resolveEffectiveLifecycleWriteConfig(config);

  if (
    level.structuralCandidate ||
    size >= WALL_MAJOR_BTC ||
    size >= WALL_STRUCTURAL_BTC
  ) {
    return true;
  }

  if (BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER && effective.mode === "micro") {
    const isTopDom =
      level.side === "bid"
        ? opts.topBidBuckets.has(level.bucketPrice)
        : opts.topAskBuckets.has(level.bucketPrice);

    if (size >= effective.wallMinBtc && level.wallCandidate) return true;
    if (isTopDom) return true;
    if (opts.nearTickKeys.has(level.key)) return true;

    if (midPrice != null && midPrice > 0) {
      const pct = pctFromMid(level.price, midPrice);
      if (pct <= 0.15 && size >= 2) return true;
      if (pct <= 0.35 && size >= 5) return true;
      if (
        level.nearTick &&
        pct <= 0.15 &&
        level.activeDurationMs >= 2_500 &&
        size >= 1.5
      ) {
        return true;
      }
    }

    if (size >= effective.viewportMinBtc) return true;
    if (level.activeDurationMs >= 5_000 && size >= 3) return true;
    return false;
  }

  if (level.structuralCandidate || level.wallCandidate) {
    if (size >= WALL_MAJOR_BTC || size >= WALL_STRUCTURAL_BTC) return true;
    if (size >= effective.wallMinBtc) return true;
  }

  const isTopDom =
    level.side === "bid"
      ? opts.topBidBuckets.has(level.bucketPrice)
      : opts.topAskBuckets.has(level.bucketPrice);
  if (isTopDom) return true;
  if (opts.nearTickKeys.has(level.key) && size >= 1) return true;

  if (midPrice != null && midPrice > 0) {
    const pct = pctFromMid(level.price, midPrice);
    if (pct <= 0.35 && size >= effective.near035MinBtc) return true;
    if (level.nearTick && size >= 1 && level.activeDurationMs >= 1_500) {
      return true;
    }
  }

  if (size >= effective.viewportMinBtc) return true;

  if (level.activeDurationMs >= 3_000 && size >= 2) return true;

  if (effective.mode !== "micro" && (isTopDom || level.wallCandidate)) {
    return true;
  }

  return false;
}

function detectPulling(
  prevSize: number,
  currentSize: number,
  dtMs: number,
  level: Pick<
    LiquidityLifecycleLevel,
    "nearTick" | "topDomCandidate" | "wallCandidate"
  >,
): boolean {
  if (prevSize < 2) return false;
  if (dtMs > 3_000) return false;
  if (currentSize > prevSize * 0.5) return false;
  return level.nearTick || level.topDomCandidate || level.wallCandidate;
}

function detectSpoofing(
  level: LiquidityLifecycleLevel,
  now: number,
  viewportMax: number,
): boolean {
  if (!level.nearTick && !level.topDomCandidate) return false;
  const lifeMs = now - level.firstSeenAt;
  if (lifeMs >= 5_000) return false;
  if (!level.active && level.disappearedAt != null) {
    const visibleMs = level.disappearedAt - level.firstSeenAt;
    if (visibleMs < 5_000 && level.peakSize >= viewportMax * 0.35) return true;
  }
  return false;
}

export type UpdateLiquidityLifecycleOpts = {
  bookLevels: LiveDomBookLevel[];
  now: number;
  midPrice: number | null;
  minPrice: number;
  maxPrice: number;
  config: RestingLiquidityWriteConfig;
  verticalMode?: VerticalCompressionMode | string;
  bestBid?: number | null;
  bestAsk?: number | null;
  structuralWalls?: BookLevel[];
  majorWalls?: BookLevel[];
};

export function updateLiquidityLifecycleFrame(
  opts: UpdateLiquidityLifecycleOpts,
): LiquidityLifecycleFrameStats {
  const stats = emptyFrameStats();
  const {
    bookLevels,
    now,
    midPrice,
    minPrice,
    maxPrice,
    config,
    verticalMode,
  } = opts;

  const gapMs = resolveLifecycleGapMs(verticalMode);
  const viewportMax = Math.max(
    1,
    ...bookLevels.map((l) => l.size),
    WALL_IMPORTANT_BTC,
  );

  const structuralPrices = new Set<string>();
  for (const w of opts.structuralWalls ?? []) {
    structuralPrices.add(
      lifecycleKeyFrom(w.side, bucketPrice(w.price, config.priceBucketUsd)),
    );
  }
  for (const w of opts.majorWalls ?? []) {
    structuralPrices.add(
      lifecycleKeyFrom(w.side, bucketPrice(w.price, config.priceBucketUsd)),
    );
  }

  const currentMap = new Map<LiquidityLifecycleKey, LiveDomBookLevel>();
  for (const level of bookLevels) {
    if (level.size <= 0) continue;
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    const key = lifecycleKeyFrom(level.side, bp);
    const existing = currentMap.get(key);
    if (!existing || level.size > existing.size) {
      currentMap.set(key, level);
    }
  }

  const smoothedDraft = Array.from(currentMap.entries()).map(([key, level]) => {
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    const prev = lifecycleCache.get(key);
    const smoothed = smoothLifecycleSize(prev?.smoothedSize ?? 0, level.size);
    return { key, side: level.side, bucketPrice: bp, smoothedSize: smoothed };
  });

  const effectiveConfig = resolveEffectiveLifecycleWriteConfig(config);
  const nearTickPct =
    BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER && effectiveConfig.mode === "micro"
      ? 0.15
      : 0.35;

  const topBidBuckets = selectTopBySmoothedSize(
    smoothedDraft,
    "bid",
    effectiveConfig.topPerSide,
  );
  const topAskBuckets = selectTopBySmoothedSize(
    smoothedDraft,
    "ask",
    effectiveConfig.topPerSide,
  );
  const nearTickKeys = selectNearTickTopPerSide(
    bookLevels,
    midPrice,
    NEAR_TICK_TOP_PER_SIDE,
    config.priceBucketUsd,
    nearTickPct,
  );

  const seen = new Set<LiquidityLifecycleKey>();

  for (const [key, level] of currentMap) {
    seen.add(key);
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    const nearTick =
      midPrice != null &&
      midPrice > 0 &&
      pctFromMid(level.price, midPrice) <= nearTickPct;
    const topDomCandidate =
      level.side === "bid"
        ? topBidBuckets.has(bp)
        : topAskBuckets.has(bp);
    const wallCandidate =
      level.size >= config.wallMinBtc ||
      level.size >= WALL_IMPORTANT_BTC ||
      structuralPrices.has(key);
    const structuralCandidate =
      structuralPrices.has(key) ||
      level.size >= WALL_STRUCTURAL_BTC ||
      level.size >= WALL_MAJOR_BTC;

    const prev = lifecycleCache.get(key);
    if (!prev) {
      const smoothed = smoothLifecycleSize(0, level.size);
      const { intensity, alpha } = computeVisualFromSize(
        smoothed,
        level.size,
        viewportMax,
      );
      const created: LiquidityLifecycleLevel = {
        key,
        side: level.side,
        price: level.price,
        bucketPrice: bp,
        rawSize: level.size,
        smoothedSize: smoothed,
        peakSize: level.size,
        firstSeenAt: now,
        lastSeenAt: now,
        lastUpdatedAt: now,
        active: true,
        wasActive: false,
        pulled: false,
        refilled: false,
        activeDurationMs: 0,
        inactiveDurationMs: 0,
        historicalWritten: false,
        historicalWriteCount: 0,
        visualIntensity: intensity,
        visualAlpha: alpha,
        peakVisualIntensity: intensity,
        peakVisualAlpha: alpha,
        nearTick,
        topDomCandidate,
        wallCandidate,
        structuralCandidate,
        shouldWriteHistorical: false,
        shouldLeaveFootprint: false,
        pullingCandidate: false,
        spoofingCandidate: false,
        previousFrameSize: level.size,
      };
      created.shouldWriteHistorical = resolveShouldWriteHistorical({
        level: created,
        config,
        midPrice,
        minPrice,
        maxPrice,
        topBidBuckets,
        topAskBuckets,
        nearTickKeys,
      });
      lifecycleCache.set(key, created);
      stats.newLevelsThisFrame += 1;
      continue;
    }

    const dtMs = Math.max(1, now - prev.lastUpdatedAt);
    const wasInactive = !prev.active;
    if (
      wasInactive &&
      prev.disappearedAt != null &&
      now - prev.disappearedAt <= gapMs
    ) {
      prev.refilled = true;
      prev.firstSeenAt = prev.firstSeenAt;
    } else if (wasInactive && prev.disappearedAt != null) {
      prev.refilled = false;
      prev.firstSeenAt = now;
      prev.peakSize = level.size;
      prev.peakVisualIntensity = 0;
      prev.peakVisualAlpha = 0;
      prev.historicalWriteCount = 0;
    }

    prev.wasActive = prev.active;
    const previousSmoothed = prev.smoothedSize;
    prev.rawSize = level.size;
    prev.smoothedSize = smoothLifecycleSize(previousSmoothed, level.size);
    prev.peakSize = Math.max(prev.peakSize, prev.smoothedSize, level.size);
    prev.lastSeenAt = now;
    prev.lastUpdatedAt = now;
    prev.active = true;
    prev.disappearedAt = undefined;
    prev.price = level.price;
    prev.nearTick = nearTick;
    prev.topDomCandidate = topDomCandidate;
    prev.wallCandidate = wallCandidate;
    prev.structuralCandidate = structuralCandidate;
    prev.activeDurationMs = Math.max(0, now - prev.firstSeenAt);
    prev.inactiveDurationMs = 0;

    if (
      detectPulling(previousSmoothed, level.size, dtMs, prev)
    ) {
      prev.pulled = true;
      prev.pullingCandidate = true;
    }

    const { intensity, alpha } = computeVisualFromSize(
      prev.smoothedSize,
      prev.peakSize,
      viewportMax,
    );
    prev.visualIntensity = intensity;
    prev.visualAlpha = alpha;
    prev.peakVisualIntensity = Math.max(prev.peakVisualIntensity, intensity);
    prev.peakVisualAlpha = Math.max(prev.peakVisualAlpha, alpha);

    prev.shouldWriteHistorical = resolveShouldWriteHistorical({
      level: prev,
      config,
      midPrice,
      minPrice,
      maxPrice,
      topBidBuckets,
      topAskBuckets,
      nearTickKeys,
    });
    prev.spoofingCandidate = detectSpoofing(prev, now, viewportMax);
    prev.previousFrameSize = level.size;

    if (prev.wasActive) stats.updatedLevelsThisFrame += 1;
  }

  for (const [key, level] of lifecycleCache) {
    if (seen.has(key)) continue;
    if (!level.active) continue;

    const sizeBeforeDisappear = level.rawSize > 0 ? level.rawSize : level.smoothedSize;
    level.wasActive = true;
    level.active = false;
    level.disappearedAt = now;
    level.inactiveDurationMs = 0;
    level.rawSize = 0;
    level.smoothedSize = smoothLifecycleSize(level.smoothedSize, 0);
    level.shouldLeaveFootprint =
      level.historicalWritten ||
      level.peakSize >= config.near035MinBtc ||
      level.wallCandidate ||
      level.topDomCandidate;
    if (
      sizeBeforeDisappear >= 2 &&
      level.smoothedSize < level.peakSize * 0.5
    ) {
      level.pulled = true;
      level.pullingCandidate = true;
    }
    level.previousFrameSize = sizeBeforeDisappear;
    stats.disappearedLevelsThisFrame += 1;
  }

  const expireBefore = now - CACHE_EXPIRE_MS;
  for (const [key, level] of Array.from(lifecycleCache.entries())) {
    if (level.active) continue;
    const goneAt = level.disappearedAt ?? level.lastSeenAt;
    const footprintDone =
      !level.shouldLeaveFootprint ||
      goneAt + FOOTPRINT_RETENTION_MS < now;
    if (footprintDone && goneAt < expireBefore) {
      lifecycleCache.delete(key);
      stats.removedExpiredLevelsThisFrame += 1;
    }
  }

  lastFrameStats = stats;
  return stats;
}

function cellKey(timeBucket: number, side: "bid" | "ask", price: number): string {
  return `${timeBucket}:${side}:${price}`;
}

export function writeLifecycleLevelToHistoricalTexture(
  merged: Map<string, HeatmapCell>,
  level: LiquidityLifecycleLevel,
  ts: number,
  config: RestingLiquidityWriteConfig,
  minPrice: number,
  maxPrice: number,
  opts?: {
    viewportMaxSize?: number;
    footprint?: boolean;
    forceTrace?: boolean;
  },
): boolean {
  if (level.bucketPrice < minPrice || level.bucketPrice > maxPrice) return false;
  if (!level.shouldWriteHistorical && !level.shouldLeaveFootprint && !level.historicalWritten) {
    return false;
  }

  const peakSize = Math.max(level.peakSize, level.smoothedSize, 0.01);
  if (peakSize <= 0) return false;

  const footprint = opts?.footprint === true || (!level.active && level.shouldLeaveFootprint);
  const viewportMax = Math.max(opts?.viewportMaxSize ?? peakSize, peakSize, 10);
  const meta = buildLifecycleHistoricalCellMeta({
    level,
    ts,
    viewportMaxSize: viewportMax,
    footprint,
    config,
    forceTrace: opts?.forceTrace,
  });

  const timeBucket = Math.floor(ts / config.samplerMs) * config.samplerMs;
  const key = cellKey(timeBucket, level.side, level.bucketPrice);
  const writeSize = level.active
    ? level.smoothedSize
    : Math.max(level.smoothedSize, peakSize * 0.25);

  registerLifecycleHistoricalCellMeta(
    timeBucket,
    level.side,
    level.bucketPrice,
    meta,
    writeSize,
    peakSize,
  );

  const existing = merged.get(key);

  if (existing) {
    existing.maxSizeInBucket = Math.max(existing.maxSizeInBucket, peakSize);
    existing.lastSizeInBucket = writeSize;
    existing.size = Math.max(existing.size, writeSize);
    existing.lastUpdateTs = Math.max(existing.lastUpdateTs, ts);
  } else {
    merged.set(key, {
      timeBucket,
      price: level.bucketPrice,
      side: level.side,
      size: writeSize,
      maxSizeInBucket: peakSize,
      lastSizeInBucket: writeSize,
      lastUpdateTs: ts,
    });
  }

  level.historicalWritten = true;
  level.historicalWriteCount += 1;
  level.lastHistoricalWriteAt = ts;
  return true;
}

export function materializeLifecycleHistoricalCells(opts: {
  serverCells: HeatmapCell[];
  bookLevels: LiveDomBookLevel[];
  staleBookLevels?: BookLevel[];
  midPrice: number | null;
  minPrice: number;
  maxPrice: number;
  dataEndTime: number;
  config: RestingLiquidityWriteConfig;
  verticalMode?: VerticalCompressionMode | string;
  bestBid?: number | null;
  bestAsk?: number | null;
  structuralWalls?: BookLevel[];
  majorWalls?: BookLevel[];
}): { cells: HeatmapCell[]; frameStats: LiquidityLifecycleFrameStats } {
  const now = opts.dataEndTime > 0 ? opts.dataEndTime : Date.now();
  clearLifecycleTextureIntegrationFrame();

  const viewportMax = Math.max(
    1,
    ...opts.bookLevels.map((l) => l.size),
    WALL_IMPORTANT_BTC,
  );

  const frameStats = updateLiquidityLifecycleFrame({
    bookLevels: opts.bookLevels,
    now,
    midPrice: opts.midPrice,
    minPrice: opts.minPrice,
    maxPrice: opts.maxPrice,
    config: opts.config,
    verticalMode: opts.verticalMode,
    bestBid: opts.bestBid,
    bestAsk: opts.bestAsk,
    structuralWalls: opts.structuralWalls,
    majorWalls: opts.majorWalls,
  });

  const effectiveConfig = resolveEffectiveLifecycleWriteConfig(opts.config);
  const nearTickPct =
    BOOKMAP_LIFECYCLE_HARD_VISUAL_FILTER && effectiveConfig.mode === "micro"
      ? 0.15
      : 0.35;
  const nearTickKeys = selectNearTickTopPerSide(
    opts.bookLevels,
    opts.midPrice,
    NEAR_TICK_TOP_PER_SIDE,
    opts.config.priceBucketUsd,
    nearTickPct,
  );
  const writeActions = resolveLifecycleWriteActions(
    Array.from(lifecycleCache.values()),
    opts.config,
    nearTickKeys,
  );

  const merged = new Map<string, HeatmapCell>();
  for (const cell of opts.serverCells) {
    merged.set(cellKey(cell.timeBucket, cell.side, cell.price), { ...cell });
  }

  for (const level of lifecycleCache.values()) {
    if (
      level.shouldWriteHistorical &&
      (level.active || level.shouldLeaveFootprint)
    ) {
      frameStats.historicalWriteCandidateCount += 1;
    }

    const action = writeActions.get(level.key) ?? "write";
    if (action === "skip") {
      if (level.shouldWriteHistorical && level.active) {
        frameStats.skippedHistoricalWriteCount += 1;
      }
      if (
        !level.active &&
        level.shouldLeaveFootprint &&
        level.disappearedAt != null
      ) {
        frameStats.skippedHistoricalWriteCount += 1;
      }
      continue;
    }

    const forceTrace = action === "trace";

    const wroteActive = level.active
      ? writeLifecycleLevelToHistoricalTexture(
          merged,
          level,
          now,
          opts.config,
          opts.minPrice,
          opts.maxPrice,
          { viewportMaxSize: viewportMax, footprint: false, forceTrace },
        )
      : false;
    if (wroteActive) {
      frameStats.historicalWriteCount += 1;
    } else if (level.shouldWriteHistorical && level.active) {
      frameStats.skippedHistoricalWriteCount += 1;
    }

    if (!level.active && level.shouldLeaveFootprint && level.disappearedAt != null) {
      const wroteFoot = writeLifecycleLevelToHistoricalTexture(
        merged,
        level,
        level.disappearedAt,
        opts.config,
        opts.minPrice,
        opts.maxPrice,
        { viewportMaxSize: viewportMax, footprint: true, forceTrace },
      );
      if (wroteFoot) frameStats.historicalWriteCount += 1;
    }
  }

  for (const stale of opts.staleBookLevels ?? []) {
    if (stale.size > 0) continue;
    const bp = bucketPrice(stale.price, opts.config.priceBucketUsd);
    const key = lifecycleKeyFrom(stale.side, bp);
    const cached = lifecycleCache.get(key);
    if (cached?.historicalWritten) continue;
    if (stale.maxSeenSize < opts.config.near035MinBtc && !stale.isMajor && !stale.isStructural) {
      continue;
    }
    const endTs = stale.lastUpdateTs || now;
    writeLifecycleLevelToHistoricalTexture(
      merged,
      {
        key,
        side: stale.side,
        price: stale.price,
        bucketPrice: bp,
        rawSize: 0,
        smoothedSize: stale.maxSeenSize * 0.5,
        peakSize: stale.maxSeenSize,
        firstSeenAt: endTs - 1_000,
        lastSeenAt: endTs,
        lastUpdatedAt: endTs,
        disappearedAt: endTs,
        active: false,
        wasActive: true,
        pulled: true,
        refilled: false,
        activeDurationMs: 1_000,
        inactiveDurationMs: 0,
        historicalWritten: false,
        historicalWriteCount: 0,
        visualIntensity: 0.4,
        visualAlpha: 0.3,
        peakVisualIntensity: 0.4,
        peakVisualAlpha: 0.3,
        nearTick: false,
        topDomCandidate: false,
        wallCandidate: stale.isImportant || stale.isStructural || stale.isMajor,
        structuralCandidate: stale.isStructural || stale.isMajor,
        shouldWriteHistorical: true,
        shouldLeaveFootprint: true,
        pullingCandidate: true,
        spoofingCandidate: false,
        previousFrameSize: stale.maxSeenSize,
      },
      endTs,
      opts.config,
      opts.minPrice,
      opts.maxPrice,
      { viewportMaxSize: viewportMax, footprint: true },
    );
  }

  lastFrameStats = frameStats;
  scaleLifecycleAlphaForBaseDensity(opts.serverCells.length);
  return { cells: Array.from(merged.values()), frameStats };
}

export function buildBookmapLiquidityLifecycleAudit(opts: {
  market: string;
  sourceMode: string;
  domSource: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  renderData?: {
    textureCells?: Array<{ side: "bid" | "ask"; price: number }>;
    activeDomBands?: Array<{ side: "bid" | "ask"; price: number }>;
    liveProjectionLevels?: Array<{ side: "bid" | "ask"; price: number }>;
  } | null;
  bookLevels: LiveDomBookLevel[];
  config: RestingLiquidityWriteConfig;
}): BookmapLiquidityLifecycleAudit {
  const frameStats = getLiquidityLifecycleLastFrameStats();
  const levels = Array.from(lifecycleCache.values());

  const activeLevels = levels.filter((l) => l.active);
  const inactiveLevels = levels.filter((l) => !l.active);
  const pulledLevels = levels.filter((l) => l.pulled || l.pullingCandidate);
  const footprintLevels = levels.filter((l) => l.shouldLeaveFootprint);

  const activeDurations = activeLevels.map((l) => l.activeDurationMs);
  const visibleDurations = levels
    .filter((l) => l.activeDurationMs > 0)
    .map((l) => l.activeDurationMs);

  const topBySize = [...levels]
    .sort((a, b) => b.peakSize - a.peakSize)
    .slice(0, 10);

  const topLifecycleLevels: TopLifecycleLevelAuditRow[] = topBySize.map(
    (l) => ({
      side: l.side,
      price: l.price,
      bucketPrice: l.bucketPrice,
      rawSize: l.rawSize,
      smoothedSize: Number(l.smoothedSize.toFixed(4)),
      peakSize: l.peakSize,
      active: l.active,
      activeDurationMs: l.activeDurationMs,
      pulled: l.pulled,
      refilled: l.refilled,
      historicalWritten: l.historicalWritten,
      historicalWriteCount: l.historicalWriteCount,
      shouldWriteHistorical: l.shouldWriteHistorical,
      shouldLeaveFootprint: l.shouldLeaveFootprint,
      visualIntensity: Number(l.visualIntensity.toFixed(4)),
      peakVisualIntensity: Number(l.peakVisualIntensity.toFixed(4)),
    }),
  );

  const textureCells = opts.renderData?.textureCells ?? [];
  const missingWrites = topLifecycleLevels.filter(
    (row) =>
      row.shouldWriteHistorical &&
      row.historicalWriteCount === 0 &&
      !textureCells.some(
        (c) => c.side === row.side && c.price === row.bucketPrice,
      ),
  );

  const missingFootprints = topLifecycleLevels.filter(
    (row) =>
      row.shouldLeaveFootprint &&
      !row.active &&
      !textureCells.some(
        (c) => c.side === row.side && c.price === row.bucketPrice,
      ),
  );

  const lifecycleHistoricalWriteOk = missingWrites.length === 0;
  const lifecycleFootprintOk = missingFootprints.length === 0;
  const lifecycleStabilityOk =
    levels.length === 0 ||
    (frameStats.removedExpiredLevelsThisFrame <= levels.length * 0.5 &&
      activeLevels.every((l) => !l.active || l.smoothedSize > 0));

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    domSource: opts.domSource,
    verticalMode: opts.verticalMode,
    spotPrice: opts.spotPrice,
    bestBid: opts.bestBid ?? null,
    bestAsk: opts.bestAsk ?? null,
    lifecycleCacheSize: levels.length,
    activeLifecycleCount: activeLevels.length,
    inactiveLifecycleCount: inactiveLevels.length,
    pulledLifecycleCount: pulledLevels.length,
    footprintLifecycleCount: footprintLevels.length,
    newLevelsThisFrame: frameStats.newLevelsThisFrame,
    updatedLevelsThisFrame: frameStats.updatedLevelsThisFrame,
    disappearedLevelsThisFrame: frameStats.disappearedLevelsThisFrame,
    removedExpiredLevelsThisFrame: frameStats.removedExpiredLevelsThisFrame,
    historicalWriteCandidateCount: frameStats.historicalWriteCandidateCount,
    historicalWriteCount: frameStats.historicalWriteCount,
    skippedHistoricalWriteCount: frameStats.skippedHistoricalWriteCount,
    topDomLifecycleCount: levels.filter((l) => l.topDomCandidate).length,
    nearTickLifecycleCount: levels.filter((l) => l.nearTick).length,
    wallLifecycleCount: levels.filter((l) => l.wallCandidate).length,
    pullingCandidateCount: levels.filter((l) => l.pullingCandidate).length,
    spoofingCandidateCount: levels.filter((l) => l.spoofingCandidate).length,
    refilledLevelCount: levels.filter((l) => l.refilled).length,
    avgActiveDurationMs: activeDurations.length
      ? Number(
          (activeDurations.reduce((a, b) => a + b, 0) / activeDurations.length).toFixed(0),
        )
      : 0,
    medianActiveDurationMs: Math.round(median(activeDurations)),
    avgVisibleDurationMs: visibleDurations.length
      ? Number(
          (visibleDurations.reduce((a, b) => a + b, 0) / visibleDurations.length).toFixed(0),
        )
      : 0,
    medianVisibleDurationMs: Math.round(median(visibleDurations)),
    lifecycleHistoricalWriteOk,
    lifecycleFootprintOk,
    lifecycleStabilityOk,
    topLifecycleLevels,
  };
}
