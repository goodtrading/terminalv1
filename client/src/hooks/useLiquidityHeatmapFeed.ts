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
  type BookmapMarketSource,
} from "@shared/bookmapMarket";

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

function ingestTrade(
  tradesRef: { current: HeatmapTrade[] },
  trade: HeatmapTrade,
  onUpdate: (buffered: number, received: number) => void,
  receivedRef: { count: number },
): void {
  receivedRef.count += 1;
  tradesRef.current = appendTradeToBuffer(tradesRef.current, trade);
  onUpdate(tradesRef.current.length, receivedRef.count);
}

export function useLiquidityHeatmapFeed(
  symbol = "BTCUSDT",
  enabled = true,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
) {
  const snapshotsRef = useRef<LiquiditySnapshot[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [feedStatus, setFeedStatus] = useState<
    "loading" | "live" | "error" | "empty" | "offline"
  >("loading");
  const [exchange, setExchange] = useState("Binance");
  const [pipelineStats, setPipelineStats] = useState<HeatmapPipelineStats>(EMPTY_STATS);
  const tradesRef = useRef<HeatmapTrade[]>([]);
  const [tradeTick, setTradeTick] = useState(0);
  const [tradeBufferCount, setTradeBufferCount] = useState(0);
  const [receivedTradeCount, setReceivedTradeCount] = useState(0);
  const [tradesStreamConnected, setTradesStreamConnected] = useState(false);
  const receivedRef = useRef(0);
  const spotRef = useRef<number | null>(null);

  const { data: ticker } = useQuery({
    queryKey: ["flows-ticker", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/market/ticker?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error("Ticker failed");
      return res.json() as { price?: number; last?: number };
    },
    enabled,
    refetchInterval: 2000,
    staleTime: 1000,
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

  const bumpTradeStats = useCallback((buffered: number, received: number) => {
    const safeBuffered = Number.isFinite(buffered) ? Math.max(0, Math.floor(buffered)) : 0;
    const safeReceived = Number.isFinite(received) ? Math.max(0, Math.floor(received)) : 0;
    setTradeBufferCount(safeBuffered);
    setReceivedTradeCount(safeReceived);
    setTradeTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const endpoint = `/api/orderbook/raw?symbol=${encodeURIComponent(symbol)}&market=${market}`;

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

        if (raw.exchange) {
          setExchange(raw.exchange === "kraken" ? "Kraken" : "Binance");
        }

        setPipelineStats({
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
        });

        if (snap.bids.length === 0 && snap.asks.length === 0) {
          const prev = snapshotsRef.current[snapshotsRef.current.length - 1];
          if (prev) {
            pushSnapshot({ ...prev, ts: Date.now() });
          } else {
            setFeedStatus((s) => (s === "live" ? "live" : "empty"));
          }
        } else {
          pushSnapshot(snap);
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
  }, [enabled, symbol, market, pushSnapshot]);

  useEffect(() => {
    if (!enabled) return;

    tradesRef.current = [];
    receivedRef.current = 0;
    setTradeBufferCount(0);
    setReceivedTradeCount(0);
    setTradesStreamConnected(false);

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleWireTrade = (raw: unknown) => {
      const trade = parseRawTradeEvent(raw);
      if (!trade || trade.sizeBtc < TRADE_INGEST_FLOOR_BTC) return;
      ingestTrade(tradesRef, trade, bumpTradeStats, receivedRef);
    };

    const seedFromRest = async () => {
      const endMs = Date.now();
      const startMs = endMs - TRADE_BUFFER_MS;
      try {
        const params = new URLSearchParams({
          symbol,
          market,
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
            rows: rows.length,
            bufferedTrades: tradesRef.current.length,
          });
        }
      } catch (e) {
        if (import.meta.env?.DEV) {
          console.warn("[BOOKMAP_TRADES] REST seed failed", e);
        }
      }
    };

    const connect = () => {
      if (cancelled) return;
      es?.close();

      const params = new URLSearchParams({
        symbol,
        market,
        since: String(Date.now() - 5_000),
      });
      es = new EventSource(`/api/market/agg-trades/stream?${params}`);

      es.addEventListener("open", () => {
        setTradesStreamConnected(true);
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
          reconnectTimer = setTimeout(connect, 2_500);
        }
      };
    };

    void seedFromRest();
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      es?.close();
      setTradesStreamConnected(false);
    };
  }, [enabled, symbol, market, bumpTradeStats]);

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
    tradeBufferCount,
    receivedTradeCount,
    tradesStreamConnected,
    market,
  };
}
