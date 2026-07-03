import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import { useTimezonePreference } from "@/hooks/useTimezonePreference";
import { cn } from "@/lib/utils";

type TimezoneSelectorProps = {
  compact?: boolean;
  className?: string;
};

export function TimezoneSelector({ compact = false, className }: TimezoneSelectorProps) {
  const { preference, displayLabel, setPreference } = useTimezonePreference();

  if (compact) {
    return (
      <label
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border border-terminal-border/70 bg-terminal-panel/50 px-2 py-0.5 text-[10px] font-mono",
          className,
        )}
        title="Display timezone (UI only — data stays UTC)"
      >
        <span className="text-terminal-muted uppercase tracking-wide">TZ</span>
        <select
          value={preference}
          onChange={(event) => setPreference(event.target.value as typeof preference)}
          className="bg-transparent text-white font-semibold outline-none cursor-pointer max-w-[5.5rem]"
          aria-label="Timezone"
        >
          {TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id} className="bg-terminal-bg text-white">
              {opt.displayLabel}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded border border-white/10 bg-black/55 px-1 py-0.5 backdrop-blur-sm",
        className,
      )}
      title="Display timezone (UI only — data stays UTC)"
    >
      {TIMEZONE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setPreference(opt.id)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors whitespace-nowrap",
            preference === opt.id
              ? "bg-red-950/70 text-red-300 border border-red-500/40"
              : "text-white/50 hover:text-white/90 border border-transparent hover:bg-white/[0.06]",
          )}
        >
          {opt.displayLabel}
        </button>
      ))}
      <span className="sr-only">Active: {displayLabel}</span>
    </div>
  );
}
