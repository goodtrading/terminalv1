import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PersistentAuditLogResponse } from "./auditTypes";

export function usePersistentAuditLog(limit = 80) {
  const query = useQuery({
    queryKey: ["/api/system/audit-log", limit],
    queryFn: async () => {
      const res = await apiRequest(
        `/api/system/audit-log?limit=${encodeURIComponent(String(limit))}`,
        { assertOk: false },
      );
      if (!res.ok) {
        throw new Error(`audit-log ${res.status}`);
      }
      return (await res.json()) as PersistentAuditLogResponse;
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
    retry: 1,
  });

  return {
    events: query.data?.success ? query.data.events : [],
    isPersistentAvailable: query.isSuccess && Boolean(query.data?.success),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
