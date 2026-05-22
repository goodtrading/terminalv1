import {
  getCredentialsForUser,
  getFirstConnectedConnectionForUser,
} from "../exchanges/bingx/bingxCredentialStore";
import {
  getBingXReadOnlySnapshot,
  type BingXNormalizedPosition,
} from "../exchanges/bingx/bingxReadOnlyService";
import { fetchBingxExecutionHistory } from "./bingxExecutionHistory";
import { captureExecutionContext } from "./executionContextCaptureService";
import { applyContextToExecutionScore } from "./executionContextScoring";
import { matchExecutionPlaybook } from "./playbookMatchEngine";
import { applyPlaybookDeltaToExecutionScore, applyPlaybookToExecutionScore } from "./playbookScoring";
import { computeOpenPositionPlaybookDelta } from "./playbookDeltaEngine";
import { emitPlaybookAuditsIfNeeded } from "./playbookAudits";
import type { ExecutionContextSnapshot } from "./executionContextTypes";
import {
  normalizeBingxFillsToRows,
  positionToTradeRow,
  resolveRiskPrices,
  riskStatusFromProtection,
} from "./bingxExecutionReportNormalizer";
import type {
  BingxHistoryStatus,
  ExecutionDiagnostics,
  ExecutionGrade,
  ExecutionProfile,
  ExecutionReportPayload,
  ExecutionReportSummary,
  TradeReviewRow,
} from "./executionReportTypes";

const DEFAULT_SYMBOL = "BTC-USDT";

function gradeFromScore(score: number): ExecutionGrade {
  if (score >= 92) return "A+";
  if (score >= 85) return "A";
  if (score >= 78) return "B+";
  if (score >= 70) return "B";
  if (score >= 62) return "C+";
  if (score >= 52) return "C";
  return "D";
}

function liqDistancePct(
  pos: BingXNormalizedPosition,
  mark?: number,
): number | undefined {
  const entry = pos.entryPrice;
  const liq = pos.liquidationPrice;
  const m = mark ?? pos.markPrice;
  if (
    entry == null ||
    liq == null ||
    m == null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(liq) ||
    !Number.isFinite(m) ||
    entry <= 0
  ) {
    return undefined;
  }
  const dist = Math.abs(m - liq) / entry * 100;
  return Number.isFinite(dist) ? dist : undefined;
}

function computeReadOnlyScore(
  pos: BingXNormalizedPosition | null,
  hasSl: boolean,
  hasTp: boolean,
  liqDist?: number,
): { score: number; grade: ExecutionGrade; warnings: string[] } {
  let score = 72;
  const warnings: string[] = [];

  if (!pos || pos.side === "flat") {
    return { score: 0, grade: "C", warnings: [] };
  }

  if (!hasSl) {
    score -= 22;
    warnings.push("No stop-loss on open position");
  } else {
    score += 6;
  }

  if (!hasTp) {
    score -= 8;
  } else {
    score += 8;
  }

  if (liqDist != null && liqDist < 7) {
    score -= 28;
    warnings.push("Liquidation within ~7% of entry");
  } else if (liqDist != null && liqDist < 12) {
    score -= 12;
    warnings.push("Tight liquidation buffer");
  }

  const pnl = pos.unrealizedPnlUsdt;
  if (pnl != null && pnl < -50) {
    score -= 10;
    warnings.push("Large unrealized drawdown");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, grade: gradeFromScore(score), warnings };
}

function emptyBingxReport(message: string): ExecutionReportPayload {
  const summary: ExecutionReportSummary = {
    source: "bingx",
    mode: "read-only",
    generatedAt: new Date().toISOString(),
    totalTrades: 0,
    closedTrades: 0,
    openOrders: 0,
    openPosition: false,
    realizedPnlUsdt: 0,
    unrealizedPnlUsdt: 0,
    winRate: null,
    avgR: null,
    bestTradeR: null,
    worstTradeR: null,
    executionQualityScore: null,
    grade: "—",
    scoreEstimate: true,
    scoreReason: "Read-only estimate — no live position",
    historyStatus: "unavailable",
    historyMessage: message,
    tradingLocked: true,
  };

  return {
    summary,
    profile: {
      timing: "No data",
      discipline: "No data",
      contextAlignmentPct: null,
      confirmationQuality: "No data",
    },
    diagnostics: {
      mainIssue: message,
      bestBehavior: "Connect BingX read-only to review real execution.",
      warning: "BINGX REAL · READ ONLY · TRADING LOCKED",
    },
    trades: [],
    bestTrade: null,
    worstTrade: null,
    empty: true,
  };
}

