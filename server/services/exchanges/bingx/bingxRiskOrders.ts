import { logBingxRiskOrdersDebug } from "./bingxRiskDebug";
export { extractNumericCandidate } from "./bingxRiskFieldExtractors";

export interface BingXNormalizedOrderRiskInput {
  id: string;
  symbol: string;
  side: string;
  type: string;
  price?: number;
  triggerPrice?: number;
  stopPrice?: number;
  quantity?: number;
  reduceOnly?: boolean;
  status?: string;
}

export interface BingXNormalizedRiskOrder {
  id: string;
  symbol: string;
  kind: "stop_loss" | "take_profit" | "unknown";
  side: "buy" | "sell" | "unknown";
  triggerPrice?: number;
  price?: number;
  quantity?: number;
  reduceOnly?: boolean;
  status?: string;
  source: "bingx";
}

type PositionRow = {
  symbol: string;
  side: "long" | "short" | "flat" | "unknown";
  quantity: number;
  entryPrice?: number;
  markPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
};

type OrderRow = {
  orderId: string;
  symbol: string;
  side: string;
  type: string;
  price?: number;
  triggerPrice?: number;
  stopPrice?: number;
  quantity?: number;
  reduceOnly?: boolean;
  status: string;
};

function coerceNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeSide(raw: string): BingXNormalizedRiskOrder["side"] {
  const s = raw.toLowerCase();
  if (s.includes("buy") || s.includes("long")) return "buy";
  if (s.includes("sell") || s.includes("short")) return "sell";
  return "unknown";
}

function isLikelyActiveOrderStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  if (!s) return true;
  if (/cancel|reject|expir|filled|closed|done|fail|delet/.test(s)) return false;
  return true;
}

function kindFromOrderType(typeRaw: string): BingXNormalizedRiskOrder["kind"] {
  const s = typeRaw.toLowerCase().replace(/_/g, "");
  if (s.includes("takeprofit") || s === "tp" || (s.includes("profit") && s.includes("take"))) {
    return "take_profit";
  }
  if (
    s.includes("stoploss") ||
    s.includes("stopmarket") ||
    s.includes("trailingstop") ||
    (s.includes("stop") && !s.includes("profit"))
  ) {
    return "stop_loss";
  }
  if (s.includes("trailing") || s.includes("tpsl")) return "unknown";
  if (s.includes("trigger") || s.includes("conditional") || s.includes("plan")) {
    return "unknown";
  }
  return "unknown";
}

function classifyByPrice(
  posSide: "long" | "short",
  entry: number,
  ref: number,
  level: number,
): BingXNormalizedRiskOrder["kind"] {
  if (!Number.isFinite(level) || level <= 0) return "unknown";
  if (posSide === "long") {
    if (level < entry && level < ref) return "stop_loss";
    if (level > entry && level > ref) return "take_profit";
  } else {
    if (level > entry && level > ref) return "stop_loss";
    if (level < entry && level < ref) return "take_profit";
  }
  return "unknown";
}

function levelPriceFromOrder(o: OrderRow): number | undefined {
  return (
    o.triggerPrice ??
    o.stopPrice ??
    (o.price != null && o.price > 0 ? o.price : undefined)
  );
}

