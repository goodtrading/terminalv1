import { getPaperTerminalExecutionContext } from "@shared/execution/paperExecutionContext";
import {
  assertExecutionVenueAllowed,
  assertNotChartVenue,
  assertPaperExecutionMode,
  PAPER_MODE_LIVE_LOCKED_MESSAGE,
  resolveExecutionSymbolFromChart,
} from "@shared/execution/executionGuards";
import type {
  ExecutionMarketType,
  NormalizedExecutionOrder,
  NormalizedOrderSide,
  NormalizedOrderType,
} from "@shared/execution/executionContextTypes";
import { DEFAULT_CHART_SYMBOL } from "@shared/execution/defaultExecutionContext";
import { isLiveTradingEnabled } from "./execution/riskGuard";
import {
  cancelAllPaperOrders,
  cancelPaperOrder,
  closePaperPosition,
  getPaperAccount,
  getPaperOrders,
  getPaperPosition,
  getPaperTradeLedger,
  previewPaperOrder,
  submitPaperOrder,
} from "./paperTrading/paperExecutionEngine";
import { runWithPaperUserAsync } from "./paperTrading/paperUserContext";
import {
  enrichPaperPnlFields,
  enrichPaperQuantityFields,
} from "./paperTrading/paperNormalize";
import type { PaperOrderIntent } from "./paperTrading/paperTypes";

export type PaperAdapterOrderStatus = "pending" | "filled" | "cancelled" | "rejected";

export interface PaperNormalizedOrder {
  exchange: "bingx";
  marketType: ExecutionMarketType;
  symbol: string;
  side: NormalizedOrderSide;
  orderType: NormalizedOrderType;
  qty: number;
  qtyBTC?: number;
  notionalUSDT?: number;
  price?: number;
  entryPrice?: number;
  sizeUnit?: "USDT" | "BTC";
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
  leverage?: number;
  marginMode?: "isolated" | "cross";
  chartSymbol?: string;
}

export type PaperAdapterResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; message: string };

function mapSide(side: NormalizedOrderSide): "long" | "short" {
  return side === "buy" ? "long" : "short";
}

function mapInternalStatus(status: string): PaperAdapterOrderStatus {
  if (status === "open") return "pending";
  if (status === "filled") return "filled";
  if (status === "cancelled") return "cancelled";
  if (status === "rejected") return "rejected";
  return "pending";
}

function validatePaperGuards(order: PaperNormalizedOrder): PaperAdapterResult<true> {
  const ctx = getPaperTerminalExecutionContext();

  const paperMode = assertPaperExecutionMode(ctx.mode);
  if (!paperMode.ok) {
    return { success: false, code: paperMode.code, message: paperMode.message };
  }

  if (ctx.mode === "live" || isLiveTradingEnabled()) {
    return {
      success: false,
      code: "LIVE_TRADING_DISABLED",
      message: PAPER_MODE_LIVE_LOCKED_MESSAGE,
    };
  }

  const chartVenue = assertNotChartVenue(order.exchange, order.marketType);
  if (!chartVenue.ok) {
    return { success: false, code: chartVenue.code, message: chartVenue.message };
  }

  const venue = assertExecutionVenueAllowed(order.exchange, order.marketType);
  if (!venue.ok) {
    return { success: false, code: venue.code, message: venue.message };
  }

  const chartSymbol = order.chartSymbol ?? ctx.chartSymbol ?? DEFAULT_CHART_SYMBOL;
  const mapped = resolveExecutionSymbolFromChart(chartSymbol, ctx);
  if (!mapped.ok || !mapped.symbol) {
    return {
      success: false,
      code: mapped.code ?? "EXECUTION_SYMBOL_UNMAPPED",
      message: mapped.message,
    };
  }

  if (order.symbol && order.symbol !== mapped.symbol) {
    return {
      success: false,
      code: "EXECUTION_SYMBOL_MISMATCH",
      message: "Order symbol does not match BingX perpetual execution mapping.",
    };
  }

  if (!Number.isFinite(order.qty) || order.qty <= 0) {
    return {
      success: false,
      code: "INVALID_QTY",
      message: "Quantity must be greater than zero.",
    };
  }

  if (order.orderType === "limit" && (order.price == null || order.price <= 0)) {
    return {
      success: false,
      code: "INVALID_LIMIT_PRICE",
      message: "Limit orders require a positive price.",
    };
  }

  return { success: true, data: true };
}

