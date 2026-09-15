import type {
  BingxBalanceSnapshot,
  BingxPositionSnapshot,
} from "../../../../shared/goodTradingAiBingxAccount";
import {
  composePortfolioState,
  type AccountIdentity,
  type BalanceComponent,
  type PortfolioComponentQuality,
  type PortfolioProvenance,
  type PortfolioState,
  type PnlComponent,
  type PositionState,
} from "../../../../shared/portfolioState";
import type { ExecutionMarketIdentity } from "../../../../shared/marketTruth";
import type {
  BingXCanonicalAccountIdentityResult,
  BingXIdentityProvenance,
} from "./bingxCanonicalIdentity";

export type BingXPositionMode = "ONE_WAY" | "HEDGE" | "UNKNOWN";

export type BingXBalanceInput = Readonly<
  BingxBalanceSnapshot & {
    /** The normalized contract cannot distinguish this from its fallback. */
    reportedEquity?: boolean;
  }
>;

export type BingXPositionInput = Readonly<{
  source: BingxPositionSnapshot;
  marketIdentity?: ExecutionMarketIdentity;
  marketProvenance?: Readonly<Record<string, unknown>>;
}>;

export type BingXPortfolioInput = Readonly<{
  identity: BingXCanonicalAccountIdentityResult;
  positionMode: BingXPositionMode;
  balanceSnapshot: BingXBalanceInput;
  positions: readonly BingXPositionInput[];
  capturedAt: number;
  sourceSnapshotId?: string;
}>;

type PortfolioSuccess = Readonly<{ ok: true; state: PortfolioState }>;
type PortfolioFailure = Readonly<{
  ok: false;
  code:
    | "IDENTITY_INVALID"
    | "UNSUPPORTED_POSITION_MODE"
    | "INVALID_CAPTURE_TIME"
    | "BALANCE_CURRENCY_MISMATCH"
    | "DUPLICATE_MARKET_POSITION"
    | "INVALID_POSITION"
    | "MARKET_IDENTITY_REQUIRED";
  message: string;
}>;

export type BingXPortfolioResult = PortfolioSuccess | PortfolioFailure;

const SOURCE = "BINGX_ACCOUNT_READ_ONLY";
const UNAVAILABLE: PortfolioComponentQuality = "UNAVAILABLE";

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = clone(item);
  }
  return output as T;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function failure(
  code: PortfolioFailure["code"],
  message: string,
): PortfolioFailure {
  return { ok: false, code, message };
}

function timestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function provenance(
  identity: AccountIdentity,
  identityProvenance: BingXIdentityProvenance,
  capturedAt: number,
  sourceSnapshotId: string | undefined,
  extra: Record<string, unknown> = {},
): PortfolioProvenance {
  return {
    source: SOURCE,
    broker: identity.broker,
    accountId: identity.accountId,
    ...(identityProvenance.brokerNativeAccountId
      ? { executionAccountId: identityProvenance.brokerNativeAccountId }
      : {}),
    snapshotIds: sourceSnapshotId ? [sourceSnapshotId] : undefined,
    upstream: {
      identitySource: identityProvenance.source,
      sourceEnvironment: identityProvenance.sourceEnvironment,
      canonicalEnvironment: identityProvenance.canonicalEnvironment,
      accountIdBasis: identityProvenance.accountIdBasis,
      capturedAt,
      ...extra,
    },
  };
}

function numberValue(args: {
  value: number | null;
  unit: string;
  currency: string;
  quality: PortfolioComponentQuality;
  identity: AccountIdentity;
  identityProvenance: BingXIdentityProvenance;
  capturedAt: number;
  sourceSnapshotId?: string;
  field: string;
}): BalanceComponent {
  return {
    value: args.value,
    unit: args.unit,
    quality: args.quality,
    currency: args.currency,
    timestamps: { capturedAt: args.capturedAt },
    provenance: provenance(
      args.identity,
      args.identityProvenance,
      args.capturedAt,
      args.sourceSnapshotId,
      { field: args.field, valueAvailability: args.value === null ? "UNAVAILABLE" : "DIRECT" },
    ),
  };
}

function pnlValue(args: Parameters<typeof numberValue>[0]): PnlComponent {
  return numberValue(args);
}

function marketKey(identity: ExecutionMarketIdentity): string {
  return `${identity.instrument}:${identity.venue}:${identity.marketType}`;
}

