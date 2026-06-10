import { apiUrl } from "../../../lib/apiBase";
import { useQuery } from "@tanstack/react-query";
import type {
  ExecutionReportApiResponse,
  ExecutionReportPayload,
  ExecutionReportSource,
} from "./executionReportTypes";

const REFETCH_MS = 12_000;

async function fetchExecutionReport(
  source: ExecutionReportSource,
  symbol?: string,
): Promise<ExecutionReportPayload> {
  const params = new URLSearchParams({ source });
  if (symbol?.trim()) params.set("symbol", symbol.trim());
  const res = await fetch(apiUrl(`/api/reports/execution?${params}`));
  if (!res.ok) {
    throw new Error("Failed to load execution report");
  }
  const body = (await res.json()) as ExecutionReportApiResponse | ExecutionReportPayload;
  if (body && typeof body === "object" && "report" in body && body.report) {
    return body.report;
  }
  return body as ExecutionReportPayload;
}

export function useExecutionReportData(
  source: ExecutionReportSource = "paper",
  enabled = true,
  symbol?: string,
) {
  return useQuery({
    queryKey: ["/api/reports/execution", source, symbol ?? ""],
    queryFn: () => fetchExecutionReport(source, symbol),
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

export function tradeHighlight(
  row: ExecutionReportPayload["bestTrade"],
): string {
  if (!row) return "No data";
  return `${row.setup} · ${row.direction} · entry ${formatPrice(row.entry)} · ${formatR(row.r)} · grade ${row.quality}`;
}

export function mapTradeToTableRow(
  row: ExecutionReportPayload["trades"][0],
  source: ExecutionReportSource,
): import("../reportsTypes").TradeReviewRow {
  const isPaper = source === "paper" && (row.source == null || row.source === "paper");
  const ledgerEditable =
    isPaper && (row.status === "open" || row.status === "closed");
  const ctx =
    row.status === "open"
      ? row.contextAtEntry ?? null
      : row.contextAtExit ?? row.contextAtEntry ?? null;

  const playbook = row.playbookMatch ?? row.playbookAtEntry ?? row.playbookAtExit ?? null;
  const playbookLabel = formatPlaybookBadge(playbook, !!ctx);
  const playbookDelta = row.playbookDelta ?? null;
  const deltaLabel = formatDeltaBadge(playbookDelta);

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
    status: row.status === "unknown" ? "closed" : row.status,
    notesPreview: row.notes?.trim() || "",
    editable: ledgerEditable,
    context: ctx,
    playbook,
    playbookLabel,
    playbookDelta,
    deltaLabel,
    timeline: row.timeline ?? null,
  };
}

export function formatDeltaBadge(
  delta: import("./executionReportTypes").PlaybookEntryExitDelta | null | undefined,
): string {
  if (!delta) return "—";
  if (
    (delta.summary ?? "").includes("unavailable") ||
    delta.status === "unknown"
  ) {
    return delta.summary.toLowerCase().includes("bingx") ? "Open" : "N/A";
  }
  const label =
    delta.status.charAt(0).toUpperCase() + delta.status.slice(1);
  return label;
}

export function formatPlaybookBadge(
  playbook: import("./executionReportTypes").PlaybookMatchResult | null | undefined,
  hasContext: boolean,
): string {
  if (!playbook) {
    return hasContext ? "Unavailable" : "Not captured";
  }
  const p = playbook.primary;
  if (!p) return hasContext ? "Unavailable" : "Not captured";
  if (p.id === "no_match" || p.status === "no_match") return "No Match";
  const short =
    p.name.length > 22 ? `${p.name.slice(0, 20)}…` : p.name;
  return `${short} ${p.confidence}%`;
}
