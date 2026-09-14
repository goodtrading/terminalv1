import type { AccountIdentity, AccountType } from "../../../../shared/portfolioState";
import type { ExecutionMarketIdentity } from "../../../../shared/marketTruth";

export type BingXSourceEnvironment = "LIVE" | "TESTNET" | "DEMO" | "UNKNOWN";
export type BingXIdentityBasis = "BROKER_ACCOUNT_ID" | "CONNECTION_PSEUDONYM";
export type BingXIdentityQuality = "CONFIRMED" | "PARTIAL";
export type BingXSourceMarketType = "Spot" | "Perpetual";

export type BingXCanonicalAccountIdentityInput = Readonly<{
  sourceEnvironment?: BingXSourceEnvironment;
  connectionId?: string;
  brokerAccountId?: string;
  existingConnectionPseudonym?: string;
  baseCurrency?: string;
  accountType?: AccountType;
  accountTypeSource?: string;
  source: string;
  sourceUrl?: string;
}>;

export type BingXCanonicalMarketIdentityInput = Readonly<{
  brokerSymbol: string;
  sourceMarketType: BingXSourceMarketType;
  canonicalInstrument?: string;
  venue?: string;
  source: string;
  sourceEndpoint?: string;
}>;

export type BingXIdentityProvenance = Readonly<{
  broker: "BINGX";
  source: string;
  sourceEnvironment: BingXSourceEnvironment;
  canonicalEnvironment: "LIVE";
  accountIdBasis: BingXIdentityBasis;
  brokerAccountIdAvailable: boolean;
  brokerNativeAccountId?: string;
  connectionPseudonymBasis?: string;
  baseCurrencySource: "EXPLICIT_INPUT";
  accountTypeSource?: string;
  sourceUrl?: string;
}>;

export type BingXMarketIdentityProvenance = Readonly<{
  broker: "BINGX";
  source: string;
  brokerSymbol: string;
  mappingPolicy: "EXPLICIT_CANONICAL_INSTRUMENT";
  sourceMarketType: BingXSourceMarketType;
  venue: "BINGX";
  canonicalInstrument: string;
  sourceEndpoint?: string;
}>;

type AccountSuccess = Readonly<{
  ok: true;
  identity: AccountIdentity;
  quality: BingXIdentityQuality;
  executionIdentityReady: boolean;
  provenance: BingXIdentityProvenance;
}>;

type MarketSuccess = Readonly<{
  ok: true;
  identity: ExecutionMarketIdentity;
  quality: "CONFIRMED";
  executionIdentityReady: true;
  provenance: BingXMarketIdentityProvenance;
}>;

type IdentityFailure = Readonly<{
  ok: false;
  code:
    | "ENVIRONMENT_REQUIRED"
    | "ENVIRONMENT_UNSUPPORTED"
    | "BASE_CURRENCY_REQUIRED"
    | "ACCOUNT_ID_REQUIRED"
    | "SOURCE_REQUIRED"
    | "MARKET_SYMBOL_REQUIRED"
    | "MARKET_TYPE_REQUIRED"
    | "CANONICAL_INSTRUMENT_REQUIRED"
    | "VENUE_UNSUPPORTED";
  message: string;
  executionIdentityReady: false;
}>;

export type BingXCanonicalAccountIdentityResult = AccountSuccess | IdentityFailure;
export type BingXCanonicalMarketIdentityResult = MarketSuccess | IdentityFailure;

