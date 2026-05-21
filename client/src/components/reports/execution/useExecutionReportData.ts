import { useQuery } from "@tanstack/react-query";
import type { ExecutionReportResponse } from "./executionReportTypes";

const REFETCH_MS = 12_000;

async function fetchExecutionReport(): Promise<ExecutionReportResponse> {
  const res = await fetch("/api/reports/execution");
  if (!res.ok) {
    throw new Error("Failed to load execution report");
  }
  return res.json() as Promise<ExecutionReportResponse>;
}

export function useExecutionReportData(enabled = true) {
  return useQuery({
    queryKey: ["/api/reports/execution"],
    queryFn: fetchExecutionReport,
    enabled,
    staleTime: 8_000,
    refetchInterval: enabled ? REFETCH_MS : false,
    refetchOnWindowFocus: true,
  });
}

export function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatR(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

export function formatPnl(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

export function tradeHighlight(row: ExecutionReportResponse["bestTrade"]): string {
  if (!row) return "No data";
  return `${row.setup} · ${row.direction} · entry ${formatPrice(row.entry)} · ${formatR(row.r)} · grade ${row.quality}`;
}

export function mapTradeToTableRow(
  row: ExecutionReportResponse["trades"][0],
): import("../reportsTypes").TradeReviewRow {
  const ledgerEditable =
    row.status === "open" || row.status === "closed";
  return {
    tradeId: row.id,
    time: row.time,
    direction: row.direction,
    setup: row.setup,
    entry: formatPrice(row.entry),
    exit: formatPrice(row.exit),
    r: formatR(row.r),
    pnl: formatPnl(row.pnlUsdt),
    quality: row.status === "open" ? "—" : String(row.quality),
    mistake: row.mistakes,
    status: row.status,
    notesPreview: row.notes?.trim() || "",
    editable: ledgerEditable,
  };
}
