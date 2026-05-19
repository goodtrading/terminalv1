import { cn } from "@/lib/utils";

export function ReportQuickStat({
  label,
  value,
  subValue,
  valueClassName,
  subValueClassName,
  className,
  wrapValue = false,
}: {
  label: string;
  value: string;
  subValue?: string | null;
  valueClassName?: string;
  subValueClassName?: string;
  className?: string;
  /** When true, value wraps instead of truncating (Best Edge, Main Risk). */
  wrapValue?: boolean;
}) {
  return (
    <article
      className={cn(
        "border border-terminal-border bg-[#0a0a0a] px-4 py-3 flex flex-col gap-1.5 min-w-0",
        className,
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sky-500/80">
        {label}
      </span>
      <span
        className={cn(
          "text-base md:text-lg font-mono font-bold leading-snug text-white",
          wrapValue ? "whitespace-normal break-words" : "truncate",
          valueClassName,
        )}
      >
        {value}
      </span>
      {subValue ? (
        <span
          className={cn(
            "text-[10px] leading-snug text-sky-400/75 font-mono whitespace-normal break-words",
            subValueClassName,
          )}
        >
          {subValue}
        </span>
      ) : null}
    </article>
  );
}
