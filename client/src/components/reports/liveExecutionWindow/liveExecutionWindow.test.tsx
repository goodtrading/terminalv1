import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-test-renderer has no installed declaration in this repository.
import TestRenderer, { act } from "react-test-renderer";
import * as ReactRuntime from "react";
import { LiveReportResult } from "./LiveExecutionWindowTab";
import { fetchLiveExecutionWindowReport, serializeUtcInput, useLiveExecutionWindowReport, validateLiveReportInterval } from "./useLiveExecutionWindowReport";
import type { LiveExecutionWindowReport } from "./liveExecutionWindowTypes";

(globalThis as typeof globalThis & { React?: typeof ReactRuntime; IS_REACT_ACT_ENVIRONMENT?: boolean }).React = ReactRuntime;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group = {
  accountUid: "GT-test",
  environment: "LIVE" as const,
  broker: "GoodTrading",
  source: "broker",
  instrument: "BTCUSDT",
  venue: "test",
  marketType: "Perpetual" as const,
  side: "BUY",
  executionCount: 2,
  executedQuantity: { availability: "AVAILABLE" as const, value: "1.250000", unit: null, unitAvailability: "NOT_PERSISTED" as const },
  weightedPriceNumerator: { availability: "AVAILABLE" as const, kind: "MATHEMATICAL_PRICE_TIMES_QUANTITY" as const, value: "125.000000" },
  selectedExecutionVwap: { availability: "AVAILABLE" as const, value: "100.000000000000000000", outputScale: 18, rounding: "TRUNCATE_TOWARD_ZERO" as const },
  fees: [{ asset: "USDT", amount: "0.100000", availability: "PARTIAL" as const }],
  unavailableFeeExecutionCount: 1,
};

const report: LiveExecutionWindowReport = {
  window: { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-02T00:00:00.000Z", timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP" },
  accountUid: "GT-test",
  timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP",
  retrievalCoverage: "COMPLETE",
  coverage: "ELIGIBLE_SUBTOTAL_ONLY",
  financialEvidence: "CONFLICT",
  candidateCount: 3,
  conflictCount: 1,
  conflicts: [{ scopeKey: "scope-2", executionId: "exec-2", observationCount: 2 }],
  unavailable: { missingSelectedTimestamp: 0 },
  groups: [group],
  orderHistoryCoverage: "NOT_ESTABLISHED",
  completeOrderMetrics: "UNAVAILABLE",
};

test("serializes local datetime inputs as explicit UTC timestamps", () => {
  assert.match(serializeUtcInput("2026-01-01T12:30"), /^2026-01-01T/);
  assert.throws(() => serializeUtcInput(""), /LIVE_REPORT_INVALID_REQUEST/);
});

test("rejects intervals longer than seven days", () => {
  assert.throws(() => validateLiveReportInterval("2026-01-01T00:00", "2026-01-09T00:00"), /LIVE_REPORT_INTERVAL_TOO_LARGE/);
  assert.throws(() => validateLiveReportInterval("2026-01-02T00:00", "2026-01-01T00:00"), /LIVE_REPORT_INVALID_REQUEST/);
});

test("calls only the authenticated LIVE execution-window endpoint and preserves policy", async () => {
  const originalFetch = globalThis.fetch;
  let requested = "";
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({ success: true, report }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await fetchLiveExecutionWindowReport("2026-01-01T00:00", "2026-01-02T00:00", "GOODTRADING_OBSERVATION_TIME", new AbortController().signal);
    assert.match(requested, /\/api\/reports\/live-execution-window\?/);
    assert.match(requested, /timestampPolicy=GOODTRADING_OBSERVATION_TIME/);
    assert.equal(result.groups[0]?.selectedExecutionVwap.value, "100.000000000000000000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces typed API errors without exposing server details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, code: "LIVE_REPORT_ACCOUNT_NOT_FOUND", message: "internal details" }), { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(
      () => fetchLiveExecutionWindowReport("2026-01-01T00:00", "2026-01-02T00:00", "PROVIDER_REPORTED_TIMESTAMP", new AbortController().signal),
      { message: "LIVE_REPORT_ACCOUNT_NOT_FOUND" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("presents exact values, unavailable units, partial fees, conflicts and unavailable economics", () => {
  const html = renderToStaticMarkup(createElement(LiveReportResult, { report }));
  assert.match(html, /100\.000000000000000000/);
  assert.match(html, /NOT_PERSISTED/);
  assert.match(html, /partial subtotal/);
  assert.match(html, /Conflicting evidence is excluded/);
  assert.match(html, /UNAVAILABLE/);
  assert.match(html, /No economic notional/);
});

test("renders a successful empty period without inventing totals", () => {
  const emptyReport = { ...report, groups: [], candidateCount: 0, conflictCount: 0, conflicts: [], financialEvidence: "COMPLETE" as const, coverage: "COMPLETE_SELECTED_POPULATION" as const };
  const html = renderToStaticMarkup(createElement(LiveReportResult, { report: emptyReport }));
  assert.match(html, /No executions in this period/);
  assert.doesNotMatch(html, /Quantity/);
});

test("aborts the obsolete request when a newer request starts and on view disposal", async () => {
  const originalFetch = globalThis.fetch;
  const signals: AbortSignal[] = [];
  globalThis.fetch = (async (_input, init) => {
    signals.push(init?.signal as AbortSignal);
    return await new Promise<Response>(() => undefined);
  }) as typeof fetch;
  let submit!: (start: string, end: string, policy: "PROVIDER_REPORTED_TIMESTAMP") => Promise<void>;
  function Harness() {
    ({ submit } = useLiveExecutionWindowReport());
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => { renderer = TestRenderer.create(createElement(Harness)); });
    await act(async () => { void submit("2026-01-01T00:00", "2026-01-02T00:00", "PROVIDER_REPORTED_TIMESTAMP"); await Promise.resolve(); });
    await act(async () => { void submit("2026-01-02T00:00", "2026-01-03T00:00", "PROVIDER_REPORTED_TIMESTAMP"); await Promise.resolve(); });
    assert.equal(signals[0]?.aborted, true);
    await act(async () => { renderer.unmount(); });
    assert.equal(signals[1]?.aborted, true);
  } finally {
    renderer?.unmount();
    globalThis.fetch = originalFetch;
  }
});
