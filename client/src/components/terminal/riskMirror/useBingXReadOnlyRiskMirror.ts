import { useQuery } from "@tanstack/react-query";
import { bingxApiFetch } from "../execution/bingxApiClient";
import { hasPersistedBingXConnection, isBingXReadOnlySession } from "../execution/bingxSession";
import { useBrokerSession } from "../execution/useBrokerSession";
import type { ReadOnlyRiskMirrorSnapshot } from "./riskMirrorTypes";

const REFETCH_MS = 6_000;
const STALE_MS = 3_000;

export function useBingXReadOnlyRiskMirror(symbol: string) {
  const { session } = useBrokerSession();
  const readOnlyActive = isBingXReadOnlySession(session);
  const connectionId = session.connectionId;
  const canFetch =
    readOnlyActive && hasPersistedBingXConnection(session) && Boolean(connectionId);

  const query = useQuery<ReadOnlyRiskMirrorSnapshot>({
    queryKey: ["/api/risk-mirror/bingx", connectionId, symbol],
    queryFn: async () => {
      const params = new URLSearchParams({
        connectionId: connectionId!,
        symbol,
      });
      const res = await bingxApiFetch(`/api/risk-mirror/bingx?${params}`, {
        method: "GET",
        assertOk: false,
      });
      const json = (await res.json()) as {
        success?: boolean;
        snapshot?: ReadOnlyRiskMirrorSnapshot;
        message?: string;
      };
      if (!res.ok || !json.success || !json.snapshot) {
        throw new Error(json.message ?? "Risk mirror unavailable");
      }
      return json.snapshot;
    },
    enabled: canFetch,
    refetchInterval: canFetch ? REFETCH_MS : false,
    staleTime: STALE_MS,
    retry: 1,
  });

  return {
    ...query,
    enabled: canFetch,
    readOnlyActive,
    isEmpty: canFetch && !query.isLoading && !query.data?.position,
    snapshot: query.data,
  };
}
