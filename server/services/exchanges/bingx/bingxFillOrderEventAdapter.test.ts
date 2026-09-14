import assert from "node:assert/strict";
import test from "node:test";
import { createEconomicFill, type EconomicFillRecord } from "../../../../shared/economicFill";
import type { CanonicalOrderEventRecord } from "../../../../shared/orderEventStream";
import { buildBingXAccountIdentity, buildBingXMarketIdentity } from "./bingxCanonicalIdentity";
import {
  BINGX_BROKER_ORDER_ID_POLICY,
  buildBingXOrderIdentity,
} from "./bingxOrderIdentityAdapter";
import {
  adaptBingXFillToOrderEvent,
  BINGX_FILL_EVENT_POLICY,
  createBingXFillEventStream,
} from "./bingxFillOrderEventAdapter";

const accountResult = buildBingXAccountIdentity({
  goodTradingAccountId: "GT-TEST-001",
  sourceEnvironment: "LIVE",
  brokerAccountId: "bingx-native-1",
  baseCurrency: "USDT",
  source: "fixture",
});
const marketResult = buildBingXMarketIdentity({
  brokerSymbol: "BTC-USDT",
  sourceMarketType: "Perpetual",
  canonicalInstrument: "BTCUSDT",
  source: "fixture",
});
assert.equal(accountResult.ok, true);
assert.equal(marketResult.ok, true);
if (!accountResult.ok || !marketResult.ok) throw new Error("invalid identity fixtures");
const account = accountResult.identity;
const market = marketResult.identity;

function fill(overrides: Partial<EconomicFillRecord> = {}): EconomicFillRecord {
  const executionId = overrides.executionId ?? "trade-1";
  const orderReferences = overrides.orderReferences ?? { venueOrderId: "order-1" };
  return createEconomicFill({
    executionId,
    accountIdentity: account,
    marketIdentity: market,
    side: "BUY",
    quantity: 1,
    price: 100,
    fee: { value: 0, currency: "USDT", quality: "VALID", provenance: { source: "BINGX_ACCOUNT_READ_ONLY" } },
    liquidityRole: "UNKNOWN",
    eventTime: 1_700_000_000_000,
    orderReferences,
    provenance: {
      source: "BINGX_ACCOUNT_READ_ONLY",
      broker: "BINGX",
      executionId,
      marketIdentity: market,
      venueOrderId: orderReferences.venueOrderId,
      upstream: { endpoint: "/openApi/swap/v2/trade/allFillOrders" },
    },
    ...overrides,
    provenance: {
      source: "BINGX_ACCOUNT_READ_ONLY",
      broker: "BINGX",
      executionId,
      marketIdentity: market,
      venueOrderId: orderReferences.venueOrderId,
      upstream: { endpoint: "/openApi/swap/v2/trade/allFillOrders" },
      ...(overrides.provenance ?? {}),
      executionId,
      venueOrderId: orderReferences.venueOrderId,
    },
  });
}

