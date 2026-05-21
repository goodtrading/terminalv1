import type {
  BingXNormalizedOrder,
  BingXNormalizedPosition,
} from "../execution/executionTypes";
import { formatOverlayPrice } from "../paperChart/paperTradeOverlayHelpers";

export const BINGX_REAL_LONG = "rgba(56, 189, 248, 0.65)";
export const BINGX_REAL_SHORT = "rgba(251, 146, 60, 0.65)";
export const BINGX_LIQ_LINE = "rgba(220, 38, 38, 0.38)";
export const BINGX_ORDER_BUY = "rgba(34, 211, 238, 0.55)";
export const BINGX_ORDER_SELL = "rgba(249, 115, 22, 0.55)";

const PRICE_SCALE_INSET = 108;
export { PRICE_SCALE_INSET };

export function formatBingXQty(qty: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return "—";
  if (qty >= 1) return qty.toFixed(4);
  if (qty >= 0.01) return qty.toFixed(5);
  return qty.toFixed(6);
}

export function formatBingXPnl(usdt: number | undefined): string {
  if (usdt == null || !Number.isFinite(usdt)) return "—";
  const sign = usdt > 0 ? "+" : "";
  return `${sign}${usdt.toFixed(2)}$`;
}

export function formatMarginMode(mode?: string): string {
  if (!mode || mode === "unknown") return "";
  return mode.toUpperCase();
}

export function buildPositionBadgeLabel(pos: BingXNormalizedPosition): string {
  const side = pos.side === "short" ? "SHORT" : "LONG";
  const qty = formatBingXQty(pos.quantity);
  const entry =
    pos.entryPrice != null && pos.entryPrice > 0
      ? formatOverlayPrice(pos.entryPrice)
      : "—";
  const pnl = formatBingXPnl(pos.unrealizedPnlUsdt);
  const lev =
    pos.leverage != null && pos.leverage > 0 ? `${pos.leverage}x` : null;
  const margin = formatMarginMode(pos.marginMode);
  const levMargin = [lev, margin].filter(Boolean).join(" ");

  const parts = [
    "REAL BINGX",
    side,
    `${qty} BTC`,
    `ENTRY ${entry}`,
    pnl,
    levMargin,
    "READ ONLY",
  ].filter((p) => p && p !== "—");
  return parts.join(" · ");
}

export function buildOrderBadgeLabel(order: BingXNormalizedOrder): string {
  const side = order.side === "sell" ? "SELL" : order.side === "buy" ? "BUY" : "?";
  const type = (order.type ?? "unknown").toUpperCase().replace("_", " ");
  const qty =
    order.quantity != null && order.quantity > 0
      ? formatBingXQty(order.quantity)
      : "—";
  const price =
    order.price != null && order.price > 0
      ? formatOverlayPrice(order.price)
      : "MKT";
  return `REAL ${type} ${side} ${qty} BTC @ ${price} · READ ONLY`;
}

export function orderLineColor(order: BingXNormalizedOrder): string {
  return order.side === "sell" ? BINGX_ORDER_SELL : BINGX_ORDER_BUY;
}

export function positionLineColor(pos: BingXNormalizedPosition): string {
  return pos.side === "short" ? BINGX_REAL_SHORT : BINGX_REAL_LONG;
}
