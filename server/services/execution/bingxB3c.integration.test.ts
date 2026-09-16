import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pool } from "../../db";
import { ensureGoodTradingAccountForUser } from "../accounts/goodTradingAccountRepository";
import { createIntentWithInitialAttempt } from "../orders/goodTradingOrderIntentRepository";
import {
  completeReconciliationConflict,
  completeReconciliationMatched,
  completeReconciliationNoMatch,
  completeReconciliationUnresolved,
  createReconciliationRun,
  findOrCreateBrokerObjectByReliableIdentities,
  getReconciliationRunByAttemptAndKey,
  persistMatchedReconciliation,
  listRecoveryCandidates,
} from "../orders/goodTradingOrderReconciliationRepository";
import type { BrokerObservationSnapshot } from "../../../shared/durableOrderReconciliation";
import { runBingXCrashRecoverySweep } from "./bingxCrashRecoverySweep";
import { observeBingXBrokerObjects } from "./bingxExternalObservationService";
import { reconcileBingXSubmission } from "./bingxSubmissionReconciliationService";
import { consumeBingXSubmissionReconciliation } from "./bingxSubmissionReconciliationPersistenceService";
import { normalizeBingXSubmissionObservations } from "../exchanges/bingx/bingxSubmissionReconciliationReader";

const suite = pool ? describe : describe.skip;

function input(accountUid: string, uid: string, key: string) {
  return {
    intent: {
      logicalOrderUid: uid, goodTradingAccountUid: accountUid, executionBroker: "BINGX", executionEnvironment: "LIVE",
      executionMarketInstrument: "BTC-USDT", executionMarketVenue: "BINGX", executionMarketType: "Perpetual" as const,
      canonicalBaseAsset: "BTC", canonicalQuoteAsset: "USDT", canonicalSettlementAsset: "USDT", canonicalProductType: "Perpetual" as const,
      canonicalContractStyle: "Linear" as const, canonicalExpiry: null, sourceNativeSymbol: "BTC-USDT", sourceNativeInstrumentId: null,
      marketMetadataSource: "server-owned-v1-registry", marketMappingPolicy: "EXACT_V1_REGISTRY", requestedSide: "buy" as const,
      orderType: "LIMIT" as const, requestedSize: "1", requestedSizeUnit: "BTC" as const, requestedSizingMode: "quantity" as const,
      resolvedQuantity: "1", resolvedQuantityUnit: "BTC" as const, limitPrice: "65000", stopLossPrice: null, takeProfitPrice: null,
      timeInForce: "GTC" as const, postOnly: false, reduceOnly: false, requestIdempotencyKey: key,
    },
    attempt: {
      attemptId: `${uid}-ATTEMPT`, intentId: uid, attemptNumber: 1, brokerClientOrderId: `${uid}-CLIENT`, submittedQuantity: "1",
      transportState: "PERSISTED" as const, startedAt: null, responseAt: null, outcomeAt: null, reconciliationRequiredAt: null,
      brokerOrderId: null, rawBrokerStatus: null, httpStatus: null, errorCode: null, errorClass: null,
    },
  };
}

async function fixture() {
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await pool!.query("INSERT INTO users (email,password_hash,full_name) VALUES ($1,$2,$3) RETURNING id", [`b3c-${marker}@example.test`, "test", "B3-C integration"]);
  const userId = Number(user.rows[0].id);
  const account = await ensureGoodTradingAccountForUser(userId);
  const uid = `GT-B3C-${marker}`;
  await createIntentWithInitialAttempt(input(account.accountUid, uid, `b3c-${marker}`));
  await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='RECONCILIATION_REQUIRED',reconciliation_required_at=now() WHERE id=$1", [`${uid}-ATTEMPT`]);
  return { userId, accountUid: account.accountUid, uid, attemptId: `${uid}-ATTEMPT`, client: `${uid}-CLIENT` };
}

