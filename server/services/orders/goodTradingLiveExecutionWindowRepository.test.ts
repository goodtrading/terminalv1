import assert from "node:assert/strict";
import test from "node:test";
import { selectLiveExecutionEvidence } from "./goodTradingLiveExecutionWindowRepository";

type Row = Record<string, unknown>;
const candidate = { scope_key: "scope-1", membership_time: "2026-01-01 00:00:00.123456+00" };
const evidence: Row = {
  scope_key: "scope-1", goodtrading_account_uid: "GT-1", execution_environment: "LIVE", execution_broker: "BINGX",
  execution_market_instrument: "BTC-USDT-PERP", execution_market_venue: "BINGX", execution_market_type: "Perpetual",
  logical_order_uid: "GT-ORD-1", execution_id: "EXEC-1", source: "FILL_HISTORY", side: "BUY",
  quantity: "0.000000000000000123", price: "1.000000000000000001", fee_amount: "0.000000000000000007", fee_asset: "USDT",
  fee_conflict: false, source_timestamp: "2026-01-01T00:00:00.123456Z", observed_at: "2026-01-01T00:00:00.223456Z",
  client_order_id: "CLIENT-1", broker_order_id: "BROKER-1",
};

function mockQuery(calls: { text: string; values: readonly unknown[] }[]) {
  return async (text: string, values: readonly unknown[] = []) => {
    calls.push({ text, values });
    if (calls.length === 1) return { rows: [candidate] };
    if (calls.length === 2) return { rows: [{ unavailable_count: 2 }] };
    return { rows: [evidence] };
  };
}

test("filters execution windows in SQL with exact supplied UTC boundaries", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const result = await selectLiveExecutionEvidence({
    accountUid: "GT-1",
    window: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "EXECUTION_EVENT_TIME" },
    limits: { maximumIntervalMs: 60_000, pageSize: 10 },
    query: mockQuery(calls),
  });
  assert.equal(result.eligibleExecutions.length, 1);
  assert.equal(result.unavailable.missingSelectedTimestamp, 2);
  assert.equal(result.eligibleExecutions[0]!.quantity, "0.000000000000000123");
  assert.equal(result.eligibleExecutions[0]!.price, "1.000000000000000001");
  assert.equal(result.eligibleExecutions[0]!.feeAmount, "0.000000000000000007");
  assert.match(calls[0]!.text, /s\.source_timestamp >= \$2::timestamptz/);
  assert.match(calls[0]!.text, /s\.source_timestamp < \$3::timestamptz/);
  assert.deepEqual(calls[0]!.values.slice(0, 3), ["GT-1", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z"]);
});

test("uses observed_at only for the explicit observation-time policy", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  await selectLiveExecutionEvidence({
    accountUid: "GT-1",
    window: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "GOODTRADING_OBSERVATION_TIME" },
    limits: { maximumIntervalMs: 60_000, pageSize: 10 },
    query: mockQuery(calls),
  });
  assert.match(calls[0]!.text, /s\.observed_at >= \$2::timestamptz/);
  assert.match(calls[0]!.text, /s\.observed_at < \$3::timestamptz/);
  assert.doesNotMatch(calls[0]!.text, /s\.source_timestamp >= \$2::timestamptz/);
});

test("fails closed when repeated observations disagree", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const query = async (text: string, values: readonly unknown[] = []) => {
    calls.push({ text, values });
    if (calls.length === 1) return { rows: [candidate] };
    if (calls.length === 2) return { rows: [{ unavailable_count: 0 }] };
    return { rows: [evidence, { ...evidence, price: "2.000000000000000001" }] };
  };
  const result = await selectLiveExecutionEvidence({
    accountUid: "GT-1",
    window: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "EXECUTION_EVENT_TIME" },
    limits: { maximumIntervalMs: 60_000, pageSize: 10 },
    query,
  });
  assert.equal(result.eligibleExecutions.length, 0);
  assert.equal(result.conflicts.length, 1);
});
