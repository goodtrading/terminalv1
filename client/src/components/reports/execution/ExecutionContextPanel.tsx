import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ExecutionContextSnapshot } from "./executionReportTypes";

function fmtPrice(n?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function regimeLabel(r?: ExecutionContextSnapshot["gamma"]["regime"]): string {
  if (r === "long_gamma") return "Long gamma";
  if (r === "short_gamma") return "Short gamma";
  if (r === "transition") return "Transition";
  if (r === "unknown") return "Unknown";
  return "Unavailable";
}

function alignmentClass(
  a: ExecutionContextSnapshot["diagnostics"]["contextAlignment"],
): string {
  if (a === "aligned") return "text-emerald-400/90";
  if (a === "conflicted") return "text-amber-400/90";
  if (a === "danger") return "text-red-400/90";
  return "text-slate-400";
}

export function ExecutionContextPanel({
  context,
  compact = false,
}: {
  context: ExecutionContextSnapshot | null | undefined;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!context) {
    return (
      <p className="text-[10px] font-mono text-slate-600 py-1">
        Context not captured for this trade.
      </p>
    );
  }

  const gamma = context.gamma ?? {};
  const liquidity = context.liquidity ?? {};
  const risk = context.risk ?? {
    stopLossDetected: false,
    takeProfitDetected: false,
  };
  const diagnostics = context.diagnostics ?? {
    contextAlignment: "unknown" as const,
    warnings: [],
    positives: [],
    summary: "Context unavailable.",
  };
  const market = context.market ?? {};
  const gammaUnavailable =
    !gamma.regime && !gamma.flip && !gamma.nearestMagnet;
  const liqUnavailable =
    !liquidity.nearestMagnet &&
    !liquidity.nearestSupport &&
    !liquidity.nearestResistance;

  const oneLiner = [
    `Gamma: ${gammaUnavailable ? "unavailable" : regimeLabel(gamma.regime)}`,
    gamma.flip != null ? `· Flip ${fmtPrice(gamma.flip)}` : "",
    `· Risk ${risk.riskMirrorStatus ?? (risk.stopLossDetected ? "SL on" : "—")}`,
    `· ${diagnostics.contextAlignment}`,
  ].join(" ");

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left py-1.5 px-2 rounded border border-white/[0.06] bg-black/40 hover:bg-white/[0.03]"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Context
        </span>
        <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{oneLiner}</p>
        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{diagnostics.summary}</p>
      </button>
    );
  }

  return (
    <div className="py-2 px-2 rounded border border-white/[0.06] bg-[#0a0a0a] space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Context snapshot
        </span>
        {compact ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[9px] text-slate-600 hover:text-slate-400"
          >
            Collapse
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge>
          {gammaUnavailable ? "Gamma unavailable" : regimeLabel(gamma.regime)}
        </Badge>
        {gamma.flip != null ? <Badge>Flip {fmtPrice(gamma.flip)}</Badge> : null}
        {gamma.transitionZone?.lower != null && gamma.transitionZone?.upper != null ? (
          <Badge>
            TZ {fmtPrice(gamma.transitionZone.lower)}–{fmtPrice(gamma.transitionZone.upper)}
          </Badge>
        ) : null}
        {gamma.nearestMagnet ? (
          <Badge>
            G magnet {fmtPrice(gamma.nearestMagnet.price)} ({gamma.nearestMagnet.distancePct}%)
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {liqUnavailable ? (
          <Badge muted>Liquidity unavailable</Badge>
        ) : (
          <>
            {liquidity.nearestMagnet ? (
              <Badge>
                Liq {liquidity.nearestMagnet.side ?? "?"} {fmtPrice(liquidity.nearestMagnet.price)} (
                {liquidity.nearestMagnet.distancePct}%)
              </Badge>
            ) : null}
            {liquidity.nearestSupport ? (
              <Badge>Sup {fmtPrice(liquidity.nearestSupport.price)}</Badge>
            ) : null}
            {liquidity.nearestResistance ? (
              <Badge>Res {fmtPrice(liquidity.nearestResistance.price)}</Badge>
            ) : null}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
        <span className="text-slate-500">
          Risk Mirror:{" "}
          <span className="text-slate-300">{risk.riskMirrorStatus ?? "—"}</span>
        </span>
        <span className="text-slate-500">
          SL:{" "}
          <span className={risk.stopLossDetected ? "text-emerald-400/90" : "text-red-400/80"}>
            {risk.stopLossDetected ? "Yes" : "No"}
          </span>
        </span>
        <span className="text-slate-500">
          TP:{" "}
          <span className={risk.takeProfitDetected ? "text-emerald-400/90" : "text-slate-500"}>
            {risk.takeProfitDetected ? "Yes" : "No"}
          </span>
        </span>
        {risk.estimatedLossAccountPct != null ? (
          <span className="text-slate-500">
            Est. loss: {risk.estimatedLossAccountPct.toFixed(2)}% acct
          </span>
        ) : null}
        {risk.distanceToLiquidationPct != null ? (
          <span className="text-slate-500">
            Liq dist: {risk.distanceToLiquidationPct.toFixed(1)}%
          </span>
        ) : null}
        {market.marketDataHealth ? (
          <span className="text-slate-500">MD: {market.marketDataHealth}</span>
        ) : null}
      </div>

      <p className={cn("text-[10px] font-mono capitalize", alignmentClass(diagnostics.contextAlignment))}>
        Alignment: {diagnostics.contextAlignment}
      </p>
      <p className="text-[10px] text-slate-400 leading-snug">{diagnostics.summary}</p>
    </div>
  );
}

function Badge({
  children,
  muted,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide border",
        muted
          ? "border-slate-700 text-slate-600"
          : "border-terminal-border text-slate-400 bg-black/30",
      )}
    >
      {children}
    </span>
  );
}
