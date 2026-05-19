import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type BookmapCvdGaugeProps = {
  value: number;
  width?: number;
  height?: number;
  /** Session / visible CVD samples for arc normalization. */
  cvdSamples?: number[];
  showLiveLabel?: boolean;
  className?: string;
};

function formatGaugeCvd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${k >= 10 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(1)}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

const ARC_START = 135;
const ARC_END = 405;
const ARC_SPAN = ARC_END - ARC_START;

export function BookmapCvdGauge({
  value,
  width = 140,
  height = 110,
  cvdSamples = [],
  showLiveLabel = true,
  className,
}: BookmapCvdGaugeProps) {
  const { ratio, arcColor, valueColor } = useMemo(() => {
    const samples = cvdSamples.length > 0 ? cvdSamples : [value];
    let maxAbs = Math.max(Math.abs(value), 0.01);
    for (const c of samples) {
      if (Number.isFinite(c)) maxAbs = Math.max(maxAbs, Math.abs(c));
    }
    const r = Math.min(1, Math.max(0.08, Math.abs(value) / maxAbs));
    const positive = value >= 0;
    return {
      ratio: r,
      arcColor: positive ? "rgba(0, 220, 140, 0.92)" : "rgba(255, 95, 55, 0.92)",
      valueColor: positive ? "rgb(110, 240, 190)" : "rgb(255, 140, 100)",
    };
  }, [value, cvdSamples]);

  const w = width;
  const h = height;
  const cx = w / 2;
  const cy = h * 0.46;
  const radius = Math.min(w, h) * 0.36;
  const activeEnd = ARC_START + ARC_SPAN * ratio;
  const trackPath = describeArc(cx, cy, radius, ARC_START, ARC_END);
  const valuePath =
    ratio > 0.02 ? describeArc(cx, cy, radius, ARC_START, activeEnd) : "";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-sm border border-slate-700/60 bg-[#0a0f18]/95",
        className,
      )}
      style={{ width: w, height: h, minWidth: w, minHeight: h }}
    >
      <svg
        width={w}
        height={h * 0.72}
        viewBox={`0 0 ${w} ${h * 0.72}`}
        className="shrink-0"
        aria-hidden
      >
        <path
          d={trackPath}
          fill="none"
          stroke="rgba(51, 65, 85, 0.85)"
          strokeWidth={5}
          strokeLinecap="round"
        />
        {valuePath ? (
          <path
            d={valuePath}
            fill="none"
            stroke={arcColor}
            strokeWidth={5}
            strokeLinecap="round"
          />
        ) : null}
      </svg>
      <div className="-mt-1 flex flex-col items-center justify-center leading-none">
        <span
          className="font-mono text-[13px] font-semibold tabular-nums tracking-tight"
          style={{ color: valueColor }}
        >
          {formatGaugeCvd(value)}
        </span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
          CVD
        </span>
        {showLiveLabel && (
          <span className="mt-0.5 text-[7px] font-mono uppercase tracking-wide text-slate-600">
            Data: Live
          </span>
        )}
      </div>
    </div>
  );
}
