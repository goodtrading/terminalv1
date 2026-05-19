/** Bookmap composite Phase 1 — separate spot vs perpetual depth/trade sources. */
export type BookmapMarketSource = "spot" | "perp";

/**
 * Default matches the legacy Binance feed (spot depth + spot aggTrades).
 * Existing clients omitting `market` continue to receive spot data.
 */
export const DEFAULT_BOOKMAP_MARKET: BookmapMarketSource = "spot";

export function parseBookmapMarket(
  value: unknown,
  fallback: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): BookmapMarketSource {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  if (s === "perp" || s === "futures" || s === "future") return "perp";
  if (s === "spot") return "spot";
  return fallback;
}
