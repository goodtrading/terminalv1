import type {
  BingxAccountMode,
  BingxBalanceSnapshot,
  BingxFillSnapshot,
  BingxOpenOrderSnapshot,
  BingxOrderHistoryItem,
  BingxPositionSnapshot,
} from "../../../../shared/goodTradingAiBingxAccount";
import { pseudonymizeId } from "./redact";

const SOURCE = "BINGX_ACCOUNT_READ_ONLY" as const;
const MODE: BingxAccountMode = "REAL_BINGX_READ_ONLY";

export function coerceNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function asRows(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (r): r is Record<string, unknown> => r != null && typeof r === "object",
    );
  }
  if (typeof data === "object") {
    const root = data as Record<string, unknown>;
    for (const key of ["balances", "positions", "orders", "fill_orders", "fills", "list", "data"]) {
      if (Array.isArray(root[key])) return asRows(root[key]);
    }
    return [root];
  }
  return [];
}

export function normalizeMarginMode(
  raw: unknown,
): "cross" | "isolated" | "unknown" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("cross")) return "cross";
  if (s.includes("isol")) return "isolated";
  if (raw === true) return "isolated";
  return "unknown";
}

export function normalizeSide(
  raw: unknown,
): "long" | "short" | "flat" | "unknown" {
  const s = String(raw ?? "").toLowerCase();
  if (s === "long" || s === "buy") return "long";
  if (s === "short" || s === "sell") return "short";
  if (s === "flat" || s === "both") return "flat";
  return "unknown";
}

export function normalizeOrderSide(raw: unknown): "buy" | "sell" | "unknown" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("buy") || s === "long") return "buy";
  if (s.includes("sell") || s === "short") return "sell";
  return "unknown";
}

export function normalizeOrderType(
  raw: unknown,
): BingxOpenOrderSnapshot["type"] {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("take_profit") || s.includes("takeprofit") || s === "tp") {
    return s.includes("market") ? "take_profit_market" : "take_profit";
  }
  if (s.includes("stop") || s === "sl") {
    return s.includes("market") ? "stop_market" : "stop";
  }
  if (s.includes("market")) return "market";
  if (s.includes("limit")) return "limit";
  return "unknown";
}

export function normalizeOrderStatus(
  raw: unknown,
): BingxOpenOrderSnapshot["status"] {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("partial")) return "partially_filled";
  if (s.includes("fill") || s.includes("complet")) return "filled";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("expir")) return "expired";
  if (s.includes("reject")) return "rejected";
  if (s.includes("new") || s.includes("open") || s.includes("pending") || s === "1") {
    return "open";
  }
  return "unknown";
}

