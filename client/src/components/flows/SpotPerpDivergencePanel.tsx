import { cn } from "@/lib/utils";
import { formatHeatmapPrice } from "./liquidityHeatmapUtils";
import {
  formatDivergenceHeadline,
  type SpotPerpDivergenceSignal,
} from "./bookmapDivergenceEngine";

type Props = {
  signals: SpotPerpDivergenceSignal[];
  className?: string;
};

export function SpotPerpDivergencePanel({ signals, className }: Props) {
  if (signals.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none max-w-[220px] rounded border border-violet-500/35 bg-[#0b1220]/92 px-2 py-1.5 shadow-lg backdrop-blur-sm",
        className,
      )}
    >
      <div className="text-[8px] font-mono uppercase tracking-widest text-violet-300/90 mb-1">
        SPOT / PERP SIGNALS
      </div>
      <ul className="space-y-1.5">
        {signals.map((s) => (
          <li key={s.id} className="text-[9px] font-mono leading-snug">
            <div className="text-slate-200">
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
              {" · "}
              {formatDivergenceHeadline(s)}
            </div>
            <div className="text-slate-500 mt-0.5">
              {s.explanation}
              {Number.isFinite(s.price) && s.price > 0 ? (
                <span className="text-slate-600"> near {formatHeatmapPrice(s.price)}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
