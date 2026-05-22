import { captureExecutionContext } from "../reports/executionContextCaptureService";
import {
  emitExecutionContextCaptureFailed,
  emitExecutionContextCaptured,
  emitExecutionContextWarningsIfNeeded,
} from "../reports/executionContextAudits";
import {
  createNoPlaybookMatch,
  matchExecutionPlaybook,
} from "../reports/playbookMatchEngine";
import { emitPlaybookAuditsIfNeeded } from "../reports/playbookAudits";
import type { ExecutionContextSnapshot } from "../reports/executionContextTypes";
import type { PlaybookMatchResult } from "../reports/playbookMatchTypes";
import { getCurrentPaperUserId, runWithPaperUserAsync } from "./paperUserContext";
import { appendLog, getPaperState, savePaperState } from "./paperStore";
import { upsertPaperTradeLedgerEntry } from "./paperLedger";
import type {
  PaperOrderIntent,
  PaperTradeLedgerEntry,
  PaperTradingState,
} from "./paperTypes";

function coerceStopPrice(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Resolve SL/TP from ledger (authoritative), intent, then open position. */
export function resolvePaperStopsForCapture(
  state: PaperTradingState,
  tradeId: string,
  intent: PaperOrderIntent,
  phase: "entry" | "exit",
): { stopLossPrice?: number; takeProfitPrice?: number } {
  const trade = state.tradeLedger.find((t) => t.id === tradeId);
  const pos =
    state.position?.symbol === intent.symbol ||
    state.position?.openTradeId === tradeId
      ? state.position
      : state.position;

  let stopLossPrice: number | undefined;
  let takeProfitPrice: number | undefined;

  if (trade) {
    stopLossPrice = coerceStopPrice(trade.stopLoss);
    takeProfitPrice = coerceStopPrice(trade.takeProfit);
  }

  if (stopLossPrice == null) {
    stopLossPrice = coerceStopPrice(intent.stopLoss);
  }
  if (takeProfitPrice == null) {
    takeProfitPrice = coerceStopPrice(intent.takeProfit);
  }

  if (pos && pos.side !== "flat") {
    if (stopLossPrice == null) stopLossPrice = coerceStopPrice(pos.stopLoss);
    if (takeProfitPrice == null) takeProfitPrice = coerceStopPrice(pos.takeProfit);
  }

  if (phase === "exit" && trade) {
    stopLossPrice = stopLossPrice ?? coerceStopPrice(trade.stopLoss);
    takeProfitPrice = takeProfitPrice ?? coerceStopPrice(trade.takeProfit);
  }

  return { stopLossPrice, takeProfitPrice };
}

function intentFromLedgerTrade(trade: PaperTradeLedgerEntry): PaperOrderIntent {
  return {
    symbol: trade.symbol,
    chartSymbol: trade.chartSymbol,
    venue: trade.venue ?? "bingx",
    marketType: trade.marketType ?? "perpetual",
    side: trade.side,
    type: "market",
    size: String(trade.quantity),
    sizeUnit: "BTC",
    leverage: String(trade.leverage),
    marginMode: trade.marginMode,
    reduceOnly: false,
    postOnly: false,
    stopLoss:
      trade.stopLoss != null && trade.stopLoss > 0 ? String(trade.stopLoss) : undefined,
    takeProfit:
      trade.takeProfit != null && trade.takeProfit > 0
        ? String(trade.takeProfit)
        : undefined,
  };
}

function safeMatchPlaybook(
  side: "long" | "short",
  entryPrice: number,
  context: ExecutionContextSnapshot,
): PlaybookMatchResult {
  try {
    return matchExecutionPlaybook({
      side,
      entryPrice,
      context,
      source: "paper",
    });
  } catch (err) {
    console.warn(
      "[paper-context] playbook match failed",
      err instanceof Error ? err.message : err,
    );
    return createNoPlaybookMatch(["Playbook unavailable — error during match"]);
  }
}

async function captureAndAttach(
  userId: number,
  tradeId: string,
  phase: "entry" | "exit",
  intent: PaperOrderIntent,
  state: PaperTradingState,
  fillPrice: number,
  markPrice: number,
  quantity: number,
): Promise<void> {
  if (!userId || !tradeId) return;

  const { stopLossPrice, takeProfitPrice } = resolvePaperStopsForCapture(
    state,
    tradeId,
    intent,
    phase,
  );

  let ctx: ExecutionContextSnapshot;
  try {
    ctx = await captureExecutionContext({
      userId,
      source: "paper",
      symbol: intent.symbol,
      side: intent.side,
      entryPrice: fillPrice,
      markPrice,
      stopLossPrice,
      takeProfitPrice,
      quantity,
      accountEquityUsdt: state.account.equityUsdt,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "capture_failed";
    console.warn("[paper-context] context_capture_failed", tradeId, phase, reason);
    appendLog(
      state,
      "fill",
      `context_capture_failed ${tradeId} ${phase}: ${reason}`,
    );
    savePaperState(state);
    await emitExecutionContextCaptureFailed(userId, "paper", tradeId, reason);
    return;
  }

  const playbook = safeMatchPlaybook(intent.side, fillPrice, ctx);

  try {
    attachContextToTrade(tradeId, phase, ctx, playbook);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "attach_failed";
    console.warn("[paper-context] attach_failed", tradeId, phase, reason);
    await emitExecutionContextCaptureFailed(userId, "paper", tradeId, reason);
    return;
  }

  await emitExecutionContextCaptured(userId, "paper", tradeId, phase);
  await emitExecutionContextWarningsIfNeeded(userId, tradeId, ctx);
  await emitPlaybookAuditsIfNeeded(userId, tradeId, "paper", playbook, ctx);
}

export function schedulePaperContextCapture(
  tradeId: string,
  phase: "entry" | "exit",
  intent: PaperOrderIntent,
  state: PaperTradingState,
  fillPrice: number,
  markPrice: number,
  quantity: number,
): void {
  const userId = getCurrentPaperUserId();
  if (!userId || !tradeId) return;

  console.log("[paper] context capture scheduled", { tradeId, phase, userId });

  void runWithPaperUserAsync(userId, async () => {
    try {
      await captureAndAttach(
        userId,
        tradeId,
        phase,
        intent,
        state,
        fillPrice,
        markPrice,
        quantity,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "capture_failed";
      console.warn("[paper-context] async capture failed", tradeId, reason);
      await emitExecutionContextCaptureFailed(userId, "paper", tradeId, reason);
    }
  });
}

/** Re-capture entry context after SL/TP placed or updated on chart. */
export function schedulePaperEntryContextRefresh(tradeId: string): void {
  const userId = getCurrentPaperUserId();
  if (!userId || !tradeId) return;

  void runWithPaperUserAsync(userId, async () => {
    try {
      const state = getPaperState();
      const trade = state.tradeLedger.find(
        (t) => t.id === tradeId && t.status === "open",
      );
      if (!trade) return;

      const mark = state.position?.markPrice ?? trade.entryPrice;
      const intent = intentFromLedgerTrade(trade);

      await captureAndAttach(
        userId,
        tradeId,
        "entry",
        intent,
        state,
        trade.entryPrice,
        mark > 0 ? mark : trade.entryPrice,
        trade.quantity,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : "refresh_failed";
      await emitExecutionContextCaptureFailed(userId, "paper", tradeId, reason);
    }
  });
}

function attachContextToTrade(
  tradeId: string,
  phase: "entry" | "exit",
  context: ExecutionContextSnapshot,
  playbook: PlaybookMatchResult,
): void {
  const state = getPaperState();
  const trade = state.tradeLedger.find((t) => t.id === tradeId);
  if (!trade) return;
  if (phase === "entry") {
    trade.contextAtEntry = context;
    trade.playbookAtEntry = playbook;
  } else {
    trade.contextAtExit = context;
    trade.playbookAtExit = playbook;
  }
  upsertPaperTradeLedgerEntry(state, trade);
  savePaperState(state);
}
