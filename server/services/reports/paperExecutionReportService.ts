import { getPaperState } from "../paperTrading/paperStore";
import { applyContextToExecutionScore } from "./executionContextScoring";
import { matchExecutionPlaybook } from "./playbookMatchEngine";
import { applyPlaybookDeltaToExecutionScore, applyPlaybookToExecutionScore } from "./playbookScoring";
import {
  computeOpenPositionPlaybookDelta,
  computePlaybookEntryExitDelta,
} from "./playbookDeltaEngine";
import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type {
  ExecutionDiagnostics,
  ExecutionGrade,
  ExecutionProfile,
  ExecutionReportResponse,
  ExecutionReportSummary,
  TradeReviewRow,
} from "./executionReportTypes";
import type {
  PaperExecutionLogEntry,
  PaperOrder,
  PaperTradeLedgerEntry,
} from "../paperTrading/paperTypes";

const PAPER_ONE_R_USDT = 100;

type ParsedCycle = {
  id: string;
  side: "long" | "short";
  setup: string;
  entryPrice: number | null;
  entryTime: string;
  exitPrice: number | null;
  exitTime: string | null;
  pnlUsdt: number | null;
  orderType: "market" | "limit";
  status: "open" | "closed";
};

const FILL_OPEN_RE =
  /^(LONG|SHORT)\s+([\d.]+)\s+BTC\s+@\s+([\d.]+)\s+\((market|limit)\)/i;
const FILL_CLOSE_RE = /Position closed via opposing fill · PnL ([\d.-]+) USDT/i;
const CLOSE_PNL_RE = /realized ([\d.-]+) USDT/i;
const SUBMIT_RE = /^(LONG|SHORT)\s+(market|limit)\s+/i;

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso.slice(11, 16) || iso;
  }
}

function gradeFromScore(score: number): ExecutionGrade {
  if (score >= 92) return "A+";
  if (score >= 85) return "A";
  if (score >= 78) return "B+";
  if (score >= 70) return "B";
  if (score >= 62) return "C+";
  if (score >= 52) return "C";
  return "D";
}

function gradeFromR(r: number | null, pnl: number | null): ExecutionGrade {
  if (r == null && pnl == null) return "C";
  const effective = r ?? (pnl != null ? pnl / PAPER_ONE_R_USDT : 0);
  if (effective >= 1.5) return "A+";
  if (effective >= 1) return "A";
  if (effective >= 0.5) return "B+";
  if (effective >= 0) return "B";
  if (effective >= -0.5) return "C+";
  if (effective >= -1) return "C";
  return "D";
}

function setupLabel(type: "market" | "limit", side: string): string {
  if (type === "market") return `Paper ${side} market`;
  return `Paper ${side} limit`;
}

function buildTradesFromLogs(logs: PaperExecutionLogEntry[]): ParsedCycle[] {
  const chronological = [...logs].reverse();
  const cycles: ParsedCycle[] = [];
  let open: ParsedCycle | null = null;
  let pendingSetup = "Paper execution";

  for (const log of chronological) {
    if (log.type === "submit") {
      const m = log.message.match(SUBMIT_RE);
      if (m) {
        pendingSetup = `Paper ${m[1].toLowerCase()} ${m[2]}`;
      }
    }

    if (log.type === "fill") {
      const openM = log.message.match(FILL_OPEN_RE);
      if (openM) {
        const side = openM[1].toLowerCase() as "long" | "short";
        const price = Number(openM[3]);
        const orderType = openM[4].toLowerCase() as "market" | "limit";
        if (!open) {
          open = {
            id: log.id,
            side,
            setup: pendingSetup || setupLabel(orderType, side),
            entryPrice: price,
            entryTime: log.timestamp,
            exitPrice: null,
            exitTime: null,
            pnlUsdt: null,
            orderType,
            status: "open",
          };
        } else if (open.side === side) {
          open.entryPrice = price;
          open.entryTime = log.timestamp;
        }
        pendingSetup = setupLabel(orderType, side);
        continue;
      }

      const closeM = log.message.match(FILL_CLOSE_RE);
      if (closeM && open) {
        const pnl = Number(closeM[1]);
        open.pnlUsdt = pnl;
        open.exitTime = log.timestamp;
        open.status = "closed";
        cycles.push(open);
        open = null;
        pendingSetup = "Paper execution";
      }
    }

    if (log.type === "close") {
      const pnlM = log.message.match(CLOSE_PNL_RE);
      if (pnlM && open) {
        open.pnlUsdt = Number(pnlM[1]);
        open.exitTime = log.timestamp;
        open.status = "closed";
        cycles.push(open);
        open = null;
      } else if (pnlM && !open) {
        cycles.push({
          id: log.id,
          side: "long",
          setup: "Paper close",
          entryPrice: null,
          entryTime: log.timestamp,
          exitPrice: null,
          exitTime: log.timestamp,
          pnlUsdt: Number(pnlM[1]),
          orderType: "market",
          status: "closed",
        });
      }
      pendingSetup = "Paper execution";
    }
  }

  if (open) {
    cycles.push(open);
  }

  return cycles;
}

