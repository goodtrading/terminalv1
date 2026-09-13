/** Bookmap composite Phase 1 — separate spot vs perpetual depth/trade sources. */
export type BookmapMarketSource = "spot" | "perp";
export type CanonicalMarketType = "Spot" | "Perpetual";

export type CanonicalMarketIdentity = {
  instrument: string;
  venue: "Binance";
  marketType: CanonicalMarketType;
};

export function canonicalMarketIdentity(
  instrument: string,
  market: BookmapMarketSource,
): CanonicalMarketIdentity {
  const normalized = instrument.trim().toUpperCase();
  if (!normalized) throw new Error("Market instrument is required");
  return {
    instrument: normalized,
    venue: "Binance",
    marketType: market === "perp" ? "Perpetual" : "Spot",
  };
}

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
