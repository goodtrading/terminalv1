/**
 * B.6 — Limit Order Lifecycle Engine: track DOM levels as living entities.
 */

import {
  BOOKMAP_LIMIT_ORDER_LIFECYCLE_DIAG,
  BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1,
  LIMIT_ORDER_DOMINANT_SIZE_BTC,
  LIMIT_ORDER_FADE_MS,
  LIMIT_ORDER_MAX_TRACKED_LEVELS,
  LIMIT_ORDER_MIN_SIZE_BTC_MACRO,
  LIMIT_ORDER_MIN_SIZE_BTC_MICRO,
  LIMIT_ORDER_PERSISTENT_MS,
  LIMIT_ORDER_PRICE_BUCKET_USD,
  LIMIT_ORDER_PULL_THRESHOLD,
  LIMIT_ORDER_REFILL_THRESHOLD,
  LIMIT_ORDER_STALE_MS,
  LIMIT_ORDER_TOUCH_PCT,
  LIMIT_ORDER_WALL_SIZE_BTC,
  type BookmapZoomRegime,
} from "@/lib/bookmapEngineConfig";
import { bucketPrice } from "./domLadderUtils";
import type { PreparedEngineRenderData } from "./bookmapEnginePrepare";

export type LimitOrderLifecycleState =
  | "new"
  | "active"
  | "persistent"
  | "reinforced"
  | "pulling"
  | "fading"
  | "stale"
  | "touched";

export type LimitOrderLifecycleLevel = {
  id: string;
  side: "bid" | "ask";
  price: number;
  priceBucket: number;
  firstSeenTime: number;
  lastSeenTime: number;
  lastActiveTime: number;
  disappearedAt: number | null;
  currentSizeBtc: number;
  previousSizeBtc: number;
  peakSizeBtc: number;
  avgSizeBtc: number;
  sizeDeltaBtc: number;
  persistenceMs: number;
  ageMs: number;
  updateCount: number;
  state: LimitOrderLifecycleState;
  intensity: number;
  fadeAlpha: number;
  refillScore: number;
  pullScore: number;
  touchedScore: number;
  isLive: boolean;
  isHistorical: boolean;
  isWall: boolean;
  isDominant: boolean;
  isNearPrice: boolean;
  disappearedAt: number | null;
};

export type LimitOrderLifecycleDiagStats = {
  lifecycleActive: boolean;
  rawLevelsInput: number;
  trackedLevels: number;
  liveLevels: number;
  historicalLevels: number;
  newLevels: number;
  persistentLevels: number;
  reinforcedLevels: number;
  pullingLevels: number;
  fadingLevels: number;
  staleLevels: number;
  touchedLevels: number;
  walls: number;
  dominantWalls: number;
  avgPersistenceSec: number;
  maxPersistenceSec: number;
  avgAgeSec: number;
  maxAgeSec: number;
  removedByCap: number;
  visibleDrawn: number;
  rawLevelSources: string;
  timestamp: number;
};

export type LimitOrderLifecycleUpdateInput = {
  engine: PreparedEngineRenderData;
  minPrice: number;
  maxPrice: number;
  spot: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  dataEndTime: number;
  now: number;
  regime: BookmapZoomRegime;
  priceBucketUsd?: number;
};

type RawLevelRow = {
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
  source: string;
};

type InternalLevel = LimitOrderLifecycleLevel & {
  sizeSum: number;
  sizeSamples: number;
};

const lifecycleStore = new Map<string, InternalLevel>();

let lastLifecycleDiag: LimitOrderLifecycleDiagStats = {
  lifecycleActive: false,
  rawLevelsInput: 0,
  trackedLevels: 0,
  liveLevels: 0,
  historicalLevels: 0,
  newLevels: 0,
  persistentLevels: 0,
  reinforcedLevels: 0,
  pullingLevels: 0,
  fadingLevels: 0,
  staleLevels: 0,
  touchedLevels: 0,
  walls: 0,
  dominantWalls: 0,
  avgPersistenceSec: 0,
  maxPersistenceSec: 0,
  avgAgeSec: 0,
  maxAgeSec: 0,
  removedByCap: 0,
  visibleDrawn: 0,
  rawLevelSources: "none",
  timestamp: 0,
};

let lastLifecycleDiagLogMs = 0;
let removedByCapLastFrame = 0;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function levelKey(side: "bid" | "ask", priceBucket: number): string {
  return `${side}:${priceBucket}`;
}

function toPriceBucket(price: number, bucketUsd: number): number {
  return bucketPrice(price, Math.max(1, bucketUsd));
}

