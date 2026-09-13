import type { PaperState } from "@/lib/paperState";
import { canonicalNetPnl, DEFAULT_EXIT_ESTIMATE } from "./canonicalNetPnl";

const usd = (value: number | null) => value == null ? "NOT AVAILABLE" : `${value.toFixed(5)} USDT`;
export function CanonicalNetPnlCard({ state }: { state: PaperState }) {
  const pnl = canonicalNetPnl(state);
  const open = pnl.mode === "open";
  return (
    <section aria-label="Nautilus NET PnL" className="mb-2 rounded border border-cyan-900/70 bg-black/30 px-3 py-2 font-mono text-[11px]">
      <div className="mb-1 font-bold text-cyan-200">{open ? "OPEN POSITION · NET IF CLOSED NOW (ESTIMATED)" : pnl.mode === "closed" ? "CLOSED POSITIONS · ACTUAL NET (SESSION)" : "NET PnL · NOT AVAILABLE"}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-w-2xl">
        <span>{open ? "Gross unrealized PnL (canonical)" : "Realized PnL (canonical · session)"}</span><span className="text-right">{usd(pnl.gross)}</span>
        <span>{open ? "Entry fees (actual fills)" : "Entry + exit fees (actual fills · session)"}</span><span className="text-right">{usd(pnl.actualFees)}</span>
        {open ? <>
          <span>Exit fee (estimated · {DEFAULT_EXIT_ESTIMATE.feeBps} bps)</span><span className="text-right">{usd(pnl.estimatedExitFee)}</span>
          <span>Exit slippage (estimated · {DEFAULT_EXIT_ESTIMATE.slippageBps} bp)</span><span className="text-right">{usd(pnl.estimatedExitSlippage)}</span>
        </> : null}
        <span className="font-bold">{open ? "Estimated NET if closed now" : "Actual NET · session"}</span><span className="text-right font-bold text-cyan-200">{usd(pnl.net)}</span>
        <span>NET % / canonical equity</span><span className="text-right">{pnl.netPct == null ? "NOT AVAILABLE" : `${pnl.netPct.toFixed(5)}%`}</span>
      </div>
      {open ? <div className="mt-1 text-[10px] text-slate-400">Exit costs are presentation assumptions, not executed charges.</div> : null}
      {pnl.reason ? <div className="mt-1 text-amber-300">{pnl.reason}</div> : null}
    </section>
  );
}
