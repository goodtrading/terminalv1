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

  const [bookmapState, setBookmapState] = useState<BookmapState | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [feedStatus, setFeedStatus] = useState<"loading" | "live" | "error" | "empty" | "offline">(
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
    setDataUpdatedAt(Date.now());
    setFeedStatus("live");

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
  }, [cleanSymbol]);

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
  }, []);

  const handleDepth = useCallback((raw: BinanceDepthWire) => {
    const bids = parseLevels(raw.bids ?? raw.b, "bid");
    const asks = parseLevels(raw.asks ?? raw.a, "ask");
    if (!bids.length || !asks.length) {
      setFeedStatus((status) => (status === "live" ? "live" : "empty"));
      return;
    }
    pushSnapshot({
      ts: Number.isFinite(raw.E) ? Number(raw.E) : Date.now(),
      bids,
      asks,
    });
  }, [pushSnapshot]);

  useEffect(() => {
    snapshotsRef.current = [];
    tradesRef.current = [];
    seenTradeKeysRef.current = new Set();
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

    if (!canUseSpotFeed) {
      setFeedStatus("offline");
      setTradesStreamConnected(false);
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;

    const connect = () => {
      if (cancelled) return;
      setFeedStatus((status) => (status === "live" ? "live" : "loading"));

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        reconnectAttempt = 0;
        setError(null);
        setTradesStreamConnected(true);
        console.debug("[DESKTOP_BOOKMAP_FEED] ws connected", { symbol: cleanSymbol, url: wsUrl });
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(String(event.data)) as BinanceCombinedMessage;
          const stream = msg.stream ?? "";
          const data = msg.data;
          if (stream.includes("@depth") && data && typeof data === "object") {
            handleDepth(data as BinanceDepthWire);
          } else if (stream.includes("@aggTrade")) {
            ingestTrade(data);
          }
        } catch (err) {
          const nextError = err instanceof Error ? err : new Error("Desktop feed parse error");
          setError(nextError);
          console.debug("[DESKTOP_BOOKMAP_FEED] error", { message: nextError.message });
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setError(new Error("Desktop Binance WebSocket error"));
        setFeedStatus((status) => (status === "live" ? "live" : "error"));
        console.debug("[DESKTOP_BOOKMAP_FEED] error/reconnect", { symbol: cleanSymbol });
      };

      ws.onclose = () => {
        if (cancelled) return;
        setTradesStreamConnected(false);
        setFeedStatus((status) => (status === "live" ? "offline" : status));
        const delayMs = Math.min(10_000, 1_000 + reconnectAttempt * 1_000);
        reconnectAttempt += 1;
        console.debug("[DESKTOP_BOOKMAP_FEED] error/reconnect", {
          symbol: cleanSymbol,
          delayMs,
        });
        reconnectTimerRef.current = window.setTimeout(connect, delayMs);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [canUseSpotFeed, cleanSymbol, handleDepth, ingestTrade, wsUrl]);

  useEffect(() => {
    if (!canUseSpotFeed || !import.meta.env.DEV) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      console.debug("[DESKTOP_BOOKMAP_FEED]", {
        connected: tradesStreamConnected,
        bids: bookmapState?.bids.length ?? 0,
        asks: bookmapState?.asks.length ?? 0,
        trades: tradesRef.current.length,
        lastUpdateAgeMs: lastUpdateRef.current != null ? now - lastUpdateRef.current : null,
        status: feedStatus,
      });
    }, 2_000);
    return () => window.clearInterval(id);
  }, [canUseSpotFeed, tradesStreamConnected, bookmapState, feedStatus]);

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
  };
}
