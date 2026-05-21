export type PaperTicketSide = "long" | "short";

export interface PaperTicketCalcInput {
  side: PaperTicketSide;
  entryPrice: number | null;
  /** Position notional in USDT */
  notionalUsdt: number;
  quantityBtc: number;
  leverage: number;
  stopLoss: number | null;
  takeProfit: number | null;
  paperEquity: number;
}

export interface PaperTicketCalcResult {
  estimatedEntry: number | null;
  stopDistance: number | null;
  riskUsdt: number | null;
  riskPct: number | null;
  positionNotional: number | null;
  requiredMargin: number | null;
  pnlToTp: number | null;
  lossToSl: number | null;
  rMultiple: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pre-trade risk math aligned with server paperRiskEngine.buildPreview. */
export function computePaperTicketMetrics(
  input: PaperTicketCalcInput,
): PaperTicketCalcResult {
  const empty: PaperTicketCalcResult = {
    estimatedEntry: null,
    stopDistance: null,
    riskUsdt: null,
    riskPct: null,
    positionNotional: null,
    requiredMargin: null,
    pnlToTp: null,
    lossToSl: null,
    rMultiple: null,
  };

  const entry = input.entryPrice;
  const qty = input.quantityBtc;
  const lev = input.leverage;
  const notional = input.notionalUsdt;
  if (entry == null || !Number.isFinite(entry) || entry <= 0) return empty;
  if (!Number.isFinite(notional) || notional <= 0) return empty;
  if (!Number.isFinite(qty) || qty <= 0) return empty;
  if (!Number.isFinite(lev) || lev <= 0) return empty;

  const requiredMargin = notional / lev;

  let stopDistance: number | null = null;
  let riskUsdt: number | null = null;
  let lossToSl: number | null = null;
  let pnlToTp: number | null = null;
  let rMultiple: number | null = null;

  const sl = input.stopLoss;
  const tp = input.takeProfit;

  if (sl != null && Number.isFinite(sl) && sl > 0) {
    const riskPerUnit =
      input.side === "long" ? entry - sl : sl - entry;
    if (riskPerUnit > 0) {
      stopDistance = riskPerUnit;
      riskUsdt = riskPerUnit * qty;
      lossToSl = -riskUsdt;
      if (tp != null && Number.isFinite(tp) && tp > 0) {
        const rewardPerUnit =
          input.side === "long" ? tp - entry : entry - tp;
        if (rewardPerUnit > 0) {
          pnlToTp = rewardPerUnit * qty;
          rMultiple = round2(pnlToTp / riskUsdt);
        }
      }
    }
  }

  const riskPct =
    riskUsdt != null &&
    Number.isFinite(input.paperEquity) &&
    input.paperEquity > 0
      ? round2((riskUsdt / input.paperEquity) * 100)
      : null;

  return {
    estimatedEntry: round2(entry),
    stopDistance: stopDistance != null ? round2(stopDistance) : null,
    riskUsdt: riskUsdt != null ? round2(riskUsdt) : null,
    riskPct,
    positionNotional: round2(notional),
    requiredMargin: round2(requiredMargin),
    pnlToTp: pnlToTp != null ? round2(pnlToTp) : null,
    lossToSl: lossToSl != null ? round2(lossToSl) : null,
    rMultiple,
  };
}
