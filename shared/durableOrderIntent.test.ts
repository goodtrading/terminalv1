import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDurableGoodTradingOrderIntent,
  createDurableSubmissionAttempt,
  type DurableGoodTradingOrderIntentInput,
  type DurableSubmissionAttemptInput,
} from "./durableOrderIntent";

const canonical = {
  canonicalBaseAsset: "BTC",
  canonicalQuoteAsset: "USDT",
  canonicalSettlementAsset: "USDT",
  canonicalProductType: "Perpetual" as const,
  canonicalContractStyle: "Linear" as const,
  canonicalExpiry: null,
};

const intentInput: DurableGoodTradingOrderIntentInput = {
  logicalOrderUid: "GT-ORD-00000000-0000-4000-8000-000000000001",
  goodTradingAccountUid: "GT-account-1",
  executionBroker: "BINGX",
  executionEnvironment: "LIVE",
  executionMarketInstrument: "BTC-USDT",
  executionMarketVenue: "BINGX",
  executionMarketType: "Perpetual",
  ...canonical,
  sourceNativeSymbol: "BTC-USDT",
  sourceNativeInstrumentId: null,
  marketMetadataSource: "server-owned-v1-registry",
  marketMappingPolicy: "EXACT_V1_REGISTRY",
  requestedSide: "buy",
  orderType: "LIMIT",
  requestedSize: "0.000000123456789",
  requestedSizeUnit: "BTC",
  requestedSizingMode: "quantity",
  resolvedQuantity: "0.000000123456789",
  resolvedQuantityUnit: "BTC",
  limitPrice: "65000.123456789",
  stopLossPrice: "64000.000000001",
  takeProfitPrice: null,
  timeInForce: null,
  postOnly: null,
  reduceOnly: null,
  requestIdempotencyKey: "request-1",
};

const attemptInput: DurableSubmissionAttemptInput = {
  attemptId: "GT-ATT-00000000-0000-4000-8000-000000000001",
  intentId: intentInput.logicalOrderUid,
  attemptNumber: 1,
  brokerClientOrderId: "GT-CLIENT-00000000-0000-4000-8000-000000000001",
  submittedQuantity: null,
  transportState: "PERSISTED",
  startedAt: null,
  responseAt: null,
  outcomeAt: null,
  reconciliationRequiredAt: null,
  brokerOrderId: null,
  rawBrokerStatus: null,
  httpStatus: null,
  errorCode: null,
  errorClass: null,
};

test("durable intent preserves explicit snapshots and high precision strings", () => {
  const intent = createDurableGoodTradingOrderIntent(intentInput);
  assert.deepEqual(intent, intentInput);
  assert.equal(intent.timeInForce, null);
  assert.equal(intent.postOnly, null);
  assert.equal(intent.reduceOnly, null);
  assert.equal(intent.resolvedQuantity, "0.000000123456789");
  assert.equal(intent.limitPrice, "65000.123456789");
});

test("durable intent rejects non-LIMIT V1 order types", () => {
  assert.throws(
    () => createDurableGoodTradingOrderIntent({ ...intentInput, orderType: "MARKET" as never }),
    /orderType must be LIMIT/,
  );
});

test("durable intent requires Perpetual contract style and preserves Spot null style", () => {
  assert.throws(
    () => createDurableGoodTradingOrderIntent({ ...intentInput, canonicalContractStyle: null, canonicalProductType: "Perpetual" }),
    /canonicalContractStyle is required/,
  );
  const spot = createDurableGoodTradingOrderIntent({
    ...intentInput,
    executionMarketType: "Spot",
    canonicalProductType: "Spot",
    canonicalContractStyle: null,
    canonicalExpiry: null,
  });
  assert.equal(spot.canonicalContractStyle, null);
});

test("durable intent preserves tri-state flags and unspecified TIF", () => {
  for (const value of [null, false, true] as const) {
    assert.equal(createDurableGoodTradingOrderIntent({ ...intentInput, postOnly: value }).postOnly, value);
    assert.equal(createDurableGoodTradingOrderIntent({ ...intentInput, reduceOnly: value }).reduceOnly, value);
  }
  assert.equal(createDurableGoodTradingOrderIntent({ ...intentInput, timeInForce: null }).timeInForce, null);
  assert.equal(createDurableGoodTradingOrderIntent({ ...intentInput, timeInForce: "IOC" }).timeInForce, "IOC");
});

test("submission attempt has an independent transport state and rejects lifecycle states", () => {
  const attempt = createDurableSubmissionAttempt(attemptInput);
  assert.equal(attempt.transportState, "PERSISTED");
  assert.throws(
    () => createDurableSubmissionAttempt({ ...attemptInput, transportState: "ACCEPTED" as never }),
    /transportState is invalid/,
  );
  assert.throws(
    () => createDurableSubmissionAttempt({ ...attemptInput, attemptNumber: 0 }),
    /attemptNumber must be >= 1/,
  );
});

test("logical order UID and broker client ID remain distinct", () => {
  const intent = createDurableGoodTradingOrderIntent(intentInput);
  const attempt = createDurableSubmissionAttempt(attemptInput);
  assert.notEqual(intent.logicalOrderUid, attempt.brokerClientOrderId);
  assert.notEqual(intent.logicalOrderUid, attempt.attemptId);
});
