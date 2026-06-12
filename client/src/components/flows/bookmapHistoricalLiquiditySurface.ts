import {
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG,
  BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_V1,
  HISTORICAL_SURFACE_CACHE_KEY_PREFIX,
  HISTORICAL_SURFACE_CACHE_SAVE_MS,
  HISTORICAL_SURFACE_MAX_ACTIVE_LEVELS,
  HISTORICAL_SURFACE_MAX_CELLS,
  HISTORICAL_SURFACE_MIN_SIZE_BTC,
  HISTORICAL_SURFACE_RETENTION_MS,
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
  visibleBucketCount: number;
  visiblePriceLevels: number;
  activeHistoricalCells: number;
  activeRestingLevels: number;
  maxLiquidityInViewport: number;
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
  const safeStep = Math.max(0.5, step || 1);
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
    visiblePriceLevels: 0,
    activeHistoricalCells: 0,
    activeRestingLevels: 0,
    maxLiquidityInViewport: 0,
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
  const persistenceScore = Math.min(0.22, persistenceMs / 60_000);
  return Math.max(0.015, Math.min(1, sizeScore * 0.7 + peakScore * 0.2 + persistenceScore));
}

function selectLevels(
  levels: LiveDomBookLevel[],
  minPrice: number,
  maxPrice: number,
  midPrice: number | null | undefined,
): LiveDomBookLevel[] {
  const range = maxPrice - minPrice;
  const expandedMin = minPrice - range * 0.12;
  const expandedMax = maxPrice + range * 0.12;
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
      const aScore = a.size * 10_000 - aNear;
      const bScore = b.size * 10_000 - bNear;
      return bScore - aScore;
    })
    .slice(0, HISTORICAL_SURFACE_MAX_ACTIVE_LEVELS);
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
): HistoricalLiquiditySurfaceDiag {
  const bucketSet = new Set<number>();
  const priceSet = new Set<number>();
  let maxLiquidity = 0;
  for (const cell of cells) {
    bucketSet.add(cell.timeBucket);
    priceSet.add(cell.price);
    maxLiquidity = Math.max(maxLiquidity, cell.maxSize);
  }
  return {
    visibleBucketCount: bucketSet.size,
    visiblePriceLevels: priceSet.size,
    activeHistoricalCells: cells.length,
    activeRestingLevels: store.active.size,
    maxLiquidityInViewport: maxLiquidity,
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

    const cKey = cellKey(timeBucket, price);
    const existing = store.cells.get(cKey);
    const bidSize = level.side === "bid" ? level.size : existing?.bidSize ?? 0;
    const askSize = level.side === "ask" ? level.size : existing?.askSize ?? 0;
    const maxSize = Math.max(existing?.maxSize ?? 0, bidSize, askSize, peakSize);
    const currentSize = Math.max(bidSize, askSize);
    const firstCellTs = existing?.firstSeenTs ?? firstSeenTs;
    store.cells.set(cKey, {
      timeBucket,
      price,
      side: bidSize >= askSize ? "bid" : "ask",
      bidSize,
      askSize,
      maxSize,
      firstSeenTs: firstCellTs,
      lastSeenTs: now,
      persistenceMs: Math.max(persistenceMs, now - firstCellTs),
      stale: false,
      decay: 1,
      currentSize,
      previousSize,
      peakSize,
      intensity: computeIntensity(currentSize, peakSize, persistenceMs),
      sizeDelta: currentSize - previousSize,
    });
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
  const visibleCells = Array.from(store.cells.values()).filter((cell) => {
    const end = cell.timeBucket + BOOKMAP_ENGINE_BUCKET_MS;
    if (end < params.visibleStartTime || cell.timeBucket > params.visibleEndTime) return false;
    if (cell.price < params.minPrice || cell.price > params.maxPrice) return false;
    const age = now - cell.lastSeenTs;
    cell.stale = age > BOOKMAP_ENGINE_BUCKET_MS * 6;
    cell.decay = cell.stale ? Math.max(0.18, 1 - age / HISTORICAL_SURFACE_RETENTION_MS) : 1;
    return cell.maxSize >= HISTORICAL_SURFACE_MIN_SIZE_BTC;
  });

  visibleCells.sort((a, b) => {
    const aScore = a.intensity * 10 + a.maxSize;
    const bScore = b.intensity * 10 + b.maxSize;
    return bScore - aScore;
  });
  const cells = visibleCells.slice(0, HISTORICAL_SURFACE_MAX_CELLS);
  const diag = buildDiag(sourceKey, cells, store, evictedCells);
  emitDiag(diag);
  saveStore(sourceKey, store, now);

  return {
    cells,
    activeLevels: Array.from(store.active.values()),
    diag,
  };
}