function sizeToIntensity(sizeBtc: number): number {
  return clamp01(sizeBtc / LIMIT_ORDER_DOMINANT_SIZE_BTC);
}

function minSizeForRegime(regime: BookmapZoomRegime): number {
  return regime === "macro"
    ? LIMIT_ORDER_MIN_SIZE_BTC_MACRO
    : LIMIT_ORDER_MIN_SIZE_BTC_MICRO;
}

function pctFromMid(price: number, mid: number | null): number {
  if (mid == null || mid <= 0) return 50;
  return (Math.abs(price - mid) / mid) * 100;
}

function isNearPriceLevel(
  price: number,
  spot: number | null,
  bestBid: number | null,
  bestAsk: number | null,
): boolean {
  const refs = [spot, bestBid, bestAsk].filter((v): v is number => v != null && v > 0);
  if (refs.length === 0) return false;
  return refs.some((ref) => pctFromMid(price, ref) <= LIMIT_ORDER_TOUCH_PCT);
}

function isTouchedLevel(
  side: "bid" | "ask",
  price: number,
  spot: number | null,
  bestBid: number | null,
  bestAsk: number | null,
): boolean {
  if (bestBid != null && side === "bid" && Math.abs(price - bestBid) <= LIMIT_ORDER_PRICE_BUCKET_USD) {
    return true;
  }
  if (bestAsk != null && side === "ask" && Math.abs(price - bestAsk) <= LIMIT_ORDER_PRICE_BUCKET_USD) {
    return true;
  }
  if (spot != null && Math.abs(price - spot) <= LIMIT_ORDER_PRICE_BUCKET_USD * 1.5) {
    return true;
  }
  return false;
}

/** Collect all raw DOM levels available in renderData for lifecycle tracking. */
export function collectRawLevelsForLifecycleWithMeta(
  engine: PreparedEngineRenderData,
  minPrice: number,
  maxPrice: number,
): { levels: RawLevelRow[]; sources: string } {
  const map = new Map<string, RawLevelRow>();
  const sources = new Set<string>();

  const add = (side: "bid" | "ask", price: number, sizeBtc: number, source: string) => {
    if (price < minPrice || price > maxPrice || sizeBtc <= 0) return;
    sources.add(source);
    const bucket = toPriceBucket(price, LIMIT_ORDER_PRICE_BUCKET_USD);
    const key = levelKey(side, bucket);
    const prev = map.get(key);
    if (!prev || sizeBtc > prev.sizeBtc) {
      map.set(key, { side, price, sizeBtc, source });
    }
  };

  for (const row of engine.currentDomBookLevels ?? []) {
    add(row.side, row.price, row.size, "currentDomBook");
  }

  const sel = engine.liveDomSelection;
  if (sel) {
    for (const level of sel.levels) {
      add(level.side, level.price, level.sizeBtc, "liveDomSelection");
    }
    for (const level of sel.activeDomBands) {
      add(level.side, level.price, level.sizeBtc, "activeDomBands");
    }
    for (let i = 0; i < sel.largestDomBidPrices.length; i += 1) {
      add("bid", sel.largestDomBidPrices[i]!, sel.largestDomBidSizes[i] ?? 0, "largestDom");
    }
    for (let i = 0; i < sel.largestDomAskPrices.length; i += 1) {
      add("ask", sel.largestDomAskPrices[i]!, sel.largestDomAskSizes[i] ?? 0, "largestDom");
    }
  }

  for (const level of [
    ...(engine.activeDomBands ?? []),
    ...(engine.liveProjectionLevels ?? []),
  ]) {
    add(level.side, level.price, level.sizeBtc, "liveProjection");
  }

  for (const wall of engine.walls ?? []) {
    add(wall.side, wall.price, wall.maxSeenSize, "engineWalls");
  }

  for (const band of engine.bands ?? []) {
    if (band.maxSize >= LIMIT_ORDER_WALL_SIZE_BTC) {
      add(band.side, band.price, band.maxSize, "engineBands");
    }
  }

  return {
    levels: Array.from(map.values()),
    sources: sources.size ? [...sources].join("+") : "none",
  };
}

function resolveStateForLive(
  entry: InternalLevel,
  now: number,
  sizeDeltaRatio: number,
): LimitOrderLifecycleState {
  const ageMs = now - entry.firstSeenTime;
  if (entry.updateCount <= 1 && ageMs < 2_000) return "new";
  if (sizeDeltaRatio >= LIMIT_ORDER_REFILL_THRESHOLD) return "reinforced";
  if (sizeDeltaRatio <= -LIMIT_ORDER_PULL_THRESHOLD) return "pulling";
  if (entry.persistenceMs >= LIMIT_ORDER_PERSISTENT_MS) return "persistent";
  return "active";
}

