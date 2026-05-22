import { buildExecutionReport } from "./executionReportService";
import { buildSessionExecutionNarrative } from "./sessionNarrativeEngine";
import type { ExecutionReportSource } from "./executionReportTypes";
import type { SessionExecutionNarrative } from "./sessionNarrativeTypes";

function parseSource(raw: unknown): ExecutionReportSource {
  const s = String(raw ?? "paper").toLowerCase();
  if (s === "bingx" || s === "all") return s;
  return "paper";
}

export async function getSessionExecutionNarrative(
  userId: number,
  sourceRaw: unknown,
  symbol?: string,
): Promise<{ success: true; narrative: SessionExecutionNarrative }> {
  const source = parseSource(sourceRaw);
  const sym = symbol?.trim() || "BTC-USDT";
  const { report } = await buildExecutionReport(userId, source, sym);
  const narrative = buildSessionExecutionNarrative({
    source,
    symbol: sym,
    trades: report.trades,
  });
  return { success: true, narrative };
}
