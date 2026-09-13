import type { MarketCandle } from "./marketCandleTypes";
import {
  intervalMsFor,
  findGaps,
  getContiguousSuffix,
  isX5Ready,
  findInternalGapForRepair,
  type CandleGap,
  type ContiguousSuffix,
} from "./candleContinuity";
import { mergeHistoricalCandles } from "./chartHistoryMerge";
import { upsertCandleHistoryBatch } from "./candleHistoryCache";

export type CandleHistoryKey = {
  exchange: string;
  market: string;
  symbol: string;
  timeframe: string;
};

export type CandleHistoryRequest = {
  key: CandleHistoryKey;
  before: number | null;
  limit: number;
};

export type CandleHistoryStatus = "X5_READY" | "X5_PARTIAL" | "X5_FAILED";

export type CandleHistoryState = {
  loaded: MarketCandle[];
  rendered: MarketCandle[];
  oldestLoadedTime: number | null;
  newestLoadedTime: number | null;
  status: CandleHistoryStatus;
  targetCount: number | null;
};

export type CandleHistoryWarmupResult = CandleHistoryState & {
  pagesRequested: number;
};

export type CandleHistoryRequestResult = CandleHistoryState & {
  deduped: boolean;
  pageSize: number;
};

export type CandleHistoryManager = {
  warmup(key: CandleHistoryKey, opts: { startupTarget: number; pageSize: number }): Promise<CandleHistoryWarmupResult>;
  requestOlder(key: CandleHistoryKey, req: { before?: number | null; limit: number }): Promise<CandleHistoryRequestResult>;
  requestInternalGapRepair(key: CandleHistoryKey, opts: { pageSize: number; maxPages?: number; recentCandles?: MarketCandle[] }): Promise<{ repaired: boolean; pagesFetched: number; candlesAdded: number; gap?: CandleGap }>;
  getState(key: CandleHistoryKey): CandleHistoryState;
  clear(key?: CandleHistoryKey): void;
};

type FetchPage = (request: CandleHistoryRequest) => Promise<MarketCandle[]>;

type InternalState = {
  loaded: MarketCandle[];
  rendered: MarketCandle[];
  targetCount: number | null;
  status: CandleHistoryStatus;
  lastError: string | null;
  pagesRequested: number;
  inFlight: Map<string, Promise<MarketCandle[]>>;
};

const DEFAULT_RENDER_CAP = 1200;

function keyToString(key: CandleHistoryKey): string {
  return [key.exchange, key.market, key.symbol, key.timeframe].map((v) => v.trim().toLowerCase()).join("|");
}

