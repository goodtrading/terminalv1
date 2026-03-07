import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TradingScenario } from "@shared/schema";
import { useTerminalState } from "@/hooks/useTerminalState";

interface RightSidebarProps {
  onScenarioSelect?: (scenario: TradingScenario | null) => void;
}

function SidebarPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-terminal-panel border border-terminal-border">
      <div className="px-4 py-2.5 border-b border-terminal-border">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] terminal-text-primary">{title}</span>
      </div>
      <div className="px-4 py-3">
        {children}
      </div>
    </div>
  );
}

function StatusValue({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === "green" ? "text-green-400"
    : color === "red" ? "text-red-400"
    : color === "yellow" ? "text-yellow-400"
    : color === "gray" ? "text-white/50"
    : "terminal-text-primary";

  return (
    <div className="flex justify-between items-center py-[6px]" data-testid={`status-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{label}</span>
      <span className={cn("text-[13px] font-mono font-bold", colorClass)}>{value}</span>
    </div>
  );
}

function getStatusColor(val: string): string {
  if (val === "EXECUTE") return "green";
  if (val === "AVOID") return "red";
  if (val === "WAIT" || val === "PREPARE") return "yellow";
  return "";
}

function getDirectionColor(val: string): string {
  if (val === "LONG") return "green";
  if (val === "SHORT") return "red";
  return "gray";
}

function getRiskColor(val: string): string {
  if (val === "LOW") return "green";
  if (val === "MEDIUM") return "yellow";
  if (val === "HIGH") return "red";
  return "";
}

function deriveEdge(positioning: any, market: any): string {
  const trade = positioning?.tradeDecisionEngine;
  const squeeze = positioning?.squeezeProbabilityEngine;
  const bias = positioning?.institutionalBiasEngine;
  const confidence = bias?.biasConfidence ?? 0;
  const sqProb = squeeze?.squeezeProbability ?? 0;

  let score = 0;
  if (trade?.tradeState === "EXECUTE") score += 2;
  else if (trade?.tradeState === "PREPARE") score += 1;
  if (confidence >= 80) score += 2;
  else if (confidence >= 50) score += 1;
  if (sqProb >= 70) score += 1;
  if (market?.gammaRegime === "SHORT GAMMA") score += 1;

  if (score >= 5) return "HIGH";
  if (score >= 3) return "MEDIUM";
  return "LOW";
}

export function RightSidebar({ onScenarioSelect }: RightSidebarProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: state } = useTerminalState();

  const market = state?.market;
  const positioning = state?.positioning;
  const tradeDecision = (positioning as any)?.tradeDecisionEngine;
  const scenarios = state?.market && (state as any).scenarios ? (state as any).scenarios : [];

  const edge = useMemo(() => deriveEdge(positioning, market), [positioning, market]);

  const tradeSetup = useMemo(() => {
    const exposure = state?.exposure;
    let condition = "WEAK";
    if (market?.gammaRegime === "LONG GAMMA" && exposure?.gammaPressure?.startsWith("+")) {
      condition = "CONFIRMED";
    } else if (market?.gammaRegime || exposure?.gammaPressure) {
      condition = "DEVELOPING";
    }

    let flowState = "STABLE";
    let volRisk = "MEDIUM";
    if (market?.gammaRegime === "LONG GAMMA") volRisk = "LOW";
    if (market?.gammaRegime === "SHORT GAMMA") { volRisk = "HIGH"; flowState = "VOLATILE"; }

    return { condition, flowState, volRisk };
  }, [market, state?.exposure]);

  const handleScenarioClick = (scenario: TradingScenario) => {
    const newId = selectedId === scenario.id ? null : scenario.id;
    setSelectedId(newId);
    if (onScenarioSelect) {
      onScenarioSelect(newId ? scenario : null);
    }
  };

  const statusVal = tradeDecision?.tradeState || "WAIT";
  const directionVal = tradeDecision?.tradeDirection || "NEUTRAL";
  const riskVal = tradeDecision?.riskLevel || "MEDIUM";
  const sizeVal = tradeDecision?.positionSizeSuggestion || "NO_TRADE";

  return (
    <div className="w-80 h-full flex flex-col gap-2 overflow-y-auto p-2 border-l border-terminal-border bg-terminal-bg shrink-0">

      <SidebarPanel title="Trading State">
        <div className="flex flex-col divide-y divide-white/[0.04]">
          <StatusValue label="Status" value={statusVal} color={getStatusColor(statusVal)} />
          <StatusValue label="Direction" value={directionVal} color={getDirectionColor(directionVal)} />
          <StatusValue label="Risk" value={riskVal} color={getRiskColor(riskVal)} />
          <StatusValue label="Size" value={sizeVal} color={sizeVal === "FULL" ? "green" : sizeVal === "NO_TRADE" ? "red" : "yellow"} />
          <StatusValue label="Edge" value={edge} color={getRiskColor(edge)} />
        </div>
      </SidebarPanel>

      <SidebarPanel title="Trade Setup">
        <div className="flex flex-col divide-y divide-white/[0.04]">
          <StatusValue
            label="Market Condition"
            value={tradeSetup.condition}
            color={tradeSetup.condition === "CONFIRMED" ? "green" : tradeSetup.condition === "DEVELOPING" ? "yellow" : "red"}
          />
          <StatusValue label="Flow State" value={tradeSetup.flowState} />
          <StatusValue
            label="Volatility Risk"
            value={tradeSetup.volRisk}
            color={getRiskColor(tradeSetup.volRisk)}
          />
        </div>
      </SidebarPanel>

      <SidebarPanel title="Daily Scenarios">
        <div className="flex flex-col gap-3">
          {(scenarios as TradingScenario[])?.map((scenario) => (
            <div
              key={scenario.id}
              onClick={() => handleScenarioClick(scenario)}
              className={cn(
                "cursor-pointer rounded border border-white/[0.06] transition-colors hover:border-white/[0.12]",
                selectedId === scenario.id && "border-terminal-accent/40 bg-terminal-accent/[0.04]"
              )}
              data-testid={`card-scenario-${scenario.id}`}
            >
              <div className={cn(
                "px-3 py-2 border-b border-white/[0.06]",
                scenario.type === "BASE" ? "bg-blue-900/20" :
                scenario.type === "ALT" ? "bg-green-900/20" :
                "bg-orange-900/20"
              )}>
                <div className="flex justify-between items-center">
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    scenario.type === "BASE" ? "text-blue-400" :
                    scenario.type === "ALT" ? "text-green-400" :
                    "text-orange-400"
                  )}>
                    {scenario.type} Case
                  </span>
                  <span className="text-[9px] font-mono text-white/40">{scenario.probability}%</span>
                </div>
              </div>
              <div className="px-3 py-2.5">
                <p className="text-[10px] text-white/60 leading-relaxed">{scenario.thesis}</p>
              </div>
            </div>
          ))}
          {(!scenarios || (scenarios as any).length === 0) && (
            <div className="text-[10px] text-white/30 italic py-2">No scenarios available</div>
          )}
        </div>
      </SidebarPanel>

    </div>
  );
}
