import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PaperPositionSnapshot } from "./executionTypes";

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

  const entry = position.entryPrice ?? 0;
  const mark = position.markPrice ?? entry;
  const closeQty = useMemo(
    () => (position.quantity * percent) / 100,
    [position.quantity, percent],
  );

  const estRealized = useMemo(() => {
    if (!entry || entry <= 0 || !mark) return null;
    const pnlPerUnit =
      position.side === "long" ? mark - entry : entry - mark;
    return pnlPerUnit * closeQty;
  }, [closeQty, entry, mark, position.side]);

  const confirmLabel =
    percent >= 100 ? "Close full position" : "Close partial position";

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
            Side:{" "}
            <span className="text-slate-200">{position.side.toUpperCase()}</span>
          </div>
          <div>Quantity: {position.quantity.toFixed(6)} BTC</div>
          <div>Entry: {entry > 0 ? entry.toFixed(2) : "—"}</div>
          <div>Mark: {mark > 0 ? mark.toFixed(2) : "—"}</div>
          <div>
            Unrealized PnL:{" "}
            <span
              className={cn(
                position.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {position.unrealizedPnl.toFixed(2)} USDT
            </span>
          </div>
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
                disabled={loading}
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
            disabled={loading}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              value={percent}
              disabled={loading}
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
          <div>Est. close qty: {closeQty.toFixed(6)} BTC</div>
          {estRealized != null ? (
            <div>
              Est. realized PnL:{" "}
              <span
                className={cn(
                  estRealized >= 0 ? "text-emerald-400/90" : "text-red-400/90",
                )}
              >
                {estRealized.toFixed(2)} USDT
              </span>
            </div>
          ) : null}
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
            disabled={loading}
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
