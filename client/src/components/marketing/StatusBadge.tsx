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
  available: "border-emerald-600/30 bg-emerald-500/[0.07] text-emerald-200",
  desktop: "border-white/[0.12] bg-white/[0.04] text-[#c4cad4]",
  soon: "border-white/12 bg-white/[0.04] text-[#9ca3af]",
  limited: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  not_included: "border-red-500/25 bg-red-500/8 text-red-300/90",
  development: "border-white/[0.12] bg-white/[0.04] text-[#a7afb9]",
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
