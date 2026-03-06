import { useQuery } from "@tanstack/react-query";
import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { MarketState, DealerExposure } from "@shared/schema";

export function LeftSidebar() {
  const { data: market } = useQuery<MarketState>({ 
    queryKey: ["/api/market-state"] 
  });
  
  const { data: dealer } = useQuery<DealerExposure>({ 
    queryKey: ["/api/dealer-exposure"] 
  });

  return (
    <div className="w-64 h-full flex flex-col gap-2 overflow-y-auto p-2 border-r border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="MARKET STATE">
        <TerminalValue label="Gamma Regime" value={market?.gammaRegime ?? "--"} trend={market?.gammaRegime === "LONG GAMMA" ? "positive" : "negative"} isBadge />
        <TerminalValue label="Total GEX" value={market ? `${(market.totalGex / 1e9).toFixed(2)}B` : "--"} trend="positive" />
        <TerminalValue label="Gamma Flip" value={market?.gammaFlip.toLocaleString() ?? "--"} />
        <TerminalValue label="Distance to Flip" value={market ? `${market.distanceToFlip}%` : "--"} />
        <TerminalValue label="Transition Zone" value={market ? `${market.transitionZoneStart.toLocaleString()} – ${market.transitionZoneEnd.toLocaleString()}` : "--"} />
        <TerminalValue label="Gamma Accel" value={market?.gammaAcceleration ?? "--"} trend="positive" />
      </TerminalPanel>

      <TerminalPanel title="DEALER EXPOSURE">
        <TerminalValue label="Vanna Exposure" value={dealer ? `${(dealer.vannaExposure / 1e6).toFixed(0)}M` : "--"} trend="positive" />
        <TerminalValue label="Vanna Bias" value={dealer?.vannaBias ?? "--"} trend="positive" isBadge />
        <TerminalValue label="Charm Exposure" value={dealer ? `${(dealer.charmExposure / 1e9).toFixed(1)}B` : "--"} trend="negative" />
        <TerminalValue label="Charm Bias" value={dealer?.charmBias ?? "--"} trend="positive" isBadge />
        <TerminalValue label="Gamma Pressure" value={dealer?.gammaPressure ?? "--"} />
        <TerminalValue label="Gamma Concen." value={dealer ? `${dealer.gammaConcentration}%` : "--"} />
      </TerminalPanel>

      <TerminalPanel title="OPTIONS POSITIONING">
        <TerminalValue label="Call Wall" value="72,000" trend="negative" />
        <TerminalValue label="Put Wall" value="68,000" trend="positive" />
        <TerminalValue label="OI Concentration" value="70,000" />
        <TerminalValue label="Dealer Pivot" value="70,000" />
      </TerminalPanel>

      <TerminalPanel title="KEY LEVELS">
        <div className="space-y-4">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-muted mb-2 font-bold">GAMMA MAGNETS</div>
            <div className="flex space-x-2 font-mono text-xs">
              <span className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">70,000</span>
              <span className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">72,000</span>
              <span className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">73,000</span>
            </div>
          </div>
          
          <div className="p-2 bg-terminal-negative/5 border border-terminal-negative/20 rounded-sm">
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-negative/70 mb-1 font-bold">SHORT GAMMA POCKET</div>
            <div className="font-mono text-xs text-terminal-negative font-bold">
              69,100 – 68,400
            </div>
          </div>

          <div className="p-2 bg-white/[0.02] border border-white/5 rounded-sm">
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-muted mb-1 font-bold">DEEP RISK POCKET</div>
            <div className="font-mono text-xs text-white/80 font-bold">
              62,900 – 63,200
            </div>
          </div>
        </div>
      </TerminalPanel>

    </div>
  );
}