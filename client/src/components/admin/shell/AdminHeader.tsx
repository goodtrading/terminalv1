import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  onOpenMobileNav?: () => void;
  className?: string;
};

export function AdminHeader({
  title,
  description,
  actions,
  onOpenMobileNav,
  className,
}: AdminHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex flex-wrap items-start justify-between gap-3 border-b border-terminal-border bg-terminal-bg px-4 py-4 md:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {onOpenMobileNav ? (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-terminal-border text-terminal-muted hover:border-terminal-accent/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent lg:hidden"
            aria-label="Abrir menú de administración"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-white md:text-xl">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-terminal-muted md:text-[13px]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