function eventRecord(input: EconomicFillRecord = fill()): CanonicalOrderEventRecord {
  const result = adaptBingXFillToOrderEvent(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.record;
}

test("builds canonical order identity from factual broker order ID", () => {
  const result = buildBingXOrderIdentity({ account, market, brokerOrderId: "order-native-1", clientOrderId: "client-1" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.canonicalOrderId, "order-native-1");
  assert.equal(result.identity.venueOrderId, "order-native-1");
  assert.equal(result.identity.clientOrderId, "client-1");
  assert.equal(result.identity.account.accountId, "GT-TEST-001");
  assert.equal(result.provenance.canonicalOrderIdPolicy, BINGX_BROKER_ORDER_ID_POLICY);
});

test("rejects missing broker ID and never substitutes public/client identifiers", () => {
  for (const brokerOrderId of [undefined, "", "   "]) {
    const result = buildBingXOrderIdentity({ account, market, brokerOrderId, clientOrderId: "client-only" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "BROKER_ORDER_ID_REQUIRED");
  }
  const result = buildBingXOrderIdentity({ account, market, brokerOrderId: "order-native", clientOrderId: "client-native" });
  assert.equal(result.ok, true);
  if (result.ok) assert.notEqual(result.identity.canonicalOrderId, result.identity.clientOrderId);
});

test("requires LIVE BINGX and explicit Perpetual scope", () => {
  const paper = buildBingXOrderIdentity({ account: { ...account, environment: "PAPER" }, market, brokerOrderId: "o" });
  assert.equal(paper.ok, false);
  const spot = buildBingXOrderIdentity({ account, market: { ...market, marketType: "Spot" }, brokerOrderId: "o" });
  assert.equal(spot.ok, false);
  const otherVenue = buildBingXOrderIdentity({ account, market: { ...market, venue: "Other" }, brokerOrderId: "o" });
  assert.equal(otherVenue.ok, false);
});

test("maps one validated EconomicFill to exactly one execution-backed FILL event", () => {
  const result = adaptBingXFillToOrderEvent(fill());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.record.event.eventType, "FILL");
  assert.equal(result.record.evidence.origin, "EXECUTION_EVENT");
  assert.equal(result.record.evidence.eventIdOrigin, "DETERMINISTIC_DERIVED");
  assert.equal(result.record.event.orderIdentity.canonicalOrderId, "order-1");
  assert.equal(result.record.event.orderIdentity.venueOrderId, "order-1");
  assert.equal(result.record.event.orderIdentity.account.accountId, "GT-TEST-001");
  assert.equal(result.record.event.eventTime, 1_700_000_000_000);
  assert.equal(result.record.event.executionReference?.executionId, "trade-1");
  assert.equal(result.record.event.executionReference?.eventTime, 1_700_000_000_000);
  assert.equal(result.record.event.statusAfter, undefined);
  assert.equal(result.record.event.reason, undefined);
});

test("uses deterministic event identity and never emits lifecycle backfill", () => {
  const first = eventRecord(fill({ executionId: "trade-a" }));
  const second = eventRecord(fill({ executionId: "trade-a" }));
  assert.equal(first.event.eventId, `${BINGX_FILL_EVENT_POLICY}:trade-a`);
  assert.deepEqual(first, second);
  assert.equal(first.event.eventType, "FILL");
  assert.equal(first.event.statusBefore, undefined);
  assert.equal(first.event.statusAfter, undefined);
  assert.equal("OrderState" in first, false);
  assert.equal("OrderIntent" in first, false);
});

test("requires venue order reference and matching account/market scope", () => {
  const missing = adaptBingXFillToOrderEvent(fill({ orderReferences: undefined }));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "ORDER_REFERENCE_REQUIRED");
  const otherAccount = adaptBingXFillToOrderEvent(fill({ accountIdentity: { ...account, accountId: "GT-OTHER" } }));
  assert.equal(otherAccount.ok, true);
  const otherMarket = adaptBingXFillToOrderEvent(fill({ marketIdentity: { ...market, instrument: "ETHUSDT" }, orderReferences: { venueOrderId: "order-1" }, provenance: { ...fill().provenance, marketIdentity: { ...market, instrument: "ETHUSDT" } } }));
  assert.equal(otherMarket.ok, true);
});

test("keeps multiple fills under one order and separates different orders", () => {
  const first = eventRecord(fill({ executionId: "trade-a" }));
  const second = eventRecord(fill({ executionId: "trade-b" }));
  const differentOrder = eventRecord(fill({ executionId: "trade-c", orderReferences: { venueOrderId: "order-2" }, provenance: { ...fill().provenance, executionId: "trade-c", venueOrderId: "order-2" } }));
  assert.equal(first.event.orderIdentity.canonicalOrderId, second.event.orderIdentity.canonicalOrderId);
  assert.notEqual(first.event.eventId, second.event.eventId);
  assert.notEqual(first.event.orderIdentity.canonicalOrderId, differentOrder.event.orderIdentity.canonicalOrderId);
  const stream = createBingXFillEventStream(first.event.orderIdentity, [first, second]);
  assert.equal(stream.events.length, 2);
  assert.equal(stream.events.every((record) => record.event.eventType === "FILL"), true);
  assert.equal(stream.completeness, "PARTIAL");
  assert.equal(stream.quality, "PARTIAL");
});

test("scopes same broker order ID by account and market", () => {
  const otherAccount = { ...account, accountId: "GT-OTHER" };
  const otherMarket = { ...market, instrument: "ETHUSDT" };
  const a = buildBingXOrderIdentity({ account, market, brokerOrderId: "same-native-order" });
  const b = buildBingXOrderIdentity({ account: otherAccount, market, brokerOrderId: "same-native-order" });
  const c = buildBingXOrderIdentity({ account, market: otherMarket, brokerOrderId: "same-native-order" });
  assert.equal(a.ok && b.ok && c.ok, true);
  if (a.ok && b.ok && c.ok) {
    assert.notDeepEqual(a.identity, b.identity);
    assert.notDeepEqual(a.identity, c.identity);
  }
});

test("handles duplicate and conflicting execution evidence without last-write-wins", () => {
  const first = eventRecord(fill({ executionId: "trade-dup" }));
  const duplicate = eventRecord(fill({ executionId: "trade-dup" }));
  const conflict = eventRecord(fill({ executionId: "trade-dup", price: 101 }));
  const stream = createBingXFillEventStream(first.event.orderIdentity, [first, duplicate, conflict]);
  assert.deepEqual(stream.consistency.duplicateEventIds, [first.event.eventId]);
  assert.deepEqual(stream.consistency.conflictingEventIds, [first.event.eventId]);
  assert.equal(stream.consistency.issues.includes("DUPLICATE_EVENT"), true);
  assert.equal(stream.consistency.issues.includes("CONFLICTING_EVENT"), true);
  assert.equal(stream.events.length, 3);
});

test("does not mutate EconomicFill input", () => {
  const input = fill();
  const before = JSON.stringify(input);
  const result = adaptBingXFillToOrderEvent(input);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(input), before);
});
