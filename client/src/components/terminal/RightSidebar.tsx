import { TerminalPanel } from "./TerminalPanel";
import { CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RightSidebar() {
  return (
    <div className="w-80 h-full flex flex-col gap-2 overflow-y-auto p-2 border-l border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="DAILY SCENARIOS">
        <div className="space-y-3">
          
          {/* Base Case */}
          <div className="border border-terminal-border bg-terminal-bg rounded flex flex-col">
            <div className="flex justify-between items-center p-2 border-b border-terminal-border bg-terminal-positive/10">
              <span className="text-xs font-bold text-terminal-positive">BASE CASE</span>
              <span className="text-xs font-mono font-bold">60%</span>
            </div>
            <div className="p-2 text-xs space-y-2">
              <div className="font-medium text-white">Mean Reversion toward 72k magnet</div>
              <div className="grid grid-cols-[70px_1fr] gap-1">
                <span className="text-terminal-muted">Thesis:</span>
                <span className="text-terminal-text">Long gamma above flip with bullish vanna/charm support</span>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-1">
                <span className="text-terminal-muted">Levels:</span>
                <span className="font-mono">70k / 72k / 73k</span>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-1">
                <span className="text-terminal-muted">Confirm:</span>
                <span className="text-terminal-text">absorption at 70k, delta divergence</span>
              </div>
              <div className="grid grid-cols-[70px_1fr] gap-1">
                <span className="text-terminal-muted">Invalid:</span>
                <span className="text-terminal-negative">acceptance below 69.1k</span>
              </div>
            </div>
          </div>

          {/* Alt Case */}
          <div className="border border-terminal-border bg-terminal-bg rounded flex flex-col">
            <div className="flex justify-between items-center p-2 border-b border-terminal-border bg-terminal-border/50">
              <span className="text-xs font-bold text-white">ALT CASE</span>
              <span className="text-xs font-mono font-bold">25%</span>
            </div>
            <div className="p-2 text-xs">
              <div className="text-terminal-text">Liquidity sweep below 69k then recovery</div>
            </div>
          </div>

          {/* Vol Case */}
          <div className="border border-terminal-border bg-terminal-bg rounded flex flex-col">
            <div className="flex justify-between items-center p-2 border-b border-terminal-border bg-terminal-negative/10">
              <span className="text-xs font-bold text-terminal-negative">VOL CASE</span>
              <span className="text-xs font-mono font-bold">15%</span>
            </div>
            <div className="p-2 text-xs">
              <div className="text-terminal-text">Breakdown into short gamma expansion</div>
            </div>
          </div>

        </div>
      </TerminalPanel>

      <TerminalPanel title="ORDER FLOW CONFIRMATION">
        <div className="space-y-2">
          {[
            { label: "Absorption at Magnet", status: "pending" },
            { label: "Bid Holding", status: "confirmed" },
            { label: "Delta Divergence", status: "pending" },
            { label: "OI Stable", status: "confirmed" },
            { label: "Wall Pull Detected", status: "none" },
            { label: "Aggressive Continuation", status: "none" }
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-terminal-text">{item.label}</span>
              <span className="flex items-center justify-center w-5 h-5 rounded bg-terminal-bg border border-terminal-border">
                {item.status === "confirmed" && <CheckSquare className="w-3 h-3 text-terminal-positive" />}
                {item.status === "pending" && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />}
              </span>
            </div>
          ))}
        </div>
      </TerminalPanel>

      <TerminalPanel title="ACTIONS" className="mt-auto">
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start text-xs h-8 bg-terminal-bg border-terminal-border text-terminal-text hover:bg-terminal-border hover:text-white rounded-sm">
            <span className="mr-2 text-terminal-accent">▶</span> Generate Trading Plan
          </Button>
          <Button variant="outline" className="w-full justify-start text-xs h-8 bg-terminal-bg border-terminal-border text-terminal-text hover:bg-terminal-border hover:text-white rounded-sm">
            <span className="mr-2 text-terminal-accent">▶</span> Export Daily Report
          </Button>
          <Button variant="outline" className="w-full justify-start text-xs h-8 bg-terminal-bg border-terminal-border text-terminal-text hover:bg-terminal-border hover:text-white rounded-sm">
            <span className="mr-2 text-terminal-accent">▶</span> Copy Telegram Update
          </Button>
        </div>
      </TerminalPanel>

    </div>
  );
}