import { TerminalPanel, TerminalValue } from "./TerminalPanel";
import { useTerminalState } from "@/hooks/useTerminalState";
import { useMemo } from "react";

export function TradingPlan() {
  const { data: state } = useTerminalState();
  const playbook = (state?.positioning as any)?.tradingPlaybook;

  const formatLevel = (price: number): string => {
    if (!price || isNaN(price)) return "--";
    return price >= 1000 ? `${(price / 1000).toFixed(1)}k` : price.toString();
  };

  if (!playbook) {
    return (
      <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-[0.65] min-w-[300px]">
        <div className="h-full flex items-center justify-center text-terminal-muted text-[10px] italic">
          No active playbook for current regime.
        </div>
      </TerminalPanel>
    );
  }

  const { currentPlaybook, tradeZones, invalidationLevel, regimeShiftTrigger } = playbook;

  return (
    <TerminalPanel title="ACTIVE TRADING PLAN" className="flex-[0.65] min-w-[300px]">
      <div className="grid grid-cols-3 gap-x-12 px-4 py-2">
        {/* Column 1: Market Playbook */}
        <div className="flex flex-col">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-wider border-b border-terminal-accent/20 pb-2 mb-4">
            Market Playbook
          </div>
          <div className="space-y-4">
            <TerminalValue label="Regime" value={currentPlaybook.regime} trend={currentPlaybook.regime.includes("LONG") ? "positive" : "negative"} />
            <TerminalValue label="Strategy" value={currentPlaybook.strategyType} isBadge />
            <TerminalValue label="Vol Risk" value={currentPlaybook.volatilityRisk} trend={currentPlaybook.volatilityRisk === "LOW" ? "positive" : "negative"} />
          </div>
        </div>

        {/* Column 2: Execution Zones */}
        <div className="flex flex-col">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-wider border-b border-terminal-accent/20 pb-2 mb-4">
            Trade Zones
          </div>
          <div className="space-y-4">
            <div className="flex flex-col">
              <span className="terminal-text-label text-[10px] uppercase mb-1">Long Zones</span>
              <div className="flex flex-wrap gap-1">
                {tradeZones.longZones.map((z: any, i: number) => (
                  <span key={i} className="text-[10px] font-mono font-bold text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                    {formatLevel(z.start)}-{formatLevel(z.end)}
                  </span>
                ))}
                {tradeZones.longZones.length === 0 && <span className="text-[10px] text-terminal-muted">None</span>}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="terminal-text-label text-[10px] uppercase mb-1">Short Zones</span>
              <div className="flex flex-wrap gap-1">
                {tradeZones.shortZones.map((z: any, i: number) => (
                  <span key={i} className="text-[10px] font-mono font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                    {formatLevel(z.start)}-{formatLevel(z.end)}
                  </span>
                ))}
                {tradeZones.shortZones.length === 0 && <span className="text-[10px] text-terminal-muted">None</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Risk Controls */}
        <div className="flex flex-col">
          <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-wider border-b border-terminal-accent/20 pb-2 mb-4">
            Risk Controls
          </div>
          <div className="space-y-4">
            <TerminalValue label="Invalidation" value={formatLevel(invalidationLevel)} trend="negative" />
            <div className="flex flex-col">
              <span className="terminal-text-label text-[10px] uppercase mb-1">Shift Trigger</span>
              <span className="text-[10px] text-terminal-primary leading-tight font-medium">
                {regimeShiftTrigger}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-8 mx-4 p-5 bg-terminal-accent/[0.03] border border-terminal-accent/10 rounded-sm">
        <div className="text-[10px] text-terminal-accent font-bold uppercase tracking-widest mb-3 flex items-center">
          <div className="w-1.5 h-3.5 bg-terminal-accent mr-2.5"></div>
          Expected Behavior
        </div>
        <div className="text-[11px] terminal-text-secondary leading-relaxed font-medium pl-4 border-l border-terminal-accent/20">
          {currentPlaybook.expectedBehavior}
        </div>
      </div>
    </TerminalPanel>
  );
}
