import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MarketingSectionShell({
  title,
  subtitle,
  children,
  className,
  id,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      <div className="mb-10 max-w-3xl">
        <h2 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h2>
        {subtitle && (
          <p className="mt-4 text-base leading-relaxed text-[#9ca3af] sm:text-lg">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}
