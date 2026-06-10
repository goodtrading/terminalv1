import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import { bucketPrice } from "./domLadderUtils";
import type { LiveDomPriorityConfig } from "./bookmapLiveDomPriority";
import type {
  PreparedEngineRenderData,
  PreparedLiveProjectionLevel,
} from "./bookmapEnginePrepare";

export type LiveDomColorTier = "low" | "medium" | "strong" | "wall";

export type LiveDomVisualLevel = {
  key: string;
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
  visible: boolean;

  localRank: number;
  smoothedRank: number;
  visualIntensity: number;
  visualAlpha: number;
  visualScore: number;
  colorTier: LiveDomColorTier;

  retentionMs: number;
  fadeOutUntil?: number;

  nearTick: boolean;
  wallCandidate: boolean;
  topDomCandidate: boolean;
  liveDomSource?: PreparedLiveProjectionLevel["liveDomSource"];

  pullingCandidate?: boolean;
  spoofingCandidate?: boolean;
};

export type LiveDomVisualCacheSession = Map<string, LiveDomVisualLevel>;

export type LiveDomVisualCacheFrameStats = {
  newLevelsThisFrame: number;
  removedLevelsThisFrame: number;
  updatedLevelsThisFrame: number;
  retainedGhostLevels: number;
  fadedOutLevels: number;
  rawRankChanges: number;
  smoothedRankChanges: number;
  avgRawSizeChangePct: number;
  avgSmoothedSizeChangePct: number;
  flickerRate: number;
  churnRate: number;
  unstableBucketCount: number;
  possiblePullingLevelCount: number;
  possibleSpoofingLevelCount: number;
  avgLevelLifetimeMs: number;
  medianLevelLifetimeMs: number;
  avgVisibleLifetimeMs: number;
  medianVisibleLifetimeMs: number;
};

export type LiveDomStabilityAudit = {
  market: string;
  sourceMode: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;

  currentDomLevelCount: number;
  selectedLiveDomLevelCount: number;
  renderedLiveDomLevelCount: number;

  newLevelsThisFrame: number;
  removedLevelsThisFrame: number;
  updatedLevelsThisFrame: number;
  retainedGhostLevels: number;
  fadedOutLevels: number;

  avgLevelLifetimeMs: number;
  medianLevelLifetimeMs: number;
  avgVisibleLifetimeMs: number;
  medianVisibleLifetimeMs: number;

  nearTickSelectedCount: number;
  topSizeSelectedCount: number;
  wallSelectedCount: number;

  flickerRate: number;
  churnRate: number;
  unstableBucketCount: number;

  avgRawSizeChangePct: number;
  avgSmoothedSizeChangePct: number;

  rawRankChanges: number;
  smoothedRankChanges: number;

  possiblePullingLevelCount: number;
  possibleSpoofingLevelCount: number;

  liveDomTooFlickery: boolean;
  liveDomTooDense: boolean;
  liveDomTooUnstable: boolean;
  liveDomStabilityOk: boolean;
};

const FADE_IN_MS = 220;
const EMA_SIZE_UPGRADE_FAST = 0.65;
const EMA_SIZE_NORMAL = 0.35;
const EMA_SIZE_DOWNGRADE_SLOW = 0.18;
const EMA_RANK = 0.3;

const RANK_FLOOR_NEAR_TICK = 0.3;
const RANK_FLOOR_TOP_DOM = 0.45;
const RANK_FLOOR_WALL = 0.65;

export function liveDomVisualLevelKey(
  side: "bid" | "ask",
  bucketPriceUsd: number,
): string {
  return `${side}:${bucketPriceUsd}`;
}

function pctFromMid(price: number, mid: number): number {
  if (mid <= 0) return 100;
  return (Math.abs(price - mid) / mid) * 100;
}

function retentionMsForFlags(flags: {
  nearTick: boolean;
  topDomCandidate: boolean;
  wallCandidate: boolean;
}): number {
  if (flags.wallCandidate) return 3_000;
  if (flags.topDomCandidate) return 1_800;
  if (flags.nearTick) return 1_200;
  return 500;
}

