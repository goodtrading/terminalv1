import type { TerminalState } from "../../terminal-state";
import type {
  AlertBlock,
  GammaBlock,
  GammaFlipBlock,
  MarketContext,
  OptionsStructureBlock,
  TransitionZone,
} from "./mobileMarketStateV2.types";
import type { ContextQuality } from "./mobileMarketStateV2.types";
import {
  computeDistance,
  normalizeProbability,
  normalizeRegimeCode,
  regimeLabelFromCode,
  valueAvailable,
  valueNotApplicable,
} from "./mobileMarketStateQuality";
import {
  buildDominantExpiry,
  buildPriceLevelRef,
  filterMagnetsNearSpot,
  levelsFromMagnets,
  mergePocketSources,
  pocketsFromLegacyRange,
  pocketsFromStructured,
} from "./levelBuilders";
import { buildBiasAndRisk, buildMarketState } from "./sharedContextBuilders";
import { buildContextScenarios } from "./buildScenarios";

function buildFlipBlock(
  type: "local" | "global",
  price: number | null | undefined,
  spot: number | null,
  reason: string | null | undefined,
  source: string | null | undefined,
): GammaFlipBlock {
  const priceBlock = valueAvailable(price != null && price > 0 ? price : null);
  return {
    type,
    price: priceBlock,
    distance: computeDistance(priceBlock.value, spot),
    reason: reason ? valueAvailable(reason) : { value: null, status: "unavailable" },
    source: source ? valueAvailable(source) : { value: null, status: "unavailable" },
  };
}

function buildTransitionZone(
  start: number | null | undefined,
  end: number | null | undefined,
): TransitionZone {
  return {
    start: valueAvailable(start != null && start > 0 ? start : null),
    end: valueAvailable(end != null && end > 0 ? end : null),
  };
}

export function buildMicroContext(
  ts: TerminalState,
  spot: number | null,
  scenarioStatus: ContextQuality["scenarioStatus"],
): MarketContext {
  const options = ts.options as Record<string, unknown> | undefined;
  const localFlip = options?.gammaFlipLocal as number | null | undefined;
  const localRegime = normalizeRegimeCode(options?.gammaRegimeLocal as string | undefined);
  const localRegimeLabel = {
    value: regimeLabelFromCode(localRegime.value),
    status: localRegime.status,
  };

  const magnetsAll = ts.levels?.gammaMagnets ?? (options?.gammaMagnets as number[] | undefined) ?? [];
  const nearMagnets = filterMagnetsNearSpot(magnetsAll, spot, 7);
  const structuredPockets = pocketsFromStructured(
    (ts.shortGammaPockets as { pockets?: Array<{ id: string; rangeLow: number; rangeHigh: number; confidence?: number }> } | undefined)?.pockets,
    spot,
    "micro",
    "short_gamma_pocket_engine",
  );
  const legacyPocket = pocketsFromLegacyRange(
    ts.levels?.shortGammaPocketStart,
    ts.levels?.shortGammaPocketEnd,
    spot,
    "micro",
    "storage_key_levels",
  );
  const pockets = mergePocketSources(structuredPockets, legacyPocket);

  const callWall =
    buildPriceLevelRef({
      id: "micro-call-wall",
      type: "call_wall",
      price: (options?.callWallUsd as number | undefined) ?? ts.positioning?.callWall,
      spot,
      context: "micro",
      source: options?.callWallUsd != null ? "deribit_options" : "storage_positioning",
    }) ?? null;

  const putWall =
    buildPriceLevelRef({
      id: "micro-put-wall",
      type: "put_wall",
      price: (options?.putWallUsd as number | undefined) ?? ts.positioning?.putWall,
      spot,
      context: "micro",
      source: options?.putWallUsd != null ? "deribit_options" : "storage_positioning",
    }) ?? null;

  const dealerPivot =
    buildPriceLevelRef({
      id: "micro-dealer-pivot",
      type: "dealer_pivot",
      price: (options?.dealerPivot as number | undefined) ?? ts.positioning?.dealerPivot,
      spot,
      context: "micro",
      source: "deribit_options",
    }) ?? null;

  const gamma: GammaBlock = {
    totalGex: valueNotApplicable(),
    normalizedGex: valueNotApplicable(),
    regime: localRegime,
    regimeLabel: localRegimeLabel,
    confidence: { value: null, status: "not_applicable" },
    flip: buildFlipBlock(
      "local",
      localFlip,
      spot,
      options?.localFlipReason as string | undefined,
      "deribit_gamma_flip_local",
    ),
    dealerPivot,
    transitionZone: buildTransitionZone(
      options?.localTransitionZoneStart as number | undefined,
      options?.localTransitionZoneEnd as number | undefined,
    ),
    gammaMagnets: levelsFromMagnets(nearMagnets, spot, "micro", "deribit_options"),
    shortGammaPockets: pockets,
    dominantExpiry: buildDominantExpiry(null, false),
  };

  const optionsStructure: OptionsStructureBlock = {
    callWall,
    putWall,
    dealerPivot,
    gammaMagnets: gamma.gammaMagnets,
    shortGammaPockets: pockets,
    dominantExpiry: buildDominantExpiry(null, false),
  };

  const { bias, risk } = buildBiasAndRisk(ts);

  return {
    context: "micro",
    horizon: { code: "intraday", label: "Minutes to hours" },
    gamma,
    marketState: buildMarketState(ts, "micro"),
    bias,
    risk,
    scenarios: buildContextScenarios(ts, "micro", scenarioStatus),
    optionsStructure,
    quality: {
      scenarioSource: "storage",
      scenarioStatus,
      alertSource: "engine_rules",
      warnings: [],
    },
  };
}

