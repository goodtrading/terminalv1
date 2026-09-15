import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import {
  createIntentWithInitialAttempt,
  getAttemptByBrokerClientOrderId,
  getIntentByLogicalOrderUid,
  getIntentByRequestIdempotencyKey,
  listAttemptsForIntent,
  appendSubmissionAttempt,
  markSubmissionStarted,
  markSubmissionResponseObserved,
  markUnknownSubmissionOutcome,
  markReconciliationRequired,
  type CreateDurableIntentWithInitialAttemptInput,
} from "./goodTradingOrderIntentRepository";

const describePostgres = pool ? describe : describe.skip;
const migrationPath = fileURLToPath(new URL("../../../migrations/0005_goodtrading_order_intent_evidence.sql", import.meta.url));

function input(overrides: Partial<CreateDurableIntentWithInitialAttemptInput> = {}): CreateDurableIntentWithInitialAttemptInput {
  return {
    intent: {
      logicalOrderUid: "GT-ORD-00000000-0000-4000-8000-000000000101",
      goodTradingAccountUid: "GT-account-1",
      executionBroker: "BINGX",
      executionEnvironment: "LIVE",
      executionMarketInstrument: "BTC-USDT",
      executionMarketVenue: "BINGX",
      executionMarketType: "Perpetual",
      canonicalBaseAsset: "BTC",
      canonicalQuoteAsset: "USDT",
      canonicalSettlementAsset: "USDT",
      canonicalProductType: "Perpetual",
      canonicalContractStyle: "Linear",
      canonicalExpiry: null,
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
      requestIdempotencyKey: "request-101",
    },
    attempt: {
      attemptId: "GT-ATT-00000000-0000-4000-8000-000000000101",
      intentId: "GT-ORD-00000000-0000-4000-8000-000000000101",
      attemptNumber: 1,
      brokerClientOrderId: "GT-CLIENT-00000000-0000-4000-8000-000000000101",
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
    },
    ...overrides,
  };
}

