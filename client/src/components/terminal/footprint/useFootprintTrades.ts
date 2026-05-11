import React from "react";
import { useQuery } from "@tanstack/react-query";
import type { AggTrade } from "./footprintTypes";
import { tradeTimeToUnixMs } from "./footprintTime";

/**
 * Binance GET /api/v3/aggTrades: devuelve trades en orden ascendente desde `startTime` (máx. 1000 por página).
 * El gateway del servidor pagina avanzando el cursor hasta cubrir [startMs, endMs].
 * Una ventana corta anclada al extremo derecho del chart evita que `limit` 5000 se llene solo con histórico lejano.
 */
const FALLBACK_WINDOW_MS = 2 * 60 * 60 * 1000;

function transformBinanceAggTrade(raw: any): AggTrade {
  const rawT = Number(raw.T);
  return {
    id: String(raw.a),
    price: parseFloat(raw.p),
    qty: parseFloat(raw.q),
    time: tradeTimeToUnixMs(rawT),
    side: raw.m ? "sell" : "buy",
  };
}

function buildAggTradesUrl(symbol: string, startTimeMs: number, endTimeMs: number, limit: number): string {
  const params = new URLSearchParams({
    symbol,
    limit: limit.toString(),
    startTime: String(Math.floor(startTimeMs)),
    endTime: String(Math.floor(endTimeMs)),
  });
  return `/api/market/agg-trades?${params}`;
}

async function fetchAggTradesWithMeta(
  symbol: string,
  startTimeMs?: number,
  endTimeMs?: number,
  limit: number = 5000
): Promise<{ trades: AggTrade[]; firstRaw: any | null }> {
  const params = new URLSearchParams({
    symbol,
    limit: limit.toString(),
  });

  if (startTimeMs != null && Number.isFinite(startTimeMs)) {
    params.append("startTime", String(Math.floor(startTimeMs)));
  }
  if (endTimeMs != null && Number.isFinite(endTimeMs)) {
    params.append("endTime", String(Math.floor(endTimeMs)));
  }

  const url = `/api/market/agg-trades?${params}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      return { trades: [], firstRaw: null };
    }
    const firstRaw = data.length ? data[0] : null;
    return { trades: data.map(transformBinanceAggTrade), firstRaw };
  } catch (error) {
    console.error("[Footprint] Failed to fetch aggTrades:", error);
    return { trades: [], firstRaw: null };
  }
}

export function useFootprintTrades(
  symbol: string,
  startTimeMs?: number,
  endTimeMs?: number,
  enabled: boolean = true,
  windowDebug?: { visibleStartMs: number; visibleEndMs: number } | null
) {
  const query = useQuery({
    queryKey: ["footprint-trades", symbol, startTimeMs ?? null, endTimeMs ?? null],
    queryFn: async () => {
      const now = Date.now();
      const s =
        startTimeMs != null && Number.isFinite(startTimeMs)
          ? startTimeMs
          : now - FALLBACK_WINDOW_MS;
      const e = endTimeMs != null && Number.isFinite(endTimeMs) ? endTimeMs : now;
      const url = buildAggTradesUrl(symbol, s, e, 5000);
      if (import.meta.env.DEV && windowDebug) {
        // eslint-disable-next-line no-console
        console.warn("[FootprintTradesWindow]", {
          visibleStartMs: windowDebug.visibleStartMs,
          visibleEndMs: windowDebug.visibleEndMs,
          tradeStartMs: s,
          tradeEndMs: e,
          fetchWindowMinutes: (e - s) / 60000,
        });
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[FootprintTradesFetch]", {
          symbol,
          startTime: s,
          endTime: e,
          url,
        });
      }
      const { trades, firstRaw } = await fetchAggTradesWithMeta(symbol, s, e);
      const firstNormalized = trades[0] ?? null;
      if (import.meta.env.DEV) {
        const ft = firstNormalized?.time;
        // eslint-disable-next-line no-console
        console.warn("[FootprintTradesResult]", {
          symbol,
          startTime: s,
          endTime: e,
          tradesCount: trades.length,
          firstRaw,
          firstNormalized,
          firstTimeUnit: ft != null && ft > 1e12 ? "ms" : "seconds_or_invalid",
          firstTradeTime: ft ?? null,
          lastTradeTime: trades.length ? trades[trades.length - 1].time : null,
        });
      }
      return trades;
    },
    enabled: enabled && !!symbol,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchInterval: 60_000,
    retry: 2,
  });

  return query;
}

export function useFootprintTradesStream(
  symbol: string,
  onTrade: (trade: AggTrade) => void,
  enabled: boolean = true
) {
  React.useEffect(() => {
    if (!enabled) return;

    const params = new URLSearchParams({
      symbol,
      since: Date.now().toString(),
    });

    const eventSource = new EventSource(`/api/market/agg-trades/stream?${params}`);

    eventSource.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        onTrade(transformBinanceAggTrade(raw));
      } catch (error) {
        console.error("[Footprint] Stream parse error:", error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [symbol, onTrade, enabled]);
}
