import {
  createEconomicFill,
  economicFillIdentityKey,
  economicFillsEqual,
  type EconomicFillRecord,
} from "../../../../shared/economicFill";
import type {
  BingXCanonicalAccountIdentityResult,
  BingXCanonicalMarketIdentityResult,
} from "./bingxCanonicalIdentity";
import type { PrivateFillRow } from "../../../integrations/bingx/account/normalizers";

export type BingXEconomicFillAdapterErrorCode =
  | "IDENTITY_INVALID"
  | "MARKET_INVALID"
  | "MARKET_SYMBOL_MISMATCH"
  | "UNSAFE_EXECUTION_IDENTITY"
  | "BLOCKED_FILL_QUANTITY_SEMANTICS"
  | "UNSAFE_PRICE_SEMANTICS"
  | "MISSING_BROKER_EVENT_TIME"
  | "UNSAFE_SIDE"
  | "INVALID_FILL_FACT";

export type BingXEconomicFillAdapterFailure = Readonly<{
  ok: false;
  code: BingXEconomicFillAdapterErrorCode;
  message: string;
}>;

export type BingXEconomicFillAdapterSuccess = Readonly<{
  ok: true;
  record: EconomicFillRecord;
}>;

export type BingXEconomicFillAdapterResult =
  | BingXEconomicFillAdapterSuccess
  | BingXEconomicFillAdapterFailure;

export type BingXEconomicFillBatchResult = Readonly<{
  records: readonly EconomicFillRecord[];
  duplicateExecutionIds: readonly string[];
  conflictingExecutionIds: readonly string[];
}>;

const SOURCE_ENDPOINT = "/openApi/swap/v2/trade/allFillOrders";
const EXECUTION_POLICY = "BINGX_EXECUTION_ID_V1";
const EVENT_POLICY = "BINGX_FILL_EVENT_V1";

function failure(code: BingXEconomicFillAdapterErrorCode, message: string): BingXEconomicFillAdapterFailure {
  return { ok: false, code, message };
}

function sourceExecutionId(row: PrivateFillRow): string | undefined {
  const truth = row.privateTruth;
  if (truth.fillIdBasis === "FILL_ID") return truth.sourceFillId?.trim() || undefined;
  if (truth.fillIdBasis === "TRADE_ID") return truth.sourceTradeId?.trim() || undefined;
  return undefined;
}

function sameMarketSymbol(row: PrivateFillRow, market: BingXCanonicalMarketIdentityResult): boolean {
  return market.ok && row.symbol.trim() === market.provenance.brokerSymbol.trim();
}

