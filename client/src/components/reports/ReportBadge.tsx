import { cn } from "@/lib/utils";
import type { ReportBadgeVariant } from "./reportsTypes";

const VARIANT_CLASS: Record<ReportBadgeVariant, string> = {
  mock: "border-terminal-border text-slate-400 bg-[#111]",
  phase: "border-terminal-accent/60 text-terminal-accent bg-terminal-accent/10",
  "live-data": "border-terminal-positive/45 text-terminal-positive bg-terminal-positive/10",
  "partial-data": "border-amber-500/40 text-amber-400 bg-amber-500/10",
  "active-edge": "border-terminal-positive/40 text-terminal-positive bg-terminal-positive/10",
  selective: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  "high-impact": "border-terminal-accent/50 text-terminal-accent bg-terminal-accent/15",
  neutral: "border-terminal-border text-slate-300 bg-[#141414]",
  positive: "border-terminal-positive/40 text-terminal-positive bg-terminal-positive/10",
  negative: "border-terminal-negative/40 text-terminal-negative bg-terminal-negative/10",
};

export function ReportBadge({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: ReportBadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] border",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
