import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import {
  WALL_IMPORTANT_BTC,
  WALL_MAJOR_BTC,
  WALL_STRUCTURAL_BTC,
} from "@/lib/bookmapEngineConfig";
import type { BookLevel, BookmapState } from "@/types/bookmapState";
import type { LiquiditySnapshot } from "./liquidityHeatmapUtils";
import { bucketPrice } from "./domLadderUtils";

export type ActiveLiveDomLevel = {
  price: number;
  side: "bid" | "ask";
  sizeBtc: number;
  intensity: number;
  isActiveLiveDom?: boolean;
  liveDomSource?: "best" | "near-tick" | "top-dom" | "viewport-top" | "wall";
  /** 0–1 selection score for ranking/cap. */
  selectionScore?: number;
  /** Rank-based right-side alpha (0.10–0.65). */
  microScalpAlpha?: number;
};

export type LiveDomBookLevel = {
  price: number;
  size: number;
  side: "bid" | "ask";
};

export type LiveDomPriorityConfig = {
  mode: "micro" | "intraday" | "wide";
  near005MinBtc: number;
  near015MinBtc: number;
  near035MinBtc: number;
  /** Top N by size within full viewport. */
  topViewportPerSide: number;
  /** Top N by size within ±0.15% of mid. */
  topNearTick015PerSide: number;
  minRenderIntensity: number;
  priceBucketUsd: number;
  maxRightSideLevels: number;
  maxCoveragePct: number;
};

export type LiveDomBucketState = {
  previousSize: number;
  currentSize: number;
  deltaSize: number;
  lastSeenTs: number;
  appearedAt: number;
  disappearedAt: number | null;
  pullingCandidate: boolean;
  spoofingCandidate: boolean;
};

export type LiveDomSelectionResult = {
  /** Intraday/wide live projection levels (empty in micro — use activeDomBands). */
  levels: ActiveLiveDomLevel[];
  /** Micro scalping primary right-side levels. */
  activeDomBands: ActiveLiveDomLevel[];
  candidateCount: number;
  nearTickCount: number;
  topDomCount: number;
  wallCount: number;
  selectedLiveProjectionCount: number;
  selectedActiveDomBandCount: number;
  pullingDetectedCount: number;
  spoofingCandidateCount: number;
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  nearTickBidCount005: number;
  nearTickAskCount005: number;
  nearTickBidCount015: number;
  nearTickAskCount015: number;
  nearTickBidCount035: number;
  nearTickAskCount035: number;
  currentBookVisibleLevelsCount: number;
  topDomBidSize: number;
  topDomAskSize: number;
  largestDomBidPrices: number[];
  largestDomAskPrices: number[];
  largestDomBidSizes: number[];
  largestDomAskSizes: number[];
  missingTopDomLevelsCount: number;
  missingNearTickLevelsCount: number;
  estimatedCoveragePct: number;
};

const liveDomBucketTracker = new Map<string, LiveDomBucketState>();

export function resolveLiveDomPriorityConfig(
  verticalMode?: VerticalCompressionMode,
  visiblePriceRange?: number,
): LiveDomPriorityConfig {
  const micro =
    verticalMode === "micro" ||
    (visiblePriceRange != null && visiblePriceRange <= 1_500);
  const intraday =
    !micro &&
    (verticalMode === "intraday" ||
      (visiblePriceRange != null && visiblePriceRange <= 6_000));

  if (micro) {
    return {
      mode: "micro",
      near005MinBtc: 0.5,
      near015MinBtc: 1,
      near035MinBtc: 2,
      topViewportPerSide: 12,
      topNearTick015PerSide: 12,
      minRenderIntensity: 0.018,
      priceBucketUsd: 5,
      maxRightSideLevels: 60,
      maxCoveragePct: 0.45,
    };
  }
  if (intraday) {
    return {
      mode: "intraday",
      near005MinBtc: 2,
      near015MinBtc: 5,
      near035MinBtc: 10,
      topViewportPerSide: 8,
      topNearTick015PerSide: 8,
      minRenderIntensity: 0.028,
      priceBucketUsd: 5,
      maxRightSideLevels: 38,
      maxCoveragePct: 0.32,
    };
  }
  return {
    mode: "wide",
    near005MinBtc: 5,
    near015MinBtc: 10,
    near035MinBtc: 20,
    topViewportPerSide: 6,
    topNearTick015PerSide: 5,
    minRenderIntensity: 0.04,
    priceBucketUsd: 5,
    maxRightSideLevels: 24,
    maxCoveragePct: 0.22,
  };
}

