import { TerminalPanel } from "./TerminalPanel";
import { cn } from "@/lib/utils";

export function GammaProfile() {
  // Mock data for gamma profile
  const strikes = Array.from({ length: 21 }, (_, i) => 60000 + i * 1000);
  
  // Generating a bell-like curve for positive gamma, and a trough for negative
  const generateGamma = (strike: number) => {
    if (strike < 68000) return (68000 - strike) * -1.5; // Negative gamma
    if (strike === 69000) return -500; // Flip area
    
    // Positive gamma bell curve centered around 72000
    const dist = Math.abs(72000 - strike);
    return Math.max(0, 5000 - dist * 1.2); 
  };

  const data = strikes.map(strike => ({
    strike,
    gamma: generateGamma(strike)
  }));

  const maxGamma = Math.max(...data.map(d => Math.abs(d.gamma)));

  return (
    <TerminalPanel title="GAMMA PROFILE BY STRIKE" className="h-64 shrink-0">
      <div className="flex h-full w-full items-end space-x-1 pb-6 relative pt-4 px-2">
        
        {/* Zero Line */}
        <div className="absolute left-0 right-0 top-[60%] border-t border-terminal-muted/30 z-0"></div>
        <span className="absolute left-2 top-[60%] -translate-y-1/2 text-[9px] text-terminal-muted font-mono z-10 bg-terminal-panel pr-1">0</span>

        {/* Labels Overlay */}
        <div className="absolute top-2 left-[45%] text-[10px] text-yellow-500 font-mono flex flex-col items-center">
          <span>↓ GAMMA FLIP</span>
          <span>69.4k</span>
        </div>

        <div className="absolute top-2 right-[20%] text-[10px] text-green-500 font-mono flex flex-col items-center">
          <span>↓ LARGEST POS GAMMA</span>
          <span>72k</span>
        </div>

        {/* Bars */}
        {data.map((d, i) => {
          const heightPct = (Math.abs(d.gamma) / maxGamma) * 40; // Max 40% height relative to container
          const isPositive = d.gamma > 0;
          
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end relative h-full z-10 group">
              {/* Positive Bar */}
              {isPositive && (
                <div 
                  className={cn(
                    "w-full bg-terminal-positive/80 hover:bg-terminal-positive transition-colors border-t border-x border-terminal-positive",
                    d.strike === 72000 && "bg-terminal-positive border-white/50" // Highlight largest
                  )}
                  style={{ 
                    height: `${heightPct}%`,
                    marginBottom: '40%' // Offset to sit on zero line
                  }}
                ></div>
              )}

              {/* Negative Bar */}
              {!isPositive && (
                <div 
                  className={cn(
                    "w-full bg-terminal-negative/80 hover:bg-terminal-negative transition-colors border-b border-x border-terminal-negative",
                    d.strike >= 68000 && d.strike <= 69000 && "bg-terminal-negative border-white/50" // Highlight pocket
                  )}
                  style={{ 
                    height: `${heightPct}%`,
                    marginTop: '0%', // Start from zero line
                    position: 'absolute',
                    top: '60%'
                  }}
                ></div>
              )}

              {/* Strike Label */}
              <div className="absolute bottom-0 text-[8px] font-mono text-terminal-muted -rotate-45 origin-left translate-y-4">
                {(d.strike / 1000).toFixed(0)}k
              </div>
              
              {/* Tooltip on hover */}
              <div className="absolute -top-10 bg-terminal-panel border border-terminal-border p-1 hidden group-hover:block z-20 whitespace-nowrap">
                <div className="text-[10px] font-mono text-white">{d.strike.toLocaleString()}</div>
                <div className={cn(
                  "text-[10px] font-mono",
                  isPositive ? "text-terminal-positive" : "text-terminal-negative"
                )}>
                  {d.gamma > 0 ? '+' : ''}{d.gamma.toFixed(0)} GEX
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </TerminalPanel>
  );
}