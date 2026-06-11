import {
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1,
  BOOKMAP_PERSISTENT_WALL_ANCHORING_V1,
  MACRO_DOM_DEPTH_ALPHA_MUL,
  MACRO_DOM_FAR_WALL_ALPHA_FLOOR,
  MACRO_DOM_INCLUDE_FAR_WALLS,
  MACRO_DOM_MAX_LEVELS_PER_SIDE,
  MACRO_DOM_MIN_SIZE_BTC,
  MACRO_DOM_VISIBLE_RANGE_MIN_RANK,
  WALL_ANCHOR_FADE_MS,
  WALL_ANCHOR_MAX_TRACKED_WALLS,
  WALL_ANCHOR_MIN_INTENSITY,
  WALL_ANCHOR_MIN_SIZE_BTC,
  WALL_ANCHOR_NEAR_PRICE_BOOST_PCT,
  WALL_ANCHOR_PRICE_BRIDGE_USD,
  WALL_ANCHOR_PULL_DECAY,
  WALL_ANCHOR_REFILL_BOOST,
  WALL_ANCHOR_STALE_GRACE_MS,
  WALL_IMPORTANT_BTC,
  computeVisiblePriceRangePct,
  resolveZoomRegime,
  type BookmapZoomRegime,
} from "@/lib/bookmapEngineConfig";
import type { HeatmapBand } from "./bookmapBandTypes";
import { isWallTier } from "./bookmapBandTypes";
import { bucketPrice } from "./domLadderUtils";
import type { LiveDomBookLevel } from "./bookmapLiveDomPriority";
import {
  BOOKMAP_TEXTURE_SAMPLER_MS,
  type PreparedEngineTextureCell,
  type PreparedEngineWall,
  type PreparedLiveProjectionLevel,
} from "./bookmapEnginePrepare";

export type WallEntityState =
  | "new"
  | "persistent"
  | "reinforced"
  | "pulling"
  | "fading"
  | "stale"
  | "touched";

export type AnchoredWallEntity = {
  wallId: string;
  side: "bid" | "ask";
  anchorPrice: number;
  priceMin: number;
  priceMax: number;
  firstSeenTime: number;
  lastSeenTime: number;
  lastActiveTime: number;
  maxSizeBtc: number;
  currentSizeBtc: number;
  avgSizeBtc: number;
  peakIntensity: number;
  currentIntensity: number;
  persistenceMs: number;
  ageMs: number;
  state: WallEntityState;
  refillScore: number;
  pullScore: number;
  fadeScore: number;
  touchScore: number;
  isLive: boolean;
  isHistorical: boolean;
  isNearPrice: boolean;
  isFarButImportant: boolean;
  isDominant: boolean;
  historicalStartTime: number;
  historicalEndTime: number;
  runLength: number;
  macroDomSourced: boolean;
};

export type WallAnchoringDiagStats = {
  wallCandidates: number;
  anchoredWalls: number;
  activeWalls: number;
  historicalWalls: number;
  farMacroWalls: number;
  fadingWalls: number;
  reinforcedWalls: number;
  pullingWalls: number;
  touchedWalls: number;
  dominantWalls: number;
  avgWallAgeSec: number;
  maxWallAgeSec: number;
  avgPersistenceSec: number;
  maxPersistenceSec: number;
  liveProjectionConnected: number;
  timestamp: number;
};

export type MacroDomCoverageDiagStats = {
  zoomRegime: BookmapZoomRegime;
  visiblePriceMin: number;
  visiblePriceMax: number;
  domLevelsVisible: number;
  domLargeLevelsVisible: number;
  domLargeLevelsRendered: number;
  farBidWallsRendered: number;
  farAskWallsRendered: number;
  domMatchedAnchors: number;
  domUnmatchedLargeWalls: number;
  skippedByDistance: number;
  skippedByCap: number;
  skippedBySize: number;
  timestamp: number;
};

export type AnchoredWallLayerResult = {
  walls: AnchoredWallEntity[];
  wallAnchoringDiag: WallAnchoringDiagStats;
  macroDomCoverageDiag: MacroDomCoverageDiagStats;
};

