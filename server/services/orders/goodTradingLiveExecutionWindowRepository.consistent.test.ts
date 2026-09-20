import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_EXECUTION_WINDOW_QUERY_TIMEOUT,
  LIVE_EXECUTION_WINDOW_RESULT_LIMIT_EXCEEDED,
  selectLiveExecutionEvidenceConsistent,
  type LiveExecutionEvidenceQueryResult,
  type LiveExecutionTransactionClient,
} from "./goodTradingLiveExecutionWindowRepository";

const account = "GT-CONSISTENT-1";
const window = { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:01:00.000Z", timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP" as const };
const limits = { maximumIntervalMs: 120_000, pageSize: 2 };
const scope = (n: number) => [account, "LIVE", "BINGX", "BTC-USDT-PERP", "BINGX", "Perpetual", `ORDER-${n}`, `EXEC-${n}`].join(String.fromCharCode(31));
const evidence = (n: number): Record<string, unknown> => ({
  scope_key: scope(n), goodtrading_account_uid: account, execution_environment: "LIVE", execution_broker: "BINGX",
  execution_market_instrument: "BTC-USDT-PERP", execution_market_venue: "BINGX", execution_market_type: "Perpetual",
  logical_order_uid: `ORDER-${n}`, execution_id: `EXEC-${n}`, source: "FILL_HISTORY", side: "BUY",
  quantity: "0.000000000000000123", price: "1.000000000000000001", fee_amount: "0.000000000000000007", fee_asset: "USDT",
  fee_conflict: false, source_timestamp: `2026-01-01T00:00:00.00000${n}Z`, observed_at: `2026-01-01T00:00:00.10000${n}Z`,
  client_order_id: `CLIENT-${n}`, broker_order_id: `BROKER-${n}`,
});

function fakeClient(options: { failAtCandidate?: boolean } = {}): { client: LiveExecutionTransactionClient; statements: string[]; released: () => boolean } {
  const statements: string[] = [];
  let candidateCalls = 0;
  let released = false;
  const client: LiveExecutionTransactionClient = {
    async query(text): Promise<LiveExecutionQueryResult> {
      statements.push(text);
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK" || text.startsWith("SET TRANSACTION") || text.startsWith("SELECT set_config")) return { rows: [] };
      if (text.includes("WITH candidate")) {
        candidateCalls += 1;
        if (options.failAtCandidate) Object.assign(new Error("cancelled"), { code: "57014" });
        if (options.failAtCandidate) throw Object.assign(new Error("cancelled"), { code: "57014" });
        if (candidateCalls === 1) return { rows: [1, 2, 3].map((n) => ({ scope_key: scope(n), membership_time: `2026-01-01 00:00:00.00000${n}+00` })) };
        return { rows: [{ scope_key: scope(3), membership_time: "2026-01-01 00:00:00.000003+00" }] };
      }
      if (text.includes("unavailable_count")) return { rows: [{ unavailable_count: 0 }] };
      if (text.includes("SELECT concat_ws")) {
        const page = candidateCalls === 1 ? [1, 2] : [3];
        return { rows: page.map(evidence) };
      }
      throw new Error(`unexpected query: ${text}`);
    },
    release: () => { released = true; },
  };
  return { client, statements, released: () => released };
}

test("retrieves all pages through one repeatable-read read-only executor", async () => {
  const fake = fakeClient();
  const result = await selectLiveExecutionEvidenceConsistent({ accountUid: account, window, limits, maximumExecutionCount: 3, queryTimeoutMs: 5000, connect: async () => fake.client });
  assert.equal(result.retrievalCoverage, "COMPLETE");
  assert.equal(result.financialEvidence, "COMPLETE");
  assert.deepEqual(result.eligibleExecutions.map((row) => row.executionId), ["EXEC-1", "EXEC-2", "EXEC-3"]);
  assert.equal(fake.statements.filter((statement) => statement.includes("WITH candidate")).length, 2);
  assert.ok(fake.statements.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"));
  assert.equal(fake.statements.at(-1), "COMMIT");
  assert.equal(fake.released(), true);
});

test("result limit fails closed and rolls back", async () => {
  const fake = fakeClient();
  await assert.rejects(
    () => selectLiveExecutionEvidenceConsistent({ accountUid: account, window, limits, maximumExecutionCount: 2, queryTimeoutMs: 5000, connect: async () => fake.client }),
    { message: LIVE_EXECUTION_WINDOW_RESULT_LIMIT_EXCEEDED },
  );
  assert.equal(fake.statements.at(-1), "ROLLBACK");
  assert.equal(fake.released(), true);
});

test("statement timeout fails closed and releases the transaction", async () => {
  const fake = fakeClient({ failAtCandidate: true });
  await assert.rejects(
    () => selectLiveExecutionEvidenceConsistent({ accountUid: account, window, limits, maximumExecutionCount: 3, queryTimeoutMs: 5, connect: async () => fake.client }),
    { message: LIVE_EXECUTION_WINDOW_QUERY_TIMEOUT },
  );
  assert.equal(fake.statements.at(-1), "ROLLBACK");
  assert.equal(fake.released(), true);
});

type LiveExecutionQueryResult = LiveExecutionEvidenceQueryResult;
