import { Check, Clock, X } from "lucide-react";
import { MarketingSectionShell } from "./MarketingSectionShell";
import { cn } from "@/lib/utils";

type CellStatus = "available" | "unavailable" | "soon";

type ComparisonRow = {
  feature: string;
  web: CellStatus;
  desktop: CellStatus;
};

const STATUS_LABEL: Record<CellStatus, string> = {
  available: "Disponible",
  unavailable: "No disponible",
  soon: "Próximamente",
};

const ROWS: ComparisonRow[] = [
  { feature: "Gamma Exposure", web: "available", desktop: "available" },
  { feature: "Options Panel", web: "available", desktop: "available" },
  { feature: "Market Structure", web: "available", desktop: "available" },
  { feature: "Escenarios / niveles", web: "available", desktop: "available" },
  { feature: "Zonas gamma integradas al gráfico", web: "available", desktop: "available" },
  { feature: "Temporalidades 15s / 1m / 5m / 15m", web: "available", desktop: "available" },
  { feature: "Temporalidades 1h / 4h / D", web: "unavailable", desktop: "soon" },
  { feature: "Order Flow básico", web: "available", desktop: "available" },
  { feature: "Bookmap / Heatmap avanzado", web: "unavailable", desktop: "available" },
  { feature: "DOM avanzado", web: "unavailable", desktop: "available" },
  { feature: "Modo Pro", web: "unavailable", desktop: "available" },
  { feature: "Procesamiento local", web: "unavailable", desktop: "available" },
  { feature: "Footprint", web: "unavailable", desktop: "soon" },
  {
    feature: "Multi-activos: ETH / NASDAQ / SPX / XAUUSD",
    web: "unavailable",
    desktop: "soon",
  },
];

function StatusIcon({ status, className }: { status: CellStatus; className?: string }) {
  const label = STATUS_LABEL[status];
  const base = cn("inline-flex h-8 w-8 items-center justify-center rounded-full", className);

  if (status === "available") {
    return (
      <span className={base} title={label} aria-label={label}>
        <Check className="h-5 w-5 text-emerald-400" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <span className={base} title={label} aria-label={label}>
        <X className="h-5 w-5 text-red-400/90" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return (
    <span className={base} title={label} aria-label={label}>
      <Clock className="h-5 w-5 text-amber-300/90" strokeWidth={2} aria-hidden />
    </span>
  );
}

function ComparisonLegend() {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#9ca3af]">
      <span className="inline-flex items-center gap-2">
        <StatusIcon status="available" />
        Disponible
      </span>
      <span className="inline-flex items-center gap-2">
        <StatusIcon status="unavailable" />
        No disponible
      </span>
      <span className="inline-flex items-center gap-2">
        <StatusIcon status="soon" />
        Próximamente
      </span>
    </div>
  );
}

function MobileRow({ row }: { row: ComparisonRow }) {
  return (
    <article className="rounded-[16px] border border-white/[0.08] bg-[#050505]/70 p-4">
      <h3 className="font-medium text-white">{row.feature}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-[#6b7280]">Terminal Web</p>
          <StatusIcon status={row.web} />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-[#6b7280]">App Desktop</p>
          <StatusIcon status={row.desktop} />
        </div>
      </div>
    </article>
  );
}

export function ComparisonTable() {
  return (
    <MarketingSectionShell
      id="comparativa"
      className="py-16 sm:py-20"
      title="Compará Terminal Web vs App Desktop"
      subtitle="La versión web está optimizada para acceso inmediato. La App Desktop está pensada para módulos pesados, Bookmap avanzado y procesamiento local."
    >
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-[20px] border border-white/[0.08] lg:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] bg-[#050505]/90">
              <th className="px-6 py-4 text-left font-semibold text-[#9ca3af]">Función</th>
              <th className="px-6 py-4 text-center font-semibold text-white">Terminal Web</th>
              <th className="px-6 py-4 text-center font-semibold text-white">App Desktop</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr
                key={row.feature}
                className={i % 2 === 0 ? "bg-[#050505]/40" : "bg-[#030303]/40"}
              >
                <td className="px-6 py-3.5 font-medium text-[#e5e7eb]">{row.feature}</td>
                <td className="px-6 py-3.5 text-center">
                  <StatusIcon status={row.web} />
                </td>
                <td className="px-6 py-3.5 text-center">
                  <StatusIcon status={row.desktop} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {ROWS.map((row) => (
          <MobileRow key={row.feature} row={row} />
        ))}
      </div>

      <ComparisonLegend />

      <p className="mt-4 text-sm text-[#6b7280]">
        Bookmap avanzado, Modo Pro, DOM avanzado y procesamiento local son exclusivos de la App
        Desktop. Footprint y multi-activos llegarán primero en desktop.
      </p>
    </MarketingSectionShell>
  );
}
