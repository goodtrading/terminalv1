/**
 * AI-6.3 — In-memory registry for last reduced real selectors.
 * Bookmap / harness may push summaries here; publisher reads without React/canvas.
 * Never stores raw trades/book/heatmap.
 */
import type {
  RealFootprintSummary,
  RealLifecycleAudit,
  RealOrderFlowSummary,
} from "./realMarketTelemetrySource";

export type RealTelemetrySelectorSnapshot = {
  symbol: string;
  orderFlowSummary: RealOrderFlowSummary | null;
  footprintSummary: RealFootprintSummary | null;
  lifecycleAudit: RealLifecycleAudit | null;
  capturedAtMs: number;
  instrumentId?: string;
};

const bySymbol = new Map<string, RealTelemetrySelectorSnapshot>();

function normSymbol(symbol: string): string {
  return (symbol || "BTCUSDT").trim().toUpperCase().slice(0, 32) || "BTCUSDT";
}

/** Push reduced selectors (controlled harness or future Bookmap hook — not render path). */
export function pushRealTelemetrySelectors(
  snap: Omit<RealTelemetrySelectorSnapshot, "capturedAtMs"> & { capturedAtMs?: number },
): void {
  const symbol = normSymbol(snap.symbol);
  bySymbol.set(symbol, {
    symbol,
    orderFlowSummary: snap.orderFlowSummary,
    footprintSummary: snap.footprintSummary,
    lifecycleAudit: snap.lifecycleAudit,
    capturedAtMs: snap.capturedAtMs ?? Date.now(),
    instrumentId: snap.instrumentId,
  });
}

export function getRealTelemetrySelectorSnapshot(
  symbol: string,
): RealTelemetrySelectorSnapshot | null {
  return bySymbol.get(normSymbol(symbol)) ?? null;
}

export function clearRealTelemetrySelectorRegistry(): void {
  bySymbol.clear();
}

export function removeRealTelemetrySelectors(symbol: string): void {
  bySymbol.delete(normSymbol(symbol));
}

export function hasRealTelemetrySelectors(symbol: string): boolean {
  const s = getRealTelemetrySelectorSnapshot(symbol);
  if (!s) return false;
  return !!(s.orderFlowSummary || s.footprintSummary || s.lifecycleAudit);
}
