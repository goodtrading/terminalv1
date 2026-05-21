export type {
  ChartExchangeId,
  ChartMarketType,
  ExecutionExchangeId,
  ExecutionMarketType,
  ExecutionMode,
  NormalizedExecutionOrder,
  NormalizedOrderSide,
  NormalizedOrderType,
  SignalSource,
  TerminalExecutionContext,
} from "@shared/execution/executionContextTypes";

export {
  DEFAULT_CHART_SYMBOL,
  DEFAULT_TERMINAL_EXECUTION_CONTEXT,
} from "@shared/execution/defaultExecutionContext";

export { getPaperTerminalExecutionContext } from "@shared/execution/paperExecutionContext";

export {
  CHART_TO_BINGX_PERPETUAL,
  formatChartSymbolDisplay,
  formatExecutionSymbolDisplay,
  mapChartSymbolToExecutionSymbol,
} from "@shared/execution/symbolMapping";

export {
  EXECUTION_MAPPING_MISSING_MESSAGE,
  assertExecutionVenueAllowed,
  assertLiveTradingAllowed,
  assertNotChartVenue,
  resolveExecutionSymbolFromChart,
} from "@shared/execution/executionGuards";

import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "@shared/execution/defaultExecutionContext";
import { resolveExecutionSymbolFromChart } from "@shared/execution/executionGuards";

/** Resolve execution symbol for orders from the active chart symbol. */
export function resolveExecutionSymbolForChart(chartSymbol: string): string | null {
  const result = resolveExecutionSymbolFromChart(
    chartSymbol,
    DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  );
  return result.ok ? (result.symbol ?? null) : null;
}
