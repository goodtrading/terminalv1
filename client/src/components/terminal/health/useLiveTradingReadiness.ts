import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type {
  LiveReadinessApiResponse,
  LiveTradingReadiness,
} from "./liveTradingReadinessTypes";

const REFETCH_MS = 15_000;
const STALE_MS = 8_000;

export function useLiveTradingReadiness(
  enabled: boolean,
  exchange = "bingx",
) {
  const query = useQuery<LiveTradingReadiness | null>({
    queryKey: ["/api/live/readiness", exchange],
    queryFn: async () => {
      const params = new URLSearchParams({ exchange });
      const res = await apiRequest(
        `/api/live/readiness?${params}`,
        { method: "GET", assertOk: false },
      );
      const json = (await res.json()) as LiveReadinessApiResponse;
      if (!res.ok || !json.success || !json.readiness) {
        throw new Error(json.message ?? "Live readiness unavailable");
      }
      return json.readiness;
    },
    enabled,
    refetchInterval: enabled ? REFETCH_MS : false,
    staleTime: STALE_MS,
    retry: 1,
  });

  return {
    readiness: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
