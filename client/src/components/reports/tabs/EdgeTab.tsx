import { TabMockDataBadge } from "../ReportDataModeBadge";
import { EdgeHealthCard } from "../EdgeHealthCard";
import { ReportMetricCard } from "../ReportMetricCard";
import { ReportSection } from "../ReportSection";
import { TerminalValue } from "@/components/terminal/TerminalPanel";
import { EDGE_DIAGNOSIS, EDGE_METRICS } from "../reportsMockData";

export function EdgeTab() {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex justify-end">
        <TabMockDataBadge />
      </header>
      <EdgeHealthCard />

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {EDGE_METRICS.map((m) => (
          <ReportMetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            progress={m.progress}
            positive={"positive" in m && m.positive}
            negative={"negative" in m && m.negative}
          />
        ))}
      </section>

      <ReportSection title="Edge Diagnosis">
        <TerminalValue label="Strongest Condition" value={EDGE_DIAGNOSIS.strongest} />
        <TerminalValue label="Weakest Condition" value={EDGE_DIAGNOSIS.weakest} />
        <TerminalValue label="Main Improvement" value={EDGE_DIAGNOSIS.improvement} />
      </ReportSection>
    </section>
  );
}
