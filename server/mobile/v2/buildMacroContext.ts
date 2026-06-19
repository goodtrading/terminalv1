import type { TerminalState } from "../../terminal-state";
import type { ContextQuality, MarketContext } from "./mobileMarketStateV2.types";
import {
  computeDistance,
  normalizeRegimeCode,
  normalizedGexFromTotal,
  regimeLabelFromCode,
  valueAvailable,
} from "./mobileMarketStateQuality";
import {
  buildDominantExpiry,
  buildPriceLevelRef,
  levelsFromMagnets,
  mergePocketSources,
  pocketsFromLegacyRange,
  pocketsFromStructured,
} from "./levelBuilders";
import { buildBiasAndRisk, buildMarketState } from "./sharedContextBuilders";
import { buildContextScenarios } from "./buildScenarios";

export function buildMacroContext(
  ts: TerminalState,
  spot: number | null,
  scenarioStatus: ContextQuality["scenarioStatus"],
): MarketContext {
  const options = ts.options as Record<string, unknown> | undefined;
  const globalFlip = options?.gammaFlipGlobal as number | null | undefined;
  const globalSource = (options?.gammaFlipGlobalSource as string | undefined) ?? "none";

  const marketRegime = normalizeRegimeCode(
    ts.market?.gammaRegime ?? (options?.gammaRegime as string | undefined),
  );
  const marketRegimeLabel = {
    value: regimeLabelFromCode(marketRegime.value),
    status: marketRegime.status,
  };

  const totalGexRaw =
    ts.market?.totalGex != null && Number.isFinite(ts.market.totalGex)
      ? ts.market.totalGex
      : (options?.totalGex as number | undefined);

  const totalGex =
    totalGexRaw != null && Number.isFinite(totalGexRaw)
      ? valueAvailable(totalGexRaw)
      : { value: null, status: "unavailable" as const };

  const magnets = ts.levels?.gammaMagnets ?? (options?.gammaMagnets as number[] | undefined) ?? [];
  const structuredPockets = pocketsFromStructured(
    (ts.shortGammaPockets as { pockets?: Array<{ id: string; rangeLow: number; rangeHigh: number; confidence?: number }> } | undefined)?.pockets,
    spot,
    "macro",
    "short_gamma_pocket_engine",
  );
  const legacyPocket = pocketsFromLegacyRange(
    ts.levels?.shortGammaPocketStart,
    ts.levels?.shortGammaPocketEnd,
    spot,
    "macro",
    "storage_key_levels",
  );
  const pockets = mergePocketSources(structuredPockets, legacyPocket);

  const callWallPrice = ts.positioning?.callWall ?? (options?.callWallUsd as number | undefined);
  const putWallPrice = ts.positioning?.putWall ?? (options?.putWallUsd as number | undefined);
  const dealerPivotPrice = ts.positioning?.dealerPivot ?? (options?.dealerPivot as number | undefined);

  const callWall =
    buildPriceLevelRef({
      id: "macro-call-wall",
      type: "call_wall",
      price: callWallPrice,
      spot,
      context: "macro",
      source: "storage_positioning",
    }) ?? null;

  const putWall =
    buildPriceLevelRef({
      id: "macro-put-wall",
      type: "put_wall",
      price: putWallPrice,
      spot,
      context: "macro",
      source: "storage_positioning",
    }) ?? null;

  const dealerPivot =
    buildPriceLevelRef({
      id: "macro-dealer-pivot",
      type: "dealer_pivot",
      price: dealerPivotPrice,
      spot,
      context: "shared",
      source: "storage_positioning",
    }) ?? null;

  const dominantExpiryRaw =
    (ts.positioning as { dominantExpiry?: string | null } | undefined)?.dominantExpiry ??
    (options?.dominantExpiry as string | undefined);

  const flipPrice =
    globalFlip != null && Number.isFinite(globalFlip) && globalFlip > 0 ? globalFlip : null;

  const { bias, risk } = buildBiasAndRisk(ts);
  const dominantExpiry = buildDominantExpiry(dominantExpiryRaw ?? null, true);

  return {
    context: "macro",
    horizon: { code: "structural", label: "Session to days" },
    gamma: {
      totalGex,
      normalizedGex: normalizedGexFromTotal(totalGex.value),
      regime: marketRegime,
      regimeLabel: marketRegimeLabel,
      confidence: { value: null, status: "not_applicable" },
      flip: {
        type: "global",
        price: flipPrice != null ? valueAvailable(flipPrice) : { value: null, status: "unavailable" },
        distance: computeDistance(flipPrice, spot),
        reason: { value: null, status: "not_applicable" },
        source: globalSource !== "none" ? valueAvailable(globalSource) : { value: null, status: "unavailable" },
      },
      dealerPivot,
      transitionZone: {
        start: valueAvailable(
          ts.market?.transitionZoneStart != null && ts.market.transitionZoneStart > 0
            ? ts.market.transitionZoneStart
            : null,
        ),
        end: valueAvailable(
          ts.market?.transitionZoneEnd != null && ts.market.transitionZoneEnd > 0
            ? ts.market.transitionZoneEnd
            : null,
        ),
      },
      gammaMagnets: levelsFromMagnets(magnets, spot, "macro", "storage_key_levels"),
      shortGammaPockets: pockets,
      dominantExpiry,
    },
    marketState: buildMarketState(ts, "macro"),
    bias: {
      ...bias,
      horizon: {
        code: "structural",
        label: "Session to days",
        status: "available",
      },
    },
    risk,
    scenarios: buildContextScenarios(ts, "macro", scenarioStatus),
    optionsStructure: {
      callWall,
      putWall,
      dealerPivot,
      gammaMagnets: levelsFromMagnets(magnets, spot, "macro", "storage_key_levels"),
      shortGammaPockets: pockets,
      dominantExpiry,
    },
    quality: {
      scenarioSource: "storage",
      scenarioStatus,
      alertSource: "engine_rules",
      warnings: [],
    },
  };
}
