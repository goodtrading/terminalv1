import type { TerminalExecutionContext } from "./executionContextTypes";
import { mapChartSymbolToExecutionSymbol } from "./symbolMapping";

export const DEFAULT_CHART_SYMBOL = "BTCUSDT";

export const DEFAULT_TERMINAL_EXECUTION_CONTEXT: TerminalExecutionContext = {
  chartExchange: "binance",
  chartMarketType: "spot",
  chartSymbol: DEFAULT_CHART_SYMBOL,

  signalSource: "chart",

  executionExchange: "bingx",
  executionMarketType: "perpetual",
  executionSymbol:
    mapChartSymbolToExecutionSymbol(DEFAULT_CHART_SYMBOL, "bingx", "perpetual") ??
    "BTC-USDT",

  liveTradingEnabled: false,
  mode: "read_only",
};
