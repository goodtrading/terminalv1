import type { GammaOptionsAdapterConfig, GammaOptionsSnapshotInput } from "../../shared/gammaOptionsAdapter";
import { adaptGammaOptionsSnapshot } from "../../shared/gammaOptionsAdapter";
import type { MarketTruth, OptionsReferenceIdentity } from "../../shared/marketTruth";
import { composeMarketTruth } from "../../shared/marketTruth";
import type { MarketTruthGeometry, MarketTruthGeometryConfig } from "../../shared/marketTruthGeometry";
import { computeMarketTruthGeometry } from "../../shared/marketTruthGeometry";
import type { RegimeContextAdapterConfig, RegimeSnapshotInput } from "../../shared/regimeContextAdapter";
import { adaptRegimeContext } from "../../shared/regimeContextAdapter";
import { computeOrderFlowFeatures, type OrderFlowFeatureConfig } from "../../shared/orderFlowFeatures";
import type { OrderFlowIdentity, OrderFlowState } from "../../shared/orderFlowState";
import type { VolatilityContextAdapterConfig, VolatilitySnapshotInput } from "../../shared/volatilityContextAdapter";
import { adaptVolatilityContext } from "../../shared/volatilityContextAdapter";

export type MarketTruthProviderDependencies = {
  getOrderFlowState: (identity: OrderFlowIdentity, capturedAt: number) => OrderFlowState;
  getGammaOptionsSnapshot?: (identity: OrderFlowIdentity, referenceIdentity: OptionsReferenceIdentity) => GammaOptionsSnapshotInput | null;
  getVolatilitySnapshot?: (identity: OrderFlowIdentity, referenceIdentity: OptionsReferenceIdentity) => VolatilitySnapshotInput | null;
  getRegimeSnapshot?: (identity: OrderFlowIdentity, referenceIdentity: OptionsReferenceIdentity) => RegimeSnapshotInput | null;
};

export type MarketTruthRequest = {
  identity: OrderFlowIdentity;
  optionsReference: OptionsReferenceIdentity;
  capturedAt: number;
  featureConfig: OrderFlowFeatureConfig;
  gammaConfig?: Omit<GammaOptionsAdapterConfig, "capturedAt">;
  volatilityConfig?: Omit<VolatilityContextAdapterConfig, "capturedAt">;
  regimeConfig?: Omit<RegimeContextAdapterConfig, "capturedAt">;
  geometryConfig: MarketTruthGeometryConfig;
};

export type CanonicalMarketTruthResult = {
  truth: MarketTruth;
  geometry: MarketTruthGeometry;
  capturedAt: number;
};

function completeIdentity(identity: unknown): asserts identity is OrderFlowIdentity {
  if (!identity || typeof identity !== "object") throw new Error("MarketTruthProvider requires complete execution identity");
  const value = identity as Partial<OrderFlowIdentity>;
  if (typeof value.instrument !== "string" || !value.instrument.trim() || value.venue !== "Binance" || (value.marketType !== "Spot" && value.marketType !== "Perpetual")) {
    throw new Error("MarketTruthProvider requires complete execution identity");
  }
}
function completeReference(identity: unknown): asserts identity is OptionsReferenceIdentity {
  if (!identity || typeof identity !== "object") throw new Error("MarketTruthProvider requires complete options reference identity");
  const value = identity as Partial<OptionsReferenceIdentity>;
  if (typeof value.referenceAsset !== "string" || !value.referenceAsset.trim() || typeof value.venue !== "string" || !value.venue.trim() || (value.referenceType !== "INDEX" && value.referenceType !== "OPTIONS_UNDERLYING")) {
    throw new Error("MarketTruthProvider requires complete options reference identity");
  }
}
function sameReference(a: OptionsReferenceIdentity, b: OptionsReferenceIdentity): boolean {
  return a.referenceAsset === b.referenceAsset && a.venue === b.venue && a.referenceType === b.referenceType;
}
function assertSnapshotReference(snapshot: { referenceIdentity: OptionsReferenceIdentity } | null, expected: OptionsReferenceIdentity, component: string): void {
  if (snapshot && !sameReference(snapshot.referenceIdentity, expected)) throw new Error(`MarketTruthProvider ${component} reference identity mismatch`);
}

export function createMarketTruthProvider(dependencies: MarketTruthProviderDependencies) {
  return {
    getMarketTruth(request: MarketTruthRequest): CanonicalMarketTruthResult {
      completeIdentity(request.identity);
      completeReference(request.optionsReference);
      if (!Number.isFinite(request.capturedAt)) throw new Error("MarketTruthProvider requires finite capturedAt");
      const identity: OrderFlowIdentity = { instrument: request.identity.instrument.trim().toUpperCase(), venue: "Binance", marketType: request.identity.marketType };
      const state = dependencies.getOrderFlowState(identity, request.capturedAt);
      const features = computeOrderFlowFeatures(state, request.featureConfig);

      const gammaSnapshot = dependencies.getGammaOptionsSnapshot?.(identity, request.optionsReference) ?? null;
      assertSnapshotReference(gammaSnapshot, request.optionsReference, "gamma");
      const gamma = adaptGammaOptionsSnapshot(gammaSnapshot, { capturedAt: request.capturedAt, ...request.gammaConfig });

      const volatilitySnapshot = dependencies.getVolatilitySnapshot?.(identity, request.optionsReference) ?? null;
      assertSnapshotReference(volatilitySnapshot, request.optionsReference, "volatility");
      const volatility = adaptVolatilityContext(volatilitySnapshot, { capturedAt: request.capturedAt, ...request.volatilityConfig });

      const regimeSnapshot = dependencies.getRegimeSnapshot?.(identity, request.optionsReference) ?? null;
      const regime = adaptRegimeContext(regimeSnapshot, { capturedAt: request.capturedAt, ...request.regimeConfig });

      const truth = composeMarketTruth({
        identity,
        orderFlow: { state, features },
        options: {
          referenceIdentity: request.optionsReference,
          referencePrice: gamma.referencePrice,
          gamma: gamma.gamma,
          optionsOpenInterest: gamma.optionsOpenInterest,
          keyLevels: gamma.levels,
        },
        futuresOpenInterest: null,
        volatility,
        regime,
        capturedAt: request.capturedAt,
      });
      const geometry = computeMarketTruthGeometry(truth, request.geometryConfig);
      return { truth, geometry, capturedAt: request.capturedAt };
    },
  };
}

export type MarketTruthProvider = ReturnType<typeof createMarketTruthProvider>;