function eventTimeMs(sourceTimestamp: string | undefined): number | undefined {
  if (!sourceTimestamp) return undefined;
  const value = Date.parse(sourceTimestamp);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function sourceFee(row: PrivateFillRow): EconomicFillRecord["fee"] {
  if (!row.privateTruth.feePresent) return undefined;
  return {
    value: row.fee ?? null,
    currency: row.privateTruth.feeAssetPresent ? row.feeAsset ?? null : null,
    quality: "VALID",
    provenance: {
      source: "BINGX_ACCOUNT_READ_ONLY",
      broker: "BINGX",
      upstream: {
        endpoint: SOURCE_ENDPOINT,
        feeSource: row.privateTruth.feePresent ? "fee|commission" : undefined,
        feeAssetSource: row.privateTruth.feeAssetPresent ? "feeAsset|commissionAsset" : undefined,
      },
    },
  };
}

export function adaptBingXEconomicFill(
  row: PrivateFillRow,
  account: BingXCanonicalAccountIdentityResult,
  market: BingXCanonicalMarketIdentityResult,
): BingXEconomicFillAdapterResult {
  if (!account.ok) return failure("IDENTITY_INVALID", account.message);
  if (!market.ok) return failure("MARKET_INVALID", market.message);
  if (!sameMarketSymbol(row, market)) {
    return failure("MARKET_SYMBOL_MISMATCH", "fill symbol does not match the explicit BingX market identity");
  }

  const executionId = sourceExecutionId(row);
  if (!executionId) {
    return failure(
      "UNSAFE_EXECUTION_IDENTITY",
      `fillIdBasis ${row.privateTruth.fillIdBasis} is not a proven per-execution identity`,
    );
  }
  if (row.privateTruth.quantitySemantics !== "INDIVIDUAL_EXECUTION") {
    return failure(
      "BLOCKED_FILL_QUANTITY_SEMANTICS",
      `quantity source ${row.privateTruth.quantitySource ?? "MISSING"} is not proven to be an individual execution quantity`,
    );
  }
  if (!row.privateTruth.quantitySource) {
    return failure("BLOCKED_FILL_QUANTITY_SEMANTICS", "factual quantity source is missing");
  }
  if (!row.privateTruth.priceSource || row.privateTruth.priceSource === "avgPrice") {
    return failure(
      "UNSAFE_PRICE_SEMANTICS",
      `price source ${row.privateTruth.priceSource ?? "MISSING"} is not proven to be execution price`,
    );
  }
  if (row.privateTruth.timestampOrigin !== "BROKER") {
    return failure("MISSING_BROKER_EVENT_TIME", "factual broker execution timestamp is required");
  }
  const eventTime = eventTimeMs(row.privateTruth.sourceTimestamp);
  if (eventTime === undefined) return failure("MISSING_BROKER_EVENT_TIME", "sourceTimestamp is not a valid broker timestamp");
  if (row.side !== "buy" && row.side !== "sell") return failure("UNSAFE_SIDE", "fill side must be factual buy or sell");
  if (!Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.price) || row.price <= 0) {
    return failure("INVALID_FILL_FACT", "factual execution quantity and price must be positive finite numbers");
  }

  const brokerLink = account.provenance.brokerLinkBasis === "BROKER_ACCOUNT_ID"
    ? { brokerAccountId: account.provenance.brokerNativeAccountId }
    : { connectionPseudonym: account.provenance.connectionPseudonymBasis };
  const provenance = {
    source: "BINGX_ACCOUNT_READ_ONLY",
    broker: "BINGX",
    executionId,
    marketIdentity: market.identity,
    venueOrderId: row.exchangeOrderId,
    upstreamTimestamp: row.privateTruth.sourceTimestamp,
    upstreamEventType: "FILL",
    upstream: {
      endpoint: SOURCE_ENDPOINT,
      sourceEndpoint: SOURCE_ENDPOINT,
      brokerSymbol: market.provenance.brokerSymbol,
      sourceEnvironment: account.provenance.sourceEnvironment,
      accountIdBasis: account.provenance.accountIdBasis,
      brokerLinkBasis: account.provenance.brokerLinkBasis,
      ...brokerLink,
      executionIdBasis: row.privateTruth.fillIdBasis,
      quantitySource: row.privateTruth.quantitySource,
      priceSource: row.privateTruth.priceSource,
      eventTimeSource: "privateTruth.sourceTimestamp",
      receiveTimeSource: "UNAVAILABLE_REST_READ",
      realizedPnl: row.realizedPnl,
    },
  };
  const record = createEconomicFill({
    executionId,
    accountIdentity: account.identity,
    marketIdentity: market.identity,
    side: row.side === "buy" ? "BUY" : "SELL",
    quantity: row.quantity,
    price: row.price,
    fee: sourceFee(row),
    liquidityRole: "UNKNOWN",
    eventTime,
    orderReferences: row.exchangeOrderId ? { venueOrderId: row.exchangeOrderId } : undefined,
    provenance,
  });
  return { ok: true, record };
}

export function deduplicateBingXEconomicFills(
  records: readonly EconomicFillRecord[],
): BingXEconomicFillBatchResult {
  const byIdentity = new Map<string, EconomicFillRecord>();
  const duplicate = new Set<string>();
  const conflict = new Set<string>();
  for (const record of records) {
    const key = economicFillIdentityKey(record);
    const previous = byIdentity.get(key);
    if (!previous) {
      byIdentity.set(key, record);
    } else if (economicFillsEqual(previous, record)) {
      duplicate.add(record.executionId);
    } else {
      conflict.add(record.executionId);
    }
  }
  return {
    records: Array.from(byIdentity.values()),
    duplicateExecutionIds: Array.from(duplicate).sort(),
    conflictingExecutionIds: Array.from(conflict).sort(),
  };
}

export const bingXEconomicFillPolicies = Object.freeze({
  executionId: EXECUTION_POLICY,
  eventId: EVENT_POLICY,
  sourceEndpoint: SOURCE_ENDPOINT,
  liquidityRole: "UNKNOWN",
  slippage: "UNAVAILABLE",
  realizedPnl: "OBSERVATION_ONLY",
});
