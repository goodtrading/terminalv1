import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TradingScenario, MarketState, OptionsPositioning, DealerExposure, DealerHedgingFlow } from "@shared/schema";
import { X } from "lucide-react";

interface RightSidebarProps {
  onScenarioSelect?: (scenario: TradingScenario | null) => void;
}

export function RightSidebar({ onScenarioSelect }: RightSidebarProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tradingPlan, setTradingPlan] = useState<string | null>(null);
  const [isTradingPlanOpen, setIsTradingPlanOpen] = useState(false);
  
  // Confirmation Toggles State
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({
    "Absorption at Magnet": false,
    "Bid Holding": true,
    "Delta Divergence": false,
    "OI Stable": true,
    "Wall Pull Detected": false,
  });

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

  const { data: exposure } = useQuery<DealerExposure>({
    queryKey: ["/api/dealer-exposure"],
    refetchInterval: 5000
  });

  const { data: flow } = useQuery<DealerHedgingFlow>({
    queryKey: ["/api/dealer-hedging-flow"],
    refetchInterval: 5000
  });

  const activeScenario = useMemo(() => 
    scenarios?.find(s => s.id === selectedId) || null,
    [scenarios, selectedId]
  );

  const qualityMetrics = useMemo(() => {
    let score = 0;
    
    // 1. Scenario confidence
    if (activeScenario) {
      if (activeScenario.probability >= 60) score += 2;
      else if (activeScenario.probability >= 40) score += 1;
      else score -= 1;
    }

    // 2. Gamma structure
    if (market?.gammaRegime === "LONG GAMMA") score += 1;
    if (exposure?.gammaPressure.startsWith("+")) score += 1;
    if (exposure && exposure.gammaConcentration > 0.7) score += 1;

    // 3. Dealer hedging flow alignment
    if (flow && activeScenario) {
      const isBullishScenario = ["BASE", "ALT"].includes(activeScenario.type);
      if (isBullishScenario && flow.hedgeFlowBias === "BUYING") score += 1;
      if (activeScenario.type === "VOL" && flow.hedgeFlowBias === "SELLING") score += 1;
      if (flow.hedgeFlowIntensity === "HIGH") score += 1;
    }

    // 4. Confirmations
    const activeConfCount = Object.values(confirmations).filter(Boolean).length;
    score += activeConfCount * 1.2;

    // Quality Mapping
    let quality: "A" | "B" | "C" | "D" = "D";
    if (score >= 8) quality = "A";
    else if (score >= 6) quality = "B";
    else if (score >= 4) quality = "C";

    // Condition mapping
    let condition = "WEAK";
    if (activeScenario && activeConfCount >= 3) condition = "CONFIRMED";
    else if (activeConfCount >= 1) condition = "DEVELOPING";
    if (market?.gammaRegime === "SHORT GAMMA" && flow?.hedgeFlowBias === "SELLING" && activeScenario?.type === "BASE") {
      condition = "INVALID";
    }

    // Flow state
    let flowState = "STABLE";
    if (market?.gammaRegime === "LONG GAMMA" && exposure?.gammaConcentration && exposure.gammaConcentration > 0.7) flowState = "STABLE";
    if (flow?.hedgeFlowBias === "BUYING") flowState = "SUPPORTIVE";
    if (flow?.hedgeFlowBias === "SELLING") flowState = "SUPPRESSIVE";
    if (market?.gammaRegime === "SHORT GAMMA" || flow?.accelerationRisk === "HIGH") flowState = "EXPANSIVE";

    // Vol Risk
    let volRisk = "MEDIUM";
    if (market?.gammaRegime === "LONG GAMMA" && flow?.accelerationRisk === "LOW") volRisk = "LOW";
    if (market?.gammaRegime === "SHORT GAMMA" || activeScenario?.type === "VOL") volRisk = "HIGH";

    return { quality, condition, flowState, volRisk, score };
  }, [activeScenario, market, exposure, flow, confirmations]);

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
    const active = activeScenario || [...scenarios].sort((a, b) => b.probability - a.probability)[0];
    
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
    setIsTradingPlanOpen(true);
  };

  const toggleConfirmation = (label: string) => {
    setConfirmations(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="w-80 h-full flex flex-col gap-2 overflow-y-auto p-2 border-l border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="TRADE SETUP QUALITY">
        <div className="space-y-2">
          <TerminalValue 
            label="Setup Quality" 
            value={qualityMetrics.quality} 
            trend={qualityMetrics.quality === "A" ? "positive" : qualityMetrics.quality === "B" ? "neutral" : "negative"} 
            isBadge 
          />
          <TerminalValue 
            label="Condition" 
            value={qualityMetrics.condition} 
            trend={qualityMetrics.condition === "CONFIRMED" ? "positive" : qualityMetrics.condition === "DEVELOPING" ? "neutral" : "negative"} 
          />
          <TerminalValue label="Flow State" value={qualityMetrics.flowState} />
          <TerminalValue 
            label="Vol Risk" 
            value={qualityMetrics.volRisk} 
            trend={qualityMetrics.volRisk === "LOW" ? "positive" : qualityMetrics.volRisk === "MEDIUM" ? "neutral" : "negative"} 
          />
          <TerminalValue 
            label="Active Scenario" 
            value={activeScenario ? `${activeScenario.type} ${activeScenario.probability}%` : "NONE"} 
          />
        </div>
      </TerminalPanel>

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

      {tradingPlan && isTradingPlanOpen && (
        <TerminalPanel 
          title="ACTIVE TRADING PLAN" 
          className="border-terminal-accent/50 bg-white"
          headerExtra={
            <button 
              onClick={() => setIsTradingPlanOpen(false)}
              className="text-[9px] font-mono font-bold text-black/50 hover:text-black uppercase flex items-center"
            >
              [ CLOSE ]
            </button>
          }
        >
          <div className="p-4 space-y-3">
            <div className="text-black font-bold text-[11px] mb-2 uppercase border-b border-black/10 pb-1">
              TRADING PLAN ACTIVE
            </div>
            <pre className="text-[10px] font-mono font-bold text-black leading-relaxed whitespace-pre-wrap">
              {tradingPlan}
            </pre>
          </div>
        </TerminalPanel>
      )}

      <TerminalPanel title="ORDER FLOW CONFIRMATION">
        <div className="space-y-3">
          {Object.entries(confirmations).map(([label, isActive], i) => (
            <div key={i} className="flex items-center justify-between group cursor-pointer" onClick={() => toggleConfirmation(label)}>
              <span className={cn(
                "text-[10px] uppercase font-bold tracking-wider transition-colors",
                isActive ? "text-white" : "text-terminal-muted group-hover:text-white/60"
              )}>
                {label}
              </span>
              <div className={cn(
                "flex items-center justify-center w-10 h-5 rounded-full border border-terminal-border bg-terminal-panel p-1 transition-all",
                isActive && "border-terminal-positive/50 bg-terminal-positive/10",
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isActive ? "bg-terminal-positive shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-white/10"
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
            <span className="mr-3 opacity-50">█</span> {isTradingPlanOpen ? "Refresh Trading Plan" : "Generate Trading Plan"}
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
