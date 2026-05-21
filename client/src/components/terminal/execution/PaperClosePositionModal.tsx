import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PaperPositionSnapshot } from "./executionTypes";
import {
  formatPrice,
  formatQtyBtc,
  formatUSDT,
  normalizePaperPositionDisplay,
  pnlColorClass,
} from "./paperFormatHelpers";

const QUICK_PERCENTS = [25, 50, 75, 100] as const;

export interface PaperClosePositionModalProps {
  open: boolean;
  onClose: () => void;
  position: PaperPositionSnapshot;
  loading?: boolean;
  onConfirm: (percent: number) => void | Promise<void>;
}

export function PaperClosePositionModal({
  open,
  onClose,
  position,
  loading = false,
  onConfirm,
}: PaperClosePositionModalProps) {
  const [percent, setPercent] = useState(100);

  const display = useMemo(
    () => normalizePaperPositionDisplay(position),
    [position],
  );

  const entry = display?.entryPrice ?? null;
  const mark = display?.markPrice ?? entry;
  const qtyBTC = display?.qtyBTC ?? null;

  const closeQty = useMemo(() => {
    if (qtyBTC == null || qtyBTC <= 0) return null;
    return (qtyBTC * percent) / 100;
  }, [qtyBTC, percent]);

  const estRealized = useMemo(() => {
    if (entry == null || entry <= 0 || mark == null || closeQty == null) {
      return null;
    }
    const pnlPerUnit =
      display?.side === "long" ? mark - entry : entry - mark;
    return pnlPerUnit * closeQty;
  }, [closeQty, entry, mark, display?.side]);

  const confirmLabel =
    percent >= 100 ? "Close full position" : "Close partial position";

  const sideLabel = display?.side?.toUpperCase() ?? "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="max-w-xs border-terminal-border bg-[#0a0a0a] text-slate-200 font-mono p-4 gap-3">
        <DialogHeader>
          <DialogTitle className="text-[10px] font-bold uppercase tracking-wider text-white">
            Close Paper Position
          </DialogTitle>
        </DialogHeader>

        <div className="text-[9px] space-y-1 text-slate-400">
          <div>
            Side: <span className="text-slate-200">{sideLabel}</span>
          </div>
          <div>Quantity: {formatQtyBtc(qtyBTC)} BTC</div>
          {display?.notionalUSDT != null ? (
            <div>Notional: {formatUSDT(display.notionalUSDT)}</div>
          ) : null}
          <div>Entry: {formatPrice(entry)}</div>
          <div>Mark: {formatPrice(mark)}</div>
          <div>
            Unrealized PnL:{" "}
            <span className={cn(pnlColorClass(display?.unrealizedPnl))}>
              {formatUSDT(display?.unrealizedPnl)}
            </span>
          </div>
          {display?.realizedPnl != null ? (
            <div>
              Realized PnL:{" "}
              <span className={cn(pnlColorClass(display.realizedPnl))}>
                {formatUSDT(display.realizedPnl)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="text-[8px] uppercase tracking-widest text-slate-500">
            Percent to close
          </div>
          <div className="grid grid-cols-4 gap-1">
            {QUICK_PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={loading || qtyBTC == null}
                onClick={() => setPercent(p)}
                className={cn(
                  "py-1 text-[8px] font-bold uppercase border rounded",
                  percent === p
                    ? "border-cyan-500/50 bg-cyan-950/30 text-cyan-200"
                    : "border-terminal-border text-slate-400 hover:border-white/20",
                )}
              >
                {p}%
              </button>
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={percent}
            disabled={loading || qtyBTC == null}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              value={percent}
              disabled={loading || qtyBTC == null}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setPercent(Math.min(100, Math.max(1, v)));
              }}
              className="w-14 rounded border border-terminal-border bg-terminal-bg px-1 py-0.5 text-[9px] text-white"
            />
            <span className="text-[9px] text-slate-500">%</span>
          </div>
        </div>

        <div className="text-[9px] text-slate-500 space-y-0.5 border-t border-terminal-border/60 pt-2">
          <div>Est. close qty: {formatQtyBtc(closeQty)} BTC</div>
          {estRealized != null ? (
            <div>
              Est. realized PnL:{" "}
              <span className={cn(pnlColorClass(estRealized))}>
                {formatUSDT(estRealized)}
              </span>
            </div>
          ) : (
            <div>Est. realized PnL: —</div>
          )}
          <div className="text-[8px] text-slate-600 pt-1">
            Paper simulated only. No real funds.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="py-1.5 text-[9px] font-bold uppercase border border-terminal-border rounded text-slate-400 hover:border-white/20"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || qtyBTC == null || closeQty == null}
            onClick={() => void onConfirm(percent)}
            className="py-1.5 text-[9px] font-bold uppercase border border-red-900/50 rounded text-red-300 bg-red-950/25 hover:bg-red-950/40 disabled:opacity-50"
          >
            {loading ? "..." : `Close ${percent}%`}
          </button>
        </div>
        <p className="text-[8px] text-center text-slate-600">{confirmLabel}</p>
      </DialogContent>
    </Dialog>
  );
}