function toPaperIntent(order: PaperNormalizedOrder): PaperOrderIntent {
  const ctx = getPaperTerminalExecutionContext();
  const chartSymbol = order.chartSymbol ?? ctx.chartSymbol;
  const symbol =
    resolveExecutionSymbolFromChart(chartSymbol, ctx).symbol ?? order.symbol;

  const useUsdt =
    order.sizeUnit === "USDT" ||
    (order.notionalUSDT != null && Number.isFinite(order.notionalUSDT) && order.notionalUSDT > 0);

  return {
    symbol,
    chartSymbol: chartSymbol.toUpperCase().replace(/-/g, ""),
    venue: "bingx",
    marketType: "perpetual",
    executionExchange: "bingx",
    side: mapSide(order.side),
    type: order.orderType,
    price: order.orderType === "limit" && order.price != null ? String(order.price) : undefined,
    size: useUsdt
      ? String(order.notionalUSDT ?? order.qty)
      : String(order.qtyBTC ?? order.qty),
    sizeUnit: useUsdt ? "USDT" : "BTC",
    leverage: String(order.leverage ?? 5),
    marginMode: order.marginMode ?? "isolated",
    reduceOnly: Boolean(order.reduceOnly),
    postOnly: false,
    stopLoss: order.stopLoss != null ? String(order.stopLoss) : undefined,
    takeProfit: order.takeProfit != null ? String(order.takeProfit) : undefined,
  };
}

export class PaperExecutionAdapter {
  readonly exchange = "bingx" as const;
  readonly marketType = "perpetual" as const;
  readonly mode = "paper" as const;

  async getAccount(userId: number) {
    return runWithPaperUserAsync(userId, async () => {
      const account = getPaperAccount();
      const position = getPaperPosition();
      const orders = getPaperOrders();
      const trades = getPaperTradeLedger();
      const ctx = getPaperTerminalExecutionContext();
      return {
        mode: "paper" as const,
        liveTradingEnabled: false,
        venue: {
          exchange: ctx.executionExchange,
          marketType: ctx.executionMarketType,
          symbol: ctx.executionSymbol,
          chartSymbol: ctx.chartSymbol,
        },
        balanceUsdt: account.balanceUsdt,
        availableMarginUsdt: account.availableMarginUsdt,
        unrealizedPnlUsdt: account.unrealizedPnlUsdt,
        realizedPnlUsdt: account.realizedPnlUsdt,
        equityUsdt: account.equityUsdt,
        paperEquity: account.equityUsdt,
        paperAvailableMargin: account.availableMarginUsdt,
        paperUnrealizedPnL: account.unrealizedPnlUsdt,
        paperRealizedPnL: account.realizedPnlUsdt,
        estimatedFees: 0,
        fundingPnL: 0,
        openPaperPosition: position,
        pendingPaperOrders: orders.map((o) => ({
          ...o,
          status: mapInternalStatus(o.status),
          exchange: "bingx" as const,
          marketType: "perpetual" as const,
          mode: "paper" as const,
        })),
        closedTrades: trades.filter((t) => t.status === "closed"),
        updatedAt: account.updatedAt,
      };
    });
  }

