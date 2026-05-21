import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "@shared/execution/defaultExecutionContext";
import type { ExecutionVenueFields } from "@shared/execution/executionContextTypes";
import {
  assertExecutionVenueAllowed,
  assertNotChartVenue,
  resolveExecutionSymbolFromChart,
} from "@shared/execution/executionGuards";

export type ResolvedPaperVenue = ExecutionVenueFields & {
  executionExchange: "bingx";
};

export type PaperVenueResolveResult =
  | { ok: true; venue: ResolvedPaperVenue }
  | { ok: false; code: string; message: string };

/**
 * Resolve paper execution venue from chart symbol — never treat chart exchange as execution.
 */
export function resolvePaperExecutionVenue(body: {
  symbol?: string;
  chartSymbol?: string;
  venue?: string;
  marketType?: string;
  executionExchange?: string;
}): PaperVenueResolveResult {
  const ctx = DEFAULT_TERMINAL_EXECUTION_CONTEXT;

  const chartGuard = assertNotChartVenue(
    body.executionExchange ?? body.venue,
    body.marketType,
  );
  if (!chartGuard.ok) {
    return { ok: false, code: chartGuard.code, message: chartGuard.message };
  }

  const venueGuard = assertExecutionVenueAllowed(
    ctx.executionExchange,
    ctx.executionMarketType,
  );
  if (!venueGuard.ok) {
    return { ok: false, code: venueGuard.code, message: venueGuard.message };
  }

  const rawChart =
    typeof body.chartSymbol === "string" && body.chartSymbol.trim()
      ? body.chartSymbol.trim()
      : typeof body.symbol === "string" && body.symbol.trim() && !body.symbol.includes("-")
        ? body.symbol.trim()
        : ctx.chartSymbol;

  const mapped = resolveExecutionSymbolFromChart(rawChart, ctx);
  if (!mapped.ok || !mapped.symbol) {
    return { ok: false, code: mapped.code, message: mapped.message };
  }

  return {
    ok: true,
    venue: {
      venue: "bingx",
      marketType: "perpetual",
      executionExchange: "bingx",
      symbol: mapped.symbol,
      chartSymbol: rawChart.toUpperCase().replace(/-/g, ""),
    },
  };
}
