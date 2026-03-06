import { TerminalPanel } from "./TerminalPanel";

export function MainChart() {
  return (
    <TerminalPanel className="flex-1 mb-2 border border-terminal-border relative" noPadding>
      {/* Chart Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <div className="flex items-baseline space-x-3">
            <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USD</h2>
            <span className="text-2xl font-mono text-terminal-positive font-bold">70,245.50</span>
            <span className="text-xs font-mono text-terminal-positive font-bold opacity-80">+1.24%</span>
          </div>
          <div className="text-[10px] font-mono text-terminal-muted mt-1 uppercase tracking-widest">SPOT PRICE INDEX • DERIBIT LIVE</div>
        </div>
        <div className="flex space-x-1 pointer-events-auto">
          {["1M", "15M", "1H", "4H", "1D"].map(tf => (
            <button key={tf} className="px-2 py-1 text-[10px] font-bold font-mono bg-terminal-panel border border-terminal-border text-terminal-muted hover:text-white hover:border-terminal-accent transition-all rounded-sm">
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-full bg-[#080808] relative overflow-hidden flex flex-col">
        {/* Subtle Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-12 pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="w-full border-t border-white/[0.03]"></div>
          ))}
        </div>

        <div className="absolute inset-0 flex justify-between px-12 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-full border-l border-white/[0.03]"></div>
          ))}
        </div>

        {/* Structural Overlays */}
        <div className="absolute inset-0 pt-20 pb-10 pr-16 relative">
          
          {/* Call Wall */}
          <div className="absolute top-[18%] left-0 w-full flex items-center group">
            <div className="w-full border-t border-terminal-negative/40"></div>
            <div className="absolute right-0 bg-terminal-negative text-white text-[9px] font-bold px-2 py-0.5 font-mono shadow-lg uppercase tracking-tighter">CALL WALL • 72,000</div>
          </div>

          {/* Gamma Magnets */}
          <div className="absolute top-[32%] left-0 w-full flex items-center">
            <div className="w-full border-t border-white/20"></div>
            <div className="absolute right-0 bg-white/10 backdrop-blur-sm text-white text-[9px] font-bold px-2 py-0.5 font-mono border border-white/20 uppercase tracking-tighter">MAGNET • 70,000</div>
          </div>

          {/* Transition Zone Band */}
          <div className="absolute top-[38%] w-full h-[12%] bg-terminal-negative/5 border-y border-terminal-negative/10 flex items-center justify-start pl-4 overflow-hidden">
             <div className="text-[8px] font-mono text-terminal-negative/30 font-bold uppercase tracking-[0.5em] whitespace-nowrap">
               TRANSITION ZONE • TRANSITION ZONE • TRANSITION ZONE
             </div>
          </div>

          {/* Gamma Flip */}
          <div className="absolute top-[44%] left-0 w-full flex items-center z-10">
            <div className="w-full border-t-2 border-terminal-accent/60"></div>
            <div className="absolute right-0 bg-terminal-accent text-white text-[9px] font-bold px-2 py-0.5 font-mono shadow-lg uppercase tracking-tighter">GAMMA FLIP • 69,450</div>
          </div>

          {/* Short Gamma Pocket - Translucent Red Band */}
          <div className="absolute top-[52%] w-full h-[15%] bg-terminal-negative/[0.08] border-y border-terminal-negative/20 flex flex-col justify-center overflow-hidden">
            <div className="absolute left-4 text-terminal-negative/40 text-[9px] font-mono font-bold tracking-[0.3em] uppercase">SHORT GAMMA EXPANSION POCKET</div>
          </div>

          {/* Put Wall */}
          <div className="absolute bottom-[22%] left-0 w-full flex items-center">
            <div className="w-full border-t border-terminal-positive/40"></div>
            <div className="absolute right-0 bg-terminal-positive text-white text-[9px] font-bold px-2 py-0.5 font-mono shadow-lg uppercase tracking-tighter">PUT WALL • 68,000</div>
          </div>

          {/* Mock Price Action (Vector Curve) */}
          <svg className="absolute inset-0 w-full h-full opacity-40" preserveAspectRatio="none" viewBox="0 0 100 100">
             <path d="M 0,65 Q 15,45 30,58 T 50,42 T 75,25 T 100,32" fill="none" stroke="white" strokeWidth="0.5" />
             <circle cx="100" cy="32" r="1" fill="hsl(var(--terminal-accent))" />
          </svg>

        </div>

        {/* Right Axis Scale */}
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-terminal-panel border-l border-terminal-border flex flex-col justify-between py-12 items-end pr-2 text-[9px] font-mono text-terminal-muted pointer-events-none z-20">
          <span>74,000.00</span>
          <span>73,000.00</span>
          <span>72,000.00</span>
          <span>71,000.00</span>
          <span>70,000.00</span>
          <span>69,000.00</span>
          <span>68,000.00</span>
          <span>67,000.00</span>
        </div>

        {/* Center Watermark - Very Subtle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
          <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
        </div>
      </div>
    </TerminalPanel>
  );
}