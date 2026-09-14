import {
  compareEconomicFills,
  createEconomicFill,
  economicFillIdentityKey,
  type EconomicFillRecord,
} from "../../shared/economicFill";
import type { ExecutionMarketIdentity } from "../../shared/marketTruth";
import type {
  AccountIdentity,
  BalanceComponent,
  EquityComponent,
  FundingSummary,
  MarginSummary,
  PnlComponent,
  PortfolioComponentQuality,
  PortfolioConsistencyIssue,
  PortfolioProvenance,
  PortfolioReferencePrice,
  PortfolioState,
  PositionState,
} from "../../shared/portfolioState";

export type NautilusInstrumentSnapshotInput = Readonly<{
  venue: string;
  market_type: string;
  symbol: string;
}>;

export type NautilusAccountSnapshotInput = Readonly<{
  account_id: string;
  venue: string;
  account_type?: string | null;
  base_currency: string;
  balance_total?: number | string | null;
  balance_free?: number | string | null;
  balance_locked?: number | string | null;
  equity?: number | string | null;
  realized_pnl?: number | string | null;
  unrealized_pnl?: number | string | null;
  fees_total?: number | string | null;
  timestamp: number;
  instrument: NautilusInstrumentSnapshotInput;
  snapshot_id?: string;
}>;

export type NautilusPositionSnapshotInput = Readonly<{
  instrument_id: string;
  side: string;
  quantity: number | string;
  average_entry_price?: number | string | null;
  mark_price?: number | string | null;
  realized_pnl?: number | string | null;
  unrealized_pnl?: number | string | null;
  fees_total?: number | string | null;
  opened_at?: number | null;
  updated_at?: number | null;
  position_id?: string;
}>;

export type NautilusFillSnapshotInput = Readonly<{
  fill_id: string;
  client_order_id: string;
  venue_order_id?: string | null;
  instrument_id: string;
  side: string;
  price: number | string;
  quantity: number | string;
  timestamp: number;
  fee?: number | string | null;
  fee_asset?: string | null;
  liquidity?: string | null;
  trade_id?: string | null;
  source_sequence?: number | string;
}>;

export type NautilusPortfolioSnapshotInput = Readonly<{
  account: NautilusAccountSnapshotInput;
  positions?: readonly NautilusPositionSnapshotInput[];
  fills?: readonly NautilusFillSnapshotInput[];
}>;

export type NautilusPaperAdapterConfig = Readonly<{ capturedAt: number }>;

export type NautilusPaperPortfolioAdapterResult = Readonly<{
  portfolio: PortfolioState;
  fills: readonly EconomicFillRecord[];
}>;

const SOURCE = "NAUTILUS_PAPER";

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = clone(item);
  return output as T;
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
}