function pctFromMid(price: number, mid: number): number {
  if (mid <= 0) return 100;
  return (Math.abs(price - mid) / mid) * 100;
}

function minSizeForPct(pct: number, config: LiveDomPriorityConfig): number {
  if (pct <= 0.05) return config.near005MinBtc;
  if (pct <= 0.15) return config.near015MinBtc;
  if (pct <= 0.35) return config.near035MinBtc;
  return config.near035MinBtc;
}

function bookLevelsToLiveDom(levels: BookLevel[]): LiveDomBookLevel[] {
  return levels
    .filter((l) => !l.stale && l.size > 0)
    .map((l) => ({
      price: l.price,
      size: Math.max(l.size, l.maxSeenSize),
      side: l.side,
    }));
}

export function liquiditySnapshotToLiveDomLevels(
  snap: LiquiditySnapshot,
): LiveDomBookLevel[] {
  return [
    ...snap.bids.map((b) => ({ price: b.price, size: b.sizeBtc, side: "bid" as const })),
    ...snap.asks.map((a) => ({ price: a.price, size: a.sizeBtc, side: "ask" as const })),
  ];
}

export function resolveLiveDomBookLevels(
  state: BookmapState,
  liveDomOverride?: LiveDomBookLevel[] | null,
  liveDomTimestamp?: number | null,
): LiveDomBookLevel[] {
  const engineTs = state.timestamp ?? 0;
  if (
    liveDomOverride?.length &&
    (liveDomTimestamp == null || liveDomTimestamp >= engineTs - 250)
  ) {
    return liveDomOverride.filter((l) => l.size > 0);
  }
  return bookLevelsToLiveDom([...state.bids, ...state.asks]);
}

function updateLiveDomBucketTracker(
  levels: LiveDomBookLevel[],
  now: number,
  midPrice: number | null,
  config: LiveDomPriorityConfig,
): { pulling: number; spoofing: number } {
  const seen = new Set<string>();
  let pulling = 0;
  let spoofing = 0;

  for (const level of levels) {
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    const key = `${level.side}:${bp}`;
    seen.add(key);
    const prev = liveDomBucketTracker.get(key);
    const prevSize = prev?.currentSize ?? 0;
    const delta = level.size - prevSize;
    const appearedAt = prev?.appearedAt ?? now;
    const ageMs = now - appearedAt;

    let pullingCandidate = false;
    let spoofingCandidate = false;

    if (prevSize > 0) {
      if (level.size <= 0 || (prevSize > 0 && level.size < prevSize * 0.5)) {
        if (now - (prev?.lastSeenTs ?? now) < 3_000) pullingCandidate = true;
      }
    }

    if (
      prevSize === 0 &&
      level.size >= Math.max(config.near015MinBtc, 1) &&
      midPrice != null &&
      pctFromMid(level.price, midPrice) <= 0.15
    ) {
      // Will classify spoofing on disappearance
    }

    if (prev && prev.currentSize > 0 && level.size <= 0) {
      const lifeMs = now - prev.appearedAt;
      if (
        lifeMs < 5_000 &&
        prev.currentSize >= Math.max(config.near015MinBtc, 2)
      ) {
        spoofingCandidate = true;
      }
    }

    if (pullingCandidate) pulling += 1;
    if (spoofingCandidate) spoofing += 1;

    liveDomBucketTracker.set(key, {
      previousSize: prevSize,
      currentSize: level.size,
      deltaSize: delta,
      lastSeenTs: now,
      appearedAt,
      disappearedAt: level.size <= 0 ? now : null,
      pullingCandidate,
      spoofingCandidate,
    });
  }

  for (const [key, entry] of Array.from(liveDomBucketTracker.entries())) {
    if (seen.has(key)) continue;
    if (entry.currentSize > 0 && now - entry.lastSeenTs > 500) {
      const lifeMs = now - entry.appearedAt;
      if (
        lifeMs < 5_000 &&
        entry.currentSize >= Math.max(config.near015MinBtc, 2)
      ) {
        entry.spoofingCandidate = true;
        spoofing += 1;
      }
      if (entry.currentSize > 0 && now - entry.lastSeenTs < 3_000) {
        entry.pullingCandidate = true;
        pulling += 1;
      }
      entry.previousSize = entry.currentSize;
      entry.currentSize = 0;
      entry.disappearedAt = now;
    }
  }

  return { pulling, spoofing };
}

