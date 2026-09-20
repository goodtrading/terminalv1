import type { LiveExecutionWindow } from "./liveExecutionWindow";
import {
  addExactDecimal,
  divideExactDecimal,
  multiplyExactDecimal,
  parseExactDecimal,
  serializeExactDecimal,
  zeroExactDecimal,
  type ExactDecimal,
} from "./exactDecimal";
import type {
  LiveExecutionConflict,
  LiveExecutionEvidenceRow,
  LiveExecutionWindowCompleteSelection,
} from "../server/services/orders/goodTradingLiveExecutionWindowRepository";

export type FinancialMetricAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "CONFLICT";
export type LiveExecutionFinancialFee = Readonly<{ asset: string; amount: string; availability: "COMPLETE" | "PARTIAL" }>;
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
  executedQuantity: Readonly<{ availability: "AVAILABLE"; value: string; unit: null; unitAvailability: "NOT_PERSISTED" }>;
  weightedPriceNumerator: Readonly<{ availability: "AVAILABLE"; kind: "MATHEMATICAL_PRICE_TIMES_QUANTITY"; value: string }>;
  selectedExecutionVwap: Readonly<{ availability: "AVAILABLE"; value: string; outputScale: number; rounding: "TRUNCATE_TOWARD_ZERO" }>;
  fees: readonly LiveExecutionFinancialFee[];
  unavailableFeeExecutionCount: number;
}>;

export type LiveExecutionWindowFinancialAggregation = Readonly<{
  window: LiveExecutionWindow;
  accountUid: string;
  timestampPolicy: LiveExecutionWindow["timestampPolicy"];
  retrievalCoverage: "COMPLETE";
  coverage: "COMPLETE_SELECTED_POPULATION" | "ELIGIBLE_SUBTOTAL_ONLY";
  financialEvidence: "COMPLETE" | "PARTIAL" | "CONFLICT";
  candidateCount: number;
  conflictCount: number;
  conflicts: readonly LiveExecutionConflict[];
  unavailable: Readonly<{ missingSelectedTimestamp: number }>;
  groups: readonly LiveExecutionFinancialGroup[];
  orderHistoryCoverage: "NOT_ESTABLISHED";
  completeOrderMetrics: "UNAVAILABLE";
}>;

type Decimal = ExactDecimal;
type GroupKey = string;

function positiveDecimal(value: string, field: string): Decimal {
  const parsed = parseExactDecimal(value);
  if (parsed.units <= (globalThis as any).BigInt(0)) throw new Error(`${field} must be positive`);
  return parsed;
}

function exactFacts(row: LiveExecutionEvidenceRow): string {
  return JSON.stringify([
    row.accountUid, row.environment, row.broker, row.source, row.marketInstrument, row.marketVenue,
    row.marketType, row.logicalOrderUid, row.executionId, row.side, row.quantity, row.price,
    row.feeAmount, row.feeAsset, row.feeConflict, row.sourceTimestamp,
  ]);
}

function groupKey(row: LiveExecutionEvidenceRow): GroupKey {
  return JSON.stringify([
    row.accountUid, row.environment, row.broker, row.source, row.marketInstrument,
    row.marketVenue, row.marketType, row.side,
  ]);
}

function feeRows(rows: readonly LiveExecutionEvidenceRow[]): { fees: LiveExecutionFinancialFee[]; unavailable: number } {
  const byAsset = new Map<string, Decimal>();
  let unavailable = 0;
  for (const row of rows) {
    if (row.feeConflict || row.feeAmount === null || row.feeAsset === null || row.feeAsset.trim() === "") {
      unavailable += 1;
      continue;
    }
    const amount = parseExactDecimal(row.feeAmount);
    byAsset.set(row.feeAsset, addExactDecimal(byAsset.get(row.feeAsset) ?? zeroExactDecimal(), amount));
  }
  const fees = Array.from(byAsset.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([asset, amount]) => ({
    asset,
    amount: serializeExactDecimal(amount),
    availability: unavailable === 0 ? "COMPLETE" as const : "PARTIAL" as const,
  }));
  return { fees, unavailable };
}

