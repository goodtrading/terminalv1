import type { QueryClient } from "@tanstack/react-query";

/** React Query keys invalidated after paper order / risk / close actions */
export const PAPER_INVALIDATE_KEYS = [
  "/api/paper/account",
  "/api/paper/settings",
  "/api/paper/orders",
  "/api/paper/position",
  "/api/paper/logs",
  "/api/paper/fills",
  "/api/paper/trades",
  "/api/reports/execution",
] as const;

export async function invalidatePaperQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    PAPER_INVALIDATE_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}
