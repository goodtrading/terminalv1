import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PaperPositionSnapshot } from "./executionTypes";
import { paperApiFetch } from "./paperApiClient";
import {
  paperRiskReferencePrice,
  parseRiskInput,
  validatePaperRiskLevels,
} from "./paperRiskValidation";

const inputClass =
  "w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-[10px] font-mono text-white focus:border-cyan-500/40 focus:outline-none disabled:opacity-50";

export interface PaperRiskManagementSectionProps {
  position: PaperPositionSnapshot;
  disabled?: boolean;
  /** Omit section title when wrapped in a parent summary (e.g. details). */
  compact?: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onUpdated: () => void | Promise<void>;
}

export function PaperRiskManagementSection({
  position,
  disabled = false,
  compact = false,
  onSuccess,
  onError,
  onUpdated,
}: PaperRiskManagementSectionProps) {
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inlineMsg, setInlineMsg] = useState<string | null>(null);

  useEffect(() => {
    setSlInput(
      position.stopLoss != null && position.stopLoss > 0
        ? String(position.stopLoss)
        : "",
    );
    setTpInput(
      position.takeProfit != null && position.takeProfit > 0
        ? String(position.takeProfit)
        : "",
    );
    setInlineMsg(null);
  }, [
    position.stopLoss,
    position.takeProfit,
    position.quantity,
    position.side,
  ]);

  const patchRisk = useCallback(
    async (body: { stopLoss?: number | null; takeProfit?: number | null }) => {
      setLoading(true);
      setInlineMsg(null);
      try {
        const res = await paperApiFetch("/api/paper/position/risk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          const msg = data.message ?? "Risk update failed";
          setInlineMsg(msg);
          onError(msg);
          return;
        }
        setInlineMsg("Risk updated");
        onSuccess("Risk updated");
        await onUpdated();
      } catch {
        const msg = "Risk update failed";
        setInlineMsg(msg);
        onError(msg);
      } finally {
        setLoading(false);
      }
    },
    [onError, onSuccess, onUpdated],
  );

  const handleSave = () => {
    if (position.side === "flat") return;
    const ref = paperRiskReferencePrice(position.markPrice, position.entryPrice);
    const sl = parseRiskInput(slInput);
    const tp = parseRiskInput(tpInput);
    const body: { stopLoss?: number | null; takeProfit?: number | null } = {};
    if (sl !== undefined) body.stopLoss = sl;
    if (tp !== undefined) body.takeProfit = tp;

    if (body.stopLoss === undefined && body.takeProfit === undefined) {
      setInlineMsg("Enter SL and/or TP, or use Clear buttons.");
      return;
    }

    const err = validatePaperRiskLevels(
      position.side,
      ref,
      body.stopLoss !== undefined ? body.stopLoss : position.stopLoss ?? null,
      body.takeProfit !== undefined ? body.takeProfit : position.takeProfit ?? null,
    );
    if (err) {
      setInlineMsg(err);
      onError(err);
      return;
    }
    void patchRisk(body);
  };

  const hasSl = position.stopLoss != null && position.stopLoss > 0;
  const hasTp = position.takeProfit != null && position.takeProfit > 0;

  return (
    <div
      className={cn(
        "space-y-1.5",
        compact ? "pt-1" : "mt-2 pt-2 border-t border-terminal-border/60",
      )}
    >
      {!compact ? (
        <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500">
          Risk management
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <div className="text-[8px] text-slate-600 mb-0.5">Stop loss</div>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled || loading}
            value={slInput}
            onChange={(e) => setSlInput(e.target.value)}
            placeholder={hasSl ? undefined : "No SL set"}
            className={inputClass}
          />
        </div>
        <div>
          <div className="text-[8px] text-slate-600 mb-0.5">Take profit</div>
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled || loading}
            value={tpInput}
            onChange={(e) => setTpInput(e.target.value)}
            placeholder={hasTp ? undefined : "No TP set"}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void handleSave()}
          className="col-span-3 py-1 text-[8px] font-bold uppercase border border-cyan-500/35 rounded text-cyan-200/90 hover:bg-cyan-950/25 disabled:opacity-50"
        >
          {loading ? "..." : "Save SL/TP"}
        </button>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void patchRisk({ stopLoss: null })}
          className="py-1 text-[8px] font-bold uppercase border border-terminal-border rounded text-slate-400 hover:border-white/20 disabled:opacity-50"
        >
          Clear SL
        </button>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void patchRisk({ takeProfit: null })}
          className="py-1 text-[8px] font-bold uppercase border border-terminal-border rounded text-slate-400 hover:border-white/20 disabled:opacity-50"
        >
          Clear TP
        </button>
      </div>
      {inlineMsg ? (
        <p
          className={cn(
            "text-[8px] text-center",
            inlineMsg === "Risk updated" ? "text-cyan-400/80" : "text-amber-400/90",
          )}
        >
          {inlineMsg}
        </p>
      ) : null}
    </div>
  );
}
