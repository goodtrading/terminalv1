import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TradingScenario } from "@shared/schema";
import { useTerminalState } from "@/hooks/useTerminalState";
import { LearnHelper } from "./Tooltip";
import { useQuery } from "@tanstack/react-query";

// Import vacuum engine types
interface VacuumAnalysisResult {
  vacuumRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  vacuumScore: number;
  vacuumType: "DIRECTIONAL" | "COMPRESSION" | "NONE";
  vacuumDirection: "UP" | "DOWN" | "NEUTRAL";
  vacuumProximity: "FAR" | "MEDIUM" | "NEAR" | "IMMEDIATE";
  nearestThinLiquidityZone: number | null;
  nearestThinLiquidityDirection: "ABOVE" | "BELOW" | "NONE";
  nearestThinLiquidityScore: number;
  confirmedVacuumActive: boolean;
  activeZones: Array<{
    start: number;
    end: number;
    direction: "UP" | "DOWN";
    score: number;
    thickness: "THIN" | "VERY_THIN" | "EMPTY";
  }>;
  explanation: {
    summary: string[];
    drivers: string[];
    invalidation: string[];
  };
}

// Structural scenarios types
interface StructuralScenario {
  probability: number;
  title: string;
  summary: string;
  regime: string;
  trigger: string;
  target: string;
  invalidation: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
}

interface MarketScenarios {
  marketRegime: string;
  baseCase: StructuralScenario;
  altCase: StructuralScenario;
  volCase: StructuralScenario;
}