function mapPosition(
  input: BingXPositionInput,
  identity: AccountIdentity,
  identityProvenance: BingXIdentityProvenance,
  capturedAt: number,
  sourceSnapshotId?: string,
): PositionState | PortfolioFailure {
  const source = input.source;
  if (!input.marketIdentity) {
    return failure("MARKET_IDENTITY_REQUIRED", `Missing market identity for ${source.symbol}`);
  }
  const positionId = text(source.positionId);
  if (!positionId || !Number.isFinite(source.quantity) || source.quantity < 0) {
    return failure("INVALID_POSITION", `Invalid position ${source.positionId}`);
  }
  if (source.quantity === 0) return failure("INVALID_POSITION", "Zero position must be filtered before adaptation");
  if (source.side !== "long" && source.side !== "short") {
    return failure("INVALID_POSITION", `Unsupported non-open position side ${source.side}`);
  }

  const quality: PortfolioComponentQuality = source.stale ? "STALE" : "PARTIAL";
  const positionProvenance = provenance(
    identity,
    identityProvenance,
    capturedAt,
    sourceSnapshotId,
    {
      fieldSource: SOURCE,
      sourcePositionId: positionId,
      brokerSymbol: source.symbol,
      ...(input.marketProvenance ? { market: clone(input.marketProvenance) } : {}),
    },
  );
  const referencePrice = source.markPrice !== undefined
    ? {
        value: source.markPrice,
        priceType: "MARK" as const,
        source: SOURCE,
        eventTime: timestamp(source.updatedAt),
        quality,
        provenance: provenance(
          identity,
          identityProvenance,
          capturedAt,
          sourceSnapshotId,
          { field: "markPrice", referencePriceSource: "MARK_PRICE" },
        ),
      }
    : null;

  return {
    accountIdentity: clone(identity),
    marketIdentity: clone(input.marketIdentity),
    positionId,
    side: source.side === "long" ? "LONG" : "SHORT",
    quantity: source.quantity,
    averageEntryPrice: source.entryPrice ?? null,
    referencePrice,
    realizedPnl: pnlValue({
      value: null,
      unit: identity.baseCurrency,
      currency: identity.baseCurrency,
      quality: UNAVAILABLE,
      identity,
      identityProvenance,
      capturedAt,
      sourceSnapshotId,
      field: "realizedPnl_ambiguous",
    }),
    unrealizedPnl: pnlValue({
      value: source.unrealizedPnl ?? null,
      unit: identity.baseCurrency,
      currency: identity.baseCurrency,
      quality: source.unrealizedPnl === undefined ? UNAVAILABLE : quality,
      identity,
      identityProvenance,
      capturedAt,
      sourceSnapshotId,
      field: "unrealizedPnl",
    }),
    fees: numberValue({
      value: null,
      unit: identity.baseCurrency,
      currency: identity.baseCurrency,
      quality: UNAVAILABLE,
      identity,
      identityProvenance,
      capturedAt,
      sourceSnapshotId,
      field: "fees_not_consumed_in_N8_2",
    }),
    openedAt: null,
    updatedAt: timestamp(source.updatedAt),
    quality,
    provenance: positionProvenance,
  };
}