export function aggregateLiveExecutionWindow(
  selection: LiveExecutionWindowCompleteSelection,
): LiveExecutionWindowFinancialAggregation {
  if (selection.retrievalCoverage !== "COMPLETE") throw new Error("COMPLETE retrieval coverage is required");

  const byIdentity = new Map<string, LiveExecutionEvidenceRow>();
  for (const row of selection.eligibleExecutions) {
    if (row.environment !== "LIVE") throw new Error("LIVE execution evidence is required");
    if (row.accountUid !== selection.accountUid) throw new Error("execution account scope mismatch");
    positiveDecimal(row.quantity, "quantity");
    positiveDecimal(row.price, "price");
    const previous = byIdentity.get(row.scopeKey);
    if (previous && exactFacts(previous) !== exactFacts(row)) throw new Error("conflicting duplicate execution identity");
    if (!previous) byIdentity.set(row.scopeKey, row);
  }
  if (selection.candidateCount !== byIdentity.size + selection.conflicts.length) {
    throw new Error("complete retrieval candidate count does not match evidence");
  }

  const grouped = new Map<GroupKey, LiveExecutionEvidenceRow[]>();
  for (const row of Array.from(byIdentity.values())) {
    const key = groupKey(row);
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  const groups = Array.from(grouped.values()).map((rows) => {
    const first = rows[0]!;
    let quantity = zeroExactDecimal();
    let numerator = zeroExactDecimal();
    for (const row of rows) {
      const q = parseExactDecimal(row.quantity);
      const p = parseExactDecimal(row.price);
      quantity = addExactDecimal(quantity, q);
      numerator = addExactDecimal(numerator, multiplyExactDecimal(p, q));
    }
    if (quantity.units === (globalThis as any).BigInt(0)) throw new Error("zero quantity denominator");
    const fees = feeRows(rows);
    return {
      accountUid: first.accountUid,
      environment: first.environment,
      broker: first.broker,
      source: first.source,
      instrument: first.marketInstrument,
      venue: first.marketVenue,
      marketType: first.marketType,
      side: first.side,
      executionCount: rows.length,
      executedQuantity: { availability: "AVAILABLE" as const, value: serializeExactDecimal(quantity), unit: null, unitAvailability: "NOT_PERSISTED" as const },
      weightedPriceNumerator: { availability: "AVAILABLE" as const, kind: "MATHEMATICAL_PRICE_TIMES_QUANTITY" as const, value: serializeExactDecimal(numerator) },
      selectedExecutionVwap: { availability: "AVAILABLE" as const, value: serializeExactDecimal(divideExactDecimal(numerator, quantity, 18)), outputScale: 18, rounding: "TRUNCATE_TOWARD_ZERO" as const },
      fees: fees.fees,
      unavailableFeeExecutionCount: fees.unavailable,
    };
  }).sort((a, b) => JSON.stringify([a.accountUid, a.broker, a.source, a.instrument, a.venue, a.marketType, a.side]).localeCompare(JSON.stringify([b.accountUid, b.broker, b.source, b.instrument, b.venue, b.marketType, b.side])));

  const hasConflict = selection.conflicts.length > 0 || selection.financialEvidence === "CONFLICT";
  const hasPartialFees = groups.some((group) => group.unavailableFeeExecutionCount > 0);
  return {
    window: selection.window,
    accountUid: selection.accountUid,
    timestampPolicy: selection.window.timestampPolicy,
    retrievalCoverage: "COMPLETE",
    coverage: hasConflict ? "ELIGIBLE_SUBTOTAL_ONLY" : "COMPLETE_SELECTED_POPULATION",
    financialEvidence: hasConflict ? "CONFLICT" : hasPartialFees || selection.financialEvidence === "PARTIAL" ? "PARTIAL" : "COMPLETE",
    candidateCount: selection.candidateCount,
    conflictCount: selection.conflicts.length,
    conflicts: selection.conflicts,
    unavailable: selection.unavailable,
    groups,
    orderHistoryCoverage: "NOT_ESTABLISHED",
    completeOrderMetrics: "UNAVAILABLE",
  };
}