type MutablePick = ActiveLiveDomLevel;

function microScalpAlphaFromLevel(
  sizeBtc: number,
  score: number,
  pctFromMidPrice: number,
  source: MutablePick["liveDomSource"],
): number {
  if (sizeBtc >= WALL_MAJOR_BTC) return 0.62;
  if (sizeBtc >= WALL_STRUCTURAL_BTC) return 0.55;
  if (sizeBtc >= WALL_IMPORTANT_BTC) return 0.48;
  if (source === "best" && pctFromMidPrice <= 0.05) {
    return Math.min(0.45, 0.28 + score * 0.18);
  }
  if (pctFromMidPrice <= 0.05) {
    return Math.min(0.42, 0.22 + score * 0.2);
  }
  if (pctFromMidPrice <= 0.15) {
    return Math.min(0.35, 0.16 + score * 0.16);
  }
  if (source === "top-dom") {
    return Math.min(0.28, 0.14 + score * 0.12);
  }
  return Math.min(0.22, 0.1 + score * 0.1);
}

function scoreLiveDomCandidate(
  level: MutablePick,
  midPrice: number | null,
  maxSizeInView: number,
): number {
  const pct = midPrice != null && midPrice > 0 ? pctFromMid(level.price, midPrice) : 50;
  const nearTickScore =
    pct <= 0.05 ? 1 : pct <= 0.15 ? 0.78 : pct <= 0.35 ? 0.42 : 0.12;
  const absoluteSizeScore = Math.min(1, level.sizeBtc / Math.max(maxSizeInView, 0.5));
  const localSizeRank = absoluteSizeScore;
  const wallScore =
    level.sizeBtc >= WALL_MAJOR_BTC
      ? 1
      : level.sizeBtc >= WALL_STRUCTURAL_BTC
        ? 0.85
        : level.sizeBtc >= WALL_IMPORTANT_BTC
          ? 0.7
          : 0;
  const recentChangeScore =
    level.liveDomSource === "best" ? 0.25 : level.liveDomSource === "near-tick" ? 0.15 : 0.05;
  return (
    localSizeRank * 0.35 +
    nearTickScore * 0.3 +
    absoluteSizeScore * 0.2 +
    wallScore * 0.1 +
    recentChangeScore * 0.05
  );
}

function rankAndCapLiveDomLevels(
  candidates: MutablePick[],
  config: LiveDomPriorityConfig,
  minPrice: number,
  maxPrice: number,
  midPrice: number | null,
): MutablePick[] {
  if (!candidates.length) return [];
  const maxSize = Math.max(...candidates.map((c) => c.sizeBtc), 0.5);
  const scored = candidates.map((c) => {
    const score = scoreLiveDomCandidate(c, midPrice, maxSize);
    const pct = midPrice != null && midPrice > 0 ? pctFromMid(c.price, midPrice) : 50;
    return {
      ...c,
      selectionScore: score,
      microScalpAlpha: microScalpAlphaFromLevel(c.sizeBtc, score, pct, c.liveDomSource),
    };
  });
  scored.sort((a, b) => (b.selectionScore ?? 0) - (a.selectionScore ?? 0));

  let selected = scored.slice(0, config.maxRightSideLevels);
  const priceSpan = Math.max(1, maxPrice - minPrice);
  const bucketStep = config.priceBucketUsd;
  const viewportBuckets = Math.max(1, Math.ceil(priceSpan / bucketStep));

  while (selected.length > 8) {
    const unique = new Set(selected.map((l) => `${l.side}:${l.price}`)).size;
    const coverage = unique / viewportBuckets;
    if (coverage <= config.maxCoveragePct) break;
    selected = selected.slice(0, -1);
  }

  return selected;
}

