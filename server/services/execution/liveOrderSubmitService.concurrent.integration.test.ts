import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { getIntentByRequestIdempotencyKey } from "../orders/goodTradingOrderIntentRepository";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";

const describePostgres = pool ? describe : describe.skip;
const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 });

const readiness = { status: "ready_for_live" as const, exchange: "bingx" as const, liveTradingEnabled: true, apiTradingEnabled: true, orderSubmitEnabled: true, orderCancelEnabled: false, positionCloseEnabled: false, marketOrdersAllowed: false, killSwitchActive: false, checks: [], blockers: [], warnings: [], readyForDryRun: true, readyForLive: true, readOnlyFreezeActive: false };
const preview = { mode: "dry_run" as const, exchange: "bingx" as const, symbol: "BTC-USDT", side: "buy" as const, type: "limit" as const, orderWouldBeSent: false as const, tradingLocked: true, validated: true, blocked: false, blockers: [], warnings: [], estimate: { entryPrice: 65000, quantity: 0.001, notionalUsdt: 65 } };
function request(key: string) { return { exchange: "bingx" as const, symbol: "BTC-USDT", side: "buy" as const, type: "limit" as const, quantity: 0.001, limitPrice: 64000, stopLossPrice: 63000, leverage: 5, reduceOnly: false, requestIdempotencyKey: key, confirmationText: LIVE_LIMIT_CONFIRMATION_TEXT }; }

async function cleanup(client: pg.PoolClient, userId: number, accountUid: string) {
  await client.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
  await client.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
  await client.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM users WHERE id = $1", [userId]);
}

describePostgres("isolated concurrent live submit idempotency", () => {
  it("allows the database unique constraint to choose one same-key winner", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-b2t-concurrent`;
    const userRow = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "integration-hash", "B2T concurrent"]);
    const userId = Number(userRow.rows[0].id);
    const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
    const observer = await observerPool.connect();
    await observer.query("SET statement_timeout = 10000");
    const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService");
    const key = `key-${marker}`;
    let preReads = 0;
    let releaseRace: (() => void) | undefined;
    const bothPreReads = new Promise<void>((resolve) => { releaseRace = resolve; });
    let brokerCalls = 0;
    const brokerClientIds: string[] = [];
    const existing = async (account: string, idemKey: string) => {
      const found = await getIntentByRequestIdempotencyKey(account, idemKey);
      if (!found) {
        preReads += 1;
        if (preReads === 2) releaseRace!();
        await bothPreReads;
      }
      return found;
    };
    const listAttempts = async (intentId: string) => {
      const r = await observer.query("SELECT id, intent_id, attempt_number, broker_client_order_id, submitted_quantity, transport_state, started_at, response_at, outcome_at, reconciliation_required_at, broker_order_id, raw_broker_status, http_status, error_code, error_class FROM goodtrading_order_submission_attempts WHERE intent_id = $1 ORDER BY attempt_number", [intentId]);
      return r.rows.map((row) => ({ attemptId: String(row.id), intentId: String(row.intent_id), attemptNumber: Number(row.attempt_number), brokerClientOrderId: String(row.broker_client_order_id), submittedQuantity: row.submitted_quantity == null ? null : String(row.submitted_quantity), transportState: row.transport_state, startedAt: row.started_at, responseAt: row.response_at, outcomeAt: row.outcome_at, reconciliationRequiredAt: row.reconciliation_required_at, brokerOrderId: row.broker_order_id, rawBrokerStatus: row.raw_broker_status, httpStatus: row.http_status, errorCode: row.error_code, errorClass: row.error_class } as any));
    };
    const deps = {
      getReadiness: async () => readiness,
      previewOrder: async () => preview,
      getConnection: () => ({ id: "integration-connection", readOnly: false, connectionMode: "live", tradingPermissionConfirmed: true }),
      getCredentials: () => ({ apiKey: "integration-key", secretKey: "integration-secret" }),
      getSymbolRules: async () => ({ symbol: "BTC-USDT", minQty: 0.0001, maxQty: 100, stepSize: 0.0001, quantityPrecision: 4, pricePrecision: 2, minNotional: 5 }),
      getExistingIntent: existing,
      listIntentAttempts: listAttempts,
      submitOrder: async (params: any) => { brokerCalls += 1; brokerClientIds.push(params.clientOrderId); return { orderId: "mock-order", clientOrderId: params.clientOrderId, protectiveSlAttached: false }; },
    };
    try {
      const results = await Promise.allSettled([
        submitBingXLiveLimitOrder(userId, request(key), deps),
        submitBingXLiveLimitOrder(userId, request(key), deps),
      ]);
      assert.equal(preReads, 2);
      assert.equal(results.every((r) => r.status === "fulfilled"), true);
      const durable = await observer.query("SELECT i.logical_order_uid, a.attempt_number, a.broker_client_order_id, a.transport_state FROM goodtrading_order_intents i JOIN goodtrading_order_submission_attempts a ON a.intent_id = i.id WHERE i.goodtrading_account_uid = $1 AND i.request_idempotency_key = $2", [accountUid, key]);
      assert.equal(durable.rows.length, 1);
      assert.equal(durable.rows[0].attempt_number, 1);
      assert.equal(durable.rows[0].transport_state, "SUBMISSION_STARTED");
      assert.ok(brokerCalls <= 1);
      assert.equal(brokerCalls, 1);
      assert.equal(brokerClientIds.length, 1);
      assert.equal(durable.rows[0].broker_client_order_id, brokerClientIds[0]);
      const counts = await observer.query("SELECT COUNT(*)::int AS count FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1 AND request_idempotency_key = $2", [accountUid, key]);
      assert.equal(counts.rows[0].count, 1);
    } finally {
      await cleanup(observer, userId, accountUid);
      observer.release();
    }
  });
});
