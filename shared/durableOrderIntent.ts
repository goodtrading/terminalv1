import { randomUUID } from "node:crypto";

export type DurableOrderSide = "buy" | "sell";
export type DurableOrderType = "LIMIT";
export type DurableOrderSizeUnit = "BTC" | "USDT";
export type DurableOrderSizingMode = "quantity" | "notional" | "margin";
export type DurableOrderTimeInForce = "GTC" | "IOC" | "FOK" | "GTD" | "DAY";

export type SubmissionTransportState =
  | "PERSISTED"
  | "SUBMISSION_STARTED"
  | "SUBMISSION_RESPONSE_OBSERVED"
  | "SUBMISSION_REJECTED"
  | "UNKNOWN_SUBMISSION_OUTCOME"
  | "RECONCILIATION_REQUIRED";

type CanonicalProductType = "Spot" | "Perpetual";
type CanonicalContractStyle = "Linear" | "Inverse";

export type DurableGoodTradingOrderIntent = Readonly<{
  logicalOrderUid: string;
  goodTradingAccountUid: string;
  executionBroker: string;
  executionEnvironment: string;
  executionMarketInstrument: string;
  executionMarketVenue: string;
  executionMarketType: "Spot" | "Perpetual";
  canonicalBaseAsset: string;
  canonicalQuoteAsset: string;
  canonicalSettlementAsset: string;
  canonicalProductType: CanonicalProductType;
  canonicalContractStyle: CanonicalContractStyle | null;
  canonicalExpiry: null;
  sourceNativeSymbol: string;
  sourceNativeInstrumentId: string | null;
  marketMetadataSource: string;
  marketMappingPolicy: string;
  requestedSide: DurableOrderSide;
  orderType: DurableOrderType;
  requestedSize: string;
  requestedSizeUnit: DurableOrderSizeUnit;
  requestedSizingMode: DurableOrderSizingMode | null;
  resolvedQuantity: string;
  resolvedQuantityUnit: DurableOrderSizeUnit;
  limitPrice: string;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
  timeInForce: DurableOrderTimeInForce | null;
  postOnly: boolean | null;
  reduceOnly: boolean | null;
  requestIdempotencyKey: string | null;
}>;

export type DurableGoodTradingOrderIntentInput = DurableGoodTradingOrderIntent;

export type DurableSubmissionAttempt = Readonly<{
  attemptId: string;
  intentId: string;
  attemptNumber: number;
  brokerClientOrderId: string;
  submittedQuantity: string | null;
  transportState: SubmissionTransportState;
  startedAt: Date | null;
  responseAt: Date | null;
  outcomeAt: Date | null;
  reconciliationRequiredAt: Date | null;
  brokerOrderId: string | null;
  rawBrokerStatus: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorClass: string | null;
}>;

export type DurableSubmissionAttemptInput = DurableSubmissionAttempt;

const TIME_IN_FORCE = new Set<DurableOrderTimeInForce>(["GTC", "IOC", "FOK", "GTD", "DAY"]);
const TRANSPORT_STATES = new Set<SubmissionTransportState>([
  "PERSISTED",
  "SUBMISSION_STARTED",
  "SUBMISSION_RESPONSE_OBSERVED",
  "SUBMISSION_REJECTED",
  "UNKNOWN_SUBMISSION_OUTCOME",
  "RECONCILIATION_REQUIRED",
]);

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value;
}

function decimal(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result) || /^0(?:\.0+)?$/.test(result)) {
    throw new Error(`${field} must be a positive decimal string`);
  }
  return result;
}

