import { MarketRegimeCard } from "../MarketRegimeCard";
import {
  ActiveTradingMagnetBlock,
  IntradayDecisionBlock,
  MacroGravityBlock,
} from "../SessionLevelBlocks";
import { ReportSection } from "../ReportSection";
import { SessionDataModeBadge } from "../ReportDataModeBadge";
import { TerminalValue } from "@/components/terminal/TerminalPanel";
import { formatReportPct, formatReportPrice } from "../session/formatReportValues";
import { SessionExecutionNarrativeSection } from "../session/SessionExecutionNarrativeSection";
import type { SessionReportResult } from "../session/sessionReportTypes";
import type { ExecutionDrilldownFilter } from "../useReportsDrilldown";

const EVENT_BORDER: Record<string, string> = {
  sweep: "border-terminal-accent/50",
  absorption: "border-terminal-positive/40",
  vacuum: "border-amber-500/40",
  magnet: "border-cyan-500/35",
  pull: "border-slate-500/40",
  flip: "border-violet-500/40",
  gamma: "border-orange-500/35",
  structure: "border-slate-400/35",
  generic: "border-terminal-border/60",
};

export function SessionTab({ report, onDrilldown }: { report: SessionReportResult; onDrilldown?: (filter: ExecutionDrilldownFilter) => void }) {
  const { regime, structure, liquidityEvents, resolution, sessionSummary, risks, snapshot } =
    report;
  const h = regime.levelHierarchy;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex justify-end">
        <SessionDataModeBadge mode={report.dataMode} />
      </header>

      <MarketRegimeCard regime={regime} />

      <SessionExecutionNarrativeSection narrative={report.executionNarrative} onDrilldown={onDrilldown} />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReportSection title="Session Summary">
          <TerminalValue label="Session Bias" value={sessionSummary.sessionBias} isBadge />
          <TerminalValue label="Gamma State" value={sessionSummary.gammaState} isBadge />
          <IntradayDecisionBlock level={h.intradayDecision} />
          <ActiveTradingMagnetBlock level={h.activeTrading} />
          <MacroGravityBlock level={h.macroGravity} />
          <TerminalValue
            label="Volatility State"
            value={sessionSummary.volatilityState}
            isBadge
          />
          {snapshot.bestEdgeCondition ? (
            <TerminalValue label="Edge Condition" value={snapshot.bestEdgeCondition} />
          ) : null}
          {snapshot.alternativeEdge ? (
            <TerminalValue label="Alternative Edge" value={snapshot.alternativeEdge} />
          ) : null}
          {risks.secondaryRisk ? (
            <TerminalValue label="Secondary Risk" value={risks.secondaryRisk} />
          ) : null}
        </ReportSection>

        <ReportSection title="Market Structure">
          <section className="grid grid-cols-2 gap-x-4">
            <TerminalValue label="High" value={formatReportPrice(structure.high)} />
            <TerminalValue label="Low" value={formatReportPrice(structure.low)} />
            <TerminalValue label="Open" value={formatReportPrice(structure.open)} />
            <TerminalValue label="Last" value={formatReportPrice(structure.last)} />
          </section>
          <TerminalValue label="Range %" value={formatReportPct(structure.rangePct)} />
          <TerminalValue label="Current Location" value={structure.currentLocation} />
          <TerminalValue label="Market Behavior" value={structure.marketBehavior} />
        </ReportSection>

        <ReportSection title="Liquidity Events">
          <ul className="flex flex-col gap-2.5">
            {liquidityEvents.map((event, i) => (
              <li
                key={`${event.label}-${i}`}
                className={`text-[11px] text-slate-400 leading-snug border-l-2 pl-3 py-1.5 ${
                  EVENT_BORDER[event.type] ?? EVENT_BORDER.generic
                }`}
              >
                {event.label}
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title="Session Resolution" className="lg:col-span-2">
          <p className="text-[12px] leading-relaxed text-slate-300 border border-terminal-border/60 bg-[#0a0a0a] px-4 py-4">
            {resolution}
          </p>
        </ReportSection>
      </section>
    </section>
  );
}
