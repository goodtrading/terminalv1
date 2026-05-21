import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  BingXNormalizedOrder,
  BingXNormalizedPosition,
  BingXReadOnlySnapshot,
} from "../execution/executionTypes";
import { bingxApiFetch } from "../execution/bingxApiClient";
import {
  BROKER_SESSION_STORAGE_KEY,
  loadBrokerSession,
} from "../execution/brokerSessionState";
import { bingxReadOnlyErrorMessage } from "../execution/bingxReadOnlyMessages";
import { hasPersistedBingXConnection } from "../execution/bingxSession";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../execution/executionContext";
import { exchangeSymbolsMatch } from "./normalizeExchangeSymbol";

function isBingXReadOnlyChartActive(): boolean {
  const s = loadBrokerSession();
  return (
    s.exchange === "bingx" &&
    s.connectionMode === "read-only" &&
    s.connected &&
    Boolean(s.connectionId)
  );
}

function filterPositionsForChart(
  positions: BingXNormalizedPosition[],
  chartSymbol: string,
): BingXNormalizedPosition[] {
  return positions.filter(
    (p) =>
      p.side !== "flat" &&
      p.quantity > 0 &&
      exchangeSymbolsMatch(p.symbol, chartSymbol),
  );
}

function filterOrdersForChart(
  orders: BingXNormalizedOrder[],
  chartSymbol: string,
): BingXNormalizedOrder[] {
  return orders.filter(
    (o) =>
      (o.status === "open" || o.status === "partially_filled") &&
      o.price != null &&
      Number.isFinite(o.price) &&
      o.price > 0 &&
      exchangeSymbolsMatch(o.symbol, chartSymbol),
  );
}

export function useBingXReadOnlyChartData(chartSymbol?: string) {
  const resolvedChartSymbol =
    chartSymbol ?? DEFAULT_TERMINAL_EXECUTION_CONTEXT.chartSymbol;
  const executionSymbol =
    DEFAULT_TERMINAL_EXECUTION_CONTEXT.executionSymbol ?? "BTC-USDT";

  const [bingxActive, setBingxActive] = useState(isBingXReadOnlyChartActive);

  useEffect(() => {
    const sync = () => setBingxActive(isBingXReadOnlyChartActive());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === BROKER_SESSION_STORAGE_KEY) sync();
    };
    const onCustom = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("goodtrading-broker-session-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("goodtrading-broker-session-changed", onCustom);
    };
  }, []);

  const session = loadBrokerSession();
  const connectionId = session.connectionId;
  const queryEnabled =
    bingxActive &&
    session.exchange === "bingx" &&
    session.connectionMode === "read-only" &&
    Boolean(connectionId) &&
    hasPersistedBingXConnection(session);

  const {
    data: snapshot,
    isLoading,
    isError,
    error,
  } = useQuery<BingXReadOnlySnapshot>({
    queryKey: [
      "/api/bingx/read-only/snapshot",
      connectionId,
      executionSymbol,
      "chart-overlay",
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        connectionId: connectionId!,
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
    },
    enabled: queryEnabled,
    refetchInterval: queryEnabled ? 8_000 : false,
    staleTime: 4_000,
    retry: 1,
  });

  const positionsForSymbol = useMemo(
    () => filterPositionsForChart(snapshot?.positions ?? [], resolvedChartSymbol),
    [snapshot?.positions, resolvedChartSymbol],
  );

  const ordersForSymbol = useMemo(
    () => filterOrdersForChart(snapshot?.openOrders ?? [], resolvedChartSymbol),
    [snapshot?.openOrders, resolvedChartSymbol],
  );

  const health = snapshot?.connectionHealth ?? snapshot?.health ?? "healthy";
  const lastSyncTime = snapshot?.lastSyncTime;

  const syncError =
    isError && error instanceof Error
      ? error.message
      : snapshot?.error
        ? bingxReadOnlyErrorMessage(snapshot.error.code, snapshot.error.message)
        : null;

  return {
    bingxActive,
    snapshot: queryEnabled ? (snapshot ?? null) : null,
    positionsForSymbol,
    ordersForSymbol,
    isLoading: queryEnabled && isLoading,
    health,
    lastSyncTime,
    syncError,
    chartSymbol: resolvedChartSymbol,
    executionSymbol,
  };
}
