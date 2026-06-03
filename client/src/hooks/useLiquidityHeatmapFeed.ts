import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildSnapshotFromRaw,
  type HeatmapPipelineStats,
  type HeatmapTrade,
  type LiquiditySnapshot,
  MAX_LIQUIDITY_SNAPSHOTS,
  SNAPSHOT_INTERVAL_MS,
} from "@/components/flows/liquidityHeatmapUtils";
import { parseRawTradeEvent } from "@/components/flows/tradeFeedParse";
import {
  appendTradeToBuffer,
  TRADE_BUFFER_MS,
  TRADE_INGEST_FLOOR_BTC,
} from "@/components/flows/tradeBubbleUtils";
import {
  DEFAULT_BOOKMAP_MARKET,
  parseBookmapMarket,
  type BookmapMarketSource,
} from "@shared/bookmapMarket";
import { BOOKMAP_OB_STALE_MS } from "@shared/bookmapFreshness";

type RawBookResponse = {
  bids: unknown[];
  asks: unknown[];
  timestamp: number;
  exchange?: string;
};

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

/** Perp prints are often smaller than spot; keep ingest permissive, dots filter visually. */
const PERP_TRADE_INGEST_FLOOR_BTC = 0.0001;

type MarketTradeCache = {
  trades: HeatmapTrade[];
  received: number;
  latestTs: number | null;
  version: number;
};

type MarketOrderbookCache = {
  snapshot: LiquiditySnapshot | null;
  receivedAt: number | null;
  exchange: string;
  pipelineStats: HeatmapPipelineStats;
  version: number;
};

function tradeBufferKey(symbol: string, market: BookmapMarketSource): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
  return `binance:${sym}:${market}`;
}

function tradeDedupeKey(trade: HeatmapTrade): string {
  if (trade.id) return `${trade.market ?? ""}:id:${trade.id}`;
  return `${trade.market ?? ""}:${trade.ts}:${trade.price}:${trade.side}:${trade.sizeBtc}`;
}

function orderbookCacheKey(symbol: string, market: BookmapMarketSource): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
  return `${sym}:${market}`;
}

function tradeIngestFloor(market: BookmapMarketSource): number {
  return market === "perp" ? PERP_TRADE_INGEST_FLOOR_BTC : TRADE_INGEST_FLOOR_BTC;
}

export type LiquidityHeatmapFeedMarkets = {
  tradeMarket?: BookmapMarketSource;
  orderbookMarket?: BookmapMarketSource;
};

function resolveFeedMarkets(
  markets: BookmapMarketSource | LiquidityHeatmapFeedMarkets,
): { tradeMarket: BookmapMarketSource; orderbookMarket: BookmapMarketSource } {
  if (typeof markets === "string") {
    const m = parseBookmapMarket(markets);
    return { tradeMarket: m, orderbookMarket: m };
  }
  const tradeMarket = parseBookmapMarket(markets.tradeMarket);
  return {
    tradeMarket,
    orderbookMarket: parseBookmapMarket(markets.orderbookMarket ?? markets.tradeMarket),
  };
}

