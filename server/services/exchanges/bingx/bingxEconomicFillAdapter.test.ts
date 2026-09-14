import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptBingXEconomicFill,
  bingXEconomicFillPolicies,
  deduplicateBingXEconomicFills,
} from "./bingxEconomicFillAdapter";
import { buildBingXAccountIdentity, buildBingXMarketIdentity } from "./bingxCanonicalIdentity";
import type { PrivateFillRow } from "../../../integrations/bingx/account/normalizers";

const account = buildBingXAccountIdentity({
  goodTradingAccountId: "GT-TEST-001",
  sourceEnvironment: "LIVE",
  brokerAccountId: "bingx-native-1",
  baseCurrency: "USDT",
  source: "fixture",
});
const market = buildBingXMarketIdentity({
  brokerSymbol: "BTC-USDT",
  sourceMarketType: "Perpetual",
  canonicalInstrument: "BTCUSDT",
  source: "fixture",
  sourceEndpoint: "/openApi/swap/v2/trade/allFillOrders",
});
assert.equal(account.ok, true);
assert.equal(market.ok, true);
if (!account.ok || !market.ok) throw new Error("invalid identity fixtures");

function row(overrides: Partial<PrivateFillRow> = {}, truthOverrides: Partial<PrivateFillRow["privateTruth"]> = {}): PrivateFillRow {
  return {
    fillId: "public-fill",
    orderRef: "public-order",
    accountId: "GT-TEST-001",
    symbol: "BTC-USDT",
    side: "buy",
    price: 100,
    quantity: 2,
    fee: 0,
    feeAsset: "USDT",
    timestamp: "2023-11-14T22:13:20.000Z",
    accountMode: "REAL_BINGX_READ_ONLY",
    source: "BINGX_ACCOUNT_READ_ONLY",
    exchangeFillId: "fill-1",
    exchangeOrderId: "order-1",
    privateTruth: {
      sourceFillId: "fill-1",
      sourceOrderId: "order-1",
      fillIdBasis: "FILL_ID",
      sourceTimestamp: "2023-11-14T22:13:20.000Z",
      timestampOrigin: "BROKER",
      quantitySource: "qty",
      quantitySemantics: "INDIVIDUAL_EXECUTION",
      priceSource: "price",
      feePresent: true,
      feeAssetPresent: true,
      ...truthOverrides,
    },
    ...overrides,
  };
}

function adapted(input: PrivateFillRow = row()): ReturnType<typeof adaptBingXEconomicFill> & { ok: true } {
  const result = adaptBingXEconomicFill(input, account, market);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

test("preserves GoodTrading UID and keeps broker identity as provenance", () => {
  const result = adapted();
  assert.equal(result.record.accountIdentity.accountId, "GT-TEST-001");
  assert.notEqual(result.record.accountIdentity.accountId, "bingx-native-1");
  assert.equal(result.record.provenance.upstream?.brokerLinkBasis, "BROKER_ACCOUNT_ID");
  assert.equal((result.record.provenance.upstream as Record<string, unknown>).brokerAccountId, "bingx-native-1");
});

test("preserves explicit canonical Perpetual market and validates broker symbol", () => {
  const result = adapted();
  assert.deepEqual(result.record.marketIdentity, { instrument: "BTCUSDT", venue: "BINGX", marketType: "Perpetual" });
  const mismatch = adaptBingXEconomicFill(row({ symbol: "ETH-USDT" }), account, market);
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "MARKET_SYMBOL_MISMATCH");
});

test("accepts only factual FILL_ID and TRADE_ID execution identity", () => {
  assert.equal(adapted().record.executionId, "fill-1");
  const trade = adapted(row({ exchangeFillId: "trade-1" }, {
    sourceFillId: undefined,
    sourceTradeId: "trade-1",
    fillIdBasis: "TRADE_ID",
  }));
  assert.equal(trade.record.executionId, "trade-1");
  for (const fillIdBasis of ["GENERIC_ID", "ORDER_ID_FALLBACK", "MISSING"] as const) {
    const candidate = row({}, {
      sourceFillId: undefined,
      sourceTradeId: undefined,
      sourceGenericId: fillIdBasis === "GENERIC_ID" ? "generic-1" : undefined,
      sourceOrderId: fillIdBasis === "ORDER_ID_FALLBACK" ? "order-1" : undefined,
      fillIdBasis,
    });
    const outcome = adaptBingXEconomicFill(candidate, account, market);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.code, "UNSAFE_EXECUTION_IDENTITY");
  }
});

