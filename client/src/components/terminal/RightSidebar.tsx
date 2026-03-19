import { useState, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { TradingScenario } from "@shared/schema";
import {
  buildDailyScenariosModel,
  type MarketScenarios,
  type PanelScenarioKey,
  type PanelScenarioStatus,
} from "@/lib/buildDailyScenariosModel";
import { useTerminalState } from "@/hooks/useTerminalState";
import { useSweepHistory } from "@/hooks/useSweepHistory";
import { pushSweepEvent } from "@/lib/sweepHistory";
import { LearnHelper, LearnExplanation } from "./Tooltip";
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
    refetchInterval: 5000,
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

      {(() => {
        const accelZones = (heatmap as any)?.gammaAccelerationZones as Array<{ direction: "UP" | "DOWN" }> | undefined;
        const accelActive = accelZones && accelZones.length > 0;
        const upCount = accelZones?.filter((z) => z.direction === "UP").length ?? 0;
        const downCount = accelZones?.filter((z) => z.direction === "DOWN").length ?? 0;
        const accelBias = !accelActive ? "--" : upCount > 0 && downCount > 0 ? "MIXED" : upCount > 0 ? "UP" : "DOWN";
        const biasColor = accelBias === "UP" ? "green" : accelBias === "DOWN" ? "red" : accelBias === "MIXED" ? "yellow" : "gray";
        return (
          <>
            <StatusValue label="ACCEL ZONES" value={accelActive ? "ACTIVE" : "INACTIVE"} color={accelActive ? "blue" : "gray"} />
            <StatusValue label="ACCEL BIAS" value={accelBias} color={biasColor} />
          </>
        );
      })()}
      
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

// Distance to Gamma Flip — uses market.distanceToFlip (% distance to flip level)
function DistanceToFlipBlock({ market }: { market: { gammaFlip?: number; distanceToFlip?: number } | null }) {
  const dist = market?.distanceToFlip;
  const flip = market?.gammaFlip;

  if (dist == null && flip == null) {
    return (
      <div className="text-[11px] font-mono text-white/40 py-2">—</div>
    );
  }

  const pct = dist != null ? Math.abs(dist) : 0;
  const colorClass =
    pct >= 5 ? "text-green-400"
    : pct >= 2 ? "text-yellow-400"
    : "text-red-400";
  const label = pct >= 5 ? "FAR" : pct >= 2 ? "MEDIUM" : "NEAR";

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("text-[18px] font-mono font-bold", colorClass)}>
        {dist != null ? `${dist.toFixed(2)}%` : "—"}
      </div>
      <div className="flex justify-between items-center text-[10px]">
        <span className="text-white/40 uppercase tracking-wider">Proximity</span>
        <span className={colorClass}>{label}</span>
      </div>
      {flip != null && (
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-white/40 uppercase tracking-wider">Flip level</span>
          <span className="font-mono text-white/70">{flip >= 1000 ? `${(flip / 1000).toFixed(1)}k` : flip}</span>
        </div>
      )}
    </div>
  );
}

