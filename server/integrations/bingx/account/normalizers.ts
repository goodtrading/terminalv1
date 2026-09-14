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

export type SourceTimestampOrigin = "BROKER" | "LOCAL_FALLBACK" | "MISSING";
export type RemainingQuantityOrigin = "BROKER_REPORTED" | "DERIVED_ORIGINAL_MINUS_EXECUTED" | "UNAVAILABLE";
export type FillIdBasis = "FILL_ID" | "TRADE_ID" | "GENERIC_ID" | "ORDER_ID_FALLBACK" | "MISSING";
export type FillQuantitySemantics = "INDIVIDUAL_EXECUTION" | "UNKNOWN";

export type PrivateOrderTruth = Readonly<{
  sourceClientOrderId?: string;
  sourceTimeInForce?: string;
  sourceReduceOnly?: boolean;
  sourcePostOnly?: boolean;
  reduceOnlyPresent: boolean;
  postOnlyPresent: boolean;
  remainingQuantityOrigin: RemainingQuantityOrigin;
  nativeType?: string;
  nativeStatus?: string;
  createdAtOrigin: SourceTimestampOrigin;
  updatedAtOrigin: SourceTimestampOrigin;
}>;

export type PrivateOrderRow = BingxOpenOrderSnapshot & {
  exchangeOrderId: string;
  privateTruth: PrivateOrderTruth;
};

export type PrivateOrderHistoryRow = BingxOrderHistoryItem & {
  privateTruth: PrivateOrderTruth;
};

export type PrivateFillTruth = Readonly<{
  sourceFillId?: string;
  sourceTradeId?: string;
  sourceGenericId?: string;
  sourceOrderId?: string;
  fillIdBasis: FillIdBasis;
  sourceTimestamp?: string;
  timestampOrigin: SourceTimestampOrigin;
  quantitySource?: string;
  quantitySemantics: FillQuantitySemantics;
  priceSource?: string;
  feePresent: boolean;
  feeAssetPresent: boolean;
}>;

export type PrivateFillRow = BingxFillSnapshot & {
  exchangeFillId: string;
  exchangeOrderId?: string;
  privateTruth: PrivateFillTruth;
};

function hasOwn(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function optionalSourceText(row: Record<string, unknown>, key: string): string | undefined {
  return hasOwn(row, key) && typeof row[key] === "string" && row[key].trim() ? row[key] as string : undefined;
}

function optionalSourceIdentifier(row: Record<string, unknown>, key: string): string | undefined {
  if (!hasOwn(row, key)) return undefined;
  const value = row[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
function timestampOrigin(value: string | undefined): SourceTimestampOrigin {
  return value === undefined ? "MISSING" : "BROKER";
}

function attachPrivateTruth<T extends object>(row: T, privateTruth: object): T & { privateTruth: typeof privateTruth } {
  Object.defineProperty(row, "privateTruth", { value: privateTruth, enumerable: false, writable: false, configurable: false });
  return row as T & { privateTruth: typeof privateTruth };
}

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
        hasOwn(node, "remainingQty")
          ? coerceNumber(node.remainingQty)
          : original != null && executed != null
            ? Math.max(0, original - executed)
            : undefined;
      const sourceCreatedAt = isoFromMs(node.time ?? node.createTime ?? node.createdTime);
      const sourceUpdatedAt = isoFromMs(node.updateTime ?? node.updatedTime);
      const sourceReduceOnly = hasOwn(node, "reduceOnly") && typeof node.reduceOnly === "boolean" ? node.reduceOnly : undefined;
      const sourcePostOnly = hasOwn(node, "postOnly") && typeof node.postOnly === "boolean" ? node.postOnly : undefined;
      const nativeType = optionalSourceText(node, "type") ?? optionalSourceText(node, "orderType");
      const nativeStatus = optionalSourceText(node, "status") ?? optionalSourceText(node, "orderStatus");
      return attachPrivateTruth({
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
        reduceOnly: sourceReduceOnly === true || String(node.reduceOnly).toLowerCase() === "true",
        status: normalizeOrderStatus(node.status ?? node.orderStatus),
        createdAt: sourceCreatedAt,
        updatedAt: sourceUpdatedAt,
        stale,
        accountMode: MODE,
        source: SOURCE,
      }, {
        sourceClientOrderId: optionalSourceText(node, "clientOrderId") ?? optionalSourceText(node, "clientOrderID"),
        sourceTimeInForce: optionalSourceText(node, "timeInForce"),
        sourceReduceOnly,
        sourcePostOnly,
        reduceOnlyPresent: hasOwn(node, "reduceOnly"),
        postOnlyPresent: hasOwn(node, "postOnly"),
        remainingQuantityOrigin: hasOwn(node, "remainingQty") ? (remaining === undefined ? "UNAVAILABLE" : "BROKER_REPORTED") : original != null && executed != null ? "DERIVED_ORIGINAL_MINUS_EXECUTED" : "UNAVAILABLE",
        nativeType,
        nativeStatus,
        createdAtOrigin: timestampOrigin(sourceCreatedAt),
        updatedAtOrigin: timestampOrigin(sourceUpdatedAt),
      });
    })
    .filter((o) => o != null)
    .slice(0, 100) as PrivateOrderRow[];
}

