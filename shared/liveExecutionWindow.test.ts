import assert from "node:assert/strict";
import test from "node:test";
import { createLiveExecutionWindow, validateLiveExecutionWindowLimits, windowTimestampColumn } from "./liveExecutionWindow";

test("creates a UTC millisecond half-open window and preserves the explicit policy", () => {
  const window = createLiveExecutionWindow({ startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "EXECUTION_EVENT_TIME" });
  assert.deepEqual(window, { startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "EXECUTION_EVENT_TIME" });
  assert.equal(windowTimestampColumn(window.timestampPolicy), "source_timestamp");
  validateLiveExecutionWindowLimits(window, { maximumIntervalMs: 1000, pageSize: 25 });
});

test("rejects timezone-less, malformed, reversed, and equal intervals", () => {
  assert.throws(() => createLiveExecutionWindow({ startInclusive: "2026-01-01 00:00:00.000", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "EXECUTION_EVENT_TIME" }), /UTC_MILLISECOND/);
  assert.throws(() => createLiveExecutionWindow({ startInclusive: "2026-01-01T00:00:01.000Z", endExclusive: "2026-01-01T00:00:00.000Z", timestampPolicy: "EXECUTION_EVENT_TIME" }), /START_MUST_PRECEDE_END/);
  assert.throws(() => createLiveExecutionWindow({ startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:00.000Z", timestampPolicy: "GOODTRADING_OBSERVATION_TIME" }), /START_MUST_PRECEDE_END/);
});

test("keeps observation time as a separate explicit policy", () => {
  const window = createLiveExecutionWindow({ startInclusive: "2026-01-01T00:00:00.000Z", endExclusive: "2026-01-01T00:00:01.000Z", timestampPolicy: "GOODTRADING_OBSERVATION_TIME" });
  assert.equal(windowTimestampColumn(window.timestampPolicy), "observed_at");
});
