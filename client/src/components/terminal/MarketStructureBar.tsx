import { cn } from "@/lib/utils";
import { useTerminalState } from "@/hooks/useTerminalState";
import { useMemo } from "react";
import { TooltipWrapper } from "./Tooltip";

type Structure = "RANGE CONTROL" | "TRANSITION" | "VOLATILITY EXPANSION" | "SQUEEZE RISK";
type VolLevel = "LOW VOL" | "MEDIUM VOL" | "HIGH VOL";
type DealerCtx = "DEALERS LONG GAMMA" | "DEALERS SHORT GAMMA" | "FRAGILE STRUCTURE" | "DEALER TRANSITION";

function deriveStructure(positioning: any, market: any): Structure {
  const squeeze = positioning?.squeezeProbabilityEngine;
  const cascade = positioning?.liquidityCascadeEngine;
  const bias = positioning?.institutionalBiasEngine;
  const volExp = positioning?.volatilityExpansionDetector;

  if (squeeze?.squeezeProbability >= 60 || cascade?.cascadeRisk === "EXTREME") return "SQUEEZE RISK";
  if (volExp?.volExpansionState === "EXPANDING" || bias?.institutionalBias?.includes("EXPANSION")) return "VOLATILITY EXPANSION";
  if (bias?.institutionalBias === "FRAGILE_TRANSITION" || market?.gammaRegime === "TRANSITION") return "TRANSITION";
  return "RANGE CONTROL";
}

function deriveVolatility(positioning: any, market: any): VolLevel {
  const volExp = positioning?.volatilityExpansionDetector;
  const cascade = positioning?.liquidityCascadeEngine;

  if (cascade?.cascadeRisk === "EXTREME" || cascade?.cascadeRisk === "HIGH") return "HIGH VOL";
  if (volExp?.volExpansionState === "EXPANDING" || volExp?.expansionProbability >= 60) return "HIGH VOL";
  if (market?.gammaRegime === "SHORT GAMMA") return "HIGH VOL";
  if (market?.gammaRegime === "LONG GAMMA") return "LOW VOL";
  if (volExp?.expansionProbability >= 40) return "MEDIUM VOL";
  return "MEDIUM VOL";
}

function deriveDealer(positioning: any, market: any): DealerCtx {
  const regime = market?.gammaRegime;
  const bias = positioning?.institutionalBiasEngine;

  if (bias?.institutionalBias === "FRAGILE_TRANSITION") return "FRAGILE STRUCTURE";
  if (regime === "LONG GAMMA") return "DEALERS LONG GAMMA";
  if (regime === "SHORT GAMMA") return "DEALERS SHORT GAMMA";
  if (regime === "TRANSITION") return "DEALER TRANSITION";

  const band = positioning?.gammaCurveEngine?.gammaRegimeBand;
  if (band === "DEEP_SHORT" || band === "SHORT") return "DEALERS SHORT GAMMA";
  if (band === "DEEP_LONG" || band === "LONG") return "DEALERS LONG GAMMA";

  return "DEALER TRANSITION";
}

const structureColors: Record<Structure, string> = {
  "RANGE CONTROL": "text-blue-400 bg-blue-500/10 border-blue-500/25",
  "TRANSITION": "text-yellow-400 bg-yellow-500/10 border-yellow-500/25",
  "VOLATILITY EXPANSION": "text-orange-400 bg-orange-500/10 border-orange-500/25",
  "SQUEEZE RISK": "text-red-400 bg-red-500/10 border-red-500/25",
};

const volColors: Record<VolLevel, string> = {
  "LOW VOL": "text-green-400 bg-green-500/10 border-green-500/25",
  "MEDIUM VOL": "text-yellow-400 bg-yellow-500/10 border-yellow-500/25",
  "HIGH VOL": "text-red-400 bg-red-500/10 border-red-500/25",
};

const dealerColors: Record<DealerCtx, string> = {
  "DEALERS LONG GAMMA": "text-green-400 bg-green-500/10 border-green-500/25",
  "DEALERS SHORT GAMMA": "text-red-400 bg-red-500/10 border-red-500/25",
  "FRAGILE STRUCTURE": "text-orange-400 bg-orange-500/10 border-orange-500/25",
  "DEALER TRANSITION": "text-yellow-400 bg-yellow-500/10 border-yellow-500/25",
};

const dotColors: Record<string, string> = {
  blue: "bg-blue-400",
  yellow: "bg-yellow-400",
  orange: "bg-orange-400",
  red: "bg-red-400",
  green: "bg-green-400",
};

function getDotColor(cls: string): string {
  if (cls.includes("blue")) return dotColors.blue;
  if (cls.includes("green")) return dotColors.green;
  if (cls.includes("orange")) return dotColors.orange;
  if (cls.includes("red")) return dotColors.red;
  if (cls.includes("yellow")) return dotColors.yellow;
  return dotColors.yellow;
}

export function MarketStructureBar() {
  const { data: state } = useTerminalState();
  const positioning = state?.positioning;
  const market = state?.market;

  const structure = useMemo(() => deriveStructure(positioning, market), [positioning, market]);
  const vol = useMemo(() => deriveVolatility(positioning, market), [positioning, market]);
  const dealer = useMemo(() => deriveDealer(positioning, market), [positioning, market]);

  const sColor = structureColors[structure];
  const vColor = volColors[vol];
  const dColor = dealerColors[dealer];

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-terminal-panel border-b border-terminal-border shrink-0" data-testid="bar-market-structure">
      <Pill label="Structure" value={structure} colorClass={sColor} />
      <div className="w-px h-4 bg-white/[0.06]" />
      <Pill label="Volatility" value={vol} colorClass={vColor} />
      <div className="w-px h-4 bg-white/[0.06]" />
      <Pill label="Dealers" value={dealer} colorClass={dColor} />
    </div>
  );
}

function Pill({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <TooltipWrapper concept={label}>
      <div className="flex items-center gap-2 cursor-help">
        <span className="text-[9px] uppercase tracking-wider text-white/30 font-medium hidden sm:inline">{label}</span>
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-bold font-mono tracking-wide", colorClass)}>
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getDotColor(colorClass))} />
          {value}
        </span>
      </div>
    </TooltipWrapper>
  );
}
