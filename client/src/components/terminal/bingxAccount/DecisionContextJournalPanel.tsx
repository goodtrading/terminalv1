import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { bingxApiFetch } from "../execution/bingxApiClient";
import {
  DECISION_CONTEXT_UI_BADGES,
  type TradeDecision,
} from "@shared/goodTradingAiDecisionContext";

type ListResponse = {
  success?: boolean;
  decisions?: TradeDecision[];
  badges?: string[];
  storageHealth?: string;
  mentorEligible?: boolean;
  learning?: boolean;
  code?: string;
  message?: string;
};

type StatusResponse = {
  success?: boolean;
  enabled?: boolean;
  storageHealth?: string;
  badges?: string[];
};

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider",
        tone ?? "border-slate-500/40 text-slate-300",
      )}
    >
      {children}
    </span>
  );
}

function storageTone(status: string | undefined): string {
  if (status === "DURABLE_READY") return "border-emerald-500/40 text-emerald-300";
  if (status === "RECORDER_DISABLED") return "border-slate-500/40 text-slate-400";
  if (status === "UNSAFE_MEMORY" || status === "UNAVAILABLE") {
    return "border-red-500/40 text-red-300";
  }
  if (status === "DEGRADED") return "border-amber-500/40 text-amber-300";
  return "border-slate-500/40 text-slate-300";
}

export type DecisionContextJournalPanelProps = {
  connectionId: string | null | undefined;
};

/**
 * AI-8.1.1 diagnostic panel — journal + timeline + storage health.
 * READ ONLY / NOT CONNECTED TO AI. No trading buttons.
 */
export function DecisionContextJournalPanel({
  connectionId,
}: DecisionContextJournalPanelProps) {
  const statusQuery = useQuery({
    queryKey: ["/api/account/decision-context/status"],
    queryFn: async () => {
      const res = await bingxApiFetch(`/api/account/decision-context/status`, {
        method: "GET",
        assertOk: false,
      });
      return (await res.json()) as StatusResponse;
    },
    staleTime: 30_000,
  });

  const query = useQuery({
    queryKey: ["/api/account/decision-context/decisions", connectionId],
    enabled: Boolean(connectionId) && statusQuery.data?.enabled !== false,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "10" });
      if (connectionId) params.set("connectionId", connectionId);
      const res = await bingxApiFetch(
        `/api/account/decision-context/decisions?${params}`,
        { method: "GET", assertOk: false },
      );
      return (await res.json()) as ListResponse;
    },
    staleTime: 20_000,
  });

  const decisions = query.data?.decisions ?? [];
  const storageHealth =
    query.data?.storageHealth ??
    statusQuery.data?.storageHealth ??
    "RECORDER_DISABLED";
  const badges = [
    ...(query.data?.badges ??
      statusQuery.data?.badges ?? [...DECISION_CONTEXT_UI_BADGES]),
  ];
  if (!badges.includes(storageHealth)) badges.push(storageHealth);

  return (
    <section className="rounded border border-terminal-border/70 bg-terminal-bg/40 p-2 text-[10px] text-slate-200">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          Decision journal
        </span>
        {badges.map((b) => (
          <Badge
            key={b}
            tone={
              b.includes("AI")
                ? "border-amber-500/40 text-amber-300"
                : b === storageHealth
                  ? storageTone(b)
                  : "border-cyan-500/40 text-cyan-300"
            }
          >
            {b}
          </Badge>
        ))}
      </div>

      {statusQuery.data?.enabled === false && (
        <div className="mb-1 text-slate-500">
          Recorder disabled (RECORDER_DISABLED). No capture.
        </div>
      )}

      {!connectionId && (
        <div className="text-slate-500">Connect BingX to view recorded decisions.</div>
      )}

      {query.isError && (
        <div className="text-red-300">
          {(query.error as Error)?.message ?? "Load error"}
        </div>
      )}

      {query.data?.code === "DECISION_CONTEXT_DISABLED" && (
        <div className="text-slate-500">{query.data.message}</div>
      )}

      {connectionId &&
        statusQuery.data?.enabled !== false &&
        !query.isLoading &&
        decisions.length === 0 && (
          <div className="text-slate-500">
            No TradeDecisions recorded yet. Position open/increase/reduce/close events
            freeze context automatically.
          </div>
        )}

      <ul className="max-h-56 space-y-2 overflow-y-auto">
        {decisions.map((d) => (
          <li
            key={d.decisionId}
            className="rounded border border-terminal-border/50 p-1.5 font-mono text-[9px]"
          >
            <div className="flex flex-wrap gap-2 text-slate-300">
              <span>{d.symbol}</span>
              <span className="uppercase text-slate-500">
                {d.positionSide ?? "unknown"}
              </span>
              <span className="uppercase text-slate-500">{d.status}</span>
              <span className="text-slate-500">{d.accountMode}</span>
            </div>
            <div className="mt-1 text-slate-500">
              id {d.decisionId.slice(0, 8)}… · ms{" "}
              {d.context.marketSnapshotId ?? "null"} · dg{" "}
              {d.context.decisionGraphId ?? "null"} · freshness{" "}
              {d.context.decisionState.dataFreshness}
            </div>
            <div className="mt-1 text-slate-400">
              Hypothesis: {d.journal.initialHypothesis ?? "—"}
            </div>
            <div className="text-slate-500">
              Confirmations:{" "}
              {d.journal.confirmationsPresent.length
                ? d.journal.confirmationsPresent.join("; ")
                : "—"}
            </div>
            <div className="text-slate-500">
              Invalidations:{" "}
              {d.journal.invalidationsPresent.length
                ? d.journal.invalidationsPresent.join("; ")
                : "—"}
            </div>
            <div className="mt-1 text-slate-400">Timeline</div>
            <ul className="space-y-0.5">
              {d.timeline.map((t) => (
                <li key={t.eventId}>
                  <span className="text-cyan-300/80">{t.type}</span> — {t.summary}
                </li>
              ))}
            </ul>
            {d.journal.howItEnded && (
              <div className="mt-1 text-slate-400">
                Ended: {d.journal.howItEnded}
                {d.journal.durationMs != null
                  ? ` · ${Math.round(d.journal.durationMs / 1000)}s`
                  : ""}
                {d.journal.observedPnl != null
                  ? ` · PnL ${d.journal.observedPnl}`
                  : ""}
              </div>
            )}
            {d.journal.changesDuringTrade.length > 0 && (
              <div className="mt-1 text-slate-500">
                Changes: {d.journal.changesDuringTrade.slice(-3).join(" · ")}
              </div>
            )}
          </li>
        ))}
      </ul>
      {/* No Buy / Sell / Cancel / Apply — diagnostic only */}
    </section>
  );
}
