import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { getIntentByRequestIdempotencyKey, listAttemptsForIntent } from "../orders/goodTradingOrderIntentRepository";
import { findOrCreateBrokerObjectByReliableIdentities, listBrokerEvidenceForObject, recordBrokerObservation } from "../orders/goodTradingOrderReconciliationRepository";
import { composeGoodTradingN7Lifecycle } from "../orders/goodTradingN7LifecycleComposer";
import { consumeBingXSubmissionReconciliation } from "./bingxSubmissionReconciliationPersistenceService";
import { submitBingXLiveLimitOrder } from "./liveOrderSubmitService";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";

process.env.BINGX_READ_ONLY_FREEZE = "false";
process.env.BINGX_ENABLE_LIVE_TRADING = "true";
process.env.BINGX_ENABLE_API_TRADING = "true";
process.env.BINGX_ENABLE_ORDER_SUBMIT = "true";
process.env.BINGX_LIVE_LIMIT_TEST_MODE = "true";

const suite = pool ? describe : describe.skip;
const readiness = { status: "ready_for_live" as const, exchange: "bingx" as const, liveTradingEnabled: true, apiTradingEnabled: true, orderSubmitEnabled: true, orderCancelEnabled: false, positionCloseEnabled: false, marketOrdersAllowed: false, killSwitchActive: false, checks: [], blockers: [], warnings: [], readyForDryRun: true, readyForLive: true, readOnlyFreezeActive: false };
const preview = { mode: "dry_run" as const, exchange: "bingx" as const, symbol: "BTC-USDT", side: "buy" as const, type: "limit" as const, orderWouldBeSent: false as const, tradingLocked: true, validated: true, blocked: false, blockers: [], warnings: [], estimate: { entryPrice: 65000, quantity: 0.001, notionalUsdt: 65 } };

function request(key: string) { return { exchange: "bingx" as const, symbol: "BTC-USDT", side: "buy" as const, type: "limit" as const, quantity: 0.001, limitPrice: 64000, stopLossPrice: 63000, leverage: 5, reduceOnly: false, requestIdempotencyKey: key, confirmationText: LIVE_LIMIT_CONFIRMATION_TEXT }; }
function dependencies(submitOrder: (params: any) => Promise<any>) { return { getReadiness: async () => readiness, previewOrder: async () => preview, getConnection: () => ({ id: "n8-e2e", readOnly: false, connectionMode: "live", tradingPermissionConfirmed: true }), getCredentials: () => ({ apiKey: "integ...ey", secretKey: "integration-secret" }), getSymbolRules: async () => ({ symbol: "BTC-USDT", minQty: 0.0001, maxQty: 100, stepSize: 0.0001, quantityPrecision: 4, pricePrecision: 2, minNotional: 5 }), submitOrder }; }

