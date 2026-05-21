import { useMemo, useState } from "react";
import { ReportBadge } from "../ReportBadge";
import { ExecutionProfile } from "../ExecutionProfile";
import { ReportMetricCard } from "../ReportMetricCard";
import { ReportSection } from "../ReportSection";
import { TradeReviewTable } from "../TradeReviewTable";
import { TerminalValue } from "@/components/terminal/TerminalPanel";
import { TradeEditModal } from "../execution/TradeEditModal";
import {
  mapTradeToTableRow,
  tradeHighlight,
  useExecutionReportData,
} from "../execution/useExecutionReportData";
import type { ExecutionTradeReviewRow } from "../execution/executionReportTypes";

function downloadCsv(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ExecutionTab() {
  const { data, isLoading, isError } = useExecutionReportData(true);
  const [editTrade, setEditTrade] = useState<ExecutionTradeReviewRow | null>(null);

  const tableRows = useMemo(
    () => (data?.trades ?? []).map(mapTradeToTableRow),
    [data?.trades],
  );

  const handleEdit = (tradeId: string) => {
    const trade = data?.trades.find((t) => t.id === tradeId) ?? null;
    setEditTrade(trade);
  };

  if (isLoading && !data) {
    return (
      <section className="flex flex-col gap-5">
        <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wider py-8 text-center">
          Loading paper execution report…
        </p>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="flex flex-col gap-5">
        <p className="text-[11px] text-red-400/80 font-mono uppercase tracking-wider py-8 text-center">
          Execution report unavailable. Ensure the server is running.
        </p>
      </section>
    );
  }

  const empty = data.empty;
  const score = empty ? null : data.summary.executionQualityScore;
  const grade = empty ? "—" : data.summary.grade;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <ReportBadge variant="live-data">Paper · Live</ReportBadge>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              downloadCsv("/api/paper/trades/export.csv", "paper-trades.csv")
            }
            className="rounded border border-terminal-border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:border-white/25"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCsv("/api/paper/fills/export.csv", "paper-fills.csv")
            }
            className="rounded border border-terminal-border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:border-white/25"
          >
            Export fills
          </button>
        </div>
      </header>
      <ExecutionProfile profile={data.profile} empty={empty} />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ReportMetricCard
          label="Execution Quality Score"
          value={empty ? "— / 100" : `${score}/100`}
          subtext={empty ? "Grade —" : `Grade ${grade}`}
          progress={empty ? 0 : (score ?? 0)}
          className="lg:col-span-1"
        />
        <ReportSection title="Execution Diagnostics" className="lg:col-span-2">
          <TerminalValue label="Main Issue" value={data.diagnostics.mainIssue} />
          <TerminalValue label="Best Behavior" value={data.diagnostics.bestBehavior} />
          {data.diagnostics.warning ? (
            <p className="text-[10px] text-amber-400/80 font-mono mt-2 border-l-2 border-amber-500/40 pl-2">
              {data.diagnostics.warning}
            </p>
          ) : null}
        </ReportSection>
      </section>

      {!empty ? (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-slate-500">
          <span>
            Trades: <span className="text-slate-300">{data.summary.totalTrades}</span>
          </span>
          <span>
            Realized:{" "}
            <span
              className={
                data.summary.realizedPnlUsdt >= 0
                  ? "text-emerald-400/90"
                  : "text-red-400/90"
              }
            >
              {data.summary.realizedPnlUsdt.toFixed(2)} USDT
            </span>
          </span>
          <span>
            Win rate:{" "}
            <span className="text-slate-300">
              {data.summary.winRate != null ? `${data.summary.winRate}%` : "—"}
            </span>
          </span>
          <span>
            Avg R:{" "}
            <span className="text-slate-300">
              {data.summary.avgR != null
                ? `${data.summary.avgR >= 0 ? "+" : ""}${data.summary.avgR.toFixed(2)}R`
                : "—"}
            </span>
          </span>
        </section>
      ) : null}

      <ReportSection title="Trade Review · Journal" bodyClassName="p-0">
        <TradeReviewTable
          rows={tableRows}
          emptyMessage={empty ? "No paper trades yet." : undefined}
          onEdit={handleEdit}
        />
      </ReportSection>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportSection title="Best Trade">
          <p className="text-[12px] text-slate-300 leading-relaxed">
            {empty ? "No data" : tradeHighlight(data.bestTrade)}
          </p>
        </ReportSection>
        <ReportSection title="Worst Trade">
          <p className="text-[12px] text-slate-400 leading-relaxed border-l-2 border-terminal-accent/50 pl-3">
            {empty ? "No data" : tradeHighlight(data.worstTrade)}
          </p>
        </ReportSection>
      </section>

      <TradeEditModal
        trade={editTrade}
        open={editTrade != null}
        onClose={() => setEditTrade(null)}
      />
    </section>
  );
}
