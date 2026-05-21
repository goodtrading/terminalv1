import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "@shared/execution/defaultExecutionContext";
import type {
  NormalizedExecutionOrder,
  NormalizedOrderSide,
  TerminalExecutionContext,
} from "@shared/execution/executionContextTypes";
import {
  assertExecutionVenueAllowed,
  assertNotChartVenue,
  resolveExecutionSymbolFromChart,
} from "@shared/execution/executionGuards";
import type { OrderIntent } from "./executionTypes";
import { bingxExecutionAdapter } from "./bingxExecutionAdapter";

export function getTerminalExecutionContext(): TerminalExecutionContext {
  return { ...DEFAULT_TERMINAL_EXECUTION_CONTEXT };
}

function mapTicketSideToNormalized(side: OrderIntent["side"]): NormalizedOrderSide {
  return side === "long" ? "buy" : "sell";
}

/**
 * Build a normalized BingX perpetual order from an intent.
 * Never reads chartExchange/chartMarketType — only execution fields + mapping.
 */
export function buildNormalizedOrderFromIntent(
  intent: OrderIntent,
  options?: { chartSymbol?: string },
):
  | { ok: true; order: NormalizedExecutionOrder }
  | { ok: false; code: string; message: string } {
  const ctx = getTerminalExecutionContext();

  const chartGuard = assertNotChartVenue(intent.exchange, undefined);
  if (!chartGuard.ok) {
    return { ok: false, code: chartGuard.code, message: chartGuard.message };
  }

  if (intent.exchange !== "bingx") {
    return {
      ok: false,
      code: "EXECUTION_EXCHANGE_NOT_BINGX",
      message: "Only BingX is configured as the execution venue.",
    };
  }

  const venueGuard = assertExecutionVenueAllowed(ctx.executionExchange, ctx.executionMarketType);
  if (!venueGuard.ok) {
    return { ok: false, code: venueGuard.code, message: venueGuard.message };
  }

  const chartSymbol = options?.chartSymbol ?? ctx.chartSymbol;
  const mappedResult = resolveExecutionSymbolFromChart(chartSymbol, ctx);
  if (!mappedResult.ok) {
    return {
      ok: false,
      code: mappedResult.code,
      message: mappedResult.message,
    };
  }
  const executionSymbol = mappedResult.symbol!;

  const qty = Number(intent.size);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, code: "INVALID_QTY", message: "Order size must be a positive number." };
  }

  const leverage = Number(intent.leverage);
  const price = intent.price ? Number(intent.price) : undefined;

  return {
    ok: true,
    order: {
      exchange: "bingx",
      marketType: "perpetual",
      symbol: executionSymbol,
      side: mapTicketSideToNormalized(intent.side),
      orderType: intent.type,
      qty,
      reduceOnly: intent.reduceOnly,
      leverage: Number.isFinite(leverage) ? leverage : undefined,
      marginMode: intent.marginMode,
      price: price != null && Number.isFinite(price) ? price : undefined,
      chartSymbol,
    },
  };
}

export async function routeIntentToExecutionAdapter(intent: OrderIntent) {
  const built = buildNormalizedOrderFromIntent(intent);
  if (!built.ok) {
    return { success: false as const, code: built.code, message: built.message };
  }
  return bingxExecutionAdapter.submitOrder(built.order);
}
