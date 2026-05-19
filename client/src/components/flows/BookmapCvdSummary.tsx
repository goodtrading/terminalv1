import { cn } from "@/lib/utils";
import { formatBtcCompact } from "./bookmapTradeAggregation";
import type { BookmapTradeSessionSummary } from "./bookmapTradeTypes";
import { DOM_FONT_CLASS } from "./domLadderUtils";

export type BookmapCvdSummaryProps = {
  summary: BookmapTradeSessionSummary;
  bucketMs: number;
  scope: "session" | "visible";
  enabled?: boolean;
  tradeCount?: number;
};

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[9px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className={cn(DOM_FONT_CLASS, "text-[10px] text-slate-200", valueClass)}>
        {value}
      </span>
    </div>
  );
}

export function BookmapCvdSummary({
  summary,
  bucketMs,
  scope,
  enabled = true,
  tradeCount,
}: BookmapCvdSummaryProps) {
  if (!enabled) {
    return (
      <div className="shrink-0 border-b border-terminal-border/60 bg-[#0a0f18]/98 px-2 py-2">
        <div className="text-[9px] font-mono text-slate-500">CVD / Delta disabled</div>
      </div>
    );
  }

  const cvdClass =
    summary.cvd > 0
      ? "text-emerald-300"
      : summary.cvd < 0
        ? "text-rose-300"
        : "text-slate-300";
  const deltaClass =
    summary.delta > 0
      ? "text-emerald-300/90"
      : summary.delta < 0
        ? "text-rose-300/90"
        : "text-slate-300";

  return (
    <div className="shrink-0 border-b border-terminal-border/60 bg-[#0a0f18]/98 px-2 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
          CVD / Delta
        </span>
        <span className="text-[8px] font-mono text-slate-500">
          {scope} · {Math.round(bucketMs / 1000)}s
          {tradeCount != null ? ` · ${tradeCount} trades` : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <Row
          label="CVD"
          value={`${summary.cvd >= 0 ? "+" : ""}${formatBtcCompact(summary.cvd)} BTC`}
          valueClass={cvdClass}
        />
        <Row label="Volume" value={`${formatBtcCompact(summary.volume)} BTC`} />
        <Row label="Buy vol" value={`${formatBtcCompact(summary.buyVolume)} BTC`} />
        <Row label="Sell vol" value={`${formatBtcCompact(summary.sellVolume)} BTC`} />
        <Row
          label="Delta"
          value={`${summary.delta >= 0 ? "+" : ""}${formatBtcCompact(summary.delta)} BTC`}
          valueClass={deltaClass}
        />
        <Row
          label="Imbalance"
          value={`${summary.imbalancePct >= 0 ? "+" : ""}${summary.imbalancePct.toFixed(1)}%`}
          valueClass={deltaClass}
        />
      </div>
    </div>
  );
}
