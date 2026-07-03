export type FinancialParseResult = {
  present: boolean;
  valid: boolean;
  value: number | null;
};

export type AccountDataQuality = {
  status: "complete" | "partial" | "missing" | "stale";
  missingFields: string[];
  warnings: string[];
};

export type OrderLifecycle = "open" | "terminal" | "unknown";

export type ClassifiedOrderStatus = {
  status:
    | "open"
    | "partially_filled"
    | "filled"
    | "cancelled"
    | "expired"
    | "rejected"
    | "unknown";
  lifecycle: OrderLifecycle;
  warning?: string;
};

export type NormalizedPositionRow = {
  id: string;
  symbol: string;
  positionSide?: "LONG" | "SHORT" | "BOTH";
  side: "long" | "short" | "flat" | "unknown";
  quantity: number;
  entryPrice?: number;
  markPrice?: number;
  liquidationPrice?: number;
  leverage?: number;
  marginMode?: "cross" | "isolated" | "unknown";
  unrealizedPnlUsdt?: number;
  roePct?: number;
  notionalUsdt?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
};

export const SNAPSHOT_STALE_MS = 25_000;

export function parseFinancialNumber(value: unknown): FinancialParseResult {
  if (value == null || value === "") {
    return { present: false, valid: false, value: null };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { present: true, valid: false, value: null };
    return { present: true, valid: true, value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { present: false, valid: false, value: null };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return { present: true, valid: false, value: null };
    return { present: true, valid: true, value: n };
  }
  return { present: true, valid: false, value: null };
}

export function optionalFinancial(value: unknown): number | undefined {
  const parsed = parseFinancialNumber(value);
  return parsed.valid && parsed.value != null ? parsed.value : undefined;
}

export function normalizeMarginMode(raw: unknown): "cross" | "isolated" | "unknown" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("cross")) return "cross";
  if (s.includes("isol")) return "isolated";
  if (raw === true) return "isolated";
  return "unknown";
}

export function normalizeOrderSide(raw: string): "buy" | "sell" | "unknown" {
  const s = raw.toLowerCase();
  if (s.includes("buy") || s.includes("long")) return "buy";
  if (s.includes("sell") || s.includes("short")) return "sell";
  return "unknown";
}

export function normalizeOrderType(raw: string): "market" | "limit" | "stop" | "take_profit" | "unknown" {
  const s = raw.toLowerCase();
  if (s.includes("limit")) return "limit";
  if (s.includes("market")) return "market";
  if (s.includes("stop") && !s.includes("profit")) return "stop";
  if (s.includes("profit") || s.includes("tp")) return "take_profit";
  return "unknown";
}

export function classifyOrderStatus(raw: string): ClassifiedOrderStatus {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) {
    return {
      status: "unknown",
      lifecycle: "unknown",
      warning: "Missing order status",
    };
  }

  if (s === "filled" || s.startsWith("complet")) {
    return { status: "filled", lifecycle: "terminal" };
  }
  if (s === "canceled" || s === "cancelled" || s === "cancel") {
    return { status: "cancelled", lifecycle: "terminal" };
  }
  if (s === "rejected" || s === "failed" || s === "fail") {
    return { status: "rejected", lifecycle: "terminal" };
  }
  if (s === "expired") {
    return { status: "expired", lifecycle: "terminal" };
  }

  if (s.startsWith("partial") || s === "partially_filled") {
    return { status: "partially_filled", lifecycle: "open" };
  }

  if (
    s === "new" ||
    s === "open" ||
    s === "working" ||
    s === "active" ||
    s === "pending" ||
    s === "accepted" ||
    s === "submitted" ||
    s === "trigger_pending" ||
    s === "triggered"
  ) {
    return { status: "open", lifecycle: "open" };
  }

  return {
    status: "unknown",
    lifecycle: "unknown",
    warning: "Unrecognized BingX order status",
  };
}

export function buildPositionId(input: {
  symbol: string;
  positionSide?: string;
  side: string;
  marginMode?: string;
  exchangePositionId?: string;
}): string {
  if (input.exchangePositionId?.trim()) {
    return `bingx:${input.exchangePositionId.trim()}`;
  }
  const ps = (input.positionSide ?? input.side ?? "unknown").toUpperCase();
  const mm = (input.marginMode ?? "unknown").toLowerCase();
  return `${input.symbol}:${ps}:${mm}`;
}

