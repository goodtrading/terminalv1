import type { MouseEvent, PointerEvent } from "react";
import { cn } from "@/lib/utils";
import {
  emitBlockedRealChartActionAudit,
  type BlockedRealChartAction,
} from "./blockedRealActionAudit";

const LOCKED_BTN =
  "px-1.5 border-y border-l-0 font-bold uppercase tracking-wider shrink-0 touch-none cursor-not-allowed opacity-55 select-none";
const LOCKED_CLOSE =
  "px-1.5 rounded-r border border-l-0 border-slate-600/50 bg-[#080808]/95 text-slate-500 shrink-0 touch-none cursor-not-allowed opacity-0 group-hover:opacity-55 transition-opacity select-none";

function blockClick(
  e: MouseEvent | PointerEvent,
  action: BlockedRealChartAction,
  onRequest?: () => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  emitBlockedRealChartActionAudit(action);
  onRequest?.();
}

type BingxLockedPositionControlsProps = {
  hasStopLoss: boolean;
  hasTakeProfit: boolean;
  showClose?: boolean;
  onRequestClosePosition?: () => void;
  onRequestAddStopLoss?: () => void;
  onRequestAddTakeProfit?: () => void;
};

export function BingxLockedPositionControls({
  hasStopLoss,
  hasTakeProfit,
  showClose = true,
  onRequestClosePosition,
  onRequestAddStopLoss,
  onRequestAddTakeProfit,
}: BingxLockedPositionControlsProps) {
  return (
    <>
      {!hasStopLoss ? (
        <button
          type="button"
          aria-disabled="true"
          title="Adding real stop loss from GoodTrading is locked in this build."
          onClick={(e) => blockClick(e, "blocked_real_add_sl", onRequestAddStopLoss)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            LOCKED_BTN,
            "border-dashed border-amber-900/50 text-amber-500/50 bg-[#0a0a0a]/95",
          )}
        >
          +SL LOCKED
        </button>
      ) : null}
      {!hasTakeProfit ? (
        <button
          type="button"
          aria-disabled="true"
          title="Adding real take profit from GoodTrading is locked in this build."
          onClick={(e) => blockClick(e, "blocked_real_add_tp", onRequestAddTakeProfit)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            LOCKED_BTN,
            "border-dashed border-emerald-900/50 text-emerald-500/50 bg-[#0a0a0a]/95",
          )}
        >
          +TP LOCKED
        </button>
      ) : null}
      {showClose ? (
        <button
          type="button"
          aria-disabled="true"
          title="Real close is locked. Live trading is disabled."
          onClick={(e) => blockClick(e, "blocked_real_close", onRequestClosePosition)}
          onPointerDown={(e) => e.stopPropagation()}
          className={LOCKED_CLOSE}
        >
          ×
        </button>
      ) : null}
    </>
  );
}