async function cleanup(f: Awaited<ReturnType<typeof fixture>>, extraAccounts: string[] = []) {
  const accounts = [f.accountUid, ...extraAccounts];
  await pool!.query("DELETE FROM goodtrading_broker_observation_snapshots WHERE broker_object_id IN (SELECT id FROM goodtrading_broker_objects WHERE broker_account_identity = ANY($1::text[]))", [accounts]);
  await pool!.query("DELETE FROM goodtrading_broker_identity_aliases WHERE broker_account_identity = ANY($1::text[])", [accounts]);
  await pool!.query("DELETE FROM goodtrading_broker_objects WHERE broker_account_identity = ANY($1::text[])", [accounts]);
  await pool!.query("DELETE FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1", [f.attemptId]);
  await pool!.query("DELETE FROM goodtrading_order_submission_attempts WHERE intent_id=$1", [f.uid]);
  await pool!.query("DELETE FROM goodtrading_order_intents WHERE id=$1", [f.uid]);
  await pool!.query("DELETE FROM goodtrading_accounts WHERE account_uid = ANY($1::text[])", [accounts]);
  await pool!.query("DELETE FROM users WHERE id=$1", [f.userId]);
}

function observation(source: "OPEN_ORDERS" | "ORDER_HISTORY" | "FILL_HISTORY", clientOrderId?: string, status = "OPEN", brokerOrderId?: string): BrokerObservationSnapshot {
  return { source, clientOrderId, brokerOrderId, brokerOrderIdPrecisionTrusted: !!brokerOrderId, symbol: "BTC-USDT", side: "BUY", quantity: "1", price: "65000", rawStatus: status, observedAt: new Date("2026-01-01T00:00:00Z") };
}

function readResult(observations: Awaited<ReturnType<typeof observation>>[], failed: "OPEN_ORDERS" | "ORDER_HISTORY" | "FILL_HISTORY" | null = null) {
  return {
    OPEN_ORDERS: { status: failed === "OPEN_ORDERS" ? "failed" as const : "loaded" as const, observations: failed === "OPEN_ORDERS" ? [] : observations.filter(o => o.source === "OPEN_ORDERS"), errorCode: failed === "OPEN_ORDERS" ? "BINGX_TIMEOUT" : undefined },
    ORDER_HISTORY: { status: failed === "ORDER_HISTORY" ? "failed" as const : "loaded" as const, observations: failed === "ORDER_HISTORY" ? [] : observations.filter(o => o.source === "ORDER_HISTORY"), errorCode: failed === "ORDER_HISTORY" ? "BINGX_HISTORY_FAILED" : undefined },
    FILL_HISTORY: { status: failed === "FILL_HISTORY" ? "failed" as const : "loaded" as const, observations: failed === "FILL_HISTORY" ? [] : observations.filter(o => o.source === "FILL_HISTORY"), errorCode: failed === "FILL_HISTORY" ? "BINGX_FILL_FAILED" : undefined },
  };
}