/** Merge tick-adjacent protected levels that cap trimming may have dropped. */
function mergeProtectedLiveDomLevels(
  ranked: MutablePick[],
  opts: {
    bids: LiveDomBookLevel[];
    asks: LiveDomBookLevel[];
    midPrice: number | null;
    config: LiveDomPriorityConfig;
    mapIntensity: (sizeBtc: number, price: number, pct: number) => number;
  },
): MutablePick[] {
  const { bids, asks, midPrice, config, mapIntensity } = opts;
  if (midPrice == null || midPrice <= 0) return ranked;

  const byKey = new Map<string, MutablePick>();
  for (const row of ranked) {
    byKey.set(`${row.side}:${row.price}`, row);
  }

  const protect = (level: LiveDomBookLevel, source: MutablePick["liveDomSource"]) => {
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    const key = `${level.side}:${bp}`;
    if (byKey.has(key)) return;
    const pct = pctFromMid(level.price, midPrice);
    byKey.set(key, {
      price: bp,
      side: level.side,
      sizeBtc: level.size,
      intensity: mapIntensity(level.size, level.price, pct),
      isActiveLiveDom: true,
      liveDomSource: source,
    });
  };

  const bidsBelow = bids.filter((b) => b.price <= midPrice).slice(0, 3);
  const asksAbove = asks.filter((a) => a.price >= midPrice).slice(0, 3);
  for (const level of bidsBelow) protect(level, "near-tick");
  for (const level of asksAbove) protect(level, "near-tick");

  const near005 = inViewLargeNearTick(
    [...bids, ...asks],
    midPrice,
    config,
    0.05,
    config.near005MinBtc,
  );
  for (const level of near005) protect(level, "near-tick");

  return Array.from(byKey.values());
}

function inViewLargeNearTick(
  levels: LiveDomBookLevel[],
  midPrice: number,
  config: LiveDomPriorityConfig,
  pctMax: number,
  minBtc: number,
): LiveDomBookLevel[] {
  return levels.filter(
    (l) =>
      l.size >= minBtc && pctFromMid(l.price, midPrice) <= pctMax,
  );
}

