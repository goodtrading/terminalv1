import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PAPER_RISK_GUARD_POLICY } from "./paperRiskGuardConfig";
import {
  computePaperRiskGuardStatus,
  type PaperRiskGuardStatusInput,
} from "./paperRiskGuardStatus";

const valueClass = "text-right text-slate-200";

/** Full panel — prefer {@link PaperRiskGuardLine} in compact paper UI. */
export type PaperRiskGuardProps = PaperRiskGuardStatusInput;

export function PaperRiskGuard(props: PaperRiskGuardProps) {
  const {
    account,
    settings,
    ticketLeverage,
    computedRiskPct = null,
    liveTradingEnabled = false,
    extraBlockReason,
  } = props;

  const status = useMemo(
    () =>
      computePaperRiskGuardStatus({
        account,
        settings,
        ticketLeverage,
        computedRiskPct,
        liveTradingEnabled,
        extraBlockReason,
      }),
    [
      account,
      settings,
      ticketLeverage,
      computedRiskPct,
      liveTradingEnabled,
      extraBlockReason,
    ],
  );

  const { tradingAllowed, blockReasons, maxLev, drawdownPct } = status;
  const dailyLossExceeded =
    drawdownPct > PAPER_RISK_GUARD_POLICY.maxDailyLossPct;

  const levDisplay =
    ticketLeverage != null && Number.isFinite(ticketLeverage)
      ? `${ticketLeverage}x`
      : "—";

  return (
    <section className="rounded border border-amber-500/25 bg-amber-950/15 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[8px] font-bold uppercase tracking-widest text-amber-400/90">
          Risk guard
        </div>
        <span
          className={cn(
            "text-[7px] font-bold uppercase px-1.5 py-0.5 rounded border",
            tradingAllowed
              ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/30"
              : "border-red-500/40 text-red-300 bg-red-950/30",
          )}
        >
          {tradingAllowed ? "Allowed" : "Blocked"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] text-slate-500">
        <span>Max risk / trade</span>
        <span className={valueClass}>
          {PAPER_RISK_GUARD_POLICY.maxRiskPerTradePct}%
        </span>
        <span>Max daily loss</span>
        <span className={valueClass}>
          {PAPER_RISK_GUARD_POLICY.maxDailyLossPct}%
        </span>
        <span>Max leverage</span>
        <span className={valueClass}>{maxLev}x</span>
        <span>Ticket leverage</span>
        <span className={valueClass}>{levDisplay}</span>
        <span>Max notional</span>
        <span className={valueClass}>
          {PAPER_RISK_GUARD_POLICY.maxNotionalUsdt.toLocaleString()} USDT
        </span>
        <span>Paper drawdown</span>
        <span
          className={cn(
            valueClass,
            drawdownPct > 0 && "text-amber-300",
            dailyLossExceeded && "text-red-400",
          )}
        >
          {drawdownPct.toFixed(2)}%
        </span>
        <span>Live trading</span>
        <span className={cn(valueClass, "text-red-300/90")}>Locked</span>
      </div>

      {!tradingAllowed && blockReasons.length > 0 ? (
        <ul className="text-[8px] text-red-300/90 space-y-0.5 list-disc list-inside border-t border-terminal-border/40 pt-1">
          {blockReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[8px] text-slate-500 border-t border-terminal-border/40 pt-1">
          Simulated limits only — no real BingX orders.
        </p>
      )}
    </section>
  );
}