export function normalizeOrderHistory(
  data: unknown,
  accountId: string,
  userSalt: string,
): PrivateOrderHistoryRow[] {
  return asRows(data)
    .map((node) => {
      const exchangeOrderId = String(
        node.orderId ?? node.orderID ?? node.id ?? "",
      );
      if (!exchangeOrderId) return null;
      const symbol = String(node.symbol ?? "").trim();
      if (!symbol) return null;
      const sourceCreatedAt = isoFromMs(node.time ?? node.createTime);
      const sourceUpdatedAt = isoFromMs(node.updateTime);
      const sourceReduceOnly = hasOwn(node, "reduceOnly") && typeof node.reduceOnly === "boolean" ? node.reduceOnly : undefined;
      const sourcePostOnly = hasOwn(node, "postOnly") && typeof node.postOnly === "boolean" ? node.postOnly : undefined;
      const nativeType = optionalSourceText(node, "type") ?? optionalSourceText(node, "orderType");
      const nativeStatus = optionalSourceText(node, "status") ?? optionalSourceText(node, "orderStatus");
      return attachPrivateTruth({
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
        reduceOnly: node.reduceOnly === true || String(node.reduceOnly).toLowerCase() === "true",
        createdAt: sourceCreatedAt,
        updatedAt: sourceUpdatedAt,
        accountMode: MODE,
        source: SOURCE,
      }, {
        sourceClientOrderId: optionalSourceText(node, "clientOrderId") ?? optionalSourceText(node, "clientOrderID"),
        sourceTimeInForce: optionalSourceText(node, "timeInForce"),
        sourceReduceOnly,
        sourcePostOnly,
        reduceOnlyPresent: hasOwn(node, "reduceOnly"),
        postOnlyPresent: hasOwn(node, "postOnly"),
        remainingQuantityOrigin: "UNAVAILABLE",
        nativeType,
        nativeStatus,
        createdAtOrigin: timestampOrigin(sourceCreatedAt),
        updatedAtOrigin: timestampOrigin(sourceUpdatedAt),
      });
    })
    .filter((o) => o != null)
    .slice(0, 100) as PrivateOrderHistoryRow[];
}

export function normalizeFills(
  data: unknown,
  accountId: string,
  userSalt: string,
): PrivateFillRow[] {
  return asRows(data)
    .map((node) => {
      const sourceFillId = optionalSourceIdentifier(node, "fillId");
      const sourceTradeId = optionalSourceIdentifier(node, "tradeId");
      const sourceGenericId = sourceFillId || sourceTradeId ? undefined : optionalSourceIdentifier(node, "id");
      const sourceOrderId = optionalSourceIdentifier(node, "orderId");
      const fillIdBasis: FillIdBasis = sourceFillId ? "FILL_ID" : sourceTradeId ? "TRADE_ID" : sourceGenericId ? "GENERIC_ID" : sourceOrderId ? "ORDER_ID_FALLBACK" : "MISSING";
      const exchangeFillId = sourceFillId ?? sourceTradeId ?? sourceGenericId ?? sourceOrderId ?? "";
      if (!exchangeFillId) return null;
      const symbol = String(node.symbol ?? "").trim();
      if (!symbol) return null;
      const price = coerceNumber(node.price ?? node.fillPrice ?? node.avgPrice);
      const quantity = coerceNumber(
        node.qty ?? node.quantity ?? node.filledQty ?? node.volume,
      );
      if (price == null || quantity == null) return null;
      const exchangeOrderId =
        node.orderId != null ? String(node.orderId) : undefined;
      const sourceTimestamp = isoFromMs(node.filledTime ?? node.time ?? node.timestamp);
      const displayTimestamp = sourceTimestamp ?? new Date().toISOString();
      const quantitySource = ["qty", "quantity", "filledQty", "volume"].find((key) => hasOwn(node, key));
      const priceSource = ["price", "fillPrice", "avgPrice"].find((key) => hasOwn(node, key));
      return attachPrivateTruth({
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
        timestamp: displayTimestamp,
        accountMode: MODE,
        source: SOURCE,
      }, {
        sourceFillId,
        sourceTradeId,
        sourceGenericId,
        sourceOrderId,
        fillIdBasis,
        sourceTimestamp,
        timestampOrigin: sourceTimestamp ? "BROKER" : "LOCAL_FALLBACK",
        quantitySource,
        quantitySemantics: "UNKNOWN",
        priceSource,
        feePresent: hasOwn(node, "commission") || hasOwn(node, "fee"),
        feeAssetPresent: hasOwn(node, "commissionAsset") || hasOwn(node, "feeAsset"),
      });
    })
    .filter((f) => f != null)
    .slice(0, 100) as PrivateFillRow[];
}

/** Strip private exchange IDs before client responses. */
export function toPublicOrder(
  row: PrivateOrderRow,
): BingxOpenOrderSnapshot {
  const { exchangeOrderId: _e, privateTruth: _t, ...pub } = row;
  return pub;
}

export function toPublicFill(row: PrivateFillRow): BingxFillSnapshot {
  const { exchangeFillId: _f, exchangeOrderId: _o, privateTruth: _t, ...pub } = row;
  return pub;
}
