import {
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG,
  BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_V1,
  HISTORICAL_SURFACE_CACHE_KEY_PREFIX,
  HISTORICAL_SURFACE_CACHE_SAVE_MS,
  HISTORICAL_SURFACE_INITIAL_BACKFILL_MS,
  HISTORICAL_SURFACE_MAX_GAP_FILL_MS,
  HISTORICAL_SURFACE_MAX_ACTIVE_LEVELS,
  HISTORICAL_SURFACE_MAX_CELLS,
  HISTORICAL_SURFACE_MIN_SIZE_BTC,
  HISTORICAL_SURFACE_PRICE_BUCKET_USD,
  HISTORICAL_SURFACE_RETENTION_MS,
  HISTORICAL_SURFACE_RENDER_MIN_INTENSITY,
} from "@/lib/bookmapEngineConfig";
import type { BookmapState } from "@/types/bookmapState";
import type { LiveDomBookLevel } from "./bookmapLiveDomPriority";

export type HistoricalLiquiditySurfaceCell = {
  timeBucket: number;
  price: number;
  side: "bid" | "ask";
  bidSize: number;
  askSize: number;
  maxSize: number;
  firstSeenTs: number;
  lastSeenTs: number;
  persistenceMs: number;
  stale: boolean;
  decay: number;
  currentSize: number;
  previousSize: number;
  peakSize: number;
  intensity: number;
  sizeDelta: number;
  coldStartSeeded?: boolean;
  liveUpdated?: boolean;
  textureMod?: number;
};

export type ActiveRestingLiquidityLevel = {
  price: number;
  side: "bid" | "ask";
  currentSize: number;
  askSize: number;
  bidSize: number;
  previousSize: number;
  peakSize: number;
  firstSeenTs: number;
  lastUpdateTs: number;
  persistenceMs: number;
};

export type HistoricalLiquiditySurfaceDiag = {
  enabled: boolean;
  rendererPath: string;
  visibleBucketCount: number;
  visiblePriceLevels: number;
  activeHistoricalCells: number;
  activeRestingLevels: number;
  maxLiquidityInViewport: number;
  minLiquidityInViewport: number;
  medianLiquidityInViewport: number;
  intensityThreshold: number;
  skippedCellsTooOld: number;
  skippedCellsTooNew: number;
  skippedCellsOutOfPrice: number;
  skippedCellsBelowSize: number;
  selectedLevelCount: number;
  sourceLevelCount: number;
  bucketMergeFactor: number;
  priceLevelMergeFactor: number;
  coldStartSeededCellCount: number;
  liveUpdatedCellCount: number;
  renderedWeakCells: number;
  renderedMediumCells: number;
  renderedStrongCells: number;
  visiblePriceLevelsAbovePrice: number;
  visiblePriceLevelsBelowPrice: number;
  domLadderTickSize: number;
  heatmapPriceBucketSize: number;
  effectiveRenderPriceStep: number;
  priceAxisStep: number;
  visiblePriceMin: number;
  visiblePriceMax: number;
  visibleRangeAbovePrice: number;
  visibleRangeBelowPrice: number;
  heatmapRowsAlignedToDom: boolean;
  priceRoundingModeUsedByHeatmap: string;
  priceRoundingModeUsedByDomCob: string;
  skippedEmptyLevels: number;
  inactiveLevelCount: number;
  cacheBucketCount: number;
  cacheMemoryEstimate: number;
  renderCellCountPerFrame: number;
  cacheCellCount: number;
  evictedCells: number;
  sourceKey: string;
  timestamp: number;
};

type SurfaceStore = {
  cells: Map<string, HistoricalLiquiditySurfaceCell>;
  active: Map<string, ActiveRestingLiquidityLevel>;
  loaded: boolean;
  lastSaveMs: number;
};

type SurfaceCachePayload = {
  version: 1;
  savedAt: number;
  cells: HistoricalLiquiditySurfaceCell[];
  active: ActiveRestingLiquidityLevel[];
};

