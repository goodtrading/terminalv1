/** Shared candle history limits for chart + /api/market/candles */

export const CANDLE_LIMIT_MIN = 50;
export const CANDLE_LIMIT_MAX = 500;

export function getCandleLimitForTimeframe(tf: string): number {
  switch (tf.trim().toLowerCase()) {
    case "15s":
      return 200;
    case "1m":
      return 180;
    case "5m":
      return 160;
    case "15m":
      return 140;
    case "1s":
      return 1000;
    default:
      return 150;
  }
}

export function clampCandleLimit(requested: number, fallback: number): number {
  if (!Number.isFinite(requested)) return fallback;
  return Math.min(CANDLE_LIMIT_MAX, Math.max(CANDLE_LIMIT_MIN, Math.floor(requested)));
}

/** Resolve limit from query string with TF default + clamp. */
export function resolveCandleLimit(interval: string, queryLimit?: unknown): number {
  const fallback = getCandleLimitForTimeframe(interval);
  const parsed = Number(queryLimit);
  return clampCandleLimit(parsed, fallback);
}

export function buildMarketCandlesUrl(
  symbol: string,
  interval: string,
  limit?: number,
): string {
  const lim = limit ?? getCandleLimitForTimeframe(interval);
  const params = new URLSearchParams({
    symbol,
    interval,
    limit: String(lim),
  });
  return `/api/market/candles?${params.toString()}`;
}
