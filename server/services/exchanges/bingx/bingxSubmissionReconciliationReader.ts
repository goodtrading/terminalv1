import type { BingXApiCredentials } from "./bingxTypes";
import { BingXApiError, BingXHttpClient } from "./bingxHttpClient";

export type BingXReconciliationSource = "OPEN_ORDERS" | "ORDER_HISTORY" | "FILL_HISTORY";
export type BingXSubmissionObservation = Readonly<{
  source: BingXReconciliationSource;
  clientOrderId?: string;
  brokerOrderId?: string;
  brokerOrderIdPrecisionTrusted: boolean;
  executionId?: string;
  symbol?: string;
  side?: string;
  quantity?: string;
  price?: string;
  feeAmount?: string;
  feeAsset?: string;
  feeConflict?: boolean;
  rawStatus?: string;
  observedAt: string;
  sourceTimestamp?: string;
}>;
export type BingXReadResult = Readonly<{
  status: "loaded" | "failed";
  observations: BingXSubmissionObservation[];
  errorCode?: string;
}>;
export type BingXSubmissionReadResults = Readonly<Record<BingXReconciliationSource, BingXReadResult>>;

function rowsFrom(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  for (const key of ["orders", "fills", "list", "data", "rows"]) {
    if (Array.isArray(root[key])) return root[key].filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  }
  return [root];
}

function text(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key].trim() !== "") return row[key] as string;
  }
  return undefined;
}

function textualDecimal(row: Record<string, unknown>, keys: string[]): string | undefined {
  return text(row, keys);
}

function feeEvidence(row: Record<string, unknown>): { feeAmount?: string; feeAsset?: string; feeConflict?: boolean } {
  const amount = (key: string) => typeof row[key] === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test((row[key] as string).trim()) ? (row[key] as string).trim() : undefined;
  const asset = (key: string) => typeof row[key] === "string" && (row[key] as string).trim() ? (row[key] as string).trim() : undefined;
  const commission = amount("commission"); const fallback = amount("fee");
  const commissionAsset = asset("commissionAsset"); const fallbackAsset = asset("feeAsset");
  if ((commission && fallback && commission !== fallback) || (commissionAsset && fallbackAsset && commissionAsset !== fallbackAsset)) return { feeConflict: true };
  return { feeAmount: commission ?? fallback, feeAsset: commissionAsset ?? fallbackAsset };
}

function observation(source: BingXReconciliationSource, row: Record<string, unknown>): BingXSubmissionObservation {
  const rawOrderId = row.orderId ?? row.orderID ?? row.id;
  const brokerOrderId = typeof rawOrderId === "string"
    ? rawOrderId
    : typeof rawOrderId === "number" && Number.isFinite(rawOrderId)
      ? String(rawOrderId)
      : undefined;
  const fee = feeEvidence(row);
  return {
    source,
    clientOrderId: text(row, ["clientOrderId", "clientOrderID"]),
    brokerOrderId,
    brokerOrderIdPrecisionTrusted: typeof rawOrderId === "string",
    executionId: text(row, ["executionId", "execId", "tradeId"]),
    symbol: text(row, ["symbol", "instrument"]),
    side: text(row, ["side", "positionSide"]),
    quantity: textualDecimal(row, ["quantity", "origQty", "qty", "volume", "filledQty"]),
    price: textualDecimal(row, ["price", "limitPrice", "fillPrice"]),
    feeAmount: fee.feeAmount,
    feeAsset: fee.feeAsset,
    feeConflict: fee.feeConflict,
    rawStatus: text(row, ["status", "orderStatus"]),
    observedAt: new Date().toISOString(),
    sourceTimestamp: text(row, source === "FILL_HISTORY"
      ? ["filledTime", "time", "timestamp", "updateTime", "updatedTime"]
      : ["updateTime", "updatedTime", "time", "createTime", "createdTime"]),
  };
}

export function normalizeBingXSubmissionObservations(
  source: BingXReconciliationSource,
  data: unknown,
): BingXSubmissionObservation[] {
  return rowsFrom(data).map((row) => observation(source, row));
}

async function readOne(
  credentials: BingXApiCredentials,
  source: BingXReconciliationSource,
  path: string,
  params: Record<string, string | number>,
): Promise<BingXReadResult> {
  try {
    const data = await new BingXHttpClient(credentials).signedGet<unknown>(path, params);
    return { status: "loaded", observations: normalizeBingXSubmissionObservations(source, data) };
  } catch (error) {
    return {
      status: "failed",
      observations: [],
      errorCode: error instanceof BingXApiError ? error.code : "BINGX_REQUEST_FAILED",
    };
  }
}

export async function readBingXSubmissionSources(
  credentials: BingXApiCredentials,
  symbol: string,
): Promise<BingXSubmissionReadResults> {
  const params = { symbol, limit: 100 };
  const [openOrders, orderHistory, fillHistory] = await Promise.all([
    readOne(credentials, "OPEN_ORDERS", "/openApi/swap/v2/trade/openOrders", params),
    readOne(credentials, "ORDER_HISTORY", "/openApi/swap/v2/trade/allOrders", params),
    readOne(credentials, "FILL_HISTORY", "/openApi/swap/v2/trade/allFillOrders", params),
  ]);
  return { OPEN_ORDERS: openOrders, ORDER_HISTORY: orderHistory, FILL_HISTORY: fillHistory };
}
