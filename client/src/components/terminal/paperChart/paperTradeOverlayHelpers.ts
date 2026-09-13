import { PAPER_COST_POLICY } from "@shared/trading/paperCostPolicy";
import { resolveChartFeeBps, type ChartFeeSettings } from "../chartRisk/riskLevelMetrics";
import type { PaperPositionSnapshot, PaperOrderSnapshot } from "../execution/executionTypes";
import type { PaperChartTradeOverlay } from "./paperTradeOverlayTypes";
import {
  normalizePaperQuantity,
  type PaperQuantitySource,
} from "./normalizePaperQuantity";

/** Map API position (may use size instead of quantity) to client snapshot. */
export function mapApiPaperPosition(
  raw: PaperPositionSnapshot | null | undefined,
): PaperPositionSnapshot | null {
  if (!raw || raw.side === "flat") return null;

  const { qtyBTC, notionalUSDT } = normalizePaperQuantity(
    raw as PaperQuantitySource,
    raw.entryPrice,
  );

  if (qtyBTC == null || qtyBTC <= 0) {
    return null;
  }

  const rawAny = raw as PaperPositionSnapshot & Record<string, unknown>;
  const unrealized =
    rawAny.unrealizedPnl ??
    rawAny.unrealizedPnL ??
    (rawAny as { uPnl?: number }).uPnl ??
    (rawAny as { pnl?: number }).pnl;

  return {
    ...raw,
    quantity: qtyBTC,
    ...(notionalUSDT != null ? { notionalUSDT } : {}),
    ...(Number.isFinite(Number(unrealized)) ? { unrealizedPnl: Number(unrealized) } : {}),
  } as PaperPositionSnapshot;
}

export function mapPaperChartOverlay(
  position: PaperPositionSnapshot | null | undefined,
  unrealizedPnlUsdt: number | undefined,
): PaperChartTradeOverlay | null {
  if (!position || position.side === "flat") {
    return null;
  }
  if (position.entryPrice == null || !Number.isFinite(position.entryPrice)) {
    return null;
  }

  const { qtyBTC, notionalUSDT } = normalizePaperQuantity(
    {
      qtyBTC: (position as { qtyBTC?: number }).qtyBTC,
      qty: (position as { qty?: number }).qty,
      quantity: position.quantity,
      size: (position as { size?: number }).size,
      notionalUSDT: (position as { notionalUSDT?: number }).notionalUSDT,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
    },
    position.entryPrice,
  );

  if (qtyBTC == null || qtyBTC <= 0) {
    return null;
  }

  return {
    symbol: position.symbol,
    side: position.side,
    quantity: qtyBTC,
    qtyBTC,
    qty: qtyBTC,
    notionalUSDT,
    entryPrice: position.entryPrice,
    stopLoss:
      position.stopLoss != null && Number.isFinite(position.stopLoss)
        ? position.stopLoss
        : null,
    takeProfit:
      position.takeProfit != null && Number.isFinite(position.takeProfit)
        ? position.takeProfit
        : null,
    markPrice:
      position.markPrice != null && Number.isFinite(position.markPrice)
        ? position.markPrice
        : null,
    unrealizedPnlUsdt: Number.isFinite(unrealizedPnlUsdt)
      ? unrealizedPnlUsdt
      : Number.isFinite(position.unrealizedPnl)
        ? position.unrealizedPnl
        : undefined,
    status: "open",
    tradeId: null,
  };
}

export function formatOverlayPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function snapOverlayPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

const RISK_OFFSET_RATIO = 0.003;

export function defaultPaperStopLoss(
  side: "long" | "short",
  entryPrice: number,
): number {
  const distance = entryPrice * RISK_OFFSET_RATIO;
  return snapOverlayPrice(side === "long" ? entryPrice - distance : entryPrice + distance);
}

export function defaultPaperTakeProfit(
  side: "long" | "short",
  entryPrice: number,
): number {
  const distance = entryPrice * RISK_OFFSET_RATIO;
  return snapOverlayPrice(side === "long" ? entryPrice + distance : entryPrice - distance);
}

