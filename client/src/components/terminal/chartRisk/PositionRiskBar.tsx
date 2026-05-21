import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  formatBingxMarginModeShort,
  formatBingxPositionAccountPct,
  formatEntryPrice,
  formatMarginMode,
  formatOverlayPnlUsdt,
  formatOverlayQty,
  resolveBingxExecutionBadge,
} from "./positionRiskOverlayShared";
import type {
  PositionRiskOverlayAccount,
  PositionRiskOverlayMode,
  PositionRiskOverlayPosition,
} from "./positionRiskOverlayTypes";
import { BAR_HEIGHT, PRICE_SCALE_INSET } from "./positionRiskOverlayStyles";

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
    const bingxLev =
      position.leverage != null && position.leverage > 0
        ? `${position.leverage}x`
        : null;
    const bingxMargin = formatBingxMarginModeShort(position.marginMode);
    const bingxLevMargin = [bingxLev, bingxMargin].filter(Boolean).join(" ");
    const accountPctLabel = formatBingxPositionAccountPct(position, account);
    const executionBadge = resolveBingxExecutionBadge(mode, liveTradingEnabled);

    const parts = [
      "BINGX REAL",
      sideLabel,
      `ENTRY ${entryStr}`,
      formatOverlayPnlUsdt(position.unrealizedPnlUsdt),
      accountPctLabel,
      bingxLevMargin,
      executionBadge,
    ].filter((p) => p && p !== "—");

    return (
      <div
        className="group absolute z-[16] pointer-events-auto flex items-stretch font-mono text-[9px] leading-none shadow-md"
        style={{
          top: barTop,
          right: PRICE_SCALE_INSET + 4,
          height: BAR_HEIGHT,
          maxWidth: chartWidth - PRICE_SCALE_INSET - 12,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-l border border-r-0 px-1.5 py-0.5 max-w-full min-w-0 shrink",
            "border-slate-600/50 bg-[#080808]/95",
            position.side === "long" ? "text-cyan-300/95" : "text-orange-300/95",
            !bingxLockedControls && "rounded-r",
          )}
        >
          <span className="truncate tabular-nums">{parts.join(" · ")}</span>
        </div>
        {bingxLockedControls}
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
