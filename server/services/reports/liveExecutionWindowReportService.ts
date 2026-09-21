import { getGoodTradingAccountByUserIdReadOnly } from "../accounts/goodTradingAccountRepository";
import {
  selectLiveExecutionEvidenceConsistent,
  LIVE_EXECUTION_WINDOW_CANCELLED,
  LIVE_EXECUTION_WINDOW_QUERY_TIMEOUT,
  LIVE_EXECUTION_WINDOW_RESULT_LIMIT_EXCEEDED,
  type LiveExecutionWindowCompleteSelection,
} from "../orders/goodTradingLiveExecutionWindowRepository";
import { aggregateLiveExecutionWindow, type LiveExecutionWindowFinancialAggregation } from "../../../shared/liveExecutionWindowAggregation";
import {
  createLiveExecutionWindow,
  validateLiveExecutionWindowLimits,
  type LiveExecutionWindow,
  type LiveExecutionWindowTimestampPolicy,
} from "../../../shared/liveExecutionWindow";

export const LIVE_REPORT_MAXIMUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const LIVE_REPORT_MAXIMUM_EXECUTION_COUNT = 10_000;
export const LIVE_REPORT_PAGE_SIZE = 250;
export const LIVE_REPORT_QUERY_TIMEOUT_MS = 5_000;
export const LIVE_REPORT_REQUEST_DEADLINE_MS = 30_000;

export const LIVE_REPORT_ACCOUNT_NOT_FOUND = "LIVE_REPORT_ACCOUNT_NOT_FOUND";
export const LIVE_REPORT_INVALID_REQUEST = "LIVE_REPORT_INVALID_REQUEST";
export const LIVE_REPORT_REQUEST_DEADLINE = "LIVE_REPORT_REQUEST_DEADLINE";

export type LiveExecutionWindowReportDependencies = Readonly<{
  getAccount: typeof getGoodTradingAccountByUserIdReadOnly;
  select: typeof selectLiveExecutionEvidenceConsistent;
  aggregate: typeof aggregateLiveExecutionWindow;
}>;

const defaultDependencies: LiveExecutionWindowReportDependencies = {
  getAccount: getGoodTradingAccountByUserIdReadOnly,
  select: selectLiveExecutionEvidenceConsistent,
  aggregate: aggregateLiveExecutionWindow,
};

export type LiveExecutionWindowReportInput = Readonly<{
  userId: number;
  startInclusive: string;
  endExclusive: string;
  timestampPolicy: LiveExecutionWindowTimestampPolicy;
  signal?: AbortSignal;
}>;

function publicWindow(input: LiveExecutionWindowReportInput): LiveExecutionWindow {
  if (input.timestampPolicy !== "PROVIDER_REPORTED_TIMESTAMP" && input.timestampPolicy !== "GOODTRADING_OBSERVATION_TIME") {
    throw new Error(LIVE_REPORT_INVALID_REQUEST);
  }
  try {
    const window = createLiveExecutionWindow({
      startInclusive: input.startInclusive,
      endExclusive: input.endExclusive,
      timestampPolicy: input.timestampPolicy,
    });
    validateLiveExecutionWindowLimits(window, {
      maximumIntervalMs: LIVE_REPORT_MAXIMUM_INTERVAL_MS,
      pageSize: LIVE_REPORT_PAGE_SIZE,
    });
    return window;
  } catch {
    throw new Error(LIVE_REPORT_INVALID_REQUEST);
  }
}

export async function buildLiveExecutionWindowReport(
  input: LiveExecutionWindowReportInput,
  dependencies: LiveExecutionWindowReportDependencies = defaultDependencies,
): Promise<LiveExecutionWindowFinancialAggregation> {
  if (input.signal?.aborted) throw new Error(LIVE_REPORT_REQUEST_DEADLINE);
  const window = publicWindow(input);
  const account = await dependencies.getAccount(input.userId, input.signal);
  if (!account) throw new Error(LIVE_REPORT_ACCOUNT_NOT_FOUND);
  if (input.signal?.aborted) throw new Error(LIVE_REPORT_REQUEST_DEADLINE);

  let selection: LiveExecutionWindowCompleteSelection;
  try {
    selection = await dependencies.select({
      accountUid: account.accountUid,
      window,
      limits: {
        maximumIntervalMs: LIVE_REPORT_MAXIMUM_INTERVAL_MS,
        pageSize: LIVE_REPORT_PAGE_SIZE,
      },
      maximumExecutionCount: LIVE_REPORT_MAXIMUM_EXECUTION_COUNT,
      queryTimeoutMs: LIVE_REPORT_QUERY_TIMEOUT_MS,
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal?.aborted) throw new Error(LIVE_REPORT_REQUEST_DEADLINE);
    if (error instanceof Error && [LIVE_EXECUTION_WINDOW_CANCELLED, LIVE_EXECUTION_WINDOW_QUERY_TIMEOUT, LIVE_EXECUTION_WINDOW_RESULT_LIMIT_EXCEEDED].includes(error.message)) throw error;
    throw error;
  }
  if (selection.retrievalCoverage !== "COMPLETE") throw new Error("LIVE_REPORT_INCOMPLETE_RETRIEVAL");
  return dependencies.aggregate(selection);
}