function resolveFadeAlpha(entry: InternalLevel, now: number): number {
  if (entry.isLive) return 1;
  if (entry.disappearedAt == null) return 0.35;
  const elapsed = now - entry.disappearedAt;
  if (elapsed >= LIMIT_ORDER_STALE_MS) return 0.04;
  if (elapsed >= LIMIT_ORDER_FADE_MS) return 0.12;
  return clamp01(1 - elapsed / LIMIT_ORDER_FADE_MS) * 0.72;
}

function trimStoreByCap(): number {
  if (lifecycleStore.size <= LIMIT_ORDER_MAX_TRACKED_LEVELS) return 0;
  const sorted = [...lifecycleStore.entries()].sort(
    (a, b) => {
      const scoreA =
        (a[1].isLive ? 1_000_000 : 0) +
        a[1].peakSizeBtc * 100 +
        a[1].persistenceMs * 0.01;
      const scoreB =
        (b[1].isLive ? 1_000_000 : 0) +
        b[1].peakSizeBtc * 100 +
        b[1].persistenceMs * 0.01;
      return scoreA - scoreB;
    },
  );
  const removeCount = lifecycleStore.size - LIMIT_ORDER_MAX_TRACKED_LEVELS;
  for (let i = 0; i < removeCount; i += 1) {
    lifecycleStore.delete(sorted[i]![0]);
  }
  return removeCount;
}

