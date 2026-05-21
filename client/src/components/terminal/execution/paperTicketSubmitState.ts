import {
  DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  EXECUTION_MAPPING_MISSING_MESSAGE,
  resolveExecutionSymbolForChart,
} from "./executionContext";
import { paperMaxLeverage } from "./paperRiskGuardConfig";
import type { PaperTradingSettings } from "./executionTypes";

export type PaperTicketSubmitKind = "market" | "limit";

export type PaperTicketSubmitStateInput = {
  busy?: boolean;
  notionalUsdt: number;
  /** Sync-derived BTC qty (notional / entry) */
  qtyBtc: number;
  leverage: number;
  estimatedEntryPrice: number | null;
  limitPrice?: number | null;
  settings?: PaperTradingSettings | null;
  kind: PaperTicketSubmitKind;
};

export type PaperTicketSubmitState = {
  enabled: boolean;
  reason: string | null;
};

function finitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** Hard gates only — no markPrice, no SL/TP, no live lock, no risk-guard soft blocks. */
export function getPaperSubmitState(
  input: PaperTicketSubmitStateInput,
): PaperTicketSubmitState {
  if (input.busy) {
    return { enabled: false, reason: "Request in progress" };
  }

  const ctx = DEFAULT_TERMINAL_EXECUTION_CONTEXT;
  const executionSymbol = resolveExecutionSymbolForChart(
    ctx.chartSymbol ?? "BTCUSDT",
  );
  if (!executionSymbol) {
    return { enabled: false, reason: EXECUTION_MAPPING_MISSING_MESSAGE };
  }
  if (ctx.executionExchange !== "bingx") {
    return { enabled: false, reason: "Execution exchange must be bingx" };
  }
  if (ctx.executionMarketType !== "perpetual") {
    return { enabled: false, reason: "Execution market type must be perpetual" };
  }

  if (!finitePositive(input.notionalUsdt)) {
    return { enabled: false, reason: "Size USDT must be greater than zero" };
  }
  if (!finitePositive(input.qtyBtc)) {
    return { enabled: false, reason: "Qty BTC must be greater than zero" };
  }

  if (!Number.isFinite(input.leverage) || input.leverage < 1) {
    return { enabled: false, reason: "Leverage must be at least 1" };
  }

  const maxLev = paperMaxLeverage(input.settings);
  if (input.leverage > maxLev) {
    return {
      enabled: false,
      reason: `Leverage exceeds paper max (${maxLev}x)`,
    };
  }

  if (input.kind === "limit") {
    const lp = input.limitPrice;
    if (lp == null || !finitePositive(lp)) {
      return { enabled: false, reason: "Limit price must be greater than zero" };
    }
    return { enabled: true, reason: null };
  }

  const entry = input.estimatedEntryPrice;
  if (entry == null || !finitePositive(entry)) {
    return {
      enabled: false,
      reason: "No valid entry price for paper execution",
    };
  }

  return { enabled: true, reason: null };
}

/** Derive BTC qty from notional + entry (sync, for button enable). */
export function derivePaperQtyBtc(
  notionalUsdt: number,
  entryPrice: number | null | undefined,
  qtyBtcInput: string,
): number {
  if (
    entryPrice != null &&
    Number.isFinite(entryPrice) &&
    entryPrice > 0 &&
    Number.isFinite(notionalUsdt) &&
    notionalUsdt > 0
  ) {
    return notionalUsdt / entryPrice;
  }
  const q = Number(qtyBtcInput);
  return Number.isFinite(q) && q > 0 ? q : 0;
}
