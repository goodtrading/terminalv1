import type { ReactNode } from "react";
import type {
  ActiveTradingMagnetLevel,
  IntradayDecisionLevel,
  MacroGravityLevel,
} from "./session/sessionReportTypes";
import { formatReportPrice } from "./session/formatReportValues";

function BlockShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-500/70">
        {title}
      </span>
      {children}
    </section>
  );
}

export function IntradayDecisionBlock({ level }: { level: IntradayDecisionLevel }) {
  return (
    <BlockShell title="Intraday Decision Level">
      <span className="text-sm font-mono font-bold text-white">
        {formatReportPrice(level.price)}
      </span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>
          Type: <span className="text-slate-400">{level.type}</span>
        </span>
        <span>
          Distance: <span className="text-slate-300 font-mono">{level.distanceLabel}</span>
        </span>
        <span>
          Relation: <span className="text-slate-400">{level.relation}</span>
        </span>
        <span>
          Status: <span className="text-emerald-400/90">{level.levelStatus}</span>
        </span>
      </div>
    </BlockShell>
  );
}

export function ActiveTradingMagnetBlock({ level }: { level: ActiveTradingMagnetLevel }) {
  return (
    <BlockShell title="Active Trading Magnet">
      <span className="text-sm font-mono font-bold text-white">
        {level.valid ? formatReportPrice(level.price) : "N/A"}
      </span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>
          Type: <span className="text-slate-400">{level.valid ? level.type : "N/A"}</span>
        </span>
        <span>
          Direction: <span className="text-slate-400">{level.direction}</span>
        </span>
        <span>
          Distance: <span className="text-slate-300 font-mono">{level.distanceLabel}</span>
        </span>
        <span>
          Status:{" "}
          <span className={level.valid ? "text-cyan-400/90" : "text-slate-500"}>
            {level.levelStatus}
          </span>
        </span>
        {level.valid ? (
          <span className="col-span-2">
            Condition: <span className="text-slate-400">{level.condition}</span>
          </span>
        ) : null}
      </div>
    </BlockShell>
  );
}

export function MacroGravityBlock({ level }: { level: MacroGravityLevel }) {
  return (
    <BlockShell title="Macro Gravity Level">
      <span className="text-sm font-mono font-bold text-white">
        {formatReportPrice(level.price)}
      </span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>
          Type: <span className="text-slate-400">{level.type}</span>
        </span>
        <span>
          Distance: <span className="text-slate-300 font-mono">{level.distanceLabel}</span>
        </span>
        <span className="col-span-2">
          Status: <span className="text-amber-400/90">{level.levelStatus}</span>
        </span>
      </div>
      {level.warning ? (
        <p className="text-[10px] leading-snug text-amber-400/85 border border-amber-500/25 bg-amber-950/20 px-2 py-1.5 mt-0.5">
          {level.warning}
        </p>
      ) : null}
    </BlockShell>
  );
}
