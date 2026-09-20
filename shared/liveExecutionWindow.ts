export type LiveExecutionWindowTimestampPolicy =
  | "PROVIDER_REPORTED_TIMESTAMP"
  /** @deprecated Compatibility alias; source_timestamp is not proven matching-engine time. */
  | "EXECUTION_EVENT_TIME"
  | "GOODTRADING_OBSERVATION_TIME";

export type LiveExecutionWindow = Readonly<{
  startInclusive: string;
  endExclusive: string;
  timestampPolicy: LiveExecutionWindowTimestampPolicy;
}>;

export type LiveExecutionWindowLimits = Readonly<{
  maximumIntervalMs: number;
  pageSize: number;
}>;

const UTC_MILLISECOND = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

function utcMillis(value: string, field: string): number {
  if (typeof value !== "string" || !UTC_MILLISECOND.test(value)) {
    throw new Error(`${field}_MUST_BE_UTC_MILLISECOND_TIMESTAMP`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field}_MUST_BE_VALID_UTC_TIMESTAMP`);
  return parsed;
}

export function createLiveExecutionWindow(input: LiveExecutionWindow): LiveExecutionWindow {
  if (input.timestampPolicy !== "PROVIDER_REPORTED_TIMESTAMP" && input.timestampPolicy !== "EXECUTION_EVENT_TIME" && input.timestampPolicy !== "GOODTRADING_OBSERVATION_TIME") {
    throw new Error("INVALID_LIVE_EXECUTION_WINDOW_TIMESTAMP_POLICY");
  }
  const start = utcMillis(input.startInclusive, "START_INCLUSIVE");
  const end = utcMillis(input.endExclusive, "END_EXCLUSIVE");
  if (start >= end) throw new Error("LIVE_EXECUTION_WINDOW_START_MUST_PRECEDE_END");
  return { startInclusive: input.startInclusive, endExclusive: input.endExclusive, timestampPolicy: input.timestampPolicy };
}

export function validateLiveExecutionWindowLimits(window: LiveExecutionWindow, limits: LiveExecutionWindowLimits): void {
  if (!Number.isSafeInteger(limits.maximumIntervalMs) || limits.maximumIntervalMs <= 0) throw new Error("INVALID_LIVE_EXECUTION_WINDOW_MAXIMUM_INTERVAL");
  if (!Number.isSafeInteger(limits.pageSize) || limits.pageSize <= 0) throw new Error("INVALID_LIVE_EXECUTION_WINDOW_PAGE_SIZE");
  const duration = utcMillis(window.endExclusive, "END_EXCLUSIVE") - utcMillis(window.startInclusive, "START_INCLUSIVE");
  if (duration > limits.maximumIntervalMs) throw new Error("LIVE_EXECUTION_WINDOW_EXCEEDS_CONFIGURED_MAXIMUM");
}

export function windowTimestampColumn(policy: LiveExecutionWindowTimestampPolicy): "source_timestamp" | "observed_at" {
  return policy === "GOODTRADING_OBSERVATION_TIME" ? "observed_at" : "source_timestamp";
}
