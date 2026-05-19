import { TabMockDataBadge } from "../ReportDataModeBadge";
import { ExecutionProfile } from "../ExecutionProfile";
import { ReportMetricCard } from "../ReportMetricCard";
import { ReportSection } from "../ReportSection";
import { TradeReviewTable } from "../TradeReviewTable";
import { TerminalValue } from "@/components/terminal/TerminalPanel";
import {
  EXECUTION_HIGHLIGHTS,
  EXECUTION_QUALITY,
  MOCK_TRADES,
} from "../reportsMockData";

export function ExecutionTab() {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex justify-end">
        <TabMockDataBadge />
      </header>
      <ExecutionProfile />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ReportMetricCard
          label="Execution Quality Score"
          value={`${EXECUTION_QUALITY.score}/100`}
          subtext={`Grade ${EXECUTION_QUALITY.grade}`}
          progress={EXECUTION_QUALITY.score}
          className="lg:col-span-1"
        />
        <ReportSection title="Execution Diagnostics" className="lg:col-span-2">
          <TerminalValue label="Main Issue" value={EXECUTION_QUALITY.mainIssue} />
          <TerminalValue label="Best Behavior" value={EXECUTION_QUALITY.bestBehavior} />
        </ReportSection>
      </section>

      <ReportSection title="Trade Review" bodyClassName="p-0">
        <TradeReviewTable rows={MOCK_TRADES} />
      </ReportSection>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportSection title="Best Trade">
          <p className="text-[12px] text-slate-300 leading-relaxed">
            {EXECUTION_HIGHLIGHTS.best}
          </p>
        </ReportSection>
        <ReportSection title="Worst Trade">
          <p className="text-[12px] text-slate-400 leading-relaxed border-l-2 border-terminal-accent/50 pl-3">
            {EXECUTION_HIGHLIGHTS.worst}
          </p>
        </ReportSection>
      </section>
    </section>
  );
}
