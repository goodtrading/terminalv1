import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradingSettings,
} from "../execution/executionTypes";
import { invalidatePaperQueries } from "../execution/paperQueryKeys";
import { paperApiFetch } from "../execution/paperApiClient";
import {
  BROKER_SESSION_STORAGE_KEY,
  loadBrokerSession,
} from "../execution/brokerSessionState";
import {
  mapApiPaperPosition,
  mapPaperChartOverlay,
  resolvePaperAccountBaseUsdt,
  resolvePaperChartFeeBps,
  type PaperChartFeeSettings,
} from "./paperTradeOverlayHelpers";
import type { PaperChartTradeOverlay } from "./paperTradeOverlayTypes";

function isPaperSessionActive(): boolean {
  const s = loadBrokerSession();
  return s.connectionMode === "paper" && s.connected && s.exchange === "paper";
}

export function usePaperTradeOverlay() {
  const queryClient = useQueryClient();
  const [paperActive, setPaperActive] = useState(isPaperSessionActive);

  useEffect(() => {
    const sync = () => setPaperActive(isPaperSessionActive());
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

  const { data: positionData } = useQuery<{ position: PaperPositionSnapshot | null }>({
    queryKey: ["/api/paper/position"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/position");
      if (!res.ok) throw new Error("Paper position sync failed");
      return res.json() as Promise<{ position: PaperPositionSnapshot | null }>;
    },
    enabled: paperActive,
    refetchInterval: paperActive ? 2500 : false,
    staleTime: 500,
  });

  const { data: accountData } = useQuery<PaperAccountSnapshot>({
    queryKey: ["/api/paper/account"],
    queryFn: async () => {
      const accRes = await paperApiFetch("/api/paper/account");
      if (!accRes.ok) throw new Error("Paper account sync failed");
      return accRes.json() as Promise<PaperAccountSnapshot>;
    },
    enabled: paperActive,
    refetchInterval: paperActive ? 2500 : false,
    staleTime: 500,
  });

  const { data: paperSettings } = useQuery<PaperTradingSettings>({
    queryKey: ["/api/paper/settings"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/settings");
      if (!res.ok) throw new Error("Paper settings failed");
      return res.json() as Promise<PaperTradingSettings>;
    },
    enabled: paperActive,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: ordersData } = useQuery<{ orders: PaperOrderSnapshot[] }>({
    queryKey: ["/api/paper/orders"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/orders");
      if (!res.ok) throw new Error("Paper orders sync failed");
      return res.json() as Promise<{ orders: PaperOrderSnapshot[] }>;
    },
    enabled: paperActive,
    refetchInterval: paperActive ? 2500 : false,
    staleTime: 500,
  });

  const position = useMemo(
    () => mapApiPaperPosition(positionData?.position ?? null),
    [positionData?.position],
  );

  const overlay = mapPaperChartOverlay(position, accountData?.unrealizedPnlUsdt);

  const accountEquityUsdt = useMemo(
    () => resolvePaperAccountBaseUsdt(accountData),
    [accountData],
  );

  const feeSettings: PaperChartFeeSettings = useMemo(
    () => resolvePaperChartFeeBps(paperSettings),
    [paperSettings],
  );

  const openLimitOrders = useMemo(
    () =>
      (ordersData?.orders ?? []).filter(
        (o) =>
          o.status === "open" &&
          o.type === "limit" &&
          o.price != null &&
          Number.isFinite(o.price) &&
          o.price > 0,
      ),
    [ordersData?.orders],
  );

  const invalidatePaper = useCallback(async () => {
    await invalidatePaperQueries(queryClient);
  }, [queryClient]);

  const patchRisk = useCallback(
    async (patch: { stopLoss?: number | null; takeProfit?: number | null }) => {
      const res = await paperApiFetch("/api/paper/position/risk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        code?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.message ?? "Unable to update paper risk");
      }
      return data;
    },
    [],
  );

  return {
    paperActive,
    overlay,
    position,
    accountEquityUsdt,
    feeSettings,
    openLimitOrders,
    patchRisk,
    invalidatePaper,
  };
}
