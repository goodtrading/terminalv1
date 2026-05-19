import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TradeReviewRow } from "./reportsTypes";

const COLUMNS = [
  "Time",
  "Direction",
  "Setup",
  "Entry",
  "Exit",
  "R",
  "Quality",
  "Mistake",
] as const;

export function TradeReviewTable({ rows }: { rows: TradeReviewRow[] }) {
  return (
    <div className="border border-terminal-border overflow-x-auto bg-[#080808]">
      <table className="w-full min-w-[720px] text-left border-collapse">
        <thead>
          <tr className="border-b border-terminal-border bg-[#0a0a0a]">
            {COLUMNS.map((col) => (
              <th
                key={col}
                className={cn(
                  "px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em]",
                  col === "Mistake" ? "text-slate-600" : "text-slate-500",
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.time}-${i}`}
              className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
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
                  row.r.startsWith("+")
                    ? "text-emerald-500/90"
                    : "text-red-400/90",
                )}
              >
                {row.r}
              </Cell>
              <Cell mono className="text-slate-200">
                {row.quality}
              </Cell>
              <Cell muted className="text-[10px] text-slate-600">
                {row.mistake}
              </Cell>
            </tr>
          ))}
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
}: {
  children: ReactNode;
  mono?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
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
