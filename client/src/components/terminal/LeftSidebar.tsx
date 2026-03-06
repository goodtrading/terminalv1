import { useQuery } from "@tanstack/react-query";
import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { MarketState, DealerExposure, OptionsPositioning, KeyLevels } from "@shared/schema";

export function LeftSidebar() {
  const { data: market } = useQuery<MarketState>({ 
    queryKey: ["/api/market-state"],
    refetchInterval: 5000 
  });
  
  const { data: dealer } = useQuery<DealerExposure>({ 
    queryKey: ["/api/dealer-exposure"],
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

  return (
    <div className="w-64 h-full flex flex-col gap-2 overflow-y-auto p-2 border-r border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="MARKET STATE">
        <TerminalValue label="Gamma Regime" value={market?.gammaRegime ?? "--"} trend={market?.gammaRegime === "LONG GAMMA" ? "positive" : "negative"} isBadge />
        <TerminalValue label="Total GEX" value={market ? `${(market.totalGex / 1e9).toFixed(2)}B` : "--"} trend={market && market.totalGex > 0 ? "positive" : "negative"} />
        <TerminalValue label="Gamma Flip" value={market?.gammaFlip.toLocaleString() ?? "--"} />
        <TerminalValue label="Distance to Flip" value={market ? `${market.distanceToFlip.toFixed(2)}%` : "--"} />
        <TerminalValue label="Transition Zone" value={market ? `${Math.round(market.transitionZoneStart).toLocaleString()} – ${Math.round(market.transitionZoneEnd).toLocaleString()}` : "--"} />
        <TerminalValue label="Gamma Accel" value={market?.gammaAcceleration ?? "--"} trend="positive" />
      </TerminalPanel>

      <TerminalPanel title="DEALER EXPOSURE">
        <TerminalValue label="Vanna Exposure" value={dealer ? `${(dealer.vannaExposure / 1e6).toFixed(0)}M` : "--"} trend={dealer && dealer.vannaExposure > 0 ? "positive" : "negative"} />
        <TerminalValue label="Vanna Bias" value={dealer?.vannaBias ?? "--"} trend={dealer?.vannaBias === "BULLISH" ? "positive" : "negative"} isBadge />
        <TerminalValue label="Charm Exposure" value={dealer ? `${(dealer.charmExposure / 1e9).toFixed(1)}B` : "--"} trend={dealer && dealer.charmExposure > 0 ? "positive" : "negative"} />
        <TerminalValue label="Charm Bias" value={dealer?.charmBias ?? "--"} trend={dealer?.charmBias === "BULLISH" ? "positive" : "negative"} isBadge />
        <TerminalValue label="Gamma Pressure" value={dealer?.gammaPressure ?? "--"} />
        <TerminalValue label="Gamma Concen." value={dealer ? `${dealer.gammaConcentration}%` : "--"} />
      </TerminalPanel>

      <TerminalPanel title="OPTIONS POSITIONING">
        <TerminalValue label="Call Wall" value={positioning?.callWall.toLocaleString() ?? "--"} trend="negative" />
        <TerminalValue label="Put Wall" value={positioning?.putWall.toLocaleString() ?? "--"} trend="positive" />
        <TerminalValue label="OI Concentration" value={positioning?.oiConcentration.toLocaleString() ?? "--"} />
        <TerminalValue label="Dealer Pivot" value={positioning?.dealerPivot.toLocaleString() ?? "--"} />
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