export function useLiquidityHeatmapFeed(
  symbol = "BTCUSDT",
  enabled = true,
  markets: BookmapMarketSource | LiquidityHeatmapFeedMarkets = DEFAULT_BOOKMAP_MARKET,
) {
  const { tradeMarket: marketForTrades, orderbookMarket: marketForOrderbook } =
    resolveFeedMarkets(markets);

  const snapshotsRef = useRef<LiquiditySnapshot[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [feedStatus, setFeedStatus] = useState<
    "loading" | "live" | "error" | "empty" | "offline"
  >("loading");
  const [exchange, setExchange] = useState("Binance");
  const [pipelineStats, setPipelineStats] = useState<HeatmapPipelineStats>(EMPTY_STATS);
  const tradesRef = useRef<HeatmapTrade[]>([]);
  const seenTradeKeysRef = useRef<Set<string>>(new Set());
  const marketCachesRef = useRef<Record<string, MarketTradeCache>>({});
  const orderbookCachesRef = useRef<Record<string, MarketOrderbookCache>>({});
  const [tradeTick, setTradeTick] = useState(0);
  const [tradeVersion, setTradeVersion] = useState(0);
  const [tradeBufferCount, setTradeBufferCount] = useState(0);
  const [receivedTradeCount, setReceivedTradeCount] = useState(0);
  const [tradesStreamConnected, setTradesStreamConnected] = useState(false);
  const [latestTradeTs, setLatestTradeTs] = useState<number | null>(null);
  const [lastMessageTs, setLastMessageTs] = useState<number | null>(null);
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const [orderbookReceivedAt, setOrderbookReceivedAt] = useState<number | null>(null);
  const receivedRef = useRef(0);
  const latestTsRef = useRef<number | null>(null);
  const lastMessageRef = useRef<number | null>(null);
  const tradeVersionRef = useRef(0);
  const flushScheduledRef = useRef(false);
  const reconnectTradesRef = useRef<(() => void) | null>(null);
  const spotRef = useRef<number | null>(null);

  const { data: ticker } = useQuery({
    queryKey: ["flows-ticker", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/market/ticker?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error("Ticker failed");
      return res.json() as { price?: number; last?: number };
    },
    enabled,
    refetchInterval: 2_000,
    staleTime: 1_000,
    retry: false,
  });

  const spot =
    ticker?.price != null && Number.isFinite(Number(ticker.price))
      ? Number(ticker.price)
      : ticker?.last != null && Number.isFinite(Number(ticker.last))
        ? Number(ticker.last)
        : null;

  spotRef.current = spot;

  const pushSnapshot = useCallback((snap: LiquiditySnapshot) => {
    const buf = snapshotsRef.current;
    buf.push(snap);
    if (buf.length > MAX_LIQUIDITY_SNAPSHOTS) {
      snapshotsRef.current = buf.slice(-MAX_LIQUIDITY_SNAPSHOTS);
    }
    setSnapshotCount(snapshotsRef.current.length);
    setFeedStatus("live");
  }, []);

  const getSnapshots = useCallback(() => snapshotsRef.current, []);

  const persistMarketCache = useCallback((market: BookmapMarketSource) => {
    marketCachesRef.current[tradeBufferKey(symbol, market)] = {
      trades: [...tradesRef.current],
      received: receivedRef.current,
      latestTs: latestTsRef.current,
      version: tradeVersionRef.current,
    };
  }, [symbol]);

  const restoreMarketCache = useCallback((market: BookmapMarketSource) => {
    const cached = marketCachesRef.current[tradeBufferKey(symbol, market)];
    tradesRef.current = cached?.trades.length ? [...cached.trades] : [];
    seenTradeKeysRef.current = new Set(tradesRef.current.map(tradeDedupeKey));
    receivedRef.current = cached?.received ?? 0;
    latestTsRef.current = cached?.latestTs ?? null;
    tradeVersionRef.current = cached?.version ?? 0;
    setTradeBufferCount(tradesRef.current.length);
    setReceivedTradeCount(receivedRef.current);
    setLatestTradeTs(latestTsRef.current);
    setLastMessageTs(lastMessageRef.current);
    setTradeVersion(tradeVersionRef.current);
    setTradeTick((n) => n + 1);
  }, [symbol]);

  const persistOrderbookCache = useCallback((
    market: BookmapMarketSource,
    snapshot: LiquiditySnapshot,
    receivedAt: number,
    nextExchange: string,
    nextPipelineStats: HeatmapPipelineStats,
  ) => {
    const key = orderbookCacheKey(symbol, market);
    orderbookCachesRef.current[key] = {
      snapshot,
      receivedAt,
      exchange: nextExchange,
      pipelineStats: nextPipelineStats,
      version: (orderbookCachesRef.current[key]?.version ?? 0) + 1,
    };
  }, [symbol]);

  const restoreOrderbookCache = useCallback((market: BookmapMarketSource): LiquiditySnapshot | null => {
    const key = orderbookCacheKey(symbol, market);
    const cached = orderbookCachesRef.current[key];
    if (!cached?.snapshot) return null;

    const ageMs = Date.now() - (cached.receivedAt ?? 0);
    if (ageMs > 30_000) return null;

    pushSnapshot(cached.snapshot);
    setOrderbookReceivedAt(cached.receivedAt);
    setExchange(cached.exchange);
    setPipelineStats(cached.pipelineStats);
    return cached.snapshot;
  }, [pushSnapshot, symbol]);

  const flushTradeStats = useCallback(() => {
    flushScheduledRef.current = false;
    const buffered = tradesRef.current.length;
    const received = receivedRef.current;
    const latestTs = latestTsRef.current;
    tradeVersionRef.current += 1;
    setTradeBufferCount(buffered);
    setReceivedTradeCount(received);
    setLatestTradeTs(latestTs);
    setLastMessageTs(lastMessageRef.current);
    setTradeVersion(tradeVersionRef.current);
    setTradeTick((n) => n + 1);
  }, []);

  const scheduleTradeFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    requestAnimationFrame(() => {
      flushTradeStats();
    });
  }, [flushTradeStats]);

  const ingestTrade = useCallback(
    (trade: HeatmapTrade) => {
      const dedupeKey = tradeDedupeKey(trade);
      if (seenTradeKeysRef.current.has(dedupeKey)) return;

      const prev = tradesRef.current;
      const next = appendTradeToBuffer(prev, trade);
      if (next === prev) return;

      receivedRef.current += 1;
      latestTsRef.current = trade.ts;
      lastMessageRef.current = Date.now();
      tradesRef.current = next;
      if (next.length === prev.length + 1) {
        seenTradeKeysRef.current.add(dedupeKey);
      } else {
        seenTradeKeysRef.current = new Set(next.map(tradeDedupeKey));
      }
      scheduleTradeFlush();
    },
    [scheduleTradeFlush],
  );

  useEffect(() => {
    snapshotsRef.current = [];
    setSnapshotCount(0);
    setOrderbookReceivedAt(null);
    
    const cached = restoreOrderbookCache(marketForOrderbook);
    if (cached && import.meta.env?.DEV) {
      const key = orderbookCacheKey(symbol, marketForOrderbook);
      console.debug("[BOOKMAP_ORDERBOOK] Restored from cache", {
        symbol,
        market: marketForOrderbook,
        ageMs: Date.now() - (orderbookCachesRef.current[key]?.receivedAt ?? 0),
      });
    }
  }, [symbol, marketForOrderbook, restoreOrderbookCache]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const endpoint = `/api/orderbook/raw?symbol=${encodeURIComponent(symbol)}&market=${marketForOrderbook}`;

    const poll = async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`Orderbook ${res.status}`);
        const raw = (await res.json()) as RawBookResponse;
        if (cancelled) return;

        const snap = buildSnapshotFromRaw(raw);

        if (import.meta.env?.DEV) {
          console.debug("[FLOW_HEATMAP_SOURCE]", {
            endpoint,
            connected: true,
            rawBids: raw.bids?.length ?? 0,
            rawAsks: raw.asks?.length ?? 0,
            normalizedBids: snap.bids.length,
            normalizedAsks: snap.asks.length,
            firstBid: raw.bids?.[0],
            firstAsk: raw.asks?.[0],
            snapshots: snapshotsRef.current.length,
          });
        }

        const nextExchange = raw.exchange === "kraken" ? "Kraken" : "Binance";
        if (raw.exchange) setExchange(nextExchange);

        const obTs = Number(raw.timestamp);
        const nextOrderbookReceivedAt =
          Number.isFinite(obTs) && obTs > 0 ? obTs : Date.now();
        setOrderbookReceivedAt(nextOrderbookReceivedAt);

        const nextPipelineStats = {
          rawBids: raw.bids?.length ?? 0,
          rawAsks: raw.asks?.length ?? 0,
          normalizedBids: snap.bids.length,
          normalizedAsks: snap.asks.length,
          visibleBids: 0,
          visibleAsks: 0,
          heatmapLevels: 0,
          renderedHeatmap: 0,
          aboveMinHeatmap: 0,
          majorWallsHeatmap: 0,
          majorWallsRaw: [...snap.bids, ...snap.asks].filter((l) => l.sizeBtc >= 100).length,
          majorWallsVisible: 0,
          domBuckets: 0,
          nonZeroBidBuckets: 0,
          nonZeroAskBuckets: 0,
        };
        setPipelineStats(nextPipelineStats);

        if (snap.bids.length === 0 && snap.asks.length === 0) {
          const prev = snapshotsRef.current[snapshotsRef.current.length - 1];
          if (prev) {
            pushSnapshot({ ...prev, ts: Date.now() });
          } else {
            setFeedStatus((s) => (s === "live" ? "live" : "empty"));
          }
        } else {
          pushSnapshot(snap);
          persistOrderbookCache(
            marketForOrderbook,
            snap,
            nextOrderbookReceivedAt,
            nextExchange,
            nextPipelineStats,
          );
        }
      } catch {
        if (!cancelled) {
          setFeedStatus((prev) => (prev === "live" ? "live" : "offline"));
        }
      }
    };

    setFeedStatus("loading");
    poll();
    const id = window.setInterval(poll, SNAPSHOT_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, symbol, marketForOrderbook, pushSnapshot, persistOrderbookCache, restoreOrderbookCache]);

  useEffect(() => {
    if (!enabled) return;

    restoreMarketCache(marketForTrades);
    lastMessageRef.current = null;
    setTradesStreamConnected(false);

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let hadStreamConnected = false;
    const ingestFloor = tradeIngestFloor(marketForTrades);

    const handleWireTrade = (raw: unknown) => {
      const trade = parseRawTradeEvent(raw, marketForTrades);
      if (!trade || trade.sizeBtc < ingestFloor) return;
      ingestTrade(trade);
    };

    const seedFromRest = async () => {
      const endMs = Date.now();
      const startMs = endMs - TRADE_BUFFER_MS;
      try {
        const params = new URLSearchParams({
          symbol,
          market: marketForTrades,
          startTime: String(startMs),
          endTime: String(endMs),
          limit: "2000",
        });
        const res = await fetch(`/api/market/agg-trades?${params}`);
        if (!res.ok || cancelled) return;
        const rows = (await res.json()) as unknown[];
        if (!Array.isArray(rows)) return;
        for (const row of rows) {
          handleWireTrade(row);
        }
        if (import.meta.env?.DEV) {
          console.debug("[BOOKMAP_TRADES] REST seed", {
            symbol,
            market: marketForTrades,
            rows: rows.length,
            bufferedTrades: tradesRef.current.length,
          });
        }
      } catch (e) {
        if (import.meta.env?.DEV) {
          console.warn("[BOOKMAP_TRADES] REST seed failed", { market: marketForTrades, e });
        }
      }
    };

    const connect = () => {
      if (cancelled) return;
      es?.close();

      const params = new URLSearchParams({
        symbol,
        market: marketForTrades,
        since: String(Date.now() - TRADE_BUFFER_MS),
      });
      const url = `/api/market/agg-trades/stream?${params}`;
      setSseUrl(url);
      es = new EventSource(url);

      es.addEventListener("open", () => {
        const isReconnect = hadStreamConnected;
        hadStreamConnected = true;
        reconnectAttempt = 0;
        setTradesStreamConnected(true);
        void seedFromRest();
        if (isReconnect && import.meta.env?.DEV) {
          console.debug("[BOOKMAP_TRADES] SSE reconnect", { market: marketForTrades });
        }
      });

      es.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (raw?.ok === true) return;
          handleWireTrade(raw);
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        setTradesStreamConnected(false);
        es?.close();
        es = null;
        if (!cancelled) {
          const delay = Math.min(30_000, 1_500 + reconnectAttempt * 1_500);
          reconnectAttempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    reconnectTradesRef.current = () => {
      if (cancelled) return;
      void seedFromRest();
      connect();
    };

    void (async () => {
      await seedFromRest();
      connect();
    })();

    return () => {
      cancelled = true;
      persistMarketCache(marketForTrades);
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      es?.close();
      reconnectTradesRef.current = null;
      setTradesStreamConnected(false);
      setSseUrl(null);
    };
  }, [
    enabled,
    symbol,
    marketForTrades,
    ingestTrade,
    restoreMarketCache,
    persistMarketCache,
  ]);

  useEffect(() => {
    if (!enabled || marketForTrades !== "perp") return;

    const logHealth = () => {
      if (!import.meta.env.DEV) return;
      const latestAgeMs =
        latestTsRef.current != null ? Math.max(0, Date.now() - latestTsRef.current) : null;
      console.debug("[PERP_TRADES_HEALTH]", {
        connected: tradesStreamConnected,
        lastMessageTs: lastMessageRef.current,
        latestTradeTs: latestTsRef.current,
        latestAgeMs,
        tradesInBuffer: tradesRef.current.length,
        bufferKey: tradeBufferKey(symbol, "perp"),
        tradeVersion: tradeVersionRef.current,
        sseUrl,
      });
    };

    const id = window.setInterval(() => {
      logHealth();
      const latestAgeMs =
        latestTsRef.current != null ? Date.now() - latestTsRef.current : Infinity;
      if (latestAgeMs > BOOKMAP_OB_STALE_MS) {
        reconnectTradesRef.current?.();
      }
    }, 8_000);

    return () => window.clearInterval(id);
  }, [enabled, marketForTrades, symbol, tradesStreamConnected, sseUrl]);

  const getRecentTrades = useCallback(() => tradesRef.current, []);

  return {
    getSnapshots,
    snapshotCount,
    spot,
    feedStatus,
    exchange,
    getRecentTrades,
    pipelineStats,
    tradeTick,
    tradeVersion,
    tradeBufferCount,
    receivedTradeCount,
    tradesStreamConnected,
    market: marketForTrades,
    orderbookMarket: marketForOrderbook,
    latestTradeTs,
    lastMessageTs,
    sseUrl,
    bufferKey: tradeBufferKey(symbol, marketForTrades),
    orderbookReceivedAt,
    orderbookAgeMs:
      orderbookReceivedAt != null
        ? Math.max(0, Date.now() - orderbookReceivedAt)
        : null,
  };
}
