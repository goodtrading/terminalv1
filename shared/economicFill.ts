import type { ExecutionMarketIdentity } from "./marketTruth";
import type { AccountIdentity, PortfolioComponentQuality, PortfolioProvenance } from "./portfolioState";

export type EconomicFillSide = "BUY" | "SELL";
export type EconomicFillLiquidityRole = "MAKER" | "TAKER" | "UNKNOWN";

export type EconomicFillValue = Readonly<{
  value: number | string | null;
  currency: string | null;
  quality: PortfolioComponentQuality;
  provenance?: PortfolioProvenance;
}>;

export type EconomicFillOrderReferences = Readonly<{
  clientOrderId?: string;
  venueOrderId?: string;
  canonicalOrderId?: string;
}>;

export type EconomicFillProvenance = Readonly<PortfolioProvenance & {
  executionId?: string;
  marketIdentity?: ExecutionMarketIdentity;
  clientOrderId?: string;
  venueOrderId?: string;
  tradeId?: string;
  sourceSequence?: number | string;
  upstreamEventType?: string;
  upstreamTimestamp?: number | string;
}>;

export type EconomicFillInput = Readonly<{
  executionId: string;
  accountIdentity: AccountIdentity;
  marketIdentity: ExecutionMarketIdentity;
  side: EconomicFillSide;
  quantity: number | string;
  price: number | string;
  fee?: EconomicFillValue;
  slippage?: EconomicFillValue;
  liquidityRole?: EconomicFillLiquidityRole;
  eventTime: number;
  receiveTime?: number;
  sourceSequence?: number | string;
  orderReferences?: EconomicFillOrderReferences;
  provenance: EconomicFillProvenance;
}>;

export type EconomicFillRecord = Readonly<EconomicFillInput>;

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) result[key] = clone(item);
  return result as T;
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
}

function validOptionalTime(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`${field} must be a finite non-negative number`);
}

function validateAccount(account: AccountIdentity): void {
  if (!account || typeof account !== "object") throw new Error("accountIdentity is required");
  requiredText(account.accountId, "accountId");
  requiredText(account.broker, "broker");
  requiredText(account.baseCurrency, "baseCurrency");
  if (account.environment !== "PAPER" && account.environment !== "LIVE") throw new Error("environment is required");
  if (account.accountType !== undefined && account.accountType !== "CASH" && account.accountType !== "MARGIN") throw new Error("accountType is invalid");
}

function validateMarket(market: ExecutionMarketIdentity): void {
  if (!market || typeof market !== "object") throw new Error("marketIdentity is required");
  requiredText(market.instrument, "marketIdentity.instrument");
  requiredText(market.venue, "marketIdentity.venue");
  if (market.marketType !== "Spot" && market.marketType !== "Perpetual") throw new Error("marketIdentity.marketType is invalid");
}

function validateExactDecimal(value: string, field: string): void {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error(`${field} must be an exact decimal string`);
}

