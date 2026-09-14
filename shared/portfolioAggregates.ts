import type {
  AccountIdentity,
  PortfolioComponentQuality,
  PortfolioConsistencyStatus,
  PortfolioProvenance,
  PortfolioState,
  PositionState,
  PortfolioValue,
} from "./portfolioState";

export type PortfolioNotionalPolicy = Readonly<{
  mode: "LINEAR_QUANTITY_TIMES_PRICE";
  currency: string;
  allowPartialReferencePrice?: boolean;
  currencyByMarket?: Readonly<Record<string, string>>;
}>;

export type PortfolioAggregateConfig = Readonly<{
  notionalPolicy?: PortfolioNotionalPolicy;
}>;

export type PortfolioAggregateMetric = Readonly<PortfolioValue<number> & {
  currency: string | null;
}>;

export type PositionExposure = Readonly<{
  positionId: string;
  accountIdentity: AccountIdentity;
  marketIdentity: PositionState["marketIdentity"];
  side: "LONG" | "SHORT";
  quantity: number;
  referencePrice: number | null;
  notional: PortfolioAggregateMetric;
  signedNotional: PortfolioAggregateMetric;
  provenance: PortfolioProvenance;
}>;

export type PortfolioAggregates = Readonly<{
  positionCount: PortfolioValue<number>;
  grossNotional: PortfolioAggregateMetric;
  netNotional: PortfolioAggregateMetric;
  grossExposure: PortfolioAggregateMetric;
  netExposure: PortfolioAggregateMetric;
  positionExposures: readonly PositionExposure[];
  timestamps: Readonly<{ capturedAt: number }>;
  provenance: PortfolioProvenance;
  consistency: Readonly<{
    status: PortfolioConsistencyStatus;
    issues: readonly string[];
  }>;
}>;

const SOURCE = "GOODTRADING_DERIVED_PORTFOLIO_AGGREGATES";
const UNAVAILABLE_CURRENCY: string | null = null;

type ExposureQuality = PortfolioComponentQuality;

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) output[key] = clone(item);
  return output as T;
}

function marketKey(position: PositionState): string {
  const market = position.marketIdentity;
  return `${market.instrument}:${market.venue}:${market.marketType}`;
}

function provenance(portfolio: PortfolioState, extra: Record<string, unknown> = {}): PortfolioProvenance {
  return {
    source: SOURCE,
    broker: portfolio.accountIdentity.broker,
    accountId: portfolio.accountIdentity.accountId,
    marketIdentity: portfolio.positions[0]?.marketIdentity,
    upstream: {
      portfolioSource: portfolio.provenance.source,
      capturedAt: portfolio.capturedAt,
      ...extra,
    },
  };
}

function metric(
  value: number | null,
  currency: string | null,
  quality: ExposureQuality,
  portfolio: PortfolioState,
  extra: Record<string, unknown> = {},
): PortfolioAggregateMetric {
  return {
    value,
    currency,
    unit: "notional",
    quality,
    timestamps: { capturedAt: portfolio.capturedAt },
    provenance: provenance(portfolio, extra),
  };
}

function positionCount(portfolio: PortfolioState, issues: string[]): PortfolioValue<number> {
  let count = 0;
  for (const position of portfolio.positions) {
    if (position.quantity < 0 || (position.side === "FLAT" && position.quantity !== 0) || (position.side !== "FLAT" && position.quantity <= 0)) {
      issues.push("INVALID_POSITION_INVARIANT");
      continue;
    }
    if (position.side === "LONG" || position.side === "SHORT") count += 1;
  }
  return {
    value: count,
    unit: "positions",
    quality: issues.includes("INVALID_POSITION_INVARIANT") ? "PARTIAL" : "VALID",
    timestamps: { capturedAt: portfolio.capturedAt },
    provenance: provenance(portfolio, { derivation: "open_position_count" }),
  };
}

function supportedPolicy(policy: PortfolioNotionalPolicy | undefined): boolean {
  return policy?.mode === "LINEAR_QUANTITY_TIMES_PRICE" && typeof policy.currency === "string" && policy.currency.trim().length > 0;
}

function effectiveCurrency(policy: PortfolioNotionalPolicy, position: PositionState): string {
  return policy.currencyByMarket?.[marketKey(position)] ?? policy.currency;
}

function priceQuality(position: PositionState, policy: PortfolioNotionalPolicy): ExposureQuality {
  const reference = position.referencePrice;
  if (reference === null || reference.value === null || !Number.isFinite(reference.value) || reference.value <= 0) return "UNAVAILABLE";
  if (reference.quality === "STALE") return "STALE";
  if (reference.quality === "PARTIAL") return policy.allowPartialReferencePrice ? "PARTIAL" : "UNAVAILABLE";
  if (reference.quality !== "VALID") return "UNAVAILABLE";
  return "VALID";
}