describePostgres("durable GoodTrading order intent PostgreSQL evidence", () => {
  it("applies the migration and atomically creates intent plus initial attempt", async () => {
    await pool!.query(readFileSync(migrationPath, "utf8"));
    const marker = Date.now().toString(36);
    const user = await pool!.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id",
      [`d1b1-${marker}@example.test`, "d1b1-test-hash", "D1-B1 test user"],
    );
    const userId = Number(user.rows[0].id);
    let accountUid = "";
    try {
      accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
      const created = await createIntentWithInitialAttempt(input({
        intent: { ...input().intent, goodTradingAccountUid: accountUid, logicalOrderUid: `GT-ORD-${marker}-101`, requestIdempotencyKey: `request-${marker}` },
        attempt: { ...input().attempt, intentId: `GT-ORD-${marker}-101`, attemptId: `GT-ATT-${marker}-101`, brokerClientOrderId: `GT-CLIENT-${marker}-101` },
      }));
      assert.equal(created.intent.goodTradingAccountUid, accountUid);
      assert.equal(created.intent.resolvedQuantity, "0.000000123456789");
      assert.equal(created.intent.limitPrice, "65000.123456789");
      assert.equal(created.intent.postOnly, null);
      assert.equal(created.intent.reduceOnly, null);
      assert.equal(created.attempt.transportState, "PERSISTED");
      assert.equal(created.attempt.brokerOrderId, null);
      assert.equal((await getIntentByLogicalOrderUid(created.intent.logicalOrderUid))?.logicalOrderUid, created.intent.logicalOrderUid);
      assert.equal((await getIntentByRequestIdempotencyKey(accountUid, `request-${marker}`))?.logicalOrderUid, created.intent.logicalOrderUid);
      assert.equal((await getAttemptByBrokerClientOrderId(created.attempt.brokerClientOrderId))?.attemptId, created.attempt.attemptId);
      assert.equal((await listAttemptsForIntent(created.intent.logicalOrderUid)).length, 1);
    } finally {
      if (accountUid) {
        await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
        await pool!.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
      }
      await pool!.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("rejects duplicate logical UID and scoped idempotency key", async () => {
    const marker = `${Date.now().toString(36)}-dup`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "d1b1-test-hash", "D1-B1 duplicate test"]);
    const userId = Number(user.rows[0].id);
    let accountUid = "";
    try {
      accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
      const first = input({ intent: { ...input().intent, goodTradingAccountUid: accountUid, logicalOrderUid: `GT-ORD-${marker}`, requestIdempotencyKey: `idem-${marker}` }, attempt: { ...input().attempt, intentId: `GT-ORD-${marker}`, attemptId: `GT-ATT-${marker}`, brokerClientOrderId: `GT-CLIENT-${marker}` } });
      await createIntentWithInitialAttempt(first);
      await assert.rejects(() => createIntentWithInitialAttempt(first), /DUPLICATE|unique|23505/i);
      const second = input({ intent: { ...first.intent, logicalOrderUid: `GT-ORD-${marker}-second` }, attempt: { ...first.attempt, intentId: `GT-ORD-${marker}-second`, attemptId: `GT-ATT-${marker}-second`, brokerClientOrderId: `GT-CLIENT-${marker}-second` } });
      await assert.rejects(() => createIntentWithInitialAttempt(second), /DUPLICATE|unique|23505/i);
    } finally {
      if (accountUid) {
        await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
        await pool!.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
      }
      await pool!.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("rolls back the intent when initial attempt insertion fails", async () => {
    const marker = `${Date.now().toString(36)}-rollback`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "d1b1-test-hash", "D1-B1 rollback test"]);
    const userId = Number(user.rows[0].id);
    let accountUid = "";
    try {
      accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
      const first = input({ intent: { ...input().intent, goodTradingAccountUid: accountUid, logicalOrderUid: `GT-ORD-${marker}-first`, requestIdempotencyKey: `idem-${marker}-first` }, attempt: { ...input().attempt, intentId: `GT-ORD-${marker}-first`, attemptId: `GT-ATT-${marker}-first`, brokerClientOrderId: `GT-CLIENT-${marker}-shared` } });
      await createIntentWithInitialAttempt(first);
      const second = input({ intent: { ...first.intent, logicalOrderUid: `GT-ORD-${marker}-second`, requestIdempotencyKey: `idem-${marker}-second` }, attempt: { ...first.attempt, intentId: `GT-ORD-${marker}-second`, attemptId: `GT-ATT-${marker}-second` } });
      await assert.rejects(() => createIntentWithInitialAttempt(second), /DUPLICATE|unique|23505/i);
      assert.equal(await getIntentByLogicalOrderUid(second.intent.logicalOrderUid), null);
    } finally {
      if (accountUid) {
        await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
        await pool!.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
      }
      await pool!.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("appends a second attempt without changing intent ownership", async () => {
    const marker = `${Date.now().toString(36)}-attempt`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "d1b1-test-hash", "D1-B1 attempt test"]);
    const userId = Number(user.rows[0].id);
    let accountUid = "";
    try {
      accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
      const first = input({ intent: { ...input().intent, goodTradingAccountUid: accountUid, logicalOrderUid: `GT-ORD-${marker}`, requestIdempotencyKey: null }, attempt: { ...input().attempt, intentId: `GT-ORD-${marker}`, attemptId: `GT-ATT-${marker}-1`, brokerClientOrderId: `GT-CLIENT-${marker}-1` } });
      const created = await createIntentWithInitialAttempt(first);
      const second = await appendSubmissionAttempt({ ...first.attempt, intentId: created.intent.logicalOrderUid, attemptId: `GT-ATT-${marker}-2`, attemptNumber: 2, brokerClientOrderId: `GT-CLIENT-${marker}-2` });
      assert.equal(second.attemptNumber, 2);
      assert.equal((await listAttemptsForIntent(created.intent.logicalOrderUid)).length, 2);
      assert.equal((await getIntentByLogicalOrderUid(created.intent.logicalOrderUid))?.logicalOrderUid, created.intent.logicalOrderUid);
    } finally {
      if (accountUid) {
        await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
        await pool!.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
      }
      await pool!.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("commits the narrow PERSISTED to SUBMISSION_STARTED transition exactly once", async () => {
    const marker = `${Date.now().toString(36)}-started`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "d1b1-test-hash", "B2 started test"]);
    const userId = Number(user.rows[0].id);
    let accountUid = "";
    try {
      accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
      const first = input({ intent: { ...input().intent, goodTradingAccountUid: accountUid, logicalOrderUid: `GT-ORD-${marker}`, requestIdempotencyKey: `idem-${marker}` }, attempt: { ...input().attempt, intentId: `GT-ORD-${marker}`, attemptId: `GT-ATT-${marker}`, brokerClientOrderId: `GT-CLIENT-${marker}` } });
      await createIntentWithInitialAttempt(first);
      const started = await markSubmissionStarted(first.intent.logicalOrderUid);
      assert.equal(started.transportState, "SUBMISSION_STARTED");
      assert.ok(started.startedAt instanceof Date);
      await assert.rejects(() => markSubmissionStarted(first.intent.logicalOrderUid), /SUBMISSION_STARTED_TRANSITION_REJECTED/);
      const raw = await pool!.query("SELECT transport_state FROM goodtrading_order_submission_attempts WHERE intent_id = $1 AND attempt_number = 1", [first.intent.logicalOrderUid]);
      assert.equal(raw.rows[0].transport_state, "SUBMISSION_STARTED");
    } finally {
      if (accountUid) {
        await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
        await pool!.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
      }
      await pool!.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });

  it("enforces monotonic outcome transitions", async () => {
    const marker = `${Date.now().toString(36)}-outcome`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "d3b1-test-hash", "B3-B1 outcome test"]);
    const userId = Number(user.rows[0].id);
    let accountUid = "";
    try {
      accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
      const first = input({ intent: { ...input().intent, goodTradingAccountUid: accountUid, logicalOrderUid: `GT-ORD-${marker}`, requestIdempotencyKey: `idem-${marker}` }, attempt: { ...input().attempt, intentId: `GT-ORD-${marker}`, attemptId: `GT-ATT-${marker}`, brokerClientOrderId: `GT-CLIENT-${marker}` } });
      await createIntentWithInitialAttempt(first);
      await markSubmissionStarted(first.intent.logicalOrderUid);
      const unknown = await markUnknownSubmissionOutcome(first.intent.logicalOrderUid, { errorCode: "BINGX_TIMEOUT", errorClass: "BingXApiError" });
      assert.equal(unknown.transportState, "UNKNOWN_SUBMISSION_OUTCOME");
      const required = await markReconciliationRequired(first.intent.logicalOrderUid);
      assert.equal(required.transportState, "RECONCILIATION_REQUIRED");
      await assert.rejects(() => markUnknownSubmissionOutcome(first.intent.logicalOrderUid, { errorCode: "AGAIN", errorClass: "Error" }), /UNKNOWN_SUBMISSION_OUTCOME_TRANSITION_REJECTED/);
      await assert.rejects(() => markSubmissionStarted(first.intent.logicalOrderUid), /SUBMISSION_STARTED_TRANSITION_REJECTED/);
      await assert.rejects(() => markSubmissionResponseObserved(first.intent.logicalOrderUid, {}), /SUBMISSION_RESPONSE_OBSERVED_TRANSITION_REJECTED/);
    } finally {
      if (accountUid) {
        await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
        await pool!.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
      }
      await pool!.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
      await pool!.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  });
});