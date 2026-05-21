import type { ExecutionExchangeId, ExecutionMarketType } from "./executionContextTypes";

/** Binance Spot (concat) → BingX Perpetual internal symbol. */
export const CHART_TO_BINGX_PERPETUAL: Record<string, string> = {
  BTCUSDT: "BTC-USDT",
  ETHUSDT: "ETH-USDT",
};

function normalizeChartSymbol(chartSymbol: string): string {
  return chartSymbol.trim().toUpperCase().replace(/-/g, "");
}

/**
 * Map a chart symbol to the execution venue symbol.
 * Chart source must not be used for routing — only this mapped symbol goes to execution.
 */
export function mapChartSymbolToExecutionSymbol(
  chartSymbol: string,
  executionExchange: ExecutionExchangeId,
  executionMarketType: ExecutionMarketType,
): string | null {
  const key = normalizeChartSymbol(chartSymbol);
  if (!key) return null;

  if (executionExchange !== "bingx" || executionMarketType !== "perpetual") {
    return null;
  }

  return CHART_TO_BINGX_PERPETUAL[key] ?? null;
}

export function formatChartSymbolDisplay(chartSymbol: string): string {
  return normalizeChartSymbol(chartSymbol);
}

export function formatExecutionSymbolDisplay(symbol: string): string {
  return symbol.trim();
}