export function updateLimitOrderLifecycleEngine(
  input: LimitOrderLifecycleUpdateInput,
): LimitOrderLifecycleLevel[] {
  if (!BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1) {
    return [];
  }

  const {
    engine,
    minPrice,
    maxPrice,
    spot,
    dataEndTime,
    now,
    regime,
  } = input;
  const bestBid = input.bestBid ?? engine.liveDomSelection?.bestBid ?? null;
  const bestAsk = input.bestAsk ?? engine.liveDomSelection?.bestAsk ?? null;
  const bucketUsd = input.priceBucketUsd ?? LIMIT_ORDER_PRICE_BUCKET_USD;
  const minSize = minSizeForRegime(regime);

  const { levels: rawLevels, sources } = collectRawLevelsForLifecycleWithMeta(
    engine,
    minPrice,
    maxPrice,
  );

  const seenKeys = new Set<string>();
  removedByCapLastFrame = 0;

  for (const raw of rawLevels) {
    if (raw.sizeBtc < minSize) continue;
    const priceBucket = toPriceBucket(raw.price, bucketUsd);
    const key = levelKey(raw.side, priceBucket);
    seenKeys.add(key);

    const prev = lifecycleStore.get(key);
    const previousSize = prev?.currentSizeBtc ?? 0;
    const sizeDelta = raw.sizeBtc - previousSize;
    const sizeDeltaRatio =
      previousSize > 0 ? sizeDelta / previousSize : raw.sizeBtc > 0 ? 1 : 0;

    if (!prev) {
      const entry: InternalLevel = {
        id: key,
        side: raw.side,
        price: raw.price,
        priceBucket,
        firstSeenTime: now,
        lastSeenTime: now,
        lastActiveTime: now,
        disappearedAt: null,
        currentSizeBtc: raw.sizeBtc,
        previousSizeBtc: 0,
        peakSizeBtc: raw.sizeBtc,
        avgSizeBtc: raw.sizeBtc,
        sizeDeltaBtc: sizeDelta,
        persistenceMs: 0,
        ageMs: 0,
        updateCount: 1,
        state: "new",
        intensity: sizeToIntensity(raw.sizeBtc),
        fadeAlpha: 1,
        refillScore: 0,
        pullScore: 0,
        touchedScore: 0,
        isLive: true,
        isHistorical: false,
        isWall: raw.sizeBtc >= LIMIT_ORDER_WALL_SIZE_BTC,
        isDominant: raw.sizeBtc >= LIMIT_ORDER_DOMINANT_SIZE_BTC,
        isNearPrice: isNearPriceLevel(raw.price, spot, bestBid, bestAsk),
        sizeSum: raw.sizeBtc,
        sizeSamples: 1,
      };
      lifecycleStore.set(key, entry);
      continue;
    }

    prev.previousSizeBtc = previousSize;
    prev.currentSizeBtc = raw.sizeBtc;
    prev.price = raw.price;
    prev.lastSeenTime = now;
    prev.lastActiveTime = now;
    prev.disappearedAt = null;
    prev.updateCount += 1;
    prev.sizeDeltaBtc = sizeDelta;
    prev.peakSizeBtc = Math.max(prev.peakSizeBtc, raw.sizeBtc);
    prev.sizeSum += raw.sizeBtc;
    prev.sizeSamples += 1;
    prev.avgSizeBtc = prev.sizeSum / prev.sizeSamples;
    prev.persistenceMs = now - prev.firstSeenTime;
    prev.ageMs = prev.persistenceMs;
    prev.intensity = sizeToIntensity(Math.max(raw.sizeBtc, prev.peakSizeBtc * 0.85));
    prev.isLive = true;
    prev.isHistorical = prev.persistenceMs > 3_000;
    prev.isWall = prev.peakSizeBtc >= LIMIT_ORDER_WALL_SIZE_BTC;
    prev.isDominant = prev.peakSizeBtc >= LIMIT_ORDER_DOMINANT_SIZE_BTC;
    prev.isNearPrice = isNearPriceLevel(raw.price, spot, bestBid, bestAsk);

    if (sizeDeltaRatio >= LIMIT_ORDER_REFILL_THRESHOLD) {
      prev.refillScore = clamp01(prev.refillScore + sizeDeltaRatio);
      prev.pullScore = Math.max(0, prev.pullScore - 0.08);
    } else if (sizeDeltaRatio <= -LIMIT_ORDER_PULL_THRESHOLD) {
      prev.pullScore = clamp01(prev.pullScore + Math.abs(sizeDeltaRatio));
      prev.refillScore = Math.max(0, prev.refillScore - 0.05);
    } else {
      prev.refillScore = Math.max(0, prev.refillScore - 0.02);
      prev.pullScore = Math.max(0, prev.pullScore - 0.03);
    }

    let state = resolveStateForLive(prev, now, sizeDeltaRatio);
    if (isTouchedLevel(raw.side, raw.price, spot, bestBid, bestAsk)) {
      prev.touchedScore = clamp01(prev.touchedScore + 0.15);
      if (state !== "pulling" && state !== "new") state = "touched";
    } else {
      prev.touchedScore = Math.max(0, prev.touchedScore - 0.04);
    }
    prev.state = state;
    prev.fadeAlpha = 1;
  }

  for (const [key, entry] of lifecycleStore) {
    if (seenKeys.has(key)) continue;
    if (!entry.isLive && entry.disappearedAt != null) {
      const elapsed = now - entry.disappearedAt;
      if (elapsed >= LIMIT_ORDER_STALE_MS) {
        lifecycleStore.delete(key);
        removedByCapLastFrame += 1;
        continue;
      }
      entry.state = elapsed >= LIMIT_ORDER_FADE_MS ? "stale" : "fading";
      entry.fadeAlpha = resolveFadeAlpha(entry, now);
      entry.isLive = false;
      entry.isHistorical = true;
      entry.currentSizeBtc = Math.max(entry.previousSizeBtc * 0.65, entry.peakSizeBtc * 0.35);
      entry.intensity = sizeToIntensity(entry.peakSizeBtc) * entry.fadeAlpha;
      continue;
    }

    entry.isLive = false;
    entry.disappearedAt = entry.disappearedAt ?? now;
    entry.state = "fading";
    entry.fadeAlpha = resolveFadeAlpha(entry, now);
    entry.isHistorical = true;
    entry.currentSizeBtc = Math.max(entry.previousSizeBtc * 0.65, entry.peakSizeBtc * 0.35);
    entry.intensity = sizeToIntensity(entry.peakSizeBtc) * entry.fadeAlpha;
    entry.pullScore = clamp01(entry.pullScore + 0.12);
  }

  removedByCapLastFrame += trimStoreByCap();

  const visible: LimitOrderLifecycleLevel[] = [];
  let live = 0;
  let historical = 0;
  let newC = 0;
  let persistent = 0;
  let reinforced = 0;
  let pulling = 0;
  let fading = 0;
  let stale = 0;
  let touched = 0;
  let walls = 0;
  let dominant = 0;
  let persistSum = 0;
  let ageSum = 0;
  let maxPersist = 0;
  let maxAge = 0;

  for (const entry of lifecycleStore.values()) {
    if (entry.state === "stale" && entry.fadeAlpha < 0.06) continue;
    if (!entry.isLive && entry.fadeAlpha < 0.05) continue;

    const out: LimitOrderLifecycleLevel = {
      id: entry.id,
      side: entry.side,
      price: entry.price,
      priceBucket: entry.priceBucket,
      firstSeenTime: entry.firstSeenTime,
      lastSeenTime: entry.lastSeenTime,
      lastActiveTime: entry.lastActiveTime,
      disappearedAt: entry.disappearedAt,
      currentSizeBtc: entry.currentSizeBtc,
      previousSizeBtc: entry.previousSizeBtc,
      peakSizeBtc: entry.peakSizeBtc,
      avgSizeBtc: entry.avgSizeBtc,
      sizeDeltaBtc: entry.sizeDeltaBtc,
      persistenceMs: entry.persistenceMs,
      ageMs: entry.ageMs,
      updateCount: entry.updateCount,
      state: entry.state,
      intensity: entry.intensity,
      fadeAlpha: entry.fadeAlpha,
      refillScore: entry.refillScore,
      pullScore: entry.pullScore,
      touchedScore: entry.touchedScore,
      isLive: entry.isLive,
      isHistorical: entry.isHistorical,
      isWall: entry.isWall,
      isDominant: entry.isDominant,
      isNearPrice: entry.isNearPrice,
    };

    visible.push(out);
    if (entry.isLive) live += 1;
    else historical += 1;
    if (entry.state === "new") newC += 1;
    if (entry.state === "persistent") persistent += 1;
    if (entry.state === "reinforced") reinforced += 1;
    if (entry.state === "pulling") pulling += 1;
    if (entry.state === "fading") fading += 1;
    if (entry.state === "stale") stale += 1;
    if (entry.state === "touched") touched += 1;
    if (entry.isWall) walls += 1;
    if (entry.isDominant) dominant += 1;
    persistSum += entry.persistenceMs;
    ageSum += entry.ageMs;
    maxPersist = Math.max(maxPersist, entry.persistenceMs);
    maxAge = Math.max(maxAge, entry.ageMs);
  }

  const tracked = lifecycleStore.size;
  lastLifecycleDiag = {
    lifecycleActive: true,
    rawLevelsInput: rawLevels.length,
    trackedLevels: tracked,
    liveLevels: live,
    historicalLevels: historical,
    newLevels: newC,
    persistentLevels: persistent,
    reinforcedLevels: reinforced,
    pullingLevels: pulling,
    fadingLevels: fading,
    staleLevels: stale,
    touchedLevels: touched,
    walls,
    dominantWalls: dominant,
    avgPersistenceSec: tracked > 0 ? persistSum / tracked / 1000 : 0,
    maxPersistenceSec: maxPersist / 1000,
    avgAgeSec: tracked > 0 ? ageSum / tracked / 1000 : 0,
    maxAgeSec: maxAge / 1000,
    removedByCap: removedByCapLastFrame,
    visibleDrawn: 0,
    rawLevelSources: sources,
    timestamp: now,
  };

  emitLimitOrderLifecycleDiag();
  void dataEndTime;
  return visible;
}

