/**
 * AI-6.4 — React owner for Runtime Bridge (NOT canvas / NOT frame loop).
 * Mount next to useBookmapTrades producer; effect-only registration.
 */
import { useEffect, useRef } from "react";
import type { BookmapTradeSessionSummary } from "@/components/flows/bookmapTradeTypes";
import { realMarketTelemetryRuntimeBridge } from "./runtimeBridge";
import type { RealLifecycleAudit } from "./realMarketTelemetrySource";

export type UseBookmapTelemetryRuntimeBridgeOptions = {
  symbol: string;
  summary: BookmapTradeSessionSummary | null | undefined;
  /** When false, clears registry for symbol */
  enabled?: boolean;
  lifecycleAudit?: RealLifecycleAudit | null;
};

/**
 * Stable React owner: watches reduced summary and registers via Runtime Bridge.
 * Cleanup on symbol change / disable / unmount.
 */
export function useBookmapTelemetryRuntimeBridge(
  opts: UseBookmapTelemetryRuntimeBridgeOptions,
): void {
  const { symbol, summary, enabled = true, lifecycleAudit = null } = opts;
  const prevSymbol = useRef(symbol);

  useEffect(() => {
    if (prevSymbol.current !== symbol) {
      realMarketTelemetryRuntimeBridge.clear(prevSymbol.current);
      prevSymbol.current = symbol;
    }
    if (!enabled) {
      realMarketTelemetryRuntimeBridge.clear(symbol);
      return;
    }
    realMarketTelemetryRuntimeBridge.notifyBookmapTradeSummary({
      symbol,
      summary,
      lifecycleAudit,
    });
  }, [symbol, summary, enabled, lifecycleAudit]);

  useEffect(() => {
    return () => {
      realMarketTelemetryRuntimeBridge.clear(symbol);
    };
  }, [symbol]);
}
