import type { FootprintAggTrade } from "@/lib/footprintTypes";
import { normalizeFootprintFetchWindow } from "@/lib/footprintFetchWindow";

function normalizeTradeTimeMs(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return NaN;
  return n < 1e11 ? Math.floor(n * 1000) : Math.floor(n);
}

export async function fetchFootprintAggTrades(
  symbol: string,
  startTimeMs: number,
  endTimeMs: number,
  limit = 5000,
  barSec = 60,
): Promise<FootprintAggTrade[]> {
  const { startMs, endMs } = normalizeFootprintFetchWindow(startTimeMs, endTimeMs, barSec);

  const parseRows = (raw: unknown): FootprintAggTrade[] => {
    if (!Array.isArray(raw)) return [];
    const out: FootprintAggTrade[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const price = Number(r.price);
      const qty = Number(r.qty);
      const time = normalizeTradeTimeMs(r.time);
      const side = r.side === "sell" ? "sell" : "buy";
      if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(time)) continue;
      out.push({
        id: String(r.id ?? ""),
        price,
        qty,
        time,
        side,
      });
    }
    return out;
  };
  const minMaxTime = (rows: FootprintAggTrade[]) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const r of rows) {
      if (r.time < min) min = r.time;
      if (r.time > max) max = r.time;
    }
    return {
      minTradeTime: Number.isFinite(min) ? min : null,
      maxTradeTime: Number.isFinite(max) ? max : null,
    };
  };

  const reqLimit = String(Math.min(5000, Math.max(1, limit)));
  const paramsFull = new URLSearchParams({
    symbol,
    startTime: String(startMs),
    endTime: String(endMs),
    limit: reqLimit,
    fullRange: "1",
  });
  try {
    const resFull = await fetch(`/api/market/agg-trades?${paramsFull}`);
    if (!resFull.ok) throw new Error(`agg-trades fullRange ${resFull.status}`);
    const rowsFull = parseRows(await resFull.json());
    if (process.env.NODE_ENV !== "production") {
      const mm = minMaxTime(rowsFull);
      console.debug("[FootprintFetch] fullRange", {
        symbol,
        startMs,
        endMs,
        count: rowsFull.length,
        minTradeTime: mm.minTradeTime,
        maxTradeTime: mm.maxTradeTime,
      });
    }
    if (rowsFull.length > 0) return rowsFull;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[FootprintFetch] fullRange failed, fallback simple", {
        symbol,
        startMs,
        endMs,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const paramsSimple = new URLSearchParams({
    symbol,
    startTime: String(startMs),
    endTime: String(endMs),
    limit: reqLimit,
  });
  const res = await fetch(`/api/market/agg-trades?${paramsSimple}`);
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { details?: string }).details || `agg-trades ${res.status}`);
  }
  const out = parseRows(await res.json());
  if (process.env.NODE_ENV !== "production") {
    const mm = minMaxTime(out);
    console.debug("[FootprintFetch] simple fallback", {
      symbol,
      startMs,
      endMs,
      count: out.length,
      minTradeTime: mm.minTradeTime,
      maxTradeTime: mm.maxTradeTime,
    });
  }
  return out;
}
