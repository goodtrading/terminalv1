import type { HeatmapTrade } from "./liquidityHeatmapUtils";

/** Server SSE / gateway normalized aggTrade row. */
type BufferedAggTradeWire = {
  id?: string;
  price?: number | string;
  qty?: number | string;
  time?: number | string;
  side?: "buy" | "sell";
};

/** Binance aggTrade wire fields. */
type BinanceAggTradeWire = {
  a?: number | string;
  p?: number | string;
  q?: number | string;
  T?: number | string;
  m?: boolean;
};

/**
 * Parse SSE/REST trade payloads into HeatmapTrade.
 * Supports normalized buffer rows and raw Binance aggTrade.
 */
export function parseRawTradeEvent(raw: unknown): HeatmapTrade | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as BufferedAggTradeWire & BinanceAggTradeWire;

  if (row.price != null && (row.qty != null || (row as { quantity?: unknown }).quantity != null)) {
    const price = Number(row.price);
    const qty = Number(row.qty ?? (row as { quantity?: number }).quantity);
    const ts = Number(row.time ?? row.T);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
    if (!Number.isFinite(ts)) return null;
    let side: "buy" | "sell" | null = null;
    if (row.side === "buy" || row.side === "sell") {
      side = row.side;
    } else if (typeof row.m === "boolean") {
      side = row.m ? "sell" : "buy";
    }
    if (!side) return null;
    return {
      id: row.id != null ? String(row.id) : row.a != null ? String(row.a) : undefined,
      price,
      sizeBtc: qty,
      side,
      ts,
    };
  }

  if (row.p != null && row.q != null) {
    const price = parseFloat(String(row.p));
    const qty = parseFloat(String(row.q));
    const ts = Number(row.T);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
    if (!Number.isFinite(ts)) return null;
    return {
      id: row.a != null ? String(row.a) : undefined,
      price,
      sizeBtc: qty,
      side: row.m === true ? "sell" : "buy",
      ts,
    };
  }

  return null;
}
