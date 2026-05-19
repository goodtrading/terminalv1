import { cn } from "@/lib/utils";

const segmentBtn =
  "px-2 py-0.5 text-[10px] font-mono border rounded border-terminal-border text-terminal-muted hover:text-white transition-colors";

export function BookmapToolbarDivider() {
  return <span className="w-px h-4 bg-terminal-border/50 shrink-0 mx-0.5" aria-hidden />;
}

export function BookmapSegmentGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 shrink-0", className)}>
      {label != null && (
        <span className="text-[10px] font-mono text-terminal-muted mr-0.5">{label}</span>
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            segmentBtn,
            value === opt.value && "border-cyan-400/60 bg-cyan-950/40 text-cyan-100",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function BookmapToggleButton({
  label,
  active,
  onClick,
  activeClassName,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClassName?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        segmentBtn,
        active && (activeClassName ?? "border-cyan-400/60 bg-cyan-950/40 text-cyan-100"),
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {label}
    </button>
  );
}

export const bookmapToolbarBtnClass = segmentBtn;
