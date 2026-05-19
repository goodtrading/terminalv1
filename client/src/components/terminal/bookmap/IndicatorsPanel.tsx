import { cn } from "@/lib/utils";

const PLACEHOLDER_INDICATORS = [
  "Gamma Levels",
  "VWAP",
  "Liquidations",
  "Open Interest",
  "Funding",
  "Absorption",
  "Sweeps",
] as const;

export interface IndicatorsPanelProps {
  onClose: () => void;
}

export function IndicatorsPanel({ onClose }: IndicatorsPanelProps) {
  return (
    <div
      className="absolute top-10 right-3 z-[60] w-[300px] max-h-[min(70vh,520px)] overflow-y-auto rounded-lg border border-cyan-500/25 bg-[#050b12]/97 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      role="dialog"
      aria-label="Indicators"
    >
      <div className="sticky top-0 flex items-center justify-between border-b border-cyan-500/20 bg-[#07111c] px-3 py-2">
        <div>
          <span className="text-[11px] font-mono font-semibold tracking-wide text-cyan-300/95 uppercase block">
            Indicators
          </span>
          <span className="text-[8px] font-mono text-slate-600 uppercase tracking-wider">
            Bookmap · order flow
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-mono text-slate-500 hover:text-slate-200 px-1.5 py-0.5 rounded border border-transparent hover:border-slate-600"
          aria-label="Close indicators"
        >
          ×
        </button>
      </div>
      <div className="px-3 py-3 space-y-3">
        <p className="text-[9px] font-mono text-slate-500 leading-relaxed border border-slate-800/60 rounded px-2 py-1.5 bg-[#0a121c]/80">
          Future overlay indicators for Bookmap / order flow context. Coming in a later
          release.
        </p>
        <ul className="space-y-1">
          {PLACEHOLDER_INDICATORS.map((name) => (
            <li key={name}>
              <button
                type="button"
                disabled
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded border text-[10px] font-mono",
                  "border-slate-800/80 bg-[#0a121c] text-slate-600 cursor-not-allowed",
                )}
              >
                {name}
                <span className="float-right text-[9px] text-slate-700">soon</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