function sortAndDedupe(candles: MarketCandle[]): MarketCandle[] {
  if (candles.length <= 1) return candles.slice();
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const out: MarketCandle[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && last.time === c.time) {
      out[out.length - 1] = { ...c };
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

// Use the canonical merge function from chartHistoryMerge as the ONE merge path
function mergeCandles(existing: MarketCandle[], page: MarketCandle[]): MarketCandle[] {
  return mergeHistoricalCandles(existing, page);
}

function pickLoadedWindow(loaded: MarketCandle[], renderCap: number): MarketCandle[] {
  if (loaded.length <= renderCap) return loaded.map((c) => ({ ...c }));
  return loaded.slice(-renderCap).map((c) => ({ ...c }));
}

function makeEmptyState(): InternalState {
  return {
    loaded: [],
    rendered: [],
    targetCount: null,
    status: "X5_PARTIAL",
    lastError: null,
    pagesRequested: 0,
    inFlight: new Map(),
  };
}

export function createCandleHistoryManager(
  fetchPage: FetchPage,
  options: { renderCap?: number } = {},
): CandleHistoryManager {
  const renderCap = options.renderCap ?? DEFAULT_RENDER_CAP;
  const stateByKey = new Map<string, InternalState>();

  const getInternal = (key: CandleHistoryKey): InternalState => {
    const k = keyToString(key);
    const existing = stateByKey.get(k);
    if (existing) return existing;
    const created = makeEmptyState();
    stateByKey.set(k, created);
    return created;
  };

  const syncRender = (state: InternalState): void => {
    state.rendered = pickLoadedWindow(state.loaded, renderCap);
  };

  const summarize = (state: InternalState): CandleHistoryState => ({
    loaded: state.loaded.map((c) => ({ ...c })),
    rendered: state.rendered.map((c) => ({ ...c })),
    oldestLoadedTime: state.loaded.length ? state.loaded[0]!.time : null,
    newestLoadedTime: state.loaded.length ? state.loaded[state.loaded.length - 1]!.time : null,
    status: state.status,
    targetCount: state.targetCount,
  });

  const requestPage = async (key: CandleHistoryKey, before: number | null, limit: number): Promise<{ candles: MarketCandle[]; deduped: boolean }> => {
    const internal = getInternal(key);
    const requestKey = `${keyToString(key)}|${before ?? "latest"}|${limit}`;
    const existing = internal.inFlight.get(requestKey);
    if (existing) {
      const candles = await existing;
      return { candles, deduped: true };
    }

    const started = fetchPage({ key, before, limit })
      .then((candles) => {
        return sortAndDedupe(candles);
      })
      .finally(() => {
        internal.inFlight.delete(requestKey);
      });
    internal.inFlight.set(requestKey, started);
    const candles = await started;
    return { candles, deduped: false };
  };

  const commitPage = (key: CandleHistoryKey, candles: MarketCandle[]): InternalState => {
    const internal = getInternal(key);
    if (candles.length > 0) {
      internal.loaded = mergeCandles(internal.loaded, candles);
    }
    syncRender(internal);
    return internal;
  };

  const requestOlder = async (
    key: CandleHistoryKey,
    req: { before?: number | null; limit: number },
  ): Promise<CandleHistoryRequestResult> => {
    const internal = getInternal(key);
    const before = req.before ?? (internal.loaded.length ? internal.loaded[0]!.time * 1000 - 1 : null);
    try {
      const { candles, deduped } = await requestPage(key, before, req.limit);
      internal.pagesRequested += 1;
      if (candles.length === 0) {
        // X5 readiness: contiguous suffix reaching newest boundary, not total count
        internal.status = isX5Ready(internal.loaded, key.timeframe, internal.targetCount ?? 0) ? "X5_READY" : internal.status;
        syncRender(internal);
        return { ...summarize(internal), deduped, pageSize: req.limit };
      }

      commitPage(key, candles);
      // X5 readiness: contiguous suffix reaching newest boundary, not total count
      if (internal.targetCount != null && isX5Ready(internal.loaded, key.timeframe, internal.targetCount)) {
        internal.status = "X5_READY";
      } else {
        internal.status = "X5_PARTIAL";
      }
      return { ...summarize(internal), deduped, pageSize: req.limit };
    } catch {
      internal.status = isX5Ready(internal.loaded, key.timeframe, internal.targetCount ?? 0) ? "X5_READY" : (internal.loaded.length > 0 ? "X5_PARTIAL" : "X5_FAILED");
      syncRender(internal);
      return { ...summarize(internal), deduped: false, pageSize: req.limit };
    }
  };

  const warmup = async (
    key: CandleHistoryKey,
    opts: { startupTarget: number; pageSize: number },
  ): Promise<CandleHistoryWarmupResult> => {
    const internal = getInternal(key);
    internal.targetCount = opts.startupTarget;
    let pages = 0;

    while (internal.loaded.length < opts.startupTarget) {
      const before = internal.loaded.length ? internal.loaded[0]!.time * 1000 - 1 : null;
      let candles: MarketCandle[];
      try {
        ({ candles } = await requestPage(key, before, opts.pageSize));
      } catch {
        break;
      }
      pages += 1;
      internal.pagesRequested += 1;
      if (candles.length === 0) {
        break;
      }
      const prevOldest = internal.loaded.length ? internal.loaded[0]!.time : null;
      commitPage(key, candles);
      const nextOldest = internal.loaded[0]!.time;
      if (prevOldest != null && nextOldest === prevOldest) {
        break;
      }
    }

    // X5 readiness: contiguous suffix reaching newest boundary, not total count
    // First attempt to repair any internal gap that would prevent X5_READY
    if (internal.loaded.length > 0) {
      await requestInternalGapRepair(key, { pageSize: opts.pageSize });
    }
    internal.status = isX5Ready(internal.loaded, key.timeframe, opts.startupTarget) ? "X5_READY" : (internal.loaded.length > 0 ? "X5_PARTIAL" : "X5_FAILED");
    return { ...summarize(internal), pagesRequested: pages };
  };

  /**
     * Repair an internal gap between loaded candle blocks.
     * Fetches real candles from the network to fill the missing interval.
     * Does NOT fetch before global oldest (that's what requestOlder is for).
     */
    const requestInternalGapRepair = async (
      key: CandleHistoryKey,
      opts: { pageSize: number; maxPages?: number; recentCandles?: MarketCandle[] },
    ): Promise<{ repaired: boolean; pagesFetched: number; candlesAdded: number; gap?: CandleGap }> => {
      const internal = getInternal(key);
      // Include the same recent source the chart displays before looking for holes.
      // Never replace the cached prefix with the shorter native/live tail.
      if (opts.recentCandles?.length) commitPage(key, opts.recentCandles);
      const maxPages = opts.maxPages ?? 10; // bounded
      let pagesFetched = 0;
      let candlesAdded = 0;

      // Find the most relevant internal gap (the one before the contiguous suffix)
      const gap = findInternalGapForRepair(internal.loaded, key.timeframe);
      if (!gap) {
        return { repaired: true, pagesFetched: 0, candlesAdded: 0 };
      }

      let currentBeforeMs = gap.missingTo - 1; // before the next candle after the gap
      const expectedMs = intervalMsFor(key.timeframe);
      const targetOldestMs = gap.missingFrom;

      while (pagesFetched < maxPages) {
        // Stop if we've reached or passed the target oldest
        if (currentBeforeMs < targetOldestMs) {
          break;
        }

        const { candles, deduped } = await requestPage(key, currentBeforeMs, opts.pageSize);
        pagesFetched += 1;
        internal.pagesRequested += 1;

        if (candles.length === 0) {
          break;
        }

        const prevCount = internal.loaded.length;
        commitPage(key, candles);
        const newCount = internal.loaded.length;
        const added = newCount - prevCount;
        candlesAdded += added;

        // Persist repaired candles to SQLite for restart survival
        if (added > 0) {
          try {
            await upsertCandleHistoryBatch(key, candles);
          } catch {
            // Cache best-effort only; don't fail repair on persistence error
          }
        }

        // Move backward: next page before the oldest candle we just fetched
        const newOldestMs = candles[0]!.time * 1000;
        if (newOldestMs >= currentBeforeMs) {
          // No timestamp progress — stop to avoid infinite loop
          break;
        }
        currentBeforeMs = newOldestMs - 1;
      }

      // Re-evaluate X5 readiness after repair
      if (internal.targetCount != null) {
        internal.status = isX5Ready(internal.loaded, key.timeframe, internal.targetCount) ? "X5_READY" : (internal.loaded.length > 0 ? "X5_PARTIAL" : "X5_FAILED");
      }
      syncRender(internal);

      const finalGap = findInternalGapForRepair(internal.loaded, key.timeframe);
      const repaired = !finalGap;

      return { repaired, pagesFetched, candlesAdded, gap };
    };

  const getState = (key: CandleHistoryKey): CandleHistoryState => summarize(getInternal(key));

  const clear = (key?: CandleHistoryKey) => {
    if (!key) {
      stateByKey.clear();
      return;
    }
    stateByKey.delete(keyToString(key));
  };

  return { warmup, requestOlder, requestInternalGapRepair, getState, clear };
}
