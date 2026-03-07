import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TradingScenario } from "@shared/schema";
import { useTerminalState } from "@/hooks/useTerminalState";
import { LearnHelper } from "./Tooltip";

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
    : color === "orange" ? "text-orange-400"
    : color === "purple" ? "text-purple-400"
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

function getStatusHelper(val: string): string {
  if (val === "EXECUTE") return "Conditions are aligned for a trade.";
  if (val === "PREPARE") return "Setup is forming, not ready yet.";
  if (val === "WAIT") return "No clear edge yet.";
  if (val === "AVOID") return "Conditions are unfavorable for trading.";
  return "";
}

function getVolRiskHelper(val: string): string {
  if (val === "LOW") return "Lower probability of explosive movement.";
  if (val === "HIGH") return "Larger moves are more likely.";
  return "Moderate volatility expected.";
}

const SCENARIO_HELPERS: Record<string, string> = {
  "BASE": "Most likely path if conditions remain stable.",
  "ALT": "Alternative path if momentum shifts.",
  "VOL": "High-volatility path if the market destabilizes.",
};

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

  const marketModeEngine = (positioning as any)?.marketModeEngine;
  const marketMode = marketModeEngine?.marketMode || "FRAGILE_TRANSITION";
  const marketModeConfidence = marketModeEngine?.marketModeConfidence ?? 0;
  const marketModeReason: string[] = marketModeEngine?.marketModeReason || [];

  const modeColorMap: Record<string, { text: string; bg: string; border: string }> = {
    GAMMA_PIN: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    MEAN_REVERSION: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
    VOL_EXPANSION: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    SQUEEZE_RISK: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
    CASCADE_RISK: { text: "text-red-500", bg: "bg-red-600/10", border: "border-red-600/20" },
    FRAGILE_TRANSITION: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  };
  const modeColors = modeColorMap[marketMode] || modeColorMap.FRAGILE_TRANSITION;
  const modeDisplay = marketMode.replace(/_/g, " ");
  const modeSubtitleMap: Record<string, string> = {
    GAMMA_PIN: "Dealer-controlled market",
    MEAN_REVERSION: "Range trading conditions",
    VOL_EXPANSION: "Directional volatility expansion",
    SQUEEZE_RISK: "Short squeeze conditions possible",
    CASCADE_RISK: "Liquidation cascade risk elevated",
    FRAGILE_TRANSITION: "Unstable regime transition",
  };
  const modeSubtitle = modeSubtitleMap[marketMode] || "";

  return (
    <div className="w-80 h-full flex flex-col gap-2 overflow-y-auto p-2 border-l border-terminal-border bg-terminal-bg shrink-0">

      <SidebarPanel title="Market Mode">
        <div className="flex flex-col gap-2.5">
          <div className={cn("rounded px-3 py-2.5 border", modeColors.bg, modeColors.border)} data-testid="status-market-mode">
            <div className={cn("text-[15px] font-mono font-black tracking-wide", modeColors.text)}>{modeDisplay}</div>
            {modeSubtitle && <div className="text-[9px] font-mono text-white/30 mt-0.5">{modeSubtitle}</div>}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Confidence</span>
              <span className={cn("text-[12px] font-mono font-bold", modeColors.text)}>{marketModeConfidence}%</span>
            </div>
          </div>
          {marketModeReason.length > 0 && (
            <div>
              <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Drivers</span>
              <div className="mt-1 flex flex-col gap-0.5">
                {marketModeReason.map((reason, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className={cn("text-[8px] mt-[3px]", modeColors.text)}>•</span>
                    <span className="text-[10px] text-white/50 font-mono leading-snug">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SidebarPanel>

      <SidebarPanel title="Trading State">
        <div className="flex flex-col divide-y divide-white/[0.04]">
          <div>
            <StatusValue label="Status" value={statusVal} color={getStatusColor(statusVal)} />
            <LearnHelper text={getStatusHelper(statusVal)} />
          </div>
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
          <div>
            <StatusValue
              label="Volatility Risk"
              value={tradeSetup.volRisk}
              color={getRiskColor(tradeSetup.volRisk)}
            />
            <LearnHelper text={getVolRiskHelper(tradeSetup.volRisk)} />
          </div>
        </div>
      </SidebarPanel>

      <SidebarPanel title="Liquidity Map">
        {(() => {
          const heatmap = (positioning as any)?.liquidityHeatmap;
          const lines: string[] = heatmap?.liquidityMapLines || [];
          const pressure = heatmap?.liquidityPressure || "BALANCED";
          const source = heatmap?.heatmapSummary?.source || "--";
          const pressureColor = pressure === "BID_HEAVY" ? "green" : pressure === "ASK_HEAVY" ? "red" : "yellow";
          const vacuum = heatmap?.liquidityVacuum;
          const vacuumRisk = vacuum?.vacuumRisk || "LOW";
          const vacuumZones = vacuum?.activeZones?.length || 0;
          const vacuumRiskColor = vacuumRisk === "EXTREME" ? "red" : vacuumRisk === "HIGH" ? "orange" : vacuumRisk === "MEDIUM" ? "yellow" : "gray";
          const fmtK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p));
          return (
            <div className="flex flex-col gap-2">
              <StatusValue label="Pressure" value={pressure.replace(/_/g, " ")} color={pressureColor} />
              <StatusValue label="Vacuum Risk" value={vacuumRisk} color={vacuumRiskColor} />
              <StatusValue label="Vacuum Zones" value={String(vacuumZones)} color={vacuumZones > 0 ? "blue" : "gray"} />
              {vacuum?.activeZones?.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {vacuum.activeZones.slice(0, 3).map((z: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] mt-[3px] text-blue-400">◆</span>
                      <span className="text-[10px] text-white/50 font-mono leading-snug">
                        {z.direction} {fmtK(z.priceStart)}–{fmtK(z.priceEnd)} ({Math.round(z.strength * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {lines.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {lines.map((line: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] mt-[3px] text-purple-400">•</span>
                      <span className="text-[10px] text-white/50 font-mono leading-snug">{line}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[8px] text-white/20 font-mono">{source}</div>
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="Dealer Hedging Flow">
        {(() => {
          const dhf = (positioning as any)?.dealerHedgingFlowMap;
          const dir = dhf?.hedgingFlowDirection || "NEUTRAL";
          const str = dhf?.hedgingFlowStrength || "LOW";
          const accel = dhf?.hedgingAccelerationRisk || "LOW";
          const trigger = dhf?.hedgingTriggerZone || "--";
          const summary: string[] = dhf?.hedgingFlowSummary || [];
          const dirColor = dir === "BUYING" ? "green" : dir === "SELLING" ? "red" : "gray";
          const strColor = str === "EXTREME" ? "red" : str === "HIGH" ? "orange" : str === "MEDIUM" ? "yellow" : "gray";
          const accelColor = accel === "HIGH" ? "red" : accel === "MEDIUM" ? "yellow" : "green";
          return (
            <div className="flex flex-col gap-2">
              <StatusValue label="Direction" value={dir} color={dirColor} />
              <StatusValue label="Strength" value={str} color={strColor} />
              <StatusValue label="Acceleration" value={accel} color={accelColor} />
              <StatusValue label="Trigger" value={trigger} color="purple" />
              {summary.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-1">
                  {summary.map((line: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] mt-[3px] text-cyan-400">•</span>
                      <span className="text-[10px] text-white/50 font-mono leading-snug">{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="Liquidity Sweep">
        {(() => {
          const sweep = (positioning as any)?.liquiditySweepDetector;
          const risk = sweep?.sweepRisk || "LOW";
          const direction = sweep?.sweepDirection || "NONE";
          const trigger = sweep?.sweepTrigger || "--";
          const target = sweep?.sweepTargetZone || "--";
          const summary: string[] = sweep?.sweepSummary || [];
          const riskColor = risk === "EXTREME" ? "red" : risk === "HIGH" ? "orange" : risk === "MEDIUM" ? "yellow" : "gray";
          const dirColor = direction === "UP" ? "green" : direction === "DOWN" ? "red" : direction === "TWO_SIDED" ? "purple" : "gray";
          const bulletColor = risk === "EXTREME" || risk === "HIGH" ? "text-orange-400" : "text-white/30";
          return (
            <div className="flex flex-col gap-2">
              <LearnHelper text="Potential liquidity grab or breakout zone" />
              <div className="flex flex-col divide-y divide-white/[0.04]">
                <StatusValue label="Risk" value={risk} color={riskColor} />
                <StatusValue label="Direction" value={direction.replace(/_/g, " ")} color={dirColor} />
              </div>
              <div className="mt-1">
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Trigger</span>
                <p className="text-[10px] text-white/60 font-mono leading-snug mt-0.5" data-testid="text-sweep-trigger">{trigger}</p>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Target</span>
                <p className="text-[10px] text-white/60 font-mono leading-snug mt-0.5" data-testid="text-sweep-target">{target}</p>
              </div>
              {summary.length > 0 && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Summary</span>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {summary.map((line: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className={cn("text-[8px] mt-[3px]", bulletColor)}>•</span>
                        <span className="text-[10px] text-white/50 font-mono leading-snug">{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
                <LearnHelper text={SCENARIO_HELPERS[scenario.type] || ""} />
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