type WallCandidate = {
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  intensity: number;
  timeBucket?: number;
  endTimeBucket?: number;
  runLength?: number;
  persistenceMs?: number;
  source: "texture_span" | "wall_band" | "dom" | "live" | "prepared_wall";
  isLive: boolean;
};

type WallTrack = {
  wallId: string;
  side: "bid" | "ask";
  anchorPrice: number;
  priceMin: number;
  priceMax: number;
  firstSeenTime: number;
  lastSeenTime: number;
  lastActiveTime: number;
  maxSizeBtc: number;
  prevSizeBtc: number;
  currentSizeBtc: number;
  sizeSampleSum: number;
  sizeSampleCount: number;
  peakIntensity: number;
  currentIntensity: number;
  historicalStartTime: number;
  historicalEndTime: number;
  runLengthPeak: number;
  missedSinceMs: number;
  macroDomSourced: boolean;
  lastFrameMs: number;
};

const wallAnchorTracker = new Map<string, WallTrack>();
let wallIdSeq = 0;

function pctFromMid(price: number, mid: number | null): number {
  if (mid == null || mid <= 0) return 50;
  return (Math.abs(price - mid) / mid) * 100;
}

function anchorBucketPrice(price: number, bridgeUsd: number): number {
  return bucketPrice(price, bridgeUsd);
}

function wallTrackKey(side: "bid" | "ask", anchorPrice: number): string {
  return `${side}:${anchorPrice}`;
}

function isWallCandidate(
  sizeBtc: number,
  intensity: number,
  runLength: number,
  persistenceMs: number,
  regime: BookmapZoomRegime,
): boolean {
  if (sizeBtc >= WALL_IMPORTANT_BTC) return true;
  if (sizeBtc >= 50) return true;
  if (sizeBtc >= WALL_ANCHOR_MIN_SIZE_BTC && runLength >= 2) return true;
  if (intensity >= WALL_ANCHOR_MIN_INTENSITY && persistenceMs >= 1_200) {
    return true;
  }
  if (
    BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1 &&
    regime === "macro" &&
    sizeBtc >= MACRO_DOM_MIN_SIZE_BTC
  ) {
    return true;
  }
  return false;
}

function computeTouchScore(
  price: number,
  midPrice: number | null,
  bestBid: number | null,
  bestAsk: number | null,
): number {
  if (bestBid != null && Math.abs(price - bestBid) / Math.max(1, price) < 0.00025) {
    return 0.85;
  }
  if (bestAsk != null && Math.abs(price - bestAsk) / Math.max(1, price) < 0.00025) {
    return 0.85;
  }
  if (midPrice != null && midPrice > 0) {
    const pct = Math.abs(price - midPrice) / midPrice;
    if (pct < 0.0015) return 0.55;
    if (pct < 0.004) return 0.28;
  }
  return 0;
}

function deriveWallEntityState(
  track: WallTrack,
  now: number,
  dataEndTime: number,
  touchScore: number,
): {
  state: WallEntityState;
  refillScore: number;
  pullScore: number;
  fadeScore: number;
} {
  const persistenceMs = Math.max(0, track.lastSeenTime - track.firstSeenTime);
  const isLive = track.lastActiveTime >= dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS * 2;
  const refillScore =
    track.prevSizeBtc > 0 && track.currentSizeBtc > track.prevSizeBtc * 1.08
      ? Math.min(
          1,
          (track.currentSizeBtc - track.prevSizeBtc) /
            Math.max(1, track.prevSizeBtc),
        )
      : 0;
  const pullScore =
    track.prevSizeBtc > 0 && track.currentSizeBtc < track.prevSizeBtc * 0.85
      ? Math.min(
          1,
          (track.prevSizeBtc - track.currentSizeBtc) /
            Math.max(1, track.prevSizeBtc),
        )
      : 0;
  const staleMs = now - track.lastSeenTime;

  if (!isLive) {
    const fadeScore = Math.min(1, staleMs / Math.max(1, WALL_ANCHOR_FADE_MS));
    if (staleMs >= WALL_ANCHOR_FADE_MS) {
      return { state: "stale", refillScore, pullScore, fadeScore };
    }
    if (staleMs >= WALL_ANCHOR_STALE_GRACE_MS) {
      return { state: "fading", refillScore, pullScore, fadeScore };
    }
  }

  if (touchScore >= 0.5) {
    return { state: "touched", refillScore, pullScore, fadeScore: 0 };
  }
  if (pullScore >= WALL_ANCHOR_PULL_DECAY) {
    return { state: "pulling", refillScore, pullScore, fadeScore: 0 };
  }
  if (refillScore >= WALL_ANCHOR_REFILL_BOOST || track.currentSizeBtc >= track.maxSizeBtc * 0.96) {
    return { state: "reinforced", refillScore, pullScore, fadeScore: 0 };
  }
  if (persistenceMs >= 60_000 || track.runLengthPeak >= 3) {
    return { state: "persistent", refillScore, pullScore, fadeScore: 0 };
  }
  return { state: "new", refillScore, pullScore, fadeScore: 0 };
}

