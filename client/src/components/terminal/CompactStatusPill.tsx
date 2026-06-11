import { cn } from "@/lib/utils";
import { StatusDot, healthToneClass, type HealthTone } from "./health/healthUi";

type CompactStatusPillProps = {
  label: string;
  tone: HealthTone;
  title?: string;
};

export function CompactStatusPill({ label, tone, title }: CompactStatusPillProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-terminal-border/70 bg-terminal-panel/60 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide",
        healthToneClass(tone),
      )}
    >
      <StatusDot tone={tone} />
      {label}
    </span>
  );
}