function smoothSize(previous: number, raw: number): number {
  if (previous <= 0 || !Number.isFinite(previous)) return raw;
  if (raw <= 0) return previous * (1 - EMA_SIZE_DOWNGRADE_SLOW);
  if (raw > previous * 1.8) {
    return previous * (1 - EMA_SIZE_UPGRADE_FAST) + raw * EMA_SIZE_UPGRADE_FAST;
  }
  if (raw < previous * 0.5) {
    return previous * (1 - EMA_SIZE_DOWNGRADE_SLOW) + raw * EMA_SIZE_DOWNGRADE_SLOW;
  }
  return previous * (1 - EMA_SIZE_NORMAL) + raw * EMA_SIZE_NORMAL;
}

function smoothRank(previous: number, raw: number, floor?: number): number {
  const base = previous > 0 ? previous * (1 - EMA_RANK) + raw * EMA_RANK : raw;
  return floor != null ? Math.max(base, floor) : base;
}

function rankFloor(flags: {
  nearTick: boolean;
  topDomCandidate: boolean;
  wallCandidate: boolean;
}): number | undefined {
  if (flags.wallCandidate) return RANK_FLOOR_WALL;
  if (flags.topDomCandidate) return RANK_FLOOR_TOP_DOM;
  if (flags.nearTick) return RANK_FLOOR_NEAR_TICK;
  return undefined;
}

function classifyColorTier(
  visualScore: number,
  wallCandidate: boolean,
): LiveDomColorTier {
  if (wallCandidate) return "wall";
  if (visualScore >= 0.62) return "strong";
  if (visualScore >= 0.34) return "medium";
  return "low";
}

function alphaFromVisualScore(score: number, tier: LiveDomColorTier): number {
  if (tier === "wall") return Math.min(0.65, 0.45 + score * 0.2);
  if (tier === "strong") return Math.min(0.45, 0.3 + (score - 0.5) * 0.3);
  if (tier === "medium") return Math.min(0.3, 0.18 + score * 0.22);
  return Math.min(0.18, 0.1 + score * 0.12);
}

function computeVisualScore(
  smoothedRank: number,
  nearTick: boolean,
  smoothedSize: number,
  maxSize: number,
  wallCandidate: boolean,
): number {
  const nearTickScore = nearTick ? 1 : 0.22;
  const absoluteSizeScore = Math.min(1, smoothedSize / Math.max(maxSize, 0.5));
  const wallScore = wallCandidate ? 1 : 0;
  return (
    smoothedRank * 0.45 +
    nearTickScore * 0.25 +
    absoluteSizeScore * 0.2 +
    wallScore * 0.1
  );
}