export function getLimitOrderLifecycleDiagStats(): LimitOrderLifecycleDiagStats {
  return lastLifecycleDiag;
}

export function setLimitOrderLifecycleVisibleDrawn(count: number): void {
  lastLifecycleDiag = { ...lastLifecycleDiag, visibleDrawn: count };
}

function emitLimitOrderLifecycleDiag(): void {
  if (!import.meta.env.DEV || !BOOKMAP_LIMIT_ORDER_LIFECYCLE_DIAG) return;
  const now = Date.now();
  if (now - lastLifecycleDiagLogMs < 2_000) return;
  lastLifecycleDiagLogMs = now;
  console.debug("[BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1_DIAG]", {
    ...lastLifecycleDiag,
  });
}

/** Visual alpha multiplier from lifecycle state. */
export function resolveLifecycleVisualAlpha(level: LimitOrderLifecycleLevel): number {
  let mul = level.fadeAlpha;
  switch (level.state) {
    case "new":
      mul *= 0.62;
      break;
    case "active":
      mul *= 0.88;
      break;
    case "persistent":
      mul *= 1.06;
      break;
    case "reinforced":
      mul *= 1.12;
      break;
    case "pulling":
      mul *= 0.52;
      break;
    case "fading":
      mul *= level.fadeAlpha * 0.85;
      break;
    case "stale":
      mul *= 0.08;
      break;
    case "touched":
      mul *= 1.04;
      break;
    default:
      break;
  }
  if (level.touchedScore > 0.2) mul *= 1 + level.touchedScore * 0.08;
  return clamp01(mul);
}

/** Size used for thermal mapping — peak for historical, current for live. */
export function resolveLifecycleThermalSize(level: LimitOrderLifecycleLevel): number {
  if (level.isLive) return level.currentSizeBtc;
  return Math.max(level.peakSizeBtc * 0.75, level.currentSizeBtc);
}

export function resetLimitOrderLifecycleEngine(): void {
  lifecycleStore.clear();
}