  async getOrders(userId: number) {
    return runWithPaperUserAsync(userId, () => {
      const ctx = getPaperTerminalExecutionContext();
      return getPaperOrders().map((o) => {
        const entry = o.price ?? null;
        const qtyFields = enrichPaperQuantityFields({
          qtyBtc: o.size,
          entryPrice: entry,
          leverage: o.leverage,
        });
        return {
        id: o.id,
        userId,
        exchange: "bingx" as const,
        marketType: "perpetual" as const,
        symbol: o.symbol,
        side: o.side === "long" ? ("buy" as const) : ("sell" as const),
        orderType: o.type,
        ...qtyFields,
        price: o.price,
        status: mapInternalStatus(o.status),
        mode: "paper" as const,
        timestamp: o.createdAt,
        chartSymbol: ctx.chartSymbol,
      };
      });
    });
  }

  async getPositions(userId: number) {
    return runWithPaperUserAsync(userId, () => {
      const pos = getPaperPosition();
      if (!pos || pos.side === "flat") return [];
      const qtyFields = enrichPaperQuantityFields({
        qtyBtc: pos.quantity,
        entryPrice: pos.entryPrice,
        leverage: pos.leverage,
      });
      const pnlFields = enrichPaperPnlFields({
        unrealizedPnl: pos.unrealizedPnl,
        realizedPnl: 0,
      });
      return [
        {
          userId,
          symbol: pos.symbol,
          side: pos.side,
          ...qtyFields,
          ...pnlFields,
          entryPrice: pos.entryPrice,
          markPrice: pos.markPrice,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          leverage: pos.leverage,
          marginMode: pos.marginMode,
          exchange: "bingx" as const,
          marketType: "perpetual" as const,
          mode: "paper" as const,
        },
      ];
    });
  }

  async submitOrder(
    userId: number,
    order: PaperNormalizedOrder,
  ): Promise<
    PaperAdapterResult<{
      order?: unknown;
      account?: unknown;
      position?: unknown;
      message?: string;
    }>
  > {
    const guard = validatePaperGuards(order);
    if (!guard.success) return guard;

    return runWithPaperUserAsync(userId, async () => {
      const intent = toPaperIntent(order);
      const result = await submitPaperOrder(intent);
      if (!result.success) {
        return {
          success: false,
          code: result.code ?? "PAPER_ORDER_REJECTED",
          message: result.error ?? result.message ?? "Paper order rejected",
        };
      }
      return {
        success: true,
        data: {
          order: result.order
            ? {
                ...result.order,
                status: mapInternalStatus(result.order.status),
                mode: "paper",
                exchange: "bingx",
                marketType: "perpetual",
              }
            : undefined,
          account: result.account,
          position: result.position,
          message: result.message,
        },
      };
    });
  }

  async previewOrder(userId: number, order: PaperNormalizedOrder) {
    const guard = validatePaperGuards(order);
    if (!guard.success) return guard;

    return runWithPaperUserAsync(userId, async () => {
      const intent = toPaperIntent(order);
      const preview = await previewPaperOrder(intent);
      if ("error" in preview) {
        return {
          success: false as const,
          code: preview.code ?? "PAPER_PREVIEW_FAILED",
          message: preview.error,
        };
      }
      return { success: true as const, data: preview };
    });
  }

  async cancelOrder(userId: number, orderId: string): Promise<PaperAdapterResult<{ message: string }>> {
    return runWithPaperUserAsync(userId, () => {
      const ok = cancelPaperOrder(orderId);
      if (!ok) {
        return {
          success: false,
          code: "ORDER_NOT_FOUND",
          message: "Paper order not found or not cancellable.",
        };
      }
      return { success: true, data: { message: "Paper order cancelled" } };
    });
  }

  async cancelAllOrders(userId: number) {
    return runWithPaperUserAsync(userId, () => {
      const n = cancelAllPaperOrders();
      return { success: true as const, data: { cancelled: n } };
    });
  }

  async closePosition(userId: number) {
    const ctx = getPaperTerminalExecutionContext();
    const paperMode = assertPaperExecutionMode(ctx.mode);
    if (!paperMode.ok) {
      return { success: false as const, code: paperMode.code, message: paperMode.message };
    }

    return runWithPaperUserAsync(userId, async () => {
      const result = await closePaperPosition();
      if (!result.success) {
        return {
          success: false as const,
          code: result.code ?? "CLOSE_FAILED",
          message: result.message ?? "Could not close paper position",
        };
      }
      return { success: true as const, data: result };
    });
  }
}

