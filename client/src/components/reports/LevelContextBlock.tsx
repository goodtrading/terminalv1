import type { LevelContext } from "./session/sessionReportTypes";
import { formatReportPrice } from "./session/formatReportValues";

export function LevelContextBlock({
  title,
  ctx,
}: {
  title: string;
  ctx: LevelContext;
}) {
  const displayType = ctx.role === "macro" ? ctx.type : ctx.type;

  return (
    <section className="flex flex-col gap-1.5 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-500/70">
        {title}
      </span>
      <span className="text-sm font-mono font-bold text-white">
        {formatReportPrice(ctx.price)}
      </span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span>
          Type: <span className="text-slate-400">{displayType}</span>
        </span>
        <span>
          Distance: <span className="text-slate-300 font-mono">{ctx.distanceLabel}</span>
        </span>
        {ctx.farMacroStatus ? (
          <span className="col-span-2">
            Status: <span className="text-amber-400/90">{ctx.farMacroStatus}</span>
          </span>
        ) : null}
        <span className="col-span-2">
          Relation: <span className="text-slate-400">{ctx.relation}</span>
        </span>
      </div>
      {ctx.warning ? (
        <p className="text-[10px] leading-snug text-amber-400/85 border border-amber-500/25 bg-amber-950/20 px-2 py-1.5 mt-0.5">
          {ctx.warning}
        </p>
      ) : null}
    </section>
  );
}
