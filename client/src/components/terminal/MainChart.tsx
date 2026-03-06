import { TerminalPanel } from "./TerminalPanel";

export function MainChart() {
  return (
    <TerminalPanel className="flex-1 mb-2 border border-terminal-border relative" noPadding>
      {/* Chart Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <div className="flex items-end space-x-3">
            <h2 className="text-2xl font-bold font-mono text-white tracking-tight">BTC/USD</h2>
            <span className="text-3xl font-mono text-terminal-positive">70,245.50</span>
            <span className="text-sm font-mono text-terminal-positive pb-1">+1.24%</span>
          </div>
        </div>
        <div className="flex space-x-2 pointer-events-auto">
          {["1H", "4H", "1D"].map(tf => (
            <button key={tf} className="px-2 py-0.5 text-xs font-mono bg-terminal-bg border border-terminal-border text-terminal-muted hover:text-white rounded-sm">
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Placeholder Area */}
      <div className="w-full h-full bg-terminal-bg relative overflow-hidden flex flex-col">
        {/* Y-Axis Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-12 opacity-10 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="w-full border-t border-white border-dashed"></div>
          ))}
        </div>

        {/* X-Axis Grid Lines */}
        <div className="absolute inset-0 flex justify-between px-12 opacity-10 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-full border-l border-white border-dashed"></div>
          ))}
        </div>

        {/* Structural Overlays Mockup */}
        <div className="absolute inset-0 pt-20 pb-10 pr-16 relative">
          
          {/* Call Wall */}
          <div className="absolute top-[15%] left-0 w-full flex items-center">
            <div className="w-full border-t-2 border-dashed border-red-500/50"></div>
            <div className="absolute right-2 bg-red-500/20 text-red-400 text-[10px] px-1 font-mono border border-red-500/30">CALL WALL 72k</div>
          </div>

          {/* Gamma Magnets */}
          <div className="absolute top-[30%] left-0 w-full flex items-center">
            <div className="w-full border-t border-white/20"></div>
            <div className="absolute right-2 bg-terminal-panel text-white text-[10px] px-1 font-mono border border-terminal-border">MAGNET 70k</div>
          </div>

          {/* Transition Zone Band */}
          <div className="absolute top-[35%] w-full h-[15%] bg-blue-500/5 border-y border-blue-500/20 flex items-center">
            <div className="absolute left-4 text-blue-400/50 text-[10px] font-mono tracking-widest uppercase">TRANSITION ZONE 69.1k - 69.7k</div>
          </div>

          {/* Gamma Flip */}
          <div className="absolute top-[42%] left-0 w-full flex items-center z-10">
            <div className="w-full border-t-2 border-yellow-500/50"></div>
            <div className="absolute right-2 bg-yellow-500/20 text-yellow-400 text-[10px] px-1 font-mono border border-yellow-500/30">GAMMA FLIP 69,450</div>
          </div>

          {/* Short Gamma Pocket */}
          <div className="absolute top-[50%] w-full h-[10%] bg-red-500/10 border-y border-red-500/20 flex flex-col justify-center">
            <div className="absolute left-4 text-red-400/50 text-[10px] font-mono tracking-widest uppercase">SHORT GAMMA POCKET</div>
          </div>

          {/* Put Wall */}
          <div className="absolute bottom-[20%] left-0 w-full flex items-center">
            <div className="w-full border-t-2 border-dashed border-green-500/50"></div>
            <div className="absolute right-2 bg-green-500/20 text-green-400 text-[10px] px-1 font-mono border border-green-500/30">PUT WALL 68k</div>
          </div>

          {/* Mock Price Action (Candles approximation) */}
          <svg className="absolute inset-0 w-full h-full opacity-60" preserveAspectRatio="none">
             <path d="M 0,60% Q 10%,50% 20%,55% T 40%,45% T 60%,35% T 80%,25% T 100%,30%" fill="none" stroke="hsl(var(--terminal-muted))" strokeWidth="2" />
             <circle cx="80%" cy="25%" r="4" fill="hsl(var(--terminal-positive))" className="animate-pulse" />
          </svg>

        </div>

        {/* Right Axis Scale */}
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-terminal-bg border-l border-terminal-border flex flex-col justify-between py-12 items-end pr-2 text-[10px] font-mono text-terminal-muted pointer-events-none">
          <span>74,000</span>
          <span>73,000</span>
          <span>72,000</span>
          <span>71,000</span>
          <span>70,000</span>
          <span>69,000</span>
          <span>68,000</span>
          <span>67,000</span>
        </div>

        {/* Center Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
          <span className="text-8xl font-bold tracking-tighter">QUANTUM</span>
        </div>
      </div>
    </TerminalPanel>
  );
}