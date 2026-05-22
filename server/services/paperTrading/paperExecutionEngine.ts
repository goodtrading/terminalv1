import { randomUUID } from "crypto";
import { MarketDataGateway } from "../../market-gateway";
import {
  appendPaperFill,
  calculateRMultiple,
  closeLedgerTrade,
  getOpenTrade,
  openNewTradeAfterFlip,
  recordFillAndLedger,
  syncOpenTradeUnrealized,
  upsertPaperTradeLedgerEntry,
} from "./paperLedger";
import { schedulePaperEntryContextRefresh } from "./paperContextCapture";
import { checkPaperStops } from "./paperStopEngine";
import {
  appendLog,
  chargeFee,
  getPaperFills,
  getPaperSettings,
  getPaperState,
  getPaperTradeLedger,
  resetPaperAccount,
  resetPaperState,
  savePaperState,
} from "./paperStore";
import {
  buildPreview,
  calculateEstimatedNotional,
  calculateRequiredMargin,
  estimateFillPrice,
  parseIntent,
  paperSubmitErrorCode,
  validatePaperOrder,
  validatePaperRiskUpdate,
} from "./paperRiskEngine";
import type {
  PaperAccountState,
  PaperFill,
  PaperOrder,
  PaperOrderIntent,
  PaperOrderPreview,
  PaperPosition,
  PaperTradeLedgerEntry,
  PaperTradingState,
} from "./paperTypes";

const DEFAULT_SYMBOL = "BTC-USDT";
const POSITION_DUST = 1e-10;

function getMarkPriceSync(): number | null {
  const ticker = MarketDataGateway.getCachedTicker();
  if (ticker?.price && Number.isFinite(ticker.price) && ticker.price > 0) {
    return ticker.price;
  }
  return null;
}

export async function resolveMarkPrice(): Promise<number | { error: string; code: string }> {
  const cached = getMarkPriceSync();
  if (cached != null) return cached;
  try {
    const ticker = await MarketDataGateway.getTicker("BTCUSDT");
    if (ticker?.price && Number.isFinite(ticker.price) && ticker.price > 0) {
      return ticker.price;
    }
  } catch (err) {
    console.error(
      "[paper-execution] mark price fetch failed",
      err instanceof Error ? err.message : err,
    );
  }
  return {
    error: "Unable to resolve mark price for paper execution.",
    code: "PAPER_MARK_PRICE_UNAVAILABLE",
  };
}

function resolveQuantityUsdt(intent: PaperOrderIntent, markPrice: number): number {
  const size = Number(intent.size);
  if (intent.sizeUnit === "USDT") return size;
  if (intent.sizeUnit === "BTC") return size * markPrice;
  const balance = getPaperState().account.balanceUsdt;
  return (balance * size) / 100;
}

function resolveBtcQty(intent: PaperOrderIntent, markPrice: number): number {
  const usdt = resolveQuantityUsdt(intent, markPrice);
  return usdt / markPrice;
}

function recalcUnrealized(position: PaperPosition, mark: number): number {
  if (position.side === "flat" || !position.entryPrice || position.quantity <= 0) {
    return 0;
  }
  const diff =
    position.side === "long"
      ? mark - position.entryPrice
      : position.entryPrice - mark;
  return diff * position.quantity;
}

function syncAccountEquity(state: PaperTradingState, mark: number): void {
  const pos = state.position;
  let unrealized = 0;
  if (pos && pos.side !== "flat" && pos.entryPrice) {
    unrealized = recalcUnrealized(pos, mark);
    pos.markPrice = mark;
    pos.unrealizedPnl = unrealized;
  }
  state.account.unrealizedPnlUsdt = unrealized;
  state.account.equityUsdt =
    state.account.balanceUsdt + state.account.realizedPnlUsdt + unrealized;
  state.account.updatedAt = new Date().toISOString();
}

function ensurePosition(state: PaperTradingState, symbol: string): PaperPosition {
  if (!state.position || state.position.symbol !== symbol) {
    state.position = {
      symbol,
      side: "flat",
      quantity: 0,
      entryPrice: null,
      markPrice: null,
      unrealizedPnl: 0,
      leverage: 5,
      marginMode: "isolated",
    };
  }
  return state.position;
}

