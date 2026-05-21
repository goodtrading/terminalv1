import { cn } from "@/lib/utils";

export type HealthTone = "ok" | "warn" | "error" | "off" | "neutral";

export function healthToneClass(tone: HealthTone): string {
  switch (tone) {
    case "ok":
      return "text-emerald-400";
    case "warn":
      return "text-amber-400";
    case "error":
      return "text-red-400";
    case "off":
      return "text-slate-600";
    default:
      return "text-slate-400";
  }
}

export function StatusDot({ tone }: { tone: HealthTone }) {
  const bg =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "error"
          ? "bg-red-500"
          : "bg-slate-600";
  return <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", bg)} />;
}

export function HealthSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="border border-terminal-border/70 rounded bg-black/25">
      <summary className="cursor-pointer list-none px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300">
        {title}
      </summary>
      <div className="px-2 pb-1.5 space-y-0.5 border-t border-terminal-border/50">{children}</div>
    </details>
  );
}

export function HealthRow({
  label,
  value,
  tone = "neutral",
  mono = true,
}: {
  label: string;
  value: string;
  tone?: HealthTone;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[9px] min-h-[14px]">
      <span className="text-slate-600 shrink-0">{label}</span>
      <span
        className={cn(
          "text-right truncate",
          mono && "font-mono tabular-nums",
          healthToneClass(tone),
        )}
      >
        {value}
      </span>
    </div>
  );
}
