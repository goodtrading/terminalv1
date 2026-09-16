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
import { unavailableDecisionMarketContext } from "../../../shared/orderDecisionEvidence";

process.env.BINGX_READ_ONLY_FREEZE = "false";
process.env.BINGX_ENABLE_LIVE_TRADING = "true";
process.env.BINGX_ENABLE_API_TRADING = "true";
process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
process.env.BINGX_LIVE_LIMIT_TEST_MODE = "true";

const describePostgres = pool ? describe : describe.skip;
function makeObserverPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
}


async function bounded<T>(label: string, task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([task, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`N9A_STAGE_TIMEOUT:${label}`)), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
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

  it("captures immutable decision evidence once and converges concurrent same-key callers", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-n9a-evidence`;
    const user = await bounded("fixture-user", pool!.query("INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id", [`${marker}@example.test`, "integration-hash", "N9A evidence"]), 10000);
    const userId = Number(user.rows[0].id);
    const accountUid = (await bounded("fixture-account", ensureGoodTradingAccountForUser(userId), 10000)).accountUid;
    const observerPool = makeObserverPool();
    const observer = await bounded("observer-connect", observerPool.connect(), 10000);
    const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService");
    const exact = { marketSource: "TEST_LOCAL_BBO", marketSourceTimestamp: new Date("2026-09-16T12:00:00.100Z"), bestBid: "64000.12345678", bestAsk: "64001.12345678", marketEvidenceQuality: "EXACT_OBSERVED" as const };
    let calls = 0;
    try {
      const key = `key-${marker}`;
      const first = await bounded("submit-service", submitBingXLiveLimitOrder(userId, request(key), dependencies(async (params) => { calls += 1; return { orderId: "n9a-order", clientOrderId: params.clientOrderId, protectiveSlAttached: false }; }, { getDecisionMarketContext: () => exact })), 30000);
      assert.equal(first.orderSubmitted, true);
      const original = await bounded("intent-reload", getIntentByRequestIdempotencyKey(accountUid, key), 10000);
      assert.ok(original?.decisionEvidence); assert.equal(original.decisionEvidence.bestBid, exact.bestBid); assert.equal(original.decisionEvidence.bestAsk, exact.bestAsk); assert.equal(original.decisionEvidence.marketSourceTimestamp?.toISOString(), exact.marketSourceTimestamp.toISOString());
      const replay = await bounded("sequential-replay", submitBingXLiveLimitOrder(userId, request(key), dependencies(async () => { calls += 1; return { orderId: "must-not-run", clientOrderId: "must-not-run", protectiveSlAttached: false }; }, { getDecisionMarketContext: () => ({ ...exact, bestBid: "1", bestAsk: "2" }) })), 30000);
      assert.equal(replay.idempotentReplay, true); assert.equal(calls, 1);
      const concurrentKey = `concurrent-${marker}`; const contexts = [exact, unavailableDecisionMarketContext()];
      const submit = () => submitBingXLiveLimitOrder(userId, request(concurrentKey), dependencies(async (params) => { calls += 1; return { orderId: "n9a-concurrent", clientOrderId: params.clientOrderId, protectiveSlAttached: false }; }, { getDecisionMarketContext: () => contexts.shift() ?? exact }));
      await bounded("concurrent-race", Promise.all([submit(), submit()]), 30000);
      const rows = await bounded("observer-query", observer.query("SELECT decision_at, decision_market_source, decision_market_source_timestamp, decision_best_bid, decision_best_ask, decision_market_evidence_quality FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2", [accountUid, concurrentKey]), 10000);
      assert.equal(rows.rows.length, 1); const evidenceCount = await bounded("observer-evidence-count", observer.query("SELECT count(*)::int AS n FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2 AND decision_at IS NOT NULL", [accountUid, concurrentKey]), 10000); assert.equal(evidenceCount.rows[0].n, 1);
    } finally { await bounded("cleanup", cleanupWithClient(observer, userId, accountUid), 10000); observer.release(); await observerPool.end(); }
  });
  it("persists explicit unavailable context without waiting for market data", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-n9a-unavailable`; const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`${marker}@example.test`, "integration-hash", "N9A unavailable"]); const userId = Number(user.rows[0].id); const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid; const key = `key-${marker}`; const observerPool = makeObserverPool(); const observer = await observerPool.connect();
    try { const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService"); const result = await submitBingXLiveLimitOrder(userId, request(key), dependencies(async (params) => ({ orderId: "n9a-unavailable", clientOrderId: params.clientOrderId, protectiveSlAttached: false }), { getDecisionMarketContext: unavailableDecisionMarketContext })); assert.equal(result.orderSubmitted, true); const row = await observer.query("SELECT decision_market_evidence_quality, decision_best_bid, decision_best_ask, decision_market_source_timestamp FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2", [accountUid, key]); assert.deepEqual(row.rows[0], { decision_market_evidence_quality: "UNAVAILABLE", decision_best_bid: null, decision_best_ask: null, decision_market_source_timestamp: null }); } finally { await cleanupWithClient(observer, userId, accountUid); observer.release(); await observerPool.end(); }
  });

  it("loads a legacy intent with null decision evidence", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-n9a-legacy`; const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`${marker}@example.test`, "integration-hash", "N9A legacy"]); const userId = Number(user.rows[0].id); const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid; const key = `key-${marker}`; const observerPool = makeObserverPool(); const observer = await observerPool.connect();
    try { const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService"); await submitBingXLiveLimitOrder(userId, request(key), dependencies(async (params) => ({ orderId: "n9a-legacy", clientOrderId: params.clientOrderId, protectiveSlAttached: false }), { getDecisionMarketContext: unavailableDecisionMarketContext })); await observer.query("UPDATE goodtrading_order_intents SET decision_at=NULL, decision_market_source=NULL, decision_market_source_timestamp=NULL, decision_best_bid=NULL, decision_best_ask=NULL, decision_market_evidence_quality=NULL WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2", [accountUid, key]); const loaded = await getIntentByRequestIdempotencyKey(accountUid, key); assert.equal(loaded?.decisionEvidence, null); assert.equal(loaded?.logicalOrderUid.startsWith("GT-"), true); } finally { await cleanupWithClient(observer, userId, accountUid); observer.release(); await observerPool.end(); }
  });

  it("preserves decision evidence through post-dispatch uncertainty", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-n9a-uncertain`; const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`${marker}@example.test`, "integration-hash", "N9A uncertain"]); const userId = Number(user.rows[0].id); const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid; const key = `key-${marker}`; const observerPool = makeObserverPool(); const observer = await observerPool.connect(); const exact = { marketSource: "TEST_LOCAL_BBO", marketSourceTimestamp: new Date("2026-09-16T12:00:00.100Z"), bestBid: "64000.12345678", bestAsk: "64001.12345678", marketEvidenceQuality: "EXACT_OBSERVED" as const }; let calls = 0;
    try { const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService"); const result = await submitBingXLiveLimitOrder(userId, request(key), dependencies(async () => { calls += 1; throw new Error("DISPATCH_UNCERTAIN"); }, { getDecisionMarketContext: () => exact })); assert.equal(result.status, "failed"); assert.equal(calls, 1); const row = await observer.query("SELECT decision_at, decision_best_bid, decision_best_ask, decision_market_evidence_quality FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2", [accountUid, key]); const attempts = await observer.query("SELECT attempt_number, transport_state FROM goodtrading_order_submission_attempts WHERE intent_id=(SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2)", [accountUid, key]); assert.equal(row.rows.length, 1); assert.equal(row.rows[0].decision_best_bid, exact.bestBid); assert.equal(row.rows[0].decision_best_ask, exact.bestAsk); assert.equal(row.rows[0].decision_market_evidence_quality, exact.marketEvidenceQuality); assert.deepEqual(attempts.rows, [{ attempt_number: 1, transport_state: "RECONCILIATION_REQUIRED" }]); } finally { await cleanupWithClient(observer, userId, accountUid); observer.release(); await observerPool.end(); }
  });
  it("creates no N9A evidence before a pre-dispatch market gate", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-n9a-pre`; const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`${marker}@example.test`, "integration-hash", "N9A predispatch"]); const userId = Number(user.rows[0].id); const accountUid = (await ensureGoodTradingAccountForUser(userId)).accountUid; const key = `key-${marker}`; const observerPool = makeObserverPool(); const observer = await observerPool.connect(); let brokerCalls = 0; let contextCalls = 0;
    try { const { submitBingXLiveLimitOrder } = await import("./liveOrderSubmitService"); const result = await submitBingXLiveLimitOrder(userId, request(key), dependencies(async () => { brokerCalls += 1; return {}; }, { getAccount: async () => ({ accountUid }), getReadiness: async () => ({ ...readiness, readyForLive: false, status: "not_ready", blockers: ["not ready"] }), getDecisionMarketContext: () => { contextCalls += 1; return unavailableDecisionMarketContext(); } })); assert.equal(result.orderSubmitted, false); assert.equal(brokerCalls, 0); assert.equal(contextCalls, 0); const counts = await observer.query("SELECT (SELECT count(*)::int FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2) AS intents, (SELECT count(*)::int FROM goodtrading_order_submission_attempts WHERE intent_id IN (SELECT id FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2)) AS attempts", [accountUid, key]); assert.deepEqual(counts.rows[0], { intents: 0, attempts: 0 }); } finally { await cleanupWithClient(observer, userId, accountUid); observer.release(); await observerPool.end(); }
  });
});
