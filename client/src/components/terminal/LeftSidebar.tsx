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
        message: "Dealer hedging flow is accelerating.",
        timestamp: new Date().toLocaleTimeString(),
        type: "info"
      });
    }
    return list;
  }, [market, flow]);

  return (
    <div className="w-64 h-full flex flex-col gap-2 overflow-y-auto p-2 border-r border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="ALERT CENTER">
        <div className="p-3 space-y-2">
          {alerts.length === 0 ? (
            <div className="py-4 px-2 border border-dashed border-white/10 rounded-sm text-center">
              <div className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">NO ACTIVE ALERTS</div>
              <div className="text-[9px] text-terminal-muted leading-tight">System monitoring flow conditions...</div>
            </div>
          ) : (
            alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={cn(
                  "p-3 rounded-sm border-l-4 bg-white",
                  alert.type === "warning" ? "border-yellow-500" : 
                  alert.type === "error" ? "border-red-500" : "border-blue-500"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-bold text-black uppercase tracking-tight leading-none">{alert.title}</span>
                  <span className="text-[8px] font-mono text-gray-500 leading-none">{alert.timestamp}</span>
                </div>
                <div className="text-[10px] text-black font-medium leading-tight">
                  {alert.message}
                </div>
              </div>
            ))
          )}
        </div>
      </TerminalPanel>

      <TerminalPanel title="MARKET STATE">
        <TerminalValue label="Gamma Regime" value={market?.gammaRegime ?? "--"} trend={market?.gammaRegime === "LONG GAMMA" ? "positive" : "negative"} isBadge />
        <TerminalValue label="Total GEX" value={market ? `${(market.totalGex / 1e9).toFixed(2)}B` : "--"} trend={market && market.totalGex > 0 ? "positive" : "negative"} />
        <TerminalValue label="Gamma Flip" value={market?.gammaFlip ?? "--"} />
        <TerminalValue label="Dist. to Flip" value={market?.distanceToFlip != null ? `${market.distanceToFlip.toFixed(2)}%` : "--"} trend={market && market.distanceToFlip < 5 ? "positive" : "neutral"} />
        <TerminalValue label="Transition Zone" value={market?.transitionZoneStart != null && market?.transitionZoneEnd != null ? `${Math.round(market.transitionZoneStart)} - ${Math.round(market.transitionZoneEnd)}` : "--"} />
        <TerminalValue label="Gamma Accel" value={market?.gammaAcceleration ?? "--"} trend="positive" />
      </TerminalPanel>

      <TerminalPanel title="DEALER EXPOSURE">
        <TerminalValue label="Vanna Exposure" value={dealer ? `${dealer.vannaExposure >= 0 ? "+" : ""}${dealer.vannaExposure.toFixed(2)}` : "--"} trend={dealer && dealer.vannaExposure > 0 ? "positive" : "negative"} />
        <TerminalValue label="Vanna Bias" value={dealer?.vannaBias ?? "--"} trend={dealer?.vannaBias === "BULLISH" ? "positive" : "negative"} isBadge />
        <TerminalValue label="Charm Exposure" value={dealer ? `${dealer.charmExposure >= 0 ? "+" : ""}${dealer.charmExposure.toFixed(2)}` : "--"} trend={dealer && dealer.charmExposure > 0 ? "positive" : "negative"} />
        <TerminalValue label="Charm Bias" value={dealer?.charmBias ?? "--"} trend={dealer?.charmBias === "BULLISH" ? "positive" : "negative"} isBadge />
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
        <TerminalValue label="Call Wall" value={positioning?.callWall ? positioning.callWall.toLocaleString() : "--"} trend="negative" />
        <TerminalValue label="Put Wall" value={positioning?.putWall ? positioning.putWall.toLocaleString() : "--"} trend="positive" />
        <TerminalValue label="OI Concentration" value={positioning?.oiConcentration ? positioning.oiConcentration.toLocaleString() : "--"} />
        <TerminalValue label="Dealer Pivot" value={positioning?.dealerPivot ?? "--"} />
      </TerminalPanel>

      <TerminalPanel title="KEY LEVELS">
        <div className="space-y-4">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-muted mb-2 font-bold">GAMMA MAGNETS</div>
            <div className="flex space-x-2 font-mono text-xs">
              {levels?.gammaMagnets.map((m, i) => (
                <span key={i} className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">
                  {(m/1000).toFixed(0)}k
                </span>
              ))}
              {!levels && <span className="text-terminal-muted">--</span>}
            </div>
          </div>
          
          <div className="p-2 bg-terminal-negative/5 border border-terminal-negative/20 rounded-sm">
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-negative/70 mb-1 font-bold">SHORT GAMMA POCKET</div>
            <div className="font-mono text-xs text-terminal-negative font-bold">
              {levels ? `${levels.shortGammaPocketStart.toLocaleString()} – ${levels.shortGammaPocketEnd.toLocaleString()}` : "--"}
            </div>
          </div>

          <div className="p-2 bg-white/[0.02] border border-white/5 rounded-sm">
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-muted mb-1 font-bold">DEEP RISK POCKET</div>
            <div className="font-mono text-xs text-white/80 font-bold">
              {levels ? `${levels.deepRiskPocketStart.toLocaleString()} – ${levels.deepRiskPocketEnd.toLocaleString()}` : "--"}
            </div>
          </div>
        </div>
      </TerminalPanel>

    </div>
  );
}