function buildCancelledRows(logs: PaperExecutionLogEntry[]): TradeReviewRow[] {
  const rows: TradeReviewRow[] = [];
  for (const log of logs) {
    if (log.type === "cancel") {
      rows.push({
        id: log.id,
        time: formatTime(log.timestamp),
        direction: "Long",
        setup: "Paper order",
        entry: null,
        exit: null,
        r: null,
        pnlUsdt: null,
        quality: "C",
        mistakes: log.message,
        notes: "",
        tags: "",
        status: "cancelled",
      });
    }
    if (log.type === "reject") {
      rows.push({
        id: log.id,
        time: formatTime(log.timestamp),
        direction: "Long",
        setup: "Paper order",
        entry: null,
        exit: null,
        r: null,
        pnlUsdt: null,
        quality: "D",
        mistakes: log.message,
        notes: "",
        tags: "",
        status: "rejected",
      });
    }
  }
  return rows;
}

function ledgerStopPrice(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Align context risk with ledger SL/TP when capture ran before stops were set. */
function enrichPaperContextFromLedger(
  ctx: ExecutionContextSnapshot | undefined,
  entry: PaperTradeLedgerEntry,
  accountEquityUsdt: number,
): ExecutionContextSnapshot | undefined {
  if (!ctx || !ctx.risk) return ctx;

  const sl = ledgerStopPrice(entry.stopLoss);
  const tp = ledgerStopPrice(entry.takeProfit);
  if (sl == null && tp == null) return ctx;

  const stopLossDetected =
    (sl != null && sl > 0) || Boolean(ctx.risk.stopLossDetected);
  const takeProfitDetected =
    (tp != null && tp > 0) || Boolean(ctx.risk.takeProfitDetected);
  const stopLossPrice = sl ?? ctx.risk.stopLossPrice;
  const takeProfitPrice = tp ?? ctx.risk.takeProfitPrice;

  const risk = { ...ctx.risk, stopLossDetected, takeProfitDetected, stopLossPrice, takeProfitPrice };

  const entryPx = entry.entryPrice;
  const qty = entry.quantity;
  if (entryPx > 0 && qty > 0 && stopLossPrice != null && stopLossPrice > 0) {
    const lossPerUnit =
      entry.side === "long" ? entryPx - stopLossPrice : stopLossPrice - entryPx;
    if (lossPerUnit > 0) {
      risk.estimatedLossUsdt = Math.round(lossPerUnit * qty * 100) / 100;
      if (accountEquityUsdt > 0) {
        risk.estimatedLossAccountPct =
          Math.round((risk.estimatedLossUsdt / accountEquityUsdt) * 10000) / 100;
      }
    }
  }
  if (entryPx > 0 && qty > 0 && takeProfitPrice != null && takeProfitPrice > 0) {
    const gainPerUnit =
      entry.side === "long" ? takeProfitPrice - entryPx : entryPx - takeProfitPrice;
    if (gainPerUnit > 0) {
      risk.estimatedGainUsdt = Math.round(gainPerUnit * qty * 100) / 100;
      if (accountEquityUsdt > 0) {
        risk.estimatedGainAccountPct =
          Math.round((risk.estimatedGainUsdt / accountEquityUsdt) * 10000) / 100;
      }
    }
  }

  const positives = [...(ctx.diagnostics?.positives ?? [])];
  const warnings = (ctx.diagnostics?.warnings ?? []).filter(
    (w) => w !== "No stop loss detected.",
  );
  if (risk.stopLossDetected && !positives.some((p) => p.includes("stop loss"))) {
    positives.push("Trade has real stop loss protection.");
  }

  return {
    ...ctx,
    risk,
    diagnostics: {
      ...ctx.diagnostics,
      positives,
      warnings,
    },
  };
}

function resolveLedgerPlaybookForPhase(
  entry: PaperTradeLedgerEntry,
  phase: "entry" | "exit",
  ctxOverride?: ExecutionContextSnapshot,
  forceRematch = false,
): PlaybookMatchResult | undefined {
  const stored = phase === "entry" ? entry.playbookAtEntry : entry.playbookAtExit;
  const ctx =
    ctxOverride ??
    (phase === "entry" ? entry.contextAtEntry : entry.contextAtExit);
  if (stored && !forceRematch) return stored;
  if (!ctx) return undefined;
  try {
    return matchExecutionPlaybook({
      side: entry.side,
      entryPrice: entry.entryPrice,
      context: ctx,
      source: "paper",
    });
  } catch {
    return undefined;
  }
}

function ledgerEntryToRow(entry: PaperTradeLedgerEntry): TradeReviewRow {
  const isOpen = entry.status === "open";
  const pnl = isOpen ? entry.unrealizedPnlUsdt : entry.realizedPnlUsdt;
  const mistakes = entry.mistakes?.length ? entry.mistakes.join(", ") : "None";
  const tags = entry.tags?.length ? entry.tags.join(", ") : "";
  const state = getPaperState();
  const equity = state.account.equityUsdt;

  let ctxEntry = entry.contextAtEntry;
  const ctxExit = entry.contextAtExit;
  const ledgerSl = ledgerStopPrice(entry.stopLoss);
  const contextMissingSl =
    ledgerSl != null && !(ctxEntry?.risk?.stopLossDetected === true);

  if (ctxEntry && (ledgerSl != null || ledgerStopPrice(entry.takeProfit) != null)) {
    try {
      ctxEntry = enrichPaperContextFromLedger(ctxEntry, entry, equity) ?? ctxEntry;
    } catch (err) {
      console.warn(
        "[paper-report] enrich context failed",
        entry.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const playbookAtEntry = resolveLedgerPlaybookForPhase(
    entry,
    "entry",
    ctxEntry,
    contextMissingSl,
  );
  const playbookAtExit = isOpen
    ? undefined
    : resolveLedgerPlaybookForPhase(entry, "exit", ctxExit ?? undefined);
  const playbook = isOpen ? playbookAtEntry : playbookAtExit ?? playbookAtEntry;

  let playbookDelta;
  try {
    playbookDelta = isOpen
      ? computeOpenPositionPlaybookDelta({
          playbookAtEntry,
          contextAtEntry: ctxEntry,
          source: "paper",
        })
      : computePlaybookEntryExitDelta({
          playbookAtEntry,
          playbookAtExit,
          contextAtEntry: ctxEntry,
          contextAtExit: ctxExit,
          pnlUsdt: entry.realizedPnlUsdt,
          rMultiple: entry.rMultiple,
          status: "closed",
          source: "paper",
        });
  } catch (err) {
    console.warn(
      "[paper-report] playbook delta failed",
      entry.id,
      err instanceof Error ? err.message : err,
    );
    playbookDelta = undefined;
  }

  let quality: TradeReviewRow["quality"] = isOpen ? "—" : gradeFromR(entry.rMultiple ?? null, pnl);
  const ctx = isOpen ? ctxEntry : ctxExit ?? ctxEntry;
  if (ctx) {
    let score = isOpen ? 65 : 70;
    score = applyContextToExecutionScore(score, ctx, entry.side);
    score = applyPlaybookToExecutionScore(score, playbook, ctx);
    if (!isOpen) {
      score = applyPlaybookDeltaToExecutionScore(score, playbookDelta, pnl);
    }
    quality = gradeFromScore(score);
  }
  return {
    id: entry.id,
    time: formatTime(isOpen ? entry.entryTime : entry.exitTime ?? entry.entryTime),
    direction: entry.side === "long" ? "Long" : "Short",
    setup: entry.setup ?? (isOpen ? "Paper open" : "Paper trade"),
    entry: entry.entryPrice,
    exit: entry.exitPrice ?? null,
    r: entry.rMultiple ?? null,
    pnlUsdt: pnl,
    quality,
    mistakes,
    notes: entry.notes?.trim() || "",
    tags,
    status:
      entry.status === "cancelled"
        ? "cancelled"
        : entry.status === "rejected"
          ? "rejected"
          : isOpen
            ? "open"
            : "closed",
    source: "paper",
    contextAtEntry: ctxEntry ?? entry.contextAtEntry,
    contextAtExit: entry.contextAtExit,
    playbookMatch: playbook,
    playbookAtEntry: playbookAtEntry ?? entry.playbookAtEntry,
    playbookAtExit: playbookAtExit ?? entry.playbookAtExit,
    playbookDelta,
  };
}

function aggregateContextScore(
  trades: TradeReviewRow[],
): ExecutionContextSnapshot | undefined {
  const withCtx = trades
    .map((t) => t.contextAtEntry ?? t.contextAtExit)
    .filter((c): c is ExecutionContextSnapshot => c != null);
  return withCtx[0];
}

function ledgerToCycles(ledger: PaperTradeLedgerEntry[]): ParsedCycle[] {
  return ledger
    .filter((e) => e.status === "open" || e.status === "closed")
    .map((e) => ({
      id: e.id,
      side: e.side,
      setup: e.setup ?? "Paper trade",
      entryPrice: e.entryPrice,
      entryTime: e.entryTime,
      exitPrice: e.exitPrice ?? null,
      exitTime: e.exitTime ?? null,
      pnlUsdt: e.status === "closed" ? e.realizedPnlUsdt : null,
      orderType: "market" as const,
      status: e.status === "open" ? "open" : "closed",
    }));
}

function cycleToRow(cycle: ParsedCycle): TradeReviewRow {
  const r =
    cycle.pnlUsdt != null ? cycle.pnlUsdt / PAPER_ONE_R_USDT : null;
  const isOpen = cycle.status === "open";
  return {
    id: cycle.id,
    time: formatTime(cycle.entryTime),
    direction: cycle.side === "long" ? "Long" : "Short",
    setup: cycle.setup,
    entry: cycle.entryPrice,
    exit: cycle.exitPrice,
    r,
    pnlUsdt: cycle.pnlUsdt,
    quality: gradeFromR(r, cycle.pnlUsdt),
    mistakes: "None",
    notes: "",
    tags: "",
    status: isOpen ? "open" : "closed",
  };
}

function countDisciplineEvents(logs: PaperExecutionLogEntry[]): {
  cancels: number;
  rejects: number;
  killSwitches: number;
  submits: number;
  fills: number;
} {
  return {
    cancels: logs.filter((l) => l.type === "cancel").length,
    rejects: logs.filter((l) => l.type === "reject").length,
    killSwitches: logs.filter((l) => l.type === "kill_switch").length,
    submits: logs.filter((l) => l.type === "submit").length,
    fills: logs.filter((l) => l.type === "fill").length,
  };
}

function computeTiming(
  cycles: ParsedCycle[],
  events: ReturnType<typeof countDisciplineEvents>,
): ExecutionProfile["timing"] {
  if (cycles.length === 0 && events.submits === 0) return "No data";
  const marketOpens = cycles.filter((c) => c.orderType === "market").length;
  const total = Math.max(cycles.length, 1);
  const marketRatio = marketOpens / total;
  if (marketRatio >= 0.7 && events.submits > events.fills * 0.5) return "Early";
  if (marketRatio <= 0.35 && events.fills >= 2) return "Optimal";
  if (marketRatio > 0.45 && marketRatio < 0.7) return "Mixed";
  return "Mixed";
}

function computeDiscipline(
  events: ReturnType<typeof countDisciplineEvents>,
  winRate: number | null,
  realizedPnl: number,
): ExecutionProfile["discipline"] {
  if (events.submits === 0 && events.fills === 0) return "No data";
  const friction =
    events.cancels + events.rejects + events.killSwitches * 2;
  const activity = Math.max(events.submits, 1);
  const frictionRatio = friction / activity;
  if (frictionRatio >= 0.5 || events.killSwitches >= 2) return "Weak";
  if (frictionRatio >= 0.25) return "Moderate";
  if ((winRate ?? 0) >= 0.5 && realizedPnl >= 0) return "Strong";
  if (events.killSwitches === 0 && frictionRatio < 0.15) return "Strong";
  return "Moderate";
}

function computeConfirmationQuality(score: number): ExecutionProfile["confirmationQuality"] {
  if (score >= 80) return "High";
  if (score >= 60) return "Moderate";
  return "Low";
}

function computeContextAlignment(
  closed: TradeReviewRow[],
  score: number,
): number | null {
  if (closed.length === 0) return null;
  const aligned = closed.filter(
    (t) => t.pnlUsdt != null && t.pnlUsdt >= 0 && t.quality !== "D" && t.quality !== "C",
  ).length;
  const base = closed.length > 0 ? Math.round((aligned / closed.length) * 100) : null;
  if (base == null) return null;
  return Math.min(100, Math.round(base * 0.6 + score * 0.4));
}

function computeExecutionScore(
  closed: TradeReviewRow[],
  events: ReturnType<typeof countDisciplineEvents>,
  winRate: number | null,
  realizedPnl: number,
): number {
  let score = 50;
  if (closed.length === 0 && events.fills === 0) return 0;

  if (winRate != null) score += winRate * 25;
  if (realizedPnl > 0) score += Math.min(15, realizedPnl / 50);
  if (realizedPnl < 0) score += Math.max(-20, realizedPnl / 30);

  const avgQuality = closed
    .filter((t) => t.r != null)
    .map((t) => t.r as number);
  if (avgQuality.length > 0) {
    const avg = avgQuality.reduce((a, b) => a + b, 0) / avgQuality.length;
    score += Math.min(15, avg * 8);
  }

  score -= events.rejects * 4;
  score -= events.cancels * 2;
  score -= events.killSwitches * 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildDiagnostics(
  empty: boolean,
  closed: TradeReviewRow[],
  events: ReturnType<typeof countDisciplineEvents>,
  score: number,
  realizedPnl: number,
): ExecutionDiagnostics {
  if (empty) {
    return {
      mainIssue: "No paper trades recorded yet",
      bestBehavior:
        "Connect GoodTrading Paper Trading and execute simulated trades to generate an execution report.",
    };
  }

  if (events.killSwitches > 0) {
    return {
      mainIssue: "Kill switch used — review risk and execution discipline",
      bestBehavior: "Reduce size and define clear invalidation before entry",
      warning: `${events.killSwitches} kill switch event(s) in session logs`,
    };
  }

  if (realizedPnl < 0 && closed.length >= 2) {
    return {
      mainIssue: "Negative expectancy in paper execution",
      bestBehavior: "Review entries and reduce impulsive execution",
      warning: `Realized PnL ${realizedPnl.toFixed(2)} USDT`,
    };
  }

  if (events.rejects + events.cancels > events.fills) {
    return {
      mainIssue: "High cancel/reject rate vs fills",
      bestBehavior: "Validate size and margin before submit",
      warning: `${events.cancels} cancel(s), ${events.rejects} reject(s)`,
    };
  }

  if (score >= 75) {
    return {
      mainIssue: "No major execution issue detected",
      bestBehavior: "Good discipline and controlled execution",
    };
  }

  return {
    mainIssue: "Execution quality below target — refine timing and confirmation",
    bestBehavior: "Prefer limit fills or wait for confirmation after sweep events",
  };
}

export function getPaperExecutionReport(): ExecutionReportResponse {
  const state = getPaperState();
  const logs = state.logs;
  const openOrders = state.orders.filter((o: PaperOrder) => o.status === "open").length;
  const openPosition =
    state.position != null &&
    state.position.side !== "flat" &&
    state.position.quantity > 0;

  const ledger = state.tradeLedger ?? [];
  let cycles: ParsedCycle[];
  let tradeRows: TradeReviewRow[];

  if (ledger.length > 0) {
    tradeRows = ledger.map(ledgerEntryToRow);
    cycles = ledgerToCycles(ledger);
  } else {
    cycles = buildTradesFromLogs(logs);
    tradeRows = cycles.map(cycleToRow);

    if (
      openPosition &&
      state.position &&
      state.position.side !== "flat" &&
      !tradeRows.some((t) => t.status === "open")
    ) {
      const pos = state.position;
      tradeRows.unshift({
        id: "open-position",
        time: formatTime(state.account.updatedAt),
        direction: pos.side === "long" ? "Long" : "Short",
        setup: "Paper open position",
        entry: pos.entryPrice,
        exit: pos.markPrice,
        r: null,
        pnlUsdt: pos.unrealizedPnl,
        quality: "—",
        mistakes: "None",
        notes: "",
        tags: "",
        status: "open",
      });
    }
  }

  const cancelledRows = buildCancelledRows(logs);
  const allTrades = [...tradeRows, ...cancelledRows].sort((a, b) =>
    b.time.localeCompare(a.time),
  );

  const closed = tradeRows.filter((t) => t.status === "closed" && t.pnlUsdt != null);
  const closedWithPnl = closed.filter((t) => t.pnlUsdt != null);
  const wins = closedWithPnl.filter((t) => (t.pnlUsdt as number) > 0);
  const winRate =
    closedWithPnl.length > 0 ? wins.length / closedWithPnl.length : null;

  const rValues = closedWithPnl
    .map((t) => t.r)
    .filter((r): r is number => r != null);
  const avgR =
    rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;
  const bestTradeR = rValues.length > 0 ? Math.max(...rValues) : null;
  const worstTradeR = rValues.length > 0 ? Math.min(...rValues) : null;

  const events = countDisciplineEvents(logs);
  const hasActivity =
    ledger.length > 0 ||
    logs.some((l) =>
      [
        "submit",
        "fill",
        "close",
        "cancel",
        "reject",
        "kill_switch",
        "stop_loss",
        "take_profit",
      ].includes(l.type),
    ) ||
    openPosition ||
    openOrders > 0;

  const empty = !hasActivity;
  const realizedPnl = state.account.realizedPnlUsdt;
  const unrealizedPnl = state.account.unrealizedPnlUsdt;

  let executionQualityScore = empty
    ? 0
    : computeExecutionScore(closedWithPnl, events, winRate, realizedPnl);

  const sessionContext = aggregateContextScore(tradeRows);
  if (!empty && sessionContext) {
    executionQualityScore = applyContextToExecutionScore(
      executionQualityScore,
      sessionContext,
    );
    const openPb = tradeRows.find((t) => t.playbookMatch)?.playbookMatch;
    executionQualityScore = applyPlaybookToExecutionScore(
      executionQualityScore,
      openPb,
      sessionContext,
    );
  }

  const grade = empty ? "C" : gradeFromScore(executionQualityScore);

  const summary: ExecutionReportSummary = {
    source: "paper",
    mode: "simulated",
    generatedAt: new Date().toISOString(),
    totalTrades: tradeRows.length + cancelledRows.length,
    closedTrades: closed.length,
    openOrders,
    openPosition,
    realizedPnlUsdt: realizedPnl,
    unrealizedPnlUsdt: unrealizedPnl,
    winRate: winRate != null ? Math.round(winRate * 100) : null,
    avgR: avgR != null ? Math.round(avgR * 100) / 100 : null,
    bestTradeR,
    worstTradeR,
    executionQualityScore,
    grade,
  };

  const profile: ExecutionProfile = empty
    ? {
        timing: "No data",
        discipline: "No data",
        contextAlignmentPct: null,
        confirmationQuality: "No data",
      }
    : {
        timing: computeTiming(cycles, events),
        discipline: computeDiscipline(events, winRate, realizedPnl),
        contextAlignmentPct: computeContextAlignment(closedWithPnl, executionQualityScore),
        confirmationQuality: computeConfirmationQuality(executionQualityScore),
      };

  const diagnostics = buildDiagnostics(
    empty,
    closedWithPnl,
    events,
    executionQualityScore,
    realizedPnl,
  );

  const closedForBest = tradeRows.filter((t) => t.status === "closed");
  const bestTrade =
    closedForBest.length > 0
      ? closedForBest.reduce((best, t) => {
          const score = t.r ?? t.pnlUsdt ?? -Infinity;
          const bestScore = best.r ?? best.pnlUsdt ?? -Infinity;
          return score > bestScore ? t : best;
        })
      : null;
  const worstTrade =
    closedForBest.length > 0
      ? closedForBest.reduce((worst, t) => {
          const score = t.r ?? t.pnlUsdt ?? Infinity;
          const worstScore = worst.r ?? worst.pnlUsdt ?? Infinity;
          return score < worstScore ? t : worst;
        })
      : null;

  return {
    summary,
    profile,
    diagnostics,
    trades: allTrades,
    bestTrade,
    worstTrade,
    empty,
  };
}