type UpdateHistoricalLiquiditySurfaceParams = {
  state: BookmapState;
  levels: LiveDomBookLevel[];
  sourceKey: string;
  priceBucketSize: number;
  heatmapBucketSize: number;
  priceAxisStep: number;
  visibleStartTime: number;
  visibleEndTime: number;
  minPrice: number;
  maxPrice: number;
  midPrice?: number | null;
};

type UpdateHistoricalLiquiditySurfaceResult = {
  cells: HistoricalLiquiditySurfaceCell[];
  activeLevels: ActiveRestingLiquidityLevel[];
  diag: HistoricalLiquiditySurfaceDiag;
};

const stores = new Map<string, SurfaceStore>();
let lastDiagLogMs = 0;

function isDesktopRuntime(): boolean {
  return import.meta.env.VITE_PLATFORM === "desktop";
}

function nowMs(state: BookmapState): number {
  return state.timestamp > 0 ? state.timestamp : Date.now();
}

function roundBucket(timeMs: number, bucketMs: number): number {
  return Math.floor(timeMs / bucketMs) * bucketMs;
}

function bucketPrice(price: number, step: number): number {
  const safeStep =
    Number.isFinite(step) && step > 0 ? step : HISTORICAL_SURFACE_PRICE_BUCKET_USD;
  return Math.round(price / safeStep) * safeStep;
}

function activeKey(side: "bid" | "ask", price: number): string {
  return `${side}:${price}`;
}

function cellKey(timeBucket: number, price: number): string {
  return `${timeBucket}:${price}`;
}

function cacheKey(sourceKey: string): string {
  return `${HISTORICAL_SURFACE_CACHE_KEY_PREFIX}:${sourceKey}`;
}

function emptyDiag(sourceKey: string): HistoricalLiquiditySurfaceDiag {
  return {
    visibleBucketCount: 0,
    enabled: false,
    rendererPath: "minimal-stable-historical-surface",
    visiblePriceLevels: 0,
    activeHistoricalCells: 0,
    activeRestingLevels: 0,
    maxLiquidityInViewport: 0,
    minLiquidityInViewport: 0,
    medianLiquidityInViewport: 0,
    intensityThreshold: HISTORICAL_SURFACE_RENDER_MIN_INTENSITY,
    skippedCellsTooOld: 0,
    skippedCellsTooNew: 0,
    skippedCellsOutOfPrice: 0,
    skippedCellsBelowSize: 0,
    selectedLevelCount: 0,
    sourceLevelCount: 0,
    bucketMergeFactor: 1,
    priceLevelMergeFactor: 1,
    coldStartSeededCellCount: 0,
    liveUpdatedCellCount: 0,
    renderedWeakCells: 0,
    renderedMediumCells: 0,
    renderedStrongCells: 0,
    visiblePriceLevelsAbovePrice: 0,
    visiblePriceLevelsBelowPrice: 0,
    domLadderTickSize: 0,
    heatmapPriceBucketSize: 0,
    effectiveRenderPriceStep: 0,
    priceAxisStep: 0,
    visiblePriceMin: 0,
    visiblePriceMax: 0,
    visibleRangeAbovePrice: 0,
    visibleRangeBelowPrice: 0,
    heatmapRowsAlignedToDom: true,
    priceRoundingModeUsedByHeatmap: "nearest-dom-bucket",
    priceRoundingModeUsedByDomCob: "nearest-dom-bucket",
    skippedEmptyLevels: 0,
    inactiveLevelCount: 0,
    cacheBucketCount: 0,
    cacheMemoryEstimate: 0,
    renderCellCountPerFrame: 0,
    cacheCellCount: 0,
    evictedCells: 0,
    sourceKey,
    timestamp: Date.now(),
  };
}

