import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { MarketState, DealerExposure, OptionsPositioning, KeyLevels, DealerHedgingFlow } from "@shared/schema";
import { cn } from "@/lib/utils";

interface Alert {
  id: number;
  title: string;
  message: string;
  timestamp: string;
  type: "info" | "warning" | "error";
}

export function LeftSidebar() {
  const { data: market } = useQuery<MarketState>({ 
    queryKey: ["/api/market-state"],
    refetchInterval: 5000 
  });
  
  const { data: dealer } = useQuery<DealerExposure>({ 
    queryKey: ["/api/dealer-exposure"],
    refetchInterval: 5000 
  });

  const { data: flow } = useQuery<DealerHedgingFlow>({ 
    queryKey: ["/api/dealer-hedging-flow"],
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

  // Derived alerts logic
  const alerts = useMemo(() => {
    const list: Alert[] = [];
    
    if (market?.gammaRegime === "SHORT GAMMA") {
      list.push({
        id: 1,
        title: "VOLATILITY RISK",
        message: "Short Gamma regime active. Expect accelerated moves.",
        timestamp: new Date().toLocaleTimeString(),
        type: "warning"
      });
    }

    if (flow?.hedgeFlowIntensity === "HIGH") {
      list.push({
        id: 2,
        title: "HIGH FLOW INTENSITY",
        message: `Dealer hedging flow is accelerating (${flow.hedgeFlowBias}).`,
        timestamp: new Date().toLocaleTimeString(),
        type: "error"
      });
    }

    if (dealer?.gammaPressure && parseFloat(dealer.gammaPressure) > 0.7) {
      list.push({
        id: 3,
        title: "GAMMA PRESSURE",
        message: `High directional pressure detected: ${dealer.gammaPressure}`,
        timestamp: new Date().toLocaleTimeString(),
        type: "warning"
      });
    }

    if (dealer && dealer.gammaConcentration > 0.8) {
      list.push({
        id: 4,
        title: "GAMMA CONCENTRATION",
        message: "Dealer exposure is highly concentrated near spot.",
        timestamp: new Date().toLocaleTimeString(),
        type: "info"
      });
    }

    if (flow?.accelerationRisk === "HIGH") {
      list.push({
        id: 5,
        title: "ACCELERATION RISK",
        message: "High risk of non-linear price movement.",
        timestamp: new Date().toLocaleTimeString(),
        type: "error"
      });
    }

    return list;
  }, [market, flow, dealer]);

  return (
    <div className="w-64 h-full flex flex-col gap-1 overflow-y-auto p-1 border-r border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="ALERT CENTER">
        <div className="p-2 space-y-2">
          {alerts.length === 0 ? (
            <div className="py-3 px-2 border border-dashed border-white/10 rounded-sm text-center bg-terminal-panel/30">
              <div className="terminal-text-label mb-1 text-[9px]">NO ACTIVE ALERTS</div>
              <div className="text-[9px] terminal-text-muted leading-tight">System monitoring flow conditions...</div>
            </div>
          ) : (
            alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={cn(
                  "p-2 terminal-card border-l-2",
                  alert.type === "warning" ? "border-l-yellow-500" : 
                  alert.type === "error" ? "border-l-terminal-negative" : "border-l-blue-500"
                )}
              >
                <div className="flex justify-between items-start mb-0.5">
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-tight leading-none",
                    alert.type === "warning" ? "text-yellow-500" : 
                    alert.type === "error" ? "text-terminal-negative" : "text-blue-400"
                  )}>{alert.title}</span>
                  <span className="text-[7px] font-mono terminal-text-muted leading-none">{alert.timestamp}</span>
                </div>
                <div className="text-[9px] terminal-text-secondary font-bold leading-tight">
                  {alert.message}
                </div>
              </div>
            ))
          )}
        </div>
      </TerminalPanel>

      <TerminalPanel title="MARKET STATE">
        <TerminalValue label="Gamma Regime" value={market?.gammaRegime ?? "--"} trend={market?.gammaRegime === "LONG GAMMA" ? "positive" : "negative"} isBadge tooltip="Gamma Regime" />
        <TerminalValue label="Total GEX" value={market ? `${(market.totalGex / 1e9).toFixed(2)}B` : "--"} trend={market && market.totalGex > 0 ? "positive" : "negative"} />
        <TerminalValue label="Gamma Flip" value={market?.gammaFlip ?? "--"} tooltip="Gamma Flip" />
        <TerminalValue label="Dist. to Flip" value={market?.distanceToFlip != null ? `${market.distanceToFlip.toFixed(2)}%` : "--"} trend={market && market.distanceToFlip < 5 ? "positive" : "neutral"} />
        <TerminalValue label="Transition Zone" value={market?.transitionZoneStart != null && market?.transitionZoneEnd != null ? `${Math.round(market.transitionZoneStart)} - ${Math.round(market.transitionZoneEnd)}` : "--"} tooltip="Transition Zone" />
        <TerminalValue label="Gamma Accel" value={market?.gammaAcceleration ?? "--"} trend="positive" />
      </TerminalPanel>

      <TerminalPanel title="DEALER EXPOSURE">
        <TerminalValue label="Vanna Exposure" value={dealer ? `${dealer.vannaExposure >= 0 ? "+" : ""}${dealer.vannaExposure.toFixed(2)}` : "--"} trend={dealer && dealer.vannaExposure > 0 ? "positive" : "negative"} tooltip="Vanna Exposure" />
        <TerminalValue label="Vanna Bias" value={dealer?.vannaBias ?? "--"} trend={dealer?.vannaBias === "BULLISH" ? "positive" : "negative"} isBadge tooltip="Vanna Bias" />
        <TerminalValue label="Charm Exposure" value={dealer ? `${dealer.charmExposure >= 0 ? "+" : ""}${dealer.charmExposure.toFixed(2)}` : "--"} trend={dealer && dealer.charmExposure > 0 ? "positive" : "negative"} tooltip="Charm Exposure" />
        <TerminalValue label="Charm Bias" value={dealer?.charmBias ?? "--"} trend={dealer?.charmBias === "BULLISH" ? "positive" : "negative"} isBadge tooltip="Charm Bias" />
        <TerminalValue label="Gamma Pressure" value={dealer?.gammaPressure ?? "--"} />
        <TerminalValue label="Gamma Concen." value={dealer ? dealer.gammaConcentration.toFixed(2) : "--"} />
      </TerminalPanel>

      <TerminalPanel title="DEALER HEDGING FLOW">
        <TerminalValue label="Flow Bias" value={flow?.hedgeFlowBias ?? "--"} trend={flow?.hedgeFlowBias === "BUYING" ? "positive" : flow?.hedgeFlowBias === "SELLING" ? "negative" : "neutral"} />
        <TerminalValue label="Intensity" value={flow?.hedgeFlowIntensity ?? "--"} />
        <TerminalValue label="Acceleration Risk" value={flow?.accelerationRisk ?? "--"} trend={flow?.accelerationRisk === "HIGH" ? "negative" : "positive"} />
        <TerminalValue label="Trigger Up" value={flow?.flowTriggerUp ? Math.round(flow.flowTriggerUp).toLocaleString() : "--"} />
        <TerminalValue label="Trigger Down" value={flow?.flowTriggerDown ? Math.round(flow.flowTriggerDown).toLocaleString() : "--"} />
      </TerminalPanel>

      <TerminalPanel title="OPTIONS POSITIONING">
        <TerminalValue label="Call Wall" value={positioning?.callWall ? positioning.callWall.toLocaleString() : "--"} trend="negative" tooltip="Call Wall" />
        <TerminalValue label="Put Wall" value={positioning?.putWall ? positioning.putWall.toLocaleString() : "--"} trend="positive" tooltip="Put Wall" />
        <TerminalValue label="OI Concentration" value={positioning?.oiConcentration ? positioning.oiConcentration.toLocaleString() : "--"} tooltip="OI Concentration" />
        <TerminalValue label="Dealer Pivot" value={positioning?.dealerPivot ?? "--"} tooltip="Dealer Pivot" />
      </TerminalPanel>

      <TerminalPanel title="KEY LEVELS">
        <div className="space-y-3">
          <div>
            <div className="terminal-text-label mb-1.5 text-[9px]">GAMMA MAGNETS</div>
            <div className="flex space-x-1.5 font-mono text-[10px]">
              {levels?.gammaMagnets.map((m, i) => (
                <span key={i} className="terminal-card px-1.5 py-0.5 terminal-text-primary font-bold">
                  {(m/1000).toFixed(0)}k
                </span>
              ))}
              {!levels && <span className="terminal-text-muted">--</span>}
            </div>
          </div>
          
          <div className="p-1.5 bg-terminal-negative/10 border border-terminal-negative/20 rounded-sm">
            <div className="text-[8px] uppercase tracking-[0.2em] text-terminal-negative mb-0.5 font-bold">SHORT GAMMA POCKET</div>
            <div className="font-mono text-[10px] text-terminal-negative font-bold">
              {levels ? `${levels.shortGammaPocketStart.toLocaleString()} – ${levels.shortGammaPocketEnd.toLocaleString()}` : "--"}
            </div>
          </div>

          <div className="p-1.5 terminal-card">
            <div className="terminal-text-label mb-0.5 text-[8px]">DEEP RISK POCKET</div>
            <div className="font-mono text-[10px] terminal-text-secondary font-bold">
              {levels ? `${levels.deepRiskPocketStart.toLocaleString()} – ${levels.deepRiskPocketEnd.toLocaleString()}` : "--"}
            </div>
          </div>
        </div>
      </TerminalPanel>

    </div>
  );
}
