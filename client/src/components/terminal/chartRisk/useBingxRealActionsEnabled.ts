import { useQuery } from "@tanstack/react-query";

type ExecutionStatusPayload = {
  liveTradingEnabled?: boolean;
  tradingLocked?: boolean;
};

/**
 * Gates real BingX chart actions (close / add SL / add TP).
 * Always false in this build; wired to execution status for future enablement.
 */
export function resolveBingxRealActionsEnabled(
  status?: ExecutionStatusPayload | null,
): boolean {
  void status;
  // Future: env BINGX_ENABLE_LIVE_TRADING, BINGX_ENABLE_API_TRADING, permissions, risk guard
  return false;
}

export function useBingxRealActionsEnabled(): boolean {
  const { data } = useQuery<ExecutionStatusPayload>({
    queryKey: ["/api/execution/status"],
    queryFn: async () => {
      const res = await fetch("/api/execution/status");
      if (!res.ok) return {};
      return (await res.json()) as ExecutionStatusPayload;
    },
    staleTime: 30_000,
    retry: 1,
  });
  return resolveBingxRealActionsEnabled(data);
}
