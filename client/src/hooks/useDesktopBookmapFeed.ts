import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookmapState, BookLevel, HeatmapCell } from "@/types/bookmapState";
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
  writeDesktopLog,
  writeHeatmapSessionMetadata,
} from "@/lib/desktopStorage";

const DESKTOP_BOOKMAP_BUCKET_MS = 1_000;
const DESKTOP_BOOKMAP_MAX_CELLS = 2_400;
const DESKTOP_BOOKMAP_WS_BASE = "wss://stream.binance.com:9443/stream";

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

type BinanceCombinedMessage = {
  stream?: string;
  data?: unknown;
};

type DesktopFeedStatus = "loading" | "live" | "error" | "empty" | "offline";

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

function parseLevels(rows: unknown[] | undefined, side: "bid" | "ask"): OrderbookLevel[] {
  const levels = (rows ?? [])
    .map((row) => parseLevel(row, side))
    .filter((level): level is OrderbookLevel => level != null);
  levels.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return levels;
}

function levelToBookLevel(level: OrderbookLevel, now: number): BookLevel {
  const isMajor = level.sizeBtc >= HEATMAP_MAJOR_WALL_BTC;
  const isStructural = isMajor || level.sizeBtc >= 25;
  const isImportant = isStructural || level.sizeBtc >= 10;
  return {
    price: level.price,
    size: level.sizeBtc,
    side: level.side,
    firstSeenTs: now,
    lastUpdateTs: now,
    maxSeenSize: level.sizeBtc,
    isImportant,
    isStructural,
    isMajor,
    stale: false,
  };
}

function levelToHeatmapCell(level: OrderbookLevel, now: number): HeatmapCell {
  return {
    timeBucket: Math.floor(now / DESKTOP_BOOKMAP_BUCKET_MS) * DESKTOP_BOOKMAP_BUCKET_MS,
    price: level.price,
    side: level.side,
    size: level.sizeBtc,
    maxSizeInBucket: level.sizeBtc,
    lastSizeInBucket: level.sizeBtc,
    lastUpdateTs: now,
  };
}

function buildBookmapState(
  symbol: string,
  snapshot: LiquiditySnapshot,
  previousCells: HeatmapCell[],
): BookmapState {
  const now = snapshot.ts;
  const levels = [...snapshot.bids, ...snapshot.asks];
  const bids = snapshot.bids.map((level) => levelToBookLevel(level, now));
  const asks = snapshot.asks.map((level) => levelToBookLevel(level, now));
  const heatmapCells = [...previousCells, ...levels.map((level) => levelToHeatmapCell(level, now))]
    .slice(-DESKTOP_BOOKMAP_MAX_CELLS);
  const allBookLevels = [...bids, ...asks];

  return {
    symbol,
    exchange: "Binance Desktop",
    market: "spot",
    bids,
    asks,
    heatmapCells,
    importantWalls: allBookLevels.filter((level) => level.isImportant),
    structuralWalls: allBookLevels.filter((level) => level.isStructural),
    majorWalls: allBookLevels.filter((level) => level.isMajor),
    timestamp: now,
  };
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
  const wsRef = useRef<WebSocket | null>(null);
  const lastUpdateRef = useRef<number | null>(null);
  const bidsCountRef = useRef(0);
  const asksCountRef = useRef(0);
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
  }, [cleanSymbol]);

  const updateTradesStreamConnected = useCallback((connected: boolean) => {
    connectedRef.current = connected;
    setTradesStreamConnected(connected);
  }, []);

  const wsUrl = useMemo(() => {
    const streamSymbol = cleanSymbol.toLowerCase();
    const streams = `${streamSymbol}@depth20@100ms/${streamSymbol}@aggTrade`;
    return `${DESKTOP_BOOKMAP_WS_BASE}?streams=${streams}`;
  }, [cleanSymbol]);

  const pushSnapshot = useCallback((snapshot: LiquiditySnapshot) => {
    snapshotsRef.current = [...snapshotsRef.current, snapshot].slice(-MAX_LIQUIDITY_SNAPSHOTS);
    setSnapshotCount(snapshotsRef.current.length);
    setOrderbookReceivedAt(snapshot.ts);
    lastUpdateRef.current = Date.now();
    bidsCountRef.current = snapshot.bids.length;
    asksCountRef.current = snapshot.asks.length;
    setDataUpdatedAt(Date.now());
    updateFeedStatus("live");

    const nextStats: HeatmapPipelineStats = {
      rawBids: snapshot.bids.length,
      rawAsks: snapshot.asks.length,
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

    setBookmapState((prev) => buildBookmapState(cleanSymbol, snapshot, prev?.heatmapCells ?? []));
    if (!firstSnapshotLoggedRef.current) {
      firstSnapshotLoggedRef.current = true;
      void writeDesktopLog("desktop_bookmap_first_data", {
        symbol: cleanSymbol,
        bidsCount: snapshot.bids.length,
        asksCount: snapshot.asks.length,
        ts: snapshot.ts,
      });
    }
  }, [cleanSymbol, updateFeedStatus]);

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
    pushSnapshot({
      ts: Number.isFinite(raw.E) ? Number(raw.E) : Date.now(),
      bids,
      asks,
    });
  }, [pushSnapshot, updateFeedStatusFromCurrent]);

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
    bidsCountRef.current = 0;
    asksCountRef.current = 0;
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

    let cancelled = false;
    let reconnectAttempt = 0;
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
      depth: 20,
    });

    const connect = () => {
      if (cancelled) return;
      updateFeedStatusFromCurrent((status) => (status === "live" ? "live" : "loading"));

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttempt = 0;
        setError(null);
        updateTradesStreamConnected(true);
        console.debug("[DESKTOP_BOOKMAP_FEED] ws connected", { symbol: cleanSymbol, url: wsUrl });
        void writeDesktopLog("desktop_feed_connected", {
          symbol: cleanSymbol,
          url: wsUrl,
          reconnectCount: reconnectCountRef.current,
        });
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(String(event.data)) as BinanceCombinedMessage;
          const stream = msg.stream ?? "";
          const data = msg.data;
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
        });
        reconnectTimerRef.current = window.setTimeout(connect, delayMs);
      };
    };

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(noDataTimeoutId);
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
          depth: 20,
        });
      }
    };
  }, [
    canUseSpotFeed,
    cleanSymbol,
    updateFeedStatus,
    updateFeedStatusFromCurrent,
    updateTradesStreamConnected,
    wsUrl,
  ]);

  useEffect(() => {
    if (!canUseSpotFeed) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      const payload = {
        symbol: cleanSymbol,
        bidsCount: bidsCountRef.current,
        asksCount: asksCountRef.current,
        tradesCount: tradesRef.current.length,
        lastUpdateAgeMs: lastUpdateRef.current != null ? now - lastUpdateRef.current : null,
        reconnectCount: reconnectCountRef.current,
        connected: connectedRef.current,
      };
      if (import.meta.env.DEV) {
        console.debug("[DESKTOP_BOOKMAP_FEED]", payload);
      }
      void writeDesktopLog("desktop_feed_heartbeat", payload);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [canUseSpotFeed, cleanSymbol]);

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
    sseUrl: wsUrl,
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
