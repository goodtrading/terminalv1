import { TerminalValue } from "@/components/terminal/TerminalPanel";
import { EDGE_HEALTH, EDGE_CONCLUSION } from "./reportsMockData";

export function EdgeHealthCard() {
  return (
    <article className="flex flex-col gap-4">
      <section className="border border-terminal-border bg-[#0c0c0c] px-5 py-5 md:px-6">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white mb-4 pb-3 border-b border-terminal-border">
          Edge Health
        </h2>
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <TerminalValue label="Overall Edge" value={EDGE_HEALTH.overallEdge} isBadge trend="positive" />
          <TerminalValue label="Current Stability" value={EDGE_HEALTH.currentStability} isBadge />
          <TerminalValue label="Main Strength" value={EDGE_HEALTH.mainStrength} />
          <TerminalValue label="Main Leak" value={EDGE_HEALTH.mainLeak} />
        </section>
      </section>
      <p className="text-[12px] leading-relaxed text-slate-400 border-l-2 border-terminal-accent/50 pl-4 py-1">
        {EDGE_CONCLUSION}
      </p>
    </article>
  );
}