function text(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function failure(
  code: IdentityFailure["code"],
  message: string,
): IdentityFailure {
  return { ok: false, code, message, executionIdentityReady: false };
}

export function buildBingXAccountIdentity(
  input: BingXCanonicalAccountIdentityInput,
): BingXCanonicalAccountIdentityResult {
  const source = text(input.source);
  if (!source) return failure("SOURCE_REQUIRED", "source is required");

  const sourceEnvironment = input.sourceEnvironment;
  if (!sourceEnvironment) {
    return failure("ENVIRONMENT_REQUIRED", "sourceEnvironment must be explicit");
  }
  if (sourceEnvironment !== "LIVE") {
    return failure(
      "ENVIRONMENT_UNSUPPORTED",
      `BingX source environment ${sourceEnvironment} cannot map to canonical LIVE`,
    );
  }

  const baseCurrency = text(input.baseCurrency);
  if (!baseCurrency) return failure("BASE_CURRENCY_REQUIRED", "baseCurrency is required");

  const brokerAccountId = text(input.brokerAccountId);
  const connectionPseudonym = text(input.existingConnectionPseudonym);
  const accountId = brokerAccountId ?? connectionPseudonym;
  if (!accountId) {
    return failure(
      "ACCOUNT_ID_REQUIRED",
      "brokerAccountId or existingConnectionPseudonym is required",
    );
  }

  const accountIdBasis: BingXIdentityBasis = brokerAccountId
    ? "BROKER_ACCOUNT_ID"
    : "CONNECTION_PSEUDONYM";
  const quality: BingXIdentityQuality = brokerAccountId ? "CONFIRMED" : "PARTIAL";

  const identity: AccountIdentity = {
    accountId,
    broker: "BINGX",
    environment: "LIVE",
    baseCurrency,
    ...(input.accountType ? { accountType: input.accountType } : {}),
  };

  const provenance: BingXIdentityProvenance = {
    broker: "BINGX",
    source,
    sourceEnvironment,
    canonicalEnvironment: "LIVE",
    accountIdBasis,
    brokerAccountIdAvailable: Boolean(brokerAccountId),
    ...(brokerAccountId ? { brokerNativeAccountId: brokerAccountId } : {}),
    ...(connectionPseudonym ? { connectionPseudonymBasis: connectionPseudonym } : {}),
    baseCurrencySource: "EXPLICIT_INPUT",
    ...(input.accountType && text(input.accountTypeSource)
      ? { accountTypeSource: text(input.accountTypeSource) as string }
      : {}),
    ...(text(input.sourceUrl) ? { sourceUrl: text(input.sourceUrl) as string } : {}),
  };

  return {
    ok: true,
    identity,
    quality,
    executionIdentityReady: Boolean(brokerAccountId),
    provenance,
  };
}

export function buildBingXMarketIdentity(
  input: BingXCanonicalMarketIdentityInput,
): BingXCanonicalMarketIdentityResult {
  const brokerSymbol = text(input.brokerSymbol);
  if (!brokerSymbol) return failure("MARKET_SYMBOL_REQUIRED", "brokerSymbol is required");
  if (!input.sourceMarketType) return failure("MARKET_TYPE_REQUIRED", "sourceMarketType is required");
  const source = text(input.source);
  if (!source) return failure("SOURCE_REQUIRED", "source is required");

  const canonicalInstrument = text(input.canonicalInstrument);
  if (!canonicalInstrument) {
    return failure(
      "CANONICAL_INSTRUMENT_REQUIRED",
      "canonicalInstrument must be explicit; arbitrary symbol normalization is unsupported",
    );
  }
  if (input.venue !== undefined && text(input.venue) !== "BINGX") {
    return failure("VENUE_UNSUPPORTED", "venue must be the canonical BINGX venue");
  }

  const identity: ExecutionMarketIdentity = {
    instrument: canonicalInstrument,
    venue: "BINGX",
    marketType: input.sourceMarketType,
  };
  const provenance: BingXMarketIdentityProvenance = {
    broker: "BINGX",
    source,
    brokerSymbol,
    mappingPolicy: "EXPLICIT_CANONICAL_INSTRUMENT",
    sourceMarketType: input.sourceMarketType,
    venue: "BINGX",
    canonicalInstrument,
    ...(text(input.sourceEndpoint)
      ? { sourceEndpoint: text(input.sourceEndpoint) as string }
      : {}),
  };

  return {
    ok: true,
    identity,
    quality: "CONFIRMED",
    executionIdentityReady: true,
    provenance,
  };
}
