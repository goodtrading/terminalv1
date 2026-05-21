import type {
  BingXNormalizedPosition,
  BingXNormalizedRiskOrder,
  BingXReadOnlySnapshot,
} from "../execution/executionTypes";
import type {
  PositionRiskOverlayLevel,
  PositionRiskOverlayPosition,
} from "../chartRisk/positionRiskOverlayTypes";

export function riskOrderLevelPrice(order: BingXNormalizedRiskOrder): number | null {
  const p = order.triggerPrice ?? order.price;
  return p != null && Number.isFinite(p) && p > 0 ? p : null;
}

export function pickRiskLevel(
  orders: BingXNormalizedRiskOrder[],
  kind: "stop_loss" | "take_profit",
): PositionRiskOverlayLevel | null {
  const match = orders.find((r) => r.kind === kind);
  if (!match) return null;
  const price = riskOrderLevelPrice(match);
  if (price == null) return null;
  return { price, source: "bingx" };
}

function coercePositiveNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function bingxPositionToOverlayPosition(
  pos: BingXNormalizedPosition,
): PositionRiskOverlayPosition | null {
  if (pos.side !== "long" && pos.side !== "short") return null;
  const entryPrice = coercePositiveNumber(pos.entryPrice);
  const quantity = coercePositiveNumber(pos.quantity);
  if (entryPrice == null || entryPrice <= 0 || quantity == null || quantity <= 0) {
    return null;
  }
  return {
    side: pos.side,
    quantity,
    entryPrice,
    markPrice: coercePositiveNumber(pos.markPrice),
    leverage: coercePositiveNumber(pos.leverage),
    marginMode: pos.marginMode,
    unrealizedPnlUsdt: coercePositiveNumber(pos.unrealizedPnlUsdt),
    unrealizedPnlAccountPct: coercePositiveNumber(pos.roePct),
  };
}

export function isRiskChartOrder(
  order: { id: string; type?: string; reduceOnly?: boolean },
  riskOrderIds: Set<string>,
): boolean {
  if (riskOrderIds.has(order.id)) return true;
  const t = (order.type ?? "").toLowerCase();
  return t === "stop" || t === "take_profit";
}

export function bingxSnapshotToRiskLevels(
  snapshot: BingXReadOnlySnapshot | null | undefined,
  symbolOrders: BingXNormalizedRiskOrder[],
): {
  stopLoss: PositionRiskOverlayLevel | null;
  takeProfit: PositionRiskOverlayLevel | null;
} {
  const orders = symbolOrders.length > 0 ? symbolOrders : snapshot?.riskOrders ?? [];
  return {
    stopLoss: pickRiskLevel(orders, "stop_loss"),
    takeProfit: pickRiskLevel(orders, "take_profit"),
  };
}
