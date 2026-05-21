import type { TerminalExecutionContext } from "./executionContextTypes";
import { mapChartSymbolToExecutionSymbol } from "./symbolMapping";

export const EXECUTION_MAPPING_MISSING_MESSAGE =
  "No execution mapping found for this chart symbol.";

export type ExecutionGuardBlock = {
  ok: false;
  code: string;
  message: string;
};

export type ExecutionGuardPass = { ok: true };

export type ExecutionGuardResult = ExecutionGuardBlock | ExecutionGuardPass;

function block(code: string, message: string): ExecutionGuardBlock {
  return { ok: false, code, message };
}

/** Venue must be BingX perpetual — chart exchange is never valid here. */
export function assertExecutionVenueAllowed(
  executionExchange: string,
  executionMarketType: string,
): ExecutionGuardResult {
  if (executionMarketType !== "perpetual") {
    return block(
      "EXECUTION_MARKET_NOT_PERPETUAL",
      "Only BingX perpetual futures execution is supported.",
    );
  }
  if (executionExchange !== "bingx") {
    return block(
      "EXECUTION_EXCHANGE_NOT_BINGX",
      "Only BingX is configured as the execution venue.",
    );
  }
  return { ok: true };
}

/** Reject mistaken use of chart venue fields on an order path. */
export function assertNotChartVenue(
  exchange: string | undefined,
  marketType: string | undefined,
): ExecutionGuardResult {
  if (exchange === "binance" || marketType === "spot") {
    return block(
      "CHART_VENUE_NOT_EXECUTABLE",
      "Chart source (Binance Spot) cannot be used for order execution. Use the configured execution adapter.",
    );
  }
  return { ok: true };
}

export function assertLiveTradingAllowed(
  context: Pick<TerminalExecutionContext, "liveTradingEnabled">,
  serverLiveFlag: boolean,
): ExecutionGuardResult {
  if (!context.liveTradingEnabled || !serverLiveFlag) {
    return block(
      "LIVE_TRADING_DISABLED",
      "Live trading is disabled. Broker execution is not enabled yet.",
    );
  }
  return { ok: true };
}

export function resolveExecutionSymbolFromChart(
  chartSymbol: string,
  context: Pick<
    TerminalExecutionContext,
    "executionExchange" | "executionMarketType"
  >,
): ExecutionGuardResult & { symbol?: string } {
  const mapped = mapChartSymbolToExecutionSymbol(
    chartSymbol,
    context.executionExchange,
    context.executionMarketType,
  );
  if (!mapped) {
    return block("EXECUTION_SYMBOL_UNMAPPED", EXECUTION_MAPPING_MISSING_MESSAGE);
  }
  return { ok: true, symbol: mapped };
}
