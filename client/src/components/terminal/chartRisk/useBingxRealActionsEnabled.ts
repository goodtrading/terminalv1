import { useQuery } from "@tanstack/react-query";

/** Shape from GET /api/execution/status (subset for chart gating). */
export type ChartExecutionStatus = {
  liveTradingEnabled?: boolean;
  tradingLocked?: boolean;
  apiTradingEnabled?: boolean;
  riskGuard?: {
    ok?: boolean;
    tradingLocked?: boolean;
  };
};

/**
 * Gates real BingX chart actions (close / add SL / add TP).
 * Always false in this build; structure ready for live enablement.
 */
export function resolveBingxRealActionsEnabled(
  status?: ChartExecutionStatus | null,
): boolean {
  if (!status) return false;

  const bingxLiveTradingEnabled = status.liveTradingEnabled === true;
  const apiTradingEnabled = status.apiTradingEnabled === true;
  const riskGuardOk =
    status.riskGuard?.ok === true ||
    (status.riskGuard?.tradingLocked === false &&
      status.tradingLocked === false);

  void bingxLiveTradingEnabled;
  void apiTradingEnabled;
  void riskGuardOk;

  // Future: return bingxLiveTradingEnabled && apiTradingEnabled && riskGuardOk;
  return false;
}

export function useBingxRealActionsEnabled(): boolean {
  const { data } = useQuery<ChartExecutionStatus>({
    queryKey: ["/api/execution/status"],
    queryFn: async () => {
      const res = await fetch("/api/execution/status");
      if (!res.ok) return {};
      return (await res.json()) as ChartExecutionStatus;
    },
    staleTime: 30_000,
    retry: 1,
  });
  return resolveBingxRealActionsEnabled(data);
}