function fadeMultiplier(level: LiveDomVisualLevel, now: number): number {
  const ageMs = now - level.firstSeenAt;
  if (ageMs < FADE_IN_MS) return ageMs / FADE_IN_MS;
  if (!level.active && level.fadeOutUntil != null && now < level.fadeOutUntil) {
    const total = level.fadeOutUntil - (level.disappearedAt ?? now);
    const remain = level.fadeOutUntil - now;
    return Math.max(0, remain / Math.max(1, total));
  }
  return level.active ? 1 : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function priorityScore(level: LiveDomVisualLevel): number {
  let score = level.visualScore * 100;
  if (level.liveDomSource === "best") score += 50;
  if (level.nearTick) score += 30;
  if (level.wallCandidate) score += 40;
  if (level.topDomCandidate) score += 20;
  if (!level.active && level.fadeOutUntil != null) score += 15;
  return score;
}

function capLiveDomLevels(
  levels: LiveDomVisualLevel[],
  maxCount: number,
): LiveDomVisualLevel[] {
  if (levels.length <= maxCount) return levels;
  const sorted = [...levels].sort((a, b) => priorityScore(b) - priorityScore(a));
  const kept = sorted.slice(0, maxCount);
  const keptKeys = new Set(kept.map((l) => l.key));
  for (const level of sorted.slice(maxCount)) {
    if (level.active) {
      level.active = false;
      level.disappearedAt = level.lastSeenAt;
      level.fadeOutUntil = level.lastSeenAt + Math.min(level.retentionMs, 800);
    }
    if (!keptKeys.has(level.key) && level.visible) {
      level.visible = false;
    }
  }
  return kept.filter((l) => l.visible);
}

function toPreparedLevel(level: LiveDomVisualLevel, now: number): PreparedLiveProjectionLevel {
  const fadeMul = fadeMultiplier(level, now);
  const alpha = alphaFromVisualScore(level.visualScore, level.colorTier) * fadeMul;
  return {
    price: level.bucketPrice,
    side: level.side,
    sizeBtc: level.smoothedSize,
    intensity: level.visualIntensity,
    isActiveLiveDom: true,
    liveDomSource: level.liveDomSource,
    microScalpAlpha: Math.min(0.65, Math.max(0.08, alpha)),
    selectionScore: level.smoothedRank,
    liveDomVisualScore: level.visualScore,
    liveDomColorTier: level.colorTier,
    liveDomFadeAlpha: fadeMul,
  };
}

type IncomingLiveDomLevel = PreparedLiveProjectionLevel & {
  bucketPrice?: number;
};

function buildIncomingMap(
  levels: PreparedLiveProjectionLevel[],
  bucketUsd: number,
  midPrice: number | null,
): Map<string, IncomingLiveDomLevel> {
  const map = new Map<string, IncomingLiveDomLevel>();
  for (const level of levels) {
    const bp = bucketPrice(level.price, bucketUsd);
    const key = liveDomVisualLevelKey(level.side, bp);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...level, price: bp, bucketPrice: bp });
      continue;
    }
    prev.sizeBtc = Math.max(prev.sizeBtc, level.sizeBtc);
    prev.intensity = Math.max(prev.intensity, level.intensity);
    if (
      level.liveDomSource === "best" ||
      (level.liveDomSource === "near-tick" && prev.liveDomSource !== "best")
    ) {
      prev.liveDomSource = level.liveDomSource;
    }
    prev.selectionScore = Math.max(prev.selectionScore ?? 0, level.selectionScore ?? 0);
    prev.microScalpAlpha = Math.max(prev.microScalpAlpha ?? 0, level.microScalpAlpha ?? 0);
    if (midPrice != null) {
      void pctFromMid(bp, midPrice);
    }
  }
  return map;
}