function numberOrNull(value: number | string | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be finite or null`);
  return parsed;
}

function qualityFor(value: number | null): PortfolioComponentQuality {
  return value === null ? "UNAVAILABLE" : "VALID";
}

function provenanceFor(account: NautilusAccountSnapshotInput, market: ExecutionMarketIdentity, extra: (Partial<PortfolioProvenance> & Record<string, unknown>) = {}): PortfolioProvenance {
  return {
    source: SOURCE,
    broker: SOURCE,
    accountId: account.account_id,
    marketIdentity: market,
    ...(account.snapshot_id ? { snapshotIds: [account.snapshot_id] } : {}),
    ...extra,
  } as PortfolioProvenance;
}

function component(
  value: number | null,
  currency: string,
  account: NautilusAccountSnapshotInput,
  market: ExecutionMarketIdentity,
  timestamp: number | null,
  extra: Partial<PortfolioProvenance> = {},
): BalanceComponent {
  return {
    value,
    currency,
    unit: currency,
    quality: qualityFor(value),
    timestamps: { snapshotTime: timestamp },
    provenance: provenanceFor(account, market, extra),
  };
}

function pnlComponent(
  value: number | null,
  currency: string,
  account: NautilusAccountSnapshotInput,
  market: ExecutionMarketIdentity,
  timestamp: number | null,
  basis: "GROSS_PRICE_PNL" | "NET" = "GROSS_PRICE_PNL",
): PnlComponent {
  return { ...component(value, currency, account, market, timestamp), basis };
}

function unavailableComponent(currency: string, account: NautilusAccountSnapshotInput, market: ExecutionMarketIdentity): BalanceComponent {
  return component(null, currency, account, market, null);
}

function marketIdentity(account: NautilusAccountSnapshotInput): ExecutionMarketIdentity {
  const instrument = account.instrument;
  requiredText(instrument.symbol, "account.instrument.symbol");
  requiredText(instrument.venue, "account.instrument.venue");
  const marketType = instrument.market_type.toLowerCase();
  if (marketType === "perpetual" || marketType === "perp") return { instrument: instrument.symbol, venue: instrument.venue, marketType: "Perpetual" };
  if (marketType === "spot") return { instrument: instrument.symbol, venue: instrument.venue, marketType: "Spot" };
  throw new Error("unsupported Nautilus market type");
}

function accountIdentity(input: NautilusAccountSnapshotInput): AccountIdentity {
  requiredText(input.account_id, "account.account_id");
  requiredText(input.base_currency, "account.base_currency");
  const accountType = input.account_type?.toLowerCase();
  return {
    accountId: input.account_id,
    broker: SOURCE,
    environment: "PAPER",
    baseCurrency: input.base_currency,
    ...(accountType === "margin" ? { accountType: "MARGIN" as const } : accountType === "cash" ? { accountType: "CASH" as const } : {}),
  };
}

function referencePrice(
  value: number | null,
  account: NautilusAccountSnapshotInput,
  market: ExecutionMarketIdentity,
): PortfolioReferencePrice | null {
  if (value === null) return null;
  return {
    value,
    priceType: "MARK",
    source: SOURCE,
    eventTime: null,
    quality: "PARTIAL",
    provenance: provenanceFor(account, market),
  };
}

function positionId(position: NautilusPositionSnapshotInput, identity: AccountIdentity, market: ExecutionMarketIdentity): string {
  if (position.position_id !== undefined) {
    requiredText(position.position_id, "position.position_id");
    return position.position_id;
  }
  return `${identity.accountId}:${identity.broker}:${market.instrument}:${market.venue}:${market.marketType}`;
}

function adaptPosition(
  position: NautilusPositionSnapshotInput,
  accountInput: NautilusAccountSnapshotInput,
  identity: AccountIdentity,
  market: ExecutionMarketIdentity,
): PositionState {
  const quantity = numberOrNull(position.quantity, "position.quantity");
  if (quantity === null || quantity < 0) throw new Error("position.quantity must be non-negative");
  const side = position.side.toUpperCase();
  if (side !== "LONG" && side !== "SHORT" && side !== "FLAT") throw new Error("unsupported position side");
  if (side === "FLAT" && quantity !== 0) throw new Error("FLAT position must have zero quantity");
  if (side !== "FLAT" && quantity <= 0) throw new Error("LONG/SHORT position must have positive quantity");
  const mark = numberOrNull(position.mark_price, "position.mark_price");
  const timestamp = position.updated_at ?? accountInput.timestamp;
  return {
    accountIdentity: identity,
    marketIdentity: market,
    positionId: positionId(position, identity, market),
    side,
    quantity,
    averageEntryPrice: numberOrNull(position.average_entry_price, "position.average_entry_price"),
    referencePrice: referencePrice(mark, accountInput, market),
    realizedPnl: pnlComponent(numberOrNull(position.realized_pnl, "position.realized_pnl"), accountInput.base_currency, accountInput, market, timestamp),
    unrealizedPnl: pnlComponent(numberOrNull(position.unrealized_pnl, "position.unrealized_pnl"), accountInput.base_currency, accountInput, market, timestamp),
    fees: component(numberOrNull(position.fees_total, "position.fees_total"), accountInput.base_currency, accountInput, market, timestamp),
    openedAt: position.opened_at ?? null,
    updatedAt: timestamp,
    quality: mark === null ? "PARTIAL" : "VALID",
    provenance: provenanceFor(accountInput, market, { identifiers: { positionId: positionId(position, identity, market), instrumentId: position.instrument_id } }),
  };
}

function adaptFill(fill: NautilusFillSnapshotInput, accountInput: NautilusAccountSnapshotInput, market: ExecutionMarketIdentity): EconomicFillRecord {
  requiredText(fill.fill_id, "fill.fill_id");
  requiredText(fill.client_order_id, "fill.client_order_id");
  const side = fill.side.toUpperCase();
  if (side !== "BUY" && side !== "SELL") throw new Error("fill.side must be BUY or SELL");
  const feeValue = numberOrNull(fill.fee, "fill.fee");
  return createEconomicFill({
    executionId: fill.fill_id,
    accountIdentity: accountIdentity(accountInput),
    marketIdentity: market,
    side,
    quantity: numberOrNull(fill.quantity, "fill.quantity") as number,
    price: numberOrNull(fill.price, "fill.price") as number,
    fee: { value: feeValue, currency: fill.fee_asset ?? null, quality: qualityFor(feeValue), provenance: provenanceFor(accountInput, market, { executionId: fill.fill_id, clientOrderId: fill.client_order_id, venueOrderId: fill.venue_order_id ?? undefined, tradeId: fill.trade_id ?? undefined, sourceSequence: fill.source_sequence, upstreamTimestamp: fill.timestamp }) },
    liquidityRole: fill.liquidity?.toUpperCase() === "MAKER" ? "MAKER" : fill.liquidity?.toUpperCase() === "TAKER" ? "TAKER" : "UNKNOWN",
    eventTime: fill.timestamp,
    sourceSequence: fill.source_sequence,
    orderReferences: { clientOrderId: fill.client_order_id, ...(fill.venue_order_id ? { venueOrderId: fill.venue_order_id } : {}) },
    provenance: provenanceFor(accountInput, market, { executionId: fill.fill_id, clientOrderId: fill.client_order_id, venueOrderId: fill.venue_order_id ?? undefined, tradeId: fill.trade_id ?? undefined, sourceSequence: fill.source_sequence, upstreamEventType: "execution.fill", upstreamTimestamp: fill.timestamp }),
  });
}

function qualityForSet(values: readonly PortfolioComponentQuality[]): PortfolioComponentQuality {
  if (values.includes("UNAVAILABLE")) return "PARTIAL";
  if (values.includes("STALE")) return "STALE";
  if (values.includes("PARTIAL")) return "PARTIAL";
  return "VALID";
}

export function adaptNautilusPaperPortfolio(
  input: NautilusPortfolioSnapshotInput,
  config: NautilusPaperAdapterConfig,
): NautilusPaperPortfolioAdapterResult {
  if (!Number.isFinite(config.capturedAt) || config.capturedAt < 0) throw new Error("capturedAt must be finite and non-negative");
  const accountInput = input.account;
  const identity = accountIdentity(accountInput);
  const market = marketIdentity(accountInput);
  const timestamp = accountInput.timestamp;
  if (!Number.isFinite(timestamp) || timestamp < 0) throw new Error("account.timestamp must be finite and non-negative");
  const total = component(numberOrNull(accountInput.balance_total, "account.balance_total"), accountInput.base_currency, accountInput, market, timestamp);
  const available = component(numberOrNull(accountInput.balance_free, "account.balance_free"), accountInput.base_currency, accountInput, market, timestamp);
  const locked = component(numberOrNull(accountInput.balance_locked, "account.balance_locked"), accountInput.base_currency, accountInput, market, timestamp);
  const marginUsed = unavailableComponent(accountInput.base_currency, accountInput, market);
  const equity: EquityComponent = component(numberOrNull(accountInput.equity, "account.equity"), accountInput.base_currency, accountInput, market, timestamp);
  const realized = pnlComponent(numberOrNull(accountInput.realized_pnl, "account.realized_pnl"), accountInput.base_currency, accountInput, market, timestamp, "NET");
  const unrealized = pnlComponent(numberOrNull(accountInput.unrealized_pnl, "account.unrealized_pnl"), accountInput.base_currency, accountInput, market, timestamp);
  const fees = { total: component(numberOrNull(accountInput.fees_total, "account.fees_total"), accountInput.base_currency, accountInput, market, timestamp) };
  const unavailable = unavailableComponent(accountInput.base_currency, accountInput, market);
  const positions = (input.positions ?? []).map((position) => adaptPosition(position, accountInput, identity, market));
  const fills = (input.fills ?? []).map((fill) => adaptFill(fill, accountInput, market)).sort(compareEconomicFills);
  const issues: PortfolioConsistencyIssue[] = [];
  const fillKeys = new Set<string>();
  for (const fill of fills) {
    const key = economicFillIdentityKey(fill);
    if (fillKeys.has(key)) issues.push("DUPLICATE_FILL");
    fillKeys.add(key);
  }
  const funding: FundingSummary = { total: unavailable };
  const margin: MarginSummary = { available, locked, marginUsed, collateral: unavailable, maintenanceMargin: unavailable };
  const exposure = {
    positionCount: { value: null, unit: "count", quality: "UNAVAILABLE" as const, timestamps: { snapshotTime: null }, provenance: provenanceFor(accountInput, market) },
    grossNotional: unavailable,
    netNotional: unavailable,
    grossExposure: unavailable,
    netExposure: unavailable,
  };
  const quality = {
    balances: qualityForSet([total.quality, available.quality, locked.quality]),
    equity: equity.quality,
    positions: positions.length === 0 ? "VALID" as const : qualityForSet(positions.map((position) => position.quality)),
    realizedPnl: realized.quality,
    unrealizedPnl: unrealized.quality,
    fees: fees.total.quality,
    funding: "UNAVAILABLE" as const,
    margin: "PARTIAL" as const,
    exposure: "PARTIAL" as const,
    overall: "PARTIAL" as const,
  };
  const portfolio: PortfolioState = {
    accountIdentity: identity,
    balances: { total, available, locked, marginUsed },
    equity,
    positions,
    pnl: { realized, unrealized },
    fees,
    funding,
    margin,
    exposure,
    quality,
    timestamps: { snapshotTime: timestamp, capturedAt: config.capturedAt },
    provenance: provenanceFor(accountInput, market),
    consistency: { status: issues.length ? "INCONSISTENT" : "CONSISTENT", issues },
    capturedAt: config.capturedAt,
  };
  return clone({ portfolio, fills });
}