function getStore(sourceKey: string): SurfaceStore {
  let store = stores.get(sourceKey);
  if (!store) {
    store = {
      cells: new Map(),
      active: new Map(),
      loaded: false,
      lastSaveMs: 0,
    };
    stores.set(sourceKey, store);
  }
  if (!store.loaded) {
    loadStore(sourceKey, store);
    store.loaded = true;
  }
  return store;
}

function loadStore(sourceKey: string, store: SurfaceStore): void {
  if (!isDesktopRuntime() || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(cacheKey(sourceKey));
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<SurfaceCachePayload>;
    if (parsed.version !== 1 || !Array.isArray(parsed.cells)) return;
    const cutoff = Date.now() - HISTORICAL_SURFACE_RETENTION_MS;
    for (const cell of parsed.cells) {
      if (!cell || cell.lastSeenTs < cutoff) continue;
      store.cells.set(cellKey(cell.timeBucket, cell.price), cell);
    }
    if (Array.isArray(parsed.active)) {
      for (const level of parsed.active) {
        if (!level || level.lastUpdateTs < cutoff) continue;
        store.active.set(activeKey(level.side, level.price), level);
      }
    }
  } catch {
    window.localStorage.removeItem(cacheKey(sourceKey));
  }
}

function saveStore(sourceKey: string, store: SurfaceStore, now: number): void {
  if (!isDesktopRuntime() || typeof window === "undefined") return;
  if (now - store.lastSaveMs < HISTORICAL_SURFACE_CACHE_SAVE_MS) return;
  store.lastSaveMs = now;
  try {
    const cells = Array.from(store.cells.values())
      .sort((a, b) => b.lastSeenTs - a.lastSeenTs)
      .slice(0, HISTORICAL_SURFACE_MAX_CELLS);
    const active = Array.from(store.active.values())
      .sort((a, b) => b.lastUpdateTs - a.lastUpdateTs)
      .slice(0, HISTORICAL_SURFACE_MAX_ACTIVE_LEVELS);
    const payload: SurfaceCachePayload = {
      version: 1,
      savedAt: now,
      cells,
      active,
    };
    window.localStorage.setItem(cacheKey(sourceKey), JSON.stringify(payload));
  } catch {
    // Local cache is opportunistic; rendering must keep working without it.
  }
}

function estimateBytes(store: SurfaceStore): number {
  return store.cells.size * 190 + store.active.size * 120;
}

function computeIntensity(size: number, peakSize: number, persistenceMs: number): number {
  const sizeScore = Math.log1p(Math.max(0, size)) / Math.log1p(120);
  const peakScore = Math.log1p(Math.max(0, peakSize)) / Math.log1p(180);
  const persistenceScore = Math.min(0.28, persistenceMs / 90_000);
  return Math.max(
    HISTORICAL_SURFACE_RENDER_MIN_INTENSITY,
    Math.min(1, sizeScore * 0.74 + peakScore * 0.18 + persistenceScore),
  );
}

function textureModFor(price: number, timeBucket: number, side: "bid" | "ask"): number {
  const seed =
    Math.sin(price * 0.013 + timeBucket * 0.000_071 + (side === "bid" ? 1.7 : 2.9)) *
    10_000;
  const frac = seed - Math.floor(seed);
  return 0.74 + frac * 0.36;
}

function shouldSeedColdBucket(price: number, timeBucket: number, side: "bid" | "ask"): boolean {
  const seed =
    Math.sin(price * 0.021 + timeBucket * 0.000_113 + (side === "bid" ? 0.3 : 0.9)) *
    10_000;
  const frac = seed - Math.floor(seed);
  return frac > 0.46;
}

