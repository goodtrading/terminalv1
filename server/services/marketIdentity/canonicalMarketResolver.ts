import type { ExecutionMarketIdentity } from "../../../shared/marketTruth";
import {
  type CanonicalEconomicMarketIdentity,
  type ContractStyle,
  validateCanonicalEconomicMarketIdentity,
} from "../../../shared/canonicalMarketIdentity";

export type CanonicalMarketSourceBackend = "BINGX" | "NAUTILUS_PAPER";
export type CanonicalMarketSourceMarketType = "Spot" | "Perpetual";

export type CanonicalMarketResolverInput = Readonly<{
  sourceBackend: CanonicalMarketSourceBackend;
  sourceVenue: string;
  nativeSymbol: string;
  sourceMarketType: CanonicalMarketSourceMarketType;
  nativeInstrumentId?: string;
  runtimeContractStyle?: ContractStyle;
}>;

export type CanonicalMarketResolutionProvenance = Readonly<{
  sourceBackend: CanonicalMarketSourceBackend;
  sourceVenue: string;
  nativeSymbol: string;
  nativeInstrumentId?: string;
  sourceMarketType: CanonicalMarketSourceMarketType;
  metadataSource: "server-owned-v1-registry";
  mappingPolicy: "EXACT_V1_REGISTRY";
}>;

type CanonicalMarketResolutionSuccess = Readonly<{
  ok: true;
  identity: CanonicalEconomicMarketIdentity;
  executionIdentity: ExecutionMarketIdentity;
  provenance: CanonicalMarketResolutionProvenance;
  executionIdentityReady: true;
}>;

type CanonicalMarketResolutionFailure = Readonly<{
  ok: false;
  code: "MARKET_IDENTITY_UNRESOLVED";
  message: string;
  executionIdentityReady: false;
}>;

export type CanonicalMarketResolution =
  | CanonicalMarketResolutionSuccess
  | CanonicalMarketResolutionFailure;

type RegistryEntry = Readonly<{
  sourceBackend: CanonicalMarketSourceBackend;
  sourceVenue: string;
  nativeSymbol: string;
  sourceMarketType: CanonicalMarketSourceMarketType;
  identity: CanonicalEconomicMarketIdentity;
}>;

const V1_IDENTITY: CanonicalEconomicMarketIdentity = Object.freeze({
  baseAsset: "BTC",
  quoteAsset: "USDT",
  settlementAsset: "USDT",
  productType: "Perpetual",
  contractStyle: "Linear",
  expiry: null,
});

const V1_REGISTRY: readonly RegistryEntry[] = Object.freeze([
  Object.freeze({
    sourceBackend: "BINGX",
    sourceVenue: "BINGX",
    nativeSymbol: "BTC-USDT",
    sourceMarketType: "Perpetual",
    identity: V1_IDENTITY,
  }),
  Object.freeze({
    sourceBackend: "NAUTILUS_PAPER",
    sourceVenue: "SIM",
    nativeSymbol: "BTCUSDT",
    sourceMarketType: "Perpetual",
    identity: V1_IDENTITY,
  }),
  Object.freeze({
    sourceBackend: "NAUTILUS_PAPER",
    sourceVenue: "SIM",
    nativeSymbol: "BTCUSDT-PERP",
    sourceMarketType: "Perpetual",
    identity: V1_IDENTITY,
  }),
]);

function cloneIdentity(identity: CanonicalEconomicMarketIdentity): CanonicalEconomicMarketIdentity {
  return identity.productType === "Spot"
    ? { ...identity }
    : { ...identity };
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
}

function registryKey(input: CanonicalMarketResolverInput): string {
  return JSON.stringify([
    input.sourceBackend,
    input.sourceVenue,
    input.nativeSymbol,
    input.sourceMarketType,
  ]);
}

function failure(message: string): CanonicalMarketResolutionFailure {
  return {
    ok: false,
    code: "MARKET_IDENTITY_UNRESOLVED",
    message,
    executionIdentityReady: false,
  };
}

function validateInput(input: CanonicalMarketResolverInput): void {
  if (input.sourceBackend !== "BINGX" && input.sourceBackend !== "NAUTILUS_PAPER") {
    throw new Error("sourceBackend is unsupported");
  }
  requiredText(input.sourceVenue, "sourceVenue");
  requiredText(input.nativeSymbol, "nativeSymbol");
  if (input.sourceMarketType !== "Spot" && input.sourceMarketType !== "Perpetual") {
    throw new Error("sourceMarketType is unsupported");
  }
  if (input.nativeInstrumentId !== undefined) {
    requiredText(input.nativeInstrumentId, "nativeInstrumentId");
  }
  if (
    input.runtimeContractStyle !== undefined &&
    input.runtimeContractStyle !== "Linear" &&
    input.runtimeContractStyle !== "Inverse"
  ) {
    throw new Error("runtimeContractStyle is unsupported");
  }
}

export function resolveCanonicalMarket(
  input: CanonicalMarketResolverInput,
): CanonicalMarketResolution {
  try {
    validateInput(input);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "market input is invalid");
  }

  const entry = V1_REGISTRY.find(
    (candidate) =>
      JSON.stringify([
        candidate.sourceBackend,
        candidate.sourceVenue,
        candidate.nativeSymbol,
        candidate.sourceMarketType,
      ]) === registryKey(input),
  );
  if (!entry) return failure(`no exact V1 registry entry for ${registryKey(input)}`);

  validateCanonicalEconomicMarketIdentity(entry.identity);
  if (
    input.runtimeContractStyle !== undefined &&
    entry.identity.productType === "Perpetual" &&
    input.runtimeContractStyle !== entry.identity.contractStyle
  ) {
    return failure("runtime contractStyle contradicts the V1 registry");
  }

  const identity = cloneIdentity(entry.identity);
  const executionIdentity: ExecutionMarketIdentity = {
    instrument: input.nativeSymbol,
    venue: input.sourceVenue,
    marketType: input.sourceMarketType,
  };
  const provenance: CanonicalMarketResolutionProvenance = {
    sourceBackend: input.sourceBackend,
    sourceVenue: input.sourceVenue,
    nativeSymbol: input.nativeSymbol,
    ...(input.nativeInstrumentId === undefined
      ? {}
      : { nativeInstrumentId: input.nativeInstrumentId }),
    sourceMarketType: input.sourceMarketType,
    metadataSource: "server-owned-v1-registry",
    mappingPolicy: "EXACT_V1_REGISTRY",
  };

  return {
    ok: true,
    identity,
    executionIdentity,
    provenance,
    executionIdentityReady: true,
  };
}

export function canonicalMarketRegistrySnapshot(): readonly RegistryEntry[] {
  return V1_REGISTRY.map((entry) => ({
    ...entry,
    identity: cloneIdentity(entry.identity),
  }));
}
