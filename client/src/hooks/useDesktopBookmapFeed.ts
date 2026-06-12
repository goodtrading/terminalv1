import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookmapState } from "@/types/bookmapState";
import {
  HEATMAP_MAJOR_WALL_BTC,
  MAX_LIQUIDITY_SNAPSHOTS,
  type HeatmapPipelineStats,
  type HeatmapTrade,
  type LiquiditySnapshot,
  type OrderbookLevel,
} from "@/components/flows/liquidityHeatmapUtils";
import { parseRawTradeEvent } from "@/components/flows/tradeFeedParse";
import { appendTradeToBuffer } from "@/components/flows/tradeBubbleUtils";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import {
  writeHeatmapCache,
  writeDesktopLog,
  writeHeatmapSessionMetadata,
} from "@/lib/desktopStorage";
import {
  DesktopBookmapHeatmapEngine,
  type DesktopBookmapHeatmapStats,
  type DesktopBookmapInputLevel,
} from "@/lib/desktopBookmapHeatmapEngine";
import {
  BOOKMAP_DESKTOP_DOM_RAW_DEPTH_LIMIT,
  useDesktopFullRawDomLadder,
} from "@/lib/bookmapEngineConfig";
import { publishDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import { registerDesktopFeedReconnectHandler } from "@/lib/desktopFeedControl";

const DESKTOP_BOOKMAP_BUCKET_MS = 1_000;
const DESKTOP_BOOKMAP_DEPTH_LIMIT = 1_000;
const DESKTOP_BOOKMAP_VISIBLE_DEPTH_LIMIT = 100;
const DESKTOP_BOOKMAP_VISUAL_THROTTLE_MS = 150;
const DESKTOP_HEATMAP_CACHE_INTERVAL_MS = 60_000;
const DESKTOP_BOOKMAP_WS_BASE = "wss://stream.binance.com:9443/stream";
const DESKTOP_BOOKMAP_REST_BASE = "https://api.binance.com/api/v3/depth";

const EMPTY_STATS: HeatmapPipelineStats = {
  rawBids: 0,
  rawAsks: 0,
  normalizedBids: 0,
  normalizedAsks: 0,
  visibleBids: 0,
  visibleAsks: 0,
  heatmapLevels: 0,
  renderedHeatmap: 0,
  aboveMinHeatmap: 0,
  majorWallsHeatmap: 0,
  majorWallsRaw: 0,
  majorWallsVisible: 0,
  domBuckets: 0,
  nonZeroBidBuckets: 0,
  nonZeroAskBuckets: 0,
};

type BinanceDepthWire = {
  bids?: unknown[];
  asks?: unknown[];
  b?: unknown[];
  a?: unknown[];
  E?: number;
};

type BinanceDiffDepthWire = {
  U?: number;
  u?: number;
  b?: unknown[];
  a?: unknown[];
  E?: number;
};

type BinanceDepthSnapshotWire = {
  lastUpdateId?: number;
  bids?: unknown[];
  asks?: unknown[];
};

type BinanceCombinedMessage = {
  stream?: string;
  data?: unknown;
};

type DesktopFeedStatus = "loading" | "live" | "error" | "empty" | "offline";
type DesktopOrderbookMode = "reconstructed" | "fallback-depth20";

export const desktopBookmapFeedEnabled =
  import.meta.env.VITE_PLATFORM === "desktop" &&
  import.meta.env.VITE_HEATMAP_ENABLED === "true";

function sanitizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
}

function parseLevel(raw: unknown, side: "bid" | "ask"): OrderbookLevel | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const price = Number(raw[0]);
  const sizeBtc = Number(raw[1]);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(sizeBtc) || sizeBtc <= 0) return null;
  return { price, sizeBtc, side };
}

function parseBookEntry(raw: unknown): { price: number; sizeBtc: number } | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const price = Number(raw[0]);
  const sizeBtc = Number(raw[1]);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(sizeBtc) || sizeBtc < 0) return null;
  return { price, sizeBtc };
}

function parseLevels(rows: unknown[] | undefined, side: "bid" | "ask"): OrderbookLevel[] {
  const levels = (rows ?? [])
    .map((row) => parseLevel(row, side))
    .filter((level): level is OrderbookLevel => level != null);
  levels.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return levels;
}

function replaceBookSideFromRows(book: Map<number, number>, rows: unknown[] | undefined): void {
  book.clear();
  for (const row of rows ?? []) {
    const entry = parseBookEntry(row);
    if (!entry || entry.sizeBtc <= 0) continue;
    book.set(entry.price, entry.sizeBtc);
  }
}

function applyBookSideUpdates(book: Map<number, number>, rows: unknown[] | undefined): void {
  for (const row of rows ?? []) {
    const entry = parseBookEntry(row);
    if (!entry) continue;
    if (entry.sizeBtc === 0) {
      book.delete(entry.price);
    } else {
      book.set(entry.price, entry.sizeBtc);
    }
  }
}

function visibleBookSide(
  book: Map<number, number>,
  side: "bid" | "ask",
  limit: number,
): OrderbookLevel[] {
  return Array.from(book.entries())
    .sort(([priceA], [priceB]) => (side === "bid" ? priceB - priceA : priceA - priceB))
    .slice(0, limit)
    .map(([price, sizeBtc]) => ({ price, sizeBtc, side }));
}

