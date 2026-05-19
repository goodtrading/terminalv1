import { cn } from "@/lib/utils";

export function ReportMetricCard({
  label,
  value,
  subtext,
  progress,
  positive,
  negative,
  className,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  progress?: number;
  positive?: boolean;
  negative?: boolean;
  className?: string;
}) {
  const pct = progress != null ? Math.max(0, Math.min(100, progress)) : null;

  return (
    <article
      className={cn(
        "border border-terminal-border bg-[#0a0a0a] p-4 flex flex-col gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        className,
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-500/75">
        {label}
      </span>
      <span
        className={cn(
          "text-lg font-mono font-bold leading-none",
          positive && "text-terminal-positive",
          negative && "text-terminal-negative",
          !positive && !negative && "text-white",
        )}
      >
        {value}
      </span>
      {subtext ? (
        <span className="text-[10px] text-slate-500 leading-snug">{subtext}</span>
      ) : null}
      {pct != null ? (
        <div className="w-full h-1.5 border border-terminal-border bg-black mt-1 overflow-hidden">
          <div
            className={cn(
              "h-full",
              negative ? "bg-terminal-negative/80" : "bg-terminal-accent/90",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </article>
  );
}
