import { randomUUID } from "crypto";
import type {
  PaperFill,
  PaperOrderIntent,
  PaperOrderType,
  PaperPosition,
  PaperTradeLedgerEntry,
  PaperTradingState,
} from "./paperTypes";
import { appendLog } from "./paperStore";

const TEMP_R_USDT = 100; // Temporary fallback until risk model is connected.

export function calculateRMultiple(
  side: "long" | "short",
  entryPrice: number,
  quantity: number,
  realizedPnlUsdt: number,
  stopLoss?: number | null,
): number | null {
  if (!Number.isFinite(realizedPnlUsdt)) return null;
  if (stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0 && quantity > 0) {
    const riskPerUnit =
      side === "long" ? entryPrice - stopLoss : stopLoss - entryPrice;
    if (riskPerUnit > 0) {
      const r = realizedPnlUsdt / (riskPerUnit * quantity);
      return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
    }
  }
  const r = realizedPnlUsdt / TEMP_R_USDT;
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
}

export function getOpenTrade(state: PaperTradingState, symbol: string): PaperTradeLedgerEntry | null {
  return (
    state.tradeLedger.find((t) => t.symbol === symbol && t.status === "open") ?? null
  );
}

export function appendPaperFill(state: PaperTradingState, fill: PaperFill): void {
  state.fills.unshift(fill);
  state.fills = state.fills.slice(0, 500);
}

export function upsertPaperTradeLedgerEntry(
  state: PaperTradingState,
  entry: PaperTradeLedgerEntry,
): void {
  const idx = state.tradeLedger.findIndex((t) => t.id === entry.id);
  if (idx >= 0) state.tradeLedger[idx] = entry;
  else state.tradeLedger.unshift(entry);
  state.tradeLedger = state.tradeLedger.slice(0, 200);
}

export function clearPaperLedger(state: PaperTradingState): void {
  state.tradeLedger = [];
}

export function clearPaperFills(state: PaperTradingState): void {
  state.fills = [];
}

function setupFromIntent(intent: PaperOrderIntent): string {
  return `Paper ${intent.side} ${intent.type}`;
}

function parseStops(intent: PaperOrderIntent): {
  stopLoss: number | null;
  takeProfit: number | null;
} {
  const sl = intent.stopLoss != null && intent.stopLoss !== "" ? Number(intent.stopLoss) : null;
  const tp =
    intent.takeProfit != null && intent.takeProfit !== "" ? Number(intent.takeProfit) : null;
  return {
    stopLoss: sl != null && Number.isFinite(sl) && sl > 0 ? sl : null,
    takeProfit: tp != null && Number.isFinite(tp) && tp > 0 ? tp : null,
  };
}

export function recordFillAndLedger(params: {
  state: PaperTradingState;
  intent: PaperOrderIntent;
  orderId: string;
  fillPrice: number;
  markPrice: number;
  quantity: number;
  feeUsdt: number;
  orderType: PaperOrderType;
  action: PaperFill["action"];
  closeReason?: string;
  realizedPnlDelta?: number;
}): { tradeId: string; fill: PaperFill } {
  const { state, intent, orderId, fillPrice, markPrice, quantity, feeUsdt, orderType, action } =
    params;
  const notional = quantity * fillPrice;
  const slippageUsdt = Math.abs(fillPrice - markPrice) * quantity;
  const openTrade = getOpenTrade(state, intent.symbol);
  const tradeId = openTrade?.id ?? randomUUID();
  const { stopLoss, takeProfit } = parseStops(intent);

  const fill: PaperFill = {
    id: randomUUID(),
    tradeId,
    orderId,
    symbol: intent.symbol,
    side: intent.side,
    action,
    price: fillPrice,
    quantity,
    notionalUsdt: notional,
    feeUsdt,
    slippageUsdt,
    timestamp: new Date().toISOString(),
  };
  appendPaperFill(state, fill);

  if (action === "open") {
    const entry: PaperTradeLedgerEntry = {
      id: tradeId,
      symbol: intent.symbol,
      side: intent.side,
      status: "open",
      entryOrderId: orderId,
      entryTime: fill.timestamp,
      entryPrice: fillPrice,
      quantity,
      notionalUsdt: notional,
      leverage: Number(intent.leverage),
      marginMode: intent.marginMode,
      stopLoss,
      takeProfit,
      realizedPnlUsdt: 0,
      unrealizedPnlUsdt: 0,
      feesUsdt: feeUsdt,
      setup: setupFromIntent(intent),
      tags: [],
      mistakes: [],
    };
    upsertPaperTradeLedgerEntry(state, entry);
    return { tradeId, fill };
  }

  if (action === "increase" && openTrade) {
    const totalQty = openTrade.quantity + quantity;
    const avgEntry =
      (openTrade.entryPrice * openTrade.quantity + fillPrice * quantity) / totalQty;
    openTrade.quantity = totalQty;
    openTrade.entryPrice = avgEntry;
    openTrade.notionalUsdt += notional;
    openTrade.feesUsdt += feeUsdt;
    if (stopLoss != null) openTrade.stopLoss = stopLoss;
    if (takeProfit != null) openTrade.takeProfit = takeProfit;
    upsertPaperTradeLedgerEntry(state, openTrade);
    return { tradeId, fill };
  }

  if ((action === "close" || action === "reduce" || action === "flip") && openTrade) {
    const pnl = params.realizedPnlDelta ?? 0;
    openTrade.exitOrderId = orderId;
    openTrade.exitTime = fill.timestamp;
    openTrade.exitPrice = fillPrice;
    openTrade.realizedPnlUsdt += pnl;
    openTrade.feesUsdt += feeUsdt;
    if (action === "close" || action === "flip") {
      openTrade.status = "closed";
      openTrade.quantity = 0;
      openTrade.rMultiple = calculateRMultiple(
        openTrade.side,
        openTrade.entryPrice,
        quantity,
        openTrade.realizedPnlUsdt,
        openTrade.stopLoss,
      );
      if (params.closeReason) {
        openTrade.mistakes = openTrade.mistakes ?? [];
        if (!openTrade.mistakes.includes(params.closeReason)) {
          openTrade.mistakes.push(params.closeReason);
        }
      }
    } else {
      openTrade.quantity = Math.max(0, openTrade.quantity - quantity);
      if (openTrade.quantity <= 1e-12) {
        openTrade.status = "closed";
        openTrade.rMultiple = calculateRMultiple(
          openTrade.side,
          openTrade.entryPrice,
          quantity,
          openTrade.realizedPnlUsdt,
          openTrade.stopLoss,
        );
      }
    }
    upsertPaperTradeLedgerEntry(state, openTrade);
    return { tradeId, fill };
  }

  return { tradeId, fill };
}

