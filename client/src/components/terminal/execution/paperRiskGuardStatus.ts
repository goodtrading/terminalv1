import type { PaperAccountSnapshot, PaperTradingSettings } from "./executionTypes";
import {
  LIVE_TRADING_LOCKED_MESSAGE,
  PAPER_RISK_GUARD_POLICY,
  paperMaxLeverage,
} from "./paperRiskGuardConfig";

export type PaperRiskGuardStatusInput = {
  account?: PaperAccountSnapshot | null;
  settings?: PaperTradingSettings | null;
  ticketLeverage?: number | null;
  computedRiskPct?: number | null;
  liveTradingEnabled?: boolean;
  extraBlockReason?: string | null;
};

export type PaperRiskGuardStatus = {
  tradingAllowed: boolean;
  blockReasons: string[];
  maxLev: number;
  drawdownPct: number;
};

function pctDrawdown(initial: number, equity: number): number {
  if (initial <= 0) return 0;
  const loss = initial - equity;
  if (loss <= 0) return 0;
  return (loss / initial) * 100;
}

export function computePaperRiskGuardStatus(
  input: PaperRiskGuardStatusInput,
): PaperRiskGuardStatus {
  const {
    account,
    settings,
    ticketLeverage,
    computedRiskPct = null,
    liveTradingEnabled = false,
    extraBlockReason,
  } = input;

  const initial = settings?.initialBalanceUsdt ?? 10_000;
  const equity = account?.equityUsdt ?? initial;
  const drawdownPct = pctDrawdown(initial, equity);
  const maxLev = paperMaxLeverage(settings);

  const dailyLossExceeded =
    drawdownPct > PAPER_RISK_GUARD_POLICY.maxDailyLossPct;
  const riskPerTradeExceeded =
    computedRiskPct != null &&
    computedRiskPct > PAPER_RISK_GUARD_POLICY.maxRiskPerTradePct;
  const liveBlocked = liveTradingEnabled;
  const leverageInvalid =
    ticketLeverage != null &&
    Number.isFinite(ticketLeverage) &&
    (ticketLeverage <= 0 || ticketLeverage > maxLev);

  const blockReasons: string[] = [];
  if (liveBlocked) blockReasons.push(LIVE_TRADING_LOCKED_MESSAGE);
  if (dailyLossExceeded) {
    blockReasons.push(
      `Daily loss ${drawdownPct.toFixed(2)}% exceeds max ${PAPER_RISK_GUARD_POLICY.maxDailyLossPct}%.`,
    );
  }
  if (riskPerTradeExceeded && computedRiskPct != null) {
    blockReasons.push(
      `Trade risk ${computedRiskPct.toFixed(2)}% exceeds max ${PAPER_RISK_GUARD_POLICY.maxRiskPerTradePct}%.`,
    );
  }
  if (leverageInvalid && ticketLeverage != null) {
    blockReasons.push(
      ticketLeverage > maxLev
        ? `Leverage ${ticketLeverage}x exceeds max ${maxLev}x.`
        : "Leverage must be at least 1x.",
    );
  }
  if (extraBlockReason) blockReasons.push(extraBlockReason);

  return {
    tradingAllowed: blockReasons.length === 0,
    blockReasons,
    maxLev,
    drawdownPct,
  };
}
