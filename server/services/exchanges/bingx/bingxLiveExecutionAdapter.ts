/**
 * BingX Live Execution Adapter
 * 
 * Phase 5C: First real LIMIT submit test
 * - Sends pure LIMIT order without SL/TP/bracket params in test mode
 * - Allows BingX to accept or reject the order based on its own validation
 * 
 * Phase 5D: BingX real order monitoring (future)
 * - Detect real order opened on BingX
 * - Show REAL LIMIT in chart/bar
 * - Sync position state from BingX
 * 
 * Phase 5E: BingX real SL/TP management (future)
 * - After position fill, allow SL/TP modification from UI
 * - Call correct BingX endpoints to modify TP/SL on existing position
 * - Do not mix with initial LIMIT submit until API is confirmed
 */

import { randomBytes } from "crypto";
import { BingXHttpClient, BingXApiError } from "./bingxHttpClient";
import type { BingXApiCredentials } from "./bingxTypes";
import type { BingXParamValue } from "./bingxSigner";
import {
  getBingXSymbolRules,
  formatQuantityForBingX,
  formatQuantityFallback,
} from "./bingxSymbolRulesService";
import { isLiveLimitTestMode } from "../../execution/riskGuard";

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

  // Format quantity according to BingX symbol rules
  let formattedQuantity: string;
  const testMode = isLiveLimitTestMode();

  try {
    const symbolRules = await getBingXSymbolRules(symbol);
    formattedQuantity = formatQuantityForBingX(qty, symbolRules.quantityPrecision);
  } catch {
    // In test mode, use fallback formatter; otherwise use simple fallback
    if (testMode) {
      formattedQuantity = formatQuantityFallback(qty);
    } else {
      formattedQuantity = qty.toFixed(6).replace(/\.?0+$/, "");
    }
  }

  const client = new BingXHttpClient(params.credentials);

  // In test mode, send pure LIMIT order without SL/TP/bracket params
  // Phase 5C: First real submit test - simple LIMIT only
  // Phase 5E: Will implement real SL/TP management after position fill
  const body: Record<string, BingXParamValue> = {
    symbol,
    side,
    positionSide,
    type: "LIMIT",
    quantity: formattedQuantity,
    price: params.limitPrice,
    timeInForce: "GTC",
    clientOrderId: params.clientOrderId.toLowerCase(),
  };

  // Only include stopLoss/takeProfit if NOT in test mode
  if (!testMode) {
    body.stopLoss = buildStopLossParam(params.stopLossPrice);
    if (params.takeProfitPrice != null && params.takeProfitPrice > 0) {
      body.takeProfit = buildTakeProfitParam(params.takeProfitPrice);
    }
  }

  if (params.reduceOnly) {
    body.reduceOnly = true;
  }

  console.log("[bingx-live-submit] order payload keys", Object.keys(body));

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
