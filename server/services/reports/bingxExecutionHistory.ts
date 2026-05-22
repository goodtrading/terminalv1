import { BingXApiError, BingXHttpClient } from "../exchanges/bingx/bingxHttpClient";
import type { BingXApiCredentials } from "../exchanges/bingx/bingxTypes";

const FILL_HISTORY_PATH = "/openApi/swap/v2/trade/fillHistory";
const ALL_ORDERS_PATH = "/openApi/swap/v2/trade/allOrders";

export type BingxRawFillRow = Record<string, unknown>;

export type BingxHistoryFetchResult = {
  status: "loaded" | "unavailable" | "empty";
  message?: string;
  fills: BingxRawFillRow[];
  orders: BingxRawFillRow[];
};

function coerceRows(data: unknown): BingxRawFillRow[] {
  if (Array.isArray(data)) {
    return data.filter(
      (r): r is BingxRawFillRow => r != null && typeof r === "object",
    );
  }
  if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    for (const key of ["fills", "orders", "list", "data", "rows"]) {
      if (Array.isArray(root[key])) {
        return root[key].filter(
          (r): r is BingxRawFillRow => r != null && typeof r === "object",
        );
      }
    }
  }
  return [];
}

async function trySignedGet(
  credentials: BingXApiCredentials,
  path: string,
  params: Record<string, string | number>,
): Promise<unknown | null> {
  try {
    const client = new BingXHttpClient(credentials);
    return await client.signedGet<unknown>(path, params);
  } catch (err) {
    if (err instanceof BingXApiError) return null;
    return null;
  }
}

/**
 * Optional GET history — never throws; returns unavailable if BingX rejects or shape unknown.
 */
export async function fetchBingxExecutionHistory(
  credentials: BingXApiCredentials,
  symbol: string,
): Promise<BingxHistoryFetchResult> {
  const sym = symbol.trim() || "BTC-USDT";
  const params = { symbol: sym, limit: 50 };

  const [fillData, orderData] = await Promise.all([
    trySignedGet(credentials, FILL_HISTORY_PATH, params),
    trySignedGet(credentials, ALL_ORDERS_PATH, params),
  ]);

  const fills = fillData != null ? coerceRows(fillData) : [];
  const orders = orderData != null ? coerceRows(orderData) : [];

  if (fillData == null && orderData == null) {
    return {
      status: "unavailable",
      message:
        "BingX history endpoint unavailable with current read-only permissions.",
      fills: [],
      orders: [],
    };
  }

  if (fills.length === 0 && orders.length === 0) {
    return {
      status: "empty",
      message: "No fill or order history returned for this symbol.",
      fills: [],
      orders: [],
    };
  }

  return {
    status: "loaded",
    fills,
    orders,
  };
}
