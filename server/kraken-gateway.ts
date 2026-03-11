/**
 * Kraken market data gateway.
 * Phase 1A: ticker + candles. Phase 1B: order book (getKrakenOrderBook).
 */

const KRAKEN_BASE = "https://api.kraken.com/0/public";

/** Map internal symbol (e.g. BTCUSDT) to Kraken pair (e.g. XBTUSD). */
export const KRAKEN_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "XBTUSD",
  BTCUSD: "XBTUSD",
};

function toKrakenPair(symbol: string): string {
  return KRAKEN_SYMBOL_MAP[symbol.toUpperCase()] ?? symbol;
}

async function fetchKraken(path: string, timeoutMs = 5000): Promise<{ data: any; latency: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${KRAKEN_BASE}${path}`, { signal: controller.signal });
    clearTimeout(id);
    const latency = Date.now() - start;
    if (!res.ok) throw new Error(`Kraken status ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(data.error.join("; "));
    return { data, latency };
  } catch (e: any) {
    clearTimeout(id);
    throw e;
  }
}

/** Kraken ticker: result has dynamic key (e.g. XXBTZUSD), value.c = [last, volume]. */
export async function getKrakenTicker(symbol: string): Promise<{
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
}> {
  const pair = toKrakenPair(symbol);
  const { data, latency } = await fetchKraken(`/Ticker?pair=${pair}`);
  const result = data.result as Record<string, { c?: string[] }>;
  const key = Object.keys(result)[0];
  if (!key || !result[key]?.c?.length) throw new Error("Kraken ticker: no price");
  const price = parseFloat(result[key].c![0]);
  if (!Number.isFinite(price)) throw new Error("Kraken ticker: invalid price");
  return {
    symbol,
    price,
    timestamp: Date.now(),
    source: `Kraken(${latency}ms)`,
  };
}

/** Kraken OHLC: result has dynamic key, value = array of [time, open, high, low, close, vwap, volume, count]. Time in seconds. */
export interface KrakenCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Map interval to Kraken minutes. Kraken: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 */
function intervalToKrakenMinutes(interval: string): number {
  const m = interval.toLowerCase().replace("m", "").replace("h", "").replace("d", "");
  if (interval.endsWith("m")) return parseInt(m, 10) || 15;
  if (interval.endsWith("h")) return (parseInt(m, 10) || 1) * 60;
  if (interval.endsWith("d")) return (parseInt(m, 10) || 1) * 1440;
  return 15;
}

export async function getKrakenCandles(
  symbol: string,
  interval: string = "15m",
  limit: number = 500
): Promise<KrakenCandle[]> {
  const pair = toKrakenPair(symbol);
  const intervalMin = intervalToKrakenMinutes(interval);
  const { data } = await fetchKraken(`/OHLC?pair=${pair}&interval=${intervalMin}`);
  const result = data.result as Record<string, unknown>;
  const key = Object.keys(result).find((k) => k !== "last");
  if (!key) throw new Error("Kraken OHLC: no data");
  const rows = result[key] as Array<[number, string, string, string, string, string, string, number]>;
  if (!Array.isArray(rows)) throw new Error("Kraken OHLC: invalid format");
  const candles: KrakenCandle[] = rows.slice(-limit).map((row) => ({
    time: row[0],
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[6]),
  }));
  return candles.filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close)).sort((a, b) => a.time - b.time);
}

// --- Phase 1B: Order book (same shape as Binance for frontend) ---
/** Normalized order book level: same shape as orderbookService.OrderBookLevel. */
export interface KrakenOrderBookLevel {
  price: number;
  size: number;
}

/** Kraken Depth API: result.<pair> = { bids: [["price","vol","timestamp"]], asks: [...] }. */
export async function getKrakenOrderBook(
  symbol: string,
  limit: number = 500
): Promise<{ bids: KrakenOrderBookLevel[]; asks: KrakenOrderBookLevel[]; timestamp: number }> {
  const pair = toKrakenPair(symbol);
  const count = Math.min(Math.max(limit, 1), 500);
  const { data } = await fetchKraken(`/Depth?pair=${pair}&count=${count}`);
  const result = data.result as Record<string, { bids?: [string, string, number][]; asks?: [string, string, number][] }>;
  const key = Object.keys(result).find((k) => result[k]?.bids != null);
  if (!key || !result[key]) throw new Error("Kraken Depth: no data");
  const raw = result[key];
  const parseSide = (
    rows: [string, string, number][] | undefined,
    descending: boolean
  ): KrakenOrderBookLevel[] =>
    (rows || [])
      .filter((r) => r && r.length >= 2 && parseFloat(r[1]) > 0)
      .map((r) => ({ price: parseFloat(r[0]), size: parseFloat(r[1]) }))
      .sort((a, b) => (descending ? b.price - a.price : a.price - b.price));
  const bids = parseSide(raw.bids, true);  // best bid first (descending)
  const asks = parseSide(raw.asks, false);  // best ask first (ascending)
  return {
    bids: bids.slice(0, limit),
    asks: asks.slice(0, limit),
    timestamp: Date.now(),
  };
}