export function formatPnlUsdt(pnl: number): string {
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}${pnl.toFixed(2)} USDT`;
}

const WORKING_ORDER_STATUSES = new Set([
  "open",
  "CREATED",
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_PENDING",
]);

export type CanonicalProtectiveType = "STOP_LOSS" | "TAKE_PROFIT";

export type PaperChartOrderKind = "LIMIT" | CanonicalProtectiveType;

export type PaperChartOrder = {
  id: string;
  clientOrderId: string;
  kind: PaperChartOrderKind;
  price: number;
  side: PaperOrderSnapshot["side"];
  quantity: number;
  draggable: boolean;
  cancelable: boolean;
  source: PaperOrderSnapshot;
};

export function validateProtectiveDrag(
  side: "long" | "short",
  protectionType: CanonicalProtectiveType,
  price: number,
  referencePrice: number,
): string | null {
  if (!Number.isFinite(price) || price <= 0) return "Price must be positive";
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) return "Reference price unavailable";
  const valid = side === "long"
    ? protectionType === "STOP_LOSS" ? price < referencePrice : price > referencePrice
    : protectionType === "STOP_LOSS" ? price > referencePrice : price < referencePrice;
  return valid ? null : protectionType === "STOP_LOSS" ? "SL must protect from this side" : "TP must be beyond the reference price";
}

export function isWorkingPaperOrder(order: {
  status: string;
  remainingQuantity?: string;
}): boolean {
  if (!WORKING_ORDER_STATUSES.has(order.status)) return false;
  if (order.status !== "PARTIALLY_FILLED" || order.remainingQuantity === undefined) return true;
  const remaining = Number(order.remainingQuantity);
  return Number.isFinite(remaining) && remaining > 0;
}

/** Canonical protective orders only; identity is never derived from price/type. */
export function getCanonicalProtectiveOrders(
  orders: PaperOrderSnapshot[],
): Record<CanonicalProtectiveType, PaperOrderSnapshot[]> {
  const result: Record<CanonicalProtectiveType, PaperOrderSnapshot[]> = {
    STOP_LOSS: [],
    TAKE_PROFIT: [],
  };
  for (const order of Array.from(new Map(orders.map(order => [order.id, order])).values())) {
    if (order.protectionType && isWorkingPaperOrder(order)) result[order.protectionType].push(order);
  }
  return result;
}

export function isWorkingPaperLimitOrder(order: {
  protectionType?: CanonicalProtectiveType;
  type: string;
  status: string;
  price: number | null | undefined;
  limitPrice?: number | null;
  orderType?: "MARKET" | "LIMIT" | "STOP_MARKET";
  remainingQuantity?: string;
}): boolean {
  const canonicalType = order.orderType ?? order.type.toUpperCase();
  const canonicalPrice = order.limitPrice ?? order.price;
  if (
    order.protectionType != null ||
    canonicalType !== "LIMIT" ||
    canonicalPrice == null ||
    !Number.isFinite(canonicalPrice) ||
    canonicalPrice <= 0 ||
    !WORKING_ORDER_STATUSES.has(order.status)
  ) {
    return false;
  }
  if (order.status === "PARTIALLY_FILLED" && order.remainingQuantity !== undefined) {
    const remaining = Number(order.remainingQuantity);
    return Number.isFinite(remaining) && remaining > 0;
  }
  return true;
}

/** Single projection model for every persistent working chart order. */
export function toWorkingPaperChartOrders(orders: PaperOrderSnapshot[]): PaperChartOrder[] {
  return orders.flatMap((order) => {
    if (!isWorkingPaperOrder(order)) return [];
    const kind: PaperChartOrderKind | null = order.protectionType ?? (order.type === "limit" ? "LIMIT" : null);
    const price = kind === "STOP_LOSS" ? order.triggerPrice : order.price ?? order.limitPrice;
    if (kind == null || price == null || !Number.isFinite(price) || price <= 0) return [];
    return [{
      id: order.id,
      clientOrderId: order.id,
      kind,
      price,
      side: order.side,
      quantity: order.size,
      draggable: kind !== "LIMIT" ? true : false,
      cancelable: true,
      source: order,
    }];
  });
}

export {
  DEFAULT_ACCOUNT_BASE_USDT as DEFAULT_PAPER_ACCOUNT_BASE_USDT,
  type ChartFeeSettings as PaperChartFeeSettings,
  type RiskLevelNetResult as PaperRiskLevelNetResult,
  resolveAccountEquityUsdt as resolvePaperAccountBaseUsdt,
  calculateRiskLevelNetPnl as calculatePaperRiskLevelNetPnl,
  formatSignedUsd,
  formatSignedPct,
  buildRiskLevelNetMetrics,
  createEmptyRiskLevelMetrics,
  EMPTY_RISK_LEVEL_NET_METRICS,
} from "../chartRisk/riskLevelMetrics";

export function formatQtyBtc(value: unknown): string {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) return "—";
  if (qty >= 1) return qty.toFixed(4);
  if (qty >= 0.01) return qty.toFixed(5);
  return qty.toFixed(6);
}

export type RiskPlacementTarget = "stopLoss" | "takeProfit";

/** Initial preview anchor when entering placement (not auto-saved). */
export function initialPlacementPreviewPrice(
  side: "long" | "short",
  entryPrice: number,
  target: RiskPlacementTarget,
): number {
  return target === "stopLoss"
    ? defaultPaperStopLoss(side, entryPrice)
    : defaultPaperTakeProfit(side, entryPrice);
}

export function validateChartPlacement(
  side: "long" | "short",
  entryPrice: number,
  target: RiskPlacementTarget,
  price: number,
): string | null {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (target === "stopLoss") {
    if (side === "long" && price >= entryPrice) {
      return "For a long, SL must be below entry.";
    }
    if (side === "short" && price <= entryPrice) {
      return "For a short, SL must be above entry.";
    }
  } else {
    if (side === "long" && price <= entryPrice) {
      return "For a long, TP must be above entry.";
    }
    if (side === "short" && price >= entryPrice) {
      return "For a short, TP must be below entry.";
    }
  }
  return null;
}

export {
  normalizePaperQuantity,
  type NormalizedPaperQuantity,
  type PaperQuantitySource,
} from "./normalizePaperQuantity";

export const DEFAULT_PAPER_CHART_FEE_DEFAULTS = PAPER_COST_POLICY;
export const resolvePaperChartFeeBps = (settings?: Partial<ChartFeeSettings> | null) => resolveChartFeeBps(settings, PAPER_COST_POLICY);