export function buildBingXPortfolioState(
  input: BingXPortfolioInput,
): BingXPortfolioResult {
  if (!input.identity.ok) return failure("IDENTITY_INVALID", input.identity.message);
  if (input.positionMode !== "ONE_WAY") {
    return failure(
      "UNSUPPORTED_POSITION_MODE",
      `BingX position mode ${input.positionMode} is not supported by N8.2`,
    );
  }
  if (!Number.isFinite(input.capturedAt)) {
    return failure("INVALID_CAPTURE_TIME", "capturedAt must be finite and explicit");
  }

  const identity = input.identity.identity;
  const identityProvenance = input.identity.provenance;
  const balance = input.balanceSnapshot;
  if (balance.asset.trim().toUpperCase() !== identity.baseCurrency.trim().toUpperCase()) {
    return failure("BALANCE_CURRENCY_MISMATCH", "Balance asset must match account baseCurrency");
  }

  const mappedPositions: PositionState[] = [];
  const seenMarkets = new Set<string>();
  for (const item of input.positions) {
    if (item.source.quantity === 0) continue;
    const mapped = mapPosition(item, identity, identityProvenance, input.capturedAt, input.sourceSnapshotId);
    if (!("accountIdentity" in mapped)) return mapped;
    const key = marketKey(mapped.marketIdentity);
    if (seenMarkets.has(key)) {
      return failure("DUPLICATE_MARKET_POSITION", `Duplicate ONE_WAY position for ${key}`);
    }
    seenMarkets.add(key);
    mappedPositions.push(mapped);
  }
  mappedPositions.sort((a, b) => {
    const ak = `${marketKey(a.marketIdentity)}:${a.positionId}`;
    const bk = `${marketKey(b.marketIdentity)}:${b.positionId}`;
    return ak.localeCompare(bk);
  });

  const total = numberValue({
    value: balance.walletBalance,
    unit: identity.baseCurrency,
    currency: identity.baseCurrency,
    quality: "VALID",
    identity,
    identityProvenance,
    capturedAt: input.capturedAt,
    sourceSnapshotId: input.sourceSnapshotId,
    field: "walletBalance",
  });
  const available = numberValue({
    value: balance.availableBalance,
    unit: identity.baseCurrency,
    currency: identity.baseCurrency,
    quality: "VALID",
    identity,
    identityProvenance,
    capturedAt: input.capturedAt,
    sourceSnapshotId: input.sourceSnapshotId,
    field: "availableBalance",
  });
  const equityReported = balance.reportedEquity === true && balance.equity !== undefined;
  const equity = numberValue({
    value: equityReported ? balance.equity ?? null : null,
    unit: identity.baseCurrency,
    currency: identity.baseCurrency,
    quality: equityReported ? "VALID" : UNAVAILABLE,
    identity,
    identityProvenance,
    capturedAt: input.capturedAt,
    sourceSnapshotId: input.sourceSnapshotId,
    field: equityReported ? "equity" : "equity_unavailable_fallback_not_promoted",
  });
  const unrealized = pnlValue({
    value: balance.unrealizedPnl ?? null,
    unit: identity.baseCurrency,
    currency: identity.baseCurrency,
    quality: balance.unrealizedPnl === undefined ? UNAVAILABLE : "VALID",
    identity,
    identityProvenance,
    capturedAt: input.capturedAt,
    sourceSnapshotId: input.sourceSnapshotId,
    field: "unrealizedPnl",
  });
  const realized = pnlValue({
    value: null,
    unit: identity.baseCurrency,
    currency: identity.baseCurrency,
    quality: UNAVAILABLE,
    identity,
    identityProvenance,
    capturedAt: input.capturedAt,
    sourceSnapshotId: input.sourceSnapshotId,
    field: "realizedPnl_ambiguous",
  });

  const overall: PortfolioComponentQuality =
    input.identity.quality === "PARTIAL" || !equityReported || mappedPositions.some((p) => p.quality !== "VALID")
      ? "PARTIAL"
      : "VALID";
  const baseProvenance = provenance(identity, identityProvenance, input.capturedAt, input.sourceSnapshotId, {
    adapter: "N8.2_READ_ONLY_PORTFOLIO",
    positionMode: input.positionMode,
    unsupported: ["marginUsed", "locked", "collateral", "maintenanceMargin", "funding", "fees", "realizedPnl"],
  });

  const state: PortfolioState = composePortfolioState({
    accountIdentity: clone(identity),
    balances: {
      total,
      available,
    },
    equity,
    positions: mappedPositions,
    pnl: { realized, unrealized },
    fees: {
      total: numberValue({
        value: null,
        unit: identity.baseCurrency,
        currency: identity.baseCurrency,
        quality: UNAVAILABLE,
        identity,
        identityProvenance,
        capturedAt: input.capturedAt,
        sourceSnapshotId: input.sourceSnapshotId,
        field: "fees_not_consumed_in_N8_2",
      }),
    },
    funding: {
      total: numberValue({
        value: null,
        unit: identity.baseCurrency,
        currency: identity.baseCurrency,
        quality: UNAVAILABLE,
        identity,
        identityProvenance,
        capturedAt: input.capturedAt,
        sourceSnapshotId: input.sourceSnapshotId,
        field: "funding_not_consumed_in_N8_2",
      }),
    },
    margin: {},
    exposure: {
      positionCount: {
        value: null,
        unit: "positions",
        quality: UNAVAILABLE,
        timestamps: { capturedAt: input.capturedAt },
        provenance: { ...baseProvenance, upstream: { field: "positionCount_not_derived" } },
      },
    },
    quality: {
      balances: "VALID",
      equity: equity.quality,
      positions: mappedPositions.some((p) => p.quality === "STALE") ? "STALE" : mappedPositions.length ? "PARTIAL" : "VALID",
      realizedPnl: UNAVAILABLE,
      unrealizedPnl: unrealized.quality,
      fees: UNAVAILABLE,
      funding: UNAVAILABLE,
      margin: UNAVAILABLE,
      exposure: UNAVAILABLE,
      overall,
    },
    timestamps: { capturedAt: input.capturedAt },
    provenance: baseProvenance,
    consistency: {
      status: input.identity.quality === "PARTIAL" ? "PARTIAL" : "CONSISTENT",
      issues: input.identity.quality === "PARTIAL" ? ["ACCOUNT_IDENTITY_MISMATCH"] : [],
    },
    capturedAt: input.capturedAt,
  });

  return { ok: true, state: clone(state) };
}
