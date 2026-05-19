import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatCompactBtc,
  percentile95,
} from "./bookmapTradeAggregation";
import type { DeltaVolumeBucket } from "./bookmapTradeTypes";

const LABEL_COL_PX = 64;
const CELL_W_MIN = 56;
const CELL_W_MAX = 72;
const ROW_H_MIN = 32;
const ROW_H_MAX = 38;
const HEADER_H = 20;

export type DeltaVolumeMatrixPanelProps = {
  buckets: DeltaVolumeBucket[];
  height: number;
  cvd: number;
  enabled?: boolean;
  bucketMs?: number;
};

function intensityFromValue(value: number, p95: number): number {
  if (!Number.isFinite(value) || p95 <= 0) return 0;
  return Math.min(1, Math.max(0, Math.abs(value) / p95));
}

/** Buy-dominant delta = emerald; sell-dominant = rose (matches DOM). */
function deltaCellColors(delta: number, intensity: number): {
  backgroundColor: string;
  color: string;
} {
  const t = intensity;
  if (delta >= 0) {
    const r = Math.round(14 + t * 8);
    const g = Math.round(32 + t * 188);
    const b = Math.round(26 + t * 98);
    return {
      backgroundColor: `rgb(${r},${g},${b})`,
      color: t >= 0.62 ? "#0a0e14" : "#e2e8f0",
    };
  }
  const r = Math.round(32 + t * 208);
  const g = Math.round(18 + t * 42);
  const b = Math.round(20 + t * 42);
  return {
    backgroundColor: `rgb(${r},${g},${b})`,
    color: t >= 0.62 ? "#0a0e14" : "#e2e8f0",
  };
}

function volumeCellColors(volume: number, p95: number): {
  backgroundColor: string;
  color: string;
} {
  const t = intensityFromValue(volume, p95);
  const gray = Math.round(22 + t * 200);
  return {
    backgroundColor: `rgb(${gray},${gray},${gray + 6})`,
    color: t >= 0.55 ? "#0a0e14" : "#cbd5e1",
  };
}

function MatrixCell({
  value,
  backgroundColor,
  color,
  width,
  height,
}: {
  value: string;
  backgroundColor: string;
  color: string;
  width: number;
  height: number;
}) {
  return (
    <div
      className="flex items-center justify-center border border-slate-700/70 font-mono text-[10px] tabular-nums leading-none shrink-0"
      style={{ width, height, backgroundColor, color }}
    >
      {value}
    </div>
  );
}

export function DeltaVolumeMatrixPanel({
  buckets,
  height,
  cvd,
  enabled = true,
  bucketMs,
}: DeltaVolumeMatrixPanelProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () => setWidth(el.clientWidth);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const bodyH = Math.max(ROW_H_MIN * 2, height - HEADER_H);
    const rowH = Math.max(ROW_H_MIN, Math.min(ROW_H_MAX, Math.floor(bodyH / 2)));
    const gridW = Math.max(0, width - LABEL_COL_PX);
    let cellW = CELL_W_MIN;
    let colCount = Math.max(1, Math.floor(gridW / cellW));
    if (colCount > 0) {
      cellW = Math.min(CELL_W_MAX, Math.max(CELL_W_MIN, Math.floor(gridW / colCount)));
      colCount = Math.max(1, Math.floor(gridW / cellW));
    }
    const visible = buckets.slice(-colCount);
    return { rowH, cellW, colCount, visible };
  }, [buckets, width, height]);

  const deltaP95 = useMemo(
    () => percentile95(layout.visible.map((b) => Math.abs(b.delta))),
    [layout.visible],
  );
  const volP95 = useMemo(
    () => percentile95(layout.visible.map((b) => b.volume)),
    [layout.visible],
  );

  if (!enabled) {
    return (
      <div
        ref={wrapRef}
        className="flex w-full min-w-0 items-center justify-center border-t border-terminal-border/60 bg-[#080d14] text-[11px] font-mono text-slate-500"
        style={{ height }}
      >
        Delta / Volume disabled
      </div>
    );
  }

  const cvdLabel = `CVD ${cvd >= 0 ? "+" : ""}${formatCompactBtc(cvd)} BTC`;

  return (
    <div
      ref={wrapRef}
      className="flex w-full min-w-0 flex-col overflow-hidden border-t border-terminal-border/60 bg-[#080d14]"
      style={{ height }}
    >
      <div
        className="flex shrink-0 items-center justify-between px-2 border-b border-slate-700/50"
        style={{ height: HEADER_H }}
      >
        <span className="text-[9px] font-mono uppercase tracking-wide text-slate-500">
          Delta / Volume
          {bucketMs != null ? ` · ${Math.round(bucketMs / 1000)}s` : ""}
        </span>
        <span
          className={cn(
            "text-[10px] font-mono tabular-nums",
            cvd >= 0 ? "text-emerald-300/90" : "text-rose-300/90",
          )}
        >
          {cvdLabel}
        </span>
      </div>

      {layout.visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] font-mono text-slate-500">
          Waiting for trades…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
          <div className="flex shrink-0" style={{ minWidth: LABEL_COL_PX + layout.cellW * layout.visible.length }}>
            <div
              className="flex shrink-0 flex-col border-r border-slate-700/70"
              style={{ width: LABEL_COL_PX }}
            >
              <div
                className="flex items-center justify-end border-b border-slate-700/70 px-2 text-[9px] font-mono uppercase tracking-wide text-slate-400"
                style={{ height: layout.rowH }}
              >
                Delta
              </div>
              <div
                className="flex items-center justify-end px-2 text-[9px] font-mono uppercase tracking-wide text-slate-400"
                style={{ height: layout.rowH }}
              >
                Volume
              </div>
            </div>
            <div className="flex shrink-0">
              {layout.visible.map((bucket) => {
                const dInt = intensityFromValue(bucket.delta, deltaP95);
                const dColors = deltaCellColors(bucket.delta, dInt);
                const vColors = volumeCellColors(bucket.volume, volP95);
                return (
                  <div key={bucket.timeBucket} className="flex shrink-0 flex-col">
                    <MatrixCell
                      value={formatCompactBtc(bucket.delta)}
                      width={layout.cellW}
                      height={layout.rowH}
                      {...dColors}
                    />
                    <MatrixCell
                      value={formatCompactBtc(bucket.volume)}
                      width={layout.cellW}
                      height={layout.rowH}
                      {...vColors}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