export function mapPositionRow(
  row: Record<string, unknown>,
  risk?: { stopLossPrice?: number; takeProfitPrice?: number },
): NormalizedPositionRow | null {
  const symbol = String(row.symbol ?? "").trim();
  if (!symbol) return null;

  const amtParsed = parseFinancialNumber(
    row.positionAmt ?? row.positionAmount ?? row.amount,
  );
  const amtSigned = amtParsed.valid && amtParsed.value != null ? amtParsed.value : 0;
  const positionSideRaw = String(row.positionSide ?? row.posSide ?? "").toUpperCase();
  let side: NormalizedPositionRow["side"] = "flat";
  if (positionSideRaw.includes("LONG")) side = "long";
  else if (positionSideRaw.includes("SHORT")) side = "short";
  else if (amtSigned > 0) side = "long";
  else if (amtSigned < 0) side = "short";
  if (Math.abs(amtSigned) < 1e-12) side = "flat";

  const quantity = Math.abs(amtSigned);
  if (side === "flat" || quantity <= 0) return null;

  const entryPrice = optionalFinancial(row.avgPrice ?? row.entryPrice);
  const markPrice = optionalFinancial(row.markPrice);
  const notional =
    markPrice != null && markPrice > 0
      ? quantity * markPrice
      : entryPrice != null && entryPrice > 0
        ? quantity * entryPrice
        : undefined;
  const unrealizedPnlUsdt = optionalFinancial(row.unrealizedProfit ?? row.unrealizedPnl);
  let roePct: number | undefined;
  if (unrealizedPnlUsdt != null && notional != null && notional > 0) {
    roePct = Math.round((unrealizedPnlUsdt / notional) * 10000) / 100;
  }

  const marginMode = normalizeMarginMode(row.isolated ? "isolated" : row.marginMode);
  const exchangePositionId = String(
    row.positionId ?? row.positionID ?? row.id ?? "",
  ).trim();

  return {
    id: buildPositionId({
      symbol,
      positionSide: positionSideRaw || side.toUpperCase(),
      side,
      marginMode,
      exchangePositionId: exchangePositionId || undefined,
    }),
    symbol,
    positionSide: positionSideRaw
      ? (positionSideRaw as "LONG" | "SHORT" | "BOTH")
      : side === "long"
        ? "LONG"
        : side === "short"
          ? "SHORT"
          : undefined,
    side,
    quantity,
    entryPrice,
    markPrice,
    liquidationPrice: optionalFinancial(
      row.liquidationPrice ?? row.liqPrice ?? row.liquidation ?? row.liquidationPx,
    ),
    leverage: optionalFinancial(row.leverage),
    marginMode,
    unrealizedPnlUsdt,
    roePct,
    notionalUsdt: notional,
    stopLossPrice: risk?.stopLossPrice,
    takeProfitPrice: risk?.takeProfitPrice,
  };
}

export type MappedOpenOrder = {
  id: string;
  symbol: string;
  side: "buy" | "sell" | "unknown";
  type: "market" | "limit" | "stop" | "take_profit" | "unknown";
  status: ClassifiedOrderStatus["status"];
  lifecycle: OrderLifecycle;
  price?: number;
  triggerPrice?: number;
  stopPrice?: number;
  quantity?: number;
  reduceOnly?: boolean;
  statusWarning?: string;
};

export function mapOpenOrderRow(row: Record<string, unknown>): MappedOpenOrder | null {
  const id = String(row.orderId ?? row.orderID ?? row.id ?? "").trim();
  if (!id) return null;
  const classified = classifyOrderStatus(String(row.status ?? ""));
  const type = normalizeOrderType(String(row.type ?? row.orderType ?? ""));
  const typeLower = String(row.type ?? row.orderType ?? "").toLowerCase();
  const isConditional =
    type === "stop" ||
    type === "take_profit" ||
    /stop|take_profit|trigger|trailing|tpsl|conditional|plan/.test(typeLower);
  const limitPrice = optionalFinancial(row.price);
  const triggerPrice = optionalFinancial(row.triggerPrice ?? row.stopPrice);
  const stopPrice = optionalFinancial(row.stopPrice);
  const effectivePrice = isConditional
    ? triggerPrice ?? limitPrice
    : limitPrice ?? triggerPrice;

  return {
    id,
    symbol: String(row.symbol ?? ""),
    side: normalizeOrderSide(String(row.side ?? row.positionSide ?? "")),
    type,
    status: classified.status,
    lifecycle: classified.lifecycle,
    statusWarning: classified.warning,
    price: effectivePrice,
    triggerPrice,
    stopPrice,
    quantity: optionalFinancial(row.quantity ?? row.origQty ?? row.qty),
    reduceOnly: Boolean(
      row.reduceOnly ?? row.isReduceOnly ?? row.closePosition ?? row.onlyReduce,
    ),
  };
}

export function filterDisplayOpenOrders(orders: MappedOpenOrder[]): {
  openOrders: MappedOpenOrder[];
  unknownOrders: MappedOpenOrder[];
  terminalFilteredCount: number;
} {
  const openOrders: MappedOpenOrder[] = [];
  const unknownOrders: MappedOpenOrder[] = [];
  let terminalFilteredCount = 0;
  for (const o of orders) {
    if (o.lifecycle === "open") {
      openOrders.push(o);
    } else if (o.lifecycle === "unknown") {
      unknownOrders.push(o);
    } else {
      terminalFilteredCount += 1;
    }
  }
  return { openOrders, unknownOrders, terminalFilteredCount };
}

export function buildAccountDataQuality(input: {
  equity?: number;
  balance?: number;
  availableMargin?: number;
  unrealizedPnl?: number;
  parseHint?: string;
}): AccountDataQuality {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  if (input.equity == null) missingFields.push("equityUsdt");
  if (input.balance == null) missingFields.push("balanceUsdt");
  if (input.availableMargin == null) missingFields.push("availableMarginUsdt");
  if (input.parseHint === "parser_mismatch") {
    warnings.push("Balance response could not be fully parsed.");
  }
  if (missingFields.length === 0 && warnings.length === 0) {
    return { status: "complete", missingFields, warnings };
  }
  if (missingFields.length >= 3) {
    return { status: "missing", missingFields, warnings };
  }
  return { status: "partial", missingFields, warnings };
}

export type BingxConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "DEGRADED"
  | "STALE"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "ERROR";

export function deriveConnectionState(input: {
  connected: boolean;
  health: "healthy" | "degraded" | "error";
  lastSyncTime: number;
  now?: number;
  authError?: boolean;
  rateLimited?: boolean;
}): BingxConnectionState {
  if (input.rateLimited) return "RATE_LIMITED";
  if (input.authError) return "UNAUTHORIZED";
  if (!input.connected) return input.connected === false && input.health === "error" ? "ERROR" : "DISCONNECTED";
  const age = (input.now ?? Date.now()) - input.lastSyncTime;
  if (age > SNAPSHOT_STALE_MS) return "STALE";
  if (input.health === "error") return "ERROR";
  if (input.health === "degraded") return "DEGRADED";
  return "CONNECTED";
}
