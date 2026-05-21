import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExecutionTradeReviewRow } from "./executionReportTypes";

function linesToArray(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function TradeEditModal({
  trade,
  open,
  onClose,
}: {
  trade: ExecutionTradeReviewRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [mistakesText, setMistakesText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trade) return;
    setSetup(trade.setup);
    setTagsText(trade.tags ?? "");
    setMistakesText(
      trade.mistakes === "None" || trade.mistakes === "—" ? "" : trade.mistakes,
    );
    setNotes(trade.notes ?? "");
    setError(null);
  }, [trade]);

  const save = async () => {
    if (!trade) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/paper/trades/${encodeURIComponent(trade.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setup: setup.trim(),
          tags: linesToArray(tagsText),
          mistakes: linesToArray(mistakesText),
          notes: notes.trim(),
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !data.success) {
        setError(data.message ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/reports/execution"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/paper/trades"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm border-terminal-border bg-[#0a0a0a] text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-xs font-bold uppercase tracking-wider">
            Edit trade journal
          </DialogTitle>
          <p className="text-[10px] text-slate-500 font-mono">
            {trade?.direction} · {trade?.time} · {trade?.status}
          </p>
        </DialogHeader>
        <div className="space-y-2 text-[11px]">
          <label className="block space-y-1">
            <span className="text-[8px] uppercase text-slate-500">Setup</span>
            <input
              className="w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 font-mono text-white"
              value={setup}
              maxLength={200}
              onChange={(e) => setSetup(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[8px] uppercase text-slate-500">Tags (comma or line)</span>
            <input
              className="w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 font-mono text-white"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[8px] uppercase text-slate-500">Mistakes (comma or line)</span>
            <input
              className="w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 font-mono text-white"
              value={mistakesText}
              onChange={(e) => setMistakesText(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[8px] uppercase text-slate-500">Notes</span>
            <textarea
              className="w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 font-mono text-white min-h-[72px]"
              value={notes}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error ? <p className="text-[10px] text-red-400">{error}</p> : null}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-1 rounded border border-cyan-500/40 py-1.5 text-[9px] font-bold uppercase text-cyan-200 hover:bg-cyan-950/40 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-terminal-border px-3 py-1.5 text-[9px] uppercase text-slate-400"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
