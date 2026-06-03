import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  BingXNormalizedOrder,
  BingXNormalizedPosition,
  BingXNormalizedRiskOrder,
  BingXReadOnlySnapshot,
  BrokerSessionState,
} from "../execution/executionTypes";
import { isRiskChartOrder } from "./bingxPositionRiskAdapter";
import { bingxApiFetch } from "../execution/bingxApiClient";
import { bingxReadOnlyErrorMessage } from "../execution/bingxReadOnlyMessages";
import {
  hasPersistedBingXConnection,
  isBingXVisualSession,
} from "../execution/bingxSession";
import {
  DEFAULT_CHART_SYMBOL,
  resolveExecutionSymbolForChart,
} from "../execution/executionContext";
import { exchangeSymbolsMatch } from "./normalizeExchangeSymbol";

const SNAPSHOT_QUERY_KEY = "/api/bingx/read-only/snapshot";

function filterPositionsForChart(
  positions: BingXNormalizedPosition[],
  chartSymbol: string,
): BingXNormalizedPosition[] {
  return positions.filter(
    (p) =>
      p.side !== "flat" &&
      p.side !== "unknown" &&
      p.quantity > 0 &&
      exchangeSymbolsMatch(p.symbol, chartSymbol),
  );
}

function filterRiskOrdersForChart(
  riskOrders: BingXNormalizedRiskOrder[],
  chartSymbol: string,
): BingXNormalizedRiskOrder[] {
  return riskOrders.filter(
    (r) =>
      exchangeSymbolsMatch(r.symbol, chartSymbol) &&
      (r.triggerPrice ?? r.price) != null &&
      Number.isFinite(r.triggerPrice ?? r.price) &&
      (r.triggerPrice ?? r.price)! > 0,
  );
}

function filterOrdersForChart(
  orders: BingXNormalizedOrder[],
  chartSymbol: string,
  riskOrderIds: Set<string>,
): BingXNormalizedOrder[] {
  return orders.filter((o) => {
    const statusOk = o.status === "open" || o.status === "partially_filled";
    const priceOk = o.price != null && Number.isFinite(o.price) && o.price > 0;
    const symbolOk = exchangeSymbolsMatch(o.symbol, chartSymbol);
    const riskClassification = isRiskChartOrder(o, riskOrderIds);
    const keep = statusOk && priceOk && symbolOk && !riskClassification;
    console.debug("[BINGX_LIMIT_DIAG][frontend-filter]", {
      id: o.id,
      symbol: o.symbol,
      chartSymbol,
      status: o.status,
      type: o.type,
      price: o.price ?? null,
      triggerPrice: o.triggerPrice ?? null,
      statusOk,
      priceOk,
      symbolOk,
      riskClassification,
      keep,
    });
    return keep;
  });
}

async function fetchBingXSnapshot(
  connectionId: string,
  executionSymbol: string,
): Promise<BingXReadOnlySnapshot> {
  const params = new URLSearchParams({
    connectionId,
    symbol: executionSymbol,
  });
  const res = await bingxApiFetch(`/api/bingx/read-only/snapshot?${params}`, {
    method: "GET",
    assertOk: false,
  });
  const json = (await res.json()) as {
    success?: boolean;
    snapshot?: BingXReadOnlySnapshot;
    code?: string;
    message?: string;
  };
  if (!res.ok || !json.success || !json.snapshot) {
    throw new Error(
      bingxReadOnlyErrorMessage(json.code, json.message ?? "Sync failed"),
    );
  }
  return json.snapshot;
}

export function isBingXChartOverlaySession(
  brokerSession: BrokerSessionState | null | undefined,
): boolean {
  if (!brokerSession) return false;
  return isBingXVisualSession(brokerSession);
}

export function useBingXReadOnlyChartData(
  brokerSession: BrokerSessionState | null | undefined,
  chartSymbol?: string,
) {
  const resolvedChartSymbol =
    chartSymbol ?? DEFAULT_CHART_SYMBOL;
  const executionSymbol =
    resolveExecutionSymbolForChart(resolvedChartSymbol) ?? "BTC-USDT";

  const connectionId = brokerSession?.connectionId;
  const queryEnabled =
    isBingXChartOverlaySession(brokerSession) &&
    hasPersistedBingXConnection(brokerSession!);

  const {
    data: snapshot,
    isLoading,
    isError,
    error,
  } = useQuery<BingXReadOnlySnapshot>({
    queryKey: [SNAPSHOT_QUERY_KEY, connectionId, executionSymbol],
    queryFn: () => fetchBingXSnapshot(connectionId!, executionSymbol),
    enabled: queryEnabled,
    refetchInterval: queryEnabled ? 8_000 : false,
    staleTime: 4_000,
    retry: 1,
  });

  const positionsForSymbol = useMemo(
    () => filterPositionsForChart(snapshot?.positions ?? [], resolvedChartSymbol),
    [snapshot?.positions, resolvedChartSymbol],
  );

  const riskOrdersForSymbol = useMemo(
    () => filterRiskOrdersForChart(snapshot?.riskOrders ?? [], resolvedChartSymbol),
    [snapshot?.riskOrders, resolvedChartSymbol],
  );

  const riskOrderIds = useMemo(
    () => new Set(riskOrdersForSymbol.map((r) => r.id)),
    [riskOrdersForSymbol],
  );

  const ordersForSymbol = useMemo(
    () =>
      filterOrdersForChart(
        snapshot?.openOrders ?? [],
        resolvedChartSymbol,
        riskOrderIds,
      ),
    [snapshot?.openOrders, resolvedChartSymbol, riskOrderIds],
  );

  const health = snapshot?.connectionHealth ?? snapshot?.health ?? "healthy";
  const lastSyncTime = snapshot?.lastSyncTime;

  const syncError =
    isError && error instanceof Error
      ? error.message
      : snapshot?.error
        ? bingxReadOnlyErrorMessage(snapshot.error.code, snapshot.error.message)
        : null;

  if (import.meta.env.DEV && queryEnabled) {
    console.debug("[bingx-chart] data", {
      enabled: queryEnabled,
      chartSymbol: resolvedChartSymbol,
      executionSymbol,
      positions: positionsForSymbol.length,
      openOrders: ordersForSymbol.length,
      riskOrders: riskOrdersForSymbol.length,
      totalPositions: snapshot?.positions?.length ?? 0,
      totalOpenOrders: snapshot?.openOrders?.length ?? 0,
    });
    console.debug("[BINGX_LIMIT_DIAG][frontend-snapshot]", {
      chartSymbol: resolvedChartSymbol,
      executionSymbol,
      snapshotOpenOrders: snapshot?.openOrders ?? [],
      ordersForSymbol,
      riskOrdersForSymbol,
      orderSummaries: (snapshot?.openOrders ?? []).map((o) => ({
        id: o.id,
        symbol: o.symbol,
        status: o.status,
        type: o.type,
        price: o.price ?? null,
        triggerPrice: o.triggerPrice ?? null,
      })),
    });
  }

  return {
    bingxActive: isBingXChartOverlaySession(brokerSession),
    snapshot: queryEnabled ? (snapshot ?? null) : null,
    positionsForSymbol,
    ordersForSymbol,
    riskOrdersForSymbol,
    isLoading: queryEnabled && isLoading,
    health,
    lastSyncTime,
    syncError,
    chartSymbol: resolvedChartSymbol,
    executionSymbol,
  };
}
