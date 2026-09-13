import assert from "node:assert/strict";
import test from "node:test";

import { MarketDataGateway } from "../../market-gateway";
import { normalizePaperOrderBody, paperExecutionBackend } from "./paperExecutionBackend";
import { parseIntent } from "./paperRiskEngine";
import { getPaperState, resetPaperState, savePaperState } from "./paperStore";
import { runWithPaperUser } from "./paperUserContext";

const USER_ID = 42;
const MARKET_PRICE = 100;

function withPinnedMarket<T>(fn: () => Promise<T> | T): Promise<T> {
  const originalCached = MarketDataGateway.getCachedTicker;
  const originalTicker = MarketDataGateway.getTicker;
  (MarketDataGateway as any).getCachedTicker = () => ({ price: MARKET_PRICE });
  (MarketDataGateway as any).getTicker = async () => {
    throw new Error("network access is not allowed in N3A tests");
  };
  return Promise.resolve(fn()).finally(() => {
    (MarketDataGateway as any).getCachedTicker = originalCached;
    (MarketDataGateway as any).getTicker = originalTicker;
  });
}

function resetForUser() {
  runWithPaperUser(USER_ID, () => {
    resetPaperState();
  });
}

function marketOrderBody() {
  return normalizePaperOrderBody({
    symbol: "BTC-USDT",
    chartSymbol: "BTCUSDT",
    side: "buy",
    orderType: "market",
    qty: 1,
    sizeUnit: "BTC",
    leverage: 5,
    marginMode: "isolated",
    reduceOnly: false,
    postOnly: false,
  });
}

function limitOrderBody() {
  return normalizePaperOrderBody({
    symbol: "BTC-USDT",
    chartSymbol: "BTCUSDT",
    side: "buy",
    orderType: "limit",
    qty: 1,
    price: 90,
    sizeUnit: "BTC",
    leverage: 5,
    marginMode: "isolated",
    reduceOnly: false,
    postOnly: false,
  });
}

test("default paper backend is legacy", () => {
  assert.equal(paperExecutionBackend.id, "legacy");
});

test("legacy backend executes the existing paper flow through the abstraction", async () => {
  resetForUser();

  await withPinnedMarket(async () => {
    const order = marketOrderBody();
    const result = await paperExecutionBackend.submitOrder(USER_ID, order);

    assert.equal(result.success, true);
    assert.ok(result.data.account);
    assert.ok(result.data.position);
    assert.equal(result.data.position?.side, "long");

    const account = await paperExecutionBackend.getAccount(USER_ID);
    const positions = await paperExecutionBackend.getPositions(USER_ID);

    assert.equal(account.mode, "paper");
    assert.equal(account.openPaperPosition?.side, "long");
    assert.equal(positions.length, 1);
    assert.equal(positions[0].side, "long");
    assert.ok(account.balanceUsdt < 10_000);

    const ledger = runWithPaperUser(USER_ID, () => getPaperState().tradeLedger);
    assert.equal(ledger[0]?.venue, "paper");
  });
});

test("limit order stays working and cancel still works through the abstraction", async () => {
  resetForUser();

  await withPinnedMarket(async () => {
    const order = limitOrderBody();
    const submitted = await paperExecutionBackend.submitOrder(USER_ID, order);

    assert.equal(submitted.success, true);
    assert.equal(submitted.data.order?.status, "pending");

    const openOrders = await paperExecutionBackend.getOrders(USER_ID);
    assert.equal(openOrders.length, 1);
    assert.equal(openOrders[0].status, "pending");

    const cancelResult = await paperExecutionBackend.cancelOrder(USER_ID, openOrders[0].id);
    assert.equal(cancelResult.success, true);

    const afterCancel = await paperExecutionBackend.getOrders(USER_ID);
    assert.equal(afterCancel.length, 0);
  });
});

test("requesting nautilus returns BACKEND_NOT_AVAILABLE and never falls back", async () => {
  resetForUser();

  await withPinnedMarket(async () => {
    const order = marketOrderBody();
    const submitResult = await paperExecutionBackend.submitOrder(USER_ID, order, {
      backendId: "nautilus",
    });

    assert.equal(submitResult.success, false);
    assert.equal(submitResult.code, "BACKEND_NOT_AVAILABLE");

    const accountResult = await paperExecutionBackend.getAccount(USER_ID, {
      backendId: "nautilus",
    });
    assert.equal(accountResult.success, false);
    assert.equal(accountResult.code, "BACKEND_NOT_AVAILABLE");

    const legacyAccount = await paperExecutionBackend.getAccount(USER_ID);
    assert.equal(legacyAccount.openPaperPosition, null);
    const legacyOrders = await paperExecutionBackend.getOrders(USER_ID);
    assert.equal(legacyOrders.length, 0);
  });
});

test("legacy client Paper payload is normalized to canonical Paper identity", () => {
  const result = parseIntent({
    symbol: "BTC-USDT", chartSymbol: "BTCUSDT", venue: "bingx",
    executionExchange: "bingx", marketType: "perpetual", side: "long",
    type: "limit", size: "1", sizeUnit: "BTC", leverage: "5",
    marginMode: "isolated", reduceOnly: false, postOnly: false, price: "90",
  });
  assert.equal("intent" in result, true);
  if ("intent" in result) {
    assert.equal(result.intent.venue, "paper");
    assert.equal(result.intent.executionExchange, undefined);
  }
});

test("legacy Paper ledger records remain readable without rewriting persisted identity", () => {
  resetForUser();
  runWithPaperUser(USER_ID, () => {
    const state = getPaperState();
    state.tradeLedger.push({
      id: "legacy-trade", symbol: "BTC-USDT", venue: "bingx", marketType: "perpetual",
      side: "long", status: "closed", entryTime: "2026-01-01T00:00:00.000Z",
      entryPrice: 100, quantity: 1, notionalUsdt: 100, leverage: 5,
      marginMode: "isolated", realizedPnlUsdt: 0, unrealizedPnlUsdt: 0, feesUsdt: 0,
    });
    savePaperState(state);
    const loaded = getPaperState();
    assert.equal(loaded.tradeLedger[0]?.id, "legacy-trade");
    assert.equal(loaded.tradeLedger[0]?.venue, "bingx");
  });
});
