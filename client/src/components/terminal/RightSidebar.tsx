import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TradingScenario, MarketState, OptionsPositioning, DealerExposure, DealerHedgingFlow, KeyLevels } from "@shared/schema";
import { X } from "lucide-react";

interface RightSidebarProps {
  onScenarioSelect?: (scenario: TradingScenario | null) => void;
}

type FlowEvent = {
  name: string;
  status: "ACTIVE" | "RECENT" | "INACTIVE";
  description: string;
  impact: "SUPPORTIVE" | "WARNING" | "EXPANSIVE";
};

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

  const { data: levels } = useQuery<KeyLevels>({ 
    queryKey: ["/api/key-levels"],
    refetchInterval: 5000
  });

  const { data: candles } = useQuery({
    queryKey: ["btc-candles-lightweight"],
    queryFn: async () => {
      const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1");
      const data = await res.json();
      return data.map((d: any) => ({
        close: parseFloat(d[4]),
      }));
    },
    refetchInterval: 10000
  });

  const currentPrice = candles?.[0]?.close || 0;

  const activeScenario = useMemo(() => 
    scenarios?.find(s => s.id === selectedId) || null,
    [scenarios, selectedId]
  );

  const parseLevel = (val: string): number => {
    const clean = val.toLowerCase().replace(/,/g, '').trim();
    const match = clean.match(/(\d+\.?\d*)/);
    if (!match) return NaN;
    let num = parseFloat(match[1]);
    if (clean.includes('k')) {
      num *= 1000;
    }
    return num;
  };

  const formatLevelDisplay = (price: number): string => {
    if (isNaN(price)) return "--";
    return price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price.toString();
  };

  const engineData = useMemo(() => {
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

    // Execution State Logic
    let status = "AVOID ENTRY";
    let bias: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let entryZone = "--";
    let trigger = Object.entries(confirmations)
      .filter(([_, active]) => active)
      .map(([label]) => label.split(' ')[0])
      .join(", ") || "NONE";
    let target = "--";
    let invalidationDisplay = "--";

    const allEvents: FlowEvent[] = [];

    if (activeScenario) {
      const scenarioLevels = activeScenario.levels.map(parseLevel).filter(l => !isNaN(l));
      const firstLevel = scenarioLevels[0];
      const lastLevel = scenarioLevels[scenarioLevels.length - 1];
      
      // Bias
      if (activeScenario.type === "VOL") bias = "NEUTRAL";
      else if (lastLevel > firstLevel) bias = "LONG";
      else bias = "SHORT";

      // ENTRY ZONE
      const potentialEntryPoints = [...scenarioLevels];
      if (levels?.gammaMagnets) potentialEntryPoints.push(...levels.gammaMagnets);
      if (positioning?.dealerPivot) potentialEntryPoints.push(positioning.dealerPivot);
      
      const nearestEntry = potentialEntryPoints.reduce((prev, curr) => 
        Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev, 
        potentialEntryPoints[0] || NaN
      );
      entryZone = formatLevelDisplay(nearestEntry);

      // TARGET RESOLUTION
      const potentialTargets = [...scenarioLevels];
      if (levels?.gammaMagnets) potentialTargets.push(...levels.gammaMagnets);
      if (positioning?.callWall) potentialTargets.push(positioning.callWall);
      if (positioning?.putWall) potentialTargets.push(positioning.putWall);
      
      let nextTarget = NaN;
      if (bias === "LONG") {
        const longTargets = potentialTargets.filter(t => t > currentPrice).sort((a, b) => a - b);
        nextTarget = longTargets[0] || lastLevel;
      } else if (bias === "SHORT") {
        const shortTargets = potentialTargets.filter(t => t < currentPrice).sort((a, b) => b - a);
        nextTarget = shortTargets[0] || lastLevel;
      } else {
        // BIAS = NEUTRAL
        if (activeScenario.type === "BASE") {
          nextTarget = potentialTargets.find(t => Math.abs(t - (positioning?.dealerPivot || currentPrice)) < 1000) || firstLevel;
        } else if (activeScenario.type === "ALT") {
          nextTarget = scenarioLevels.reduce((prev, curr) => 
            Math.abs(curr - currentPrice) > Math.abs(prev - currentPrice) ? curr : prev, 
            scenarioLevels[0]
          );
        } else if (activeScenario.type === "VOL") {
          nextTarget = Math.max(...scenarioLevels);
        } else {
          if (levels?.gammaMagnets && levels.gammaMagnets.length > 0) {
             nextTarget = levels.gammaMagnets.reduce((prev, curr) => 
               Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
             );
          } else {
            nextTarget = lastLevel;
          }
        }
      }
      target = formatLevelDisplay(nextTarget);

      // INVALIDATION
      const invNum = parseLevel(activeScenario.invalidation);
      if (!isNaN(invNum)) {
        invalidationDisplay = `${formatLevelDisplay(invNum)} FLIP`;
      } else {
        invalidationDisplay = activeScenario.invalidation;
      }

      const priceNearEntry = Math.abs(currentPrice - nearestEntry) < (currentPrice * 0.015);
      const priceNearMagnet = levels?.gammaMagnets.some(m => Math.abs(currentPrice - m) < (currentPrice * 0.01));

      if ((quality === "A" || quality === "B") && condition === "CONFIRMED" && activeConfCount >= 2 && (priceNearEntry || priceNearMagnet)) {
        status = "READY TO EXECUTE";
      } else if ((quality === "B" || quality === "C") && condition === "DEVELOPING") {
        status = "WAIT FOR CONFIRMATION";
      } else if (activeScenario.probability >= 50 && !priceNearEntry) {
        status = "STRUCTURE DEVELOPING";
      }

      // Flow Event Logic
      if (confirmations["Absorption at Magnet"] && (priceNearMagnet || Math.abs(currentPrice - (positioning?.dealerPivot || 0)) < 500)) {
        allEvents.push({
          name: "ABSORPTION DETECTED",
          status: "ACTIVE",
          description: `Supportive response at ${formatLevelDisplay(nearestEntry)} zone`,
          impact: "SUPPORTIVE"
        });
      }

      if (confirmations["Bid Holding"]) {
        allEvents.push({
          name: "BID HOLD CONFIRMED",
          status: "ACTIVE",
          description: "Sustained bid pressure at current level",
          impact: "SUPPORTIVE"
        });
      }

      if (confirmations["Delta Divergence"]) {
        allEvents.push({
          name: "DELTA SHIFT",
          status: "ACTIVE",
          description: "Divergence detected against local move",
          impact: activeScenario.type === "VOL" ? "EXPANSIVE" : "WARNING"
        });
      }

      if (!confirmations["OI Stable"]) {
        allEvents.push({
          name: "OI INSTABILITY",
          status: "ACTIVE",
          description: "Rapid position closing or opening detected",
          impact: "WARNING"
        });
      }

      if (["ALT", "VOL"].includes(activeScenario.type) && condition === "DEVELOPING" && (Math.abs(currentPrice - (positioning?.callWall || 0)) < 1000 || Math.abs(currentPrice - (positioning?.putWall || 0)) < 1000)) {
        allEvents.push({
          name: "WALL PULL",
          status: "ACTIVE",
          description: "Liquidity shifting as price approaches wall",
          impact: "EXPANSIVE"
        });
      }

      if (activeScenario.type === "VOL" && status !== "READY TO EXECUTE" && volRisk === "HIGH") {
        allEvents.push({
          name: "LIQUIDITY SWEEP",
          status: "ACTIVE",
          description: "Anomalous volatility expansion triggered",
          impact: "EXPANSIVE"
        });
      }

      const strongGammaPressure = exposure?.gammaPressure.includes("+") && parseFloat(exposure.gammaPressure) > 0.5;
      if (strongGammaPressure && flow?.hedgeFlowIntensity === "HIGH" && volRisk !== "LOW") {
        allEvents.push({
          name: "IMBALANCE BURST",
          status: "ACTIVE",
          description: "High intensity hedge flow accelerating move",
          impact: "EXPANSIVE"
        });
      }
    }

    if (quality === "D" || flowState === "SUPPRESSIVE") {
      status = "AVOID ENTRY";
    }

    // Sort events by impact: EXPANSIVE > WARNING > SUPPORTIVE
    const priority = { "EXPANSIVE": 0, "WARNING": 1, "SUPPORTIVE": 2 };
    const flowEvents = allEvents
      .sort((a, b) => priority[a.impact] - priority[b.impact])
      .slice(0, 3);

    return { quality, condition, flowState, volRisk, score, status, bias, entryZone, trigger, target, invalidationDisplay, flowEvents };
  }, [activeScenario, market, exposure, flow, confirmations, currentPrice, levels, positioning]);

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
            value={engineData.quality} 
            trend={engineData.quality === "A" ? "positive" : engineData.quality === "B" ? "neutral" : "negative"} 
            isBadge 
          />
          <TerminalValue 
            label="Condition" 
            value={engineData.condition} 
            trend={engineData.condition === "CONFIRMED" ? "positive" : engineData.condition === "DEVELOPING" ? "neutral" : "negative"} 
          />
          <TerminalValue label="Flow State" value={engineData.flowState} />
          <TerminalValue 
            label="Vol Risk" 
            value={engineData.volRisk} 
            trend={engineData.volRisk === "LOW" ? "positive" : engineData.volRisk === "MEDIUM" ? "neutral" : "negative"} 
          />
          <TerminalValue 
            label="Active Scenario" 
            value={activeScenario ? `${activeScenario.type} ${activeScenario.probability}%` : "NONE"} 
          />
        </div>
      </TerminalPanel>

      <TerminalPanel title="EXECUTION STATE">
        <div className="space-y-2">
          <TerminalValue 
            label="Status" 
            value={engineData.status} 
            trend={
              engineData.status === "READY TO EXECUTE" ? "positive" : 
              engineData.status === "WAIT FOR CONFIRMATION" ? "neutral" : 
              engineData.status === "STRUCTURE DEVELOPING" ? "neutral" : "negative"
            }
            isBadge
          />
          <TerminalValue 
            label="Bias" 
            value={engineData.bias} 
            trend={engineData.bias === "LONG" ? "positive" : engineData.bias === "SHORT" ? "negative" : "neutral"}
          />
          <TerminalValue label="Entry Zone" value={engineData.entryZone} />
          <TerminalValue label="Trigger" value={engineData.trigger} />
          <TerminalValue label="Target" value={engineData.target} />
          <TerminalValue label="Invalidation" value={engineData.invalidationDisplay} />
        </div>
      </TerminalPanel>

      <TerminalPanel title="FLOW EVENTS">
        <div className="space-y-4">
          {engineData.flowEvents.length === 0 ? (
            <div className="text-[10px] text-terminal-muted italic py-2">No significant flow events detected</div>
          ) : (
            engineData.flowEvents.map((event, i) => (
              <div key={i} className="border-l-2 border-white/10 pl-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className={cn(
                    "text-[10px] font-bold tracking-wider",
                    event.impact === "SUPPORTIVE" ? "text-terminal-positive" : 
                    event.impact === "WARNING" ? "text-yellow-400" : "text-terminal-negative"
                  )}>
                    {event.name}
                  </span>
                  <span className="text-[8px] font-mono opacity-50">{event.status}</span>
                </div>
                <div className="text-[9px] text-white/70 leading-tight">
                  {event.description}
                </div>
                <div className={cn(
                  "text-[8px] font-bold uppercase",
                  event.impact === "SUPPORTIVE" ? "text-terminal-positive/70" : 
                  event.impact === "WARNING" ? "text-yellow-400/70" : "text-terminal-negative/70"
                )}>
                  IMPACT: {event.impact}
                </div>
              </div>
            ))
          )}
        </div>
      </TerminalPanel>

      <TerminalPanel title="DAILY SCENARIOS">
        <div className="space-y-4">
          {scenarios?.map((scenario) => (
            <div 
              key={scenario.id}
              onClick={() => handleScenarioClick(scenario)}
              className={cn(
                "border cursor-pointer bg-terminal-panel rounded-sm overflow-hidden flex flex-col group transition-all",
                selectedId === scenario.id ? "border-terminal-accent ring-1 ring-terminal-accent/30" : "border-terminal-border hover:border-white/20",
              )}
            >
              <div className={cn(
                "flex justify-between items-center p-2 border-b border-white/5",
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
                  <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">{scenario.type} CASE</span>
                </div>
                <span className={cn(
                  "px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-bold",
                  scenario.type === "BASE" ? "bg-blue-500/20 text-blue-400" : 
                  scenario.type === "ALT" ? "bg-green-500/20 text-green-400" : 
                  "bg-orange-500/20 text-orange-400"
                )}>
                  {scenario.probability}% PROB
                </span>
              </div>
              <div className="p-3 text-[11px] space-y-3">
                <div className="font-bold text-white leading-tight">
                  {scenario.thesis}
                </div>
                <div className="space-y-3 opacity-100">
                  <div className="flex flex-col mt-1 mb-2">
                    <span className="text-white/60 uppercase text-[9px] font-bold tracking-wider">Levels</span>
                    <span className="text-xs font-mono font-bold text-white mt-1 block leading-normal">
                      {scenario.levels.map(formatLevel).join(" / ")}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-[75px_1fr] gap-2">
                    <span className="text-white/60 uppercase text-[9px] font-bold">Confirm</span>
                    <span className="text-white font-medium italic">{scenario.confirmation.join(", ")}</span>
                  </div>
                  <div className="grid grid-cols-[75px_1fr] gap-2">
                    <span className="text-white/60 uppercase text-[9px] font-bold">Invalid</span>
                    <span className="text-terminal-negative font-bold">{scenario.invalidation}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!scenarios && <div className="text-xs text-terminal-muted p-4">Loading scenarios...</div>}
        </div>
      </TerminalPanel>

      {tradingPlan && isTradingPlanOpen && (
        <TerminalPanel 
          title="ACTIVE TRADING PLAN" 
          className="border-terminal-accent/50 bg-terminal-panel"
          headerExtra={
            <button 
              onClick={() => setIsTradingPlanOpen(false)}
              className="text-[9px] font-mono font-bold text-terminal-muted hover:text-white uppercase flex items-center"
            >
              [ CLOSE ]
            </button>
          }
        >
          <div className="p-4 space-y-3">
            <div className="text-white font-bold text-[11px] mb-2 uppercase border-b border-white/10 pb-1">
              TRADING PLAN ACTIVE
            </div>
            <pre className="text-[10px] font-mono font-bold text-white/90 leading-relaxed whitespace-pre-wrap">
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