export function closeLedgerTrade(
  state: PaperTradingState,
  pos: PaperPosition,
  closePrice: number,
  orderId: string,
  reason: string,
  realizedPnl: number,
  feeUsdt: number,
): void {
  const openTrade = pos.openTradeId
    ? state.tradeLedger.find((t) => t.id === pos.openTradeId)
    : getOpenTrade(state, pos.symbol);
  if (!openTrade || openTrade.status !== "open") return;

  const fill: PaperFill = {
    id: randomUUID(),
    tradeId: openTrade.id,
    orderId,
    symbol: pos.symbol,
    side: pos.side === "long" ? "short" : "long",
    action: "close",
    price: closePrice,
    quantity: pos.quantity,
    notionalUsdt: pos.quantity * closePrice,
    feeUsdt,
    slippageUsdt: 0,
    timestamp: new Date().toISOString(),
  };
  appendPaperFill(state, fill);

  openTrade.exitOrderId = orderId;
  openTrade.exitTime = fill.timestamp;
  openTrade.exitPrice = closePrice;
  openTrade.realizedPnlUsdt = realizedPnl;
  openTrade.feesUsdt += feeUsdt;
  openTrade.status = "closed";
  openTrade.rMultiple = calculateRMultiple(
    openTrade.side,
    openTrade.entryPrice,
    pos.quantity,
    realizedPnl,
    openTrade.stopLoss,
  );
  if (reason) openTrade.mistakes = [reason];
  upsertPaperTradeLedgerEntry(state, openTrade);
}

export function syncOpenTradeUnrealized(
  state: PaperTradingState,
  mark: number,
  pos: PaperPosition,
): void {
  if (!pos.openTradeId) return;
  const trade = state.tradeLedger.find((t) => t.id === pos.openTradeId && t.status === "open");
  if (!trade || !pos.entryPrice) return;
  const unrealized =
    pos.side === "long"
      ? (mark - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - mark) * pos.quantity;
  trade.unrealizedPnlUsdt = unrealized;
  upsertPaperTradeLedgerEntry(state, trade);
}

export function openNewTradeAfterFlip(
  state: PaperTradingState,
  intent: PaperOrderIntent,
  orderId: string,
  fillPrice: number,
  quantity: number,
  feeUsdt: number,
): string {
  const tradeId = randomUUID();
  const { stopLoss, takeProfit } = parseStops(intent);
  const ts = new Date().toISOString();
  const fill: PaperFill = {
    id: randomUUID(),
    tradeId,
    orderId,
    symbol: intent.symbol,
    side: intent.side,
    action: "open",
    price: fillPrice,
    quantity,
    notionalUsdt: quantity * fillPrice,
    feeUsdt,
    slippageUsdt: 0,
    timestamp: ts,
  };
  appendPaperFill(state, fill);
  upsertPaperTradeLedgerEntry(state, {
    id: tradeId,
    symbol: intent.symbol,
    side: intent.side,
    status: "open",
    entryOrderId: orderId,
    entryTime: ts,
    entryPrice: fillPrice,
    quantity,
    notionalUsdt: quantity * fillPrice,
    leverage: Number(intent.leverage),
    marginMode: intent.marginMode,
    stopLoss,
    takeProfit,
    realizedPnlUsdt: 0,
    unrealizedPnlUsdt: 0,
    feesUsdt: feeUsdt,
    setup: setupFromIntent(intent),
  });
  return tradeId;
}