interface RightSidebarProps {
  onScenarioSelect?: (scenario: TradingScenario | null) => void;
  onActiveScenarioChange?: (scenario: "BASE" | "ALT" | "VOL") => void;
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

// Liquidity Map Panel Component
function LiquidityMapPanel() {
  const positioning_engines = useTerminalState((s: any) => s.positioning_engines);
  const { data: vacuumData } = useQuery<VacuumAnalysisResult>({
    queryKey: ["/api/vacuum"],
    refetchInterval: 2000,
    enabled: !!positioning_engines
  });

  const heatmap = (positioning_engines as any)?.liquidityHeatmap;
  const lines: string[] = heatmap?.liquidityMapLines || [];
  const pressure = heatmap?.liquidityPressure || "BALANCED";
  const source = heatmap?.heatmapSummary?.source || "--";
  const pressureColor = pressure === "BID_HEAVY" ? "green" : pressure === "ASK_HEAVY" ? "red" : "yellow";

  // Use new vacuum engine data
  const vacuum = vacuumData;
  const vacuumRisk = vacuum?.vacuumRisk || "LOW";
  const vacuumScore = vacuum?.vacuumScore || 0;
  const vacuumType = vacuum?.vacuumType || "NONE";
  const vacuumDirection = vacuum?.vacuumDirection || "NEUTRAL";
  const vacuumProximity = vacuum?.vacuumProximity || "FAR";
  const vacuumZones = vacuum?.activeZones?.length || 0;
  const confirmedVacuum = vacuum?.confirmedVacuumActive || false;
  
  const vacuumRiskColor = vacuumRisk === "EXTREME" ? "red" : vacuumRisk === "HIGH" ? "orange" : vacuumRisk === "MEDIUM" ? "yellow" : "gray";
  const proximityColor = vacuumProximity === "IMMEDIATE" ? "red" : vacuumProximity === "NEAR" ? "orange" : vacuumProximity === "MEDIUM" ? "yellow" : "gray";
  
  // Vacuum type color logic
  const getVacuumTypeColor = () => {
    if (vacuumType === "DIRECTIONAL") {
      return vacuumDirection === "UP" ? "green" : vacuumDirection === "DOWN" ? "red" : "gray";
    } else if (vacuumType === "COMPRESSION") {
      return "purple"; // Magenta/purple for compression
    }
    return "gray"; // NONE
  };
  
  const vacuumTypeColor = getVacuumTypeColor();
  const directionColor = vacuumDirection === "UP" ? "green" : vacuumDirection === "DOWN" ? "red" : "gray";
  
  const thinZone = vacuum?.nearestThinLiquidityZone;
  const thinDir = vacuum?.nearestThinLiquidityDirection;
  const fmtK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p));
  const thinLabel = thinZone ? `${fmtK(thinZone)} ${thinDir === "ABOVE" ? "ABOVE" : "BELOW"}` : "--";
  
  return (
    <div className="flex flex-col gap-2">
      <StatusValue label="Pressure" value={pressure.replace(/_/g, " ")} color={pressureColor} />
      <StatusValue label="Vacuum Risk" value={vacuumRisk} color={vacuumRiskColor} />
      <StatusValue label="Vacuum Type" value={vacuumType} color={vacuumTypeColor} />
      <StatusValue label="Vacuum Score" value={String(vacuumScore)} color={vacuumScore >= 50 ? "orange" : "gray"} />
      <StatusValue label="Vacuum Direction" value={vacuumDirection} color={directionColor} />
      <StatusValue label="Vacuum Proximity" value={vacuumProximity} color={proximityColor} />
      <StatusValue label="Thin Liquidity" value={thinLabel} color={thinZone ? "blue" : "gray"} />
      <StatusValue label="Vacuum Zones" value={String(vacuumZones)} color={vacuumZones > 0 ? "blue" : "gray"} />
      <StatusValue label="Confirmed Vacuum" value={confirmedVacuum ? "ACTIVE" : "INACTIVE"} color={confirmedVacuum ? "red" : "gray"} />
      
      {/* Explanation bullets */}
      {vacuum?.explanation?.summary && (
        <div className="flex flex-col gap-0.5">
          {vacuum.explanation.summary.slice(0, 3).map((explanation: string, i: number) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[8px] mt-[3px] text-yellow-400">•</span>
              <span className="text-[10px] text-white/50 font-mono leading-snug">{explanation}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Active zones */}
      {vacuum?.activeZones?.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {vacuum.activeZones.slice(0, 3).map((z: any, i: number) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[8px] mt-[3px] text-blue-400">◆</span>
              <span className="text-[10px] text-white/50 font-mono leading-snug">
                {z.direction} {fmtK(z.start)}–{fmtK(z.end)} {z.thickness} ({Math.round(z.score)}%)
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

export // Structural Scenarios Panel Component
function StructuralScenariosPanel({ onActiveScenarioChange }: { onActiveScenarioChange?: (scenario: "BASE" | "ALT" | "VOL") => void }) {
  const { data: scenariosData, isLoading, error } = useQuery<MarketScenarios>({
    queryKey: ["/api/scenarios"],
    refetchInterval: 5000,
  });

  const getRegimeColor = (regime?: string) => {
    if (!regime) return "text-gray-400";
    if (regime.includes("LONG GAMMA")) return "text-blue-400";
    if (regime.includes("SHORT GAMMA")) return "text-red-400";
    if (regime.includes("COMPRESSION")) return "text-purple-400";
    if (regime.includes("NEUTRAL")) return "text-gray-400";
    return "text-white/60";
  };

  const getBiasColor = (bias?: string) => {
    if (!bias) return "text-gray-400";
    if (bias === "BULLISH") return "text-green-400";
    if (bias === "BEARISH") return "text-red-400";
    return "text-gray-400";
  };

  const renderScenarioCard = (scenario: StructuralScenario | undefined, type: "BASE" | "ALT" | "VOL") => {
    if (!scenario) {
      return (
        <div className="rounded border border-gray-500/30">
          <div className="px-3 py-2 border-b border-white/[0.06] bg-gray-900/20">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {type} CASE
              </span>
              <span className="text-[9px] font-mono text-white/40">--%</span>
            </div>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-[10px] text-white/60 italic">Scenario data unavailable</p>
          </div>
        </div>
      );
    }

    const cardColors = {
      BASE: { bg: "bg-blue-900/20", border: "border-blue-500/30", text: "text-blue-400" },
      ALT: { bg: "bg-green-900/20", border: "border-green-500/30", text: "text-green-400" },
      VOL: { bg: "bg-orange-900/20", border: "border-orange-500/30", text: "text-orange-400" }
    };

    const colors = cardColors[type];

    return (
      <div 
        className={`rounded border ${colors.border} transition-colors hover:border-white/20 cursor-pointer`}
        onClick={() => onActiveScenarioChange?.(type)}
      >
        <div className={`px-3 py-2 border-b border-white/[0.06] ${colors.bg}`}>
          <div className="flex justify-between items-center">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
              {type} CASE
            </span>
            <span className="text-[9px] font-mono text-white/40">{scenario.probability || 0}%</span>
          </div>
        </div>
        <div className="px-3 py-2.5 space-y-2">
          <div>
            <p className="text-[10px] text-white/80 font-medium leading-relaxed">{scenario.title || 'Untitled'}</p>
            <p className="text-[9px] text-white/60 leading-relaxed mt-1">{scenario.summary || 'No summary available'}</p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[8px] text-white/40 uppercase tracking-wide">Regime</span>
              <span className="text-[8px] font-mono text-white/60">{scenario.regime || 'Unknown'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-mono text-white/40 uppercase tracking-wide">TRIGGER</span>
              <span className="text-[8px] font-mono text-white/60">{scenario.trigger}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-mono text-white/40 uppercase tracking-wide">TARGET</span>
              <span className="text-[8px] font-mono text-white/60">{scenario.target}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-mono text-white/40 uppercase tracking-wide">INVALIDATION</span>
              <span className="text-[8px] font-mono text-white/60">{scenario.invalidation}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] text-white/40 uppercase tracking-wide">Bias</span>
              <span className={`text-[8px] font-mono ${getBiasColor(scenario.bias)}`}>{scenario.bias || 'NEUTRAL'}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[10px] text-white/30 italic py-2">Loading scenarios...</div>
      </div>
    );
  }

  if (error || !scenariosData) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[10px] text-white/30 italic py-2">Scenarios unavailable</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Market Regime */}
      <div className="px-3 py-2 bg-terminal-accent/10 rounded border border-terminal-accent/30">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">MARKET REGIME</span>
        </div>
        <div className={`text-[11px] font-medium mt-1 ${getRegimeColor(scenariosData.marketRegime)}`}>
          {scenariosData.marketRegime || 'Unknown'}
        </div>
      </div>

      {/* Scenario Cards */}
      <div className="flex flex-col gap-3">
        {renderScenarioCard(scenariosData.baseCase, "BASE")}
        {renderScenarioCard(scenariosData.altCase, "ALT")}
        {renderScenarioCard(scenariosData.volCase, "VOL")}
      </div>
    </div>
  );
}

function RightSidebar({ onScenarioSelect, onActiveScenarioChange }: RightSidebarProps) {
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
        <LiquidityMapPanel />
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

      <SidebarPanel title="DAILY SCENARIOS">
        <StructuralScenariosPanel onActiveScenarioChange={onActiveScenarioChange} />
      </SidebarPanel>

    </div>
  );
}

export default RightSidebar;
