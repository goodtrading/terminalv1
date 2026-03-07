import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TerminalPanel } from "./TerminalPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TradingScenario, MarketState, OptionsPositioning } from "@shared/schema";

interface RightSidebarProps {
  onScenarioSelect?: (scenario: TradingScenario | null) => void;
}

export function RightSidebar({ onScenarioSelect }: RightSidebarProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tradingPlan, setTradingPlan] = useState<string | null>(null);

  const { data: scenarios } = useQuery<TradingScenario[]>({ 
    queryKey: ["/api/scenarios"],
    refetchInterval: 5000
  });

  const { data: market } = useQuery<MarketState>({ 
    queryKey: ["/api/market-state"],
    refetchInterval: 5000 
  });

  const { data: positioning } = useQuery<OptionsPositioning>({ 
    queryKey: ["/api/options-positioning"],
    refetchInterval: 5000 
  });

  const formatLevel = (level: string | number) => {
    if (typeof level === 'number') {
      return level.toLocaleString();
    }
    return level;
  };

  const handleScenarioClick = (scenario: TradingScenario) => {
    const newId = selectedId === scenario.id ? null : scenario.id;
    setSelectedId(newId);
    if (onScenarioSelect) {
      onScenarioSelect(newId ? scenario : null);
    }
  };

  const generateTradingPlan = () => {
    if (!scenarios || scenarios.length === 0) return;
    const active = scenarios.find(s => s.id === selectedId) || [...scenarios].sort((a, b) => b.probability - a.probability)[0];
    
    const regimeDesc = market?.gammaRegime === "LONG GAMMA" 
      ? "LONG GAMMA → mean reversion environment" 
      : market?.gammaRegime === "SHORT GAMMA"
        ? "SHORT GAMMA → expansion / momentum environment"
        : "NEUTRAL → standard environment";

    const plan = `-----------------------------------------------------
MARKET REGIME
${regimeDesc}

-----------------------------------------------------
ACTIVE SCENARIO
${active.type} CASE (${active.probability}%)

Thesis:
${active.thesis}

-----------------------------------------------------
KEY LEVELS

Primary Levels:
${active.levels.join("\n")}

Dealer Levels:
Call Wall: ${positioning?.callWall?.toLocaleString() ?? "--"}
Put Wall: ${positioning?.putWall?.toLocaleString() ?? "--"}
Dealer Pivot: ${positioning?.dealerPivot?.toLocaleString() ?? "--"}

-----------------------------------------------------
TRADE SETUPS

SETUP 1 — ${active.type === "VOL" ? "Volatility Expansion" : "Mean Reversion"}
Entry zone:
${active.levels[0]}

Confirmation:
${active.confirmation.join(" + ")}

Target:
${active.levels[active.levels.length - 1]}

Invalidation:
${active.invalidation}

-----------------------------------------------------
FLOW SIGNALS TO WATCH
- absorption at magnets
- bid holding
- delta divergence
- OI stability

-----------------------------------------------------
RISK CONDITIONS
If volatility expansion begins
OR dealer hedge flow accelerates
→ scenario invalid
-----------------------------------------------------`;
    
    setTradingPlan(plan);
  };

  return (
    <div className="w-80 h-full flex flex-col gap-2 overflow-y-auto p-2 border-l border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="DAILY SCENARIOS">
        <div className="space-y-4">
          {scenarios?.map((scenario) => (
            <div 
              key={scenario.id}
              onClick={() => handleScenarioClick(scenario)}
              className={cn(
                "border cursor-pointer bg-white rounded-sm overflow-hidden flex flex-col group transition-all",
                selectedId === scenario.id ? "border-terminal-accent ring-1 ring-terminal-accent/30" : "border-black/10 hover:border-black/20",
                scenario.type === "BASE" && "hover:border-blue-500/30",
                scenario.type === "ALT" && "hover:border-green-500/30",
                scenario.type === "VOL" && "hover:border-orange-500/30"
              )}
            >
              <div className={cn(
                "flex justify-between items-center p-2 border-b border-white/10",
                scenario.type === "BASE" ? "bg-blue-500/10" : 
                scenario.type === "ALT" ? "bg-green-500/10" : 
                "bg-orange-500/10"
              )}>
                <div className="flex items-center space-x-2">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    scenario.type === "BASE" ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : 
                    scenario.type === "ALT" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : 
                    "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"
                  )}></div>
                  <span className="text-[10px] font-bold text-black uppercase tracking-wider">{scenario.type} CASE</span>
                </div>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold",
                  scenario.type === "BASE" ? "bg-blue-500/20 text-blue-700" : 
                  scenario.type === "ALT" ? "bg-green-500/20 text-green-700" : 
                  "bg-orange-500/20 text-orange-700"
                )}>
                  {scenario.probability}% PROB
                </span>
              </div>
              <div className="p-3 text-[11px] space-y-3">
                <div className="font-bold text-black leading-tight">
                  {scenario.thesis}
                </div>
                <div className="space-y-3 opacity-100">
                  <div className="flex flex-col mt-1 mb-2">
                    <span className="text-gray-600 uppercase text-[9px] font-bold tracking-wider">Levels</span>
                    <span className="text-xs font-mono font-bold text-black mt-1 block leading-normal">
                      {scenario.levels.map(formatLevel).join(" / ")}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-[75px_1fr] gap-2">
                    <span className="text-gray-600 uppercase text-[9px] font-bold">Confirm</span>
                    <span className="text-black font-medium italic">{scenario.confirmation.join(", ")}</span>
                  </div>
                  <div className="grid grid-cols-[75px_1fr] gap-2">
                    <span className="text-gray-600 uppercase text-[9px] font-bold">Invalid</span>
                    <span className="text-terminal-negative font-bold">{scenario.invalidation}</span>
                  </div>
                </div>
                {scenario.confirmation && scenario.confirmation.length > 0 && (
                  <div className="pt-2 border-t border-black/10">
                    <div className="text-[9px] uppercase font-bold text-gray-600 mb-1">Confirmation</div>
                    <div className="text-[10px] text-black/70 italic">
                      {scenario.confirmation.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!scenarios && <div className="text-xs text-terminal-muted p-4">Loading scenarios...</div>}
        </div>
      </TerminalPanel>

      {tradingPlan && (
        <TerminalPanel title="ACTIVE TRADING PLAN" className="border-terminal-accent/50 bg-terminal-accent/5">
          <pre className="text-[10px] font-mono text-white leading-relaxed whitespace-pre-wrap">
            {tradingPlan}
          </pre>
        </TerminalPanel>
      )}

      <TerminalPanel title="ORDER FLOW CONFIRMATION">
        <div className="space-y-3">
          {[
            { label: "Absorption at Magnet", status: "pending" },
            { label: "Bid Holding", status: "confirmed" },
            { label: "Delta Divergence", status: "pending" },
            { label: "OI Stable", status: "confirmed" },
            { label: "Wall Pull Detected", status: "none" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between group cursor-pointer">
              <span className="text-[10px] uppercase font-bold tracking-wider text-terminal-muted group-hover:text-white transition-colors">
                {item.label}
              </span>
              <div className={cn(
                "flex items-center justify-center w-10 h-5 rounded-full border border-terminal-border bg-terminal-panel p-1 transition-all",
                item.status === "confirmed" && "border-terminal-positive/50 bg-terminal-positive/10",
                item.status === "pending" && "border-yellow-500/50 bg-yellow-500/10"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  item.status === "confirmed" ? "bg-terminal-positive shadow-[0_0_6px_rgba(74,222,128,0.8)]" : 
                  item.status === "pending" ? "bg-yellow-500 animate-pulse" : 
                  "bg-white/10"
                )} />
              </div>
            </div>
          ))}
        </div>
      </TerminalPanel>

      <TerminalPanel title="ACTIONS" className="mt-auto">
        <div className="space-y-2">
          <Button 
            onClick={generateTradingPlan}
            variant="outline" 
            className="w-full justify-start text-[10px] font-bold uppercase tracking-[0.15em] h-10 bg-terminal-panel border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-white hover:bg-terminal-accent/10 transition-all rounded-sm no-default-hover-elevate"
          >
            <span className="mr-3 opacity-50">█</span> Generate Trading Plan
          </Button>
          {["Export Daily Report", "Copy Telegram Update"].map((text) => (
            <Button 
              key={text}
              variant="outline" 
              className="w-full justify-start text-[10px] font-bold uppercase tracking-[0.15em] h-10 bg-terminal-panel border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-white hover:bg-terminal-accent/10 transition-all rounded-sm no-default-hover-elevate"
            >
              <span className="mr-3 opacity-50">█</span> {text}
            </Button>
          ))}
        </div>
      </TerminalPanel>

    </div>
  );
}