function selectLevels(
  levels: LiveDomBookLevel[],
  minPrice: number,
  maxPrice: number,
  midPrice: number | null | undefined,
): LiveDomBookLevel[] {
  const range = maxPrice - minPrice;
  const expandedMin = minPrice - range * 0.55;
  const expandedMax = maxPrice + range * 0.55;
  const filtered = levels.filter(
    (level) =>
      level.size >= HISTORICAL_SURFACE_MIN_SIZE_BTC &&
      level.price >= expandedMin &&
      level.price <= expandedMax,
  );
  const mid = midPrice && midPrice > 0 ? midPrice : (minPrice + maxPrice) / 2;
  return filtered
    .sort((a, b) => {
      const aNear = Math.abs(a.price - mid);
      const bNear = Math.abs(b.price - mid);
      const aNearPct = mid > 0 ? (aNear / mid) * 100 : 100;
      const bNearPct = mid > 0 ? (bNear / mid) * 100 : 100;
      const aScore =
        Math.log1p(a.size) * 22_000 + Math.max(0, 5 - aNearPct) * 1_000 - aNear * 0.4;
      const bScore =
        Math.log1p(b.size) * 22_000 + Math.max(0, 5 - bNearPct) * 1_000 - bNear * 0.4;
      return bScore - aScore;
    })
    .slice(0, HISTORICAL_SURFACE_MAX_ACTIVE_LEVELS);
}

function writeSurfaceCell(params: {
  store: SurfaceStore;
  timeBucket: number;
  price: number;
  side: "bid" | "ask";
  size: number;
  previousSize: number;
  peakSize: number;
  firstSeenTs: number;
  lastSeenTs: number;
  coldStartSeeded: boolean;
}): void {
  const cKey = cellKey(params.timeBucket, params.price);
  const existing = params.store.cells.get(cKey);
  const bidSize = params.side === "bid" ? params.size : existing?.bidSize ?? 0;
  const askSize = params.side === "ask" ? params.size : existing?.askSize ?? 0;
  const maxSize = Math.max(existing?.maxSize ?? 0, bidSize, askSize, params.peakSize);
  const currentSize = Math.max(bidSize, askSize);
  const firstCellTs = existing?.firstSeenTs ?? params.firstSeenTs;
  const persistenceMs = Math.max(0, params.lastSeenTs - params.firstSeenTs);
  const textureMod = textureModFor(params.price, params.timeBucket, params.side);
  const seedAlpha = params.coldStartSeeded ? 0.22 : 1;
  const effectiveCurrentSize = currentSize * seedAlpha;
  const effectivePeakSize = params.peakSize * (params.coldStartSeeded ? 0.28 : 1);
  params.store.cells.set(cKey, {
    timeBucket: params.timeBucket,
    price: params.price,
    side: bidSize >= askSize ? "bid" : "ask",
    bidSize,
    askSize,
    maxSize: params.coldStartSeeded
      ? Math.max(existing?.maxSize ?? 0, effectiveCurrentSize)
      : maxSize,
    firstSeenTs: firstCellTs,
    lastSeenTs: params.lastSeenTs,
    persistenceMs: Math.max(persistenceMs, params.lastSeenTs - firstCellTs),
    stale: false,
    decay: 1,
    currentSize: effectiveCurrentSize,
    previousSize: params.previousSize,
    peakSize: effectivePeakSize,
    intensity: computeIntensity(effectiveCurrentSize, effectivePeakSize, persistenceMs),
    sizeDelta: effectiveCurrentSize - params.previousSize,
    coldStartSeeded: params.coldStartSeeded,
    liveUpdated: !params.coldStartSeeded,
    textureMod,
  });
}

function pruneStore(store: SurfaceStore, now: number): number {
  const cutoff = now - HISTORICAL_SURFACE_RETENTION_MS;
  let evicted = 0;
  for (const [key, cell] of Array.from(store.cells.entries())) {
    if (cell.lastSeenTs < cutoff) {
      store.cells.delete(key);
      evicted += 1;
    }
  }
  for (const [key, level] of Array.from(store.active.entries())) {
    if (level.lastUpdateTs < cutoff) store.active.delete(key);
  }
  if (store.cells.size <= HISTORICAL_SURFACE_MAX_CELLS) return evicted;
  const overflow = store.cells.size - HISTORICAL_SURFACE_MAX_CELLS;
  const keep = Array.from(store.cells.values())
    .sort((a, b) => {
      const aScore = a.lastSeenTs + a.maxSize * 10_000;
      const bScore = b.lastSeenTs + b.maxSize * 10_000;
      return bScore - aScore;
    })
    .slice(0, HISTORICAL_SURFACE_MAX_CELLS);
  store.cells.clear();
  for (const cell of keep) store.cells.set(cellKey(cell.timeBucket, cell.price), cell);
  return evicted + Math.max(0, overflow);
}

