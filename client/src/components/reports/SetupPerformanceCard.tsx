import { cn } from "@/lib/utils";
import { ReportBadge } from "./ReportBadge";
import type { SetupPerformance } from "./reportsTypes";

function statusVariant(
  status: SetupPerformance["status"],
): "active-edge" | "selective" | "high-impact" {
  switch (status) {
    case "Active Edge":
      return "active-edge";
    case "Selective":
      return "selective";
    case "High Impact":
      return "high-impact";
  }
}

export function SetupPerformanceCard({ setup }: { setup: SetupPerformance }) {
  return (
    <article className="border border-terminal-border bg-[#0a0a0a] flex flex-col overflow-hidden hover:border-white/10 transition-colors">
      <header className="px-4 py-3 border-b border-terminal-border bg-[#0c0c0c] flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-white truncate">
            {setup.name}
          </h4>
          <span className="text-[9px] font-mono text-sky-500/80 uppercase tracking-wider">
            Setup Grade ·{" "}
            <span className="text-white font-bold">{setup.grade}</span>
          </span>
        </div>
        <ReportBadge variant={statusVariant(setup.status)}>{setup.status}</ReportBadge>
      </header>

      <section className="px-4 py-4 flex flex-col gap-4">
        <section className="grid grid-cols-3 gap-3">
          <Metric label="Trades" value={String(setup.trades)} />
          <Metric label="Winrate" value={`${setup.winrate}%`} highlight />
          <Metric label="Avg R" value={setup.avgR} positive />
        </section>
        <div className="h-1 border border-terminal-border bg-black overflow-hidden">
          <div
            className="h-full bg-terminal-accent/75"
            style={{ width: `${Math.min(100, setup.winrate)}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">
            Best condition ·{" "}
          </span>
          {setup.bestCondition}
        </p>
      </section>

      <footer className="px-4 py-3 border-t border-terminal-border/80 bg-black/30">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Execution Rule
          </span>
          {setup.executionRule}
        </p>
      </footer>
    </article>
  );
}

function Metric({
  label,
  value,
  highlight,
  positive,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div>
      <span className="block text-[8px] uppercase tracking-wider text-sky-600/70">{label}</span>
      <span
        className={cn(
          "text-sm font-mono font-bold",
          positive && "text-terminal-positive",
          highlight && !positive && "text-terminal-accent",
          !highlight && !positive && "text-slate-200",
        )}
      >
        {value}
      </span>
    </div>
  );
}