function derivePositionExposure(position: PositionState, portfolio: PortfolioState, policy: PortfolioNotionalPolicy | undefined): PositionExposure {
  const supported = supportedPolicy(policy);
  const currency = supported ? effectiveCurrency(policy as PortfolioNotionalPolicy, position) : UNAVAILABLE_CURRENCY;
  const quality = supported ? priceQuality(position, policy as PortfolioNotionalPolicy) : "UNAVAILABLE";
  const referencePrice = position.referencePrice?.value ?? null;
  const notional = quality === "UNAVAILABLE" || referencePrice === null ? null : position.quantity * referencePrice;
  const signed = notional === null ? null : position.side === "SHORT" ? -notional : notional;
  const baseProvenance = provenance(portfolio, { derivation: "linear_quantity_times_reference_price", positionId: position.positionId, policy: policy ?? null, currency });
  return {
    positionId: position.positionId,
    accountIdentity: clone(position.accountIdentity),
    marketIdentity: clone(position.marketIdentity),
    side: position.side as "LONG" | "SHORT",
    quantity: position.quantity,
    referencePrice,
    notional: { value: notional, currency, unit: "notional", quality, timestamps: { capturedAt: portfolio.capturedAt }, provenance: baseProvenance },
    signedNotional: { value: signed, currency, unit: "notional", quality, timestamps: { capturedAt: portfolio.capturedAt }, provenance: baseProvenance },
    provenance: baseProvenance,
  };
}

function aggregateMetric(
  contributions: readonly PositionExposure[],
  portfolio: PortfolioState,
  policy: PortfolioNotionalPolicy | undefined,
  signed: boolean,
  issues: string[],
): PortfolioAggregateMetric {
  const activePolicy = policy;
  if (!activePolicy || !supportedPolicy(activePolicy)) {
    issues.push("UNSUPPORTED_NOTIONAL_POLICY");
    return metric(null, UNAVAILABLE_CURRENCY, "UNAVAILABLE", portfolio, { derivation: signed ? "signed_notional" : "gross_notional", policy: policy ?? null });
  }
  if (contributions.length === 0) {
    return metric(0, activePolicy.currency, "VALID", portfolio, { derivation: signed ? "signed_notional" : "gross_notional", coveredPositions: 0, totalOpenPositions: 0 });
  }
  const usable = contributions.filter((item) => item[signed ? "signedNotional" : "notional"].value !== null);
  const currencies = new Set(usable.map((item) => item[signed ? "signedNotional" : "notional"].currency).filter((value): value is string => value !== null));
  if (currencies.size > 1) {
    issues.push("INCOMPATIBLE_AGGREGATE_CURRENCY");
    return metric(null, UNAVAILABLE_CURRENCY, "PARTIAL", portfolio, { derivation: signed ? "signed_notional" : "gross_notional", currencies: Array.from(currencies) });
  }
  if (usable.length < contributions.length) issues.push("MISSING_REFERENCE_PRICE");
  if (usable.length === 0) {
    return metric(null, activePolicy.currency, "UNAVAILABLE", portfolio, { derivation: signed ? "signed_notional" : "gross_notional" });
  }
  const values = usable.map((item) => item[signed ? "signedNotional" : "notional"].value as number);
  const value = values.reduce((sum, current) => sum + current, 0);
  const weakest = contributions.some((item) => item[signed ? "signedNotional" : "notional"].quality === "STALE") ? "STALE" : contributions.some((item) => item[signed ? "signedNotional" : "notional"].quality !== "VALID") ? "PARTIAL" : "VALID";
  return metric(value, Array.from(currencies)[0] ?? activePolicy.currency, weakest, portfolio, { derivation: signed ? "signed_notional" : "gross_notional", coveredPositions: usable.length, totalOpenPositions: contributions.length });
}

/** Pure, read-only derivation from canonical PortfolioState. */
export function derivePortfolioAggregates(portfolio: PortfolioState, config: PortfolioAggregateConfig): PortfolioAggregates {
  const issues: string[] = [];
  const count = positionCount(portfolio, issues);
  const openPositions = portfolio.positions.filter((position) => position.side === "LONG" || position.side === "SHORT");
  const contributions = openPositions.map((position) => derivePositionExposure(position, portfolio, config.notionalPolicy)).sort((a, b) => {
    const ak = `${a.accountIdentity.accountId}:${a.marketIdentity.instrument}:${a.marketIdentity.venue}:${a.marketIdentity.marketType}:${a.positionId}`;
    const bk = `${b.accountIdentity.accountId}:${b.marketIdentity.instrument}:${b.marketIdentity.venue}:${b.marketIdentity.marketType}:${b.positionId}`;
    return ak.localeCompare(bk);
  });
  const grossNotional = aggregateMetric(contributions, portfolio, config.notionalPolicy, false, issues);
  const netNotional = aggregateMetric(contributions, portfolio, config.notionalPolicy, true, issues);
  const grossExposure = { ...grossNotional, provenance: provenance(portfolio, { derivation: "notional_based_gross_exposure" }) };
  const netExposure = { ...netNotional, provenance: provenance(portfolio, { derivation: "notional_based_signed_net_exposure" }) };
  const uniqueIssues = Array.from(new Set(issues));
  const status: PortfolioConsistencyStatus = uniqueIssues.length === 0 ? "CONSISTENT" : "PARTIAL";
  return clone({
    positionCount: count,
    grossNotional,
    netNotional,
    grossExposure,
    netExposure,
    positionExposures: contributions,
    timestamps: { capturedAt: portfolio.capturedAt },
    provenance: provenance(portfolio, { derivation: "portfolio_aggregates" }),
    consistency: { status, issues: uniqueIssues },
  });
}
