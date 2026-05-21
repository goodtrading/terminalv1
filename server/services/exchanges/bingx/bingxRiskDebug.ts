import type { BingXApiCredentials } from "./bingxTypes";
import { BingXHttpClient } from "./bingxHttpClient";
import {
  extractOrderRiskPrices,
  extractPositionRiskPrices,
  isBingxRiskDebugEnabled,
  riskRelatedKeys,
  scanRiskCandidateFields,
} from "./bingxRiskFieldExtractors";

const POSITIONS_PATH = "/openApi/swap/v2/user/positions";
const OPEN_ORDERS_PATH = "/openApi/swap/v2/trade/openOrders";

function extractList(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { orders?: unknown }).orders)
      ? (data as { orders: unknown[] }).orders
      : [];
  return list.filter(
    (r): r is Record<string, unknown> => r != null && typeof r === "object",
  );
}

export type BingXRiskDebugShapeResponse = {
  success: true;
  symbol?: string;
  positionKeys: string[];
  orderKeys: string[];
  candidateFields: {
    positions: Array<{
      symbol: string;
      side: string;
      extractedStopLossPrice?: number;
      extractedTakeProfitPrice?: number;
      candidateStopFields: Record<string, number | string | null>;
      candidateTakeProfitFields: Record<string, number | string | null>;
      candidateTriggerFields: Record<string, number | string | null>;
      riskRelatedKeys: string[];
    }>;
    openOrders: Array<{
      symbol: string;
      type: string;
      side: string;
      extractedTriggerPrice?: number;
      extractedStopPrice?: number;
      candidateStopFields: Record<string, number | string | null>;
      candidateTakeProfitFields: Record<string, number | string | null>;
      candidateTriggerFields: Record<string, number | string | null>;
      riskRelatedKeys: string[];
    }>;
  };
  supplementalFetch?: {
    openOrdersWithoutSymbol: number;
    note: string;
  };
};

export async function buildBingXRiskDebugShape(
  credentials: BingXApiCredentials,
  symbol?: string,
): Promise<BingXRiskDebugShapeResponse> {
  const client = new BingXHttpClient(credentials);
  const sym = symbol?.trim();
  const params = sym ? { symbol: sym } : {};

  const [posData, ordData, ordAllData] = await Promise.all([
    client.signedGet<unknown>(POSITIONS_PATH, params),
    client.signedGet<unknown>(OPEN_ORDERS_PATH, params).catch(() => []),
    sym
      ? client.signedGet<unknown>(OPEN_ORDERS_PATH, {}).catch(() => [])
      : Promise.resolve([]),
  ]);

  const positions = extractList(posData);
  const orders = extractList(ordData);
  const ordersAll = sym ? extractList(ordAllData) : orders;

  const mergedOrderKeys = new Set<string>();
  const mergedOrders: Record<string, unknown>[] = [];
  for (const o of [...orders, ...ordersAll]) {
    const id = String(o.orderId ?? o.orderID ?? o.id ?? "");
    const key = id || JSON.stringify([o.symbol, o.type, o.stopPrice, o.triggerPrice]);
    if (mergedOrderKeys.has(key)) continue;
    mergedOrderKeys.add(key);
    mergedOrders.push(o);
  }

  const positionSamples = positions.map((p) => {
    const scanned = scanRiskCandidateFields(p);
    const extracted = extractPositionRiskPrices(p);
    const sideRaw = String(p.positionSide ?? p.side ?? "");
    return {
      symbol: String(p.symbol ?? ""),
      side: sideRaw,
      extractedStopLossPrice: extracted.stopLossPrice,
      extractedTakeProfitPrice: extracted.takeProfitPrice,
      candidateStopFields: scanned.candidateStopFields,
      candidateTakeProfitFields: scanned.candidateTakeProfitFields,
      candidateTriggerFields: scanned.candidateTriggerFields,
      riskRelatedKeys: riskRelatedKeys(scanned.keys),
    };
  });

  const orderSamples = mergedOrders.map((o) => {
    const scanned = scanRiskCandidateFields(o);
    const extracted = extractOrderRiskPrices(o);
    return {
      symbol: String(o.symbol ?? ""),
      type: String(o.type ?? o.orderType ?? ""),
      side: String(o.side ?? o.positionSide ?? ""),
      extractedTriggerPrice: extracted.triggerPrice,
      extractedStopPrice: extracted.stopPrice,
      candidateStopFields: scanned.candidateStopFields,
      candidateTakeProfitFields: scanned.candidateTakeProfitFields,
      candidateTriggerFields: scanned.candidateTriggerFields,
      riskRelatedKeys: riskRelatedKeys(scanned.keys),
    };
  });

  const firstPosKeys = positions[0] ? Object.keys(positions[0]) : [];
  const firstOrdKeys = mergedOrders[0] ? Object.keys(mergedOrders[0]) : [];

  return {
    success: true,
    symbol: sym,
    positionKeys: firstPosKeys,
    orderKeys: firstOrdKeys,
    candidateFields: {
      positions: positionSamples,
      openOrders: orderSamples,
    },
    supplementalFetch: sym
      ? {
          openOrdersWithoutSymbol: ordersAll.length,
          note: "Merged symbol-scoped and all-symbol open orders for SL/TP discovery.",
        }
      : undefined,
  };
}

export function logBingxRiskOrdersDebug(payload: Record<string, unknown>): void {
  if (!isBingxRiskDebugEnabled()) return;
  console.debug("[bingx-risk-orders]", payload);
}

export function logBingxPositionRiskShape(
  row: Record<string, unknown>,
  extracted: { stopLossPrice?: number; takeProfitPrice?: number },
): void {
  if (!isBingxRiskDebugEnabled()) return;
  const scanned = scanRiskCandidateFields(row);
  console.debug("[bingx-risk-orders] position candidate fields", {
    symbol: String(row.symbol ?? ""),
    side: String(row.positionSide ?? row.side ?? ""),
    stopLossPrice: extracted.stopLossPrice ?? null,
    takeProfitPrice: extracted.takeProfitPrice ?? null,
    keys: scanned.keys,
    riskRelatedKeys: riskRelatedKeys(scanned.keys),
    candidateStopFields: scanned.candidateStopFields,
    candidateTakeProfitFields: scanned.candidateTakeProfitFields,
  });
}

export function logBingxOrderRiskShape(
  row: Record<string, unknown>,
  extracted: ReturnType<typeof extractOrderRiskPrices>,
): void {
  if (!isBingxRiskDebugEnabled()) return;
  const scanned = scanRiskCandidateFields(row);
  console.debug("[bingx-risk-orders] open order candidate fields", {
    symbol: String(row.symbol ?? ""),
    type: String(row.type ?? row.orderType ?? ""),
    side: String(row.side ?? row.positionSide ?? ""),
    triggerPrice: extracted.triggerPrice ?? null,
    stopPrice: extracted.stopPrice ?? null,
    keys: scanned.keys,
    riskRelatedKeys: riskRelatedKeys(scanned.keys),
    candidateStopFields: scanned.candidateStopFields,
    candidateTriggerFields: scanned.candidateTriggerFields,
  });
}
