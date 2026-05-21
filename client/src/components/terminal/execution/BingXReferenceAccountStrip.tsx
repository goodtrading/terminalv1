import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { BingXReadOnlySnapshot } from "./executionTypes";
import { bingxApiFetch } from "./bingxApiClient";
import { bingxReadOnlyErrorMessage } from "./bingxReadOnlyMessages";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "./executionContext";

type Props = {
  connectionId: string;
  symbol?: string;
  /** Hide section chrome when nested (e.g. inside collapsible). */
  compact?: boolean;
};

export function BingXReferenceAccountStrip({
  connectionId,
  symbol = DEFAULT_TERMINAL_EXECUTION_CONTEXT.executionSymbol,
  compact = false,
}: Props) {
  const { data: snapshot, isLoading, isError } = useQuery<BingXReadOnlySnapshot>({
    queryKey: ["/api/bingx/read-only/snapshot", connectionId, symbol, "paper-ref"],
    queryFn: async () => {
      const params = new URLSearchParams({ connectionId, symbol });
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
    refetchInterval: 8_000,
    staleTime: 5_000,
    retry: 1,
  });

  const equity = snapshot?.account?.equityUsdt;
  const avail = snapshot?.account?.availableMarginUsdt;
  const marginUsed = snapshot?.account?.marginUsedUsdt;

  return (
    <section
      className={
        compact
          ? "space-y-0.5"
          : "rounded border border-emerald-500/25 bg-emerald-950/10 p-2 space-y-1"
      }
    >
      {!compact ? (
        <>
          <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/90">
            BingX real account — read only
          </div>
          <p className="text-[8px] text-slate-500 leading-snug">
            Reference balance only. Paper orders do not change this account.
          </p>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] text-slate-500">
        <span>Equity</span>
        <span className="text-right text-slate-200">
          {isLoading ? "…" : isError ? "--" : equity != null ? `${equity.toFixed(2)} USDT` : "--"}
        </span>
        <span>Available margin</span>
        <span className="text-right text-slate-200">
          {isLoading ? "…" : isError ? "--" : avail != null ? `${avail.toFixed(2)} USDT` : "--"}
        </span>
        <span>Margin used</span>
        <span className="text-right text-slate-200">
          {isLoading
            ? "…"
            : isError
              ? "--"
              : marginUsed != null
                ? `${marginUsed.toFixed(2)} USDT`
                : "--"}
        </span>
        <span>Sync</span>
        <span
          className={cn(
            "text-right",
            snapshot?.health === "healthy" && "text-emerald-400/80",
            snapshot?.health === "degraded" && "text-amber-300/80",
            snapshot?.health === "error" && "text-red-400/80",
          )}
        >
          {isLoading ? "…" : (snapshot?.health ?? "--")}
        </span>
      </div>
    </section>
  );
}
