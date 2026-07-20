import type { MarketSourceId, SymbolProvenance } from "@shared/goodTradingAiMarket";

/**
 * Normalize symbol with provenance (no silent remap without recording).
 */
export function normalizeSymbolWithProvenance(
  requested: string,
  sourceId: MarketSourceId = "ticker_price",
): SymbolProvenance {
  const raw = (requested || "BTCUSDT").trim();
  let normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) normalized = "BTCUSDT";
  if (normalized.length > 32) normalized = normalized.slice(0, 32);

  let base: string | undefined;
  let quote: string | undefined;
  if (normalized.endsWith("USDT")) {
    base = normalized.slice(0, -4) || undefined;
    quote = "USDT";
  } else if (normalized.endsWith("USD")) {
    base = normalized.slice(0, -3) || undefined;
    quote = "USD";
  }

  return {
    requested: raw.slice(0, 32),
    normalized,
    base,
    quote,
    sourceId,
  };
}