function collectTextureSpanCandidates(
  cells: PreparedEngineTextureCell[],
): WallCandidate[] {
  const out: WallCandidate[] = [];
  for (const cell of cells) {
    if (cell.isGranularMatrixCell && !cell.isMiniFragment) continue;
    if (
      cell.liquidityLifeStage !== "wall_candidate" &&
      cell.liquidityLifeStage !== "reinforced" &&
      !cell.isMiniFragment &&
      cell.maxSizeInBucket < WALL_ANCHOR_MIN_SIZE_BTC
    ) {
      continue;
    }
    const runLength = cell.continuityRunLength ?? 1;
    const persistenceMs =
      cell.persistenceMs ?? runLength * BOOKMAP_ENGINE_BUCKET_MS;
    if (
      !isWallCandidate(
        cell.maxSizeInBucket,
        cell.intensity ?? 0,
        runLength,
        persistenceMs,
        "micro",
      )
    ) {
      continue;
    }
    out.push({
      side: cell.side,
      price: cell.price,
      sizeBtc: cell.maxSizeInBucket,
      intensity: cell.intensity ?? 0,
      timeBucket: cell.runStartTimeBucket ?? cell.timeBucket,
      endTimeBucket: cell.endTimeBucket ?? cell.timeBucket + BOOKMAP_TEXTURE_SAMPLER_MS,
      runLength,
      persistenceMs,
      source: "texture_span",
      isLive: false,
    });
  }
  return out;
}

function collectBandCandidates(bands: HeatmapBand[]): WallCandidate[] {
  const out: WallCandidate[] = [];
  for (const band of bands) {
    if (!isWallTier(band.tier) && band.maxSize < WALL_ANCHOR_MIN_SIZE_BTC) {
      continue;
    }
    out.push({
      side: band.side,
      price: band.price,
      sizeBtc: band.maxSize,
      intensity: Math.max(band.visualIntensity, band.intensity, 0.45),
      timeBucket: band.startTime,
      endTimeBucket: band.endTime,
      runLength: Math.max(
        1,
        Math.ceil((band.endTime - band.startTime) / BOOKMAP_TEXTURE_SAMPLER_MS),
      ),
      persistenceMs: band.persistenceMs,
      source: "wall_band",
      isLive: !band.stale,
    });
  }
  return out;
}

function collectPreparedWallCandidates(
  walls: PreparedEngineWall[],
): WallCandidate[] {
  return walls.map((wall) => ({
    side: wall.side,
    price: wall.price,
    sizeBtc: wall.maxSeenSize,
    intensity: Math.max(wall.intensity, 0.5),
    runLength: 2,
    persistenceMs: 60_000,
    source: "prepared_wall" as const,
    isLive: !wall.stale,
  }));
}

function collectLiveCandidates(
  levels: PreparedLiveProjectionLevel[],
): WallCandidate[] {
  const out: WallCandidate[] = [];
  for (const level of levels) {
    if (level.sizeBtc < MACRO_DOM_MIN_SIZE_BTC && level.intensity < 0.35) {
      continue;
    }
    out.push({
      side: level.side,
      price: level.price,
      sizeBtc: level.sizeBtc,
      intensity: level.intensity,
      runLength: 1,
      persistenceMs: 0,
      source: "live",
      isLive: true,
    });
  }
  return out;
}

