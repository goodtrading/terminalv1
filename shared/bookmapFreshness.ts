/** Orderbook / BBO freshness thresholds (ms). */
export const BOOKMAP_OB_STALE_MS = 3_000;
export const BOOKMAP_OB_DEAD_MS = 10_000;

export function isOrderbookStale(ageMs: number | null | undefined): boolean {
  if (ageMs == null || !Number.isFinite(ageMs)) return true;
  return ageMs > BOOKMAP_OB_STALE_MS;
}

export function isOrderbookDead(ageMs: number | null | undefined): boolean {
  if (ageMs == null || !Number.isFinite(ageMs)) return true;
  return ageMs > BOOKMAP_OB_DEAD_MS;
}

export function orderbookFreshnessLabel(ageMs: number | null | undefined): "live" | "stale" | "dead" {
  if (isOrderbookDead(ageMs)) return "dead";
  if (isOrderbookStale(ageMs)) return "stale";
  return "live";
}
