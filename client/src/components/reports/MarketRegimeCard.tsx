import { ReportBadge } from "./ReportBadge";
import {
  ActiveTradingMagnetBlock,
  IntradayDecisionBlock,
  MacroGravityBlock,
} from "./SessionLevelBlocks";
import type { SessionReportRegime } from "./session/sessionReportTypes";

function RegimeField({ label, value }: { label: string; value: string }) {
  return (
    <article className="flex flex-col gap-1 min-w-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-500/70">
        {label}
      </span>
      <span className="text-sm font-mono font-bold text-white leading-tight">{value}</span>
    </article>
  );
}

export function MarketRegimeCard({ regime }: { regime: SessionReportRegime }) {
  const { levelHierarchy } = regime;

  return (
    <article className="border border-terminal-accent/35 bg-[#0c0808] px-5 py-5 md:px-6 md:py-6 shadow-[inset_0_1px_0_rgba(255,59,59,0.06)]">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-4 border-b border-terminal-accent/20">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">
          Today&apos;s Market Regime
        </h2>
        <ReportBadge variant="phase">{regime.status}</ReportBadge>
      </header>
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5 mb-5">
        <RegimeField label="Main Regime" value={regime.gammaState} />
        <RegimeField label="Bias" value={regime.bias} />
        <RegimeField label="Volatility" value={regime.volatilityState} />
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-terminal-accent/15">
        <IntradayDecisionBlock level={levelHierarchy.intradayDecision} />
        <ActiveTradingMagnetBlock level={levelHierarchy.activeTrading} />
        <MacroGravityBlock level={levelHierarchy.macroGravity} />
      </section>
    </article>
  );
}
