export type LiveExecutionTimestampPolicy =
  | "PROVIDER_REPORTED_TIMESTAMP"
  | "GOODTRADING_OBSERVATION_TIME";

export type LiveExecutionWindowReport = Readonly<{
  window: Readonly<{
    startInclusive: string;
    endExclusive: string;
    timestampPolicy: LiveExecutionTimestampPolicy;
  }>;
  accountUid: string;
  timestampPolicy: LiveExecutionTimestampPolicy;
  retrievalCoverage: "COMPLETE";
  coverage: "COMPLETE_SELECTED_POPULATION" | "ELIGIBLE_SUBTOTAL_ONLY";
  financialEvidence: "COMPLETE" | "PARTIAL" | "CONFLICT";
  candidateCount: number;
  conflictCount: number;
  conflicts: readonly Readonly<{
    scopeKey: string;
    executionId: string;
    observationCount: number;
  }>[];
  unavailable: Readonly<{ missingSelectedTimestamp: number }>;
  groups: readonly LiveExecutionFinancialGroup[];
  orderHistoryCoverage: "NOT_ESTABLISHED";
  completeOrderMetrics: "UNAVAILABLE";
}>;

export type LiveExecutionFinancialGroup = Readonly<{
  accountUid: string;
  environment: "LIVE";
  broker: string;
  source: string;
  instrument: string;
  venue: string;
  marketType: "Spot" | "Perpetual";
  side: string;
  executionCount: number;
  executedQuantity: Readonly<{
    availability: "AVAILABLE";
    value: string;
    unit: null;
    unitAvailability: "NOT_PERSISTED";
  }>;
  weightedPriceNumerator: Readonly<{
    availability: "AVAILABLE";
    kind: "MATHEMATICAL_PRICE_TIMES_QUANTITY";
    value: string;
  }>;
  selectedExecutionVwap: Readonly<{
    availability: "AVAILABLE";
    value: string;
    outputScale: number;
    rounding: "TRUNCATE_TOWARD_ZERO";
  }>;
  fees: readonly Readonly<{
    asset: string;
    amount: string;
    availability: "COMPLETE" | "PARTIAL";
  }>[];
  unavailableFeeExecutionCount: number;
}>;

export type LiveExecutionReportApiResponse =
  | Readonly<{ success: true; report: LiveExecutionWindowReport }>
  | Readonly<{ success: false; code?: string; message?: string }>;

export type LiveExecutionReportState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "success"; report: LiveExecutionWindowReport }>
  | Readonly<{ status: "error"; code: string }>;
