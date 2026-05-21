import { cn } from "@/lib/utils";
import { formatHeatmapPrice } from "./liquidityHeatmapUtils";
import {
  formatDivergenceHeadline,
  type SpotPerpDivergenceSignal,
} from "./bookmapDivergenceEngine";
import {
  formatDivergenceBiasLabel,
  formatDivergenceContextLabel,
} from "./bookmapDivergenceQuality";

type Props = {
  signals: SpotPerpDivergenceSignal[];
  showInvalidation?: boolean;
  showBias?: boolean;
  className?: string;
};

export function SpotPerpDivergencePanel({
  signals,
  showInvalidation = true,
  showBias = true,
  className,
}: Props) {
  if (signals.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none max-w-[240px] rounded border border-violet-500/35 bg-[#0b1220]/92 px-2 py-1.5 shadow-lg backdrop-blur-sm",
        className,
      )}
    >
      <div className="text-[8px] font-mono uppercase tracking-widest text-violet-300/90 mb-1">
        SPOT / PERP SIGNALS
      </div>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li
            key={s.id}
            className="text-[9px] font-mono leading-snug border-t border-slate-800/80 pt-1.5 first:border-0 first:pt-0"
          >
            <div className="text-slate-200 flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <span
                className={cn(
                  "font-semibold",
                  s.severity === "high"
                    ? "text-amber-300"
                    : s.severity === "medium"
                      ? "text-violet-200"
                      : "text-slate-400",
                )}
              >
                {s.severity.toUpperCase()}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-violet-300/90 font-semibold">
                {formatDivergenceContextLabel(s.context)}
              </span>
              {showBias ? (
                <>
                  <span className="text-slate-600">/</span>
                  <span
                    className={cn(
                      s.bias === "bullish"
                        ? "text-emerald-400/90"
                        : s.bias === "bearish"
                          ? "text-rose-400/90"
                          : "text-slate-400",
                    )}
                  >
                    {formatDivergenceBiasLabel(s.bias)}
                  </span>
                </>
              ) : null}
            </div>
            <div className="text-slate-300 mt-0.5">{formatDivergenceHeadline(s)}</div>
            {Number.isFinite(s.price) && s.price > 0 ? (
              <div className="text-slate-500 mt-0.5">
                Near {formatHeatmapPrice(s.price)}
              </div>
            ) : null}
            {showInvalidation ? (
              <div className="text-slate-600 mt-0.5 leading-tight">
                <span className="text-slate-500">Invalidation: </span>
                {s.invalidation}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
