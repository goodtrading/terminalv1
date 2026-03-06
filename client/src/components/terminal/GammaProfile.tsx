import { TerminalPanel } from "./TerminalPanel";
import { cn } from "@/lib/utils";

export function GammaProfile() {
  const strikes = Array.from({ length: 25 }, (_, i) => 60000 + i * 1000);
  
  const generateGamma = (strike: number) => {
    if (strike < 68000) return (68000 - strike) * -1.5; 
    if (strike === 69000) return -500;
    const dist = Math.abs(72000 - strike);
    return Math.max(0, 5000 - dist * 1.5); 
  };

  const data = strikes.map(strike => ({
    strike,
    gamma: generateGamma(strike)
  }));

  const maxGamma = Math.max(...data.map(d => Math.abs(d.gamma)));

  return (
    <TerminalPanel title="GAMMA PROFILE ANALYSIS" className="h-64 shrink-0">
      <div className="flex h-full w-full items-end space-x-[2px] pb-8 relative pt-6 px-1">
        
        {/* Zero Line */}
        <div className="absolute left-0 right-0 top-[55%] border-t border-white/10 z-0"></div>

        {/* Legend/Labels */}
        <div className="absolute top-2 left-0 right-0 flex justify-between px-4 z-20 pointer-events-none">
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-bold text-terminal-negative uppercase tracking-widest bg-terminal-panel px-1">↓ Gamma Flip Area (69.4k)</span>
          </div>
          <div className="flex flex-col items-center">
             <span className="text-[8px] font-bold text-terminal-positive uppercase tracking-widest bg-terminal-panel px-1">↑ Largest Pos GEX Strike (72k)</span>
          </div>
        </div>

        {/* Bars */}
        {data.map((d, i) => {
          const heightPct = (Math.abs(d.gamma) / maxGamma) * 40;
          const isPositive = d.gamma > 0;
          
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end relative h-full z-10 group">
              {isPositive && (
                <div 
                  className={cn(
                    "w-full bg-terminal-positive/40 hover:bg-terminal-positive/80 transition-all border-t border-terminal-positive/30",
                    d.strike === 72000 && "bg-terminal-positive border-white/40 brightness-125"
                  )}
                  style={{ 
                    height: `${heightPct}%`,
                    marginBottom: '45%' 
                  }}
                ></div>
              )}

              {!isPositive && (
                <div 
                  className={cn(
                    "w-full bg-terminal-negative/40 hover:bg-terminal-negative/80 transition-all border-b border-terminal-negative/30",
                    d.strike >= 68000 && d.strike <= 69000 && "bg-terminal-negative border-white/40 brightness-125"
                  )}
                  style={{ 
                    height: `${heightPct}%`,
                    position: 'absolute',
                    top: '55%'
                  }}
                ></div>
              )}

              <div className="absolute bottom-1 text-[8px] font-mono text-terminal-muted -rotate-45 origin-left font-bold group-hover:text-white transition-colors">
                {(d.strike / 1000).toFixed(0)}k
              </div>
            </div>
          );
        })}
      </div>
    </TerminalPanel>
  );
}