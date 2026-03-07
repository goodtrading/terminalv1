import { TerminalPanel } from "./TerminalPanel";
import { cn } from "@/lib/utils";
import { useTerminalState } from "@/hooks/useTerminalState";

export function GammaProfile() {
  const { data: state } = useTerminalState();
  const positioning = state?.positioning;
  const market = state?.market;

  // Expand range to cover more strikes, centering around spot/walls
  const strikes = Array.from({ length: 41 }, (_, i) => 60000 + i * 500);
  
  const generateGamma = (strike: number) => {
    if (!market || !positioning) {
      if (strike < 68000) return (68000 - strike) * -1.5; 
      if (strike === 69000) return -500;
      const dist = Math.abs(72000 - strike);
      return Math.max(0, 5000 - dist * 1.5);
    }
    
    if (strike === positioning.callWall) return 5000;
    if (strike === positioning.putWall) return -3000;
    if (strike === market.gammaFlip) return 0;
    
    // Simulate distribution decay
    if (strike < market.gammaFlip) return (market.gammaFlip - strike) * -2.5;
    const distToCallWall = Math.abs(positioning.callWall - strike);
    return Math.max(0, 4500 - distToCallWall * 1.8);
  };

  const data = strikes.map(strike => ({
    strike,
    gamma: generateGamma(strike)
  }));

  const maxGamma = Math.max(...data.map(d => Math.abs(d.gamma)), 1);
  const maxPosGamma = Math.max(...data.map(d => d.gamma));

  return (
    <TerminalPanel title="GAMMA PROFILE ANALYSIS" className="flex-[0.35] h-full shrink-0">
      <div className="flex h-full w-full items-end space-x-[1px] pb-8 relative pt-8 px-1">
        
        {/* Zero Line */}
        <div className="absolute left-0 right-0 top-[55%] border-t border-white/5 z-0"></div>

        {/* Bars */}
        {data.map((d, i) => {
          const heightPct = (Math.abs(d.gamma) / maxGamma) * 45;
          const isPositive = d.gamma > 0;
          
          const isFlip = market?.gammaFlip === d.strike;
          const isCallWall = positioning?.callWall === d.strike;
          const isPutWall = positioning?.putWall === d.strike;
          const isMaxGex = d.gamma === maxPosGamma && d.gamma > 0;

          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end relative h-full z-10 group">
              {/* Highlight Markers */}
              {(isFlip || isCallWall || isPutWall || isMaxGex) && (
                <div className={cn(
                  "absolute inset-x-0 bottom-0 top-0 border-x z-20 pointer-events-none opacity-40",
                  isFlip && "border-dashed border-terminal-accent",
                  isCallWall && "border-terminal-negative",
                  isPutWall && "border-terminal-positive",
                  isMaxGex && "border-terminal-positive brightness-150"
                )}>
                  <span className={cn(
                    "absolute -top-6 left-1/2 -translate-x-1/2 text-[6px] font-bold whitespace-nowrap bg-black/90 px-1 py-0.5 rounded border border-white/10",
                    isFlip && "text-terminal-accent",
                    isCallWall && "text-terminal-negative",
                    isPutWall && "text-terminal-positive",
                    isMaxGex && "text-terminal-positive brightness-150"
                  )}>
                    {isFlip ? "FLIP" : isCallWall ? "C-WALL" : isPutWall ? "P-WALL" : "MAX GEX"}
                  </span>
                </div>
              )}

              {isPositive && (
                <div 
                  className={cn(
                    "w-full bg-terminal-positive/20 hover:bg-terminal-positive/50 transition-all",
                    isMaxGex && "bg-terminal-positive/60 shadow-[0_0_10px_rgba(34,197,94,0.3)]",
                    isCallWall && "bg-terminal-negative/40"
                  )}
                  style={{ 
                    height: `${heightPct}%`,
                    marginBottom: '45%' 
                  }}
                ></div>
              )}

              {!isPositive && d.gamma !== 0 && (
                <div 
                  className={cn(
                    "w-full bg-terminal-negative/20 hover:bg-terminal-negative/50 transition-all",
                    isPutWall && "bg-terminal-positive/40"
                  )}
                  style={{ 
                    height: `${heightPct}%`,
                    position: 'absolute',
                    top: '55%'
                  }}
                ></div>
              )}

              {/* Price Labels (every 2k or if highlighted) */}
              {(d.strike % 2000 === 0 || isFlip || isCallWall || isPutWall) && (
                <div className={cn(
                  "absolute bottom-0 text-[7px] font-mono text-terminal-muted -rotate-45 origin-left font-bold transition-colors",
                  (isFlip || isCallWall || isPutWall) && "text-white opacity-100 z-30"
                )}>
                  {(d.strike / 1000).toFixed(1)}k
                </div>
              )}
            </div>
          );
        })}
      </div>
    </TerminalPanel>
  );
}
