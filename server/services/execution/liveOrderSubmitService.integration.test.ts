import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import pg from "pg";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import {
  getIntentByRequestIdempotencyKey,
  listAttemptsForIntent,
} from "../orders/goodTradingOrderIntentRepository";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";

process.env.BINGX_READ_ONLY_FREEZE = "false";
process.env.BINGX_ENABLE_LIVE_TRADING = "true";
process.env.BINGX_ENABLE_API_TRADING = "true";
process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
process.env.BINGX_LIVE_LIMIT_TEST_MODE = "true";

const describePostgres = pool ? describe : describe.skip;
function makeObserverPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}

const readiness = {
  status: "ready_for_live" as const,
  exchange: "bingx" as const,
  liveTradingEnabled: true,
  apiTradingEnabled: true,
  orderSubmitEnabled: true,
  orderCancelEnabled: false,
  positionCloseEnabled: false,
  marketOrdersAllowed: false,
  killSwitchActive: false,
  checks: [],
  blockers: [],
  warnings: [],
  readyForDryRun: true,
  readyForLive: true,
  readOnlyFreezeActive: false,
};

const preview = {
  mode: "dry_run" as const,
  exchange: "bingx" as const,
  symbol: "BTC-USDT",
  side: "buy" as const,
  type: "limit" as const,
  orderWouldBeSent: false as const,
  tradingLocked: true,
  validated: true,
  blocked: false,
  blockers: [],
  warnings: [],
  estimate: { entryPrice: 65000, quantity: 0.001, notionalUsdt: 65 },
};

function request(key: string) {
  return {
    exchange: "bingx" as const,
    symbol: "BTC-USDT",
    side: "buy" as const,
    type: "limit" as const,
    quantity: 0.001,
    limitPrice: 64000,
    stopLossPrice: 63000,
    leverage: 5,
    reduceOnly: false,
    requestIdempotencyKey: key,
    confirmationText: LIVE_LIMIT_CONFIRMATION_TEXT,
  };
}

function dependencies(onBroker: (params: any) => Promise<any> | any, overrides: any = {}) {
  return {
    getReadiness: async () => readiness,
    previewOrder: async () => preview,
    getConnection: () => ({ id: "integration-connection", readOnly: false, connectionMode: "live", tradingPermissionConfirmed: true }),
    getCredentials: () => ({ apiKey: "integration-key", secretKey: "integration-secret" }),
    getSymbolRules: async () => ({ symbol: "BTC-USDT", minQty: 0.0001, maxQty: 100, stepSize: 0.0001, quantityPrecision: 4, pricePrecision: 2, minNotional: 5 }),
    submitOrder: onBroker,
    ...overrides,
  };
}

async function rows(accountUid: string, key: string) {
  const intent = await getIntentByRequestIdempotencyKey(accountUid, key);
  const attempts = intent ? await listAttemptsForIntent(intent.logicalOrderUid) : [];
  return { intent, attempts };
}

async function cleanupWithClient(client: pg.PoolClient, userId: number, accountUid: string) {
  await client.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
  await client.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
  await client.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM users WHERE id = $1", [userId]);
}

async function cleanup(userId: number, accountUid: string) {
  const cleanupPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await cleanupPool.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1)", [accountUid]);
    await cleanupPool.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1", [accountUid]);
    await cleanupPool.query("DELETE FROM goodtrading_accounts WHERE user_id = $1", [userId]);
    await cleanupPool.query("DELETE FROM users WHERE id = $1", [userId]);
  } finally {
    await cleanupPool.end();
  }
}