export const paperExecutionAdapter = new PaperExecutionAdapter();

/** Map generic API body to normalized paper order. */
export function normalizePaperOrderBody(
  body: Record<string, unknown>,
): PaperNormalizedOrder | { error: string; code: string } {
  const ctx = getPaperTerminalExecutionContext();
  const sideRaw = String(body.side ?? "").toLowerCase();
  let side: NormalizedOrderSide | null = null;
  if (sideRaw === "buy" || sideRaw === "long") side = "buy";
  if (sideRaw === "sell" || sideRaw === "short") side = "sell";

  const typeRaw = String(body.orderType ?? body.type ?? "").toLowerCase();
  const orderType: NormalizedOrderType | null =
    typeRaw === "market" || typeRaw === "limit" ? typeRaw : null;

  const chartSymbol =
    typeof body.chartSymbol === "string" ? body.chartSymbol : ctx.chartSymbol;

  const mapped = resolveExecutionSymbolFromChart(chartSymbol, ctx);
  if (!mapped.ok || !mapped.symbol) {
    return {
      error: mapped.message,
      code: mapped.code ?? "EXECUTION_SYMBOL_UNMAPPED",
    };
  }

  if (!side || !orderType) {
    return { error: "Invalid side or order type", code: "INVALID_PAPER_ORDER" };
  }

  const entryPrice = Number(
    body.entryPrice ?? (orderType === "limit" ? body.price : body.entryPrice),
  );
  const limitPrice =
    orderType === "limit" && body.price != null ? Number(body.price) : undefined;
  const entryHint =
    orderType === "limit" && Number.isFinite(limitPrice) && limitPrice! > 0
      ? limitPrice!
      : Number.isFinite(entryPrice) && entryPrice > 0
        ? entryPrice
        : undefined;

  let notionalUSDT = Number(body.notionalUSDT ?? body.notionalUsdt);
  let qtyBTC = Number(body.qtyBTC ?? body.qty ?? body.size ?? body.quantity);

  if (Number.isFinite(notionalUSDT) && notionalUSDT > 0 && entryHint != null && entryHint > 0) {
    qtyBTC = notionalUSDT / entryHint;
  } else if (Number.isFinite(qtyBTC) && qtyBTC > 0 && entryHint != null && entryHint > 0) {
    if (!Number.isFinite(notionalUSDT) || notionalUSDT <= 0) {
      notionalUSDT = qtyBTC * entryHint;
    }
  }

  if (!Number.isFinite(qtyBTC) || qtyBTC <= 0) {
    return { error: "Invalid quantity (BTC)", code: "INVALID_QTY" };
  }

  const sizeUnit: "USDT" | "BTC" =
    Number.isFinite(notionalUSDT) &&
    notionalUSDT > 0 &&
    (body.notionalUSDT != null || body.notionalUsdt != null)
      ? "USDT"
      : "BTC";

  return {
    exchange: "bingx",
    marketType: "perpetual",
    symbol: mapped.symbol,
    side,
    orderType,
    qty: qtyBTC,
    qtyBTC,
    notionalUSDT:
      Number.isFinite(notionalUSDT) && notionalUSDT > 0 ? notionalUSDT : undefined,
    entryPrice: entryHint,
    sizeUnit,
    price: orderType === "limit" ? limitPrice : undefined,
    stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
    takeProfit: body.takeProfit != null ? Number(body.takeProfit) : undefined,
    reduceOnly: Boolean(body.reduceOnly),
    leverage: body.leverage != null ? Number(body.leverage) : undefined,
    marginMode:
      body.marginMode === "cross"
        ? "cross"
        : body.marginMode === "isolated"
          ? "isolated"
          : undefined,
    chartSymbol,
  };
}
