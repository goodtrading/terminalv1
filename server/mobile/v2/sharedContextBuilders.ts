import type { TerminalState } from "../../terminal-state";
import type { BiasBlock, MarketStateBlock, RiskBlock } from "./mobileMarketStateV2.types";
import {
  biasDirectionFromType,
  driverCodeFromLabel,
  inferDriverImpact,
  normalizeConfidence,
  normalizeProbability,
  valueAvailable,
} from "./mobileMarketStateQuality";

function buildDrivers(
  reasons: string[] | undefined,
  context: "micro" | "macro",
  confidence: number | null | undefined,
): { items: MarketStateBlock["drivers"]["items"]; status: "available" | "unavailable" } {
  if (!reasons?.length) return { items: [], status: "unavailable" };
  const baseWeight =
    confidence != null && Number.isFinite(confidence)
      ? confidence > 1
        ? confidence / 100
        : confidence
      : null;
  const weightEach =
    baseWeight != null && reasons.length > 0 ? baseWeight / reasons.length : null;
  const items = reasons.map((label) => {
    const code = driverCodeFromLabel(label);
    return {
      code,
      label,
      impact: inferDriverImpact(code, context),
      weight: weightEach,
      context,
      status: "available" as const,
    };
  });
  return { items, status: "available" };
}

export function buildBias(ts: TerminalState): BiasBlock {
  const engine = ts.positioning?.institutionalBiasEngine;
  const biasType = engine?.institutionalBias ?? null;
  const direction = biasDirectionFromType(biasType);
  const confidence = normalizeConfidence(engine?.biasConfidence);
  const invalidationRaw = engine?.biasInvalidation?.trim();
  const invalidation =
    invalidationRaw && invalidationRaw.length > 0
      ? valueAvailable(invalidationRaw)
      : { value: null, status: "unavailable" as const };
  const drivers = engine?.biasDrivers ?? [];
  return {
    direction,
    label: biasType ? valueAvailable(biasType) : { value: null, status: "unavailable" },
    confidence,
    horizon: {
      code: "intraday",
      label: "Minutes to hours",
      status: engine?.biasHorizon ? "available" : "unavailable",
    },
    thesis: biasType
      ? valueAvailable(biasType.replace(/_/g, " "))
      : { value: null, status: "unavailable" },
    supportingFactors: {
      items: drivers,
      status: drivers.length ? "available" : "unavailable",
    },
    invalidation,
  };
}

export function buildRisk(ts: TerminalState): RiskBlock {
  const cascade = ts.positioning?.liquidityCascadeEngine;
  const squeeze = ts.positioning?.squeezeProbabilityEngine;
  const gammaEngine = ts.positioning?.gammaCurveEngine;
  const volState =
    gammaEngine?.dealerRegime === "LONG_GAMMA"
      ? valueAvailable("COMPRESSING")
      : gammaEngine?.dealerRegime === "SHORT_GAMMA"
        ? valueAvailable("EXPANDING")
        : valueAvailable("NORMAL");

  return {
    cascade: {
      level: cascade?.cascadeRisk
        ? valueAvailable(cascade.cascadeRisk)
        : { value: null, status: "unavailable" },
      probability: { value: null, status: "not_applicable" },
      direction: cascade?.cascadeDirection
        ? valueAvailable(cascade.cascadeDirection)
        : { value: null, status: "unavailable" },
      status: cascade?.cascadeRisk ? "available" : "unavailable",
    },
    squeeze: {
      level: squeeze?.squeezeType
        ? valueAvailable(squeeze.squeezeType)
        : { value: null, status: "unavailable" },
      probability: normalizeProbability(squeeze?.squeezeProbability),
      direction: squeeze?.squeezeDirection
        ? valueAvailable(squeeze.squeezeDirection)
        : { value: null, status: "unavailable" },
      status: squeeze ? "available" : "unavailable",
    },
    volatility: {
      state: volState,
      score: { value: null, status: "not_applicable" },
      status: volState.status,
    },
  };
}

export function buildBiasAndRisk(ts: TerminalState): { bias: BiasBlock; risk: RiskBlock } {
  return { bias: buildBias(ts), risk: buildRisk(ts) };
}

export function buildMarketState(
  ts: TerminalState,
  context: "micro" | "macro",
): MarketStateBlock {
  const mm = ts.positioning?.marketModeEngine;
  const trade = ts.positioning?.tradeDecisionEngine;
  const gammaEngine = ts.positioning?.gammaCurveEngine;
  const classification = mm?.marketMode
    ? valueAvailable(mm.marketMode)
    : { value: null, status: "unavailable" as const };
  const confidence = normalizeConfidence(mm?.marketModeConfidence);
  const volState =
    gammaEngine?.dealerRegime === "LONG_GAMMA"
      ? valueAvailable("COMPRESSING")
      : gammaEngine?.dealerRegime === "SHORT_GAMMA"
        ? valueAvailable("EXPANDING")
        : valueAvailable("NORMAL");

  return {
    classification,
    label: classification.value
      ? valueAvailable(classification.value.replace(/_/g, " "))
      : { value: null, status: "unavailable" },
    confidence,
    tradeState: trade?.tradeState
      ? valueAvailable(trade.tradeState)
      : { value: null, status: "unavailable" },
    volatilityState: volState,
    drivers: buildDrivers(mm?.marketModeReason, context, mm?.marketModeConfidence),
  };
}