describePostgres("productive live submit durability integration", () => {
  it("commits durable evidence before the mock broker and preserves exact semantics", { timeout: 30000 }, async () => {
    const marker = `${Date.now()}-b2t-ordering`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "integration-hash", "B2T ordering"]);
    const userId = Number(user.rows[0].id);
    const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
    const testObserverPool = makeObserverPool();
    const observer = await testObserverPool.connect();
    await observer.query("SET statement_timeout = 3000");
    const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService");
    const events: string[] = [];
    let brokerCalls = 0;
    let observed: any;

    try {
      const result = await submitBingXLiveLimitOrder(
        userId,
        request(`key-${marker}`),
        dependencies(async (params) => {
          brokerCalls += 1;
          assert.ok(testObserverPool);
          const durableResult = await observer.query(
            `SELECT i.time_in_force, i.post_only, i.reduce_only,
                    a.attempt_number, a.transport_state,
                    a.broker_client_order_id, a.submitted_quantity
               FROM goodtrading_order_intents i
               JOIN goodtrading_order_submission_attempts a ON a.intent_id = i.id
              WHERE i.goodtrading_account_uid = $1
                AND i.request_idempotency_key = $2`,
            [accountUid, `key-${marker}`],
          );
          assert.equal(durableResult.rows.length, 1);
          const durable = durableResult.rows[0];
          assert.equal(durable.attempt_number, 1);
          assert.equal(durable.transport_state, "SUBMISSION_STARTED");
          assert.equal(durable.broker_client_order_id, params.clientOrderId);
          assert.equal(durable.submitted_quantity, String(params.submittedQuantity));
          assert.equal(durable.time_in_force, "GTC");
          assert.equal(durable.post_only, false);
          assert.equal(durable.reduce_only, false);
          events.push("BROKER_CALLED");
          observed = { durable, params };
          return { orderId: "mock-order", clientOrderId: params.clientOrderId, protectiveSlAttached: false };
        }),
      );
      assert.equal(result.orderSubmitted, true);
      assert.equal(result.status, "submitted");
      assert.equal(brokerCalls, 1);
      assert.deepEqual(events, ["BROKER_CALLED"]);
      assert.equal(observed.durable.broker_client_order_id, observed.params.clientOrderId);
    } finally {
      await cleanupWithClient(observer, userId, accountUid);
      observer.release();
      await testObserverPool.end();
    }
  });

  it("reuses the durable correlation for sequential same-key replay", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-b2t-idem`;
    const user = await pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "integration-hash", "B2T idempotency"]);
    const userId = Number(user.rows[0].id);
    const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
    const testObserverPool = makeObserverPool();
    const observer = await testObserverPool.connect();
    await observer.query("SET statement_timeout = 3000");
    const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService");
    const key = `key-${marker}`;
    let brokerCalls = 0;

    try {
      const submit = (label: string) => {
        return submitBingXLiveLimitOrder(userId, request(key), dependencies(async (params) => {
          brokerCalls += 1;
          return { orderId: "mock-order", clientOrderId: params.clientOrderId, protectiveSlAttached: false };
        }, {
          getExistingIntent: async (account: string, idemKey: string) => {
            const found = await getIntentByRequestIdempotencyKey(account, idemKey);
            return found;
          },
          listIntentAttempts: listAttemptsForIntent,
        }));
      };
      const first = await submit("FIRST_CALL");
      assert.equal(first.orderSubmitted, true);
      const beforeReplay = brokerCalls;
      const replay = await submit("SECOND_CALL");
      const durableResult = await observer.query("SELECT i.id, a.attempt_number FROM goodtrading_order_intents i JOIN goodtrading_order_submission_attempts a ON a.intent_id = i.id WHERE i.goodtrading_account_uid = $1 AND i.request_idempotency_key = $2", [accountUid, key]);
      const durable = { intent: durableResult.rows[0] ?? null, attempts: durableResult.rows.map((row) => ({ attemptNumber: Number(row.attempt_number) })) };
      assert.equal(brokerCalls, beforeReplay);
      assert.equal(durable.intent ? 1 : 0, 1);
      assert.equal(durable.attempts.length, 1);
      assert.equal(brokerCalls, 1);
      assert.equal(replay.idempotentReplay, true);
      assert.equal(replay.orderSubmitted, false);
    } finally {
      await cleanupWithClient(observer, userId, accountUid);
      observer.release();
      await testObserverPool.end();
    }
  });
});