function buildDiag(
  sourceKey: string,
  cells: HistoricalLiquiditySurfaceCell[],
  store: SurfaceStore,
  evictedCells: number,
  skips: {
    tooOld: number;
    tooNew: number;
    outOfPrice: number;
    belowSize: number;
  },
  selectedLevelCount: number,
  sourceLevelCount: number,
  midPrice: number | null | undefined,
  originalPriceBucketSize: number,
  heatmapPriceBucketSize: number,
  priceAxisStep: number,
  minPrice: number,
  maxPrice: number,
  inactiveLevelCount: number,
): HistoricalLiquiditySurfaceDiag {
  const bucketSet = new Set<number>();
  const priceSet = new Set<number>();
  let maxLiquidity = 0;
  let minLiquidity = Number.POSITIVE_INFINITY;
  const sizes: number[] = [];
  let coldStartSeededCellCount = 0;
  let liveUpdatedCellCount = 0;
  let weak = 0;
  let medium = 0;
  let strong = 0;
  const abovePriceLevels = new Set<number>();
  const belowPriceLevels = new Set<number>();
  const mid = midPrice && midPrice > 0 ? midPrice : null;
  for (const cell of cells) {
    bucketSet.add(cell.timeBucket);
    priceSet.add(cell.price);
    maxLiquidity = Math.max(maxLiquidity, cell.maxSize);
    minLiquidity = Math.min(minLiquidity, cell.maxSize);
    sizes.push(cell.maxSize);
    if (cell.coldStartSeeded) coldStartSeededCellCount += 1;
    if (cell.liveUpdated) liveUpdatedCellCount += 1;
    if (cell.intensity < 0.12) weak += 1;
    else if (cell.intensity < 0.38) medium += 1;
    else strong += 1;
    if (mid != null && cell.price > mid) abovePriceLevels.add(cell.price);
    if (mid != null && cell.price < mid) belowPriceLevels.add(cell.price);
  }
  sizes.sort((a, b) => a - b);
  const medianLiquidity = sizes.length
    ? sizes[Math.floor((sizes.length - 1) / 2)] ?? 0
    : 0;
  const effectivePriceStep =
    Number.isFinite(originalPriceBucketSize) && originalPriceBucketSize > 0
      ? originalPriceBucketSize
      : HISTORICAL_SURFACE_PRICE_BUCKET_USD;
  const rowsAlignedToDom = Array.from(priceSet).every(
    (price) => Math.abs(bucketPrice(price, effectivePriceStep) - price) < 0.000_001,
  );
  return {
    enabled: BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_V1,
    rendererPath: "minimal-stable-historical-surface",
    visibleBucketCount: bucketSet.size,
    visiblePriceLevels: priceSet.size,
    activeHistoricalCells: cells.length,
    activeRestingLevels: store.active.size,
    maxLiquidityInViewport: maxLiquidity,
    minLiquidityInViewport: Number.isFinite(minLiquidity) ? minLiquidity : 0,
    medianLiquidityInViewport: medianLiquidity,
    intensityThreshold: HISTORICAL_SURFACE_RENDER_MIN_INTENSITY,
    skippedCellsTooOld: skips.tooOld,
    skippedCellsTooNew: skips.tooNew,
    skippedCellsOutOfPrice: skips.outOfPrice,
    skippedCellsBelowSize: skips.belowSize,
    selectedLevelCount,
    sourceLevelCount,
    bucketMergeFactor: 1,
    priceLevelMergeFactor:
      originalPriceBucketSize > 0
        ? Math.max(1, originalPriceBucketSize / HISTORICAL_SURFACE_PRICE_BUCKET_USD)
        : 1,
    coldStartSeededCellCount,
    liveUpdatedCellCount,
    renderedWeakCells: weak,
    renderedMediumCells: medium,
    renderedStrongCells: strong,
    visiblePriceLevelsAbovePrice: abovePriceLevels.size,
    visiblePriceLevelsBelowPrice: belowPriceLevels.size,
    domLadderTickSize: effectivePriceStep,
    heatmapPriceBucketSize,
    effectiveRenderPriceStep: effectivePriceStep,
    priceAxisStep,
    visiblePriceMin: minPrice,
    visiblePriceMax: maxPrice,
    visibleRangeAbovePrice:
      mid != null && Number.isFinite(mid) ? Math.max(0, maxPrice - mid) : 0,
    visibleRangeBelowPrice:
      mid != null && Number.isFinite(mid) ? Math.max(0, mid - minPrice) : 0,
    heatmapRowsAlignedToDom: rowsAlignedToDom,
    priceRoundingModeUsedByHeatmap: "nearest-dom-bucket",
    priceRoundingModeUsedByDomCob: "nearest-dom-bucket",
    skippedEmptyLevels: Math.max(0, sourceLevelCount - selectedLevelCount),
    inactiveLevelCount,
    cacheBucketCount: new Set(Array.from(store.cells.values()).map((c) => c.timeBucket)).size,
    cacheMemoryEstimate: estimateBytes(store),
    renderCellCountPerFrame: 0,
    cacheCellCount: store.cells.size,
    evictedCells,
    sourceKey,
    timestamp: Date.now(),
  };
}

