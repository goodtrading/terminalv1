import React from "react";
import { cn } from "@/lib/utils";
import { formatNetPositionPct } from "../chartRisk/positionPnlDisplay";
import type { PaperOrderSnapshot } from "../execution/executionTypes";
import type { PaperChartOrder, PaperChartOrderKind } from "./paperTradeOverlayHelpers";

const COLORS: Record<PaperChartOrderKind, string> = {
  LIMIT: "rgba(34, 211, 238, 0.85)",
  STOP_LOSS: "rgba(245, 158, 11, 0.9)",
  TAKE_PROFIT: "rgba(52, 211, 153, 0.9)",
};

function formatSize(order: PaperOrderSnapshot): string {
  if (order.sizeUnit === "USDT") return `${order.size.toFixed(0)} USDT`;
  if (order.sizeUnit === "BTC") return `${order.size.toFixed(6)} BTC`;
  return `${order.size}%`;
}

function labelFor(kind: PaperChartOrderKind): string {
  return kind === "LIMIT" ? "LIMIT" : kind === "STOP_LOSS" ? "SL" : "TP";
}

export function PaperChartOrderBar({
  model,
  y,
  chartWidth,
  chartHeight,
  projectedNet = null,
  projectedNetPct = null,
  dragging = false,
  busy = false,
  readOnly = false,
  onPointerDown,
  onCancel,
}: {
  model: PaperChartOrder;
  y: number;
  chartWidth: number;
  chartHeight: number;
  projectedNet?: number | null;
  projectedNetPct?: number | null;
  dragging?: boolean;
  busy?: boolean;
  readOnly?: boolean;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onCancel: (clientOrderId: string) => void;
}) {
  const color = COLORS[model.kind];
  if (!Number.isFinite(y) || y < 0 || y > chartHeight) return null;
  const top = y - 10;
  const label = labelFor(model.kind);
  const stop = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <div
        className="absolute left-0 pointer-events-none"
        style={{ top: y, width: chartWidth - 108, height: 0, zIndex: 14 }}
      >
        {/* Horizontal line and axis marker belong exclusively to the native PriceLine. */}
        {!readOnly && model.draggable && onPointerDown ? (
          <div
            role="slider"
            aria-label={`Drag ${label} to modify`}
            title={`Drag ${label} to modify`}
            className={cn("absolute left-0 right-0 h-4 -translate-y-1/2 pointer-events-auto cursor-ns-resize", dragging && "bg-white/[0.03]")}
            onPointerDown={onPointerDown}
            onContextMenu={(event) => {
              stop(event);
              if (!readOnly && model.cancelable && !busy) onCancel(model.clientOrderId);
            }}
          />
        ) : null}
      </div>
      <div
        data-chart-order-label={model.clientOrderId}
        data-order-kind={model.kind}
        className="absolute z-[16] pointer-events-auto flex items-stretch rounded border bg-[#080808] font-mono text-[9px] leading-none shadow-sm"
        style={{ top, right: 108, height: 20, maxWidth: chartWidth - 116, borderColor: color, color }}
        onPointerDown={(event) => { if (!readOnly && !busy && model.draggable && event.button === 0) onPointerDown?.(event); else stop(event); }}
        onContextMenu={(event) => {
          stop(event);
          if (!readOnly && model.cancelable && !busy) onCancel(model.clientOrderId);
        }}
      >
        <div className="flex items-center gap-1.5 px-1.5 font-bold uppercase whitespace-nowrap">
          <span>{label}</span><span>{model.side}</span>
          <span className="font-normal tabular-nums">{formatSize(model.source)}</span>
          <span className="font-normal">@ {model.kind === "LIMIT" ? model.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : `${formatNetPositionPct(projectedNetPct)} NET`}</span>
        </div>
        <button
          type="button"
          disabled={readOnly || busy}
          title={`Cancel ${label}`}
          onPointerDown={stop}
          onClick={(event) => { stop(event); onCancel(model.clientOrderId); }}
          onContextMenu={(event) => { stop(event); if (!readOnly && !busy) onCancel(model.clientOrderId); }}
          className="px-1.5 border-l hover:bg-white/10 shrink-0 disabled:opacity-50"
          style={{ borderColor: color }}
        >×</button>
      </div>
    </>
  );
}
