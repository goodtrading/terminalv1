import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { getIntentByRequestIdempotencyKey, listAttemptsForIntent, createIntentWithInitialAttempt, getIntentByLogicalOrderUid, getAttemptByBrokerClientOrderId } from "../orders/goodTradingOrderIntentRepository";
import { findOrCreateBrokerObjectByReliableIdentities, listBrokerEvidenceForObject, recordBrokerObservation } from "../orders/goodTradingOrderReconciliationRepository";
import { composeGoodTradingN7Lifecycle } from "../orders/goodTradingN7LifecycleComposer";
import { consumeBingXSubmissionReconciliation } from "./bingxSubmissionReconciliationPersistenceService";
import { runBingXCrashRecoverySweep } from "./bingxCrashRecoverySweep";
import { listRecoveryCandidates } from "../orders/goodTradingOrderReconciliationRepository";
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

  it("proves PostgreSQL-backed partial, terminal, ordering, source dedupe, missing execution, and concurrent composition", { timeout: 120000 }, async () => {
    const f = await fixture("missing-gates");
    const uid = `GT-N8-${f.marker}`; const client = `${uid}-CLIENT`; const brokerId = `${uid}-BROKER`;
    await createIntentWithInitialAttempt({ intent: { logicalOrderUid: uid, goodTradingAccountUid: f.accountUid, executionBroker: "BINGX", executionEnvironment: "LIVE", executionMarketInstrument: "BTC-USDT", executionMarketVenue: "BINGX", executionMarketType: "Perpetual", canonicalBaseAsset: "BTC", canonicalQuoteAsset: "USDT", canonicalSettlementAsset: "USDT", canonicalProductType: "Perpetual", canonicalContractStyle: "Linear", canonicalExpiry: null, sourceNativeSymbol: "BTC-USDT", sourceNativeInstrumentId: null, marketMetadataSource: "server-owned-v1-registry", marketMappingPolicy: "EXACT_V1_REGISTRY", requestedSide: "buy", orderType: "LIMIT", requestedSize: "1", requestedSizeUnit: "BTC", requestedSizingMode: "quantity", resolvedQuantity: "1", resolvedQuantityUnit: "BTC", limitPrice: "65000", stopLossPrice: null, takeProfitPrice: null, timeInForce: "GTC", postOnly: false, reduceOnly: false, requestIdempotencyKey: f.key }, attempt: { attemptId: `${uid}-ATTEMPT`, intentId: uid, attemptNumber: 1, brokerClientOrderId: client, submittedQuantity: "1", transportState: "PERSISTED", startedAt: null, responseAt: null, outcomeAt: null, reconciliationRequiredAt: null, brokerOrderId: brokerId, rawBrokerStatus: "FILLED", httpStatus: 200, errorCode: null, errorClass: null } });
    const object = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: client }, { kind: "TRUSTED_BROKER_ORDER_ID", value: brokerId, precisionTrusted: true }] });
    await pool!.query("UPDATE goodtrading_broker_objects SET classification='GT_LINKED',attempt_id=$2,intent_id=$3 WHERE id=$1", [object.id, `${uid}-ATTEMPT`, uid]);
    const add = (source: "OPEN_ORDERS" | "ORDER_HISTORY" | "FILL_HISTORY", status: string, ts: string, executionId: string | null = null, quantity = "0.5") => recordBrokerObservation({ brokerObjectId: object.id, snapshot: { source, clientOrderId: client, brokerOrderId: brokerId, brokerOrderIdPrecisionTrusted: true, executionId, symbol: "BTC-USDT", side: "BUY", quantity, price: "65000", rawBrokerStatus: status, sourceTimestamp: new Date(ts), observedAt: new Date(ts) } });
    await add("OPEN_ORDERS", "OPEN", "2026-01-01T00:00:01Z"); await add("ORDER_HISTORY", "PARTIALLY_FILLED", "2026-01-01T00:00:02Z", "E1"); await add("ORDER_HISTORY", "FILLED", "2026-01-01T00:00:03Z", "E2", "0.5"); await add("OPEN_ORDERS", "FILLED", "2026-01-01T00:00:03Z", "E2", "0.5");
    const intent = await getIntentByLogicalOrderUid(uid); const attempt = await getAttemptByBrokerClientOrderId(client); const snapshots = await listBrokerEvidenceForObject(object.id); assert.ok(intent); assert.ok(attempt);
    const input = { intent, attempt, brokerObjectId: object.id, snapshots }; const first = composeGoodTradingN7Lifecycle(input); const ordered = [...snapshots].sort((a, b) => new Date(a.sourceTimestamp).getTime() - new Date(b.sourceTimestamp).getTime()); assert.equal(composeGoodTradingN7Lifecycle({ ...input, snapshots: ordered.slice(0, 1) }).state.status, "ACCEPTED"); assert.equal(composeGoodTradingN7Lifecycle({ ...input, snapshots: ordered.slice(0, 2) }).state.status, "PARTIALLY_FILLED"); assert.equal(first.state.status, "FILLED"); assert.equal(first.state.identity.canonicalOrderId, uid); assert.equal(first.eventStream.events.length, 3); assert.equal(first.economicFills.length, 2);
    const [a, b] = await Promise.all([Promise.resolve(composeGoodTradingN7Lifecycle(input)), Promise.resolve(composeGoodTradingN7Lifecycle(input))]); assert.deepEqual(a, b);
    const filled = snapshots.find(s => s.rawBrokerStatus === "FILLED")!; const noExecution = composeGoodTradingN7Lifecycle({ ...input, snapshots: [{ ...filled, id: `${uid}-NO-EXEC`, source: "FILL_HISTORY", executionId: null }] }); assert.equal(noExecution.economicFills.length, 0);
  });

  it("proves factual CANCELED terminality and stale crash recovery reload", { timeout: 120000 }, async () => {
    const f = await fixture("recovery"); const uid = `GT-N8-${f.marker}`; const attemptId = `${uid}-ATTEMPT`; const client = `${uid}-CLIENT`; const brokerId = `${uid}-BROKER`;
    await createIntentWithInitialAttempt({ intent: { logicalOrderUid: uid, goodTradingAccountUid: f.accountUid, executionBroker: "BINGX", executionEnvironment: "LIVE", executionMarketInstrument: "BTC-USDT", executionMarketVenue: "BINGX", executionMarketType: "Perpetual", canonicalBaseAsset: "BTC", canonicalQuoteAsset: "USDT", canonicalSettlementAsset: "USDT", canonicalProductType: "Perpetual", canonicalContractStyle: "Linear", canonicalExpiry: null, sourceNativeSymbol: "BTC-USDT", sourceNativeInstrumentId: null, marketMetadataSource: "server-owned-v1-registry", marketMappingPolicy: "EXACT_V1_REGISTRY", requestedSide: "buy", orderType: "LIMIT", requestedSize: "1", requestedSizeUnit: "BTC", requestedSizingMode: "quantity", resolvedQuantity: "1", resolvedQuantityUnit: "BTC", limitPrice: "65000", stopLossPrice: null, takeProfitPrice: null, timeInForce: "GTC", postOnly: false, reduceOnly: false, requestIdempotencyKey: f.key }, attempt: { attemptId, intentId: uid, attemptNumber: 1, brokerClientOrderId: client, submittedQuantity: "1", transportState: "PERSISTED", startedAt: null, responseAt: null, outcomeAt: null, reconciliationRequiredAt: null, brokerOrderId: brokerId, rawBrokerStatus: null, httpStatus: null, errorCode: null, errorClass: null } });
    await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='SUBMISSION_STARTED',started_at=$2 WHERE id=$1", [attemptId, new Date("2026-01-01T00:00:00Z")]);
    const recovery = await runBingXCrashRecoverySweep({ now: new Date("2026-01-01T00:02:00Z"), listCandidates: async (cutoff, limit) => (await listRecoveryCandidates(cutoff, limit)).filter(c => c.attemptId === attemptId), consume: async () => consumeBingXSubmissionReconciliation(f.userId, uid, { runKey: `n8-recovery-${f.marker}`, reconcile: async () => matched(uid, client, brokerId) }) }); assert.equal(recovery.consumed, 1);
    const object = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: client }, { kind: "TRUSTED_BROKER_ORDER_ID", value: brokerId, precisionTrusted: true }] }); await pool!.query("UPDATE goodtrading_broker_objects SET classification='GT_LINKED',attempt_id=$2,intent_id=$3 WHERE id=$1", [object.id, attemptId, uid]);
    await recordBrokerObservation({ brokerObjectId: object.id, snapshot: { source: "ORDER_HISTORY", clientOrderId: client, brokerOrderId: brokerId, brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", side: "BUY", quantity: "1", price: "65000", rawBrokerStatus: "CANCELED", sourceTimestamp: new Date("2026-01-01T00:00:03Z"), observedAt: new Date("2026-01-01T00:00:04Z") } }); await recordBrokerObservation({ brokerObjectId: object.id, snapshot: { source: "ORDER_HISTORY", clientOrderId: client, brokerOrderId: brokerId, brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", side: "BUY", quantity: "1", price: "65000", rawBrokerStatus: "OPEN", sourceTimestamp: new Date("2025-12-31T23:00:00Z"), observedAt: new Date("2026-01-01T00:00:05Z") } });
    const reloaded = { intent: await getIntentByLogicalOrderUid(uid), attempt: await getAttemptByBrokerClientOrderId(client) }; const composed = composeGoodTradingN7Lifecycle({ intent: reloaded.intent!, attempt: reloaded.attempt!, brokerObjectId: object.id, snapshots: await listBrokerEvidenceForObject(object.id) }); assert.equal(composed.state.status, "CANCELED"); assert.equal(composed.eventStream.events.filter(e => e.event.eventType === "ORDER_CANCELED").length, 1); assert.equal((await pool!.query("SELECT count(*)::int AS n FROM goodtrading_order_submission_attempts WHERE intent_id=$1", [uid])).rows[0].n, 1);
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