function emitDiag(diag: HistoricalLiquiditySurfaceDiag): void {
  if (!import.meta.env.DEV || !BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG) return;
  const now = Date.now();
  if (now - lastDiagLogMs < 2_000) return;
  lastDiagLogMs = now;
  console.debug("[BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_V1_DIAG]", diag);
}

export function updateHistoricalLiquiditySurface(
  params: UpdateHistoricalLiquiditySurfaceParams,
): UpdateHistoricalLiquiditySurfaceResult {
  const sourceKey = params.sourceKey || "default";
  if (!BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_V1 || !isDesktopRuntime()) {
    const diag = emptyDiag(sourceKey);
    return { cells: [], activeLevels: [], diag };
  }

  const store = getStore(sourceKey);
  const now = nowMs(params.state);
  const timeBucket = roundBucket(now, BOOKMAP_ENGINE_BUCKET_MS);
  const selected = selectLevels(
    params.levels,
    params.minPrice,
    params.maxPrice,
    params.midPrice,
  );
  const seenActive = new Set<string>();
  const isColdStart = store.cells.size === 0;
  const selectedKeys = new Set(
    selected.map((level) =>
      activeKey(level.side, bucketPrice(level.price, params.priceBucketSize)),
    ),
  );
  const inactiveLevelCount = params.levels.reduce((count, level) => {
    if (level.price < params.minPrice || level.price > params.maxPrice) return count;
    const key = activeKey(level.side, bucketPrice(level.price, params.priceBucketSize));
    return selectedKeys.has(key) ? count : count + 1;
  }, 0);

  for (const level of selected) {
    const price = bucketPrice(level.price, params.priceBucketSize);
    const key = activeKey(level.side, price);
    seenActive.add(key);
    const prev = store.active.get(key);
    const previousSize = prev?.currentSize ?? 0;
    const peakSize = Math.max(prev?.peakSize ?? 0, level.size);
    const firstSeenTs = prev?.firstSeenTs ?? now;
    const persistenceMs = Math.max(0, now - firstSeenTs);
    const active: ActiveRestingLiquidityLevel = {
      price,
      side: level.side,
      currentSize: level.size,
      askSize: level.side === "ask" ? level.size : 0,
      bidSize: level.side === "bid" ? level.size : 0,
      previousSize,
      peakSize,
      firstSeenTs,
      lastUpdateTs: now,
      persistenceMs,
    };
    store.active.set(key, active);

    const previousBucket = prev
      ? roundBucket(prev.lastUpdateTs, BOOKMAP_ENGINE_BUCKET_MS)
      : roundBucket(now - HISTORICAL_SURFACE_INITIAL_BACKFILL_MS, BOOKMAP_ENGINE_BUCKET_MS);
    const maxBackfillStart = isColdStart
      ? now - HISTORICAL_SURFACE_INITIAL_BACKFILL_MS
      : now - HISTORICAL_SURFACE_MAX_GAP_FILL_MS;
    const startBucket = Math.max(
      roundBucket(maxBackfillStart, BOOKMAP_ENGINE_BUCKET_MS),
      Math.min(previousBucket + BOOKMAP_ENGINE_BUCKET_MS, timeBucket),
    );
    for (let bucket = startBucket; bucket <= timeBucket; bucket += BOOKMAP_ENGINE_BUCKET_MS) {
      const coldStartSeeded = !prev && bucket < timeBucket;
      if (coldStartSeeded && !shouldSeedColdBucket(price, bucket, level.side)) continue;
      writeSurfaceCell({
        store,
        timeBucket: bucket,
        price,
        side: level.side,
        size: level.size,
        previousSize,
        peakSize,
        firstSeenTs,
        lastSeenTs: now,
        coldStartSeeded,
      });
    }
  }

  for (const [key, active] of Array.from(store.active.entries())) {
    if (seenActive.has(key)) continue;
    const age = now - active.lastUpdateTs;
    if (age <= BOOKMAP_ENGINE_BUCKET_MS * 6) continue;
    if (age > HISTORICAL_SURFACE_RETENTION_MS) {
      store.active.delete(key);
      continue;
    }
    active.currentSize = 0;
  }

  const evictedCells = pruneStore(store, now);
  const skips = {
    tooOld: 0,
    tooNew: 0,
    outOfPrice: 0,
    belowSize: 0,
  };
  const visibleCells = Array.from(store.cells.values()).filter((cell) => {
    const end = cell.timeBucket + BOOKMAP_ENGINE_BUCKET_MS;
    if (end < params.visibleStartTime) {
      skips.tooOld += 1;
      return false;
    }
    if (cell.timeBucket > params.visibleEndTime) {
      skips.tooNew += 1;
      return false;
    }
    if (cell.price < params.minPrice || cell.price > params.maxPrice) {
      skips.outOfPrice += 1;
      return false;
    }
    const age = now - cell.lastSeenTs;
    cell.stale = age > BOOKMAP_ENGINE_BUCKET_MS * 6;
    cell.decay = cell.stale ? Math.max(0.18, 1 - age / HISTORICAL_SURFACE_RETENTION_MS) : 1;
    if (
      cell.maxSize < HISTORICAL_SURFACE_MIN_SIZE_BTC ||
      cell.intensity < HISTORICAL_SURFACE_RENDER_MIN_INTENSITY
    ) {
      skips.belowSize += 1;
      return false;
    }
    return true;
  });

  visibleCells.sort((a, b) => {
    const aScore = a.intensity * 10 + a.maxSize;
    const bScore = b.intensity * 10 + b.maxSize;
    return bScore - aScore;
  });
  const cells = visibleCells.slice(0, HISTORICAL_SURFACE_MAX_CELLS);
  const diag = buildDiag(
    sourceKey,
    cells,
    store,
    evictedCells,
    skips,
    selected.length,
    params.levels.length,
    params.midPrice,
    params.priceBucketSize,
    params.heatmapBucketSize,
    params.priceAxisStep,
    params.minPrice,
    params.maxPrice,
    inactiveLevelCount,
  );
  emitDiag(diag);
  saveStore(sourceKey, store, now);

  return {
    cells,
    activeLevels: Array.from(store.active.values()),
    diag,
  };
}
