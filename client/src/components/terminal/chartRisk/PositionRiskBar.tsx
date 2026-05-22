import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  formatBingxBarStatusLabel,
  formatBingxCompactEntryPrice,
  formatBingxPositionAccountPct,
  formatEntryPrice,
  formatMarginMode,
  formatOverlayPnlUsdt,
  formatOverlayQty,
} from "./positionRiskOverlayShared";
import type {
  PositionRiskOverlayAccount,
  PositionRiskOverlayMode,
  PositionRiskOverlayPosition,
} from "./positionRiskOverlayTypes";
import {
  BAR_HEIGHT,
  BINGX_BAR_MAX_WIDTH,
  BINGX_BAR_RIGHT_OFFSET,
  PRICE_SCALE_INSET,
} from "./positionRiskOverlayStyles";

type PositionRiskBarProps = {
  mode: PositionRiskOverlayMode;
  position: PositionRiskOverlayPosition;
  account?: PositionRiskOverlayAccount | null;
  chartWidth: number;
  barTop: number;
  readonly: boolean;
  showReadOnlyBadge?: boolean;
  liveTradingEnabled?: boolean;
  /** Paper: TP / SL buttons (before PnL segment) */
  paperControls?: ReactNode;
  /** Paper: close button after PnL */
  paperTrailing?: ReactNode;
  /** BingX: locked +SL / +TP / × controls */
  bingxLockedControls?: ReactNode;
};

export function PositionRiskBar({
  mode,
  position,
  account,
  chartWidth,
  barTop,
  readonly,
  showReadOnlyBadge,
  liveTradingEnabled = false,
  paperControls,
  paperTrailing,
  bingxLockedControls,
}: PositionRiskBarProps) {
  const sideLabel = position.side.toUpperCase();
  const qtyLabel = `${formatOverlayQty(position.quantity)} BTC`;
  const pnl = position.unrealizedPnlUsdt ?? 0;
  const entryStr = formatEntryPrice(position.entryPrice);
  const lev =
    position.leverage != null && position.leverage > 0
      ? `${position.leverage}x`
      : null;
  const margin = formatMarginMode(position.marginMode);
  const levMargin = [lev, margin].filter(Boolean).join(" ");

  if (mode === "bingx_read_only" && readonly) {
    const accountPctLabel = formatBingxPositionAccountPct(position, account);
    const compact = chartWidth < 760;
    const statusLabel = formatBingxBarStatusLabel(liveTradingEnabled, compact);

    const parts = [
      "REAL BINGX",
      sideLabel,
      `ENTRY ${formatBingxCompactEntryPrice(position.entryPrice)}`,
      formatOverlayPnlUsdt(position.unrealizedPnlUsdt),
      accountPctLabel,
      statusLabel,
    ].filter((p) => p && p !== "—");

    const rightAnchor = Math.max(
      PRICE_SCALE_INSET + 8,
      BINGX_BAR_RIGHT_OFFSET,
    );

    return (
      <div
        className="group absolute z-[16] pointer-events-auto font-mono text-[8px] leading-none"
        style={{
          top: barTop,
          right: rightAnchor,
          height: BAR_HEIGHT,
          width: "max-content",
          maxWidth: Math.min(BINGX_BAR_MAX_WIDTH, chartWidth - rightAnchor - 8),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "relative flex w-max max-w-full items-center gap-0.5 overflow-hidden whitespace-nowrap rounded border px-1 py-px shadow-sm",
            "border-slate-600/45 bg-[#080808]/92 backdrop-blur-[1px]",
            position.side === "long" ? "text-cyan-300/95" : "text-orange-300/95",
          )}
        >
          <span className="min-w-0 truncate tabular-nums">{parts.join(" · ")}</span>
          {bingxLockedControls}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute z-[16] pointer-events-auto flex items-stretch font-mono text-[10px] leading-none shadow-md"
      style={{
        top: barTop,
        right: PRICE_SCALE_INSET,
        height: BAR_HEIGHT,
        maxWidth: chartWidth - PRICE_SCALE_INSET - 8,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0 rounded-l border border-r-0 border-cyan-500/40 bg-[#0a0a0a]/95 px-1.5 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400">
          Paper
        </span>
      </div>

      <div
        className={cn(
          "flex items-center gap-1.5 border-y border-cyan-500/30 bg-[#0a0a0a]/95 px-2 shrink-0",
          position.side === "long" ? "text-emerald-400" : "text-orange-400",
        )}
      >
        <span className="font-bold uppercase">{sideLabel}</span>
        <span className="text-slate-300 tabular-nums">{qtyLabel}</span>
      </div>

      {paperControls}

      <div
        className={cn(
          "flex items-center px-2 border-y border-l-0 border-slate-600 bg-[#0a0a0a]/95 tabular-nums shrink-0",
          !paperTrailing && "rounded-r",
          pnl > 0 && "text-emerald-400",
          pnl < 0 && "text-red-400",
          pnl === 0 && "text-slate-400",
        )}
      >
        {formatOverlayPnlUsdt(position.unrealizedPnlUsdt)}
      </div>

      {paperTrailing}
    </div>
  );
}