function collectMacroDomCandidates(
  bookLevels: LiveDomBookLevel[],
  minPrice: number,
  maxPrice: number,
  midPrice: number | null,
  regime: BookmapZoomRegime,
  viewportMaxSize: number,
  diag: MacroDomCoverageDiagStats,
): WallCandidate[] {
  if (!BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1 || regime !== "macro") return [];

  const inRange = bookLevels.filter(
    (l) => l.size > 0 && l.price >= minPrice && l.price <= maxPrice,
  );
  diag.domLevelsVisible = inRange.length;

  const large = inRange.filter((l) => l.size >= MACRO_DOM_MIN_SIZE_BTC);
  diag.domLargeLevelsVisible = large.length;

  const rankThreshold = viewportMaxSize * MACRO_DOM_VISIBLE_RANGE_MIN_RANK;
  const bySide = { bid: [] as LiveDomBookLevel[], ask: [] as LiveDomBookLevel[] };
  for (const level of large) {
    bySide[level.side].push(level);
  }

  const out: WallCandidate[] = [];
  for (const side of ["bid", "ask"] as const) {
    const sorted = [...bySide[side]].sort((a, b) => b.size - a.size);
    const capped = sorted.slice(0, MACRO_DOM_MAX_LEVELS_PER_SIDE);
    for (const level of capped) {
      const pct = pctFromMid(level.price, midPrice);
      const farButLarge =
        MACRO_DOM_INCLUDE_FAR_WALLS &&
        pct > 2.5 &&
        (level.size >= rankThreshold || level.size >= WALL_ANCHOR_MIN_SIZE_BTC);
      if (level.size < MACRO_DOM_MIN_SIZE_BTC && !farButLarge) {
        diag.skippedBySize += 1;
        continue;
      }
      out.push({
        side,
        price: level.price,
        sizeBtc: level.size,
        intensity: Math.min(
          0.92,
          0.28 + Math.sqrt(level.size) / Math.sqrt(Math.max(1, viewportMaxSize)) * 0.55,
        ),
        runLength: 1,
        persistenceMs: 0,
        source: "dom",
        isLive: true,
      });
    }
  }
  return out;
}

function mergeCandidatesToAnchors(
  candidates: WallCandidate[],
  bridgeUsd: number,
): Map<string, WallCandidate[]> {
  const groups = new Map<string, WallCandidate[]>();
  for (const candidate of candidates) {
    const anchor = anchorBucketPrice(candidate.price, bridgeUsd);
    const key = wallTrackKey(candidate.side, anchor);
    const bucket = groups.get(key);
    if (bucket) bucket.push(candidate);
    else groups.set(key, [candidate]);
  }
  return groups;
}

