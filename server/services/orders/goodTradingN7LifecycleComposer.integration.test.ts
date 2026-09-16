import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { createIntentWithInitialAttempt, getAttemptByBrokerClientOrderId, getIntentByLogicalOrderUid } from "./goodTradingOrderIntentRepository";
import { findOrCreateBrokerObjectByReliableIdentities, listBrokerEvidenceForObject, recordBrokerObservation } from "./goodTradingOrderReconciliationRepository";
import { composeGoodTradingN7Lifecycle } from "./goodTradingN7LifecycleComposer";

const suite = pool ? describe : describe.skip;

suite("N8.3B2 real PostgreSQL composition", () => {
  it("reads durable linked evidence and composes an N7 lifecycle without broker traffic", { timeout: 120000 }, async () => {
    const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`n832-${marker}@example.test`, "test", "N8.3B2"]);
    const userId = Number(user.rows[0].id);
    const account = await ensureGoodTradingAccountForUser(userId);
    const uid = `GT-N832-${marker}`;
    const attemptId = `${uid}-ATTEMPT`;
    const clientId = `${uid}-CLIENT`;
    await createIntentWithInitialAttempt({
      intent: { logicalOrderUid: uid, goodTradingAccountUid: account.accountUid, executionBroker: "BINGX", executionEnvironment: "LIVE", executionMarketInstrument: "BTC-USDT", executionMarketVenue: "BINGX", executionMarketType: "Perpetual", canonicalBaseAsset: "BTC", canonicalQuoteAsset: "USDT", canonicalSettlementAsset: "USDT", canonicalProductType: "Perpetual", canonicalContractStyle: "Linear", canonicalExpiry: null, sourceNativeSymbol: "BTC-USDT", sourceNativeInstrumentId: null, marketMetadataSource: "server-owned-v1-registry", marketMappingPolicy: "EXACT_V1_REGISTRY", requestedSide: "buy", orderType: "LIMIT", requestedSize: "1", requestedSizeUnit: "BTC", requestedSizingMode: "quantity", resolvedQuantity: "1", resolvedQuantityUnit: "BTC", limitPrice: "65000", stopLossPrice: null, takeProfitPrice: null, timeInForce: "GTC", postOnly: false, reduceOnly: false, requestIdempotencyKey: `key-${marker}` },
      attempt: { attemptId, intentId: uid, attemptNumber: 1, brokerClientOrderId: clientId, submittedQuantity: "1", transportState: "PERSISTED", startedAt: null, responseAt: null, outcomeAt: null, reconciliationRequiredAt: null, brokerOrderId: "987654321", rawBrokerStatus: "FILLED", httpStatus: 200, errorCode: null, errorClass: null },
    });
    const object = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: account.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: clientId }, { kind: "TRUSTED_BROKER_ORDER_ID", value: "987654321", precisionTrusted: true }], brokerObjectId: `BROKER-${marker}` });
    await pool!.query("UPDATE goodtrading_broker_objects SET classification='GT_LINKED',attempt_id=$2,intent_id=$3 WHERE id=$1", [object.id, attemptId, uid]);
    await recordBrokerObservation({ brokerObjectId: object.id, snapshot: { source: "ORDER_HISTORY", clientOrderId: clientId, brokerOrderId: "987654321", brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", side: "BUY", quantity: "1", price: "65000", rawBrokerStatus: "FILLED", sourceTimestamp: new Date("2026-01-01T00:00:01Z"), observedAt: new Date("2026-01-01T00:00:02Z") } });
    const evidence = await listBrokerEvidenceForObject(object.id);
    const inputs = { intent: (await getIntentByLogicalOrderUid(uid))!, attempt: (await getAttemptByBrokerClientOrderId(clientId))!, brokerObjectId: object.id, snapshots: evidence };
    const [first, second] = await Promise.all([Promise.resolve(composeGoodTradingN7Lifecycle(inputs)), Promise.resolve(composeGoodTradingN7Lifecycle(inputs))]);
    assert.equal(first.state.status, "FILLED");
    assert.deepEqual(first, second);
  });
});
