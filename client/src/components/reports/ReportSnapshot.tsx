import { SessionDataModeBadge } from "./ReportDataModeBadge";
import { ReportQuickStat } from "./ReportQuickStat";
import {
  formatReportPrice,
  formatSessionQuality,
} from "./session/formatReportValues";
import type { SessionReportResult } from "./session/sessionReportTypes";

function formatEdgeSubvalue(condition: string | null | undefined): string | null {
  if (!condition?.trim()) return null;
  const c = condition.trim();
  if (c.toLowerCase().startsWith("requires ")) {
    return `Condition: ${c}`;
  }
  if (c.toLowerCase().startsWith("trigger:")) {
    return c;
  }
  return `Condition: ${c}`;
}

/**
 * Report Snapshot always reads from `report.snapshot` (built by buildReportSnapshot).
 * All tabs share the same session report object from useSessionReportData().
 */
export function ReportSnapshot({ report }: { report: SessionReportResult }) {
  const { snapshot } = report;

  const spotLabel =
    report.spot != null ? ` · Spot ${formatReportPrice(report.spot)}` : "";

  const edgeSub = formatEdgeSubvalue(snapshot.bestEdgeCondition);

  return (
    <section className="flex flex-col gap-2">
      <header className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Report Snapshot
          {spotLabel ? (
            <span className="text-slate-600 font-mono normal-case tracking-normal">
              {spotLabel}
            </span>
          ) : null}
        </h2>
        <SessionDataModeBadge mode={report.dataMode} />
      </header>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <ReportQuickStat
          label="Session Quality"
          value={formatSessionQuality(snapshot.sessionQuality)}
        />
        <ReportQuickStat label="Market Clarity" value={snapshot.marketClarity} />
        <ReportQuickStat
          label="Best Edge"
          value={snapshot.bestEdge}
          subValue={edgeSub}
          wrapValue
          valueClassName="text-sm md:text-[15px]"
        />
        <ReportQuickStat
          label="Main Risk"
          value={snapshot.mainRisk}
          wrapValue
          valueClassName="text-terminal-accent text-sm md:text-base"
        />
      </section>
    </section>
  );
}