function upsertRisk(
  map: Map<string, BingXNormalizedRiskOrder>,
  order: BingXNormalizedRiskOrder,
): void {
  const key = `${order.symbol}:${order.kind}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, order);
    return;
  }
  if (existing.kind === "unknown" && order.kind !== "unknown") {
    map.set(key, order);
  }
}

export function buildRiskOrdersFromMarketData(
  positions: PositionRow[],
  rawOrders: OrderRow[],
): BingXNormalizedRiskOrder[] {
  const map = new Map<string, BingXNormalizedRiskOrder>();

  const openPositions = positions.filter(
    (p) => p.side !== "flat" && p.side !== "unknown" && p.quantity > 0,
  );

  for (const pos of openPositions) {
    const entry = pos.entryPrice;
    const mark = pos.markPrice ?? entry;
    if (entry == null || !Number.isFinite(entry) || entry <= 0) continue;
    const ref = mark != null && mark > 0 ? mark : entry;

    const slPrice = pos.stopLossPrice;
    if (slPrice != null && slPrice > 0) {
      upsertRisk(map, {
        id: `pos-sl-${pos.symbol}`,
        symbol: pos.symbol,
        kind: "stop_loss",
        side: pos.side === "long" ? "sell" : "buy",
        triggerPrice: slPrice,
        price: slPrice,
        quantity: pos.quantity,
        reduceOnly: true,
        status: "position_attached",
        source: "bingx",
      });
    }

    const tpPrice = pos.takeProfitPrice;
    if (tpPrice != null && tpPrice > 0) {
      upsertRisk(map, {
        id: `pos-tp-${pos.symbol}`,
        symbol: pos.symbol,
        kind: "take_profit",
        side: pos.side === "long" ? "sell" : "buy",
        triggerPrice: tpPrice,
        price: tpPrice,
        quantity: pos.quantity,
        reduceOnly: true,
        status: "position_attached",
        source: "bingx",
      });
    }
  }

  for (const o of rawOrders) {
    if (!isLikelyActiveOrderStatus(o.status)) continue;

    const typeRaw = o.type ?? "";
    const level = levelPriceFromOrder(o);
    if (level == null || level <= 0) continue;

    let kind = kindFromOrderType(typeRaw);
    const pos = openPositions.find((p) => p.symbol === o.symbol);
    const posSide =
      pos?.side === "long" || pos?.side === "short" ? pos.side : null;
    const entry = pos?.entryPrice;
    const mark = pos?.markPrice ?? entry;

    if (kind === "unknown" && posSide && entry != null && entry > 0) {
      kind = classifyByPrice(posSide, entry, mark ?? entry, level);
    }

    if (kind === "unknown") {
      upsertRisk(map, {
        id: o.orderId || `trigger-${o.symbol}-${level}`,
        symbol: o.symbol,
        kind: "unknown",
        side: normalizeSide(o.side),
        triggerPrice: level,
        price: o.price,
        quantity: o.quantity,
        reduceOnly: o.reduceOnly,
        status: o.status,
        source: "bingx",
      });
      continue;
    }

    upsertRisk(map, {
      id: o.orderId || `${kind}-${o.symbol}-${level}`,
      symbol: o.symbol,
      kind,
      side: normalizeSide(o.side),
      triggerPrice: level,
      price: o.price ?? level,
      quantity: o.quantity,
      reduceOnly: o.reduceOnly ?? true,
      status: o.status,
      source: "bingx",
    });
  }

  return [...map.values()];
}

export function buildRiskOrdersFromNormalized(
  positions: Array<{
    symbol: string;
    side: string;
    quantity: number;
    entryPrice?: number;
    markPrice?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
  }>,
  orders: BingXNormalizedOrderRiskInput[],
): BingXNormalizedRiskOrder[] {
  const rawOrders: OrderRow[] = orders.map((o) => ({
    orderId: o.id,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    price: o.price,
    triggerPrice: o.triggerPrice,
    stopPrice: o.stopPrice ?? o.triggerPrice,
    quantity: o.quantity,
    reduceOnly: o.reduceOnly,
    status: o.status ?? "open",
  }));

  const riskOrders = buildRiskOrdersFromMarketData(
    positions.map((p) => ({
      symbol: p.symbol,
      side:
        p.side === "long" || p.side === "short" ? p.side : ("unknown" as const),
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      stopLossPrice: p.stopLossPrice,
      takeProfitPrice: p.takeProfitPrice,
    })),
    rawOrders,
  );

  logBingxRiskOrdersDebug({
    positionCount: positions.length,
    openOrderCount: orders.length,
    riskOrderCount: riskOrders.length,
    riskOrders: riskOrders.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      kind: r.kind,
      triggerPrice: r.triggerPrice,
      status: r.status,
    })),
    positionStops: positions.map((p) => ({
      symbol: p.symbol,
      stopLossPrice: p.stopLossPrice,
      takeProfitPrice: p.takeProfitPrice,
    })),
  });

  return riskOrders;
}

export function pickPrimaryRiskOrders(
  riskOrders: BingXNormalizedRiskOrder[],
): { stopLoss: BingXNormalizedRiskOrder | null; takeProfit: BingXNormalizedRiskOrder | null } {
  let stopLoss: BingXNormalizedRiskOrder | null = null;
  let takeProfit: BingXNormalizedRiskOrder | null = null;
  for (const r of riskOrders) {
    if (r.kind === "stop_loss" && !stopLoss) stopLoss = r;
    if (r.kind === "take_profit" && !takeProfit) takeProfit = r;
  }
  return { stopLoss, takeProfit };
}