function updateWallTracker(
  groups: Map<string, WallCandidate[]>,
  now: number,
  dataEndTime: number,
): void {
  const seen = new Set<string>();

  for (const [key, group] of groups) {
    seen.add(key);
    const anchorPrice = Number(key.split(":")[1]);
    const side = key.split(":")[0] as "bid" | "ask";
    const maxSize = Math.max(...group.map((g) => g.sizeBtc));
    const peakIntensity = Math.max(...group.map((g) => g.intensity));
    const currentSize = Math.max(
      ...group.filter((g) => g.isLive).map((g) => g.sizeBtc),
      ...group.map((g) => g.sizeBtc),
    );
    const runLength = Math.max(...group.map((g) => g.runLength ?? 1));
    const histStarts = group
      .map((g) => g.timeBucket)
      .filter((t): t is number => t != null);
    const histEnds = group
      .map((g) => g.endTimeBucket)
      .filter((t): t is number => t != null);
    const historicalStartTime =
      histStarts.length > 0 ? Math.min(...histStarts) : dataEndTime - 60_000;
    const historicalEndTime =
      histEnds.length > 0 ? Math.max(...histEnds) : dataEndTime;
    const isLive = group.some((g) => g.isLive);
    const macroDomSourced = group.some((g) => g.source === "dom");
    const priceMin = Math.min(...group.map((g) => g.price));
    const priceMax = Math.max(...group.map((g) => g.price));

    const prev = wallAnchorTracker.get(key);
    if (!prev) {
      wallIdSeq += 1;
      wallAnchorTracker.set(key, {
        wallId: `wall-${wallIdSeq}`,
        side,
        anchorPrice,
        priceMin,
        priceMax,
        firstSeenTime: now,
        lastSeenTime: now,
        lastActiveTime: isLive ? now : historicalEndTime,
        maxSizeBtc: maxSize,
        prevSizeBtc: maxSize,
        currentSizeBtc: currentSize,
        sizeSampleSum: maxSize,
        sizeSampleCount: 1,
        peakIntensity,
        currentIntensity: peakIntensity,
        historicalStartTime,
        historicalEndTime,
        runLengthPeak: runLength,
        missedSinceMs: 0,
        macroDomSourced,
        lastFrameMs: now,
      });
      continue;
    }

    prev.prevSizeBtc = prev.currentSizeBtc;
    prev.currentSizeBtc = Math.max(prev.currentSizeBtc, currentSize);
    prev.maxSizeBtc = Math.max(prev.maxSizeBtc, maxSize);
    prev.peakIntensity = Math.max(prev.peakIntensity, peakIntensity);
    prev.currentIntensity = peakIntensity;
    prev.lastSeenTime = now;
    prev.lastFrameMs = now;
    prev.missedSinceMs = 0;
    prev.priceMin = Math.min(prev.priceMin, priceMin);
    prev.priceMax = Math.max(prev.priceMax, priceMax);
    prev.runLengthPeak = Math.max(prev.runLengthPeak, runLength);
    prev.historicalStartTime = Math.min(prev.historicalStartTime, historicalStartTime);
    prev.historicalEndTime = Math.max(prev.historicalEndTime, historicalEndTime);
    if (isLive) prev.lastActiveTime = now;
    if (macroDomSourced) prev.macroDomSourced = true;
    prev.sizeSampleSum += currentSize;
    prev.sizeSampleCount += 1;
  }

  for (const [key, track] of wallAnchorTracker) {
    if (seen.has(key)) continue;
    track.missedSinceMs += Math.max(16, now - track.lastFrameMs);
    track.lastFrameMs = now;
    if (track.missedSinceMs >= WALL_ANCHOR_FADE_MS * 1.5) {
      wallAnchorTracker.delete(key);
    }
  }
}

function trackToEntity(
  track: WallTrack,
  now: number,
  dataEndTime: number,
  midPrice: number | null,
  bestBid: number | null,
  bestAsk: number | null,
  regime: BookmapZoomRegime,
): AnchoredWallEntity {
  const touchScore = computeTouchScore(
    track.anchorPrice,
    midPrice,
    bestBid,
    bestAsk,
  );
  const { state, refillScore, pullScore, fadeScore } = deriveWallEntityState(
    track,
    now,
    dataEndTime,
    touchScore,
  );
  const pct = pctFromMid(track.anchorPrice, midPrice);
  const isLive = track.lastActiveTime >= dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS * 2;
  const isHistorical = track.historicalEndTime < dataEndTime + 1;
  const isFarButImportant =
    pct > 2.5 &&
    track.maxSizeBtc >= MACRO_DOM_MIN_SIZE_BTC &&
    regime === "macro";
  const isDominant = track.maxSizeBtc >= WALL_IMPORTANT_BTC;
  const persistenceMs = Math.max(0, track.lastSeenTime - track.firstSeenTime);
  const ageMs = Math.max(0, now - track.firstSeenTime);

  return {
    wallId: track.wallId,
    side: track.side,
    anchorPrice: track.anchorPrice,
    priceMin: track.priceMin,
    priceMax: track.priceMax,
    firstSeenTime: track.firstSeenTime,
    lastSeenTime: track.lastSeenTime,
    lastActiveTime: track.lastActiveTime,
    maxSizeBtc: track.maxSizeBtc,
    currentSizeBtc: track.currentSizeBtc,
    avgSizeBtc:
      track.sizeSampleCount > 0
        ? track.sizeSampleSum / track.sizeSampleCount
        : track.currentSizeBtc,
    peakIntensity: track.peakIntensity,
    currentIntensity: track.currentIntensity,
    persistenceMs,
    ageMs,
    state,
    refillScore,
    pullScore,
    fadeScore,
    touchScore,
    isLive,
    isHistorical: isHistorical || !isLive,
    isNearPrice: pct <= 1.5,
    isFarButImportant,
    isDominant,
    historicalStartTime: track.historicalStartTime,
    historicalEndTime: track.historicalEndTime,
    runLength: track.runLengthPeak,
    macroDomSourced: track.macroDomSourced,
  };
}

