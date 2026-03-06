import { TerminalPanel } from "./TerminalPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RightSidebar() {
  return (
    <div className="w-80 h-full flex flex-col gap-2 overflow-y-auto p-2 border-l border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="DAILY SCENARIOS">
        <div className="space-y-4">
          
          {/* Base Case */}
          <div className="border border-white/10 bg-terminal-bg rounded-sm overflow-hidden flex flex-col group transition-all hover:border-terminal-positive/30">
            <div className="flex justify-between items-center p-2 border-b border-white/10 bg-terminal-positive/5">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-terminal-positive shadow-[0_0_8px_rgba(74,222,128,0.5)]"></div>
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">BASE CASE</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-sm bg-terminal-positive/20 text-terminal-positive text-[9px] font-mono font-bold">60% PROB</span>
            </div>
            <div className="p-3 text-[11px] space-y-3">
              <div className="font-bold text-white flex items-center">
                <span className="text-terminal-positive mr-2">→</span> Mean Reversion toward 72k magnet
              </div>
              <div className="space-y-1.5 opacity-80">
                <div className="grid grid-cols-[75px_1fr] gap-2">
                  <span className="text-terminal-muted uppercase text-[9px] font-bold">Thesis</span>
                  <span className="text-white/90">Long gamma above flip with bullish support</span>
                </div>
                <div className="grid grid-cols-[75px_1fr] gap-2">
                  <span className="text-terminal-muted uppercase text-[9px] font-bold">Levels</span>
                  <span className="font-mono font-bold text-terminal-positive">70k / 72k / 73k</span>
                </div>
                <div className="grid grid-cols-[75px_1fr] gap-2">
                  <span className="text-terminal-muted uppercase text-[9px] font-bold">Invalid</span>
                  <span className="text-terminal-negative font-bold">Below 69,100</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alt Case */}
          <div className="border border-white/10 bg-terminal-bg rounded-sm overflow-hidden flex flex-col group transition-all hover:border-white/20">
            <div className="flex justify-between items-center p-2 border-b border-white/10 bg-white/5">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-terminal-muted"></div>
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">ALT CASE</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-sm bg-white/10 text-white/60 text-[9px] font-mono font-bold">25% PROB</span>
            </div>
            <div className="p-3 text-[11px]">
              <div className="text-white/80 font-medium">Liquidity sweep below 69k then recovery</div>
            </div>
          </div>

          {/* Vol Case */}
          <div className="border border-white/10 bg-terminal-bg rounded-sm overflow-hidden flex flex-col group transition-all hover:border-terminal-negative/30">
            <div className="flex justify-between items-center p-2 border-b border-white/10 bg-terminal-negative/5">
              <div className="flex items-center space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-terminal-negative shadow-[0_0_8px_rgba(255,59,59,0.5)]"></div>
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">VOL CASE</span>
              </div>
              <span className="px-1.5 py-0.5 rounded-sm bg-terminal-negative/20 text-terminal-negative text-[9px] font-mono font-bold">15% PROB</span>
            </div>
            <div className="p-3 text-[11px]">
              <div className="text-white/80 font-medium">Breakdown into short gamma expansion</div>
            </div>
          </div>

        </div>
      </TerminalPanel>

      <TerminalPanel title="ORDER FLOW CONFIRMATION">
        <div className="space-y-3">
          {[
            { label: "Absorption at Magnet", status: "pending" },
            { label: "Bid Holding", status: "confirmed" },
            { label: "Delta Divergence", status: "pending" },
            { label: "OI Stable", status: "confirmed" },
            { label: "Wall Pull Detected", status: "none" },
            { label: "Aggressive Continuation", status: "none" }
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between group cursor-pointer">
              <span className="text-[10px] uppercase font-bold tracking-wider text-terminal-muted group-hover:text-white transition-colors">
                {item.label}
              </span>
              <div className={cn(
                "flex items-center justify-center w-10 h-5 rounded-full border border-terminal-border bg-terminal-panel p-1 transition-all",
                item.status === "confirmed" && "border-terminal-positive/50 bg-terminal-positive/10",
                item.status === "pending" && "border-yellow-500/50 bg-yellow-500/10"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  item.status === "confirmed" ? "bg-terminal-positive shadow-[0_0_6px_rgba(74,222,128,0.8)]" : 
                  item.status === "pending" ? "bg-yellow-500 animate-pulse" : 
                  "bg-white/10"
                )} />
              </div>
            </div>
          ))}
        </div>
      </TerminalPanel>

      <TerminalPanel title="ACTIONS" className="mt-auto">
        <div className="space-y-2">
          {["Generate Trading Plan", "Export Daily Report", "Copy Telegram Update"].map((text) => (
            <Button 
              key={text}
              variant="outline" 
              className="w-full justify-start text-[10px] font-bold uppercase tracking-[0.15em] h-10 bg-terminal-panel border-terminal-border text-terminal-muted hover:border-terminal-accent hover:text-white hover:bg-terminal-accent/10 transition-all rounded-sm no-default-hover-elevate"
            >
              <span className="mr-3 opacity-50 group-hover:opacity-100">█</span> {text}
            </Button>
          ))}
        </div>
      </TerminalPanel>

    </div>
  );
}