export function applyLiveDomVisualCache(
  data: PreparedEngineRenderData,
  opts: {
    cache: LiveDomVisualCacheSession;
    now?: number;
    config: LiveDomPriorityConfig;
    midPrice: number | null;
    spotPrice?: number | null;
    frameStats?: LiveDomVisualCacheFrameStats;
  },
): PreparedEngineRenderData {
  const now = opts.now ?? Date.now();
  const bucketUsd = opts.config.priceBucketUsd;
  const mid = opts.midPrice ?? opts.spotPrice ?? null;

  const rawIncoming = [
    ...data.activeDomBands,
    ...data.liveProjectionLevels,
  ];
  const incoming = buildIncomingMap(rawIncoming, bucketUsd, mid);
  const seenKeys = new Set<string>();

  const frameStats: LiveDomVisualCacheFrameStats = opts.frameStats ?? {
    newLevelsThisFrame: 0,
    removedLevelsThisFrame: 0,
    updatedLevelsThisFrame: 0,
    retainedGhostLevels: 0,
    fadedOutLevels: 0,
    rawRankChanges: 0,
    smoothedRankChanges: 0,
    avgRawSizeChangePct: 0,
    avgSmoothedSizeChangePct: 0,
    flickerRate: 0,
    churnRate: 0,
    unstableBucketCount: 0,
    possiblePullingLevelCount: 0,
    possibleSpoofingLevelCount: 0,
    avgLevelLifetimeMs: 0,
    medianLevelLifetimeMs: 0,
    avgVisibleLifetimeMs: 0,
    medianVisibleLifetimeMs: 0,
  };

  const rawSizeChanges: number[] = [];
  const smoothedSizeChanges: number[] = [];
  const lifetimes: number[] = [];
  const visibleLifetimes: number[] = [];
  let unstableBuckets = 0;

  const maxRawSize = Math.max(
    0.5,
    ...Array.from(incoming.values()).map((l) => l.sizeBtc),
    ...Array.from(opts.cache.values()).map((l) => l.smoothedSize),
  );

  const rankedIncoming = [...incoming.values()].sort(
    (a, b) => (b.selectionScore ?? 0) - (a.selectionScore ?? 0),
  );
  const rawRankByKey = new Map<string, number>();
  rankedIncoming.forEach((level, idx) => {
    const bp = level.bucketPrice ?? bucketPrice(level.price, bucketUsd);
    rawRankByKey.set(
      liveDomVisualLevelKey(level.side, bp),
      1 - idx / Math.max(1, rankedIncoming.length - 1),
    );
  });

  for (const [key, row] of incoming.entries()) {
    seenKeys.add(key);
    const bp = row.bucketPrice ?? bucketPrice(row.price, bucketUsd);
    const pct = mid != null ? pctFromMid(bp, mid) : 50;
    const nearTick = pct <= 0.15;
    const wallCandidate = row.sizeBtc >= WALL_IMPORTANT_BTC;
    const topDomCandidate =
      row.liveDomSource === "top-dom" || row.liveDomSource === "best";
    const flags = { nearTick, topDomCandidate, wallCandidate };
    const retentionMs = retentionMsForFlags(flags);
    const rawRank = rawRankByKey.get(key) ?? 0.2;

    const prev = opts.cache.get(key);
    if (!prev) {
      frameStats.newLevelsThisFrame += 1;
      const smoothedSize = row.sizeBtc;
      const smoothedRank = smoothRank(0, rawRank, rankFloor(flags));
      const visualScore = computeVisualScore(
        smoothedRank,
        nearTick,
        smoothedSize,
        maxRawSize,
        wallCandidate,
      );
      const colorTier = classifyColorTier(visualScore, wallCandidate);
      const visualAlpha = alphaFromVisualScore(visualScore, colorTier);
      opts.cache.set(key, {
        key,
        side: row.side,
        price: bp,
        bucketPrice: bp,
        rawSize: row.sizeBtc,
        smoothedSize,
        peakSize: row.sizeBtc,
        firstSeenAt: now,
        lastSeenAt: now,
        lastUpdatedAt: now,
        active: true,
        visible: true,
        localRank: rawRank,
        smoothedRank,
        visualIntensity: visualScore,
        visualAlpha,
        visualScore,
        colorTier,
        retentionMs,
        nearTick,
        wallCandidate,
        topDomCandidate,
        liveDomSource: row.liveDomSource,
      });
      continue;
    }

    frameStats.updatedLevelsThisFrame += 1;
    const prevRaw = prev.rawSize;
    const prevSmooth = prev.smoothedSize;
    if (prevRaw > 0) {
      rawSizeChanges.push(Math.abs(row.sizeBtc - prevRaw) / prevRaw);
    }
    const nextSmooth = smoothSize(prev.smoothedSize, row.sizeBtc);
    if (prevSmooth > 0) {
      smoothedSizeChanges.push(Math.abs(nextSmooth - prevSmooth) / prevSmooth);
    }
    if (Math.abs(rawRank - prev.localRank) > 0.35) {
      frameStats.rawRankChanges += 1;
    }

    const nextRank = smoothRank(prev.smoothedRank, rawRank, rankFloor(flags));
    if (Math.abs(nextRank - prev.smoothedRank) > 0.25) {
      frameStats.smoothedRankChanges += 1;
    }
    if (
      Math.abs(rawRank - prev.localRank) > 0.45 &&
      Math.abs(nextSmooth - prevSmooth) / Math.max(prevSmooth, 0.01) > 0.4
    ) {
      unstableBuckets += 1;
    }

    const visualScore = computeVisualScore(
      nextRank,
      nearTick,
      nextSmooth,
      maxRawSize,
      wallCandidate,
    );
    const colorTier = classifyColorTier(visualScore, wallCandidate);
    const visualAlpha = alphaFromVisualScore(visualScore, colorTier);

    prev.rawSize = row.sizeBtc;
    prev.smoothedSize = nextSmooth;
    prev.peakSize = Math.max(prev.peakSize, row.sizeBtc);
    prev.lastSeenAt = now;
    prev.lastUpdatedAt = now;
    prev.active = true;
    prev.visible = true;
    prev.disappearedAt = undefined;
    prev.fadeOutUntil = undefined;
    prev.localRank = rawRank;
    prev.smoothedRank = nextRank;
    prev.visualIntensity = visualScore;
    prev.visualAlpha = visualAlpha;
    prev.visualScore = visualScore;
    prev.colorTier = colorTier;
    prev.nearTick = nearTick;
    prev.wallCandidate = wallCandidate;
    prev.topDomCandidate = topDomCandidate;
    prev.retentionMs = retentionMs;
    prev.liveDomSource = row.liveDomSource ?? prev.liveDomSource;

    const lifeMs = now - prev.firstSeenAt;
    lifetimes.push(lifeMs);
    visibleLifetimes.push(lifeMs);

    if (
      prevRaw > 0 &&
      row.sizeBtc < prevRaw * 0.5 &&
      now - prev.firstSeenAt < 3_000 &&
      nearTick
    ) {
      prev.pullingCandidate = true;
      frameStats.possiblePullingLevelCount += 1;
    }
    if (
      prev.firstSeenAt > now - 5_000 &&
      row.sizeBtc >= Math.max(opts.config.near015MinBtc, 2) &&
      nearTick &&
      lifeMs < 3_000 &&
      prevRaw > row.sizeBtc * 1.5
    ) {
      prev.spoofingCandidate = true;
      frameStats.possibleSpoofingLevelCount += 1;
    }

    void pct;
  }

  for (const [key, entry] of opts.cache.entries()) {
    if (seenKeys.has(key)) continue;
    if (!entry.active && entry.fadeOutUntil != null && now < entry.fadeOutUntil) {
      frameStats.retainedGhostLevels += 1;
      entry.visible = true;
      lifetimes.push(now - entry.firstSeenAt);
      if (entry.disappearedAt != null) {
        visibleLifetimes.push(now - entry.firstSeenAt);
      }
      continue;
    }
    if (entry.active) {
      frameStats.removedLevelsThisFrame += 1;
      entry.active = false;
      entry.disappearedAt = now;
      entry.fadeOutUntil = now + entry.retentionMs;
      entry.visible = true;
      frameStats.retainedGhostLevels += 1;
      lifetimes.push(now - entry.firstSeenAt);
      continue;
    }
    if (entry.fadeOutUntil != null && now >= entry.fadeOutUntil) {
      frameStats.fadedOutLevels += 1;
      entry.visible = false;
      opts.cache.delete(key);
      continue;
    }
    if (entry.fadeOutUntil != null && now < entry.fadeOutUntil) {
      frameStats.retainedGhostLevels += 1;
      entry.visible = true;
    }
  }

  const visibleLevels = capLiveDomLevels(
    [...opts.cache.values()].filter((l) => l.visible),
    opts.config.maxRightSideLevels,
  );

  const prepared = visibleLevels.map((l) => toPreparedLevel(l, now));
  const activeDomBands =
    opts.config.mode === "micro"
      ? prepared
      : prepared.filter(
          (l) =>
            l.liveDomSource === "best" ||
            l.liveDomSource === "near-tick" ||
            l.liveDomSource === "top-dom" ||
            l.liveDomSource === "wall",
        );
  const liveProjectionLevels = opts.config.mode === "micro" ? [] : prepared;

  const prevCount = rawIncoming.length;
  const nextCount = prepared.length;
  frameStats.churnRate =
    prevCount > 0
      ? (frameStats.newLevelsThisFrame + frameStats.removedLevelsThisFrame) /
        prevCount
      : 0;
  frameStats.flickerRate =
    visibleLevels.length > 0
      ? (frameStats.rawRankChanges + frameStats.removedLevelsThisFrame) /
        visibleLevels.length
      : 0;
  frameStats.unstableBucketCount = unstableBuckets;
  frameStats.avgRawSizeChangePct = rawSizeChanges.length
    ? rawSizeChanges.reduce((a, b) => a + b, 0) / rawSizeChanges.length
    : 0;
  frameStats.avgSmoothedSizeChangePct = smoothedSizeChanges.length
    ? smoothedSizeChanges.reduce((a, b) => a + b, 0) / smoothedSizeChanges.length
    : 0;
  frameStats.avgLevelLifetimeMs = lifetimes.length
    ? lifetimes.reduce((a, b) => a + b, 0) / lifetimes.length
    : 0;
  frameStats.medianLevelLifetimeMs = median(lifetimes);
  frameStats.avgVisibleLifetimeMs = visibleLifetimes.length
    ? visibleLifetimes.reduce((a, b) => a + b, 0) / visibleLifetimes.length
    : 0;
  frameStats.medianVisibleLifetimeMs = median(visibleLifetimes);

  if (opts.frameStats) {
    Object.assign(opts.frameStats, frameStats);
  }

  return {
    ...data,
    liveProjectionLevels,
    activeDomBands,
  };
}