function validatePositiveAmount(value: number | string, field: string): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be finite and greater than zero`);
    return;
  }
  validateExactDecimal(value, field);
  if (/^-?0(?:\.0+)?$/.test(value) || value.startsWith("-")) throw new Error(`${field} must be greater than zero`);
}

function validateValue(value: EconomicFillValue | undefined, field: string): void {
  if (value === undefined) return;
  if (typeof value.value === "number" && !Number.isFinite(value.value)) throw new Error(`${field}.value must be finite or null`);
  if (typeof value.value === "string" && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.value)) throw new Error(`${field}.value must be an exact decimal string`);
  if (value.currency !== null && value.currency !== undefined) requiredText(value.currency, `${field}.currency`);
  if (!["VALID", "PARTIAL", "STALE", "UNAVAILABLE"].includes(value.quality)) throw new Error(`${field}.quality is invalid`);
}

function validateReferences(references: EconomicFillOrderReferences | undefined): void {
  if (!references) return;
  for (const [key, value] of Object.entries(references)) if (value !== undefined) requiredText(value, `orderReferences.${key}`);
}

function validateProvenance(provenance: EconomicFillProvenance, executionId: string, market: ExecutionMarketIdentity): void {
  if (!provenance || typeof provenance !== "object") throw new Error("provenance is required");
  requiredText(provenance.source, "provenance.source");
  if (provenance.executionId !== undefined) {
    requiredText(provenance.executionId, "provenance.executionId");
    if (provenance.executionId !== executionId) throw new Error("provenance.executionId must match executionId");
  }
  if (provenance.marketIdentity !== undefined && (provenance.marketIdentity.instrument !== market.instrument || provenance.marketIdentity.venue !== market.venue || provenance.marketIdentity.marketType !== market.marketType)) {
    throw new Error("provenance.marketIdentity must match marketIdentity");
  }
}

export function createEconomicFill(input: EconomicFillInput): EconomicFillRecord {
  requiredText(input.executionId, "executionId");
  validateAccount(input.accountIdentity);
  validateMarket(input.marketIdentity);
  if (input.side !== "BUY" && input.side !== "SELL") throw new Error("side must be BUY or SELL");
  validatePositiveAmount(input.quantity, "quantity");
  validatePositiveAmount(input.price, "price");
  if (!Number.isFinite(input.eventTime) || input.eventTime < 0) throw new Error("eventTime must be finite and non-negative");
  validOptionalTime(input.receiveTime, "receiveTime");
  if (input.liquidityRole !== undefined && !["MAKER", "TAKER", "UNKNOWN"].includes(input.liquidityRole)) throw new Error("liquidityRole is invalid");
  if (input.sourceSequence !== undefined && typeof input.sourceSequence !== "number" && typeof input.sourceSequence !== "string") throw new Error("sourceSequence must be a number or string");
  if (typeof input.sourceSequence === "number" && !Number.isFinite(input.sourceSequence)) throw new Error("sourceSequence must be finite");
  validateValue(input.fee, "fee");
  validateValue(input.slippage, "slippage");
  validateReferences(input.orderReferences);
  validateProvenance(input.provenance, input.executionId, input.marketIdentity);
  return clone(input);
}

function identityPart(record: EconomicFillRecord): string {
  const { accountId, broker, environment, baseCurrency, accountType } = record.accountIdentity;
  const { instrument, venue, marketType } = record.marketIdentity;
  return JSON.stringify([accountId, broker, environment, baseCurrency, accountType ?? null, instrument, venue, marketType, record.executionId]);
}

export function economicFillIdentityKey(record: EconomicFillRecord): string {
  return identityPart(record);
}

function economicContent(record: EconomicFillRecord): string {
  return JSON.stringify({
    identity: identityPart(record),
    side: record.side,
    quantity: record.quantity,
    price: record.price,
    fee: record.fee,
    slippage: record.slippage,
    liquidityRole: record.liquidityRole,
    eventTime: record.eventTime,
    receiveTime: record.receiveTime,
    sourceSequence: record.sourceSequence,
    orderReferences: record.orderReferences,
  });
}

export function economicFillsEqual(a: EconomicFillRecord, b: EconomicFillRecord): boolean {
  return identityPart(a) === identityPart(b) && economicContent(a) === economicContent(b);
}

function compareSequences(a: number | string | undefined, b: number | string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = `${typeof a}:${String(a)}`;
  const right = `${typeof b}:${String(b)}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareEconomicFills(a: EconomicFillRecord, b: EconomicFillRecord): number {
  const byTime = a.eventTime - b.eventTime;
  if (byTime !== 0) return byTime;
  const bySequence = compareSequences(a.sourceSequence, b.sourceSequence);
  if (bySequence !== 0) return bySequence;
  if (a.executionId < b.executionId) return -1;
  if (a.executionId > b.executionId) return 1;
  return 0;
}
