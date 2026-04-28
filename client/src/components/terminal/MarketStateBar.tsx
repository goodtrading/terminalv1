import { useMemo, useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMobileTerminalState } from "@/hooks/useMobileTerminalState";
import type { StructuralScenariosPayload } from "@/lib/marketStateSummary";
import {
  sanitizeZoneForDisplay,
  sanitizeSetupForDisplay,
  sanitizeZonesLineFromRows,
} from "@/lib/pushDisplaySanitize";
import { cn } from "@/lib/utils";

type Props = {
  activeScenario: "BASE" | "ALT" | "VOL";
  className?: string;
};

function biasValueClass(bias: string): string {
  if (bias === "Alcista") return "text-emerald-400/95";
  if (bias === "Bajista") return "text-rose-400/95";
  return "text-white/80";
}

function emDash(v: string | null | undefined): string {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s.length > 0 ? s : "—";
}

/**
 * Barra de lectura rápida — modo SIMPLE.
 * ZONA / SETUP / ZONAS: `data.marketState` + `data.zones` (fusión POST /api/terminal/push en servidor).
 */
export function MarketStateBar({ activeScenario, className }: Props) {
  const { data: mobileData } = useMobileTerminalState();
  const { data: scenariosData, isLoading: scenariosLoading } = useQuery<StructuralScenariosPayload>({
    queryKey: ["/api/scenarios"],
    staleTime: 10_000,
  });

  const [showSanitizedProof, setShowSanitizedProof] = useState(false);
  const proofShownRef = useRef(false);

  useEffect(() => {
    if (!mobileData?.pushMerged || proofShownRef.current) return;
    proofShownRef.current = true;
    setShowSanitizedProof(true);
    const t = window.setTimeout(() => setShowSanitizedProof(false), 4500);
    return () => window.clearTimeout(t);
  }, [mobileData?.pushMerged]);

  const marketData = useMemo(() => {
    const d = mobileData?.data;
    const ms = d?.marketState as { zone?: unknown; setup?: string | null } | undefined;

    const zoneDisplay = sanitizeZoneForDisplay(
      ms?.zone as string | number | null | undefined
    );
    const setupDisplay = sanitizeSetupForDisplay(ms?.setup ?? null);
    const zonesLine = sanitizeZonesLineFromRows(
      d?.zones as Array<{ label?: string; price?: string }> | undefined
    );

    const market = d?.market;
    return {
      gammaRegime: market?.gammaRegime ?? null,
      zone: zoneDisplay,
      zonesLine,
      flipPoint: market?.gammaFlip ? `$${Math.round(market.gammaFlip).toLocaleString()}` : null,
      netGamma: market?.totalGex ? `$${(market.totalGex / 1_000_000_000).toFixed(1)}B` : null,
      setup: setupDisplay,
      scenario: scenariosData?.baseCase?.title ?? null,
    };
  }, [mobileData, scenariosData]);

  const scenarioDisplay =
    scenariosLoading && !scenariosData ? "Cargando escenarios..." : marketData.scenario;

  return (
    <section
      className={cn(
        "min-w-0 flex-1 border border-white/[0.1] bg-terminal-panel/95 backdrop-blur-sm",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        className
      )}
      aria-label="Estado del mercado"
      data-testid="market-state-bar"
    >
      {showSanitizedProof ? (
        <div
          data-testid="payload-sanitized-banner"
          className="border-b border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-center text-[10px] font-mono font-semibold tracking-wider text-emerald-300"
        >
          PAYLOAD SANITIZED
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
        <span
          className="text-[11px] font-semibold tracking-[0.04em] text-white/88"
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          <span className="mr-1.5 opacity-90" aria-hidden="true">
            {"\u{1F4CA}"}
          </span>
          Estado del mercado
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06]">
        <Cell label="ZONA" value={marketData.zone} />
        <Cell label="SETUP ACTIVO" value={marketData.setup} />
        <Cell label="ZONAS CLAVE" value={marketData.zonesLine} small />
        <Cell
          label="Bias"
          value={emDash(marketData.gammaRegime)}
          valueClass={biasValueClass(marketData.gammaRegime ?? "")}
        />
        <Cell label="Tipo de mercado" value={emDash(marketData.gammaRegime)} />
        <Cell
          label="Call Wall"
          value={
            mobileData?.data?.levels?.callWall
              ? `$${Math.round(mobileData.data.levels.callWall).toLocaleString()}`
              : "—"
          }
        />
        <Cell
          label="Put Wall"
          value={
            mobileData?.data?.levels?.putWall
              ? `$${Math.round(mobileData.data.levels.putWall).toLocaleString()}`
              : "—"
          }
        />
        <Cell
          label="Dealer Pivot"
          value={
            mobileData?.data?.levels?.dealerPivot
              ? `$${Math.round(mobileData.data.levels.dealerPivot).toLocaleString()}`
              : "—"
          }
        />
        <Cell label="Escenario" value={emDash(scenarioDisplay)} small />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  valueClass,
  small,
}: {
  label: string;
  value: string;
  valueClass?: string;
  small?: boolean;
}) {
  return (
    <div className="bg-[#0c0c0e] px-3 py-2.5 min-h-[3.25rem] flex flex-col justify-center gap-0.5">
      <span className="text-[9px] uppercase tracking-[0.12em] text-white/32 font-medium">{label}</span>
      <span
        className={cn(
          "font-mono font-semibold leading-snug text-white/92",
          small ? "text-[10px]" : "text-[11px]",
          valueClass
        )}
      >
        {value}
      </span>
    </div>
  );
}