export function buildLiveDomStabilityAudit(opts: {
  market: string;
  sourceMode: string;
  verticalMode: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  currentDomLevelCount: number;
  selectedLiveDomLevelCount: number;
  renderedLiveDomLevelCount: number;
  frameStats: LiveDomVisualCacheFrameStats;
  nearTickSelectedCount: number;
  topSizeSelectedCount: number;
  wallSelectedCount: number;
  estimatedCoveragePct: number;
}): LiveDomStabilityAudit {
  const s = opts.frameStats;
  const liveDomTooFlickery = s.flickerRate > 0.35 || s.churnRate > 0.45;
  const liveDomTooDense = opts.estimatedCoveragePct > 0.48;
  const liveDomTooUnstable =
    s.unstableBucketCount > 6 ||
    s.avgRawSizeChangePct > 0.55 ||
    s.smoothedRankChanges > 8;
  const liveDomStabilityOk =
    !liveDomTooFlickery && !liveDomTooDense && !liveDomTooUnstable;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    verticalMode: opts.verticalMode,
    spotPrice: opts.spotPrice,
    bestBid: opts.bestBid,
    bestAsk: opts.bestAsk,
    currentDomLevelCount: opts.currentDomLevelCount,
    selectedLiveDomLevelCount: opts.selectedLiveDomLevelCount,
    renderedLiveDomLevelCount: opts.renderedLiveDomLevelCount,
    newLevelsThisFrame: s.newLevelsThisFrame,
    removedLevelsThisFrame: s.removedLevelsThisFrame,
    updatedLevelsThisFrame: s.updatedLevelsThisFrame,
    retainedGhostLevels: s.retainedGhostLevels,
    fadedOutLevels: s.fadedOutLevels,
    avgLevelLifetimeMs: s.avgLevelLifetimeMs,
    medianLevelLifetimeMs: s.medianLevelLifetimeMs,
    avgVisibleLifetimeMs: s.avgVisibleLifetimeMs,
    medianVisibleLifetimeMs: s.medianVisibleLifetimeMs,
    nearTickSelectedCount: opts.nearTickSelectedCount,
    topSizeSelectedCount: opts.topSizeSelectedCount,
    wallSelectedCount: opts.wallSelectedCount,
    flickerRate: s.flickerRate,
    churnRate: s.churnRate,
    unstableBucketCount: s.unstableBucketCount,
    avgRawSizeChangePct: s.avgRawSizeChangePct,
    avgSmoothedSizeChangePct: s.avgSmoothedSizeChangePct,
    rawRankChanges: s.rawRankChanges,
    smoothedRankChanges: s.smoothedRankChanges,
    possiblePullingLevelCount: s.possiblePullingLevelCount,
    possibleSpoofingLevelCount: s.possibleSpoofingLevelCount,
    liveDomTooFlickery,
    liveDomTooDense,
    liveDomTooUnstable,
    liveDomStabilityOk,
  };
}

export function isLiveDomWallSize(sizeBtc: number): boolean {
  return sizeBtc >= WALL_IMPORTANT_BTC;
}

export function liveDomWallTier(sizeBtc: number): "important" | "structural" | "major" | null {
  if (sizeBtc >= WALL_MAJOR_BTC) return "major";
  if (sizeBtc >= WALL_STRUCTURAL_BTC) return "structural";
  if (sizeBtc >= WALL_IMPORTANT_BTC) return "important";
  return null;
}