export async function getBingxExecutionReport(
  userId: number,
  symbol = DEFAULT_SYMBOL,
): Promise<ExecutionReportPayload> {
  const conn = getFirstConnectedConnectionForUser(userId);
  if (!conn) {
    return emptyBingxReport("No BingX read-only connection.");
  }

  const sym = symbol.trim() || DEFAULT_SYMBOL;
  const snapshot = await getBingXReadOnlySnapshot(conn.id, userId, sym);
  const equity = snapshot.account?.equityUsdt ?? snapshot.account?.balanceUsdt;

  const pos =
    snapshot.positions.find(
      (p) =>
        p.symbol.replace(/_/g, "-").toUpperCase() === sym.replace(/_/g, "-").toUpperCase() &&
        p.side !== "flat" &&
        p.quantity > 0,
    ) ??
    snapshot.positions.find((p) => p.side !== "flat" && p.quantity > 0) ??
    null;

  const { stopLoss, takeProfit } = pos
    ? resolveRiskPrices(pos, snapshot.riskOrders, sym)
    : { stopLoss: undefined, takeProfit: undefined };
  const hasSl = stopLoss != null && stopLoss > 0;
  const hasTp = takeProfit != null && takeProfit > 0;
  const liqDist = pos ? liqDistancePct(pos) : undefined;
  const riskStatus = riskStatusFromProtection(hasSl, hasTp, liqDist);

  let historyStatus: BingxHistoryStatus = snapshot.connected
    ? "empty"
    : "unavailable";
  let historyMessage: string | undefined;
  const historyRows: TradeReviewRow[] = [];

  const credentials = getCredentialsForUser(conn.id, userId);
  if (credentials) {
    const history = await fetchBingxExecutionHistory(credentials, sym);
    historyStatus = history.status;
    historyMessage = history.message;
    if (history.status === "loaded") {
      historyRows.push(...normalizeBingxFillsToRows(history.fills, history.orders));
    }
  } else {
    historyStatus = "unavailable";
    historyMessage = "Credentials unavailable for history fetch.";
  }

  let contextSnapshot: ExecutionContextSnapshot | undefined;
  if (pos && pos.side !== "flat") {
    try {
      contextSnapshot = await captureExecutionContext({
        userId,
        source: "bingx",
        symbol: sym,
        side: pos.side === "short" ? "short" : "long",
        entryPrice: pos.entryPrice,
        markPrice: pos.markPrice,
        stopLossPrice: stopLoss,
        takeProfitPrice: takeProfit,
        quantity: pos.quantity,
        accountEquityUsdt: equity,
        liquidationPrice: pos.liquidationPrice,
        connectionId: conn.id,
      });
    } catch {
      contextSnapshot = undefined;
    }
  }

  const openRow =
    pos && pos.side !== "flat" ? positionToTradeRow(pos, sym, snapshot.riskOrders, equity) : null;

  let playbookMatch =
    contextSnapshot && pos && pos.side !== "flat"
      ? matchExecutionPlaybook({
          side: pos.side === "short" ? "short" : "long",
          entryPrice: pos.entryPrice,
          context: contextSnapshot,
          source: "bingx",
        })
      : undefined;

  if (openRow) {
    if (contextSnapshot) {
      openRow.contextAtEntry = contextSnapshot;
      openRow.notes = contextSnapshot.diagnostics.summary;
    }
    if (playbookMatch) {
      openRow.playbookMatch = playbookMatch;
      openRow.playbookAtEntry = playbookMatch;
      openRow.playbookDelta = computeOpenPositionPlaybookDelta({
        playbookAtEntry: playbookMatch,
        contextAtEntry: contextSnapshot,
        source: "bingx",
      });
      void emitPlaybookAuditsIfNeeded(
        userId,
        openRow.id,
        "bingx",
        playbookMatch,
        contextSnapshot,
      );
    }
  }

  const trades: TradeReviewRow[] = [
    ...(openRow ? [openRow] : []),
    ...historyRows.filter((r) => r.status !== "open" || !openRow),
  ];

  const openPosition = pos != null && pos.side !== "flat" && pos.quantity > 0;
  const openOrders = snapshot.openOrders.length;
  const unrealized = pos?.unrealizedPnlUsdt ?? snapshot.account?.unrealizedPnlUsdt ?? 0;
  const closedRows = historyRows.filter((t) => t.status === "closed");
  const realizedFromHistory = closedRows.reduce(
    (sum, t) => sum + (t.pnlUsdt ?? 0),
    0,
  );

  const { score: baseScore, warnings } = computeReadOnlyScore(
    pos,
    hasSl,
    hasTp,
    liqDist,
  );
  const tradeSide = pos?.side === "short" ? "short" : "long";
  let score =
    contextSnapshot != null
      ? applyContextToExecutionScore(baseScore, contextSnapshot, tradeSide)
      : baseScore;
  if (playbookMatch) {
    score = applyPlaybookToExecutionScore(score, playbookMatch, contextSnapshot);
  }
  const grade = gradeFromScore(score);
  const hasActivity = openPosition || openOrders > 0 || trades.length > 0;
  const empty = !hasActivity;

  const snapshotRiskWarnings = [...snapshot.warnings];
  if (riskStatus === "danger") {
    snapshotRiskWarnings.push("Position risk: danger (liquidation proximity)");
  }
  if (riskStatus === "unprotected") {
    snapshotRiskWarnings.push("Position risk: unprotected (no SL)");
  }

  const summary: ExecutionReportSummary = {
    source: "bingx",
    mode: "read-only",
    generatedAt: new Date().toISOString(),
    totalTrades: trades.length,
    closedTrades: closedRows.length,
    openOrders,
    openPosition,
    realizedPnlUsdt: realizedFromHistory,
    unrealizedPnlUsdt: unrealized,
    winRate: null,
    avgR: null,
    bestTradeR: null,
    worstTradeR: null,
    executionQualityScore: empty ? null : score,
    grade: empty ? "—" : grade,
    scoreEstimate: true,
    scoreReason: "Read-only estimate from live snapshot and optional history",
    historyStatus,
    historyMessage,
    tradingLocked: true,
  };

  const profile: ExecutionProfile = empty
    ? {
        timing: "No data",
        discipline: "No data",
        contextAlignmentPct: null,
        confirmationQuality: "No data",
      }
    : {
        timing: "Mixed",
        discipline: hasSl ? "Moderate" : "Weak",
        contextAlignmentPct:
          contextSnapshot?.diagnostics.contextAlignment === "aligned"
            ? 82
            : contextSnapshot?.diagnostics.contextAlignment === "neutral"
              ? 58
              : contextSnapshot?.diagnostics.contextAlignment === "conflicted"
                ? 35
                : hasSl && hasTp
                  ? 75
                  : hasSl
                    ? 55
                    : 30,
        confirmationQuality:
          contextSnapshot?.diagnostics.contextAlignment === "aligned"
            ? "High"
            : riskStatus === "protected"
              ? "Moderate"
              : "Low",
      };

  const diagnostics: ExecutionDiagnostics = {
    mainIssue: empty
      ? "No open BingX position or history for this symbol."
      : (contextSnapshot?.diagnostics.warnings[0] ??
        (!hasSl
          ? "Real position without detected stop-loss."
          : riskStatus === "danger"
            ? "Liquidation buffer is tight on live position."
            : "Review read-only fills and open risk orders.")),
    bestBehavior:
      contextSnapshot?.diagnostics.positives[0] ??
      (hasSl
        ? "Stop-loss detected on exchange."
        : "Connect and sync BingX read-only account."),
    warning: "BINGX REAL · READ ONLY · TRADING LOCKED",
    riskWarnings: [
      ...(contextSnapshot?.diagnostics.warnings ?? []),
      ...warnings,
      ...snapshotRiskWarnings,
    ].slice(0, 5),
  };

  const closedForBest = trades.filter((t) => t.status === "closed" && t.pnlUsdt != null);
  const bestTrade =
    closedForBest.length > 0
      ? closedForBest.reduce((best, t) =>
          (t.pnlUsdt ?? -Infinity) > (best.pnlUsdt ?? -Infinity) ? t : best,
        )
      : openRow;
  const worstTrade =
    closedForBest.length > 0
      ? closedForBest.reduce((worst, t) =>
          (t.pnlUsdt ?? Infinity) < (worst.pnlUsdt ?? Infinity) ? t : worst,
        )
      : null;

  return {
    summary,
    profile,
    diagnostics,
    trades,
    bestTrade,
    worstTrade,
    empty,
  };
}
