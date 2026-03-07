import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { OptionsPositioning, MarketState, TradingScenario, KeyLevels, DealerExposure } from "@shared/schema";
import { useMemo, useState, useEffect } from "react";

export function TradingPlan() {
  const [selectedScenario, setSelectedScenario] = useState<TradingScenario | null>(null);

  useEffect(() => {
    const handleScenarioSelect = (e: any) => {
      setSelectedScenario(e.detail);
    };
    window.addEventListener('scenario-select', handleScenarioSelect);
    return () => window.removeEventListener('scenario-select', handleScenarioSelect);
  }, []);

  const { data: market } = useQuery<MarketState>({ 
    queryKey: ["/api/market-state"],
    refetchInterval: 5000
  });

  const { data: positioning } = useQuery<OptionsPositioning>({ 
    queryKey: ["/api/options-positioning"],
    refetchInterval: 5000
  });

  const { data: levels } = useQuery<KeyLevels>({ 
    queryKey: ["/api/key-levels"],
    refetchInterval: 5000
  });

  const { data: exposure } = useQuery<DealerExposure>({ 
    queryKey: ["/api/dealer-exposure"],
    refetchInterval: 5000
  });

  const planData = useMemo(() => {
    if (!selectedScenario) return null;

    return {
      bias: selectedScenario.type === "BASE" ? "NEUTRAL/BULLISH" : selectedScenario.type === "ALT" ? "BULLISH" : "VOLATILE",
      regime: market?.gammaRegime || "UNKNOWN",
      scenario: `${selectedScenario.type} CASE (${selectedScenario.probability}%)`,
      entry: selectedScenario.levels[0] || "--",
      invalidation: selectedScenario.invalidation || "--",
      targets: selectedScenario.levels.slice(1).join(" → ") || "--",
      confirmations: selectedScenario.confirmation.join(" + ")
    };
  }, [selectedScenario, market]);

  if (!selectedScenario) {
    return (
      <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-1 min-w-[300px]">
        <div className="h-full flex items-center justify-center text-terminal-muted text-[10px] italic">
          Select a scenario from the right sidebar to generate plan
        </div>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-1 min-w-[300px]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-3">
          <TerminalValue label="Bias" value={planData?.bias} trend={planData?.bias.includes("BULLISH") ? "positive" : "neutral"} isBadge />
          <TerminalValue label="Regime" value={planData?.regime} trend={planData?.regime === "LONG GAMMA" ? "positive" : "negative"} />
        </div>
        <div className="space-y-3">
          <TerminalValue label="Scenario" value={planData?.scenario} />
          <TerminalValue label="Confirmations" value={planData?.confirmations} />
        </div>
        <div className="space-y-3">
          <TerminalValue label="Entry Zone" value={planData?.entry} trend="positive" />
          <TerminalValue label="Invalidation" value={planData?.invalidation} trend="negative" />
        </div>
        <div className="space-y-3">
          <TerminalValue label="Primary Targets" value={planData?.targets} />
          <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03] last:border-0">
             <span className="terminal-text-label text-[10px]">Vanna/Charm</span>
             <span className="text-xs font-mono font-bold terminal-text-primary">
               {exposure?.vannaBias?.charAt(0)}/{exposure?.charmBias?.charAt(0)}
             </span>
          </div>
        </div>
      </div>
      <div className="mt-4 p-2 bg-terminal-accent/5 border border-terminal-accent/10 rounded-sm">
        <div className="text-[9px] text-terminal-accent font-bold uppercase mb-1">Execution Thesis</div>
        <div className="text-[10px] terminal-text-secondary leading-relaxed font-medium">
          {selectedScenario.thesis}
        </div>
      </div>
    </TerminalPanel>
  );
}