export function buildAnchoredWallLayer(input: {
  textureCells: PreparedEngineTextureCell[];
  walls: PreparedEngineWall[];
  bands: HeatmapBand[];
  liveProjectionLevels: PreparedLiveProjectionLevel[];
  activeDomLevels: PreparedLiveProjectionLevel[];
  bookLevels: LiveDomBookLevel[];
  minPrice: number;
  maxPrice: number;
  midPrice: number | null;
  dataEndTime: number;
  timeMin: number;
  bestBid: number | null;
  bestAsk: number | null;
  viewportMaxSize: number;
}): AnchoredWallLayerResult {
  const emptyDiag: WallAnchoringDiagStats = {
    wallCandidates: 0,
    anchoredWalls: 0,
    activeWalls: 0,
    historicalWalls: 0,
    farMacroWalls: 0,
    fadingWalls: 0,
    reinforcedWalls: 0,
    pullingWalls: 0,
    touchedWalls: 0,
    dominantWalls: 0,
    avgWallAgeSec: 0,
    maxWallAgeSec: 0,
    avgPersistenceSec: 0,
    maxPersistenceSec: 0,
    liveProjectionConnected: 0,
    timestamp: Date.now(),
  };
  const emptyMacro: MacroDomCoverageDiagStats = {
    zoomRegime: "macro",
    visiblePriceMin: input.minPrice,
    visiblePriceMax: input.maxPrice,
    domLevelsVisible: 0,
    domLargeLevelsVisible: 0,
    domLargeLevelsRendered: 0,
    farBidWallsRendered: 0,
    farAskWallsRendered: 0,
    domMatchedAnchors: 0,
    domUnmatchedLargeWalls: 0,
    skippedByDistance: 0,
    skippedByCap: 0,
    skippedBySize: 0,
    timestamp: Date.now(),
  };

  if (!BOOKMAP_PERSISTENT_WALL_ANCHORING_V1) {
    return { walls: [], wallAnchoringDiag: emptyDiag, macroDomCoverageDiag: emptyMacro };
  }

  const now = input.dataEndTime;
  const regime = resolveZoomRegime(
    computeVisiblePriceRangePct(input.minPrice, input.maxPrice),
  );
  const macroDiag: MacroDomCoverageDiagStats = {
    ...emptyMacro,
    zoomRegime: regime,
    visiblePriceMin: input.minPrice,
    visiblePriceMax: input.maxPrice,
  };

  const candidates: WallCandidate[] = [
    ...collectTextureSpanCandidates(input.textureCells),
    ...collectBandCandidates(input.bands),
    ...collectPreparedWallCandidates(input.walls),
    ...collectLiveCandidates(input.liveProjectionLevels),
    ...collectLiveCandidates(input.activeDomLevels),
    ...collectMacroDomCandidates(
      input.bookLevels,
      input.minPrice,
      input.maxPrice,
      input.midPrice,
      regime,
      input.viewportMaxSize,
      macroDiag,
    ),
  ];

  const inRange = candidates.filter(
    (c) => c.price >= input.minPrice && c.price <= input.maxPrice,
  );

  const filtered = inRange.filter((c) => {
    const run = c.runLength ?? 1;
    const persistence = c.persistenceMs ?? 0;
    if (
      c.source === "dom" ||
      c.source === "live" ||
      c.source === "prepared_wall"
    ) {
      return true;
    }
    return isWallCandidate(c.sizeBtc, c.intensity, run, persistence, regime);
  });

  const groups = mergeCandidatesToAnchors(
    filtered,
    WALL_ANCHOR_PRICE_BRIDGE_USD,
  );
  updateWallTracker(groups, now, input.dataEndTime);

  let entities = Array.from(wallAnchorTracker.values()).map((track) =>
    trackToEntity(
      track,
      now,
      input.dataEndTime,
      input.midPrice,
      input.bestBid,
      input.bestAsk,
      regime,
    ),
  );

  entities.sort(
    (a, b) =>
      b.maxSizeBtc - a.maxSizeBtc ||
      b.peakIntensity - a.peakIntensity ||
      b.persistenceMs - a.persistenceMs,
  );

  if (entities.length > WALL_ANCHOR_MAX_TRACKED_WALLS) {
    macroDiag.skippedByCap = entities.length - WALL_ANCHOR_MAX_TRACKED_WALLS;
    entities = entities.slice(0, WALL_ANCHOR_MAX_TRACKED_WALLS);
  }

  const domLargeKeys = new Set(
    filtered
      .filter((c) => c.source === "dom" && c.sizeBtc >= MACRO_DOM_MIN_SIZE_BTC)
      .map((c) => wallTrackKey(c.side, anchorBucketPrice(c.price, WALL_ANCHOR_PRICE_BRIDGE_USD))),
  );
  for (const wall of entities) {
    const key = wallTrackKey(wall.side, wall.anchorPrice);
    if (domLargeKeys.has(key)) macroDiag.domMatchedAnchors += 1;
    if (wall.macroDomSourced) macroDiag.domLargeLevelsRendered += 1;
    if (wall.isFarButImportant && wall.side === "bid") {
      macroDiag.farBidWallsRendered += 1;
    }
    if (wall.isFarButImportant && wall.side === "ask") {
      macroDiag.farAskWallsRendered += 1;
    }
  }
  macroDiag.domUnmatchedLargeWalls = Math.max(
    0,
    macroDiag.domLargeLevelsVisible - macroDiag.domMatchedAnchors,
  );

  const ages = entities.map((w) => w.ageMs / 1000);
  const persistences = entities.map((w) => w.persistenceMs / 1000);
  const wallDiag: WallAnchoringDiagStats = {
    wallCandidates: filtered.length,
    anchoredWalls: entities.length,
    activeWalls: entities.filter((w) => w.isLive).length,
    historicalWalls: entities.filter((w) => w.isHistorical).length,
    farMacroWalls: entities.filter((w) => w.isFarButImportant).length,
    fadingWalls: entities.filter((w) => w.state === "fading" || w.state === "stale").length,
    reinforcedWalls: entities.filter((w) => w.state === "reinforced").length,
    pullingWalls: entities.filter((w) => w.state === "pulling").length,
    touchedWalls: entities.filter((w) => w.state === "touched").length,
    dominantWalls: entities.filter((w) => w.isDominant).length,
    avgWallAgeSec:
      ages.length > 0
        ? Number((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1))
        : 0,
    maxWallAgeSec: ages.length > 0 ? Number(Math.max(...ages).toFixed(1)) : 0,
    avgPersistenceSec:
      persistences.length > 0
        ? Number(
            (persistences.reduce((a, b) => a + b, 0) / persistences.length).toFixed(
              1,
            ),
          )
        : 0,
    maxPersistenceSec:
      persistences.length > 0 ? Number(Math.max(...persistences).toFixed(1)) : 0,
    liveProjectionConnected: entities.filter((w) => w.isLive).length,
    timestamp: Date.now(),
  };

  return {
    walls: entities,
    wallAnchoringDiag: wallDiag,
    macroDomCoverageDiag: macroDiag,
  };
}

export function resolveAnchoredWallAlphaMultiplier(
  wall: AnchoredWallEntity,
  regime: BookmapZoomRegime,
): number {
  let mul = 1;
  switch (wall.state) {
    case "new":
      mul = 0.82;
      break;
    case "persistent":
      mul = 1.05;
      break;
    case "reinforced":
      mul = 1.14 + wall.refillScore * 0.08;
      break;
    case "pulling":
      mul = 0.78 - wall.pullScore * 0.12;
      break;
    case "fading":
      mul = 0.55 - wall.fadeScore * 0.2;
      break;
    case "stale":
      mul = 0.38;
      break;
    case "touched":
      mul = 0.92;
      break;
    default:
      break;
  }
  if (wall.isNearPrice) {
    mul *= 1 + WALL_ANCHOR_NEAR_PRICE_BOOST_PCT;
  }
  if (wall.isFarButImportant && regime === "macro") {
    mul = Math.max(
      MACRO_DOM_FAR_WALL_ALPHA_FLOOR,
      mul * MACRO_DOM_DEPTH_ALPHA_MUL,
    );
  }
  return mul;
}

export function resetWallAnchorTrackerForTests(): void {
  wallAnchorTracker.clear();
  wallIdSeq = 0;
}
