import type { ExecutionMarketIdentity } from "./marketTruth";

export type AccountEnvironment = "PAPER" | "LIVE";
export type AccountType = "CASH" | "MARGIN";
export type PortfolioComponentQuality = "VALID" | "PARTIAL" | "STALE" | "UNAVAILABLE";
export type PortfolioConsistencyStatus = "CONSISTENT" | "PARTIAL" | "INCONSISTENT";
export type PositionSide = "LONG" | "SHORT" | "FLAT";
export type ReferencePriceType = "MARK" | "LAST" | "MID" | "OTHER";

export type PortfolioConsistencyIssue =
  | "POSITION_QUANTITY_MISMATCH"
  | "EQUITY_MISMATCH"
  | "REALIZED_FEE_DOUBLE_COUNT_RISK"
  | "MISSING_REFERENCE_PRICE"
  | "ACCOUNT_IDENTITY_MISMATCH"
  | "STALE_BALANCE"
  | "STALE_REFERENCE_PRICE"
  | "DUPLICATE_FILL"
  | "SEQUENCE_ISSUE"
  | "NEGATIVE_IMPOSSIBLE_BALANCE"
  | "UNSUPPORTED_SPOT_SHORT"
  | "CROSS_ACCOUNT_EVENT"
  | "PORTFOLIO_AGGREGATE_MISMATCH";

export type PortfolioTimestamps = Readonly<{
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  updatedAt?: number | null;
  capturedAt?: number | null;
}>;

export type PortfolioProvenance = Readonly<{
  source: string;
  broker?: string;
  /** Native account identifier supplied by the execution/source backend; not logical ownership. */
  executionAccountId?: string;
  accountId?: string;
  marketIdentity?: ExecutionMarketIdentity;
  eventIds?: readonly string[];
  fillIds?: readonly string[];
  snapshotIds?: readonly string[];
  referencePriceSource?: string;
  upstream?: unknown;
}>;

export type PortfolioValue<T> = Readonly<{
  value: T | null;
  unit: string;
  quality: PortfolioComponentQuality;
  timestamps: PortfolioTimestamps;
  provenance: PortfolioProvenance;
}>;

export type BalanceComponent = PortfolioValue<number> & Readonly<{ currency: string }>;
export type EquityComponent = BalanceComponent;
export type PnlComponent = BalanceComponent & Readonly<{
  basis?: "GROSS_PRICE_PNL" | "NET";
}>;
export type FeeSummary = Readonly<{
  total: BalanceComponent;
  maker?: BalanceComponent;
  taker?: BalanceComponent;
  other?: BalanceComponent;
}>;
export type FundingSummary = Readonly<{
  total: BalanceComponent;
  rate?: PortfolioValue<number>;
}>;
export type MarginSummary = Readonly<{
  available?: BalanceComponent;
  locked?: BalanceComponent;
  marginUsed?: BalanceComponent;
  collateral?: BalanceComponent;
  maintenanceMargin?: BalanceComponent;
}>;
export type ExposureSummary = Readonly<{
  positionCount: PortfolioValue<number>;
  grossNotional?: BalanceComponent;
  netNotional?: BalanceComponent;
  grossExposure?: BalanceComponent;
  netExposure?: BalanceComponent;
}>;

export type AccountIdentity = Readonly<{
  accountId: string;
  broker: string;
  environment: AccountEnvironment;
  baseCurrency: string;
  accountType?: AccountType;
}>;

export type PortfolioReferencePrice = Readonly<{
  value: number | null;
  priceType: ReferencePriceType;
  source: string;
  eventTime: number | null;
  receiveTime?: number | null;
  quality: PortfolioComponentQuality;
  provenance: PortfolioProvenance;
}>;

export type PositionState = Readonly<{
  accountIdentity: AccountIdentity;
  marketIdentity: ExecutionMarketIdentity;
  positionId: string;
  side: PositionSide;
  quantity: number;
  averageEntryPrice: number | null;
  referencePrice: PortfolioReferencePrice | null;
  realizedPnl: PnlComponent;
  unrealizedPnl: PnlComponent;
  fees: BalanceComponent;
  openedAt: number | null;
  updatedAt: number | null;
  quality: PortfolioComponentQuality;
  provenance: PortfolioProvenance;
}>;

export type PortfolioBalances = Readonly<{
  total: BalanceComponent;
  available?: BalanceComponent;
  locked?: BalanceComponent;
  collateral?: BalanceComponent;
  marginUsed?: BalanceComponent;
}>;

export type PortfolioQuality = Readonly<{
  balances: PortfolioComponentQuality;
  equity: PortfolioComponentQuality;
  positions: PortfolioComponentQuality;
  realizedPnl: PortfolioComponentQuality;
  unrealizedPnl: PortfolioComponentQuality;
  fees: PortfolioComponentQuality;
  funding: PortfolioComponentQuality;
  margin: PortfolioComponentQuality;
  exposure: PortfolioComponentQuality;
  overall: PortfolioComponentQuality;
}>;

export type PortfolioConsistency = Readonly<{
  status: PortfolioConsistencyStatus;
  issues: readonly PortfolioConsistencyIssue[];
}>;

export type PortfolioState = Readonly<{
  accountIdentity: AccountIdentity;
  balances: PortfolioBalances;
  equity: EquityComponent;
  positions: readonly PositionState[];
  pnl: Readonly<{ realized: PnlComponent; unrealized: PnlComponent }>;
  fees: FeeSummary;
  funding: FundingSummary;
  margin: MarginSummary;
  exposure: ExposureSummary;
  quality: PortfolioQuality;
  timestamps: PortfolioTimestamps & Readonly<{ capturedAt: number }>;
  provenance: PortfolioProvenance;
  consistency: PortfolioConsistency;
  capturedAt: number;
}>;

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = clone(item);
  }
  return output as T;
}

function requireText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

function validateAccountIdentity(account: AccountIdentity): void {
  requireText(account.accountId, "accountId");
  requireText(account.broker, "broker");
  requireText(account.baseCurrency, "baseCurrency");
  if (account.environment !== "PAPER" && account.environment !== "LIVE") {
    throw new Error("environment is required");
  }
}

function validateMarketIdentity(identity: ExecutionMarketIdentity): void {
  requireText(identity.instrument, "marketIdentity.instrument");
  requireText(identity.venue, "marketIdentity.venue");
  if (identity.marketType !== "Spot" && identity.marketType !== "Perpetual") {
    throw new Error("marketIdentity.marketType is required");
  }
}

function validatePosition(position: PositionState): void {
  validateAccountIdentity(position.accountIdentity);
  validateMarketIdentity(position.marketIdentity);
  requireText(position.positionId, "positionId");
  if (position.side !== "LONG" && position.side !== "SHORT" && position.side !== "FLAT") {
    throw new Error("position side is invalid");
  }
  if (!Number.isFinite(position.quantity) || position.quantity < 0) {
    throw new Error("position quantity must be a non-negative absolute quantity");
  }
  if (position.side === "FLAT" && position.quantity !== 0) {
    throw new Error("FLAT position must have zero quantity");
  }
  if (position.side !== "FLAT" && position.quantity <= 0) {
    throw new Error("LONG/SHORT position must have positive quantity");
  }
}

/** Pure defensive composition boundary; it does not calculate accounting. */
export function composePortfolioState(input: PortfolioState): PortfolioState {
  validateAccountIdentity(input.accountIdentity);
  if (!Number.isFinite(input.capturedAt)) throw new Error("capturedAt must be finite");
  for (const position of input.positions) validatePosition(position);
  return clone(input);
}
