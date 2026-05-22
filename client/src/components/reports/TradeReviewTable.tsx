import { Fragment, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ExecutionContextPanel } from "./execution/ExecutionContextPanel";
import { ExecutionPlaybookPanel } from "./execution/ExecutionPlaybookPanel";
import { ExecutionTimelinePanel } from "./execution/ExecutionTimelinePanel";
import type { TradeReviewRow } from "./reportsTypes";

const COLUMNS = [
  "Time",
  "Direction",
  "Setup",
  "Entry",
  "Exit",
  "R",
  "PnL",
  "Quality",
  "Playbook",
  "Delta",
  "Mistakes",
  "Status",
  "Notes",
  "",
] as const;

export function TradeReviewTable({
  rows,
  emptyMessage,
  onEdit,
}: {
  rows: TradeReviewRow[];
  emptyMessage?: string;
  onEdit?: (tradeId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="border border-terminal-border overflow-x-auto bg-[#080808]">
      <table className="w-full min-w-[1100px] text-left border-collapse">
        <thead>
          <tr className="border-b border-terminal-border bg-[#0a0a0a]">
            {COLUMNS.map((col) => (
              <th
                key={col || "edit"}
                className={cn(
                  "px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em]",
                  col === "Mistakes" || col === "Notes" ? "text-slate-600" : "text-slate-500",
                )}
              >
                {col || "Edit"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyMessage ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-3 py-8 text-center text-[11px] text-slate-500 font-mono"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : null}
          {rows.map((row) => {
            const expanded = expandedId === row.tradeId;
            const canExpand = row.context != null || row.playbook != null;
            return (
              <Fragment key={row.tradeId}>
                <tr
                  className={cn(
                    "border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors",
                    canExpand && "cursor-pointer",
                  )}
                  onClick={() => {
                    if (!canExpand) return;
                    setExpandedId(expanded ? null : row.tradeId);
                  }}
                >
                  <Cell mono>{row.time}</Cell>
                  <Cell
                    className={cn(
                      "font-semibold",
                      row.direction === "Long"
                        ? "text-emerald-500/90"
                        : "text-red-400/90",
                    )}
                  >
                    {row.direction}
                  </Cell>
                  <Cell>{row.setup}</Cell>
                  <Cell mono>{row.entry}</Cell>
                  <Cell mono>{row.exit}</Cell>
                  <Cell
                    mono
                    className={cn(
                      "font-bold",
                      row.r === "—"
                        ? "text-slate-500"
                        : row.r.startsWith("+")
                          ? "text-emerald-500/90"
                          : row.r.startsWith("-")
                            ? "text-red-400/90"
                            : "text-slate-300",
                    )}
                  >
                    {row.r}
                  </Cell>
                  <Cell
                    mono
                    className={cn(
                      row.pnl.startsWith("+")
                        ? "text-emerald-500/90"
                        : row.pnl.startsWith("-")
                          ? "text-red-400/90"
                          : "text-slate-400",
                    )}
                  >
                    {row.pnl}
                  </Cell>
                  <Cell mono className="text-slate-200">
                    {row.quality}
                  </Cell>
                  <Cell
                    mono
                    className={cn(
                      "text-[10px] max-w-[130px] truncate",
                      row.playbookLabel === "No Match"
                        ? "text-slate-600"
                        : row.playbookLabel === "Not captured" ||
                            row.playbookLabel === "Unavailable"
                          ? "text-slate-700"
                          : "text-cyan-500/80",
                    )}
                  >
                    {row.playbookLabel ?? "—"}
                  </Cell>
                  <Cell
                    mono
                    className={cn(
                      "text-[10px] uppercase",
                      row.deltaLabel === "Held" || row.deltaLabel === "Improved"
                        ? "text-emerald-500/70"
                        : row.deltaLabel === "Invalidated" || row.deltaLabel === "Weakened"
                          ? "text-red-400/70"
                          : row.deltaLabel === "Changed"
                            ? "text-cyan-500/70"
                            : "text-slate-600",
                    )}
                  >
                    {row.deltaLabel ?? "—"}
                  </Cell>
                  <Cell muted className="text-[10px] text-slate-600 max-w-[140px] truncate">
                    {row.mistake}
                  </Cell>
                  <Cell mono className="text-[10px] uppercase text-slate-500">
                    {row.status}
                  </Cell>
                  <Cell muted className="text-[10px] text-slate-600 max-w-[120px] truncate">
                    {row.notesPreview || "—"}
                  </Cell>
                  <Cell onClick={(e) => e.stopPropagation()}>
                    {row.editable && onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(row.tradeId)}
                        className="text-[9px] font-bold uppercase tracking-wider text-cyan-500/80 hover:text-cyan-300"
                      >
                        Edit
                      </button>
                    ) : canExpand ? (
                      <span className="text-[9px] text-slate-500 uppercase">
                        {expanded ? "▲" : "▼"}
                      </span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </Cell>
                </tr>
                {expanded ? (
                  <tr className="border-b border-white/[0.03] bg-black/50">
                    <td colSpan={COLUMNS.length} className="px-3 py-2 space-y-2">
                      <ExecutionPlaybookPanel
                        playbook={row.playbook}
                        delta={row.playbookDelta}
                      />
                      <ExecutionTimelinePanel timeline={row.timeline} />
                      <ExecutionContextPanel context={row.context} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
  mono,
  muted,
  className,
  onClick,
}: {
  children: ReactNode;
  mono?: boolean;
  muted?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td
      onClick={onClick}
      className={cn(
        "px-3 py-3 text-[11px]",
        mono && "font-mono",
        muted ? "text-slate-600" : "text-slate-300",
        className,
      )}
    >
      {children}
    </td>
  );
}
