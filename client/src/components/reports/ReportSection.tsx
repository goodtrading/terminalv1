import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function ReportSection({
  title,
  children,
  className,
  bodyClassName,
  headerExtra,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border border-terminal-border bg-terminal-panel flex flex-col min-h-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        className,
      )}
    >
      <header className="px-4 py-2.5 border-b border-terminal-border shrink-0 flex items-center justify-between gap-2 bg-[#0c0c0c]">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">
          {title}
        </h3>
        {headerExtra}
      </header>
      <div className={cn("p-4 flex flex-col gap-3 flex-1 min-h-0", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
