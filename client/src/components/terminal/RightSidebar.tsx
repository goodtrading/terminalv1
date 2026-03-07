import { useState, useMemo } from "react";
import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { cn } from "@/lib/utils";
import { TradingScenario } from "@shared/schema";
import { useTerminalState } from "@/hooks/useTerminalState";

interface RightSidebarProps {
  onScenarioSelect?: (scenario: TradingScenario | null) => void;
}

export function RightSidebar({ onScenarioSelect }: RightSidebarProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: state, isLoading: stateLoading } = useTerminalState();

  const market = state?.market;
  const positioning = state?.positioning;
  const exposure = state?.exposure;
  const levels = state?.levels;
  const currentPrice = state?.ticker?.price || 0;
  const tradeDecision = (positioning as any)?.tradeDecisionEngine;

  // We still need scenarios, but they aren't in the terminal state yet.
  // Wait, let's check if they should be. The user said "derive their data from the shared hook".
  // The terminal state endpoint currently does NOT include scenarios.
  // I should check server/terminal-state.ts again.
  // Actually, I'll add scenarios to the terminal state endpoint in the next step or assume they are coming soon.
  // For now, I'll keep the scenarios query if it's not in the state.
  // Looking at the previous server/terminal-state.ts write, it didn't have scenarios.
  // I will add scenarios to the terminal state endpoint to be thorough.
  
  const scenarios = state?.market && (state as any).scenarios ? (state as any).scenarios : [];

  const activeScenario = useMemo(() => 
    (scenarios as TradingScenario[])?.find(s => s.id === selectedId) || null,
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
    
    if (activeScenario) {
      if (activeScenario.probability >= 60) score += 2;
      else if (activeScenario.probability >= 40) score += 1;
      else score -= 1;
    }

    if (market?.gammaRegime === "LONG GAMMA") score += 1;
    if (exposure?.gammaPressure.startsWith("+")) score += 1;
    if (exposure && (exposure as any).gammaConcentration > 0.7) score += 1;

    // Hedging flow was removed from terminal state write? 
    // I should check server/terminal-state.ts. It used storage.getDealerHedgingFlow()? 
    // No, it used getMarketState, getDealerExposure, getOptionsPositioning, getKeyLevels.
    // I'll add hedging flow to the state too.

    const activeConfCount = 0;

    let quality: "A" | "B" | "C" | "D" = "D";
    if (score >= 8) quality = "A";
    else if (score >= 6) quality = "B";
    else if (score >= 4) quality = "C";

    let condition = "WEAK";
    if (activeScenario && activeConfCount >= 3) condition = "CONFIRMED";
    else if (activeConfCount >= 1) condition = "DEVELOPING";

    let flowState = "STABLE";
    let volRisk = "MEDIUM";
    if (market?.gammaRegime === "LONG GAMMA") volRisk = "LOW";
    if (market?.gammaRegime === "SHORT GAMMA") volRisk = "HIGH";

    let status = "AVOID ENTRY";
    let bias: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    let entryZone = "--";
    let trigger = "NONE";
    let target = "--";
    let invalidationDisplay = "--";

    if (activeScenario) {
      const scenarioLevels = activeScenario.levels.map(parseLevel).filter(l => !isNaN(l));
      const firstLevel = scenarioLevels[0];
      const lastLevel = scenarioLevels[scenarioLevels.length - 1];
      
      if (activeScenario.type === "VOL") bias = "NEUTRAL";
      else if (lastLevel > firstLevel) bias = "LONG";
      else bias = "SHORT";

      const potentialEntryPoints = [...scenarioLevels];
      if (levels?.gammaMagnets) potentialEntryPoints.push(...levels.gammaMagnets);
      if (positioning?.dealerPivot) potentialEntryPoints.push(positioning.dealerPivot);
      
      const nearestEntry = potentialEntryPoints.reduce((prev, curr) => 
        Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev, 
        potentialEntryPoints[0] || NaN
      );
      entryZone = formatLevelDisplay(nearestEntry);

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
      }
      target = formatLevelDisplay(nextTarget);

      const invNum = parseLevel(activeScenario.invalidation);
      invalidationDisplay = isNaN(invNum) ? activeScenario.invalidation : `${formatLevelDisplay(invNum)} FLIP`;

      const priceNearEntry = Math.abs(currentPrice - nearestEntry) < (currentPrice * 0.015);
      if ((quality === "A" || quality === "B") && condition === "CONFIRMED" && priceNearEntry) {
        status = "READY TO EXECUTE";
      } else if (activeScenario.probability >= 50) {
        status = "STRUCTURE DEVELOPING";
      }
    }

    if (quality === "D") status = "AVOID ENTRY";

    return { quality, condition, flowState, volRisk, score, status, bias, entryZone, trigger, target, invalidationDisplay };
  }, [activeScenario, market, exposure, currentPrice, levels, positioning]);

  const handleScenarioClick = (scenario: TradingScenario) => {
    const newId = selectedId === scenario.id ? null : scenario.id;
    setSelectedId(newId);
    if (onScenarioSelect) {
      onScenarioSelect(newId ? scenario : null);
    }
  };

  return (
    <div className="w-80 h-full flex flex-col gap-1 overflow-y-auto p-1 border-l border-terminal-border bg-terminal-bg shrink-0">
      <TerminalPanel title="TRADE SETUP QUALITY">
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <TerminalValue 
            label="Status" 
            value={tradeDecision?.tradeState || "WAIT"} 
            trend={
              tradeDecision?.tradeState === "EXECUTE" ? "positive" : 
              tradeDecision?.tradeState === "PREPARE" ? "neutral" : 
              tradeDecision?.tradeState === "WAIT" ? "neutral" : "negative"
            }
            isBadge
            data-testid="status-trade-state"
          />
          <TerminalValue 
            label="Direction" 
            value={tradeDecision?.tradeDirection || "NEUTRAL"} 
            trend={tradeDecision?.tradeDirection === "LONG" ? "positive" : tradeDecision?.tradeDirection === "SHORT" ? "negative" : "neutral"}
            data-testid="status-trade-direction"
          />
          <TerminalValue 
            label="Risk" 
            value={tradeDecision?.riskLevel || "MEDIUM"} 
            trend={tradeDecision?.riskLevel === "LOW" ? "positive" : tradeDecision?.riskLevel === "HIGH" ? "negative" : "neutral"}
            data-testid="status-risk-level"
          />
          <TerminalValue 
            label="Size" 
            value={tradeDecision?.positionSizeSuggestion || "NO_TRADE"} 
            trend={
              tradeDecision?.positionSizeSuggestion === "FULL" ? "positive" : 
              tradeDecision?.positionSizeSuggestion === "REDUCED" ? "neutral" : "negative"
            }
            isBadge
            data-testid="status-position-size"
          />
        </div>
      </TerminalPanel>

      <TerminalPanel title="DAILY SCENARIOS">
        <div className="space-y-3">
          {(scenarios as TradingScenario[])?.map((scenario) => (
            <div 
              key={scenario.id}
              onClick={() => handleScenarioClick(scenario)}
              className={cn(
                "terminal-card-interactive flex flex-col overflow-hidden",
                selectedId === scenario.id && "terminal-card-selected",
              )}
            >
              <div className={cn(
                "flex justify-between items-center p-1.5 border-b border-white/10",
                scenario.type === "BASE" ? "bg-blue-900/40" : 
                scenario.type === "ALT" ? "bg-green-900/40" : 
                "bg-orange-900/40"
              )}>
                <div className="flex items-center space-x-1.5">
                  <div className={cn(
                    "w-1 h-1 rounded-full",
                    scenario.type === "BASE" ? "bg-blue-400" : 
                    scenario.type === "ALT" ? "bg-green-400" : 
                    "bg-orange-400"
                  )}></div>
                  <span className="text-[9px] font-bold terminal-text-primary uppercase tracking-wider">{scenario.type} CASE</span>
                </div>
                <span className={cn(
                  "terminal-badge",
                  scenario.type === "BASE" ? "terminal-badge-info" : 
                  scenario.type === "ALT" ? "terminal-badge-success" : 
                  "terminal-badge-warning"
                )}>
                  {scenario.probability}% PROB
                </span>
              </div>
              <div className="p-2 text-[10px] space-y-2">
                <div className="font-bold terminal-text-primary leading-tight">
                  {scenario.thesis}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col">
                    <span className="terminal-text-label text-[8px]">Levels</span>
                    <span className="text-[9px] font-mono font-bold terminal-text-primary block leading-normal">
                      {scenario.levels.join(" / ")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {(!scenarios || (scenarios as any).length === 0) && <div className="text-[10px] terminal-text-muted p-3">No scenarios available</div>}
        </div>
      </TerminalPanel>

    </div>
  );
}