// Liquidity Imbalance — uses heatmapSummary from positioning or /api/liquidity/heatmap fallback
function LiquidityImbalanceBlock({ positioning }: { positioning: any }) {
  const { data: heatmapApi } = useQuery<{ heatmapSummary?: { totalBidLiquidity?: number; totalAskLiquidity?: number } }>({
    queryKey: ["/api/liquidity/heatmap"],
    refetchInterval: 3000,
    enabled: !positioning?.liquidityHeatmap?.heatmapSummary
  });
  const heatmap = positioning?.liquidityHeatmap ?? heatmapApi;
  const summary = heatmap?.heatmapSummary;
  const totalBid = summary?.totalBidLiquidity ?? 0;
  const totalAsk = summary?.totalAskLiquidity ?? 0;
  const total = totalBid + totalAsk;

  if (!total || (totalBid === 0 && totalAsk === 0)) {
    return (
      <div className="text-[11px] font-mono text-white/40 py-2">Neutral / unavailable</div>
    );
  }

  const bidPct = Math.round((totalBid / total) * 100);
  const askPct = Math.round((totalAsk / total) * 100);
  const bias = bidPct > 55 ? "BUY SIDE" : askPct > 55 ? "SELL SIDE" : "NEUTRAL";
  const biasColor = bias === "BUY SIDE" ? "text-green-400" : bias === "SELL SIDE" ? "text-red-400" : "text-white/50";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center py-1">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Bids</span>
        <span className="text-[14px] font-mono font-bold text-green-400">{bidPct}%</span>
      </div>
      <div className="flex justify-between items-center py-1">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Asks</span>
        <span className="text-[14px] font-mono font-bold text-red-400">{askPct}%</span>
      </div>
      <div className="flex justify-between items-center pt-1 border-t border-white/[0.06]">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Bias</span>
        <span className={cn("text-[12px] font-mono font-bold", biasColor)}>{bias}</span>
      </div>
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

export // Structural Scenarios Panel Component
function StructuralScenariosPanel({
  onActiveScenarioChange,
  spotPrice,
}: {
  onActiveScenarioChange?: (scenario: "BASE" | "ALT" | "VOL") => void;
  spotPrice: number | null | undefined;
}) {
  const { data: scenariosData, isLoading, error } = useQuery<MarketScenarios>({
    queryKey: ["/api/scenarios"],
    refetchInterval: 8000,
  });

  const model = useMemo(() => {
    return buildDailyScenariosModel({
      scenariosData: scenariosData ?? null,
      spotPrice,
    });
  }, [scenariosData, spotPrice]);

  const getStatusColor = (st: PanelScenarioStatus): string => {
    if (st === "ACTIVE") return "text-green-400";
    if (st === "ARMED") return "text-orange-400";
    if (st === "WATCHING") return "text-yellow-400";
    if (st === "INVALIDATED") return "text-red-400";
    return "text-white/40";
  };

  const renderScenarioCard = (s: typeof model.scenarios[number]) => {
    return (
      <div
        key={s.key}
        className="rounded border border-white/[0.08] bg-terminal-panel/40 px-3 py-2.5 hover:border-white/20 cursor-pointer"
        onClick={() => onActiveScenarioChange?.(s.key)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{s.key} CASE</div>
            <div className="text-[11px] font-mono text-white/90 mt-1 leading-snug">{s.name}</div>
          </div>
          <div className="text-[10px] font-mono text-white/40">{s.probability}% prob</div>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wider text-white/40">Status</span>
          <span className={cn("text-[12px] font-mono font-bold", getStatusColor(s.status))}>{s.status}</span>
        </div>

        <div className="mt-2">
          <div className="text-[9px] uppercase tracking-wider text-white/40">Thesis</div>
          <div className="text-[10px] text-white/65 font-mono leading-snug mt-1">{s.thesis}</div>
        </div>

        <div className="mt-2 space-y-1.5">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-wider text-white/35">TRIGGER</span>
            <span className="text-[9px] font-mono text-white/60">{s.trigger}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-wider text-white/35">CONFIRMATION</span>
            <span className="text-[9px] font-mono text-white/60">{s.confirmation}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-wider text-white/35">TARGET</span>
            <span className="text-[9px] font-mono text-white/60">{s.target}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-wider text-white/35">INVALIDATION</span>
            <span className="text-[9px] font-mono text-white/60">{s.invalidation}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-wider text-white/35">Execution Bias</span>
            <span className="text-[9px] font-mono text-white/60">{s.executionBias}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-wider text-white/35">Playbook Mapping</span>
            <span className="text-[9px] font-mono text-white/60">{s.playbookMapping}</span>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-[10px] text-white/30 italic py-2">Loading scenarios...</div>;
  }

  if (error) {
    return <div className="text-[10px] text-white/30 italic py-2">Scenarios unavailable</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A) SCENARIO STACK */}
      <div className="flex flex-col gap-2.5">
        {model.scenarios.length === 0 ? (
          <div className="text-[10px] text-white/30 italic">No scenario data</div>
        ) : (
          model.scenarios.map((s) => renderScenarioCard(s))
        )}
      </div>

      {/* B) SCENARIO STATUS */}
      <div className="px-3 py-2 bg-terminal-accent/10 rounded border border-terminal-accent/30">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">SCENARIO STATUS</span>
        </div>
        <div className="mt-2 space-y-1">
          {(["BASE", "ALT", "VOL"] as PanelScenarioKey[]).map((k) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-[10px] text-white/45 font-mono">
                {k === "BASE" ? "Base Case" : k === "ALT" ? "Alt Case" : "Vol Case"}
              </span>
              <span className={cn("text-[12px] font-mono font-bold", getStatusColor(model.scenarioStatus[k]))}>
                {model.scenarioStatus[k]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* C) DOMINANT FLOW */}
      <div className="px-3 py-2 rounded border border-white/[0.08]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">DOMINANT FLOW</div>
        <div className="text-[11px] font-mono text-white/80 mt-1 leading-snug">{model.dominantFlow}</div>
      </div>

      {/* D) DAY STRUCTURE CHANGE */}
      <div className="px-3 py-2 rounded border border-white/[0.08]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/60">DAY STRUCTURE CHANGE</div>
        <div className="mt-1 space-y-1">
          {model.structureChange.map((line, i) => (
            <div key={i} className="text-[11px] font-mono text-white/70 leading-snug">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RightSidebar({ onScenarioSelect, onActiveScenarioChange }: RightSidebarProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: state, isLoading: terminalStateLoading } = useTerminalState();
  const sweepHistory = useSweepHistory();

  const market = state?.market;
  const positioning = state?.positioning;
  const tradeDecision = (positioning as any)?.tradeDecisionEngine;
  const scenarios = state?.market && (state as any).scenarios ? (state as any).scenarios : [];

  const edge = useMemo(() => deriveEdge(positioning, market), [positioning, market]);

  useEffect(() => {
    const sweep = (positioning as any)?.liquiditySweepDetector;
    if (!sweep?.type || !sweep?.sweepDirection) return;
    const eventTypes = ["CONTINUATION", "FAILED", "ABSORPTION", "EXHAUSTION"];
    if (!eventTypes.includes(sweep.type)) return;
    const zone = sweep.sweptZone ?? sweep.sweepTargetZone ?? sweep.target ?? "";
    pushSweepEvent({
      direction: sweep.sweepDirection ?? sweep.direction ?? "NONE",
      type: sweep.type,
      confidence: sweep.confidence ?? 0,
      zone: zone || "--",
      outcome: sweep.outcome,
    });
  }, [positioning]);

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
          <LearnExplanation text="VOL EXPANSION: volatility expanding, directional moves. LOW VOL: quiet range. TRANSITION: regime change. SQUEEZE RISK: short squeeze possible." />
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
          <LearnExplanation text="STATUS: wait/execute. EDGE: conviction level. SIZE: position sizing. RISK: current risk level." />
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
          <LearnExplanation text="MARKET CONDITION: setup confirmation. FLOW STATE: dealer flow. VOLATILITY RISK: expected vol level." />
        </div>
      </SidebarPanel>

      <SidebarPanel title="Liquidity Map">
        <LiquidityMapPanel />
        <LearnExplanation text="PRESSURE: bid/ask imbalance. VACUUM RISK/TYPE/SCORE: thin liquidity zones and breakout potential. ACCEL ZONES/BIAS: gamma acceleration zones and directional bias." />
      </SidebarPanel>

      <SidebarPanel title="Options Snapshot">
        {(() => {
          const opts = (state as any)?.options as {
            asOf?: string | null;
            totalGex?: number;
            gammaRegime?: "LONG_GAMMA" | "SHORT_GAMMA" | "NEUTRAL";
            gammaFlip?: number | null;
            topMagnets?: Array<{ strike: number; totalGex: number }>;
            strikes?: Array<unknown>;
            strikeCount?: number;
            primaryOiCluster?: number | null;
            primaryOiClusterUsd?: number | null;
            callWallUsd?: number | null;
            putWallUsd?: number | null;
          } | undefined;
          if (import.meta.env.DEV && opts) {
            console.log("[RightSidebar options]", opts);
            console.log("[RightSidebar options debug]", {
              keys: Object.keys(opts || {}),
              typeofPrimaryOiCluster: typeof opts?.primaryOiCluster,
              isStrikesArray: Array.isArray(opts?.strikes),
              strikesLength: opts?.strikes?.length,
            });
          }
          const fmtGex = (val: number | undefined) => {
            if (typeof val !== "number" || !Number.isFinite(val)) return "--";
            const abs = Math.abs(val);
            if (abs >= 1e9) return (val / 1e9).toFixed(2) + "B";
            if (abs >= 1e6) return (val / 1e6).toFixed(2) + "M";
            if (abs >= 1e3) return (val / 1e3).toFixed(1) + "K";
            return val.toFixed(0);
          };
          const fmtPrice = (p: number | undefined | null) => {
            if (typeof p !== "number" || !Number.isFinite(p)) return "--";
            return p >= 1000 ? p.toFixed(0) : p.toFixed(2);
          };
          const totalGexStr = fmtGex(opts?.totalGex);
          const regime = opts?.gammaRegime ?? "NEUTRAL";
          const flipStr = fmtPrice(opts?.gammaFlip ?? null);
          const topMagnets = Array.isArray(opts?.topMagnets) ? opts!.topMagnets.slice(0, 3) : [];
          const asOf =
            typeof opts?.asOf === "string" && opts.asOf
              ? new Date(opts.asOf).toLocaleTimeString(undefined, { hour12: false })
              : "--";
          const regimeColor =
            regime === "LONG_GAMMA" ? "green" : regime === "SHORT_GAMMA" ? "red" : "gray";

          const fmtNotional = (v: number | null | undefined) => {
            if (v == null || !Number.isFinite(v)) return "--";
            const abs = Math.abs(v);
            if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
            if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
            if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
            return `$${Math.round(v)}`;
          };
          const primaryOi = opts?.primaryOiCluster;
          const primaryOiUsd = opts?.primaryOiClusterUsd;
          const callWallUsd = opts?.callWallUsd;
          const putWallUsd = opts?.putWallUsd;

          return (
            <div className="flex flex-col gap-1.5">
              <StatusValue label="Gamma Regime" value={regime.replace(/_/g, " ")} color={regimeColor} />
              <StatusValue label="Total GEX" value={totalGexStr} color="gray" />
              <StatusValue label="Gamma Flip" value={flipStr} color="gray" />
              <StatusValue label="Primary OI Cluster" value={primaryOi != null ? fmtPrice(primaryOi) : "--"} color="gray" />
              <StatusValue label="Primary OI Cluster USD" value={fmtNotional(primaryOiUsd)} color="gray" />
              <StatusValue label="Call Wall USD" value={fmtNotional(callWallUsd)} color="gray" />
              <StatusValue label="Put Wall USD" value={fmtNotional(putWallUsd)} color="gray" />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Top Magnets</span>
                {topMagnets.length === 0 ? (
                  <p className="text-[10px] font-mono text-white/40 mt-0.5">none</p>
                ) : (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {topMagnets.map((m, i) => (
                      <p key={i} className="text-[10px] font-mono text-white/60">
                        {fmtPrice(m.strike)} @ {fmtGex(m.totalGex)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">
                  Strikes
                </span>
                <span className="text-[10px] font-mono text-white/60">
                  {typeof opts?.strikeCount === "number" ? opts.strikeCount : 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">
                  As Of
                </span>
                <span className="text-[10px] font-mono text-white/60">{asOf}</span>
              </div>
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="WALL STRENGTH">
        {(() => {
          const opts = (state as any)?.options as any;
          const activeCallWall = opts?.activeCallWall as number | undefined;
          const activePutWall = opts?.activePutWall as number | undefined;
          const walls = Array.isArray(opts?.gammaWallStrength)
            ? (opts.gammaWallStrength as Array<{ strike: number; strengthScore: number }>)
            : [];

          const findStrength = (strike: number | undefined) => {
            if (typeof strike !== "number" || !Number.isFinite(strike)) return 0;
            const match = walls.find((w) => w.strike === strike);
            return match?.strengthScore ?? 0;
          };

          const classifyWall = (
            strength: number,
            hasWall: boolean
          ): { state: string; scoreStr: string; color: string; guidance: string } => {
            if (!hasWall) {
              return {
                state: "N/A",
                scoreStr: "--",
                color: "gray",
                guidance: "No active wall detected in the intraday range.",
              };
            }
            if (strength <= 0) {
              return {
                state: "BROKEN",
                scoreStr: "0%",
                color: "red",
                guidance: "Wall concentration has shifted away; treat this wall as structurally broken.",
              };
            }
            const pct = (strength * 100).toFixed(1) + "%";
            if (strength >= 0.08) {
              return {
                state: "DEFENDED",
                scoreStr: pct,
                color: "green",
                guidance: "Strong gamma concentration at this wall; expect firm initial defense on tests.",
              };
            }
            if (strength >= 0.03) {
              return {
                state: "ABSORBING",
                scoreStr: pct,
                color: "orange",
                guidance: "Wall is absorbing flow with moderate concentration; breakout risk is rising.",
              };
            }
            return {
              state: "PASSIVE",
              scoreStr: pct,
              color: "gray",
              guidance: "Wall exists but gamma concentration is modest; treat as a soft reference level.",
            };
          };

          const callStrength = findStrength(activeCallWall);
          const putStrength = findStrength(activePutWall);
          const callInfo = classifyWall(callStrength, !!activeCallWall);
          const putInfo = classifyWall(putStrength, !!activePutWall);

          const guidance =
            activeCallWall || activePutWall
              ? (callInfo.state !== "N/A" ? callInfo.guidance : putInfo.guidance)
              : "No active gamma walls detected; rely more on magnets and gravity map.";

          return (
            <div className="flex flex-col gap-1.5">
              <StatusValue label="Call Wall Status" value={callInfo.state} color={callInfo.color} />
              <StatusValue label="Call Wall Strength" value={callInfo.scoreStr} color={callInfo.color} />
              <StatusValue label="Put Wall Status" value={putInfo.state} color={putInfo.color} />
              <StatusValue label="Put Wall Strength" value={putInfo.scoreStr} color={putInfo.color} />
              <p className="text-[10px] text-white/60 font-mono leading-snug mt-1">
                {guidance}
              </p>
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="GRAVITY MAP">
        {(() => {
          const gm = (state as any)?.gravityMap;
          const optsForDebug = (state as any)?.options;
          const strikesLen = Array.isArray(optsForDebug?.strikes) ? optsForDebug.strikes.length : (optsForDebug?.strikes == null ? "?" : "!arr");
          const devDebug = import.meta.env.DEV && (
            <div className="text-[8px] text-white/30 font-mono border-t border-white/10 pt-1 mt-1 space-y-0.5" data-testid="gravity-debug">
              <div>opts={optsForDebug ? "✓" : "✗"} strikes={strikesLen} primaryOiCluster={optsForDebug?.primaryOiCluster ?? "?"} gm={gm ? "✓" : "✗"} status={gm?.status ?? "n/a"}</div>
              <div>keys=[{optsForDebug ? Object.keys(optsForDebug).join(", ") : "—"}]</div>
              <div>typeof primaryOiCluster={typeof optsForDebug?.primaryOiCluster} isStrikesArray={String(Array.isArray(optsForDebug?.strikes))} strikesLen={optsForDebug?.strikes?.length ?? "—"}</div>
            </div>
          );
          if (!gm) {
            return (
              <div>
                <div className="text-[10px] text-white/40 font-mono">No gravity data</div>
                {devDebug}
              </div>
            );
          }
          const status = gm.status ?? "INACTIVE";
          const bias = gm.bias ?? "NEUTRAL";
          const primary = gm.primaryMagnet;
          const secondary = gm.secondaryMagnet;
          const repulsions = gm.repulsionZones ?? [];
          const accelerations = gm.accelerationZones ?? [];
          const summary = gm.summary ?? "";
          const statusColor = status === "ACTIVE" ? "green" : "gray";
          const biasColor = bias === "UPWARD_PULL" ? "green" : bias === "DOWNWARD_PULL" ? "red" : "gray";
          const fmtK = (p: number) => (p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p)));

          return (
            <div className="flex flex-col gap-2">
              <StatusValue label="Status" value={status} color={statusColor} />
              <StatusValue label="Bias" value={bias.replace(/_/g, " ")} color={biasColor} />
              <StatusValue label="Primary Magnet" value={primary ? `${fmtK(primary.price)} (${primary.gravityScore})` : "--"} color="purple" />
              <StatusValue label="Secondary Magnet" value={secondary ? `${fmtK(secondary.price)} (${secondary.gravityScore})` : "--"} color="gray" />
              {primary && <StatusValue label="Primary Gravity Score" value={String(primary.gravityScore)} color="gray" />}
              {repulsions.length > 0 && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Repulsion Zones</span>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {repulsions.slice(0, 3).map((z: any, i: number) => (
                      <p key={i} className="text-[10px] font-mono text-white/60">{fmtK(z.price)} · {z.strength}</p>
                    ))}
                  </div>
                </div>
              )}
              {accelerations.length > 0 && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Acceleration Zones</span>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {accelerations.slice(0, 3).map((z: any, i: number) => (
                      <p key={i} className="text-[10px] font-mono text-white/60">{z.directionBias} {fmtK(z.price)}</p>
                    ))}
                  </div>
                </div>
              )}
              {summary && <p className="text-[10px] text-white/50 font-mono leading-snug">{summary}</p>}
              <LearnExplanation text="Gravity Map combines open interest, gamma positioning, and nearby liquidity to estimate where price is more likely to be pulled, stalled, or rejected." />
              {devDebug}
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="State Coherence">
        {(() => {
          const coherence = (state as any)?.coherence as {
            state?: "COHERENT" | "MIXED" | "FLAPPING";
            coherenceScore?: number;
            flappingScore?: number;
            alignmentScore?: number;
            coherenceRead?: string;
            reasons?: string[];
            sampleWindow?: number;
          } | undefined;
          const cState = coherence?.state ?? "MIXED";
          const cColor =
            cState === "COHERENT" ? "green" : cState === "FLAPPING" ? "red" : "yellow";
          const fmtScore = (v?: number) =>
            typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)}%` : "--";
          const read =
            coherence?.coherenceRead ??
            (coherence?.sampleWindow && coherence.sampleWindow < 3
              ? "Not enough history yet."
              : "Recent transitions are mixed; structure is still resolving.");
          const reasons = Array.isArray(coherence?.reasons)
            ? coherence!.reasons.slice(0, 3)
            : [];

          return (
            <div className="flex flex-col gap-1.5">
              <StatusValue label="Coherence" value={cState} color={cColor} />
              <div className="grid grid-cols-3 gap-1">
                <StatusValue label="Coherence" value={fmtScore(coherence?.coherenceScore)} color="gray" />
                <StatusValue label="Flapping" value={fmtScore(coherence?.flappingScore)} color="gray" />
                <StatusValue label="Alignment" value={fmtScore(coherence?.alignmentScore)} color="gray" />
              </div>
              <p className="text-[10px] font-mono text-white/60 mt-0.5">{read}</p>
              {reasons.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {reasons.map((line, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] mt-[3px] text-cyan-400">•</span>
                      <span className="text-[10px] text-white/50 font-mono leading-snug">
                        {line}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="State Timeline">
        {(() => {
          const timeline = (state as any)?.timeline as
            | Array<{
                timestamp: number;
                transitionLabel: string;
                playbookState?: string | null;
                playbookBias?: string | null;
                pressureState?: string | null;
                resolutionState?: string | null;
                optionsGammaRegime?: string | null;
                optionsRegimeQuality?: string | null;
              }>
            | undefined;
          const entries = Array.isArray(timeline) ? timeline.slice(0, 8) : [];
          if (entries.length === 0) {
            return (
              <div className="text-[10px] text-white/40 font-mono">
                No transitions recorded yet.
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-1">
              {entries.map((e, idx) => {
                const time = new Date(e.timestamp).toLocaleTimeString(undefined, {
                  hour12: false,
                });
                const pb = e.playbookState || "--";
                const bias = e.playbookBias || "";
                const pressure = e.pressureState || "--";
                const res = e.resolutionState || "--";
                const optReg = e.optionsGammaRegime || "--";
                const optQual = e.optionsRegimeQuality || "--";
                return (
                  <div key={idx} className="flex flex-col gap-0.25">
                    <div className="text-[10px] font-mono text-white/70">
                      {time} — {e.transitionLabel}
                    </div>
                    <div className="text-[9px] font-mono text-white/40">
                      PB={pb}
                      {bias ? ` (${bias})` : ""} · P={pressure} · R={res} · Opt={optReg}/{optQual}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="ABSORPTION">
        {(() => {
          const rawAbsorption = state?.positioning?.absorption;
          if (typeof rawAbsorption === "object" && rawAbsorption !== null) {
            console.log("[ABSORPTION RightSidebar] state.positioning.absorption", rawAbsorption?.status, rawAbsorption?.side);
          } else {
            console.log("[ABSORPTION RightSidebar] state.positioning?.absorption", rawAbsorption, "state=" + !!state, "positioning=" + !!state?.positioning);
          }
          const INACTIVE_FALLBACK = {
            status: "INACTIVE" as const,
            side: "NONE" as const,
            confidence: 0,
            intensity: 0,
            zoneLow: null as number | null,
            zoneHigh: null as number | null,
            trigger: "No valid absorption setup",
            invalidation: "N/A",
            summary: ["No absorption setup detected"],
          };
          const absorption =
            state == null || state.positioning == null
              ? null
              : (typeof rawAbsorption === "object" && rawAbsorption !== null ? rawAbsorption : INACTIVE_FALLBACK);
          if (terminalStateLoading) {
            return (
              <div className="text-[10px] text-white/40 font-mono">Loading…</div>
            );
          }
          if (absorption == null) {
            return (
              <div className="text-[10px] text-white/40 font-mono">No absorption data</div>
            );
          }
          const status = absorption.status ?? "INACTIVE";
          const side = absorption.side ?? "NONE";
          const isBuyAbs = side === "BUY_ABSORPTION";
          const isConfirmed = status === "CONFIRMED";
          const sideColor = isBuyAbs ? "green" : side === "SELL_ABSORPTION" ? "red" : "gray";
          const statusColor = status === "CONFIRMED" ? (isBuyAbs ? "green" : "red") : status === "ACTIVE" ? "orange" : status === "SETUP" ? "yellow" : "gray";
          const fmtK = (p: number) => (p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p)));
          const zoneStr = absorption.zoneLow != null && absorption.zoneHigh != null ? `${fmtK(absorption.zoneLow)} – ${fmtK(absorption.zoneHigh)}` : "--";
          const candidateSide = (absorption as any).candidateSide ?? "NONE";
          const candidateZoneLow = (absorption as any).candidateZoneLow as number | null | undefined;
          const candidateZoneHigh = (absorption as any).candidateZoneHigh as number | null | undefined;
          const candidateRef = (absorption as any).candidateReferencePrice as number | null | undefined;
          const distanceToCandidatePct = (absorption as any).distanceToCandidatePct as number | null | undefined;
          const testReadiness = (absorption as any).testReadiness as number | undefined;
          const preAbsorptionState = (absorption as any).preAbsorptionState as
            | "NONE"
            | "CANDIDATE"
            | "APPROACHING"
            | "UNDER_TEST"
            | undefined;
          const candidateReason = (absorption as any).candidateReason as string | undefined;
          const candidateSummary = (absorption as any).candidateSummary as string[] | undefined;
          const hasCandidate =
            candidateSide && candidateSide !== "NONE" && candidateZoneLow != null && candidateZoneHigh != null;
          const candidateZoneStr =
            candidateZoneLow != null && candidateZoneHigh != null
              ? `${fmtK(candidateZoneLow)} – ${fmtK(candidateZoneHigh)}`
              : "--";
          const preStateLabel =
            preAbsorptionState === "UNDER_TEST"
              ? "UNDER TEST"
              : preAbsorptionState === "APPROACHING"
              ? "APPROACHING"
              : preAbsorptionState === "CANDIDATE"
              ? "CANDIDATE"
              : "NONE";
          const readinessVal = typeof testReadiness === "number" ? Math.max(0, Math.min(100, Math.round(testReadiness))) : 0;

          return (
            <div className="flex flex-col gap-2">
              <StatusValue label="Status" value={status} color={statusColor} />
              <StatusValue label="Side" value={side.replace(/_/g, " ")} color={sideColor} />
              <StatusValue label="Confidence" value={String(absorption.confidence ?? 0) + "%"} color={absorption.confidence && absorption.confidence >= 56 ? "orange" : "gray"} />
              <StatusValue label="Intensity" value={String(absorption.intensity ?? 0) + "%"} color="gray" />
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Active Zone</span>
                <p className="text-[10px] font-mono text-white/60 mt-0.5">{zoneStr}</p>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Trigger</span>
                <p className="text-[10px] font-mono text-white/60 mt-0.5">{absorption.trigger ?? "--"}</p>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Invalidation</span>
                <p className="text-[10px] font-mono text-white/60 mt-0.5">{absorption.invalidation ?? "N/A"}</p>
              </div>
              {hasCandidate && (
                <div className="mt-1.5 pt-1.5 border-t border-white/[0.06] flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-white/40 font-medium">Pre-Absorption Context</span>
                  <StatusValue
                    label="Candidate Side"
                    value={(candidateSide as string).replace(/_/g, " ")}
                    color={candidateSide === "BUY_ABSORPTION" ? "green" : candidateSide === "SELL_ABSORPTION" ? "red" : "gray"}
                  />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Candidate Zone</span>
                    <p className="text-[10px] font-mono text-white/60 mt-0.5">{candidateZoneStr}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Distance to Candidate</span>
                      <p className="text-[10px] font-mono text-white/60 mt-0.5">
                        {distanceToCandidatePct != null ? `${distanceToCandidatePct.toFixed(2)}%` : "--"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Pre-Absorption State</span>
                      <p className="text-[10px] font-mono text-white/60 mt-0.5">{preStateLabel}</p>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Test Readiness</span>
                      <p className="text-[10px] font-mono text-white/60 mt-0.5">{readinessVal}%</p>
                    </div>
                  </div>
                  {candidateReason && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Candidate Reason</span>
                      <p className="text-[10px] font-mono text-white/60 mt-0.5">{candidateReason}</p>
                    </div>
                  )}
                  {candidateSummary && candidateSummary.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      {candidateSummary.slice(0, 4).map((line: string, i: number) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-[8px] mt-[3px] text-cyan-400">•</span>
                          <span className="text-[10px] text-white/50 font-mono leading-snug">{line}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {absorption.summary && absorption.summary.length > 0 && (
                <div className="flex flex-col gap-0.5 pt-1 border-t border-white/[0.06]">
                  {absorption.summary.slice(0, 4).map((line: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] mt-[3px] text-cyan-400">•</span>
                      <span className="text-[10px] text-white/50 font-mono leading-snug">{line}</span>
                    </div>
                  ))}
                </div>
              )}
              <LearnExplanation text="Absorption: aggressive flow into resting liquidity that fails to break through. Candidate zones highlight where that behavior is most likely to appear next. Invalidation = clean break beyond the active or candidate zone; use it to exit or reverse." />
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="Distance to Gamma Flip">
        <DistanceToFlipBlock market={market} />
      </SidebarPanel>

      <SidebarPanel title="Liquidity Imbalance">
        <LiquidityImbalanceBlock positioning={positioning} />
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
          const risk = sweep?.sweepRisk ?? sweep?.risk ?? "LOW";
          const direction = sweep?.sweepDirection ?? "NONE";
          const trigger = sweep?.sweepTrigger ?? sweep?.trigger ?? "--";
          const target = sweep?.sweepTargetZone ?? sweep?.target ?? "--";
          const summary: string[] = sweep?.sweepSummary ?? sweep?.summary ?? [];
          const status = sweep?.status ?? "IDLE";
          const type = sweep?.type ?? "";
          const confidence = sweep?.confidence ?? 0;
          const invalidation = sweep?.invalidation ?? "--";
          const sweptZone = sweep?.sweptZone ?? "--";
          const outcome = sweep?.outcome ?? "N/A";
          const confluence = sweep?.confluence;
          const execStats = sweep?.executionStats as { zoneSizeBTC?: number; aggressionScore?: number; displacementPct?: number } | undefined;
          const riskColor = risk === "EXTREME" ? "red" : risk === "HIGH" ? "orange" : risk === "MEDIUM" ? "yellow" : "gray";
          const dirColor = direction === "UP" ? "green" : direction === "DOWN" ? "red" : direction === "TWO_SIDED" ? "purple" : "gray";
          const bulletColor = risk === "EXTREME" || risk === "HIGH" ? "text-orange-400" : "text-white/30";
          return (
            <div className="flex flex-col gap-2">
              <LearnHelper text="Institutional sweep detection: setup, trigger, type, outcome" />
              <div className="flex flex-col divide-y divide-white/[0.04]">
                <StatusValue label="Status" value={status.replace(/_/g, " ")} color="gray" />
                <StatusValue label="Risk" value={risk} color={riskColor} />
                <StatusValue label="Direction" value={direction.replace(/_/g, " ")} color={dirColor} />
                {type && <StatusValue label="Type" value={type.replace(/_/g, " ")} color="gray" />}
                {confidence > 0 && <StatusValue label="Confidence" value={`${confidence}%`} color={confidence >= 60 ? "green" : confidence >= 30 ? "yellow" : "gray"} />}
                {outcome !== "N/A" && outcome !== "PENDING" && <StatusValue label="Outcome" value={outcome.replace(/_/g, " ")} color="gray" />}
              </div>
              <div className="mt-1">
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Trigger</span>
                <p className="text-[10px] text-white/60 font-mono leading-snug mt-0.5" data-testid="text-sweep-trigger">{trigger}</p>
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Target</span>
                <p className="text-[10px] text-white/60 font-mono leading-snug mt-0.5" data-testid="text-sweep-target">{target}</p>
              </div>
              {invalidation !== "--" && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Invalidation</span>
                  <p className="text-[10px] text-white/50 font-mono leading-snug mt-0.5">{invalidation}</p>
                </div>
              )}
              {sweptZone !== "--" && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Swept zone</span>
                  <p className="text-[10px] text-amber-400/80 font-mono leading-snug mt-0.5">{sweptZone}</p>
                </div>
              )}
              {confluence && (confluence.score > 0 || confluence.factors?.length) && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Confluence</span>
                  <p className="text-[10px] text-white/50 font-mono mt-0.5">Score: {confluence.score}</p>
                  {confluence.factors?.length > 0 && (
                    <ul className="mt-0.5 list-disc list-inside text-[9px] text-white/40 space-y-0.5">
                      {confluence.factors.slice(0, 3).map((f: string, i: number) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {execStats?.zoneSizeBTC != null && (
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Zone size</span>
                  <p className="text-[10px] text-white/50 font-mono mt-0.5">~{Number(execStats.zoneSizeBTC).toFixed(1)} BTC</p>
                </div>
              )}
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
              {sweepHistory.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-medium">Recent sweeps</span>
                  <ul className="mt-1.5 space-y-1 max-h-[140px] overflow-y-auto">
                    {sweepHistory.slice(0, 8).map((e, i) => (
                      <li key={`${e.timestamp}-${e.type}-${e.zone}-${i}`} className="text-[9px] font-mono text-white/50 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="text-white/35">{new Date(e.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        <span className={e.direction === "UP" ? "text-green-400/80" : e.direction === "DOWN" ? "text-red-400/80" : "text-purple-400/80"}>{e.direction}</span>
                        <span className="text-amber-400/80">{e.type.replace(/_/g, " ")}</span>
                        {e.confidence > 0 && <span className="text-white/40">{e.confidence}%</span>}
                        <span className="text-white/30 truncate max-w-[120px]" title={e.zone}>{e.zone}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      </SidebarPanel>

      <SidebarPanel title="DAILY SCENARIOS">
        <StructuralScenariosPanel
          onActiveScenarioChange={onActiveScenarioChange}
          spotPrice={(state as any)?.options?.spot ?? (state as any)?.ticker?.price ?? null}
        />
      </SidebarPanel>

    </div>
  );
}

export default RightSidebar;
