import { ReportSection } from "../ReportSection";
import { SessionDataModeBadge, TabMockDataBadge } from "../ReportDataModeBadge";
import type { SessionReportResult } from "../session/sessionReportTypes";

function IntelPanel({
  title,
  children,
  variant = "default",
}: {
  title: string;
  children: React.ReactNode;
  variant?: "default" | "positive" | "risk";
}) {
  const borderClass =
    variant === "positive"
      ? "border-terminal-positive/35 bg-[#060a08]"
      : variant === "risk"
        ? "border-terminal-accent/35 bg-[#0c0808]"
        : "border-terminal-border bg-[#0a0a0a]";

  return (
    <article className={`border px-4 py-4 md:px-5 md:py-5 flex flex-col gap-3 ${borderClass}`}>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </h3>
      {children}
    </article>
  );
}

export function IntelligenceTab({ report }: { report: SessionReportResult }) {
  const intel = report.intelligence;
  const narrativeLive = intel.usesLiveData && report.dataMode !== "mock";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          {narrativeLive
            ? "Narrative from live session levels"
            : "Mock fallback or partial — no stale hardcoded prices"}
        </span>
        {narrativeLive ? (
          <SessionDataModeBadge mode={report.dataMode} />
        ) : (
          <TabMockDataBadge />
        )}
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-4 w-full">
        <section className="flex flex-col gap-4 min-w-0">
          <IntelPanel title="What happened today?">
            <p className="text-[12px] md:text-[13px] leading-relaxed text-slate-300">
              {intel.whatHappened}
            </p>
          </IntelPanel>

          <IntelPanel title="Why it happened">
            <ul className="flex flex-col gap-2.5">
              {intel.whyHappened.map((item) => (
                <li
                  key={item}
                  className="text-[11px] text-slate-400 leading-snug pl-3 border-l border-terminal-border/80"
                >
                  {item}
                </li>
              ))}
            </ul>
          </IntelPanel>

          <IntelPanel title="Main Risk For Next Session" variant="risk">
            <p className="text-[12px] leading-relaxed text-slate-300">{intel.mainRisk}</p>
          </IntelPanel>
        </section>

        <section className="flex flex-col gap-4 min-w-0">
          <IntelPanel title="Best Opportunity" variant="positive">
            <p className="text-[12px] font-mono font-semibold text-terminal-positive leading-relaxed">
              {intel.bestOpportunity}
            </p>
          </IntelPanel>

          <ReportSection title="Tomorrow Focus" bodyClassName="gap-2.5">
            <ul className="flex flex-col gap-2">
              {intel.tomorrowFocus.map((item) => (
                <li
                  key={item}
                  className="text-[11px] text-slate-400 px-3 py-2.5 border border-terminal-border bg-black/50"
                >
                  {item}
                </li>
              ))}
            </ul>
          </ReportSection>

          <IntelPanel title="Institutional Takeaway">
            <p className="text-[11px] leading-relaxed text-slate-400 italic">
              {intel.institutionalTakeaway}
            </p>
          </IntelPanel>
        </section>
      </section>
    </section>
  );
}
