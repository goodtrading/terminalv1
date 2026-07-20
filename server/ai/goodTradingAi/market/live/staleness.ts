import type { MarketSourceId, SnapshotStaleness } from "@shared/goodTradingAiMarket";

/** Staleness thresholds (ms) per source — visible in snapshot metadata. */
export const STALENESS_THRESHOLDS_MS: Record<MarketSourceId, number> = {
  storage_gamma: 120_000,
  storage_oi_options: 120_000,
  storage_order_flow: 60_000,
  storage_liquidity_compact: 60_000,
  ticker_price: 15_000,
  orderbook_health: 10_000,
  footprint_bridge_needed: 1,
  structure_unavailable: 1,
  client_telemetry_order_flow: 15_000,
  client_telemetry_footprint: 15_000,
  client_telemetry_lifecycle: 15_000,
  simulate: 1,
  stub: 1,
};

export function ageMs(capturedAtMs: number | undefined, nowMs = Date.now()): number {
  if (capturedAtMs == null || !Number.isFinite(capturedAtMs)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, nowMs - capturedAtMs);
}

export function buildStaleness(
  sourceId: MarketSourceId,
  capturedAtMs: number | undefined,
  nowMs = Date.now(),
): SnapshotStaleness {
  const thresholdMs = STALENESS_THRESHOLDS_MS[sourceId] ?? 60_000;
  const a = ageMs(capturedAtMs, nowMs);
  const capped = a > 7 * 24 * 3600_000 ? 7 * 24 * 3600_000 : a;
  return {
    sourceId,
    ageMs: capped === Number.MAX_SAFE_INTEGER ? thresholdMs * 10 : capped,
    stale: a > thresholdMs,
    thresholdMs,
  };
}
