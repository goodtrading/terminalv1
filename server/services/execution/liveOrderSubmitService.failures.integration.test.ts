import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";

const describePostgres = pool ? describe : describe.skip;
const readiness = { status: "ready_for_live" as const, exchange: "bingx" as const, liveTradingEnabled: true, apiTradingEnabled: true, orderSubmitEnabled: true, orderCancelEnabled: false, positionCloseEnabled: false, marketOrdersAllowed: false, killSwitchActive: false, checks: [], blockers: [], warnings: [], readyForDryRun: true, readyForLive: true, readOnlyFreezeActive: false };
const preview = { mode: "dry_run" as const, exchange: "bingx" as const, symbol: "BTC-USDT", side: "buy" as const, type: "limit" as const, orderWouldBeSent: false as const, tradingLocked: true, validated: true, blocked: false, blockers: [], warnings: [], estimate: { entryPrice: 65000, quantity: 0.001, notionalUsdt: 65 } };
function request(key: string, overrides: any = {}) { return { exchange: "bingx" as const, symbol: "BTC-USDT", side: "buy" as const, type: "limit" as const, quantity: 0.001, limitPrice: 64000, stopLossPrice: 63000, leverage: 5, reduceOnly: false, requestIdempotencyKey: key, confirmationText: LIVE_LIMIT_CONFIRMATION_TEXT, ...overrides }; }
function deps(broker: (p: any) => Promise<any>, overrides: any = {}) { return { getReadiness: async () => readiness, previewOrder: async () => preview, getConnection: () => ({ id: "failure-test", readOnly: false, connectionMode: "live", tradingPermissionConfirmed: true }), getCredentials: () => ({ apiKey: "test", secretKey: "test" }), getSymbolRules: async () => ({ symbol: "BTC-USDT", minQty: 0.0001, maxQty: 100, stepSize: 0.0001, quantityPrecision: 4, pricePrecision: 2, minNotional: 5 }), submitOrder: broker, ...overrides }; }
async function counts(client: pg.PoolClient, accountUid: string, key: string) { const r = await client.query("SELECT (SELECT count(*)::int FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2) AS intents, (SELECT count(*)::int FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2)) AS attempts", [accountUid, key]); return r.rows[0]; }
async function cleanup(client: pg.PoolClient, userId: number, accountUid: string) { await client.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1)", [accountUid]); await client.query("DELETE FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1", [accountUid]); await client.query("DELETE FROM goodtrading_accounts WHERE user_id=$1", [userId]); await client.query("DELETE FROM users WHERE id=$1", [userId]); }

describePostgres("productive pre-dispatch failure matrix", () => {
  it("fails closed before durable creation for account, market, semantic, readiness, preview and create failures", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-b2t-failures`;
    const userRow = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`${marker}@example.test`, "test", "B2T failures"]);
    const userId = Number(userRow.rows[0].id);
    const setup = await ensureGoodTradingAccountForUser(userId);
    const accountUid = setup.accountUid;
    const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
    const observer = await observerPool.connect();
    const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService");
    let brokerCalls = 0;
    const broker = async () => { brokerCalls += 1; throw new Error("BROKER_MUST_NOT_BE_CALLED"); };
    const base = deps(broker, { getAccount: async () => ({ accountUid }) });
    try {
      const accountKey = `account-${marker}`;
      const noAccountUser = userId + 100000000;
      const accountResult = await submitBingXLiveLimitOrder(noAccountUser, request(accountKey), deps(broker, { getAccount: async () => null }));
      assert.equal(accountResult.orderSubmitted, false); assert.equal(brokerCalls, 0); assert.deepEqual(await counts(observer, accountUid, accountKey), { intents: 0, attempts: 0 });

      const marketKey = `market-${marker}`;
      const marketResult = await submitBingXLiveLimitOrder(userId, request(marketKey, { symbol: "NOT-A-REAL-MARKET" }), base);
      assert.equal(marketResult.orderSubmitted, false); assert.equal(brokerCalls, 0); assert.deepEqual(await counts(observer, accountUid, marketKey), { intents: 0, attempts: 0 });

      const semanticKey = `semantic-${marker}`;
      const semanticResult = await submitBingXLiveLimitOrder(userId, request(semanticKey, { reduceOnly: true }), base);
      assert.equal(semanticResult.orderSubmitted, false); assert.equal(brokerCalls, 0); assert.deepEqual(await counts(observer, accountUid, semanticKey), { intents: 0, attempts: 0 });

      const readinessKey = `readiness-${marker}`;
      const readinessResult = await submitBingXLiveLimitOrder(userId, request(readinessKey), deps(broker, { getAccount: async () => ({ accountUid }), getReadiness: async () => ({ ...readiness, readyForLive: false, status: "not_ready", blockers: ["not ready"] }) }));
      assert.equal(readinessResult.orderSubmitted, false); assert.equal(brokerCalls, 0); assert.deepEqual(await counts(observer, accountUid, readinessKey), { intents: 0, attempts: 0 });

      const previewKey = `preview-${marker}`;
      const previewResult = await submitBingXLiveLimitOrder(userId, request(previewKey), deps(broker, { getAccount: async () => ({ accountUid }), previewOrder: async () => ({ ...preview, blocked: true, blockers: ["not ready_for_live"] }) }));
      assert.equal(previewResult.orderSubmitted, false); assert.equal(brokerCalls, 0); assert.deepEqual(await counts(observer, accountUid, previewKey), { intents: 0, attempts: 0 });

      const createKey = `create-${marker}`;
      await assert.rejects(() => submitBingXLiveLimitOrder(userId, request(createKey), deps(broker, { getAccount: async () => ({ accountUid }), createIntent: async () => { throw new Error("CREATE_FAILED"); } })), /CREATE_FAILED/);
      assert.equal(brokerCalls, 0);
      assert.deepEqual(await counts(observer, accountUid, createKey), { intents: 0, attempts: 0 });
    } finally {
      await cleanup(observer, userId, accountUid);
      observer.release(); await observerPool.end();
    }
  });

  it("blocks broker dispatch when SUBMISSION_STARTED persistence fails", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-b2t-start-failure`;
    const userRow = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`${marker}@example.test`, "test", "B2T start failure"]);
    const userId = Number(userRow.rows[0].id); const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid;
    const observerPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 }); const observer = await observerPool.connect();
    const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService"); let brokerCalls = 0;
    try { const key = `start-${marker}`; const result = await submitBingXLiveLimitOrder(userId, request(key), deps(async () => { brokerCalls += 1; throw new Error("BROKER_MUST_NOT_BE_CALLED"); }, { getAccount: async () => ({ accountUid }), markStarted: async () => { throw new Error("START_FAILED"); } })); assert.equal(result.orderSubmitted, false); assert.equal(brokerCalls, 0); const state = await observer.query("SELECT a.transport_state, count(*)::int AS attempts FROM goodtrading_order_intents i JOIN goodtrading_order_submission_attempts a ON a.intent_id=i.id WHERE i.goodtrading_account_uid=$1 AND i.request_idempotency_key=$2 GROUP BY a.transport_state", [accountUid, key]); assert.equal(state.rows[0].transport_state, "PERSISTED"); assert.equal(state.rows[0].attempts, 1); } finally { await cleanup(observer, userId, accountUid); observer.release(); await observerPool.end(); }
  });
});
