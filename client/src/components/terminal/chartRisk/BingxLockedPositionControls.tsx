import { useCallback, useState, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import {
  blockedActionControlTitle,
  blockedActionHintMessage,
  type BlockedRealActionKind,
} from "./blockedActionHint";
import { emitBlockedRealChartActionAudit } from "./blockedRealActionAudit";

const MINI_BADGE =
  "px-1 py-px rounded border font-bold uppercase tracking-wide shrink-0 touch-none cursor-not-allowed opacity-70 select-none text-[8px] leading-none";

type BingxLockedPositionControlsProps = {
  hasStopLoss: boolean;
  hasTakeProfit: boolean;
  showClose?: boolean;
  onBlockedRealAction?: (action: BlockedRealActionKind) => void;
  onRequestClosePosition?: () => void;
  onRequestAddStopLoss?: () => void;
  onRequestAddTakeProfit?: () => void;
};

export function BingxLockedPositionControls({
  hasStopLoss,
  hasTakeProfit,
  showClose = true,
  onBlockedRealAction,
  onRequestClosePosition,
  onRequestAddStopLoss,
  onRequestAddTakeProfit,
}: BingxLockedPositionControlsProps) {
  const [hint, setHint] = useState<string | null>(null);

  const showBlockedActionHint = useCallback((action: BlockedRealActionKind) => {
    setHint(blockedActionHintMessage(action));
    window.setTimeout(() => setHint(null), 2400);
  }, []);

  const blockClick = useCallback(
    (
      e: MouseEvent | PointerEvent,
      action: BlockedRealActionKind,
      onRequest?: () => void,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      emitBlockedRealChartActionAudit(action);
      onBlockedRealAction?.(action);
      showBlockedActionHint(action);
      onRequest?.();
    },
    [onBlockedRealAction, showBlockedActionHint],
  );

  const hasAny = !hasStopLoss || !hasTakeProfit || showClose;
  if (!hasAny) return null;

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0 border-l border-slate-600/45 pl-1 ml-0.5">
      {!hasStopLoss ? (
        <button
          type="button"
          aria-disabled="true"
          title={blockedActionControlTitle("add_sl")}
          onClick={(e) => blockClick(e, "add_sl", onRequestAddStopLoss)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            MINI_BADGE,
            "border-dashed border-amber-800/55 text-amber-500/70 bg-amber-950/25",
          )}
        >
          +SL
        </button>
      ) : null}
      {!hasTakeProfit ? (
        <button
          type="button"
          aria-disabled="true"
          title={blockedActionControlTitle("add_tp")}
          onClick={(e) => blockClick(e, "add_tp", onRequestAddTakeProfit)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            MINI_BADGE,
            "border-dashed border-emerald-800/55 text-emerald-500/70 bg-emerald-950/25",
          )}
        >
          +TP
        </button>
      ) : null}
      {showClose ? (
        <button
          type="button"
          aria-disabled="true"
          title={blockedActionControlTitle("close")}
          onClick={(e) => blockClick(e, "close", onRequestClosePosition)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            MINI_BADGE,
            "border-slate-600/50 text-slate-500 bg-[#0a0a0a]/90 opacity-0 group-hover:opacity-70 transition-opacity",
          )}
        >
          ×
        </button>
      ) : null}
      {hint ? (
        <span
          className="absolute left-0 top-full mt-0.5 z-[20] max-w-[min(100%,240px)] truncate rounded border border-amber-900/45 bg-black/92 px-1.5 py-0.5 text-[8px] font-mono text-amber-200/90 pointer-events-none whitespace-nowrap"
          role="status"
        >
          {hint}
        </span>
      ) : null}
    </span>
  );
}
