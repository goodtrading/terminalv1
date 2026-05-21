import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../execution/executionContext";
import type { SystemHealthApiResponse, SystemHealthSnapshot } from "./systemHealthTypes";

const REFETCH_MS = 10_000;
const STALE_MS = 6_000;

export function useSystemHealth(enabled = true) {
  const symbol =
    DEFAULT_TERMINAL_EXECUTION_CONTEXT.executionSymbol ?? "BTC-USDT";

  const query = useQuery<SystemHealthSnapshot | null>({
    queryKey: ["/api/system/health", symbol],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol });
      const res = await apiRequest(
        `/api/system/health?${params}`,
        { method: "GET", assertOk: false },
      );
      const json = (await res.json()) as SystemHealthApiResponse;
      if (!res.ok || !json.success || !json.snapshot) {
        throw new Error(json.message ?? "System health unavailable");
      }
      return json.snapshot;
    },
    enabled,
    refetchInterval: enabled ? REFETCH_MS : false,
    staleTime: STALE_MS,
    retry: 1,
  });

  return {
    snapshot: query.data ?? null,
    overall: query.data?.overall,
    riskMirror: query.data?.riskMirror,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