export function selectActiveLiveDomLevels(opts: {
  levels: LiveDomBookLevel[];
  minPrice: number;
  maxPrice: number;
  midPrice: number | null | undefined;
  config: LiveDomPriorityConfig;
  mapIntensity: (sizeBtc: number, price: number, pct: number) => number;
  now?: number;
}): LiveDomSelectionResult {
  const { levels, minPrice, maxPrice, config, mapIntensity } = opts;
  const now = opts.now ?? Date.now();
  const inView = levels.filter(
    (l) => l.size > 0 && l.price >= minPrice && l.price <= maxPrice,
  );

  const bids = inView.filter((l) => l.side === "bid").sort((a, b) => b.price - a.price);
  const asks = inView.filter((l) => l.side === "ask").sort((a, b) => a.price - b.price);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const midPrice =
    opts.midPrice ??
    (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk);

  let nearTickBidCount005 = 0;
  let nearTickAskCount005 = 0;
  let nearTickBidCount015 = 0;
  let nearTickAskCount015 = 0;
  let nearTickBidCount035 = 0;
  let nearTickAskCount035 = 0;
  if (midPrice != null && midPrice > 0) {
    for (const l of inView) {
      const pct = pctFromMid(l.price, midPrice);
      if (pct <= 0.05) {
        if (l.side === "bid") nearTickBidCount005 += 1;
        else nearTickAskCount005 += 1;
      }
      if (pct <= 0.15) {
        if (l.side === "bid") nearTickBidCount015 += 1;
        else nearTickAskCount015 += 1;
      }
      if (pct <= 0.35) {
        if (l.side === "bid") nearTickBidCount035 += 1;
        else nearTickAskCount035 += 1;
      }
    }
  }

  const byKey = new Map<string, MutablePick>();
  const mark = (
    level: LiveDomBookLevel,
    source: MutablePick["liveDomSource"],
  ) => {
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    const key = `${level.side}:${bp}`;
    const pct = midPrice != null ? pctFromMid(level.price, midPrice) : 50;
    const intensity = mapIntensity(level.size, level.price, pct);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        price: bp,
        side: level.side,
        sizeBtc: level.size,
        intensity,
        isActiveLiveDom: true,
        liveDomSource: source,
      });
      return;
    }
    prev.sizeBtc += level.size;
    prev.intensity = Math.max(prev.intensity, intensity);
    if (source === "best" || (source === "near-tick" && prev.liveDomSource !== "best")) {
      prev.liveDomSource = source;
    }
    if (source === "wall") {
      prev.liveDomSource = "wall";
    }
  };

  if (bestBid != null) {
    const bb = bids.find((b) => b.price === bestBid);
    if (bb) mark(bb, "best");
  }
  if (bestAsk != null) {
    const ba = asks.find((a) => a.price === bestAsk);
    if (ba) mark(ba, "best");
  }

  for (const level of inView) {
    if (midPrice == null || midPrice <= 0) continue;
    const pct = pctFromMid(level.price, midPrice);
    if (level.size >= minSizeForPct(pct, config)) {
      mark(level, pct <= 0.15 ? "near-tick" : "viewport-top");
    }
    if (level.size >= WALL_IMPORTANT_BTC) {
      mark(level, "wall");
    }
  }

  const topBids = [...inView.filter((l) => l.side === "bid")]
    .sort((a, b) => b.size - a.size)
    .slice(0, config.topViewportPerSide);
  const topAsks = [...inView.filter((l) => l.side === "ask")]
    .sort((a, b) => b.size - a.size)
    .slice(0, config.topViewportPerSide);
  for (const level of [...topBids, ...topAsks]) {
    mark(level, "top-dom");
  }

  if (midPrice != null && midPrice > 0) {
    const nearBids = inView
      .filter((l) => l.side === "bid" && pctFromMid(l.price, midPrice) <= 0.15)
      .sort((a, b) => b.size - a.size)
      .slice(0, config.topNearTick015PerSide);
    const nearAsks = inView
      .filter((l) => l.side === "ask" && pctFromMid(l.price, midPrice) <= 0.15)
      .sort((a, b) => b.size - a.size)
      .slice(0, config.topNearTick015PerSide);
    for (const level of [...nearBids, ...nearAsks]) {
      mark(level, "near-tick");
    }
  }

  const candidateCount = byKey.size;
  const rawCandidates = Array.from(byKey.values()).filter(
    (l) => l.intensity >= config.minRenderIntensity,
  );

  const ranked = mergeProtectedLiveDomLevels(
    rankAndCapLiveDomLevels(
      rawCandidates,
      config,
      minPrice,
      maxPrice,
      midPrice,
    ),
    {
      bids: bids.map((b) => ({ price: b.price, size: b.size, side: "bid" as const })),
      asks: asks.map((a) => ({ price: a.price, size: a.size, side: "ask" as const })),
      midPrice,
      config,
      mapIntensity,
    },
  );

  const priceSpan = Math.max(1, maxPrice - minPrice);
  const viewportBuckets = Math.max(1, Math.ceil(priceSpan / config.priceBucketUsd));
  const estimatedCoveragePct =
    ranked.length > 0
      ? new Set(ranked.map((l) => `${l.side}:${l.price}`)).size / viewportBuckets
      : 0;

  const nearTickCount = ranked.filter(
    (l) => l.liveDomSource === "near-tick" || l.liveDomSource === "best",
  ).length;
  const topDomCount = ranked.filter((l) => l.liveDomSource === "top-dom").length;
  const wallCount = ranked.filter((l) => l.sizeBtc >= WALL_IMPORTANT_BTC).length;

  const largestDomBidPrices = topBids.map((l) => l.price).slice(0, 6);
  const largestDomAskPrices = topAsks.map((l) => l.price).slice(0, 6);
  const largestDomBidSizes = topBids.map((l) => l.size).slice(0, 6);
  const largestDomAskSizes = topAsks.map((l) => l.size).slice(0, 6);
  const topDomBidSize = topBids[0]?.size ?? 0;
  const topDomAskSize = topAsks[0]?.size ?? 0;

  const selectedPrices = new Set(ranked.map((l) => `${l.side}:${l.price}`));
  let missingTopDomLevelsCount = 0;
  for (const level of [...topBids.slice(0, 6), ...topAsks.slice(0, 6)]) {
    const bp = bucketPrice(level.price, config.priceBucketUsd);
    if (!selectedPrices.has(`${level.side}:${bp}`)) missingTopDomLevelsCount += 1;
  }

  let missingNearTickLevelsCount = 0;
  if (midPrice != null) {
    const nearLarge = inView.filter(
      (l) =>
        pctFromMid(l.price, midPrice) <= 0.15 &&
        l.size >= config.near015MinBtc,
    );
    for (const level of nearLarge) {
      const bp = bucketPrice(level.price, config.priceBucketUsd);
      if (!selectedPrices.has(`${level.side}:${bp}`)) missingNearTickLevelsCount += 1;
    }
  }

  const trackerStats = updateLiveDomBucketTracker(inView, now, midPrice, config);

  const activeDomBands = config.mode === "micro" ? ranked : ranked.filter(
    (l) =>
      l.liveDomSource === "best" ||
      l.liveDomSource === "near-tick" ||
      l.liveDomSource === "top-dom" ||
      l.liveDomSource === "wall",
  );

  const liveProjectionLevels = config.mode === "micro" ? [] : ranked;

  return {
    levels: liveProjectionLevels,
    activeDomBands,
    candidateCount,
    nearTickCount,
    topDomCount,
    wallCount,
    selectedLiveProjectionCount: liveProjectionLevels.length,
    selectedActiveDomBandCount: activeDomBands.length,
    pullingDetectedCount: trackerStats.pulling,
    spoofingCandidateCount: trackerStats.spoofing,
    bestBid,
    bestAsk,
    midPrice,
    nearTickBidCount005,
    nearTickAskCount005,
    nearTickBidCount015,
    nearTickAskCount015,
    nearTickBidCount035,
    nearTickAskCount035,
    currentBookVisibleLevelsCount: inView.length,
    topDomBidSize,
    topDomAskSize,
    largestDomBidPrices,
    largestDomAskPrices,
    largestDomBidSizes,
    largestDomAskSizes,
    missingTopDomLevelsCount,
    missingNearTickLevelsCount,
    estimatedCoveragePct,
  };
}