test("proves multiple executions of one broker order remain distinct", () => {
  const first = adapted(row({ exchangeFillId: "fill-a", exchangeOrderId: "same-order" }, { sourceFillId: "fill-a", sourceOrderId: "same-order" }));
  const second = adapted(row({ exchangeFillId: "fill-b", exchangeOrderId: "same-order" }, { sourceFillId: "fill-b", sourceOrderId: "same-order" }));
  assert.notEqual(first.record.executionId, second.record.executionId);
  assert.equal(first.record.orderReferences?.venueOrderId, "same-order");
  assert.equal(second.record.orderReferences?.venueOrderId, "same-order");
});

test("uses factual side, quantity, price and broker event time only", () => {
  const buy = adapted();
  assert.equal(buy.record.side, "BUY");
  assert.equal(buy.record.quantity, 2);
  assert.equal(buy.record.price, 100);
  assert.equal(buy.record.eventTime, 1_700_000_000_000);
  const sell = adapted(row({ side: "sell", quantity: 3, price: 101 }));
  assert.equal(sell.record.side, "SELL");
  assert.equal(sell.record.quantity, 3);
  assert.equal(sell.record.price, 101);
  assert.equal(adapted(row()).record.receiveTime, undefined);
});

test("rejects unknown quantity semantics, unsafe price aliases and local timestamps", () => {
  for (const quantitySource of ["filledQty", "volume", undefined]) {
    const result = adaptBingXEconomicFill(row(), account, market);
    const candidate = row({}, { quantitySource, quantitySemantics: "UNKNOWN" });
    const rejected = adaptBingXEconomicFill(candidate, account, market);
    assert.equal(result.ok, true);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "BLOCKED_FILL_QUANTITY_SEMANTICS");
  }
  const unsafePrice = adaptBingXEconomicFill(row(), account, market);
  const unsafePriceRow = row({}, { priceSource: "avgPrice" });
  assert.equal(unsafePrice.ok, true);
  const rejectedPrice = adaptBingXEconomicFill(unsafePriceRow, account, market);
  assert.equal(rejectedPrice.ok, false);
  if (!rejectedPrice.ok) assert.equal(rejectedPrice.code, "UNSAFE_PRICE_SEMANTICS");
  const local = adaptBingXEconomicFill(row(), account, market);
  const localRow = row({}, { timestampOrigin: "LOCAL_FALLBACK", sourceTimestamp: undefined });
  assert.equal(local.ok, true);
  const rejectedTime = adaptBingXEconomicFill(localRow, account, market);
  assert.equal(rejectedTime.ok, false);
  if (!rejectedTime.ok) assert.equal(rejectedTime.code, "MISSING_BROKER_EVENT_TIME");
});

test("preserves factual fee zero/nonzero and never defaults fee asset", () => {
  assert.equal(adapted().record.fee?.value, 0);
  assert.equal(adapted(row({ fee: 1.25 })).record.fee?.value, 1.25);
  const absent = adapted(row({ fee: undefined, feeAsset: undefined }, { feePresent: false, feeAssetPresent: false }));
  assert.equal(absent.record.fee, undefined);
  const noAsset = adapted(row({ fee: 1 }, { feeAssetPresent: false }));
  assert.equal(noAsset.record.fee?.value, 1);
  assert.equal(noAsset.record.fee?.currency, null);
});

test("does not infer liquidity, slippage, accounting or order state", () => {
  const record = adapted().record;
  assert.equal(record.liquidityRole, "UNKNOWN");
  assert.equal(record.slippage, undefined);
  assert.equal("realizedPnl" in record, false);
  assert.equal("balance" in record, false);
  assert.equal("status" in record, false);
});

test("detects exact duplicate and conflicting execution facts without last-write-wins", () => {
  const first = adapted().record;
  const duplicate = adapted().record;
  const conflict = adapted(row({ price: 101 })).record;
  const result = deduplicateBingXEconomicFills([first, duplicate, conflict]);
  assert.deepEqual(result.duplicateExecutionIds, ["fill-1"]);
  assert.deepEqual(result.conflictingExecutionIds, ["fill-1"]);
  assert.equal(result.records.length, 1);
});

test("is deterministic, defensive, and documents the read-only policies", () => {
  const input = row();
  const first = adapted(input).record;
  const second = adapted(input).record;
  assert.deepEqual(first, second);
  assert.equal(bingXEconomicFillPolicies.executionId, "BINGX_EXECUTION_ID_V1");
  assert.equal(bingXEconomicFillPolicies.eventId, "BINGX_FILL_EVENT_V1");
  assert.equal(bingXEconomicFillPolicies.sourceEndpoint, "/openApi/swap/v2/trade/allFillOrders");
  assert.equal(input.quantity, 2);
  assert.equal(input.privateTruth.quantitySemantics, "INDIVIDUAL_EXECUTION");
});
