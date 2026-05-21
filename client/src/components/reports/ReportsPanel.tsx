import { useState } from "react";
import { ReportBadge } from "./ReportBadge";
import { OtherTabsMockBadge, TabMockDataBadge } from "./ReportDataModeBadge";
import { ReportSnapshot } from "./ReportSnapshot";
import { ReportsTabs } from "./ReportsTabs";
import { REPORTS_TABS } from "./reportsMockData";
import { useSessionReportData } from "./session/useSessionReportData";
import type { ReportsTabId } from "./reportsTypes";
import { SessionTab } from "./tabs/SessionTab";
import { ExecutionTab } from "./tabs/ExecutionTab";
import { EdgeTab } from "./tabs/EdgeTab";
import { PlaybookTab } from "./tabs/PlaybookTab";
import { IntelligenceTab } from "./tabs/IntelligenceTab";

const PANEL_MAX_WIDTH = "max-w-[1280px]";

function ReportsTabContent({
  tab,
  sessionReport,
  sessionLoading,
}: {
  tab: ReportsTabId;
  sessionReport: ReturnType<typeof useSessionReportData>["report"];
  sessionLoading: boolean;
}) {
  if (tab === "session") {
    if (sessionLoading && sessionReport.dataMode === "mock") {
      return (
        <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wider py-8 text-center">
          Loading session report…
        </p>
      );
    }
    return <SessionTab report={sessionReport} />;
  }

  switch (tab) {
    case "execution":
      return <ExecutionTab />;
    case "edge":
      return <EdgeTab />;
    case "playbook":
      return <PlaybookTab />;
    case "intelligence":
      return <IntelligenceTab report={sessionReport} />;
    default:
      return <SessionTab report={sessionReport} />;
  }
}

export function ReportsPanel() {
  const [activeTab, setActiveTab] = useState<ReportsTabId>("session");
  const { report: sessionReport, isLoading: sessionLoading } = useSessionReportData();
  const executionLive = activeTab === "execution";

  return (
    <section className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-terminal-bg text-terminal-text">
      <header className="shrink-0 border-b border-terminal-border bg-terminal-panel px-4 py-4 md:px-6 md:py-5">
        <section className={`mx-auto w-full ${PANEL_MAX_WIDTH} flex flex-col gap-3`}>
          <section className="flex flex-wrap items-start justify-between gap-3">
            <section>
              <h1 className="text-base md:text-lg font-bold uppercase tracking-[0.06em] text-white">
                Institutional Reports
              </h1>
              <p className="mt-1 text-[11px] md:text-xs text-slate-500 max-w-xl leading-relaxed">
                Session intelligence, execution quality and playbook performance.
              </p>
            </section>
            <section className="flex flex-wrap items-center gap-2">
              <OtherTabsMockBadge executionLive={executionLive} />
              <ReportBadge variant="phase">Phase 2 / Session Live</ReportBadge>
            </section>
          </section>
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">
            BTCUSDT · Session Report ·{" "}
            {sessionReport.dataMode === "live"
              ? "Terminal State"
              : sessionReport.dataMode === "partial"
                ? "Terminal + Fallback"
                : "Fallback"}
          </p>
        </section>
      </header>

      <section className={`mx-auto w-full ${PANEL_MAX_WIDTH} shrink-0 px-4 md:px-6`}>
        <ReportsTabs tabs={REPORTS_TABS} activeId={activeTab} onChange={setActiveTab} />
      </section>

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-5 md:px-6 md:py-6">
        <section className={`mx-auto w-full ${PANEL_MAX_WIDTH} flex flex-col gap-5`}>
          <ReportSnapshot report={sessionReport} />
          <ReportsTabContent
            tab={activeTab}
            sessionReport={sessionReport}
            sessionLoading={sessionLoading}
          />
        </section>
      </main>
    </section>
  );
}
