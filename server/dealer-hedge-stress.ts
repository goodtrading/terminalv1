import { z } from "zod";

import type {
  DealerHedgeSensitivity,
  DealerHedgeStressScenario,
  DealerHedgeStressScenarioType,
} from "@shared/schema";

export const dealerHedgeStressScenarioTypeSchema = z.enum([
  "SPOT_UP_1PCT",
  "SPOT_DOWN_1PCT",
  "VOL_UP_1PT",
  "TIME_DECAY_1D",
]);

export const dealerHedgeStressScenarioSchema = z.object({
  scenarioType: dealerHedgeStressScenarioTypeSchema,
  deltaSpotUsd: z.number().nullable(),
  deltaIvVolPoints: z.number(),
  deltaDays: z.number(),
  gammaOptionDeltaChangeUsd: z.number().nullable(),
  vannaOptionDeltaChangeUsd: z.number().nullable(),
  charmOptionDeltaChangeUsd: z.number().nullable(),
  optionDeltaChangeUsd: z.number().nullable(),
  requiredHedgeTradeUsd: z.number().nullable(),
  hedgeAction: z.enum(["BUY", "SELL", "NEUTRAL"]).nullable(),
  source: z.enum(["LIVE_DERIBIT", "BOOTSTRAP", "NO_DATA"]),
  vannaCoverage: z.number().nullable(),
  charmCoverage: z.number().nullable(),
});

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function coverageRatio(validRows: number | null | undefined, totalEligibleRows: number | null | undefined): number | null {
  if (validRows == null || totalEligibleRows == null) return null;
  if (!Number.isFinite(validRows) || !Number.isFinite(totalEligibleRows)) return null;
  if (totalEligibleRows <= 0) return null;
  return validRows / totalEligibleRows;
}

function hedgeActionFromRequired(requiredHedgeTradeUsd: number | null): DealerHedgeStressScenario["hedgeAction"] {
  if (requiredHedgeTradeUsd == null) return null;
  if (requiredHedgeTradeUsd > 0) return "BUY";
  if (requiredHedgeTradeUsd < 0) return "SELL";
  return "NEUTRAL";
}

function unavailableScenario(params: {
  scenarioType: DealerHedgeStressScenarioType;
  deltaSpotUsd: number | null;
  deltaIvVolPoints: number;
  deltaDays: number;
  source: DealerHedgeSensitivity["source"];
  vannaCoverage: number | null;
  charmCoverage: number | null;
}): DealerHedgeStressScenario {
  return {
    scenarioType: params.scenarioType,
    deltaSpotUsd: params.deltaSpotUsd,
    deltaIvVolPoints: params.deltaIvVolPoints,
    deltaDays: params.deltaDays,
    gammaOptionDeltaChangeUsd: null,
    vannaOptionDeltaChangeUsd: null,
    charmOptionDeltaChangeUsd: null,
    optionDeltaChangeUsd: null,
    requiredHedgeTradeUsd: null,
    hedgeAction: null,
    source: params.source,
    vannaCoverage: params.vannaCoverage,
    charmCoverage: params.charmCoverage,
  };
}

function buildAvailableScenario(params: {
  scenarioType: DealerHedgeStressScenarioType;
  deltaSpotUsd: number | null;
  deltaIvVolPoints: number;
  deltaDays: number;
  source: DealerHedgeSensitivity["source"];
  gammaOptionDeltaChangeUsd: number;
  vannaOptionDeltaChangeUsd: number;
  charmOptionDeltaChangeUsd: number;
  vannaCoverage: number | null;
  charmCoverage: number | null;
}): DealerHedgeStressScenario {
  const optionDeltaChangeUsd =
    params.gammaOptionDeltaChangeUsd +
    params.vannaOptionDeltaChangeUsd +
    params.charmOptionDeltaChangeUsd;
  const requiredHedgeTradeUsd = -optionDeltaChangeUsd;

  return {
    scenarioType: params.scenarioType,
    deltaSpotUsd: params.deltaSpotUsd,
    deltaIvVolPoints: params.deltaIvVolPoints,
    deltaDays: params.deltaDays,
    gammaOptionDeltaChangeUsd: params.gammaOptionDeltaChangeUsd,
    vannaOptionDeltaChangeUsd: params.vannaOptionDeltaChangeUsd,
    charmOptionDeltaChangeUsd: params.charmOptionDeltaChangeUsd,
    optionDeltaChangeUsd,
    requiredHedgeTradeUsd,
    hedgeAction: hedgeActionFromRequired(requiredHedgeTradeUsd),
    source: params.source,
    vannaCoverage: params.vannaCoverage,
    charmCoverage: params.charmCoverage,
  };
}

