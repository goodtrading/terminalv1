import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveExecutionWindowReport,
  LIVE_REPORT_ACCOUNT_NOT_FOUND,
  LIVE_REPORT_INVALID_REQUEST,
  LIVE_REPORT_MAXIMUM_EXECUTION_COUNT,
  LIVE_REPORT_PAGE_SIZE,
  LIVE_REPORT_QUERY_TIMEOUT_MS,
  LIVE_REPORT_MAXIMUM_INTERVAL_MS,
  type LiveExecutionWindowReportDependencies,
} from "./liveExecutionWindowReportService";
import type { LiveExecutionWindowCompleteSelection } from "../orders/goodTradingLiveExecutionWindowRepository";

const base = { userId: 42, startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-02T00:00:00.000Z" };
const selection = (overrides: Partial<LiveExecutionWindowCompleteSelection> = {}): LiveExecutionWindowCompleteSelection => ({
  window: { ...base, timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP" }, accountUid: "owned-account", eligibleExecutions: [], conflicts: [], candidateCount: 0,
  unavailable: { missingSelectedTimestamp: 0 }, retrievalCoverage: "COMPLETE", financialEvidence: "COMPLETE", ...overrides,
});
const deps = (overrides: Partial<LiveExecutionWindowReportDependencies> = {}): LiveExecutionWindowReportDependencies => ({
  getAccount: async () => ({ id: 1, accountUid: "owned-account", userId: 42, createdAt: new Date(0) }),
  select: async () => selection(),
  aggregate: (value) => value as never,
  ...overrides,
});

test("resolves ownership from authenticated user and passes only server limits", async () => {
  let selected: any;
  const result = await buildLiveExecutionWindowReport({ ...base, timestampPolicy: "GOODTRADING_OBSERVATION_TIME" }, deps({
    getAccount: async (userId) => { assert.equal(userId, 42); return { id: 1, accountUid: "server-owned", userId, createdAt: new Date(0) }; },
    select: async (input) => { selected = input; return selection({ accountUid: "server-owned", window: { ...base, timestampPolicy: "GOODTRADING_OBSERVATION_TIME" } }); },
    aggregate: (value) => value as never,
  }));
  assert.equal(selected.accountUid, "server-owned");
  assert.equal(selected.maximumExecutionCount, LIVE_REPORT_MAXIMUM_EXECUTION_COUNT);
  assert.equal(selected.limits.pageSize, LIVE_REPORT_PAGE_SIZE);
  assert.equal(selected.limits.maximumIntervalMs, LIVE_REPORT_MAXIMUM_INTERVAL_MS);
  assert.equal(selected.queryTimeoutMs, LIVE_REPORT_QUERY_TIMEOUT_MS);
  assert.equal(result.accountUid, "server-owned");
});

test("rejects missing accounts, deprecated public policy, malformed and oversized windows", async () => {
  await assert.rejects(() => buildLiveExecutionWindowReport({ ...base, timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP" }, deps({ getAccount: async () => null })), { message: LIVE_REPORT_ACCOUNT_NOT_FOUND });
  await assert.rejects(() => buildLiveExecutionWindowReport({ ...base, timestampPolicy: "EXECUTION_EVENT_TIME" as never }, deps()), { message: LIVE_REPORT_INVALID_REQUEST });
  await assert.rejects(() => buildLiveExecutionWindowReport({ ...base, timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP", startInclusive: "bad" }, deps()), { message: LIVE_REPORT_INVALID_REQUEST });
  await assert.rejects(() => buildLiveExecutionWindowReport({ ...base, timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP", endExclusive: "2026-01-09T00:00:00.001Z" }, deps()), { message: LIVE_REPORT_INVALID_REQUEST });
});

test("does not aggregate incomplete retrieval and fails before account work when cancelled", async () => {
  let aggregated = false;
  await assert.rejects(() => buildLiveExecutionWindowReport({ ...base, timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP" }, deps({ select: async () => selection({ retrievalCoverage: "INCOMPLETE" as never }), aggregate: () => { aggregated = true; return undefined as never; } })), /INCOMPLETE_RETRIEVAL/);
  assert.equal(aggregated, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => buildLiveExecutionWindowReport({ ...base, timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP", signal: controller.signal }, deps()), /LIVE_REPORT_REQUEST_DEADLINE/);
});
