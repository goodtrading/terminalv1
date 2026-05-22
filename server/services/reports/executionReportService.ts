import { runWithPaperUser } from "../paperTrading/paperUserContext";
import { getBingxExecutionReport } from "./bingxExecutionReportService";
import type {
  ExecutionReportApiResponse,
  ExecutionReportPayload,
  ExecutionReportSource,
} from "./executionReportTypes";
import { getPaperExecutionReport } from "./paperExecutionReportService";

function parseSource(raw: unknown): ExecutionReportSource {
  const s = String(raw ?? "paper").toLowerCase();
  if (s === "bingx" || s === "all") return s;
  return "paper";
}

function mergeExecutionReports(
  paper: ExecutionReportPayload,
  bingx: ExecutionReportPayload,
): ExecutionReportPayload {
  const trades = [...paper.trades, ...bingx.trades].sort((a, b) =>
    b.time.localeCompare(a.time),
  );
  const closed = trades.filter((t) => t.status === "closed");
  const wins = closed.filter((t) => (t.pnlUsdt ?? 0) > 0);
  const winRate =
    closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : null;

  const paperScore = paper.summary.executionQualityScore;
  const bingxScore = bingx.summary.executionQualityScore;
  const scores = [paperScore, bingxScore].filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
  const executionQualityScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  const empty = paper.empty && bingx.empty;

  const closedForBest = closed.filter((t) => t.pnlUsdt != null);
  const bestTrade =
    closedForBest.length > 0
      ? closedForBest.reduce((best, t) =>
          (t.pnlUsdt ?? -Infinity) > (best.pnlUsdt ?? -Infinity) ? t : best,
        )
      : paper.bestTrade ?? bingx.bestTrade ?? null;
  const worstTrade =
    closedForBest.length > 0
      ? closedForBest.reduce((worst, t) =>
          (t.pnlUsdt ?? Infinity) < (worst.pnlUsdt ?? Infinity) ? t : worst,
        )
      : paper.worstTrade ?? bingx.worstTrade ?? null;

  return {
    summary: {
      source: "all",
      generatedAt: new Date().toISOString(),
      totalTrades: paper.summary.totalTrades + bingx.summary.totalTrades,
      closedTrades: paper.summary.closedTrades + bingx.summary.closedTrades,
      openOrders: paper.summary.openOrders + bingx.summary.openOrders,
      openPosition: paper.summary.openPosition || bingx.summary.openPosition,
      realizedPnlUsdt:
        paper.summary.realizedPnlUsdt + bingx.summary.realizedPnlUsdt,
      unrealizedPnlUsdt:
        paper.summary.unrealizedPnlUsdt + bingx.summary.unrealizedPnlUsdt,
      winRate: winRate ?? paper.summary.winRate,
      avgR: paper.summary.avgR,
      bestTradeR: paper.summary.bestTradeR,
      worstTradeR: paper.summary.worstTradeR,
      executionQualityScore,
      grade:
        executionQualityScore != null
          ? executionQualityScore >= 85
            ? "A"
            : executionQualityScore >= 70
              ? "B"
              : executionQualityScore >= 55
                ? "C"
                : "D"
          : "—",
      scoreEstimate: Boolean(
        paper.summary.scoreEstimate || bingx.summary.scoreEstimate,
      ),
      historyStatus: bingx.summary.historyStatus,
      historyMessage: bingx.summary.historyMessage,
      tradingLocked: bingx.summary.tradingLocked ?? true,
    },
    profile: paper.empty ? bingx.profile : bingx.empty ? paper.profile : {
      timing: "Mixed",
      discipline:
        paper.profile.discipline === "Strong" || bingx.profile.discipline === "Strong"
          ? "Strong"
          : "Moderate",
      contextAlignmentPct: paper.profile.contextAlignmentPct,
      confirmationQuality: "Moderate",
    },
    diagnostics: {
      mainIssue: empty
        ? "No paper or BingX execution activity."
        : `${paper.diagnostics.mainIssue} · ${bingx.diagnostics.mainIssue}`,
      bestBehavior: paper.diagnostics.bestBehavior,
      warning: bingx.summary.tradingLocked
        ? "Combined view · BingX is read-only"
        : undefined,
      riskWarnings: [
        ...(paper.diagnostics.riskWarnings ?? []),
        ...(bingx.diagnostics.riskWarnings ?? []),
      ].slice(0, 5),
    },
    trades,
    bestTrade,
    worstTrade,
    empty,
  };
}

export async function buildExecutionReport(
  userId: number,
  sourceRaw: unknown,
  symbol?: string,
): Promise<ExecutionReportApiResponse> {
  const source = parseSource(sourceRaw);
  const sym = symbol?.trim() || "BTC-USDT";

  if (source === "paper") {
    const report = runWithPaperUser(userId, () => getPaperExecutionReport());
    return { success: true, source: "paper", report };
  }

  if (source === "bingx") {
    const report = await getBingxExecutionReport(userId, sym);
    return { success: true, source: "bingx", report };
  }

  const paper = runWithPaperUser(userId, () => getPaperExecutionReport());
  const bingx = await getBingxExecutionReport(userId, sym);
  const report = mergeExecutionReports(paper, bingx);
  return { success: true, source: "all", report };
}
