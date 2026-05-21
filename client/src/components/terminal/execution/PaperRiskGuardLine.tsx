import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PAPER_RISK_GUARD_POLICY } from "./paperRiskGuardConfig";
import {
  computePaperRiskGuardStatus,
  type PaperRiskGuardStatusInput,
} from "./paperRiskGuardStatus";

export type PaperRiskGuardLineProps = PaperRiskGuardStatusInput & {
  className?: string;
};

export function PaperRiskGuardLine({
  className,
  account,
  settings,
  ticketLeverage,
  computedRiskPct = null,
  liveTradingEnabled = false,
  extraBlockReason,
}: PaperRiskGuardLineProps) {
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

  const { tradingAllowed, blockReasons, maxLev } = status;
  const reason =
    blockReasons.length > 0 ? blockReasons.join(" · ") : null;

  return (
    <p
      className={cn(
        "text-[8px] font-mono leading-snug border-t border-terminal-border/50 pt-1.5",
        tradingAllowed ? "text-slate-500" : "text-red-300/90",
        className,
      )}
    >
      <span className="text-slate-600">Risk guard: </span>
      {tradingAllowed ? (
        <>
          <span className="text-emerald-400/90">Allowed</span>
          <span className="text-slate-600">
            {" "}
            · Max lev {maxLev}x · Max risk {PAPER_RISK_GUARD_POLICY.maxRiskPerTradePct}%
            {" "}
            · Live locked
          </span>
        </>
      ) : (
        <>
          <span className="font-semibold">Blocked</span>
          {reason ? (
            <span className="text-red-300/80"> · {reason}</span>
          ) : null}
        </>
      )}
    </p>
  );
}