export function buildStructuredAlerts(ts: TerminalState, spot: number | null): AlertBlock[] {
  const alerts: AlertBlock[] = [];
  const now = new Date().toISOString();
  const cascade = ts.positioning?.liquidityCascadeEngine;
  const squeeze = ts.positioning?.squeezeProbabilityEngine;
  const sweep = ts.positioning?.liquiditySweepDetector;
  const absorption = ts.positioning?.absorption;

  if (cascade?.cascadeRisk === "HIGH" || cascade?.cascadeRisk === "EXTREME") {
    alerts.push({
      id: `cascade-${Date.now()}`,
      code: "CASCADE_RISK",
      type: "cascade_risk",
      severity: cascade.cascadeRisk,
      context: "macro",
      triggeredAt: now,
      levelReference: null,
      label: "Elevated liquidity cascade risk",
      data: {
        direction: cascade.cascadeDirection ?? null,
        trigger: cascade.cascadeTrigger ?? null,
      },
    });
  }

  const squeezeProb = normalizeProbability(squeeze?.squeezeProbability);
  if (squeezeProb.value != null && squeezeProb.value >= 0.6) {
    alerts.push({
      id: `squeeze-${Date.now()}`,
      code: "SQUEEZE_SETUP",
      type: "squeeze_setup",
      severity: squeezeProb.value >= 0.8 ? "HIGH" : "MEDIUM",
      context: "micro",
      triggeredAt: now,
      levelReference: null,
      label: "Elevated squeeze probability",
      data: {
        probability: squeezeProb.value,
        direction: squeeze?.squeezeDirection ?? null,
        type: squeeze?.squeezeType ?? null,
      },
    });
  }

  if (sweep?.sweepRisk === "HIGH") {
    alerts.push({
      id: `sweep-${Date.now()}`,
      code: "LIQUIDITY_SWEEP",
      type: "liquidity_sweep",
      severity: "HIGH",
      context: "micro",
      triggeredAt: now,
      levelReference: null,
      label: "Liquidity sweep risk elevated",
      data: {
        direction: sweep.sweepDirection ?? null,
        trigger: sweep.sweepTrigger ?? null,
      },
    });
  }

  if (absorption?.status === "ACTIVE") {
    alerts.push({
      id: `absorption-${Date.now()}`,
      code: "ABSORPTION",
      type: "absorption",
      severity: "MEDIUM",
      context: "micro",
      triggeredAt: now,
      levelReference: null,
      label: "Absorption active",
      data: {
        side: absorption.side ?? null,
        confidence: absorption.confidence ?? null,
      },
    });
  }

  const localFlip = (ts.options as Record<string, unknown> | undefined)?.gammaFlipLocal as
    | number
    | null
    | undefined;
  const dist = computeDistance(localFlip, spot);
  if (dist.status === "available" && dist.distancePct != null && dist.distancePct < 2) {
    alerts.push({
      id: `micro-flip-proximity-${Date.now()}`,
      code: "GAMMA_FLIP_PROXIMITY",
      type: "gamma_flip_proximity",
      severity: dist.distancePct < 1 ? "HIGH" : "MEDIUM",
      context: "micro",
      triggeredAt: now,
      levelReference: buildPriceLevelRef({
        id: "micro-local-flip",
        type: "gamma_flip_local",
        price: localFlip,
        spot,
        context: "micro",
        source: "deribit_gamma_flip_local",
      }),
      label: "Price near local gamma flip",
      data: {
        signedDistancePct: dist.signedDistancePct,
        distancePct: dist.distancePct,
        flipType: "local",
      },
    });
  }

  const globalFlip = (ts.options as Record<string, unknown> | undefined)?.gammaFlipGlobal as
    | number
    | null
    | undefined;
  const globalDist = computeDistance(globalFlip, spot);
  if (globalDist.status === "available" && globalDist.distancePct != null && globalDist.distancePct < 3) {
    alerts.push({
      id: `macro-flip-proximity-${Date.now()}`,
      code: "GAMMA_FLIP_PROXIMITY",
      type: "gamma_flip_proximity",
      severity: globalDist.distancePct < 1.5 ? "HIGH" : "MEDIUM",
      context: "macro",
      triggeredAt: now,
      levelReference: buildPriceLevelRef({
        id: "macro-global-flip",
        type: "gamma_flip_global",
        price: globalFlip,
        spot,
        context: "macro",
        source: "deribit_gamma_flip_global",
      }),
      label: "Price near global gamma flip",
      data: {
        signedDistancePct: globalDist.signedDistancePct,
        distancePct: globalDist.distancePct,
        flipType: "global",
      },
    });
  }

  return alerts;
}
