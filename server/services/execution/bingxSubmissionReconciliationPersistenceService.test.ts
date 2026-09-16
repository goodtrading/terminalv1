import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeBingXSubmissionReconciliation } from "./bingxSubmissionReconciliationPersistenceService";

test("durably consumes MATCHED without retry or lifecycle", async () => {
  const calls: string[] = [];
  const result = await consumeBingXSubmissionReconciliation(7, "GT-1", { runKey: "server-run-1", reconcile: async () => ({ status: "MATCHED", logicalOrderUid: "GT-1", brokerClientOrderId: "CLIENT-1", sources: ["OPEN_ORDERS"], observations: [{ source: "OPEN_ORDERS", clientOrderId: "CLIENT-1", brokerOrderId: "123", brokerOrderIdPrecisionTrusted: true, symbol: "BTC-USDT", quantity: "1", price: "2", observedAt: new Date().toISOString() }], sourceStatuses: { OPEN_ORDERS: "loaded", ORDER_HISTORY: "loaded", FILL_HISTORY: "loaded" }, absenceProven: false, retryAuthorized: false }), persist: async (kind) => { calls.push(kind); return { id: "run-1", result: "MATCHED" }; } });
  assert.equal(result.status, "MATCHED"); assert.equal(result.retryAuthorized, false); assert.deepEqual(calls, ["MATCHED"]);
});

test("persists NO_MATCH and UNRESOLVED without absence or retry", async () => {
  for (const status of ["NO_MATCH_IN_OBSERVED_WINDOW", "UNRESOLVED"] as const) {
    const result = await consumeBingXSubmissionReconciliation(7, `GT-${status}`, { runKey: `run-${status}`, reconcile: async () => ({ status, logicalOrderUid: `GT-${status}`, brokerClientOrderId: "CLIENT", sources: [], observations: [], sourceStatuses: { OPEN_ORDERS: "loaded", ORDER_HISTORY: "loaded", FILL_HISTORY: "failed" }, absenceProven: false, retryAuthorized: false, errorCodes: ["BINGX_TIMEOUT"] }), persist: async (kind) => ({ id: `run-${kind}`, result: kind }) });
    assert.equal(result.status, status); assert.equal(result.absenceProven, false); assert.equal(result.retryAuthorized, false);
  }
});

test("does not persist a second result when the same run is already completed", async () => {
  let persisted = 0; const result = await consumeBingXSubmissionReconciliation(7, "GT-REPLAY", { runKey: "same-run", getIntent: async () => ({ goodTradingAccountUid: "ACCOUNT" } as never), listAttempts: async () => [{ attemptId: "attempt-replay", attemptNumber: 1, transportState: "RECONCILIATION_REQUIRED" } as never], getAccount: async () => ({ accountUid: "ACCOUNT" } as never), existingRun: async (attemptId) => { assert.equal(attemptId, "attempt-replay"); return { id: "run-done", runStatus: "COMPLETED", result: "MATCHED" }; }, reconcile: async () => { throw new Error("READ_MUST_NOT_REPEAT"); } });
  assert.equal(result.status, "MATCHED"); assert.equal(result.durableRunId, "run-done"); assert.equal(persisted, 0);
});

test("surfaces durable persistence failure after a successful read", async () => {
  let reads = 0;
  await assert.rejects(() => consumeBingXSubmissionReconciliation(7, "GT-FAIL", { runKey: "run-fail", reconcile: async () => { reads++; return { status: "MATCHED", logicalOrderUid: "GT-FAIL", brokerClientOrderId: "CLIENT", sources: ["OPEN_ORDERS"], observations: [], sourceStatuses: { OPEN_ORDERS: "loaded", ORDER_HISTORY: "loaded", FILL_HISTORY: "loaded" }, absenceProven: false, retryAuthorized: false }; }, persist: async () => { throw new Error("DB_DOWN"); } }), (error: unknown) => (error as { code?: string }).code === "RECONCILIATION_PERSISTENCE_FAILED");
  assert.equal(reads, 1);
});
