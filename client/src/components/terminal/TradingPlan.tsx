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
      <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-[0.65] min-w-[300px]">
        <div className="h-full flex items-center justify-center text-terminal-muted text-[10px] italic">
          Select a scenario from the right sidebar to generate plan
        </div>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-[0.65] min-w-[300px]">
      <div className="grid grid-cols-3 gap-x-12 px-4 py-2">
        {/* Column 1: Market Context */}
        <div className="flex flex-col">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-wider border-b border-terminal-accent/20 pb-2 mb-4">
            Market Context
          </div>
          <div className="space-y-4">
            <TerminalValue label="Bias" value={planData?.bias} trend={planData?.bias.includes("BULLISH") ? "positive" : "neutral"} isBadge />
            <TerminalValue label="Regime" value={planData?.regime} trend={planData?.regime === "LONG GAMMA" ? "positive" : "negative"} />
            <div className="flex justify-between items-center py-2 border-b border-white/[0.03] last:border-0">
               <span className="terminal-text-label text-[10px]">Vanna/Charm</span>
               <span className="text-xs font-mono font-bold terminal-text-primary">
                 {exposure?.vannaBias?.charAt(0)}/{exposure?.charmBias?.charAt(0)}
               </span>
            </div>
          </div>
        </div>

        {/* Column 2: Execution Params */}
        <div className="flex flex-col">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-wider border-b border-terminal-accent/20 pb-2 mb-4">
            Execution Params
          </div>
          <div className="space-y-4">
            <TerminalValue label="Entry Zone" value={planData?.entry} trend="positive" />
            <TerminalValue label="Invalidation" value={planData?.invalidation} trend="negative" />
            <TerminalValue label="Primary Targets" value={planData?.targets} />
          </div>
        </div>

        {/* Column 3: Scenario & Confirm */}
        <div className="flex flex-col">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-wider border-b border-terminal-accent/20 pb-2 mb-4">
            Scenario & Confirm
          </div>
          <div className="space-y-4">
            <TerminalValue label="Scenario" value={planData?.scenario} />
            <TerminalValue label="Confirmations" value={planData?.confirmations} />
          </div>
        </div>
      </div>
      
      <div className="mt-8 mx-4 p-5 bg-terminal-accent/[0.03] border border-terminal-accent/10 rounded-sm">
        <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-3 flex items-center">
          <div className="w-1.5 h-3.5 bg-terminal-accent mr-2.5"></div>
          Execution Thesis
        </div>
        <div className="text-[11px] terminal-text-secondary leading-relaxed font-medium pl-4 border-l border-terminal-accent/20">
          {selectedScenario.thesis}
        </div>
      </div>
    </TerminalPanel>
  );
}