export function buildDealerHedgeStressScenarios(input: {
  spotPrice?: number | null;
  sensitivity: DealerHedgeSensitivity;
}): DealerHedgeStressScenario[] {
  const spotPrice = finiteOrNull(input.spotPrice);
  const sensitivity = input.sensitivity;
  const gammaUsdPerDollar = finiteOrNull(sensitivity.gammaUsdPerDollar);
  const vannaUsdPerVolPoint = finiteOrNull(sensitivity.vannaUsdPerVolPoint);
  const charmUsdPerDay = finiteOrNull(sensitivity.charmUsdPerDay);
  const vannaCoverage = coverageRatio(sensitivity.vannaValidRows, sensitivity.vannaTotalEligibleRows);
  const charmCoverage = coverageRatio(sensitivity.charmValidRows, sensitivity.charmTotalEligibleRows);
  const source = sensitivity.source;

  const spotShock = spotPrice != null ? spotPrice * 0.01 : null;

  const spotUpAvailable = spotShock != null && gammaUsdPerDollar != null;
  const spotDownAvailable = spotShock != null && gammaUsdPerDollar != null;
  const volUpAvailable = vannaUsdPerVolPoint != null;
  const timeDecayAvailable = charmUsdPerDay != null;

  const spotUpDelta = spotShock != null ? spotShock : null;
  const spotDownDelta = spotShock != null ? -spotShock : null;

  const spotUpScenario = spotUpAvailable
    ? buildAvailableScenario({
        scenarioType: "SPOT_UP_1PCT",
        deltaSpotUsd: spotUpDelta,
        deltaIvVolPoints: 0,
        deltaDays: 0,
        source,
        gammaOptionDeltaChangeUsd: gammaUsdPerDollar! * spotUpDelta!,
        vannaOptionDeltaChangeUsd: 0,
        charmOptionDeltaChangeUsd: 0,
        vannaCoverage,
        charmCoverage,
      })
    : unavailableScenario({
        scenarioType: "SPOT_UP_1PCT",
        deltaSpotUsd: spotUpDelta,
        deltaIvVolPoints: 0,
        deltaDays: 0,
        source,
        vannaCoverage,
        charmCoverage,
      });

  const spotDownScenario = spotDownAvailable
    ? buildAvailableScenario({
        scenarioType: "SPOT_DOWN_1PCT",
        deltaSpotUsd: spotDownDelta,
        deltaIvVolPoints: 0,
        deltaDays: 0,
        source,
        gammaOptionDeltaChangeUsd: gammaUsdPerDollar! * spotDownDelta!,
        vannaOptionDeltaChangeUsd: 0,
        charmOptionDeltaChangeUsd: 0,
        vannaCoverage,
        charmCoverage,
      })
    : unavailableScenario({
        scenarioType: "SPOT_DOWN_1PCT",
        deltaSpotUsd: spotDownDelta,
        deltaIvVolPoints: 0,
        deltaDays: 0,
        source,
        vannaCoverage,
        charmCoverage,
      });

  const volUpScenario = volUpAvailable
    ? buildAvailableScenario({
        scenarioType: "VOL_UP_1PT",
        deltaSpotUsd: 0,
        deltaIvVolPoints: 1,
        deltaDays: 0,
        source,
        gammaOptionDeltaChangeUsd: 0,
        vannaOptionDeltaChangeUsd: vannaUsdPerVolPoint!,
        charmOptionDeltaChangeUsd: 0,
        vannaCoverage,
        charmCoverage,
      })
    : unavailableScenario({
        scenarioType: "VOL_UP_1PT",
        deltaSpotUsd: 0,
        deltaIvVolPoints: 1,
        deltaDays: 0,
        source,
        vannaCoverage,
        charmCoverage,
      });

  const timeDecayScenario = timeDecayAvailable
    ? buildAvailableScenario({
        scenarioType: "TIME_DECAY_1D",
        deltaSpotUsd: 0,
        deltaIvVolPoints: 0,
        deltaDays: 1,
        source,
        gammaOptionDeltaChangeUsd: 0,
        vannaOptionDeltaChangeUsd: 0,
        charmOptionDeltaChangeUsd: charmUsdPerDay!,
        vannaCoverage,
        charmCoverage,
      })
    : unavailableScenario({
        scenarioType: "TIME_DECAY_1D",
        deltaSpotUsd: 0,
        deltaIvVolPoints: 0,
        deltaDays: 1,
        source,
        vannaCoverage,
        charmCoverage,
      });

  return [spotUpScenario, spotDownScenario, volUpScenario, timeDecayScenario];
}
