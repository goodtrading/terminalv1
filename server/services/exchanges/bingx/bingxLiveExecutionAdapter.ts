import { randomBytes } from "crypto";
import { BingXHttpClient, BingXApiError } from "./bingxHttpClient";
import type { BingXApiCredentials } from "./bingxTypes";
import type { BingXParamValue } from "./bingxSigner";

const ORDER_PATH = "/openApi/swap/v2/trade/order";

export class LiveMarketOrdersDisabledError extends Error {
  readonly code = "LIVE_MARKET_ORDERS_DISABLED";

  constructor() {
    super("Live market orders are disabled in this phase. Use limit orders only.");
    this.name = "LiveMarketOrdersDisabledError";
  }
}

export type BingXLimitOrderSide = "buy" | "sell";

export interface SubmitBingXLimitOrderParams {
  credentials: BingXApiCredentials;
  symbol: string;
  side: BingXLimitOrderSide;
  type: "limit" | "market";
  quantity: number;
  limitPrice: number;
  clientOrderId: string;
  stopLossPrice: number;
  takeProfitPrice?: number;
  reduceOnly?: boolean;
}

export interface SubmitBingXLimitOrderResult {
  orderId: string;
  clientOrderId: string;
  status?: string;
  protectiveSlAttached: boolean;
  protectiveTpAttached: boolean;
}

function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/\s+/g, "");
  if (s.includes(":")) return s.split(":")[0]!;
  return s;
}

function mapSide(side: BingXLimitOrderSide): { side: string; positionSide: string } {
  if (side === "buy") {
    return { side: "BUY", positionSide: "LONG" };
  }
  return { side: "SELL", positionSide: "SHORT" };
}

function extractOrderId(data: unknown): string | undefined {
  if (data == null || typeof data !== "object") return undefined;
  const row = data as Record<string, unknown>;
  const nestedOrder =
    row.order != null && typeof row.order === "object"
      ? (row.order as Record<string, unknown>)
      : null;
  const direct =
    row.orderId ??
    row.orderID ??
    row.id ??
    nestedOrder?.orderId ??
    nestedOrder?.orderID;
  if (direct != null && String(direct).length > 0) return String(direct);
  if (nestedOrder) {
    const nid = nestedOrder.orderId ?? nestedOrder.orderID ?? nestedOrder.id;
    if (nid != null) return String(nid);
  }
  return undefined;
}

function buildStopLossParam(stopLossPrice: number): string {
  return JSON.stringify({
    type: "STOP_MARKET",
    stopPrice: stopLossPrice,
    workingType: "MARK_PRICE",
    stopGuaranteed: false,
  });
}

function buildTakeProfitParam(takeProfitPrice: number): string {
  return JSON.stringify({
    type: "TAKE_PROFIT_MARKET",
    stopPrice: takeProfitPrice,
    workingType: "MARK_PRICE",
    stopGuaranteed: false,
  });
}

export function generateLiveClientOrderId(): string {
  const ts = Date.now();
  const short = randomBytes(3).toString("hex");
  return `GT-LIVE-${ts}-${short}`;
}

/**
 * Signed POST to BingX swap v2 — limit orders only in phase 5C.
 * Never logs secrets, signatures, or full API keys.
 */
export async function submitBingXLimitOrder(
  params: SubmitBingXLimitOrderParams,
): Promise<SubmitBingXLimitOrderResult> {
  if (params.type === "market") {
    throw new LiveMarketOrdersDisabledError();
  }

  const symbol = normalizeSymbol(params.symbol);
  const { side, positionSide } = mapSide(params.side);
  const qty = params.quantity;
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new BingXApiError("Invalid order quantity", "INVALID_QUANTITY");
  }
  if (!Number.isFinite(params.limitPrice) || params.limitPrice <= 0) {
    throw new BingXApiError("Invalid limit price", "INVALID_LIMIT_PRICE");
  }
  if (!Number.isFinite(params.stopLossPrice) || params.stopLossPrice <= 0) {
    throw new BingXApiError("Invalid stop loss price", "INVALID_STOP_LOSS");
  }

  const client = new BingXHttpClient(params.credentials);
  const body: Record<string, BingXParamValue> = {
    symbol,
    side,
    positionSide,
    type: "LIMIT",
    quantity: qty,
    price: params.limitPrice,
    timeInForce: "GTC",
    clientOrderId: params.clientOrderId.toLowerCase(),
    stopLoss: buildStopLossParam(params.stopLossPrice),
  };

  if (params.takeProfitPrice != null && params.takeProfitPrice > 0) {
    body.takeProfit = buildTakeProfitParam(params.takeProfitPrice);
  }
  if (params.reduceOnly) {
    body.reduceOnly = true;
  }

  const data = await client.signedPost<unknown>(ORDER_PATH, body);
  const orderId = extractOrderId(data);
  if (!orderId) {
    throw new BingXApiError(
      "BingX accepted order but orderId missing in response",
      "BINGX_ORDER_ID_MISSING",
    );
  }

  return {
    orderId,
    clientOrderId: params.clientOrderId,
    status:
      data != null && typeof data === "object"
        ? String((data as Record<string, unknown>).status ?? "submitted")
        : "submitted",
    protectiveSlAttached: true,
    protectiveTpAttached:
      params.takeProfitPrice != null && params.takeProfitPrice > 0,
  };
}