suite("B3-C real PostgreSQL integration", () => {
  it("maps the durable attempt and intent IDs and transitions stale SUBMISSION_STARTED", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='SUBMISSION_STARTED', started_at=$2 WHERE id=$1", [f.attemptId, new Date("2026-01-01T00:00:00Z")]);
      let consumed: [number, string, string] | undefined;
      const result = await runBingXCrashRecoverySweep({
        now: new Date("2026-01-01T00:02:00Z"),
        listCandidates: async (cutoff, limit) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => candidate.attemptId === f.attemptId),
        consume: async (userId, logicalOrderUid, { runKey }) => { consumed = [userId, logicalOrderUid, runKey!]; return { status: "UNRESOLVED" as const }; },
      });
      assert.deepEqual(consumed, [f.userId, f.uid, `recovery:${f.attemptId}:INITIAL`]);
      assert.equal(result.consumed, 1);
      const row = await pool!.query("SELECT intent_id, transport_state, error_code, error_class, reconciliation_required_at FROM goodtrading_order_submission_attempts WHERE id=$1", [f.attemptId]);
      assert.equal(row.rows[0].intent_id, f.uid);
      assert.equal(row.rows[0].transport_state, "RECONCILIATION_REQUIRED");
      assert.equal(row.rows[0].error_code, "CRASH_RECOVERY_STALE_SUBMISSION");
      assert.equal(row.rows[0].error_class, "CRASH_RECOVERY");
      assert.ok(row.rows[0].reconciliation_required_at instanceof Date);
    } finally { await cleanup(f); }
  });

  it("does not externalize a known GT client order outside the injected lookup", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const result = await observeBingXBrokerObjects({
        brokerAccountIdentity: f.accountUid,
        read: async () => ({
          OPEN_ORDERS: { status: "loaded", observations: [{ source: "OPEN_ORDERS", clientOrderId: f.client, brokerOrderId: "123456789012345678", brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", observedAt: new Date().toISOString() }] },
          ORDER_HISTORY: { status: "loaded", observations: [] }, FILL_HISTORY: { status: "loaded", observations: [] },
        }),
        findOrCreate: async () => { throw new Error("known GT order must not be externalized"); },
      });
      assert.equal(result.knownGtMatches, 1);
      assert.equal(result.persisted, 0);
      const objects = await pool!.query("SELECT count(*)::int AS n FROM goodtrading_broker_objects WHERE broker_account_identity=$1", [f.accountUid]);
      assert.equal(objects.rows[0].n, 0);
    } finally { await cleanup(f); }
  });

  it("evolves snapshots while reusing one multi-alias broker object", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const first = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: "ALIAS-CLIENT" }, { kind: "TRUSTED_BROKER_ORDER_ID", value: "987654321012345678", precisionTrusted: true }] });
      const second = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "TRUSTED_BROKER_ORDER_ID", value: "987654321012345678", precisionTrusted: true }, { kind: "EXECUTION_ID", value: "EXEC-1" }] });
      assert.equal(first.id, second.id);
      await pool!.query("INSERT INTO goodtrading_broker_observation_snapshots (id,broker_object_id,source,client_order_id,broker_order_id,broker_order_id_precision_trusted,symbol,side,quantity,price,raw_broker_status,observed_at) VALUES ('B3C-SNAP-1',$1,'ORDER_HISTORY','ALIAS-CLIENT','987654321012345678',true,'BTC-USDT','BUY',1,65000,'OPEN','2026-01-01T00:00:00Z'),('B3C-SNAP-2',$1,'ORDER_HISTORY','ALIAS-CLIENT','987654321012345678',true,'BTC-USDT','BUY',1,65000,'FILLED','2026-01-01T00:01:00Z')", [first.id]);
      const row = await pool!.query("SELECT count(*)::int AS snapshots FROM goodtrading_broker_observation_snapshots WHERE broker_object_id=$1", [first.id]);
      assert.equal(row.rows[0].snapshots, 2);
      assert.equal((await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "EXECUTION_ID", value: "EXEC-1" }] })).id, first.id);
    } finally { await cleanup(f); }
  });

  it("keeps identical broker identities isolated by account", { timeout: 120000 }, async () => {
    const f = await fixture(); const other = `${f.accountUid}-ACCOUNT-2`;
    try {
      const a = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: "SHARED-CLIENT" }] });
      const b = await findOrCreateBrokerObjectByReliableIdentities({ brokerAccountIdentity: other, identities: [{ kind: "CLIENT_ORDER_ID", value: "SHARED-CLIENT" }] });
      assert.notEqual(a.id, b.id);
      assert.equal((await pool!.query("SELECT count(*)::int AS n FROM goodtrading_broker_objects WHERE broker_account_identity IN ($1,$2)", [f.accountUid, other])).rows[0].n, 2);
    } finally { await cleanup(f, [other]); }
  });

  it("does not externalize a GT-linked object and preserves its linkage", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const run = await createReconciliationRun({ attemptId: f.attemptId, intentId: f.uid, logicalOrderUid: f.uid, runKey: "gt-linked", queriedSources: ["ORDER_HISTORY"] });
      const linked = await persistMatchedReconciliation({ runId: String(run.id), brokerAccountIdentity: f.accountUid, identities: [{ kind: "CLIENT_ORDER_ID", value: f.client }], attemptId: f.attemptId, intentId: f.uid, snapshot: observation("ORDER_HISTORY", f.client, "OPEN") });
      const result = await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => readResult([observation("OPEN_ORDERS", f.client, "FILLED")]), findOrCreate: async () => { throw new Error("GT-linked object must not be externalized"); } });
      assert.equal(result.knownGtMatches, 1);
      const row = await pool!.query("SELECT classification,attempt_id,intent_id FROM goodtrading_broker_objects WHERE id=$1", [linked.id]);
      assert.deepEqual(row.rows[0], { classification: "GT_LINKED", attempt_id: f.attemptId, intent_id: f.uid });
    } finally { await cleanup(f); }
  });

  it("persists source observations, skips exact repeats, and records evolution", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const one = observation("ORDER_HISTORY", `${f.client}-external`, "OPEN");
      const two = observation("ORDER_HISTORY", `${f.client}-external`, "FILLED", "987654321012345679");
      const read = async () => readResult([one]);
      assert.deepEqual(await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read }), { scanned: 1, persisted: 1, deduped: 0, rejected: 0, insufficientIdentity: 0, knownGtMatches: 0, sourceFailures: [] });
      assert.deepEqual(await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read }), { scanned: 1, persisted: 0, deduped: 1, rejected: 0, insufficientIdentity: 0, knownGtMatches: 0, sourceFailures: [] });
      assert.equal((await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => readResult([two]) })).persisted, 1);
      assert.equal((await pool!.query("SELECT count(*)::int AS n FROM goodtrading_broker_observation_snapshots s JOIN goodtrading_broker_objects o ON o.id=s.broker_object_id WHERE o.broker_account_identity=$1", [f.accountUid])).rows[0].n, 2);
    } finally { await cleanup(f); }
  });

  it("rejects observations without reliable identity and isolates source failures", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const noIdentity = observation("OPEN_ORDERS", undefined, "OPEN", undefined);
      const result = await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => readResult([noIdentity, observation("ORDER_HISTORY", `${f.client}-external`)], "FILL_HISTORY") });
      assert.equal(result.scanned, 2, JSON.stringify(result)); assert.equal(result.rejected, 1, JSON.stringify(result)); assert.equal(result.persisted, 1, JSON.stringify(result)); assert.deepEqual(result.sourceFailures, ["FILL_HISTORY:BINGX_FILL_FAILED"]);
      assert.equal((await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => { throw new Error("network down"); } })).sourceFailures[0], "READ_FAILED:network down");
    } finally { await cleanup(f); }
  });

  it("recovers one stale attempt while an external scan races without creating a duplicate", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='SUBMISSION_STARTED',started_at='2026-01-01T00:00:00Z' WHERE id=$1", [f.attemptId]);
      const recovery = runBingXCrashRecoverySweep({ now: new Date("2026-01-01T00:02:00Z"), listCandidates: async (cutoff, limit) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => candidate.attemptId === f.attemptId), consume: async () => ({ status: "UNRESOLVED" as const }) });
      const external = observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => readResult([observation("OPEN_ORDERS", f.client)]), findOrCreate: async () => { throw new Error("known GT order must win race"); } });
      const [recovered, scanned] = await Promise.all([recovery, external]);
      assert.equal(recovered.consumed, 1); assert.equal(scanned.knownGtMatches, 1); assert.equal(scanned.persisted, 0);
    } finally { await cleanup(f); }
  });

  it("skips recent results, rescans stale no-match results, and skips matched results", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='RECONCILIATION_REQUIRED' WHERE id=$1", [f.attemptId]);
      const recent = await createReconciliationRun({ attemptId: f.attemptId, intentId: f.uid, logicalOrderUid: f.uid, runKey: "recent", queriedSources: [] }); await completeReconciliationNoMatch(String(recent.id));
      await pool!.query("UPDATE goodtrading_order_reconciliation_runs SET completed_at='2026-01-01T00:01:30Z' WHERE id=$1", [recent.id]);
      let consumed = 0;
      const deps = { now: new Date("2026-01-01T00:02:00Z"), listCandidates: async (cutoff: Date, limit: number) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => candidate.attemptId === f.attemptId), consume: async () => { consumed++; return { status: "UNRESOLVED" as const }; } };
      assert.equal((await runBingXCrashRecoverySweep(deps)).skipped, 1); assert.equal(consumed, 0);
      await pool!.query("UPDATE goodtrading_order_reconciliation_runs SET completed_at='2025-12-31T23:00:00Z' WHERE id=$1", [recent.id]);
      assert.equal((await runBingXCrashRecoverySweep(deps)).consumed, 1); assert.equal(consumed, 1);
      const matched = await createReconciliationRun({ attemptId: f.attemptId, intentId: f.uid, logicalOrderUid: f.uid, runKey: "matched", queriedSources: [] }); await completeReconciliationMatched(String(matched.id));
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='RECONCILIATION_REQUIRED' WHERE id=$1", [f.attemptId]);
      assert.equal((await runBingXCrashRecoverySweep(deps)).skipped, 1); assert.equal(consumed, 1);
    } finally { await cleanup(f); }
  });

  it("lets concurrent recovery workers claim exactly one generation and contains failures", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='RECONCILIATION_REQUIRED' WHERE id=$1", [f.attemptId]);
      const consume = async (_user: number, _uid: string, { runKey }: { runKey?: string }) => { const run = await getReconciliationRunByAttemptAndKey(f.attemptId, runKey!); if (run) await completeReconciliationUnresolved(String(run.id)); return { status: "UNRESOLVED" as const }; };
      const listCandidates = async (cutoff: Date, limit: number) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => candidate.attemptId === f.attemptId);
      const [a, b] = await Promise.all([runBingXCrashRecoverySweep({ listCandidates, consume }), runBingXCrashRecoverySweep({ listCandidates, consume })]);
      assert.equal(a.consumed + b.consumed, 1); assert.equal(a.skipped + b.skipped, 1);
      assert.equal((await pool!.query("SELECT count(*)::int AS n FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1", [f.attemptId])).rows[0].n, 1);
      const isolated = await runBingXCrashRecoverySweep({ listCandidates: async () => [{ attemptId: f.attemptId, intentId: "missing-intent", logicalOrderUid: "missing-intent", userId: f.userId, transportState: "RECONCILIATION_REQUIRED", startedAt: null }], latestCompleted: async () => null, consume: async () => { throw new Error("candidate failed"); } });
      assert.equal(isolated.failed, 1);
    } finally { await cleanup(f); }
  });

  it("uses mock broker reads to durably persist MATCHED, CONFLICT, NO_MATCH, and UNRESOLVED", { timeout: 120000 }, async () => {
    for (const status of ["MATCHED", "CONFLICT", "NO_MATCH_IN_OBSERVED_WINDOW", "UNRESOLVED"] as const) {
      const f = await fixture();
      try {
        const matching = { source: "ORDER_HISTORY" as const, clientOrderId: f.client, brokerOrderId: "123456789012345678", brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", side: "BUY", quantity: status === "CONFLICT" ? "2" : "1", price: "65000", rawStatus: "FILLED", observedAt: "2026-01-01T00:00:00.000Z" };
        const brokerRead = status === "MATCHED" || status === "CONFLICT" ? readResult([matching]) : status === "NO_MATCH_IN_OBSERVED_WINDOW" ? readResult([]) : readResult([], "FILL_HISTORY");
        const result = await consumeBingXSubmissionReconciliation(f.userId, f.uid, {
          runKey: `mock-read-${status}`,
          reconcile: async () => reconcileBingXSubmission({
            durable: { logicalOrderUid: f.uid, brokerClientOrderId: f.client, symbol: "BTC-USDT", side: "buy", quantity: "1", price: "65000" },
            read: async () => brokerRead,
          }),
        });
        assert.equal(result.status, status);
        const row = await pool!.query("SELECT result,run_status,absence_proven,retry_authorized FROM goodtrading_order_reconciliation_runs WHERE attempt_id=$1 AND run_key=$2", [f.attemptId, `mock-read-${status}`]);
        assert.deepEqual(row.rows[0], { result: status, run_status: "COMPLETED", absence_proven: false, retry_authorized: false });
        const evidence = await pool!.query("SELECT count(*)::int AS n FROM goodtrading_broker_observation_snapshots WHERE broker_object_id IN (SELECT id FROM goodtrading_broker_objects WHERE broker_account_identity=$1)", [f.accountUid]);
        assert.equal(evidence.rows[0].n, status === "MATCHED" ? 1 : 0);
      } finally { await cleanup(f); }
    }
  });

  it("preserves numeric broker IDs as untrusted and rejects them without another identity", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const numeric = normalizeBingXSubmissionObservations("OPEN_ORDERS", { orders: [{ id: 123456789012345678, symbol: "BTC-USDT" }] })[0];
      assert.equal(numeric.brokerOrderId, "123456789012345680");
      assert.equal(numeric.brokerOrderIdPrecisionTrusted, false);
      const result = await observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => readResult([numeric]) });
      assert.deepEqual(result, { scanned: 1, persisted: 0, deduped: 0, rejected: 1, insufficientIdentity: 1, knownGtMatches: 0, sourceFailures: [] });
    } finally { await cleanup(f); }
  });

  it("persists an external OPEN to PARTIALLY_FILLED to FILLED snapshot sequence", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      for (const status of ["OPEN", "PARTIALLY_FILLED", "FILLED"] as const) {
        const result = await observeBingXBrokerObjects({
          brokerAccountIdentity: f.accountUid,
          read: async () => readResult([observation("ORDER_HISTORY", `${f.client}-external`, status, "987654321012345678")]),
        });
        assert.equal(result.persisted, 1);
      }
      const row = await pool!.query("SELECT o.id,o.classification,count(s.id)::int AS snapshots,array_agg(s.raw_broker_status ORDER BY s.observed_at) AS statuses FROM goodtrading_broker_objects o JOIN goodtrading_broker_observation_snapshots s ON s.broker_object_id=o.id WHERE o.broker_account_identity=$1 GROUP BY o.id,o.classification", [f.accountUid]);
      assert.equal(row.rows.length, 1);
      assert.equal(row.rows[0].classification, "BROKER_OBSERVED_ONLY");
      assert.equal(row.rows[0].snapshots, 3);
      assert.deepEqual(row.rows[0].statuses, ["OPEN", "PARTIALLY_FILLED", "FILLED"]);
    } finally { await cleanup(f); }
  });

  it("excludes a fresh SUBMISSION_STARTED attempt from real recovery candidates", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='SUBMISSION_STARTED',started_at=$2 WHERE id=$1", [f.attemptId, new Date("2026-01-01T00:01:30Z")]);
      const candidates = await listRecoveryCandidates(new Date("2026-01-01T00:00:30Z"), 25);
      assert.equal(candidates.some(candidate => candidate.attemptId === f.attemptId), false);
    } finally { await cleanup(f); }
  });

  it("directly recovers UNKNOWN_SUBMISSION_OUTCOME and RECONCILIATION_REQUIRED attempts", { timeout: 120000 }, async () => {
    const fixtures = [await fixture(), await fixture()];
    try {
      await pool!.query("UPDATE goodtrading_order_submission_attempts SET transport_state='UNKNOWN_SUBMISSION_OUTCOME' WHERE id=$1", [fixtures[0].attemptId]);
      const consumed: string[] = [];
      const listCandidates = async (cutoff: Date, limit: number) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => fixtures.some(f => f.attemptId === candidate.attemptId));
      const result = await runBingXCrashRecoverySweep({ now: new Date("2026-01-01T00:02:00Z"), listCandidates, consume: async (_user, uid) => { consumed.push(uid); return { status: "UNRESOLVED" as const }; } });
      assert.equal(result.scanned, 2);
      assert.equal(result.promoted, 1);
      assert.equal(result.consumed, 2);
      assert.deepEqual(new Set(consumed), new Set(fixtures.map(f => f.uid)));
      const rows = await pool!.query("SELECT id,transport_state FROM goodtrading_order_submission_attempts WHERE id=ANY($1::text[]) ORDER BY id", [fixtures.map(f => f.attemptId)]);
      assert.deepEqual(rows.rows.map(row => row.transport_state), ["RECONCILIATION_REQUIRED", "RECONCILIATION_REQUIRED"]);
    } finally { await Promise.all(fixtures.map(f => cleanup(f))); }
  });

  it("skips a latest CONFLICT result without invoking recovery consumption", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const run = await createReconciliationRun({ attemptId: f.attemptId, intentId: f.uid, logicalOrderUid: f.uid, runKey: "conflict-latest", queriedSources: [] });
      await completeReconciliationConflict(String(run.id));
      const result = await runBingXCrashRecoverySweep({
        now: new Date("2026-01-01T00:02:00Z"),
        listCandidates: async (cutoff, limit) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => candidate.attemptId === f.attemptId),
        consume: async () => { throw new Error("CONFLICT must be terminal"); },
      });
      assert.deepEqual(result, { scanned: 1, promoted: 0, consumed: 0, skipped: 1, failed: 0 });
    } finally { await cleanup(f); }
  });

  it("skips recent UNRESOLVED and consumes old UNRESOLVED generations", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const run = await createReconciliationRun({ attemptId: f.attemptId, intentId: f.uid, logicalOrderUid: f.uid, runKey: "unresolved-timing", queriedSources: [] });
      await completeReconciliationUnresolved(String(run.id));
      await pool!.query("UPDATE goodtrading_order_reconciliation_runs SET completed_at='2026-01-01T00:01:30Z' WHERE id=$1", [run.id]);
      const deps = { now: new Date("2026-01-01T00:02:00Z"), listCandidates: async (cutoff: Date, limit: number) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => candidate.attemptId === f.attemptId), consume: async () => ({ status: "UNRESOLVED" as const }) };
      assert.deepEqual(await runBingXCrashRecoverySweep(deps), { scanned: 1, promoted: 0, consumed: 0, skipped: 1, failed: 0 });
      await pool!.query("UPDATE goodtrading_order_reconciliation_runs SET completed_at='2025-12-31T23:00:00Z' WHERE id=$1", [run.id]);
      assert.deepEqual(await runBingXCrashRecoverySweep(deps), { scanned: 1, promoted: 0, consumed: 1, skipped: 0, failed: 0 });
    } finally { await cleanup(f); }
  });

  it("isolates one failed recovery candidate while a second candidate succeeds", { timeout: 120000 }, async () => {
    const fixtures = [await fixture(), await fixture()];
    try {
      const listCandidates = async (cutoff: Date, limit: number) => (await listRecoveryCandidates(cutoff, limit)).filter(candidate => fixtures.some(f => f.attemptId === candidate.attemptId));
      const result = await runBingXCrashRecoverySweep({ now: new Date("2026-01-01T00:02:00Z"), listCandidates, consume: async (_user, uid) => { if (uid === fixtures[0].uid) throw new Error("candidate A failed"); return { status: "UNRESOLVED" as const }; } });
      assert.deepEqual(result, { scanned: 2, promoted: 0, consumed: 1, skipped: 0, failed: 1 });
    } finally { await Promise.all(fixtures.map(f => cleanup(f))); }
  });

  it("races GT MATCHED recovery with external observation into one original GT_LINKED object", { timeout: 120000 }, async () => {
    const f = await fixture();
    try {
      const matched = { status: "MATCHED" as const, logicalOrderUid: f.uid, brokerClientOrderId: f.client, sources: ["ORDER_HISTORY" as const], observations: [observation("ORDER_HISTORY", f.client, "FILLED", "987654321012345678")], sourceStatuses: { OPEN_ORDERS: "loaded" as const, ORDER_HISTORY: "loaded" as const, FILL_HISTORY: "loaded" as const }, absenceProven: false as const, retryAuthorized: false as const };
      const recovery = consumeBingXSubmissionReconciliation(f.userId, f.uid, { runKey: "gt-race", reconcile: async () => matched });
      const external = observeBingXBrokerObjects({ brokerAccountIdentity: f.accountUid, read: async () => readResult([observation("OPEN_ORDERS", f.client, "FILLED", "987654321012345678")]), findOrCreate: async () => { throw new Error("external observer must not create GT-linked order"); } });
      const [recovered, scanned] = await Promise.all([recovery, external]);
      assert.equal(recovered.status, "MATCHED");
      assert.equal(scanned.knownGtMatches, 1);
      const rows = await pool!.query("SELECT id,classification,attempt_id,intent_id FROM goodtrading_broker_objects WHERE broker_account_identity=$1", [f.accountUid]);
      assert.deepEqual(rows.rows, [{ id: rows.rows[0].id, classification: "GT_LINKED", attempt_id: f.attemptId, intent_id: f.uid }]);
      assert.equal(rows.rows.length, 1);
    } finally { await cleanup(f); }
  });

});
