import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionExecutionNarrative } from "../execution/executionReportTypes";
import type { ExecutionDrilldownFilter } from "../useReportsDrilldown";

function severityBorder(
  s: SessionExecutionNarrative["dominantBehavior"]["severity"],
): string {
  if (s === "positive") return "border-emerald-900/40 text-emerald-400/90";
  if (s === "warning") return "border-amber-900/40 text-amber-400/90";
  if (s === "danger") return "border-red-900/40 text-red-400/90";
  return "border-cyan-900/30 text-cyan-400/80";
}

function impactClass(impact: "low" | "medium" | "high"): string {
  if (impact === "high") return "text-red-400/80";
  if (impact === "medium") return "text-amber-400/80";
  return "text-slate-500";
}

export function SessionExecutionNarrativeSection({
  narrative,
  onDrilldown,
}: {
  narrative: SessionExecutionNarrative | null | undefined;
  onDrilldown?: (filter: ExecutionDrilldownFilter) => void;
}) {
  if (!narrative || narrative.status === "unavailable") {
    return (
      <ReportSectionShell>
        <p className="text-[10px] font-mono text-slate-600">
          {narrative?.summary ?? "Session narrative unavailable — no execution trades."}
        </p>
      </ReportSectionShell>
    );
  }

  const { dominantBehavior: dom } = narrative;

  return (
    <ReportSectionShell>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Session narrative
        </span>
        <span
          className={cn(
            "text-[8px] uppercase tracking-wider px-1 py-0.5 rounded border",
            narrative.status === "available"
              ? "text-emerald-500/70 border-emerald-900/40"
              : "text-amber-500/70 border-amber-900/40",
          )}
        >
          {narrative.status} · {narrative.source}
        </span>
      </div>

      <p className="text-[11px] text-slate-300 leading-relaxed border-l-2 border-terminal-accent/40 pl-3 mb-3">
        {narrative.summary}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <BehaviorCard
          label="Dominant"
          title={dom.title}
          description={dom.description}
          className={severityBorder(dom.severity)}
        />
        <BehaviorCard
          label="Best"
          title={narrative.bestBehavior.title}
          description={narrative.bestBehavior.description}
          className="border-emerald-900/30 text-emerald-400/80"
        />
        <BehaviorCard
          label="Worst"
          title={narrative.worstBehavior.title}
          description={narrative.worstBehavior.description}
          className="border-red-900/30 text-red-400/80"
        />
      </div>

      {narrative.playbookStats.length > 0 ? (
        <div className="mb-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-600 mb-1">
            Playbook stats
          </p>
          <ul className="space-y-1">
            {narrative.playbookStats.slice(0, 6).map((pb) => (
              <li
                key={pb.playbookId}
                className={cn(
                  "text-[10px] font-mono text-slate-400 flex flex-wrap gap-x-2 items-center",
                  onDrilldown && "cursor-pointer hover:text-slate-200"
                )}
                onClick={() => {
                  if (onDrilldown) {
                    onDrilldown({
                      type: "playbook",
                      playbookId: pb.playbookId,
                      label: pb.name,
                    });
                  }
                }}
              >
                <span className="text-slate-300">{pb.name}</span>
                <span>×{pb.count}</span>
                {pb.avgConfidence != null ? (
                  <span>{pb.avgConfidence}% conf</span>
                ) : null}
                {pb.winRate != null ? <span>WR {pb.winRate}%</span> : null}
                {pb.avgPnlUsdt != null ? (
                  <span>PnL {pb.avgPnlUsdt >= 0 ? "+" : ""}{pb.avgPnlUsdt}</span>
                ) : null}
                {onDrilldown ? (
                  <span className="text-[8px] uppercase tracking-wider text-cyan-500/70 ml-1">
                    VIEW TRADES
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {narrative.repeatedMistakes.length > 0 ? (
        <div className="mb-3">
          <p className="text-[9px] uppercase tracking-wider text-slate-600 mb-1">
            Repeated mistakes
          </p>
          <ul className="space-y-0.5">
            {narrative.repeatedMistakes.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "text-[10px] font-mono flex flex-wrap gap-x-2 items-center",
                  impactClass(m.impact),
                  onDrilldown && "cursor-pointer hover:opacity-80"
                )}
                onClick={() => {
                  if (onDrilldown) {
                    onDrilldown({
                      type: "mistake",
                      mistakeId: m.id,
                      label: m.label,
                    });
                  }
                }}
              >
                <span>{m.label}</span>
                <span>· {m.count}×</span>
                {onDrilldown ? (
                  <span className="text-[8px] uppercase tracking-wider text-cyan-500/70 ml-1">
                    VIEW TRADES
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {narrative.positives.length > 0 ? (
        <div className="mb-2">
          <p className="text-[9px] uppercase tracking-wider text-emerald-600/70 mb-0.5">
            Positives
          </p>
          <ul className="text-[10px] text-slate-400 list-disc pl-4 space-y-0.5">
            {narrative.positives.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {narrative.warnings.length > 0 ? (
        <div className="mb-2">
          <p className="text-[9px] uppercase tracking-wider text-amber-600/70 mb-0.5">
            Warnings
          </p>
          <ul className="text-[10px] text-amber-400/70 list-disc pl-4 space-y-0.5">
            {narrative.warnings.map((w) => (
              <li
                key={w}
                className={cn(
                  onDrilldown && "cursor-pointer hover:text-amber-300/80"
                )}
                onClick={() => {
                  if (onDrilldown) {
                    const mistakeId = w.toLowerCase().replace(/\s+/g, "_");
                    onDrilldown({
                      type: "mistake",
                      mistakeId,
                      label: w,
                    });
                  }
                }}
              >
                <span>{w}</span>
                {onDrilldown ? (
                  <span className="text-[8px] uppercase tracking-wider text-cyan-500/70 ml-2">
                    VIEW TRADES
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {narrative.nextSessionFocus.length > 0 ? (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-cyan-600/70 mb-1">
            Next session focus
          </p>
          <ol className="text-[10px] text-slate-400 list-decimal pl-4 space-y-0.5">
            {narrative.nextSessionFocus.map((f) => {
              const isConfidenceRelated = f.toLowerCase().includes("confidence");
              return (
                <li
                  key={f}
                  className={cn(
                    isConfidenceRelated && onDrilldown && "cursor-pointer hover:text-slate-200"
                  )}
                  onClick={() => {
                    if (onDrilldown && isConfidenceRelated) {
                      onDrilldown({
                        type: "mistake",
                        mistakeId: "low_confidence_entries",
                        label: "Low-confidence entries",
                      });
                    }
                  }}
                >
                  <span>{f}</span>
                  {isConfidenceRelated && onDrilldown ? (
                    <span className="text-[8px] uppercase tracking-wider text-cyan-500/70 ml-2">
                      VIEW TRADES
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </ReportSectionShell>
  );
}

function ReportSectionShell({ children }: { children: ReactNode }) {
  return (
    <section className="border border-terminal-border/60 bg-[#0a0a0a] px-4 py-3">
      {children}
    </section>
  );
}

function BehaviorCard({
  label,
  title,
  description,
  className,
}: {
  label: string;
  title: string;
  description: string;
  className: string;
}) {
  return (
    <div className={cn("border rounded px-2 py-2 bg-black/40", className)}>
      <p className="text-[8px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-[11px] font-mono font-medium mt-0.5">{title}</p>
      <p className="text-[10px] opacity-80 mt-0.5 leading-snug">{description}</p>
    </div>
  );
}