function limitShouldFill(intent: PaperOrderIntent, mark: number): boolean {
  const limit = Number(intent.price);
  if (!Number.isFinite(limit)) return false;
  if (intent.side === "long") return mark <= limit;
  return mark >= limit;
}

function parseStopsFromIntent(intent: PaperOrderIntent): {
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

function maintainPaperState(state: PaperTradingState, mark: number): void {
  if (mark > 0) {
    tryFillOpenLimits(state, mark);
    checkPaperStops(state, mark);
  }
  if (state.position && state.position.side !== "flat" && mark > 0) {
    syncOpenTradeUnrealized(state, mark, state.position);
  }
  syncAccountEquity(state, mark);
}

function applyFill(
  state: PaperTradingState,
  intent: PaperOrderIntent,
  mark: number,
  orderId?: string,
): void {
  const oid = orderId ?? randomUUID();
  const fillPrice = estimateFillPrice(
    mark,
    intent.side,
    intent.type,
    intent.type === "limit" ? Number(intent.price) : undefined,
  );
  const qty = resolveBtcQty(intent, fillPrice);
  const notional = qty * fillPrice;
  const feeUsdt = chargeFee(state, notional, intent.type, "Open");
  const leverage = Number(intent.leverage);
  const margin = calculateRequiredMargin(notional, leverage);
  const pos = ensurePosition(state, intent.symbol);
  const stops = parseStopsFromIntent(intent);

  if (intent.reduceOnly && pos.side !== "flat") {
    const closing =
      (intent.side === "short" && pos.side === "long") ||
      (intent.side === "long" && pos.side === "short");
    if (closing) {
      closePositionInternal(state, mark, `Reduce-only fill ${oid}`, "market");
      return;
    }
  }

  if (pos.side === "flat") {
    const { tradeId } = recordFillAndLedger({
      state,
      intent,
      orderId: oid,
      fillPrice,
      markPrice: mark,
      quantity: qty,
      feeUsdt,
      orderType: intent.type,
      action: "open",
    });
    pos.side = intent.side;
    pos.quantity = qty;
    pos.entryPrice = fillPrice;
    pos.leverage = leverage;
    pos.marginMode = intent.marginMode;
    pos.stopLoss = stops.stopLoss;
    pos.takeProfit = stops.takeProfit;
    pos.openTradeId = tradeId;
  } else if (pos.side === intent.side) {
    recordFillAndLedger({
      state,
      intent,
      orderId: oid,
      fillPrice,
      markPrice: mark,
      quantity: qty,
      feeUsdt,
      orderType: intent.type,
      action: "increase",
    });
    const totalQty = pos.quantity + qty;
    const prevEntry = pos.entryPrice ?? fillPrice;
    pos.entryPrice = (prevEntry * pos.quantity + fillPrice * qty) / totalQty;
    pos.quantity = totalQty;
    pos.leverage = leverage;
    if (stops.stopLoss != null) pos.stopLoss = stops.stopLoss;
    if (stops.takeProfit != null) pos.takeProfit = stops.takeProfit;
  } else {
    const net = pos.quantity - qty;
    if (net <= 1e-10) {
      const entry = pos.entryPrice ?? fillPrice;
      const closePrice = estimateFillPrice(mark, intent.side, "market");
      const pnl =
        pos.side === "long"
          ? (closePrice - entry) * pos.quantity
          : (entry - closePrice) * pos.quantity;
      const closeFee = chargeFee(state, pos.quantity * closePrice, "market", "Close");
      state.account.balanceUsdt += pnl;
      state.account.realizedPnlUsdt += pnl;
      state.account.availableMarginUsdt += margin + pnl;
      closeLedgerTrade(state, pos, closePrice, oid, "Opposing fill", pnl, closeFee);
      pos.side = "flat";
      pos.quantity = 0;
      pos.entryPrice = null;
      pos.stopLoss = null;
      pos.takeProfit = null;
      pos.openTradeId = null;
      appendLog(
        state,
        "fill",
        `Position closed via opposing fill · PnL ${pnl.toFixed(2)} USDT @ ${closePrice.toFixed(2)}`,
      );
      syncAccountEquity(state, mark);
      return;
    }
    if (qty > net + 1e-10) {
      const entry = pos.entryPrice ?? fillPrice;
      const closePrice = estimateFillPrice(mark, intent.side, "market");
      const closeQty = pos.quantity;
      const pnl =
        pos.side === "long"
          ? (closePrice - entry) * closeQty
          : (entry - closePrice) * closeQty;
      const closeFee = chargeFee(state, closeQty * closePrice, "market", "Close");
      state.account.balanceUsdt += pnl;
      state.account.realizedPnlUsdt += pnl;
      state.account.availableMarginUsdt += pnl;
      closeLedgerTrade(state, pos, closePrice, oid, "Flip close", pnl, closeFee);
      pos.side = "flat";
      pos.quantity = 0;
      pos.entryPrice = null;
      pos.stopLoss = null;
      pos.takeProfit = null;
      const remainQty = qty - closeQty;
      const openPrice = fillPrice;
      const openFee = chargeFee(state, remainQty * openPrice, intent.type, "Open");
      const tradeId = openNewTradeAfterFlip(state, intent, oid, openPrice, remainQty, openFee);
      pos.side = intent.side;
      pos.quantity = remainQty;
      pos.entryPrice = openPrice;
      pos.leverage = leverage;
      pos.marginMode = intent.marginMode;
      pos.stopLoss = stops.stopLoss;
      pos.takeProfit = stops.takeProfit;
      pos.openTradeId = tradeId;
      appendLog(state, "fill", `Flip ${intent.side.toUpperCase()} · closed & reopened`);
      syncAccountEquity(state, mark);
      return;
    }
    pos.quantity = net;
    recordFillAndLedger({
      state,
      intent,
      orderId: oid,
      fillPrice,
      markPrice: mark,
      quantity: qty,
      feeUsdt,
      orderType: intent.type,
      action: "reduce",
      realizedPnlDelta: 0,
    });
  }

  state.account.availableMarginUsdt = Math.max(0, state.account.availableMarginUsdt - margin);
  syncAccountEquity(state, mark);
  appendLog(
    state,
    "fill",
    `${intent.side.toUpperCase()} ${qty.toFixed(6)} BTC @ ${fillPrice.toFixed(2)} (${intent.type})`,
  );
}

function applyPaperPositionClose(
  state: PaperTradingState,
  mark: number,
  percent: number,
  logReason: string,
):
  | {
      ok: true;
      closedPercent: number;
      closedQuantity: number;
      realizedPnlUsdt: number;
      trade: PaperTradeLedgerEntry | null;
      fullClose: boolean;
    }
  | { ok: false; code: string; message: string } {
  const pos = state.position;
  if (!pos || pos.side === "flat" || pos.quantity <= 0) {
    return { ok: false, code: "NO_PAPER_POSITION", message: "No paper position to close." };
  }
  const entry = pos.entryPrice;
  if (entry == null || !Number.isFinite(entry) || entry <= 0) {
    return { ok: false, code: "INVALID_PARTIAL_CLOSE", message: "Position has no entry price." };
  }

  const pct = Math.min(100, Math.max(1, percent));
  let closeQty = (pos.quantity * pct) / 100;
  let remainder = pos.quantity - closeQty;
  const fullClose =
    pct >= 100 || remainder <= POSITION_DUST || closeQty >= pos.quantity - POSITION_DUST;
  if (fullClose) {
    closeQty = pos.quantity;
    remainder = 0;
  }

  const closeSide = pos.side === "long" ? "short" : "long";
  const closePrice = estimateFillPrice(mark, closeSide, "market");
  const pnl =
    pos.side === "long"
      ? (closePrice - entry) * closeQty
      : (entry - closePrice) * closeQty;
  const feeUsdt = chargeFee(state, closeQty * closePrice, "market", "Close");
  state.account.balanceUsdt += pnl;
  state.account.realizedPnlUsdt += pnl;
  state.account.availableMarginUsdt += pnl;

  const orderId = `close-${Date.now()}`;
  const openTrade = pos.openTradeId
    ? (state.tradeLedger.find((t) => t.id === pos.openTradeId && t.status === "open") ?? null)
    : getOpenTrade(state, pos.symbol);

  const tradeId = openTrade?.id ?? randomUUID();
  const fill: PaperFill = {
    id: randomUUID(),
    tradeId,
    orderId,
    symbol: pos.symbol,
    side: closeSide,
    action: fullClose ? "close" : "reduce",
    price: closePrice,
    quantity: closeQty,
    notionalUsdt: closeQty * closePrice,
    feeUsdt,
    slippageUsdt: Math.abs(closePrice - mark) * closeQty,
    timestamp: new Date().toISOString(),
  };
  appendPaperFill(state, fill);

  const qtyAtClose = pos.quantity;
  if (openTrade) {
    openTrade.realizedPnlUsdt += pnl;
    openTrade.feesUsdt += feeUsdt;
    if (fullClose) {
      openTrade.exitOrderId = orderId;
      openTrade.exitTime = fill.timestamp;
      openTrade.exitPrice = closePrice;
      openTrade.status = "closed";
      openTrade.quantity = 0;
      openTrade.rMultiple = calculateRMultiple(
        openTrade.side,
        openTrade.entryPrice,
        qtyAtClose,
        openTrade.realizedPnlUsdt,
        openTrade.stopLoss,
      );
    } else {
      openTrade.quantity = remainder;
      openTrade.notionalUsdt = remainder * entry;
    }
    upsertPaperTradeLedgerEntry(state, openTrade);
  }

  if (fullClose) {
    pos.side = "flat";
    pos.quantity = 0;
    pos.entryPrice = null;
    pos.unrealizedPnl = 0;
    pos.stopLoss = null;
    pos.takeProfit = null;
    pos.openTradeId = null;
  } else {
    pos.quantity = remainder;
    syncOpenTradeUnrealized(state, mark, pos);
  }
  syncAccountEquity(state, mark);

  const pctLabel = fullClose ? 100 : Math.round(pct);
  appendLog(
    state,
    fullClose ? "close" : "fill",
    fullClose
      ? `${logReason} · realized ${pnl.toFixed(2)} USDT`
      : `Closed ${pctLabel}% paper position · ${closeQty.toFixed(6)} BTC · PnL ${pnl.toFixed(2)} USDT`,
  );

  return {
    ok: true,
    closedPercent: pctLabel,
    closedQuantity: closeQty,
    realizedPnlUsdt: pnl,
    trade: openTrade,
    fullClose,
  };
}

function closePositionInternal(
  state: PaperTradingState,
  mark: number,
  reason: string,
  _feeType: "market" | "limit" = "market",
): void {
  const result = applyPaperPositionClose(state, mark, 100, reason);
  if (!result.ok) {
    appendLog(state, "close", result.message);
  }
}

function tryFillOpenLimits(state: PaperTradingState, mark: number): void {
  const open = state.orders.filter((o) => o.status === "open" && o.type === "limit");
  for (const order of open) {
    const intent: PaperOrderIntent = {
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      price: order.price != null ? String(order.price) : undefined,
      size: String(order.size),
      sizeUnit: order.sizeUnit,
      leverage: String(order.leverage),
      marginMode: order.marginMode,
      reduceOnly: order.reduceOnly,
      postOnly: order.postOnly,
    };
    if (limitShouldFill(intent, mark)) {
      order.status = "filled";
      order.filledAt = new Date().toISOString();
      applyFill(state, intent, mark, order.id);
    }
  }
  state.orders = state.orders.filter((o) => o.status === "open");
}

export function getPaperAccount(): PaperAccountState {
  const state = getPaperState();
  const mark = getMarkPriceSync() ?? 0;
  maintainPaperState(state, mark);
  savePaperState(state);
  return {
    exchange: "paper",
    ...state.account,
  };
}

export function getPaperOrders(): PaperOrder[] {
  const state = getPaperState();
  const mark = getMarkPriceSync() ?? 0;
  tryFillOpenLimits(state, mark);
  savePaperState(state);
  return state.orders.filter((o) => o.status === "open");
}

export function getPaperPosition(): PaperPosition | null {
  const state = getPaperState();
  const mark = getMarkPriceSync() ?? 0;
  maintainPaperState(state, mark);
  savePaperState(state);
  if (!state.position || state.position.side === "flat") return null;
  return state.position;
}

export function getPaperLogs() {
  return getPaperState().logs;
}

export { getPaperFills, getPaperTradeLedger };

export function getPaperTradeById(tradeId: string) {
  return getPaperState().tradeLedger.find((t) => t.id === tradeId) ?? null;
}

function normalizeRiskField(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function updatePaperPositionRisk(body: {
  stopLoss?: number | null;
  takeProfit?: number | null;
}):
  | {
      success: true;
      position: PaperPosition;
      trade: PaperTradeLedgerEntry | null;
      message: string;
    }
  | { success: false; code: string; message: string } {
  const state = getPaperState();
  const pos = state.position;
  if (!pos || pos.side === "flat" || pos.quantity <= 0) {
    return {
      success: false,
      code: "NO_PAPER_POSITION",
      message: "No open paper position",
    };
  }

  const mark = getMarkPriceSync() ?? pos.markPrice ?? 0;
  maintainPaperState(state, mark > 0 ? mark : pos.markPrice ?? 0);

  const nextSl = normalizeRiskField(body.stopLoss);
  const nextTp = normalizeRiskField(body.takeProfit);
  if (nextSl === undefined && nextTp === undefined) {
    return {
      success: false,
      code: "INVALID_PAPER_RISK_UPDATE",
      message: "No risk fields to update",
    };
  }

  const refMark = mark > 0 ? mark : (pos.markPrice ?? 0);
  const ref =
    refMark > 0 && Number.isFinite(refMark)
      ? refMark
      : pos.entryPrice != null && pos.entryPrice > 0
        ? pos.entryPrice
        : null;
  if (ref == null) {
    return {
      success: false,
      code: "INVALID_PAPER_RISK_UPDATE",
      message: "No valid mark or entry price for risk validation",
    };
  }

  const sl = nextSl !== undefined ? nextSl : (pos.stopLoss ?? null);
  const tp = nextTp !== undefined ? nextTp : (pos.takeProfit ?? null);

  const validationError = validatePaperRiskUpdate(pos.side, ref, sl, tp);
  if (validationError) {
    return {
      success: false,
      code: "INVALID_PAPER_RISK_UPDATE",
      message: validationError,
    };
  }

  if (nextSl !== undefined) pos.stopLoss = nextSl;
  if (nextTp !== undefined) pos.takeProfit = nextTp;

  let trade: PaperTradeLedgerEntry | null = null;
  if (pos.openTradeId) {
    trade = state.tradeLedger.find((t) => t.id === pos.openTradeId && t.status === "open") ?? null;
    if (trade) {
      if (nextSl !== undefined) trade.stopLoss = nextSl;
      if (nextTp !== undefined) trade.takeProfit = nextTp;
      syncOpenTradeUnrealized(state, mark, pos);
    }
  }

  const parts: string[] = [];
  if (nextSl !== undefined) parts.push(`SL ${nextSl ?? "—"}`);
  if (nextTp !== undefined) parts.push(`TP ${nextTp ?? "—"}`);
  appendLog(state, "fill", `Paper risk updated — ${parts.join(" · ")}`);
  savePaperState(state);

  if (pos.openTradeId && (nextSl !== undefined || nextTp !== undefined)) {
    schedulePaperEntryContextRefresh(pos.openTradeId);
  }

  const positionOut = getPaperPosition();
  if (!positionOut) {
    return {
      success: false,
      code: "NO_PAPER_POSITION",
      message: "No open paper position",
    };
  }

  return {
    success: true,
    position: positionOut,
    trade,
    message: "Paper risk updated",
  };
}

export function updatePaperTradeMetadata(
  tradeId: string,
  patch: { setup?: string; tags?: string[]; mistakes?: string[]; notes?: string },
): PaperTradeLedgerEntry | null {
  const state = getPaperState();
  const trade = state.tradeLedger.find((t) => t.id === tradeId);
  if (!trade) return null;
  if (patch.setup !== undefined) trade.setup = patch.setup;
  if (patch.tags !== undefined) trade.tags = patch.tags;
  if (patch.mistakes !== undefined) trade.mistakes = patch.mistakes;
  if (patch.notes !== undefined) trade.notes = patch.notes;
  savePaperState(state);
  return trade;
}

export async function runPaperStopCheck(): Promise<{
  success: boolean;
  triggered: boolean;
  message?: string;
}> {
  const state = getPaperState();
  const markResult = await resolveMarkPrice();
  const mark = typeof markResult === "number" ? markResult : getMarkPriceSync() ?? 0;
  const result = checkPaperStops(state, mark);
  maintainPaperState(state, mark);
  savePaperState(state);
  return {
    success: true,
    triggered: result.triggered,
    message: result.message,
  };
}

export async function previewPaperOrder(
  body: unknown,
): Promise<PaperOrderPreview | { error: string; code: string }> {
  const parsed = parseIntent(body as Partial<PaperOrderIntent>);
  if ("error" in parsed) return parsed;
  const markResult = await resolveMarkPrice();
  if (typeof markResult !== "number") return markResult;
  return buildPreview(parsed.intent, markResult);
}

export async function submitPaperOrder(body: unknown): Promise<{
  success: boolean;
  order?: PaperOrder;
  account?: PaperAccountState;
  position?: PaperPosition | null;
  message?: string;
  error?: string;
  code?: string;
}> {
  const parsed = parseIntent(body as Partial<PaperOrderIntent>);
  if ("error" in parsed) {
    return { success: false, error: parsed.error, code: parsed.code };
  }
  const intent = parsed.intent;

  const markResult = await resolveMarkPrice();
  if (typeof markResult !== "number") {
    return { success: false, error: markResult.error, code: markResult.code };
  }
  const mark = markResult;

  const validation = validatePaperOrder(intent, mark);
  if (!validation.valid) {
    const state = getPaperState();
    appendLog(state, "reject", validation.errors.join("; "));
    savePaperState(state);
    return {
      success: false,
      error: validation.errors.join("; "),
      code: paperSubmitErrorCode(validation.errors),
    };
  }

  const state = getPaperState();
  appendLog(
    state,
    "submit",
    `${intent.side.toUpperCase()} ${intent.type} ${intent.size} ${intent.sizeUnit} on ${intent.symbol}`,
  );

  maintainPaperState(state, mark);

  if (intent.type === "market") {
    applyFill(state, intent, mark);
    maintainPaperState(state, mark);
    savePaperState(state);
    return {
      success: true,
      message: "Paper order submitted",
      account: getPaperAccount(),
      position: getPaperPosition(),
    };
  }

  if (limitShouldFill(intent, mark)) {
    applyFill(state, intent, mark);
    maintainPaperState(state, mark);
    savePaperState(state);
    return {
      success: true,
      message: "Paper order submitted",
      account: getPaperAccount(),
      position: getPaperPosition(),
    };
  }

  const order: PaperOrder = {
    id: randomUUID(),
    symbol: intent.symbol,
    venue: intent.venue ?? "bingx",
    marketType: intent.marketType ?? "perpetual",
    chartSymbol: intent.chartSymbol,
    side: intent.side,
    type: "limit",
    price: Number(intent.price),
    size: Number(intent.size),
    sizeUnit: intent.sizeUnit,
    leverage: Number(intent.leverage),
    marginMode: intent.marginMode,
    reduceOnly: intent.reduceOnly,
    postOnly: intent.postOnly,
    stopLoss: intent.stopLoss ? Number(intent.stopLoss) : null,
    takeProfit: intent.takeProfit ? Number(intent.takeProfit) : null,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  state.orders.push(order);
  savePaperState(state);
  return {
    success: true,
    order,
    message: "Paper order submitted",
    account: getPaperAccount(),
    position: getPaperPosition(),
  };
}

export function cancelPaperOrder(orderId: string): boolean {
  const state = getPaperState();
  const order = state.orders.find((o) => o.id === orderId && o.status === "open");
  if (!order) return false;
  order.status = "cancelled";
  state.orders = state.orders.filter((o) => o.status === "open");
  appendLog(state, "cancel", `Cancelled paper order ${orderId.slice(0, 8)}`);
  savePaperState(state);
  return true;
}

export function updatePaperOrder(
  orderId: string,
  patch: { price?: number },
):
  | { success: true; order: PaperOrder; message: string }
  | { success: false; code: string; message: string } {
  const state = getPaperState();
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) {
    return { success: false, code: "ORDER_NOT_FOUND", message: "Order not found" };
  }
  if (order.status !== "open") {
    return {
      success: false,
      code: "ORDER_NOT_OPEN",
      message: "Only open orders can be modified",
    };
  }
  if (order.type !== "limit") {
    return {
      success: false,
      code: "ORDER_NOT_LIMIT",
      message: "Only limit orders can be modified",
    };
  }
  if (patch.price !== undefined) {
    const px = Number(patch.price);
    if (!Number.isFinite(px) || px <= 0) {
      return { success: false, code: "INVALID_PRICE", message: "Price must be greater than 0" };
    }
    order.price = px;
    appendLog(state, "update", `Moved paper limit order to ${px.toFixed(2)}`);
  }
  savePaperState(state);
  return { success: true, order, message: "Paper order updated" };
}

export function cancelAllPaperOrders(): number {
  const state = getPaperState();
  const open = state.orders.filter((o) => o.status === "open");
  for (const o of open) o.status = "cancelled";
  state.orders = [];
  appendLog(state, "cancel", `Cancelled ${open.length} open paper order(s)`);
  savePaperState(state);
  return open.length;
}

export async function partialClosePaperPosition(percent: number): Promise<
  | {
      success: true;
      account: PaperAccountState;
      position: PaperPosition | null;
      trade: PaperTradeLedgerEntry | null;
      closedPercent: number;
      closedQuantity: number;
      realizedPnlUsdt: number;
      message: string;
    }
  | { success: false; code: string; message: string }
> {
  const pct = Number(percent);
  if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
    return {
      success: false,
      code: "INVALID_PARTIAL_CLOSE",
      message: "Percent must be between 1 and 100.",
    };
  }

  const state = getPaperState();
  const markResult = await resolveMarkPrice();
  const mark = typeof markResult === "number" ? markResult : getMarkPriceSync() ?? 0;
  if (mark <= 0) {
    return {
      success: false,
      code: "INVALID_PARTIAL_CLOSE",
      message: "Mark price unavailable.",
    };
  }

  maintainPaperState(state, mark);
  const result = applyPaperPositionClose(state, mark, pct, "Close position");
  if (!result.ok) {
    return { success: false, code: result.code, message: result.message };
  }
  savePaperState(state);

  const closedPct = result.closedPercent;
  return {
    success: true,
    account: getPaperAccount(),
    position: getPaperPosition(),
    trade: result.trade,
    closedPercent: closedPct,
    closedQuantity: result.closedQuantity,
    realizedPnlUsdt: result.realizedPnlUsdt,
    message: result.fullClose
      ? "Paper position closed"
      : `Paper position partially closed (${closedPct}%)`,
  };
}

export async function closePaperPosition(): Promise<
  Awaited<ReturnType<typeof partialClosePaperPosition>>
> {
  return partialClosePaperPosition(100);
}

export async function killSwitchPaper(): Promise<{ success: boolean; message: string }> {
  const state = getPaperState();
  const markResult = await resolveMarkPrice();
  const mark = typeof markResult === "number" ? markResult : getMarkPriceSync() ?? 0;
  const openCount = state.orders.filter((o) => o.status === "open").length;
  state.orders = [];
  closePositionInternal(state, mark, "Kill switch");
  appendLog(
    state,
    "kill_switch",
    `Paper kill switch — cancelled ${openCount} order(s), position flattened`,
  );
  savePaperState(state);
  return { success: true, message: "Paper kill switch executed" };
}

export function resetPaperEngine(): PaperTradingState {
  return resetPaperAccount({
    resetBalance: true,
    resetOrders: true,
    resetPosition: true,
    resetLogs: true,
    resetSettings: true,
    resetLedger: true,
    resetFills: true,
  });
}

export { getPaperSettings, resetPaperAccount, DEFAULT_SYMBOL };