function tradeDedupeKey(trade: HeatmapTrade): string {
  if (trade.id) return `spot:id:${trade.id}`;
  return `spot:${trade.ts}:${trade.price}:${trade.side}:${trade.sizeBtc}`;
}

export function useDesktopBookmapFeed(
  symbol = "BTCUSDT",
  enabled = desktopBookmapFeedEnabled,
  markets: { tradeMarket: BookmapMarketSource; orderbookMarket: BookmapMarketSource } = {
    tradeMarket: "spot",
    orderbookMarket: "spot",
  },
) {
  const cleanSymbol = sanitizeSymbol(symbol);
  const canUseSpotFeed =
    enabled &&
    desktopBookmapFeedEnabled &&
    cleanSymbol === "BTCUSDT" &&
    markets.tradeMarket === "spot" &&
    markets.orderbookMarket === "spot";

  const snapshotsRef = useRef<LiquiditySnapshot[]>([]);
  const tradesRef = useRef<HeatmapTrade[]>([]);
  const seenTradeKeysRef = useRef<Set<string>>(new Set());
  const reconnectTimerRef = useRef<number | null>(null);
  const visualUpdateTimerRef = useRef<number | null>(null);
  const lastHeatmapCacheAtRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const heatmapEngineRef = useRef(new DesktopBookmapHeatmapEngine({
    timeBucketMs: DESKTOP_BOOKMAP_BUCKET_MS,
    priceBucketSize: 10,
  }));
  const heatmapStatsRef = useRef<DesktopBookmapHeatmapStats>(
    heatmapEngineRef.current.getStats(),
  );
  const lastUpdateRef = useRef<number | null>(null);
  const rawBidsRef = useRef<Map<number, number>>(new Map());
  const rawAsksRef = useRef<Map<number, number>>(new Map());
  const rawBidsCountRef = useRef(0);
  const rawAsksCountRef = useRef(0);
  const bidsCountRef = useRef(0);
  const asksCountRef = useRef(0);
  const lastUpdateIdRef = useRef<number | null>(null);
  const snapshotReadyRef = useRef(false);
  const pendingDiffsRef = useRef<BinanceDiffDepthWire[]>([]);
  const messagesReceivedRef = useRef(0);
  const diffMessagesReceivedRef = useRef(0);
  const resyncCountRef = useRef(0);
  const currentModeRef = useRef<DesktopOrderbookMode>("reconstructed");
  const feedStatusRef = useRef<DesktopFeedStatus>(canUseSpotFeed ? "loading" : "offline");
  const connectedRef = useRef(false);
  const firstSnapshotLoggedRef = useRef(false);
  const firstTradeLoggedRef = useRef(false);
  const noDataTimeoutLoggedRef = useRef(false);
  const sessionStartedAtRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);

  const [bookmapState, setBookmapState] = useState<BookmapState | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [feedStatus, setFeedStatus] = useState<DesktopFeedStatus>(
    canUseSpotFeed ? "loading" : "offline",
  );
  const [pipelineStats, setPipelineStats] = useState<HeatmapPipelineStats>(EMPTY_STATS);
  const [tradeTick, setTradeTick] = useState(0);
  const [tradeVersion, setTradeVersion] = useState(0);
  const [tradeBufferCount, setTradeBufferCount] = useState(0);
  const [receivedTradeCount, setReceivedTradeCount] = useState(0);
  const [tradesStreamConnected, setTradesStreamConnected] = useState(false);
  const [latestTradeTs, setLatestTradeTs] = useState<number | null>(null);
  const [lastMessageTs, setLastMessageTs] = useState<number | null>(null);
  const [orderbookReceivedAt, setOrderbookReceivedAt] = useState<number | null>(null);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const updateFeedStatus = useCallback((nextStatus: DesktopFeedStatus) => {
    feedStatusRef.current = nextStatus;
    setFeedStatus(nextStatus);
  }, []);

  const updateFeedStatusFromCurrent = useCallback((
    updater: (status: DesktopFeedStatus) => DesktopFeedStatus,
  ) => {
    const nextStatus = updater(feedStatusRef.current);
    feedStatusRef.current = nextStatus;
    setFeedStatus(nextStatus);
  }, []);

  const updateTradesStreamConnected = useCallback((connected: boolean) => {
    connectedRef.current = connected;
    setTradesStreamConnected(connected);
  }, [cleanSymbol]);

  const diffWsUrl = useMemo(() => {
    const streamSymbol = cleanSymbol.toLowerCase();
    const streams = `${streamSymbol}@depth@100ms/${streamSymbol}@aggTrade`;
    return `${DESKTOP_BOOKMAP_WS_BASE}?streams=${streams}`;
  }, [cleanSymbol]);

  const fallbackWsUrl = useMemo(() => {
    const streamSymbol = cleanSymbol.toLowerCase();
    const streams = `${streamSymbol}@depth20@100ms/${streamSymbol}@aggTrade`;
    return `${DESKTOP_BOOKMAP_WS_BASE}?streams=${streams}`;
  }, [cleanSymbol]);

  const snapshotUrl = useMemo(() => {
    const params = new URLSearchParams({
      symbol: cleanSymbol,
      limit: String(DESKTOP_BOOKMAP_DEPTH_LIMIT),
    });
    return `${DESKTOP_BOOKMAP_REST_BASE}?${params.toString()}`;
  }, [cleanSymbol]);

  const publishBookmapSnapshot = useCallback((
    snapshot: LiquiditySnapshot,
    rawCounts: { bids: number; asks: number } = {
      bids: snapshot.bids.length,
      asks: snapshot.asks.length,
    },
    heatmapDepth?: { bids: OrderbookLevel[]; asks: OrderbookLevel[] },
    /** When set, heatmap/live projection uses this subset; DOM snapshot keeps full `snapshot`. */
    engineVisibleBook?: { bids: OrderbookLevel[]; asks: OrderbookLevel[] },
  ) => {
    snapshotsRef.current = [...snapshotsRef.current, snapshot].slice(-MAX_LIQUIDITY_SNAPSHOTS);
    setSnapshotCount(snapshotsRef.current.length);
    setOrderbookReceivedAt(snapshot.ts);
    lastUpdateRef.current = Date.now();
    rawBidsCountRef.current = rawCounts.bids;
    rawAsksCountRef.current = rawCounts.asks;
    bidsCountRef.current = snapshot.bids.length;
    asksCountRef.current = snapshot.asks.length;
    setDataUpdatedAt(Date.now());
    updateFeedStatus("live");

    const nextStats: HeatmapPipelineStats = {
      rawBids: rawCounts.bids,
      rawAsks: rawCounts.asks,
      normalizedBids: snapshot.bids.length,
      normalizedAsks: snapshot.asks.length,
      visibleBids: snapshot.bids.length,
      visibleAsks: snapshot.asks.length,
      heatmapLevels: snapshot.bids.length + snapshot.asks.length,
      renderedHeatmap: snapshot.bids.length + snapshot.asks.length,
      aboveMinHeatmap: snapshot.bids.length + snapshot.asks.length,
      majorWallsHeatmap: [...snapshot.bids, ...snapshot.asks].filter(
        (level) => level.sizeBtc >= HEATMAP_MAJOR_WALL_BTC,
      ).length,
      majorWallsRaw: [...snapshot.bids, ...snapshot.asks].filter(
        (level) => level.sizeBtc >= HEATMAP_MAJOR_WALL_BTC,
      ).length,
      majorWallsVisible: [...snapshot.bids, ...snapshot.asks].filter(
        (level) => level.sizeBtc >= HEATMAP_MAJOR_WALL_BTC,
      ).length,
      domBuckets: snapshot.bids.length + snapshot.asks.length,
      nonZeroBidBuckets: snapshot.bids.length,
      nonZeroAskBuckets: snapshot.asks.length,
    };
    setPipelineStats(nextStats);

    const midPrice =
      snapshot.bids[0]?.price != null && snapshot.asks[0]?.price != null
        ? (snapshot.bids[0].price + snapshot.asks[0].price) / 2
        : null;
    const toInputLevel = (level: OrderbookLevel): DesktopBookmapInputLevel => ({
      price: level.price,
      sizeBtc: level.sizeBtc,
      side: level.side,
    });
    const visibleBidsSource = engineVisibleBook?.bids ?? snapshot.bids;
    const visibleAsksSource = engineVisibleBook?.asks ?? snapshot.asks;
    const heatmapResult = heatmapEngineRef.current.ingest({
      symbol: cleanSymbol,
      ts: snapshot.ts,
      midPrice,
      bids: (heatmapDepth?.bids ?? snapshot.bids).map(toInputLevel),
      asks: (heatmapDepth?.asks ?? snapshot.asks).map(toInputLevel),
      visibleBids: visibleBidsSource.map(toInputLevel),
      visibleAsks: visibleAsksSource.map(toInputLevel),
    });
    heatmapStatsRef.current = heatmapResult.stats;
    setBookmapState(heatmapResult.state);
    publishDesktopFeedDiagnostics({
      provider: currentModeRef.current === "fallback-depth20" ? "Binance Spot depth20" : "Binance Spot local book",
      symbol: cleanSymbol,
      connected: connectedRef.current,
      feedStatus: feedStatusRef.current,
      lastUpdateAgeMs: 0,
      lastHeartbeatAt: Date.now(),
      reconnectCount: reconnectCountRef.current,
      resyncCount: resyncCountRef.current,
      rawBidsCount: rawBidsCountRef.current,
      rawAsksCount: rawAsksCountRef.current,
      visibleBidsCount: bidsCountRef.current,
      visibleAsksCount: asksCountRef.current,
      heatmapCellCount: heatmapResult.stats.cellCount,
      lastError: error?.message ?? null,
    });

    if (Date.now() - lastHeatmapCacheAtRef.current >= DESKTOP_HEATMAP_CACHE_INTERVAL_MS) {
      lastHeatmapCacheAtRef.current = Date.now();
      const day = new Date(snapshot.ts).toISOString().slice(0, 10);
      void writeHeatmapCache(`heatmap-${cleanSymbol}-summary`, day, {
        symbol: cleanSymbol,
        startedAt: sessionStartedAtRef.current,
        lastTs: snapshot.ts,
        bucketMs: DESKTOP_BOOKMAP_BUCKET_MS,
        priceBucketSize: heatmapResult.stats.priceBucketSize,
        cellCount: heatmapResult.stats.cellCount,
        strongestLevels: heatmapResult.stats.strongestLevels,
      });
      void writeHeatmapSessionMetadata({
        symbol: cleanSymbol,
        source: "spot",
        startedAt: sessionStartedAtRef.current ?? nowIso(),
        bucketMs: DESKTOP_BOOKMAP_BUCKET_MS,
        depth: DESKTOP_BOOKMAP_DEPTH_LIMIT,
      });
    }

    if (!firstSnapshotLoggedRef.current) {
      firstSnapshotLoggedRef.current = true;
      void writeDesktopLog("desktop_bookmap_first_data", {
        symbol: cleanSymbol,
        bidsCount: snapshot.bids.length,
        asksCount: snapshot.asks.length,
        heatmapCellCount: heatmapResult.stats.cellCount,
        ts: snapshot.ts,
      });
    }
  }, [cleanSymbol, updateFeedStatus]);

  const pushVisibleBookSnapshot = useCallback((ts: number) => {
    const depthBids = visibleBookSide(
      rawBidsRef.current,
      "bid",
      DESKTOP_BOOKMAP_DEPTH_LIMIT,
    );
    const depthAsks = visibleBookSide(
      rawAsksRef.current,
      "ask",
      DESKTOP_BOOKMAP_DEPTH_LIMIT,
    );
    const domDepthLimit = useDesktopFullRawDomLadder()
      ? BOOKMAP_DESKTOP_DOM_RAW_DEPTH_LIMIT
      : DESKTOP_BOOKMAP_VISIBLE_DEPTH_LIMIT;
    const domBids = depthBids.slice(0, domDepthLimit);
    const domAsks = depthAsks.slice(0, domDepthLimit);
    const engineVisibleBook = useDesktopFullRawDomLadder()
      ? {
          bids: depthBids.slice(0, DESKTOP_BOOKMAP_VISIBLE_DEPTH_LIMIT),
          asks: depthAsks.slice(0, DESKTOP_BOOKMAP_VISIBLE_DEPTH_LIMIT),
        }
      : undefined;
    rawBidsCountRef.current = rawBidsRef.current.size;
    rawAsksCountRef.current = rawAsksRef.current.size;
    if (!domBids.length || !domAsks.length) {
      updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "empty"));
      return;
    }
    publishBookmapSnapshot(
      { ts, bids: domBids, asks: domAsks },
      { bids: rawBidsRef.current.size, asks: rawAsksRef.current.size },
      { bids: depthBids, asks: depthAsks },
      engineVisibleBook,
    );
  }, [publishBookmapSnapshot, updateFeedStatusFromCurrent]);

  const scheduleVisibleBookSnapshot = useCallback((ts: number) => {
    if (visualUpdateTimerRef.current != null) return;
    visualUpdateTimerRef.current = window.setTimeout(() => {
      visualUpdateTimerRef.current = null;
      pushVisibleBookSnapshot(ts);
    }, DESKTOP_BOOKMAP_VISUAL_THROTTLE_MS);
  }, [pushVisibleBookSnapshot]);

  const ingestTrade = useCallback((raw: unknown) => {
    const parsed = parseRawTradeEvent(raw, "spot");
    if (!parsed) return;
    const key = tradeDedupeKey(parsed);
    if (seenTradeKeysRef.current.has(key)) return;
    const next = appendTradeToBuffer(tradesRef.current, parsed);
    if (next === tradesRef.current) return;
    tradesRef.current = next;
    seenTradeKeysRef.current.add(key);
    if (seenTradeKeysRef.current.size > next.length + 200) {
      seenTradeKeysRef.current = new Set(next.map(tradeDedupeKey));
    }
    setReceivedTradeCount((count) => count + 1);
    setTradeBufferCount(next.length);
    setLatestTradeTs(parsed.ts);
    setLastMessageTs(Date.now());
    setTradeVersion((version) => version + 1);
    setTradeTick((tick) => tick + 1);
    if (!firstTradeLoggedRef.current) {
      firstTradeLoggedRef.current = true;
      void writeDesktopLog("desktop_bookmap_first_trade", {
        symbol: cleanSymbol,
        price: parsed.price,
        sizeBtc: parsed.sizeBtc,
        side: parsed.side,
        ts: parsed.ts,
      });
    }
  }, []);

  const handleDepth = useCallback((raw: BinanceDepthWire) => {
    const bids = parseLevels(raw.bids ?? raw.b, "bid");
    const asks = parseLevels(raw.asks ?? raw.a, "ask");
    if (!bids.length || !asks.length) {
      updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "empty"));
      return;
    }
    publishBookmapSnapshot({
      ts: Number.isFinite(raw.E) ? Number(raw.E) : Date.now(),
      bids,
      asks,
    });
  }, [publishBookmapSnapshot, updateFeedStatusFromCurrent]);

  const handleDepthRef = useRef(handleDepth);
  const ingestTradeRef = useRef(ingestTrade);

  useEffect(() => {
    handleDepthRef.current = handleDepth;
  }, [handleDepth]);

  useEffect(() => {
    ingestTradeRef.current = ingestTrade;
  }, [ingestTrade]);

  useEffect(() => {
    snapshotsRef.current = [];
    tradesRef.current = [];
    seenTradeKeysRef.current = new Set();
    rawBidsRef.current = new Map();
    rawAsksRef.current = new Map();
    heatmapEngineRef.current.reset();
    heatmapStatsRef.current = heatmapEngineRef.current.getStats();
    lastHeatmapCacheAtRef.current = 0;
    rawBidsCountRef.current = 0;
    rawAsksCountRef.current = 0;
    bidsCountRef.current = 0;
    asksCountRef.current = 0;
    lastUpdateIdRef.current = null;
    snapshotReadyRef.current = false;
    pendingDiffsRef.current = [];
    messagesReceivedRef.current = 0;
    diffMessagesReceivedRef.current = 0;
    resyncCountRef.current = 0;
    currentModeRef.current = "reconstructed";
    connectedRef.current = false;
    setBookmapState(null);
    setSnapshotCount(0);
    setPipelineStats(EMPTY_STATS);
    setTradeTick(0);
    setTradeVersion(0);
    setTradeBufferCount(0);
    setReceivedTradeCount(0);
    setLatestTradeTs(null);
    setLastMessageTs(null);
    setOrderbookReceivedAt(null);
    setDataUpdatedAt(0);
    setError(null);
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    firstSnapshotLoggedRef.current = false;
    firstTradeLoggedRef.current = false;
    noDataTimeoutLoggedRef.current = false;
    const startedAt = nowIso();
    sessionStartedAtRef.current = startedAt;

    if (!canUseSpotFeed) {
      updateFeedStatus("offline");
      updateTradesStreamConnected(false);
      return;
    }

    updateFeedStatus("loading");
    publishDesktopFeedDiagnostics({
      provider: "Binance Spot local book",
      symbol: cleanSymbol,
      connected: false,
      feedStatus: "loading",
      lastUpdateAgeMs: null,
      lastHeartbeatAt: null,
      reconnectCount: 0,
      resyncCount: 0,
      rawBidsCount: 0,
      rawAsksCount: 0,
      visibleBidsCount: 0,
      visibleAsksCount: 0,
      heatmapCellCount: 0,
      lastError: null,
    });

    let cancelled = false;
    let reconnectAttempt = 0;
    let suppressNextReconnect = false;
    const noDataTimeoutId = window.setTimeout(() => {
      if (cancelled || noDataTimeoutLoggedRef.current || snapshotsRef.current.length > 0) return;
      noDataTimeoutLoggedRef.current = true;
      void writeDesktopLog("desktop_bookmap_no_data_timeout", {
        symbol: cleanSymbol,
        timeoutMs: 15_000,
        connected: wsRef.current?.readyState === WebSocket.OPEN,
      });
    }, 15_000);

    void writeHeatmapSessionMetadata({
      symbol: cleanSymbol,
      source: "spot",
      startedAt,
      bucketMs: DESKTOP_BOOKMAP_BUCKET_MS,
      depth: DESKTOP_BOOKMAP_DEPTH_LIMIT,
    });

    const resetLocalBook = () => {
      rawBidsRef.current = new Map();
      rawAsksRef.current = new Map();
      rawBidsCountRef.current = 0;
      rawAsksCountRef.current = 0;
      bidsCountRef.current = 0;
      asksCountRef.current = 0;
      lastUpdateIdRef.current = null;
      snapshotReadyRef.current = false;
      pendingDiffsRef.current = [];
      if (visualUpdateTimerRef.current != null) {
        window.clearTimeout(visualUpdateTimerRef.current);
        visualUpdateTimerRef.current = null;
      }
    };

    const applyDiff = (diff: BinanceDiffDepthWire): boolean => {
      const firstUpdateId = Number(diff.U);
      const finalUpdateId = Number(diff.u);
      if (!Number.isFinite(firstUpdateId) || !Number.isFinite(finalUpdateId)) {
        void writeDesktopLog("desktop_orderbook_apply_error", {
          symbol: cleanSymbol,
          reason: "invalid_update_id",
          firstUpdateId: diff.U,
          finalUpdateId: diff.u,
        });
        return false;
      }

      const previousUpdateId = lastUpdateIdRef.current;
      if (previousUpdateId == null) return false;
      if (finalUpdateId <= previousUpdateId) return true;
      if (!(firstUpdateId <= previousUpdateId + 1 && previousUpdateId + 1 <= finalUpdateId)) {
        void writeDesktopLog("desktop_orderbook_gap_detected", {
          symbol: cleanSymbol,
          expectedNextUpdateId: previousUpdateId + 1,
          firstUpdateId,
          finalUpdateId,
          mode: currentModeRef.current,
        });
        return false;
      }

      try {
        applyBookSideUpdates(rawBidsRef.current, diff.b);
        applyBookSideUpdates(rawAsksRef.current, diff.a);
        lastUpdateIdRef.current = finalUpdateId;
        scheduleVisibleBookSnapshot(Number.isFinite(diff.E) ? Number(diff.E) : Date.now());
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void writeDesktopLog("desktop_orderbook_apply_error", {
          symbol: cleanSymbol,
          message,
          firstUpdateId,
          finalUpdateId,
        });
        return false;
      }
    };

    const applyBufferedDiffs = (): boolean => {
      const lastUpdateId = lastUpdateIdRef.current;
      if (lastUpdateId == null) return false;
      const buffered = pendingDiffsRef.current
        .filter((diff) => Number(diff.u) > lastUpdateId)
        .sort((a, b) => Number(a.U) - Number(b.U));
      pendingDiffsRef.current = [];
      if (!buffered.length) return true;
      const firstValid = buffered[0];
      if (!(Number(firstValid.U) <= lastUpdateId + 1 && lastUpdateId + 1 <= Number(firstValid.u))) {
        void writeDesktopLog("desktop_orderbook_gap_detected", {
          symbol: cleanSymbol,
          reason: "buffer_does_not_bridge_snapshot",
          snapshotLastUpdateId: lastUpdateId,
          firstBufferedUpdateId: firstValid.U,
          firstBufferedFinalUpdateId: firstValid.u,
        });
        return false;
      }
      for (const diff of buffered) {
        if (!applyDiff(diff)) return false;
      }
      return true;
    };

    const loadSnapshot = async (): Promise<boolean> => {
      void writeDesktopLog("desktop_orderbook_snapshot_start", {
        symbol: cleanSymbol,
        bookDepthLimit: DESKTOP_BOOKMAP_DEPTH_LIMIT,
        url: snapshotUrl,
      });
      try {
        const response = await fetch(snapshotUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`snapshot_http_${response.status}`);
        }
        const snapshot = (await response.json()) as BinanceDepthSnapshotWire;
        const lastUpdateId = Number(snapshot.lastUpdateId);
        if (!Number.isFinite(lastUpdateId)) {
          throw new Error("snapshot_missing_lastUpdateId");
        }
        replaceBookSideFromRows(rawBidsRef.current, snapshot.bids);
        replaceBookSideFromRows(rawAsksRef.current, snapshot.asks);
        rawBidsCountRef.current = rawBidsRef.current.size;
        rawAsksCountRef.current = rawAsksRef.current.size;
        lastUpdateIdRef.current = lastUpdateId;
        snapshotReadyRef.current = true;
        void writeDesktopLog("desktop_orderbook_snapshot_loaded", {
          symbol: cleanSymbol,
          lastUpdateId,
          rawBidsCount: rawBidsRef.current.size,
          rawAsksCount: rawAsksRef.current.size,
          bufferedDiffs: pendingDiffsRef.current.length,
        });
        if (!applyBufferedDiffs()) return false;
        pushVisibleBookSnapshot(Date.now());
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(err instanceof Error ? err : new Error(message));
        void writeDesktopLog("desktop_orderbook_apply_error", {
          symbol: cleanSymbol,
          phase: "snapshot",
          message,
        });
        return false;
      }
    };

    const connectFallbackDepth20 = () => {
      if (cancelled) return;
      resetLocalBook();
      currentModeRef.current = "fallback-depth20";
      updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "loading"));

      void writeDesktopLog("desktop_orderbook_fallback_depth20", {
        symbol: cleanSymbol,
        url: fallbackWsUrl,
      });

      const ws = new WebSocket(fallbackWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttempt = 0;
        setError(null);
        updateTradesStreamConnected(true);
        console.debug("[DESKTOP_BOOKMAP_FEED] ws connected", {
          symbol: cleanSymbol,
          url: fallbackWsUrl,
          mode: currentModeRef.current,
        });
        void writeDesktopLog("desktop_feed_connected", {
          symbol: cleanSymbol,
          url: fallbackWsUrl,
          mode: currentModeRef.current,
          reconnectCount: reconnectCountRef.current,
        });
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(String(event.data)) as BinanceCombinedMessage;
          const stream = msg.stream ?? "";
          const data = msg.data;
          messagesReceivedRef.current += 1;
          if (stream.includes("@depth") && data && typeof data === "object") {
            handleDepthRef.current(data as BinanceDepthWire);
          } else if (stream.includes("@aggTrade")) {
            ingestTradeRef.current(data);
          }
        } catch (err) {
          const nextError = err instanceof Error ? err : new Error("Desktop feed parse error");
          setError(nextError);
          console.debug("[DESKTOP_BOOKMAP_FEED] error", { message: nextError.message });
          void writeDesktopLog("desktop_feed_error", {
            symbol: cleanSymbol,
            message: nextError.message,
            phase: "parse",
          });
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        const nextError = new Error("Desktop Binance WebSocket error");
        setError(nextError);
        updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "error"));
        console.debug("[DESKTOP_BOOKMAP_FEED] error/reconnect", { symbol: cleanSymbol });
        void writeDesktopLog("desktop_feed_error", {
          symbol: cleanSymbol,
          message: nextError.message,
          phase: "websocket",
        });
      };

      ws.onclose = () => {
        if (cancelled) return;
        updateTradesStreamConnected(false);
        updateFeedStatusFromCurrent((status) => (status === "live" ? "offline" : status));
        if (suppressNextReconnect) {
          suppressNextReconnect = false;
          return;
        }
        const delayMs = Math.min(10_000, 1_000 + reconnectAttempt * 1_000);
        reconnectAttempt += 1;
        reconnectCountRef.current += 1;
        setReconnectCount(reconnectCountRef.current);
        console.debug("[DESKTOP_BOOKMAP_FEED] error/reconnect", {
          symbol: cleanSymbol,
          delayMs,
        });
        void writeDesktopLog("desktop_feed_reconnect", {
          symbol: cleanSymbol,
          delayMs,
          reconnectCount: reconnectCountRef.current,
          mode: currentModeRef.current,
        });
        reconnectTimerRef.current = window.setTimeout(connectFallbackDepth20, delayMs);
      };
    };

    const resyncOrderbook = (reason: string) => {
      if (cancelled) return;
      resyncCountRef.current += 1;
      void writeDesktopLog("desktop_orderbook_resync", {
        symbol: cleanSymbol,
        reason,
        resyncCount: resyncCountRef.current,
        reconnectCount: reconnectCountRef.current,
      });
      resetLocalBook();
      suppressNextReconnect = true;
      wsRef.current?.close();
      reconnectTimerRef.current = window.setTimeout(connectReconstructed, 1_000);
    };

    function connectReconstructed() {
      if (cancelled) return;
      resetLocalBook();
      currentModeRef.current = "reconstructed";
      updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "loading"));

      const ws = new WebSocket(diffWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttempt = 0;
        setError(null);
        updateTradesStreamConnected(true);
        console.debug("[DESKTOP_BOOKMAP_FEED] ws connected", {
          symbol: cleanSymbol,
          url: diffWsUrl,
          mode: currentModeRef.current,
        });
        void writeDesktopLog("desktop_orderbook_diff_connected", {
          symbol: cleanSymbol,
          url: diffWsUrl,
          bookDepthLimit: DESKTOP_BOOKMAP_DEPTH_LIMIT,
        });
        void writeDesktopLog("desktop_feed_connected", {
          symbol: cleanSymbol,
          url: diffWsUrl,
          mode: currentModeRef.current,
          reconnectCount: reconnectCountRef.current,
        });
        void loadSnapshot().then((ok) => {
          if (cancelled || ok) return;
          suppressNextReconnect = true;
          ws.close();
          connectFallbackDepth20();
        });
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(String(event.data)) as BinanceCombinedMessage;
          const stream = msg.stream ?? "";
          const data = msg.data;
          messagesReceivedRef.current += 1;
          if (stream.includes("@depth") && data && typeof data === "object") {
            const diff = data as BinanceDiffDepthWire;
            diffMessagesReceivedRef.current += 1;
            if (!snapshotReadyRef.current) {
              pendingDiffsRef.current.push(diff);
              if (pendingDiffsRef.current.length > 2_000) {
                pendingDiffsRef.current = pendingDiffsRef.current.slice(-1_000);
              }
              return;
            }
            if (!applyDiff(diff)) {
              resyncOrderbook("sequence_gap_or_apply_error");
            }
          } else if (stream.includes("@aggTrade")) {
            ingestTradeRef.current(data);
          }
        } catch (err) {
          const nextError = err instanceof Error ? err : new Error("Desktop feed parse error");
          setError(nextError);
          console.debug("[DESKTOP_BOOKMAP_FEED] error", { message: nextError.message });
          void writeDesktopLog("desktop_feed_error", {
            symbol: cleanSymbol,
            message: nextError.message,
            phase: "parse",
            mode: currentModeRef.current,
          });
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        const nextError = new Error("Desktop Binance WebSocket error");
        setError(nextError);
        updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "error"));
        console.debug("[DESKTOP_BOOKMAP_FEED] error/reconnect", {
          symbol: cleanSymbol,
          mode: currentModeRef.current,
        });
        void writeDesktopLog("desktop_feed_error", {
          symbol: cleanSymbol,
          message: nextError.message,
          phase: "websocket",
          mode: currentModeRef.current,
        });
      };

      ws.onclose = () => {
        if (cancelled) return;
        updateTradesStreamConnected(false);
        updateFeedStatusFromCurrent((status) => (status === "live" ? "offline" : status));
        if (suppressNextReconnect) {
          suppressNextReconnect = false;
          return;
        }
        const delayMs = Math.min(10_000, 1_000 + reconnectAttempt * 1_000);
        reconnectAttempt += 1;
        reconnectCountRef.current += 1;
        setReconnectCount(reconnectCountRef.current);
        console.debug("[DESKTOP_BOOKMAP_FEED] error/reconnect", {
          symbol: cleanSymbol,
          delayMs,
          mode: currentModeRef.current,
        });
        void writeDesktopLog("desktop_feed_reconnect", {
          symbol: cleanSymbol,
          delayMs,
          reconnectCount: reconnectCountRef.current,
          mode: currentModeRef.current,
        });
        reconnectTimerRef.current = window.setTimeout(connectReconstructed, delayMs);
      };
    }

    connectReconstructed();

    registerDesktopFeedReconnectHandler(() => {
      resyncOrderbook("manual_reconnect");
    });

    return () => {
      registerDesktopFeedReconnectHandler(null);
      cancelled = true;
      window.clearTimeout(noDataTimeoutId);
      if (visualUpdateTimerRef.current != null) {
        window.clearTimeout(visualUpdateTimerRef.current);
        visualUpdateTimerRef.current = null;
      }
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      connectedRef.current = false;
      if (sessionStartedAtRef.current) {
        void writeHeatmapSessionMetadata({
          symbol: cleanSymbol,
          source: "spot",
          startedAt: sessionStartedAtRef.current,
          endedAt: nowIso(),
          bucketMs: DESKTOP_BOOKMAP_BUCKET_MS,
          depth: DESKTOP_BOOKMAP_DEPTH_LIMIT,
        });
      }
    };
  }, [
    canUseSpotFeed,
    cleanSymbol,
    updateFeedStatus,
    updateFeedStatusFromCurrent,
    updateTradesStreamConnected,
    diffWsUrl,
    fallbackWsUrl,
    pushVisibleBookSnapshot,
    scheduleVisibleBookSnapshot,
    snapshotUrl,
  ]);

  useEffect(() => {
    if (!canUseSpotFeed) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const payload = {
        symbol: cleanSymbol,
        bookDepthLimit: DESKTOP_BOOKMAP_DEPTH_LIMIT,
        visibleDepthLimit: useDesktopFullRawDomLadder()
          ? BOOKMAP_DESKTOP_DOM_RAW_DEPTH_LIMIT
          : DESKTOP_BOOKMAP_VISIBLE_DEPTH_LIMIT,
        rawBidsCount: rawBidsCountRef.current,
        rawAsksCount: rawAsksCountRef.current,
        visibleBidsCount: bidsCountRef.current,
        visibleAsksCount: asksCountRef.current,
        lastUpdateId: lastUpdateIdRef.current,
        messagesReceived: messagesReceivedRef.current,
        diffMessagesReceived: diffMessagesReceivedRef.current,
        tradesCount: tradesRef.current.length,
        reconnectCount: reconnectCountRef.current,
        resyncCount: resyncCountRef.current,
        lastUpdateAgeMs: lastUpdateRef.current != null ? now - lastUpdateRef.current : null,
        connected: connectedRef.current,
      };
      if (import.meta.env.DEV) {
        console.debug("[DESKTOP_BOOKMAP_FEED]", payload);
      }
      void writeDesktopLog("desktop_feed_heartbeat", payload);
      const heatmapStats = heatmapStatsRef.current;
      publishDesktopFeedDiagnostics({
        provider: currentModeRef.current === "fallback-depth20" ? "Binance Spot depth20" : "Binance Spot local book",
        symbol: cleanSymbol,
        connected: connectedRef.current,
        feedStatus: feedStatusRef.current,
        lastUpdateAgeMs: lastUpdateRef.current != null ? now - lastUpdateRef.current : null,
        lastHeartbeatAt: now,
        reconnectCount: reconnectCountRef.current,
        resyncCount: resyncCountRef.current,
        rawBidsCount: rawBidsCountRef.current,
        rawAsksCount: rawAsksCountRef.current,
        visibleBidsCount: bidsCountRef.current,
        visibleAsksCount: asksCountRef.current,
        heatmapCellCount: heatmapStats.cellCount,
        lastError: error?.message ?? null,
      });
      void writeDesktopLog("desktop_heatmap_heartbeat", {
        symbol: cleanSymbol,
        cellCount: heatmapStats.cellCount,
        activeLevels: heatmapStats.activeLevels,
        staleLevels: heatmapStats.staleLevels,
        pulledCount: heatmapStats.pulledCount,
        stackedCount: heatmapStats.stackedCount,
        wallCount: heatmapStats.wallCount,
        maxIntensity: heatmapStats.maxIntensity,
        pruneCount: heatmapStats.pruneCount,
        memoryWindowMs: heatmapStats.memoryWindowMs,
        priceBucketSize: heatmapStats.priceBucketSize,
        timeBucketMs: heatmapStats.timeBucketMs,
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [canUseSpotFeed, cleanSymbol, error]);

  const getSnapshots = useCallback(() => snapshotsRef.current, []);
  const getRecentTrades = useCallback(() => tradesRef.current, []);
  const spot = useMemo(() => {
    const bid = bookmapState?.bids[0]?.price;
    const ask = bookmapState?.asks[0]?.price;
    return bid != null && ask != null && ask >= bid ? (bid + ask) / 2 : null;
  }, [bookmapState]);

  const query = useMemo(
    () => ({
      data: bookmapState ?? undefined,
      market: "spot" as BookmapMarketSource,
      isLoading: canUseSpotFeed && !bookmapState && feedStatus === "loading",
      isFetching: canUseSpotFeed && tradesStreamConnected,
      error,
      refetch: async () => ({ data: bookmapState ?? undefined }),
      ageMs: bookmapState?.timestamp != null ? Math.max(0, Date.now() - bookmapState.timestamp) : null,
      dataUpdatedAt,
    }),
    [bookmapState, canUseSpotFeed, dataUpdatedAt, error, feedStatus, tradesStreamConnected],
  );

  return {
    enabled: canUseSpotFeed,
    bookmapState,
    query,
    getSnapshots,
    snapshotCount,
    spot,
    feedStatus,
    exchange: "Binance Desktop",
    getRecentTrades,
    pipelineStats,
    tradeTick,
    tradeVersion,
    tradeBufferCount,
    receivedTradeCount,
    tradesStreamConnected,
    market: "spot" as BookmapMarketSource,
    orderbookMarket: "spot" as BookmapMarketSource,
    latestTradeTs,
    lastMessageTs,
    sseUrl: diffWsUrl,
    bufferKey: `desktop:${cleanSymbol}:spot`,
    orderbookReceivedAt,
    orderbookAgeMs:
      orderbookReceivedAt != null ? Math.max(0, Date.now() - orderbookReceivedAt) : null,
    reconnectCount,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}