function isoFromMs(ms: unknown): string | undefined {
  const n = coerceNumber(ms);
  if (n == null) return undefined;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export type PrivateOrderRow = BingxOpenOrderSnapshot & {
  exchangeOrderId: string;
};

export type PrivateFillRow = BingxFillSnapshot & {
  exchangeFillId: string;
  exchangeOrderId?: string;
};

export function normalizeBalances(
  data: unknown,
): BingxBalanceSnapshot[] {
  return asRows(data)
    .map((node) => {
      const hasRecognizedField =
        node.asset != null ||
        node.currency != null ||
        node.equity != null ||
        node.balance != null ||
        node.walletBalance != null ||
        node.availableMargin != null ||
        node.availableBalance != null ||
        node.available != null ||
        node.unrealizedProfit != null ||
        node.unrealizedPnl != null ||
        node.unrealizedPNL != null;
      if (!hasRecognizedField) return null;

      const asset = String(node.asset ?? node.currency ?? "USDT").toUpperCase();
      const wallet =
        coerceNumber(node.balance ?? node.walletBalance ?? node.equity) ?? 0;
      const equity = coerceNumber(node.equity) ?? wallet;
      const available =
        coerceNumber(
          node.availableMargin ??
            node.availableBalance ??
            node.available ??
            node.maxWithdrawAmount,
        ) ?? 0;
      const usedMargin = coerceNumber(node.usedMargin ?? node.margin);
      const unrealizedPnl = coerceNumber(
        node.unrealizedProfit ?? node.unrealizedPnl ?? node.unrealizedPNL,
      );
      return {
        asset,
        walletBalance: wallet,
        equity,
        availableBalance: available,
        usedMargin,
        unrealizedPnl,
        accountMode: MODE,
        source: SOURCE,
      } satisfies BingxBalanceSnapshot;
    })
    .filter((b) => b != null)
    .slice(0, 64) as BingxBalanceSnapshot[];
}

export function normalizePositions(
  data: unknown,
  accountId: string,
  userSalt: string,
  stale: boolean,
): BingxPositionSnapshot[] {
  return asRows(data)
    .map((node) => {
      const symbol = String(node.symbol ?? "").trim();
      if (!symbol) return null;
      const amt =
        coerceNumber(node.positionAmt ?? node.availableAmt ?? node.quantity) ?? 0;
      let side = normalizeSide(node.positionSide ?? node.side);
      if (side === "unknown" || side === "flat") {
        if (amt > 0) side = "long";
        else if (amt < 0) side = "short";
        else side = "flat";
      }
      const quantity = Math.abs(amt);
      const rawId = String(
        node.positionId ?? `${symbol}:${side}:${node.positionSide ?? ""}`,
      );
      return {
        positionId: pseudonymizeId("position", rawId, userSalt),
        accountId,
        symbol,
        side,
        quantity,
        entryPrice: coerceNumber(node.avgPrice ?? node.entryPrice),
        markPrice: coerceNumber(node.markPrice),
        liquidationPrice: coerceNumber(node.liquidationPrice),
        leverage: coerceNumber(node.leverage),
        marginMode: normalizeMarginMode(
          node.marginMode ?? node.marginType ?? node.isolated,
        ),
        unrealizedPnl: coerceNumber(
          node.unrealizedProfit ?? node.unrealizedPnl,
        ),
        realizedPnl: coerceNumber(node.realizedPnl ?? node.realisedPnl),
        notional: coerceNumber(node.notional ?? node.positionValue),
        stopLossPrice: coerceNumber(node.stopLossPrice ?? node.sl),
        takeProfitPrice: coerceNumber(node.takeProfitPrice ?? node.tp),
        updatedAt: isoFromMs(node.updateTime ?? node.updatedTime),
        stale,
        accountMode: MODE,
        source: SOURCE,
      } satisfies BingxPositionSnapshot;
    })
    .filter((p) => p != null && p.quantity > 0)
    .slice(0, 50) as BingxPositionSnapshot[];
}

export function normalizeOpenOrders(
  data: unknown,
  accountId: string,
  userSalt: string,
  stale: boolean,
): PrivateOrderRow[] {
  return asRows(data)
    .map((node) => {
      const exchangeOrderId = String(
        node.orderId ?? node.orderID ?? node.id ?? "",
      );
      if (!exchangeOrderId) return null;
      const symbol = String(node.symbol ?? "").trim();
      if (!symbol) return null;
      const original =
        coerceNumber(node.origQty ?? node.quantity ?? node.qty) ?? undefined;
      const executed =
        coerceNumber(node.executedQty ?? node.filledQty ?? node.cumQty) ??
        undefined;
      const remaining =
        original != null && executed != null
          ? Math.max(0, original - executed)
          : coerceNumber(node.remainingQty);
      return {
        orderId: pseudonymizeId("order", exchangeOrderId, userSalt),
        exchangeOrderId,
        accountId,
        symbol,
        side: normalizeOrderSide(node.side),
        type: normalizeOrderType(node.type ?? node.orderType),
        price: coerceNumber(node.price),
        stopPrice: coerceNumber(node.stopPrice ?? node.stopLoss),
        triggerPrice: coerceNumber(node.triggerPrice ?? node.activationPrice),
        originalQuantity: original,
        executedQuantity: executed,
        remainingQuantity: remaining,
        reduceOnly:
          node.reduceOnly === true ||
          String(node.reduceOnly).toLowerCase() === "true",
        status: normalizeOrderStatus(node.status ?? node.orderStatus),
        createdAt: isoFromMs(node.time ?? node.createTime ?? node.createdTime),
        updatedAt: isoFromMs(node.updateTime ?? node.updatedTime),
        stale,
        accountMode: MODE,
        source: SOURCE,
      } satisfies PrivateOrderRow;
    })
    .filter((o) => o != null)
    .slice(0, 100) as PrivateOrderRow[];
}

export function normalizeOrderHistory(
  data: unknown,
  accountId: string,
  userSalt: string,
): BingxOrderHistoryItem[] {
  return asRows(data)
    .map((node) => {
      const exchangeOrderId = String(
        node.orderId ?? node.orderID ?? node.id ?? "",
      );
      if (!exchangeOrderId) return null;
      const symbol = String(node.symbol ?? "").trim();
      if (!symbol) return null;
      return {
        orderId: pseudonymizeId("order", exchangeOrderId, userSalt),
        accountId,
        symbol,
        side: normalizeOrderSide(node.side),
        type: String(node.type ?? node.orderType ?? "unknown"),
        status: String(node.status ?? node.orderStatus ?? "unknown"),
        price: coerceNumber(node.price),
        averagePrice: coerceNumber(node.avgPrice ?? node.averagePrice),
        originalQuantity: coerceNumber(node.origQty ?? node.quantity),
        executedQuantity: coerceNumber(node.executedQty ?? node.filledQty),
        reduceOnly:
          node.reduceOnly === true ||
          String(node.reduceOnly).toLowerCase() === "true",
        createdAt: isoFromMs(node.time ?? node.createTime),
        updatedAt: isoFromMs(node.updateTime),
        accountMode: MODE,
        source: SOURCE,
      } satisfies BingxOrderHistoryItem;
    })
    .filter((o) => o != null)
    .slice(0, 100) as BingxOrderHistoryItem[];
}

export function normalizeFills(
  data: unknown,
  accountId: string,
  userSalt: string,
): PrivateFillRow[] {
  return asRows(data)
    .map((node) => {
      const exchangeFillId = String(
        node.fillId ?? node.tradeId ?? node.id ?? node.orderId ?? "",
      );
      if (!exchangeFillId) return null;
      const symbol = String(node.symbol ?? "").trim();
      if (!symbol) return null;
      const price = coerceNumber(node.price ?? node.fillPrice ?? node.avgPrice);
      const quantity = coerceNumber(
        node.qty ?? node.quantity ?? node.filledQty ?? node.volume,
      );
      if (price == null || quantity == null) return null;
      const ts =
        isoFromMs(node.filledTime ?? node.time ?? node.timestamp) ??
        new Date().toISOString();
      const exchangeOrderId =
        node.orderId != null ? String(node.orderId) : undefined;
      return {
        fillId: pseudonymizeId("fill", exchangeFillId, userSalt),
        exchangeFillId,
        exchangeOrderId,
        orderRef: exchangeOrderId
          ? pseudonymizeId("order", exchangeOrderId, userSalt)
          : undefined,
        accountId,
        symbol,
        side: normalizeOrderSide(node.side),
        price,
        quantity,
        fee: coerceNumber(node.commission ?? node.fee),
        feeAsset:
          node.commissionAsset != null
            ? String(node.commissionAsset)
            : node.feeAsset != null
              ? String(node.feeAsset)
              : undefined,
        realizedPnl: coerceNumber(node.realizedPnl ?? node.profit),
        timestamp: ts,
        accountMode: MODE,
        source: SOURCE,
      } satisfies PrivateFillRow;
    })
    .filter((f) => f != null)
    .slice(0, 100) as PrivateFillRow[];
}

/** Strip private exchange IDs before client responses. */
export function toPublicOrder(
  row: PrivateOrderRow,
): BingxOpenOrderSnapshot {
  const { exchangeOrderId: _e, ...pub } = row;
  return pub;
}

export function toPublicFill(row: PrivateFillRow): BingxFillSnapshot {
  const { exchangeFillId: _f, exchangeOrderId: _o, ...pub } = row;
  return pub;
}
