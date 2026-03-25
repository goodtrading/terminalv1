/**
 * Chart timeframe definitions — extend here for new TFs (e.g. 1h).
 * `apiInterval` is passed to GET /api/market/candles (server / Binance mapping).
 */

export type ChartTimeframeId = "15s" | "1m" | "5m" | "15m";

export type ChartTimeframeMeta = {
  id: ChartTimeframeId;
  label: string;
  /** Bar duration in seconds (for drawings projection & ticker bucket). */
  barSec: number;
  /** Query param for /api/market/candles */
  apiInterval: string;
};

export const CHART_TIMEFRAMES: ChartTimeframeMeta[] = [
  { id: "15s", label: "15s", barSec: 15, apiInterval: "15s" },
  { id: "1m", label: "1m", barSec: 60, apiInterval: "1m" },
  { id: "5m", label: "5m", barSec: 300, apiInterval: "5m" },
  { id: "15m", label: "15m", barSec: 900, apiInterval: "15m" },
];

const BY_ID = Object.fromEntries(CHART_TIMEFRAMES.map((t) => [t.id, t])) as Record<
  ChartTimeframeId,
  ChartTimeframeMeta
>;

export const DEFAULT_CHART_TIMEFRAME: ChartTimeframeId = "1m";

export function getChartTimeframeMeta(id: ChartTimeframeId): ChartTimeframeMeta {
  return BY_ID[id] ?? BY_ID[DEFAULT_CHART_TIMEFRAME];
}

export function isChartTimeframeId(v: string): v is ChartTimeframeId {
  return v === "15s" || v === "1m" || v === "5m" || v === "15m";
}
