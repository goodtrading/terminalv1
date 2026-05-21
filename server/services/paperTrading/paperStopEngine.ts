import type { PaperTradingState } from "./paperTypes";
import { closeLedgerTrade } from "./paperLedger";
import { appendLog, chargeFee, savePaperState } from "./paperStore";
import { estimateFillPrice } from "./paperRiskEngine";

export type StopCheckResult = {
  triggered: boolean;
  reason?: "stop_loss" | "take_profit";
  message?: string;
};

export function checkPaperStops(state: PaperTradingState, markPrice: number): StopCheckResult {
  const pos = state.position;
  if (!pos || pos.side === "flat" || pos.quantity <= 0 || !pos.entryPrice) {
    return { triggered: false };
  }

  const sl = pos.stopLoss;
  const tp = pos.takeProfit;
  if (sl == null && tp == null) return { triggered: false };

  let reason: "stop_loss" | "take_profit" | null = null;
  if (pos.side === "long") {
    if (sl != null && markPrice <= sl) reason = "stop_loss";
    else if (tp != null && markPrice >= tp) reason = "take_profit";
  } else {
    if (sl != null && markPrice >= sl) reason = "stop_loss";
    else if (tp != null && markPrice <= tp) reason = "take_profit";
  }

  if (!reason) return { triggered: false };

  const closeSide = pos.side === "long" ? "short" : "long";
  const closePrice = estimateFillPrice(markPrice, closeSide, "market");
  const closeNotional = pos.quantity * closePrice;
  const pnl =
    pos.side === "long"
      ? (closePrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - closePrice) * pos.quantity;
  const fee = chargeFee(state, closeNotional, "market", "Close");
  state.account.balanceUsdt += pnl;
  state.account.realizedPnlUsdt += pnl;
  state.account.availableMarginUsdt += pnl;

  closeLedgerTrade(
    state,
    pos,
    closePrice,
    `stop-${reason}`,
    reason === "stop_loss" ? "Stop loss triggered" : "Take profit triggered",
    pnl,
    fee,
  );

  pos.side = "flat";
  pos.quantity = 0;
  pos.entryPrice = null;
  pos.unrealizedPnl = 0;
  pos.stopLoss = null;
  pos.takeProfit = null;
  pos.openTradeId = null;

  state.account.unrealizedPnlUsdt = 0;
  state.account.equityUsdt =
    state.account.balanceUsdt + state.account.realizedPnlUsdt + state.account.unrealizedPnlUsdt;

  const logType = reason;
  const msg =
    reason === "stop_loss"
      ? `Stop loss triggered @ ${closePrice.toFixed(2)} · realized ${pnl.toFixed(2)} USDT`
      : `Take profit triggered @ ${closePrice.toFixed(2)} · realized ${pnl.toFixed(2)} USDT`;
  appendLog(state, logType, msg);
  savePaperState(state);

  return { triggered: true, reason, message: msg };
}