export function createDurableGoodTradingOrderIntent(
  input: DurableGoodTradingOrderIntentInput,
): DurableGoodTradingOrderIntent {
  text(input.logicalOrderUid, "logicalOrderUid");
  text(input.goodTradingAccountUid, "goodTradingAccountUid");
  text(input.executionBroker, "executionBroker");
  text(input.executionEnvironment, "executionEnvironment");
  text(input.executionMarketInstrument, "executionMarketInstrument");
  text(input.executionMarketVenue, "executionMarketVenue");
  if (input.executionMarketType !== "Spot" && input.executionMarketType !== "Perpetual") throw new Error("executionMarketType is invalid");
  text(input.canonicalBaseAsset, "canonicalBaseAsset");
  text(input.canonicalQuoteAsset, "canonicalQuoteAsset");
  text(input.canonicalSettlementAsset, "canonicalSettlementAsset");
  if (input.canonicalProductType !== "Spot" && input.canonicalProductType !== "Perpetual") throw new Error("canonicalProductType is invalid");
  if (input.canonicalExpiry !== null) throw new Error("canonicalExpiry must be null");
  if (input.canonicalProductType === "Spot") {
    if (input.canonicalContractStyle !== null) throw new Error("Spot canonicalContractStyle must be null");
  } else if (input.canonicalContractStyle !== "Linear" && input.canonicalContractStyle !== "Inverse") {
    throw new Error("canonicalContractStyle is required for Perpetual");
  }
  text(input.sourceNativeSymbol, "sourceNativeSymbol");
  if (input.sourceNativeInstrumentId !== null) text(input.sourceNativeInstrumentId, "sourceNativeInstrumentId");
  text(input.marketMetadataSource, "marketMetadataSource");
  text(input.marketMappingPolicy, "marketMappingPolicy");
  if (input.requestedSide !== "buy" && input.requestedSide !== "sell") throw new Error("requestedSide is invalid");
  if (input.orderType !== "LIMIT") throw new Error("orderType must be LIMIT");
  decimal(input.requestedSize, "requestedSize");
  if (input.requestedSizeUnit !== "BTC" && input.requestedSizeUnit !== "USDT") throw new Error("requestedSizeUnit is invalid");
  if (input.requestedSizingMode !== null && !["quantity", "notional", "margin"].includes(input.requestedSizingMode)) throw new Error("requestedSizingMode is invalid");
  decimal(input.resolvedQuantity, "resolvedQuantity");
  if (input.resolvedQuantityUnit !== "BTC" && input.resolvedQuantityUnit !== "USDT") throw new Error("resolvedQuantityUnit is invalid");
  decimal(input.limitPrice, "limitPrice");
  if (input.stopLossPrice !== null) decimal(input.stopLossPrice, "stopLossPrice");
  if (input.takeProfitPrice !== null) decimal(input.takeProfitPrice, "takeProfitPrice");
  if (input.timeInForce !== null && !TIME_IN_FORCE.has(input.timeInForce)) throw new Error("timeInForce is invalid");
  if (input.postOnly !== null && typeof input.postOnly !== "boolean") throw new Error("postOnly is invalid");
  if (input.reduceOnly !== null && typeof input.reduceOnly !== "boolean") throw new Error("reduceOnly is invalid");
  if (input.requestIdempotencyKey !== null) text(input.requestIdempotencyKey, "requestIdempotencyKey");
  return { ...input };
}

export function createDurableSubmissionAttempt(
  input: DurableSubmissionAttemptInput,
): DurableSubmissionAttempt {
  text(input.attemptId, "attemptId");
  text(input.intentId, "intentId");
  if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) throw new Error("attemptNumber must be >= 1");
  text(input.brokerClientOrderId, "brokerClientOrderId");
  if (input.submittedQuantity !== null) decimal(input.submittedQuantity, "submittedQuantity");
  if (!TRANSPORT_STATES.has(input.transportState)) throw new Error("transportState is invalid");
  if (input.brokerOrderId !== null) text(input.brokerOrderId, "brokerOrderId");
  if (input.rawBrokerStatus !== null) text(input.rawBrokerStatus, "rawBrokerStatus");
  if (input.httpStatus !== null && (!Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599)) throw new Error("httpStatus is invalid");
  if (input.errorCode !== null) text(input.errorCode, "errorCode");
  if (input.errorClass !== null) text(input.errorClass, "errorClass");
  return { ...input };
}

export function generateLogicalOrderUid(): string {
  return `GT-ORD-${randomUUID()}`;
}

export function generateSubmissionAttemptId(): string {
  return `GT-ATT-${randomUUID()}`;
}

export function generateBrokerClientOrderId(): string {
  return `GT-CLIENT-${randomUUID()}`;
}