async function fixture(label: string) {
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}-${label}`;
  const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`n8-e2e-${marker}@example.test`, "test", `N8 ${label}`]);
  const userId = Number(user.rows[0].id);
  const account = await ensureGoodTradingAccountForUser(userId);
  return { marker, userId, accountUid: account.accountUid, key: `n8-e2e-key-${marker}` };
}

async function reload(accountUid: string, key: string) {
  const intent = await getIntentByRequestIdempotencyKey(accountUid, key);
  assert.ok(intent);
  const attempts = await listAttemptsForIntent(intent.logicalOrderUid);
  assert.equal(attempts.length, 1);
  return { intent, attempt: attempts[0]! };
}

function matched(uid: string, client: string, orderId: string, status = "FILLED") {
  return { status: "MATCHED" as const, logicalOrderUid: uid, brokerClientOrderId: client, sources: ["ORDER_HISTORY" as const], observations: [{ source: "ORDER_HISTORY" as const, clientOrderId: client, brokerOrderId: orderId, brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", side: "BUY", quantity: "0.001", price: "64000", rawStatus: status, observedAt: new Date().toISOString(), sourceTimestamp: new Date().toISOString() }], sourceStatuses: { OPEN_ORDERS: "loaded" as const, ORDER_HISTORY: "loaded" as const, FILL_HISTORY: "loaded" as const }, absenceProven: false as const, retryAuthorized: false as const };
}

suite("N8 final live execution end-to-end", { concurrency: false }, () => {
  it("runs normal submit, ACK-only gate, durable match, lifecycle, and EconomicFill replay", { timeout: 120000 }, async () => {
    const f = await fixture("normal");
    let brokerCalls = 0;
    const brokerOrderId = `n8-order-${f.marker}`;
    const submit = await submitBingXLiveLimitOrder(f.userId, request(f.key), dependencies(async (params) => { brokerCalls++; return { orderId: brokerOrderId, clientOrderId: params.clientOrderId, protectiveSlAttached: false }; }));
    assert.equal(submit.status, "submitted");
    const loaded = await reload(f.accountUid, f.key);
    assert.equal(loaded.attempt.transportState, "SUBMISSION_RESPONSE_OBSERVED");
    assert.equal(brokerCalls, 1);
    const before = await pool!.query("SELECT count(*)::int AS n FROM goodtrading_broker_observation_snapshots WHERE broker_order_id=$1", [brokerOrderId]);
    assert.equal(before.rows[0].n, 0);

    assert.throws(() => composeGoodTradingN7Lifecycle({ intent: loaded.intent, attempt: { ...loaded.attempt, brokerOrderId: brokerOrderId }, brokerObjectId: "not-created", snapshots: [] }));
    await consumeBingXSubmissionReconciliation(f.userId, loaded.intent.logicalOrderUid, { runKey: `n8-match-${f.marker}`, reconcile: async () => matched(loaded.intent.logicalOrderUid, loaded.attempt.brokerClientOrderId, brokerOrderId) });
    const object = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: loaded.attempt.brokerClientOrderId }, { kind: "TRUSTED_BROKER_ORDER_ID", value: brokerOrderId, precisionTrusted: true }] });
    const evidence = await listBrokerEvidenceForObject(object.id);
    const finalInput = { intent: loaded.intent, attempt: { ...loaded.attempt, brokerOrderId: brokerOrderId }, brokerObjectId: object.id, snapshots: evidence };
    await recordBrokerObservation({ brokerObjectId: object.id, snapshot: { source: "FILL_HISTORY", clientOrderId: loaded.attempt.brokerClientOrderId, brokerOrderId: brokerOrderId, brokerOrderIdPrecisionTrusted: true, executionId: `E1-${f.marker}`, symbol: "BTC-USDT", side: "BUY", quantity: "0.0005", price: "64000", rawBrokerStatus: "FILLED", sourceTimestamp: new Date("2026-01-01T00:00:03Z"), observedAt: new Date("2026-01-01T00:00:04Z") } });
    await recordBrokerObservation({ brokerObjectId: object.id, snapshot: { source: "FILL_HISTORY", clientOrderId: loaded.attempt.brokerClientOrderId, brokerOrderId: brokerOrderId, brokerOrderIdPrecisionTrusted: true, executionId: `E2-${f.marker}`, symbol: "BTC-USDT", side: "BUY", quantity: "0.0005", price: "64000", rawBrokerStatus: "FILLED", sourceTimestamp: new Date("2026-01-01T00:00:05Z"), observedAt: new Date("2026-01-01T00:00:06Z") } });
    const linked = await listBrokerEvidenceForObject(object.id);
    const composed = composeGoodTradingN7Lifecycle({ ...finalInput, snapshots: linked });
    assert.equal(composed.state.status, "FILLED");
    assert.equal(composed.state.identity.canonicalOrderId, loaded.intent.logicalOrderUid);
    assert.equal(composed.economicFills.length, 2);
    const replay = composeGoodTradingN7Lifecycle({ ...finalInput, snapshots: linked });
    assert.deepEqual(composed, replay);
    const counts = await pool!.query("SELECT count(*)::int AS intents FROM goodtrading_order_intents WHERE goodtrading_account_uid=$1 AND request_idempotency_key=$2", [f.accountUid, f.key]);
    assert.equal(counts.rows[0].intents, 1);
  });

  it("runs ambiguous post-dispatch through durable reconciliation and then lifecycle", { timeout: 120000 }, async () => {
    const f = await fixture("ambiguous");
    let brokerCalls = 0;
    const result = await submitBingXLiveLimitOrder(f.userId, request(f.key), dependencies(async () => { brokerCalls++; throw new Error("mock timeout after dispatch"); }));
    assert.equal(result.status, "failed");
    assert.equal(brokerCalls, 1);
    const loaded = await reload(f.accountUid, f.key);
    assert.equal(loaded.attempt.transportState, "RECONCILIATION_REQUIRED");
    await consumeBingXSubmissionReconciliation(f.userId, loaded.intent.logicalOrderUid, { runKey: `n8-ambiguous-${f.marker}`, reconcile: async () => matched(loaded.intent.logicalOrderUid, loaded.attempt.brokerClientOrderId, "n8-order-ambiguous") });
    const object = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: loaded.attempt.brokerClientOrderId }, { kind: "TRUSTED_BROKER_ORDER_ID", value: "n8-order-ambiguous", precisionTrusted: true }] });
    await pool!.query("UPDATE goodtrading_broker_objects SET classification='GT_LINKED' WHERE id=$1", [object.id]);
    const evidence = await listBrokerEvidenceForObject(object.id);
    const composed = composeGoodTradingN7Lifecycle({ intent: loaded.intent, attempt: { ...loaded.attempt, brokerOrderId: "n8-order-ambiguous" }, brokerObjectId: object.id, snapshots: evidence });
    assert.equal(composed.state.status, "FILLED");
    const counts = await pool!.query("SELECT count(*)::int AS attempts FROM goodtrading_order_submission_attempts WHERE intent_id=$1", [loaded.intent.logicalOrderUid]);
    assert.equal(counts.rows[0].attempts, 1);
  });
});