export type LiveDomPriorityDiag = {
  market: string;
  sourceMode: string;
  domSource: string;
  tradeSource: string;
  spotPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  visiblePriceMin: number;
  visiblePriceMax: number;
  heatmapBucketSize: number;
  currentTickBucket: number | null;
  currentBookBidCount: number;
  currentBookAskCount: number;
  nearTickBidCount_005pct: number;
  nearTickAskCount_005pct: number;
  nearTickBidCount_015pct: number;
  nearTickAskCount_015pct: number;
  topDomBidSize: number;
  topDomAskSize: number;
  largestDomBidPrices: number[];
  largestDomAskPrices: number[];
  liveProjectionCandidateCount: number;
  liveProjectionRenderedCount: number;
  liveProjectionNearTickCount: number;
  liveProjectionTopDomCount: number;
  wallBandCandidateCount: number;
  wallBandRenderedCount: number;
  missingTopDomLevelsCount: number;
  missingNearTickLevelsCount: number;
  lastDomUpdateAgeMs: number | null;
  lastRenderAgeMs: number | null;
  pullingDetectedCount: number;
  spoofingCandidateCount: number;
  liveDomPriorityOk: boolean;
};

export function buildLiveDomPriorityDiag(opts: {
  market: string;
  sourceMode: string;
  domSource: string;
  tradeSource: string;
  spotPrice: number | null;
  visiblePriceMin: number;
  visiblePriceMax: number;
  heatmapBucketSize: number;
  selection: LiveDomSelectionResult;
  liveProjectionRenderedCount: number;
  wallBandCandidateCount: number;
  wallBandRenderedCount: number;
  lastDomUpdateAgeMs: number | null;
  lastRenderAgeMs: number | null;
  currentBookBidCount: number;
  currentBookAskCount: number;
}): LiveDomPriorityDiag {
  const spread =
    opts.selection.bestBid != null && opts.selection.bestAsk != null
      ? opts.selection.bestAsk - opts.selection.bestBid
      : null;
  const tickBucket =
    opts.selection.midPrice != null
      ? Math.round(opts.selection.midPrice / opts.heatmapBucketSize) * opts.heatmapBucketSize
      : null;

  const liveDomPriorityOk =
    opts.selection.missingTopDomLevelsCount === 0 &&
    opts.selection.missingNearTickLevelsCount <= 2 &&
    opts.liveProjectionRenderedCount > 0 &&
    opts.selection.levels.length > 0;

  return {
    market: opts.market,
    sourceMode: opts.sourceMode,
    domSource: opts.domSource,
    tradeSource: opts.tradeSource,
    spotPrice: opts.spotPrice,
    bestBid: opts.selection.bestBid,
    bestAsk: opts.selection.bestAsk,
    spread,
    visiblePriceMin: opts.visiblePriceMin,
    visiblePriceMax: opts.visiblePriceMax,
    heatmapBucketSize: opts.heatmapBucketSize,
    currentTickBucket: tickBucket,
    currentBookBidCount: opts.currentBookBidCount,
    currentBookAskCount: opts.currentBookAskCount,
    nearTickBidCount_005pct: opts.selection.nearTickBidCount005,
    nearTickAskCount_005pct: opts.selection.nearTickAskCount005,
    nearTickBidCount_015pct: opts.selection.nearTickBidCount015,
    nearTickAskCount_015pct: opts.selection.nearTickAskCount015,
    topDomBidSize: opts.selection.topDomBidSize,
    topDomAskSize: opts.selection.topDomAskSize,
    largestDomBidPrices: opts.selection.largestDomBidPrices,
    largestDomAskPrices: opts.selection.largestDomAskPrices,
    liveProjectionCandidateCount: opts.selection.candidateCount,
    liveProjectionRenderedCount: opts.liveProjectionRenderedCount,
    liveProjectionNearTickCount: opts.selection.nearTickCount,
    liveProjectionTopDomCount: opts.selection.topDomCount,
    wallBandCandidateCount: opts.wallBandCandidateCount,
    wallBandRenderedCount: opts.wallBandRenderedCount,
    missingTopDomLevelsCount: opts.selection.missingTopDomLevelsCount,
    missingNearTickLevelsCount: opts.selection.missingNearTickLevelsCount,
    lastDomUpdateAgeMs: opts.lastDomUpdateAgeMs,
    lastRenderAgeMs: opts.lastRenderAgeMs,
    pullingDetectedCount: opts.selection.pullingDetectedCount,
    spoofingCandidateCount: opts.selection.spoofingCandidateCount,
    liveDomPriorityOk,
  };
}

export function flushLiveDomBucketTracker(): Map<string, LiveDomBucketState> {
  return new Map(liveDomBucketTracker);
}
