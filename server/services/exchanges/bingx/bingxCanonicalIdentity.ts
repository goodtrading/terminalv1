import type { AccountIdentity, AccountType } from "../../../../shared/portfolioState";
import type { ExecutionMarketIdentity } from "../../../../shared/marketTruth";
import type { CanonicalEconomicMarketIdentity, ContractStyle } from "../../../../shared/canonicalMarketIdentity";
import { resolveCanonicalMarket } from "../../marketIdentity/canonicalMarketResolver";

export type BingXSourceEnvironment = "LIVE" | "TESTNET" | "DEMO" | "UNKNOWN";
export type BingXIdentityBasis = "GOODTRADING_ACCOUNT_ID";
export type BingXBrokerLinkBasis = "BROKER_ACCOUNT_ID" | "CONNECTION_PSEUDONYM";
export type BingXIdentityQuality = "CONFIRMED" | "PARTIAL";
export type BingXSourceMarketType = "Spot" | "Perpetual";

export type BingXCanonicalAccountIdentityInput = Readonly<{
  goodTradingAccountId: string;
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
  /** @deprecated Compatibility-only provenance; never used for resolution. */
  canonicalInstrument?: string;
  runtimeContractStyle?: ContractStyle;
  venue?: string;
  source: string;
  sourceEndpoint?: string;
}>;

export type BingXIdentityProvenance = Readonly<{
  goodTradingAccountId: string;
  broker: "BINGX";
  source: string;
  sourceEnvironment: BingXSourceEnvironment;
  canonicalEnvironment: "LIVE";
  accountIdBasis: BingXIdentityBasis;
  brokerLinkBasis: BingXBrokerLinkBasis;
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
  mappingPolicy: "EXACT_V1_REGISTRY";
  metadataSource: "server-owned-v1-registry";
  sourceMarketType: BingXSourceMarketType;
  venue: "BINGX";
  canonicalInstrument?: string;
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
  economicIdentity: CanonicalEconomicMarketIdentity;
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
    | "VENUE_UNSUPPORTED"
    | "MARKET_IDENTITY_UNRESOLVED";
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

  const goodTradingAccountId = text(input.goodTradingAccountId);
  if (!goodTradingAccountId) return failure("ACCOUNT_ID_REQUIRED", "goodTradingAccountId is required");

  const brokerAccountId = text(input.brokerAccountId);
  const connectionPseudonym = text(input.existingConnectionPseudonym);
  const accountLink = brokerAccountId ? "BROKER_ACCOUNT_ID" : connectionPseudonym ? "CONNECTION_PSEUDONYM" : null;
  if (!accountLink) {
    return failure(
      "ACCOUNT_ID_REQUIRED",
      "brokerAccountId or existingConnectionPseudonym is required for broker linkage",
    );
  }

  const accountIdBasis: BingXIdentityBasis = "GOODTRADING_ACCOUNT_ID";
  const quality: BingXIdentityQuality = brokerAccountId ? "CONFIRMED" : "PARTIAL";

  const identity: AccountIdentity = {
    accountId: goodTradingAccountId,
    broker: "BINGX",
    environment: "LIVE",
    baseCurrency,
    ...(input.accountType ? { accountType: input.accountType } : {}),
  };

  const provenance: BingXIdentityProvenance = {
    goodTradingAccountId,
    broker: "BINGX",
    source,
    sourceEnvironment,
    canonicalEnvironment: "LIVE",
    accountIdBasis,
    brokerLinkBasis: accountLink,
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

  if (input.venue !== undefined && text(input.venue) !== "BINGX") {
    return failure("VENUE_UNSUPPORTED", "venue must be the canonical BINGX venue");
  }

  const resolved = resolveCanonicalMarket({
    sourceBackend: "BINGX",
    sourceVenue: "BINGX",
    nativeSymbol: brokerSymbol,
    sourceMarketType: input.sourceMarketType,
    ...(input.runtimeContractStyle === undefined ? {} : { runtimeContractStyle: input.runtimeContractStyle }),
  });
  if (!resolved.ok) return failure("MARKET_IDENTITY_UNRESOLVED", resolved.message);

  const identity = resolved.executionIdentity;
  const provenance: BingXMarketIdentityProvenance = {
    broker: "BINGX",
    source,
    brokerSymbol,
    mappingPolicy: "EXACT_V1_REGISTRY",
    metadataSource: "server-owned-v1-registry",
    sourceMarketType: input.sourceMarketType,
    venue: "BINGX",
    ...(text(input.canonicalInstrument) ? { canonicalInstrument: text(input.canonicalInstrument) as string } : {}),
    ...(text(input.sourceEndpoint)
      ? { sourceEndpoint: text(input.sourceEndpoint) as string }
      : {}),
  };

  return {
    ok: true,
    identity,
    economicIdentity: resolved.identity,
    quality: "CONFIRMED",
    executionIdentityReady: true,
    provenance,
  };
}
