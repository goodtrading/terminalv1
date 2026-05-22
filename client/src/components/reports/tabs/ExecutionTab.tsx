import { useMemo, useState } from "react";
import { ReportBadge } from "../ReportBadge";
import { ExecutionProfile } from "../ExecutionProfile";
import { ReportMetricCard } from "../ReportMetricCard";
import { ReportSection } from "../ReportSection";
import { TradeReviewTable } from "../TradeReviewTable";
import { TerminalValue } from "@/components/terminal/TerminalPanel";
import { TradeEditModal } from "../execution/TradeEditModal";
import { ExecutionDrilldownBanner } from "../ExecutionDrilldownBanner";
import {
  mapTradeToTableRow,
  tradeHighlight,
  useExecutionReportData,
} from "../execution/useExecutionReportData";
import type {
  ExecutionReportSource,
  ExecutionTradeReviewRow,
} from "../execution/executionReportTypes";
import { matchTradeAgainstDrilldown } from "../execution/matchExecutionDrilldownFilter";
import type { ExecutionDrilldownFilter } from "../useReportsDrilldown";
import { useReportsDrilldown } from "../useReportsDrilldown";

const SOURCE_TABS: { id: ExecutionReportSource; label: string }[] = [
  { id: "paper", label: "Paper" },
  { id: "bingx", label: "BingX Real" },
  { id: "all", label: "All" },
];

function downloadCsv(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ExecutionTab({ drilldownFilter }: { drilldownFilter?: ExecutionDrilldownFilter }) {
  const [source, setSource] = useState<ExecutionReportSource>("paper");
  const { data, isLoading, isError } = useExecutionReportData(source, true);
  const [editTrade, setEditTrade] = useState<ExecutionTradeReviewRow | null>(null);
  const { clearDrilldownFilter } = useReportsDrilldown();

  const isPaperOnly = source === "paper";
  const isBingx = source === "bingx";

  const tableRows = useMemo(() => {
    const allRows = (data?.trades ?? []).map((t) => mapTradeToTableRow(t, source));
    
    if (!drilldownFilter) return allRows;
    
    const filtered = allRows.filter((row) => {
      const trade = data?.trades.find((t) => t.id === row.tradeId);
      if (!trade) return false;
      return matchTradeAgainstDrilldown(trade, drilldownFilter);
    });
    
    return filtered;
  }, [data?.trades, source, drilldownFilter]);

  const handleEdit = (tradeId: string) => {
    if (!isPaperOnly) return;
    const trade = data?.trades.find((t) => t.id === tradeId) ?? null;
    setEditTrade(trade);
  };

  if (isLoading && !data) {
    return (
      <section className="flex flex-col gap-5">
        <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wider py-8 text-center">
          Loading execution report…
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
  const diagnostics = data.diagnostics ?? {
    mainIssue: "—",
    bestBehavior: "—",
    warning: undefined,
    riskWarnings: [],
  };
  const score = empty ? null : data.summary.executionQualityScore;
  const grade = empty ? "—" : data.summary.grade;
  const scoreSub =
    data.summary.scoreEstimate && score != null
      ? `Grade ${grade} · read-only estimate`
      : empty
        ? "Grade —"
        : `Grade ${grade}`;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSource(tab.id)}
            className={`rounded border px-3 py-1 text-[9px] font-bold uppercase tracking-wider ${
              source === tab.id
                ? "border-terminal-accent/60 text-white bg-terminal-accent/10"
                : "border-terminal-border text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <header className="flex flex-wrap items-center justify-between gap-2">
        {isBingx ? (
          <div className="flex flex-col gap-0.5">
            <ReportBadge variant="live-data">
              BINGX REAL · READ ONLY · TRADING LOCKED
            </ReportBadge>
            {data.summary.scoreEstimate ? (
              <p className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">
                Read-only estimate
                {data.summary.historyStatus === "unavailable"
                  ? " · history unavailable"
                  : ""}
              </p>
            ) : null}
          </div>
        ) : source === "all" ? (
          <ReportBadge variant="live-data">Paper + BingX</ReportBadge>
        ) : (
          <ReportBadge variant="live-data">Paper · Live</ReportBadge>
        )}
        {isPaperOnly ? (
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
        ) : null}
      </header>
      <ExecutionProfile profile={data.profile} empty={empty} />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ReportMetricCard
          label="Execution Quality Score"
          value={empty ? "— / 100" : `${score}/100`}
          subtext={scoreSub}
          progress={empty ? 0 : (score ?? 0)}
          className="lg:col-span-1"
        />
        <ReportSection title="Execution Diagnostics" className="lg:col-span-2">
          <TerminalValue label="Main Issue" value={diagnostics.mainIssue ?? "—"} />
          <TerminalValue label="Best Behavior" value={diagnostics.bestBehavior ?? "—"} />
          {diagnostics.warning ? (
            <p className="text-[10px] text-amber-400/80 font-mono mt-2 border-l-2 border-amber-500/40 pl-2">
              {diagnostics.warning}
            </p>
          ) : null}
          {(diagnostics.riskWarnings ?? []).map((w) => (
            <p
              key={w}
              className="text-[10px] text-red-400/70 font-mono mt-1 border-l-2 border-red-500/30 pl-2"
            >
              {w}
            </p>
          ))}
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

      {drilldownFilter && (
        <ExecutionDrilldownBanner
          filter={drilldownFilter}
          filteredCount={tableRows.length}
          totalCount={data?.trades.length ?? 0}
          onClear={clearDrilldownFilter}
        />
      )}

      <ReportSection title="Trade Review · Journal" bodyClassName="p-0">
        <TradeReviewTable
          rows={tableRows}
          emptyMessage={
            drilldownFilter && tableRows.length === 0 && !empty
              ? "No trades match this session insight. Some legacy trades may lack captured context."
              : empty
                ? isBingx
                  ? "No BingX position or history for this symbol."
                  : "No paper trades yet."
                : undefined
          }
          onEdit={isPaperOnly ? handleEdit : undefined}
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

      {isPaperOnly ? (
        <TradeEditModal
          trade={editTrade}
          open={editTrade != null}
          onClose={() => setEditTrade(null)}
        />
      ) : null}
    </section>
  );
}
