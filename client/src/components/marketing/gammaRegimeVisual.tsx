import { cn } from "@/lib/utils";

export type GammaRegimeVisual = "long" | "short" | "neutral";

/** Maps display copy to visual regime — styling only, no market logic. */
export function resolveGammaRegimeVisual(value: string): GammaRegimeVisual {
  const normalized = value.toLowerCase();
  if (normalized.includes("short")) return "short";
  if (normalized.includes("long")) return "long";
  return "neutral";
}

const REGIME_STYLES: Record<
  GammaRegimeVisual,
  { text: string; badge: string; dot: string }
> = {
  short: {
    text: "text-red-300",
    badge: "border-red-500/35 bg-red-500/10 text-red-300",
    dot: "bg-red-400/90",
  },
  long: {
    text: "text-emerald-300",
    badge: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400/90",
  },
  neutral: {
    text: "text-amber-300",
    badge: "border-amber-500/35 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400/90",
  },
};

export function getGammaRegimeStyles(value: string) {
  return REGIME_STYLES[resolveGammaRegimeVisual(value)];
}

type GammaRegimeBadgeProps = {
  value: string;
  className?: string;
  showDot?: boolean;
};

/** Premium dark badge for gamma regime in marketing / preview UI. */
export function GammaRegimeBadge({ value, className, showDot = true }: GammaRegimeBadgeProps) {
  const styles = getGammaRegimeStyles(value);

  return (
    <span
      className={cn(
        "mt-0.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
        styles.badge,
        className,
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", styles.dot)} />}
      {value}
    </span>
  );
}
