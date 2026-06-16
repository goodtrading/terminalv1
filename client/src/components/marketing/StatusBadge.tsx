import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant =
  | "available"
  | "desktop"
  | "soon"
  | "limited"
  | "not_included"
  | "development";

const VARIANTS: Record<StatusBadgeVariant, string> = {
  available: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  desktop: "border-blue-500/35 bg-blue-500/10 text-blue-300",
  soon: "border-white/12 bg-white/[0.04] text-[#9ca3af]",
  limited: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  not_included: "border-red-500/25 bg-red-500/8 text-red-300/90",
  development: "border-violet-500/35 bg-violet-500/10 text-violet-300",
};

export function StatusBadge({
  variant,
  children,
  className,
}: {
  variant: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
