import {
  marketState, dealerExposure, optionsPositioning, keyLevels, tradingScenarios, optionsData, dealerHedgingFlow,
  type MarketState, type DealerExposure, type DealerHedgeSensitivity, type DealerHedgeState, type DealerHedgeStressScenario, type OptionsPositioning, type KeyLevels, type TradingScenario, type OptionData, type DealerHedgingFlow
} from "@shared/schema";
import {
  parseOptionsCSV,
  calculateGEX,
  findGammaFlip,
  calculateVanna,
  calculateVannaWithCoverage,
  calculateCharm,
  detectWalls,
  calculateKeyLevels,
  calculateAcceleration,
  type OptionsEntry,
} from "./analytics";
import { GAMMA_OPERATIONAL_CONFIG } from "./deribit-gateway";
import { buildDealerHedgeSensitivity } from "./dealer-hedge-sensitivity";
import { buildDealerHedgeState } from "./dealer-hedge-state";
import { buildDealerHedgeStressScenarios } from "./dealer-hedge-stress";
import { generateDynamicScenarios } from "./scenarios";
import { MarketDataGateway } from "./market-gateway";
import path from "path";

/** Bootstrap spot when live ticker is not yet available: dominant OI strike, else median strike (never a magic price). */
function inferSpotFromOptionsData(data: OptionsEntry[]): number | null {
  if (!data.length) return null;
  let maxOi = 0;
  let strikeAtMaxOi = 0;
  for (const row of data) {
    if (row.open_interest > maxOi) {
      maxOi = row.open_interest;
      strikeAtMaxOi = row.strike;
    }
  }
  if (maxOi > 0 && strikeAtMaxOi > 0) return strikeAtMaxOi;
  const strikes = Array.from(new Set(data.map((d) => d.strike)))
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);
  if (!strikes.length) return null;
  return strikes[Math.floor(strikes.length / 2)]!;
}

function biasFromLiveOrHeuristic(liveValue: number | null | undefined, heuristicScore: number | null | undefined): "BULLISH" | "BEARISH" | "NEUTRAL" | null {
  if (liveValue == null && heuristicScore == null) return null;
  if (liveValue != null) return liveValue > 0 ? "BULLISH" : liveValue < 0 ? "BEARISH" : "NEUTRAL";
  if (heuristicScore != null) return heuristicScore > 0.05 ? "BULLISH" : heuristicScore < -0.05 ? "BEARISH" : "NEUTRAL";
  return null;
}

function compatibilityExposure(liveValue: number | null | undefined, heuristicScore: number | null | undefined): number | null {
  return liveValue ?? heuristicScore ?? null;
}

function decisionMagnitude(heuristicScore: number | null | undefined): number | null {
  return heuristicScore == null ? null : Math.abs(heuristicScore);
}

export interface OptionsSummaryUpdate {
  totalGex?: number | null;
  source?: "LIVE_DERIBIT" | "BOOTSTRAP" | "NO_DATA";
  gammaFlip?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  activeCallWall?: number | null;
  activePutWall?: number | null;
  activeGammaZoneHigh?: number | null;
  activeGammaZoneLow?: number | null;
  gammaMagnets?: number[];
  shortGammaZones?: Array<{ startStrike: number; endStrike: number }>;
  totalVanna?: number | null;
  totalCharm?: number | null;
  liveVannaExposure?: number | null;
  liveVannaGrossAbsExposure?: number | null;
  liveVannaDirectionalRatio?: number | null;
  liveVannaValidRows?: number | null;
  liveVannaTotalEligibleRows?: number | null;
  liveVannaCallSignedContribution?: number | null;
  liveVannaPutSignedContribution?: number | null;
  liveCharmExposure?: number | null;
  liveCharmGrossAbsExposure?: number | null;
  liveCharmDirectionalRatio?: number | null;
  liveCharmValidRows?: number | null;
  liveCharmTotalEligibleRows?: number | null;
  liveCharmCallSignedContribution?: number | null;
  liveCharmPutSignedContribution?: number | null;
  dealerHedgeSensitivity?: DealerHedgeSensitivity | null;
  dealerHedgeStressScenarios?: DealerHedgeStressScenario[];
  dealerHedgeState?: DealerHedgeState | null;
  dealerFlowScore?: number | null;
  hedgingStressScore?: number | null;
  dealerHedgingFlowMap?: {
    hedgingFlowDirection: "BUYING" | "SELLING" | "NEUTRAL";
    hedgingFlowStrength: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
    hedgingAccelerationRisk: "LOW" | "MEDIUM" | "HIGH";
    hedgingTriggerZone: string;
    hedgingFlowSummary: string[];
  } | null;
}

export interface IStorage {
  getMarketState(): Promise<MarketState | undefined>;
  getDealerExposure(): Promise<DealerExposure | undefined>;
  getDealerHedgeSensitivity(): Promise<DealerHedgeSensitivity | undefined>;
  getDealerHedgeState(): Promise<DealerHedgeState | undefined>;
  getOptionsPositioning(): Promise<OptionsPositioning | undefined>;
  getKeyLevels(): Promise<KeyLevels | undefined>;
  getTradingScenarios(): Promise<TradingScenario[]>;
  getDealerHedgeStressScenarios(): Promise<DealerHedgeStressScenario[]>;
  getOptionsData(): Promise<OptionData[]>;
  getDealerHedgingFlow(): Promise<DealerHedgingFlow | undefined>;
  recomputeAll(csvPath: string): Promise<void>;
  updateFromDeribitSummary(summary: OptionsSummaryUpdate, spotPrice: number): void;
  getOptionsLastUpdated(): number | undefined;
}

export class MemStorage implements IStorage {
  private marketState: MarketState | undefined;
  private dealerExposure: DealerExposure | undefined;
  private dealerHedgeSensitivity: DealerHedgeSensitivity = buildDealerHedgeSensitivity({ totalGex: null });
  private dealerHedgeState: DealerHedgeState = buildDealerHedgeState({
    sensitivity: buildDealerHedgeSensitivity({ totalGex: null }),
    standardizedStress: buildDealerHedgeStressScenarios({
      spotPrice: null,
      sensitivity: buildDealerHedgeSensitivity({ totalGex: null }),
    }),
    structuralPressure: null,
  });
  private dealerHedgeStressScenarios: DealerHedgeStressScenario[] = buildDealerHedgeStressScenarios({
    spotPrice: null,
    sensitivity: buildDealerHedgeSensitivity({ totalGex: null }),
  });
  private optionsPositioning: OptionsPositioning | undefined;
  private keyLevels: KeyLevels | undefined;
  private tradingScenarios: TradingScenario[] = [];
  private optionsData: OptionData[] = [];
  private dealerHedgingFlow: DealerHedgingFlow | undefined;
  private optionsLastUpdated: number | undefined;

  constructor() {
    const csvPath = path.resolve(process.cwd(), "data", "deribit_options.csv");
    this.recomputeAll(csvPath).catch((err) =>
      console.error(
        "[Storage] CSV bootstrap failed (live Deribit refresh can still populate storage):",
        err instanceof Error ? err.message : String(err),
      ),
    );
  }

  private isAnalyticsReady(): boolean {
    return !!(this.marketState && this.optionsPositioning && this.keyLevels && this.dealerExposure);
  }

  /** Retry CSV bootstrap after data/ is restored (e.g. project moved off OneDrive). */
  async ensureBootstrapped(): Promise<boolean> {
    if (this.isAnalyticsReady()) return true;
    const csvPath = path.resolve(process.cwd(), "data", "deribit_options.csv");
    try {
      await this.recomputeAll(csvPath);
    } catch (err) {
      console.error(
        "[Storage][ensureBootstrapped] CSV recompute failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
    return this.isAnalyticsReady();
  }

  /**
   * When CSV bootstrap never ran, seed in-memory analytics from a live Deribit summary
   * so /api/market-state and related endpoints can serve real values.
   */
  private bootstrapShellFromDeribitSummary(
    summary: OptionsSummaryUpdate,
    spotPrice: number,
  ): void {
    const gex = summary.totalGex;
    if (gex == null || !Number.isFinite(gex)) return;

    const flip =
      summary.gammaFlip != null && Number.isFinite(summary.gammaFlip) && summary.gammaFlip > 0
        ? summary.gammaFlip
        : null;
    const transitionPct = GAMMA_OPERATIONAL_CONFIG.transitionWidthBps / 10000;
    const callWall = summary.callWall ?? 0;
    const putWall = summary.putWall ?? 0;
    const isLiveSummary = summary.source === "LIVE_DERIBIT";
    const liveVannaExposure = isLiveSummary ? summary.liveVannaExposure ?? summary.totalVanna ?? null : null;
    const liveVannaGrossAbsExposure = isLiveSummary ? summary.liveVannaGrossAbsExposure ?? null : null;
    const liveVannaDirectionalRatio = isLiveSummary ? summary.liveVannaDirectionalRatio ?? null : null;
    const liveVannaValidRows = isLiveSummary ? summary.liveVannaValidRows ?? null : null;
    const liveVannaTotalEligibleRows = isLiveSummary ? summary.liveVannaTotalEligibleRows ?? null : null;
    const liveVannaCallSignedContribution = isLiveSummary ? summary.liveVannaCallSignedContribution ?? null : null;
    const liveVannaPutSignedContribution = isLiveSummary ? summary.liveVannaPutSignedContribution ?? null : null;
    const liveCharmExposure = isLiveSummary ? summary.liveCharmExposure ?? summary.totalCharm ?? null : null;
    const liveCharmGrossAbsExposure = isLiveSummary ? summary.liveCharmGrossAbsExposure ?? null : null;
    const liveCharmDirectionalRatio = isLiveSummary ? summary.liveCharmDirectionalRatio ?? null : null;
    const liveCharmValidRows = isLiveSummary ? summary.liveCharmValidRows ?? null : null;
    const liveCharmTotalEligibleRows = isLiveSummary ? summary.liveCharmTotalEligibleRows ?? null : null;
    const liveCharmCallSignedContribution = isLiveSummary ? summary.liveCharmCallSignedContribution ?? null : null;
    const liveCharmPutSignedContribution = isLiveSummary ? summary.liveCharmPutSignedContribution ?? null : null;
    const heuristicVannaScore = null;
    const heuristicCharmScore = null;

    this.marketState = {
      id: 1,
      gammaRegime: gex > 0 ? "LONG GAMMA" : "SHORT GAMMA",
      totalGex: gex,
      gammaFlip: flip,
      distanceToFlip:
        flip != null ? Math.abs(((flip - spotPrice) / spotPrice) * 100) : null,
      transitionZoneStart: flip != null ? flip * (1 - transitionPct) : null,
      transitionZoneEnd: flip != null ? flip * (1 + transitionPct) : null,
      gammaAcceleration: "NEUTRAL",
      timestamp: new Date(),
    };

    this.optionsPositioning = {
      id: 1,
      callWall: callWall > 0 ? callWall : 0,
      putWall: putWall > 0 ? putWall : 0,
      oiConcentration: 0,
      dealerPivot:
        callWall > 0 && putWall > 0 ? Math.round((callWall + putWall) / 2) : Math.round(spotPrice),
      timestamp: new Date(),
    };

    const magnets = summary.gammaMagnets ?? [];
    const firstZone = summary.shortGammaZones?.[0];
    this.keyLevels = {
      id: 1,
      gammaMagnets: magnets,
      shortGammaPocketStart: firstZone?.startStrike ?? null,
      shortGammaPocketEnd: firstZone?.endStrike ?? null,
      deepRiskPocketStart: null,
      deepRiskPocketEnd: null,
      timestamp: new Date(),
    };

    this.dealerExposure = {
      id: 1,
      liveVannaExposure,
      liveVannaGrossAbsExposure,
      liveVannaDirectionalRatio,
      liveVannaValidRows,
      liveVannaTotalEligibleRows,
      liveVannaCallSignedContribution,
      liveVannaPutSignedContribution,
      liveCharmExposure,
      liveCharmGrossAbsExposure,
      liveCharmDirectionalRatio,
      liveCharmValidRows,
      liveCharmTotalEligibleRows,
      liveCharmCallSignedContribution,
      liveCharmPutSignedContribution,
      heuristicVannaScore,
      heuristicCharmScore,
      vannaExposure: compatibilityExposure(liveVannaExposure, heuristicVannaScore),
      vannaBias: biasFromLiveOrHeuristic(liveVannaExposure, heuristicVannaScore),
      charmExposure: compatibilityExposure(liveCharmExposure, heuristicCharmScore),
      charmBias: biasFromLiveOrHeuristic(liveCharmExposure, heuristicCharmScore),
      gammaPressure: "+0.00",
      gammaConcentration: 0,
      timestamp: new Date(),
    };

    this.dealerHedgeSensitivity = summary.dealerHedgeSensitivity ?? buildDealerHedgeSensitivity({
      source: summary.source === "LIVE_DERIBIT" || summary.source === "BOOTSTRAP" ? summary.source : undefined,
      totalGex: gex,
      liveVannaExposure,
      liveVannaGrossAbsExposure,
      liveVannaDirectionalRatio,
      liveVannaValidRows,
      liveVannaTotalEligibleRows,
      liveCharmExposure,
      liveCharmGrossAbsExposure,
      liveCharmDirectionalRatio,
      liveCharmValidRows,
      liveCharmTotalEligibleRows,
    });
    this.dealerHedgeStressScenarios = summary.dealerHedgeStressScenarios ?? buildDealerHedgeStressScenarios({
      spotPrice,
      sensitivity: this.dealerHedgeSensitivity,
    });
    this.dealerHedgeState = summary.dealerHedgeState ?? buildDealerHedgeState({
      source: this.dealerHedgeSensitivity.source,
      sensitivity: this.dealerHedgeSensitivity,
      standardizedStress: this.dealerHedgeStressScenarios,
      structuralPressure: summary.dealerHedgingFlowMap
        ? {
            score: summary.dealerFlowScore ?? null,
            bias: summary.dealerHedgingFlowMap.hedgingFlowDirection,
            intensity:
              summary.dealerHedgingFlowMap.hedgingFlowStrength === "EXTREME"
                ? "HIGH"
                : summary.dealerHedgingFlowMap.hedgingFlowStrength,
            accelerationRisk: summary.dealerHedgingFlowMap.hedgingAccelerationRisk,
            triggerZone: summary.dealerHedgingFlowMap.hedgingTriggerZone,
            stressScore: summary.hedgingStressScore ?? null,
          }
        : null,
    });

    this.dealerHedgingFlow = {
      id: 1,
      hedgeFlowBias: null,
      hedgeFlowIntensity: null,
      accelerationRisk: null,
      flowTriggerUp: null,
      flowTriggerDown: null,
      timestamp: new Date(),
    };

    this.optionsLastUpdated = Date.now();
    console.log("[Storage] Seeded analytics shell from live Deribit summary");
  }

  async recomputeAll(csvPath: string) {
    const data = parseOptionsCSV(csvPath);
    const tickerSpot = MarketDataGateway.getCachedTicker()?.price;
    const spotPrice =
      tickerSpot != null && Number.isFinite(tickerSpot) && tickerSpot > 0
        ? tickerSpot
        : inferSpotFromOptionsData(data);
    if (spotPrice == null || !Number.isFinite(spotPrice) || spotPrice <= 0) {
      console.error(
        "[Storage][recomputeAll] aborting bootstrap: no valid spot (ticker unavailable and chain inference failed)"
      );
      return;
    }
    if (tickerSpot == null || !Number.isFinite(tickerSpot) || tickerSpot <= 0) {
      console.warn("[Storage][recomputeAll] using inferred spot from CSV chain (OI/median), not live ticker:", spotPrice);
    }

    const totalGex = calculateGEX(data, spotPrice);
    const rawFlip = findGammaFlip(data);
    const flip = Number.isFinite(rawFlip) && rawFlip > 0 ? rawFlip : null;
    const walls = detectWalls(data, spotPrice);
    const levels = calculateKeyLevels(data, spotPrice);
    const accel = calculateAcceleration(data, spotPrice);

    const ms: MarketState = {
      id: 1,
      gammaRegime: totalGex > 0 ? "LONG GAMMA" : "SHORT GAMMA",
      totalGex,
      gammaFlip: flip,
      distanceToFlip: flip != null ? Math.abs(((flip - spotPrice) / spotPrice) * 100) : null,
      transitionZoneStart: flip != null ? flip * (1 - GAMMA_OPERATIONAL_CONFIG.transitionWidthBps / 10000) : null,
      transitionZoneEnd: flip != null ? flip * (1 + GAMMA_OPERATIONAL_CONFIG.transitionWidthBps / 10000) : null,
      gammaAcceleration: accel,
      timestamp: new Date()
    };
    this.marketState = ms;

    const op: OptionsPositioning = {
      id: 1,
      callWall: walls.callWall,
      putWall: walls.putWall,
      oiConcentration: walls.oiConcentration,
      dealerPivot: Math.round(walls.dealerPivot),
      timestamp: new Date()
    };
    this.optionsPositioning = op;

    const kl: KeyLevels = {
      id: 1,
      gammaMagnets: levels.gammaMagnets,
      shortGammaPocketStart: levels.shortGammaPocketStart,
      shortGammaPocketEnd: levels.shortGammaPocketEnd,
      deepRiskPocketStart: levels.deepRiskPocketStart,
      deepRiskPocketEnd: levels.deepRiskPocketEnd,
      timestamp: new Date()
    };
    this.keyLevels = kl;

    // Dealer Flow Recalibration
    const bootstrapVanna = calculateVannaWithCoverage(data, spotPrice);
    const heuristicVannaScore = bootstrapVanna.validRows > 0 ? bootstrapVanna.value : null;
    const heuristicCharmScore = calculateCharm(data, spotPrice);
    const liveVannaExposure = null;
    const liveCharmExposure = null;

    let rawGammaPressure = 0;
    data.forEach(d => {
      const distancePct = Math.abs(d.strike - spotPrice) / spotPrice;
      const spotWeight = Math.max(0.15, 1 - distancePct * 10);
      rawGammaPressure += d.gamma * d.open_interest * spotWeight;
    });

    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const gammaPressureValue = totalAbsGamma > 0 ? (rawGammaPressure / totalAbsGamma) : 0;
    const normalizedPressure = Math.tanh(gammaPressureValue * 1.5);

    let localGamma = 0;
    let totalGammaAbs = 0;
    data.forEach(d => {
      const distancePct = Math.abs(d.strike - spotPrice) / spotPrice;
      const spotWeight = Math.max(0, 1 - distancePct * 12);
      const absGamma = Math.abs(d.gamma * d.open_interest);
      localGamma += absGamma * spotWeight;
      totalGammaAbs += absGamma;
    });
    const concentration = totalGammaAbs > 0 ? Math.max(0, Math.min(1, localGamma / totalGammaAbs)) : 0;

    const de: DealerExposure = {
      id: 1,
      liveVannaExposure,
      liveVannaGrossAbsExposure: null,
      liveVannaDirectionalRatio: null,
      liveVannaValidRows: null,
      liveVannaTotalEligibleRows: null,
      liveVannaCallSignedContribution: null,
      liveVannaPutSignedContribution: null,
      liveCharmExposure,
      liveCharmGrossAbsExposure: null,
      liveCharmDirectionalRatio: null,
      liveCharmValidRows: null,
      liveCharmTotalEligibleRows: null,
      liveCharmCallSignedContribution: null,
      liveCharmPutSignedContribution: null,
      heuristicVannaScore,
      heuristicCharmScore,
      vannaExposure: compatibilityExposure(liveVannaExposure, heuristicVannaScore),
      vannaBias: biasFromLiveOrHeuristic(liveVannaExposure, heuristicVannaScore),
      charmExposure: compatibilityExposure(liveCharmExposure, heuristicCharmScore),
      charmBias: biasFromLiveOrHeuristic(liveCharmExposure, heuristicCharmScore),
      gammaPressure: (normalizedPressure >= 0 ? "+" : "") + normalizedPressure.toFixed(2),
      gammaConcentration: concentration,
      timestamp: new Date()
    };
    this.dealerExposure = de;

    this.dealerHedgeSensitivity = buildDealerHedgeSensitivity({
      source: totalGex != null ? "BOOTSTRAP" : undefined,
      totalGex,
      liveVannaExposure: null,
      liveVannaGrossAbsExposure: null,
      liveVannaDirectionalRatio: null,
      liveVannaValidRows: null,
      liveVannaTotalEligibleRows: null,
      liveCharmExposure: null,
      liveCharmGrossAbsExposure: null,
      liveCharmDirectionalRatio: null,
      liveCharmValidRows: null,
      liveCharmTotalEligibleRows: null,
    });
    this.dealerHedgeStressScenarios = buildDealerHedgeStressScenarios({
      spotPrice,
      sensitivity: this.dealerHedgeSensitivity,
    });

    // DEALER HEDGING FLOW V2 (Institutional Model)
    let flowScore = 0;

    // 1. Gamma Regime Base
    const isLongGamma = ms.gammaRegime === "LONG GAMMA";
    flowScore += isLongGamma ? 1 : -1;

    // 2. Vanna/Charm Interaction (Scoring)
    // Heuristic scores alone drive normalized thresholds; live exposures only contribute directional sign.
    const vannaDecisionScore = de.heuristicVannaScore;
    const charmDecisionScore = de.heuristicCharmScore;
    const vannaAbs = decisionMagnitude(vannaDecisionScore);
    const charmAbs = decisionMagnitude(charmDecisionScore);

    if (de.vannaBias === "BULLISH") flowScore += vannaAbs != null ? (vannaAbs > 0.5 ? 2 : 1) : 1;
    if (de.vannaBias === "BEARISH") flowScore -= vannaAbs != null ? (vannaAbs > 0.5 ? 2 : 1) : 1;

    if (de.charmBias === "BULLISH") flowScore += charmAbs != null ? (charmAbs > 0.5 ? 2 : 1) : 1;
    if (de.charmBias === "BEARISH") flowScore -= charmAbs != null ? (charmAbs > 0.5 ? 2 : 1) : 1;

    // 3. Dealer Pivot Logic
    const isAbovePivot = spotPrice > op.dealerPivot;
    flowScore += isAbovePivot ? 1 : -1;

    // 4. Transition Zone Logic
    const isInsideTransition = ms.transitionZoneStart != null &&
      ms.transitionZoneEnd != null &&
      spotPrice >= ms.transitionZoneStart &&
      spotPrice <= ms.transitionZoneEnd;
    if (isInsideTransition) {
      flowScore *= 0.5;
    }

    // Map Score to Bias
    const hedgeFlowBias = flowScore >= 2 ? "BUYING" : flowScore <= -2 ? "SELLING" : "NEUTRAL";

    // 5. Intensity Logic
    const totalExposure = (vannaAbs ?? 0) + (charmAbs ?? 0);
    const distToFlip = ms.gammaFlip != null ? Math.abs(spotPrice - ms.gammaFlip) / spotPrice : Infinity;
    const distToPivot = Math.abs(spotPrice - op.dealerPivot) / spotPrice;

    let intensityScore = 0;
    if (totalExposure > 1.0) intensityScore += 2;
    else if (totalExposure > 0.4) intensityScore += 1;

    if (distToFlip < 0.01) intensityScore += 1;
    if (distToPivot < 0.005) intensityScore += 1;

    const hedgeFlowIntensity = intensityScore >= 3 ? "HIGH" : intensityScore >= 1 ? "MEDIUM" : "LOW";

    // 6. Acceleration Risk Refinement
    const strongAlignment = vannaDecisionScore != null && charmDecisionScore != null && de.vannaBias === de.charmBias && totalExposure > 0.8;
    const nearFlipInShortGamma =
      !isLongGamma &&
      ms.gammaFlip != null &&
      spotPrice < ms.gammaFlip * 1.01;
    const accelerationRisk = (!isLongGamma || nearFlipInShortGamma || strongAlignment) ? "HIGH" : "LOW";

    // 7. Trigger Selection Refinement
    const flowTriggerUp = [op.dealerPivot, ms.gammaFlip, ms.transitionZoneEnd, op.callWall]
      .filter((l): l is number => l != null && Number.isFinite(l))
      .filter(l => l > spotPrice + 10)
      .sort((a, b) => a - b)[0] || op.callWall;

    const flowTriggerDown = [op.dealerPivot, ms.gammaFlip, ms.transitionZoneStart, op.putWall]
      .filter((l): l is number => l != null && Number.isFinite(l))
      .filter(l => l < spotPrice - 10)
      .sort((a, b) => b - a)[0] || op.putWall;

    this.dealerHedgingFlow = {
      id: 1,
      hedgeFlowBias,
      hedgeFlowIntensity,
      accelerationRisk,
      flowTriggerUp,
      flowTriggerDown,
      timestamp: new Date()
    };
    this.dealerHedgeState = buildDealerHedgeState({
      source: this.dealerHedgeSensitivity.source,
      sensitivity: this.dealerHedgeSensitivity,
      standardizedStress: this.dealerHedgeStressScenarios,
      structuralPressure: {
        score: flowScore,
        bias: hedgeFlowBias,
        intensity: hedgeFlowIntensity,
        accelerationRisk,
        triggerZone: null,
        stressScore: null,
      },
    });

    this.tradingScenarios = generateDynamicScenarios(ms, op, kl, de);
    this.optionsLastUpdated = Date.now();

    const formatVal = (v: number | null) => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(2);

    console.log("=== DEALER FLOW AUDIT ===");
    console.log(`Vanna Exposure: ${formatVal(heuristicVannaScore)}`);
    console.log(`Vanna Bias: ${de.vannaBias}`);
    console.log(`Charm Exposure: ${formatVal(heuristicCharmScore)}`);
    console.log(`Charm Bias: ${de.charmBias}`);
    console.log(`Gamma Pressure: ${de.gammaPressure}`);
    console.log(`Gamma Concentration: ${concentration > 0.6 ? "HIGH" : concentration > 0.3 ? "MEDIUM" : "LOW"} (${concentration.toFixed(2)})`);
    console.log(`Method Used: Enhanced Flow Sensitivity (Spot/Time Weighted)`);
    console.log("=========================");
  }

  async getMarketState() {

    return this.marketState;
  }
  async getDealerExposure() { return this.dealerExposure; }
  async getDealerHedgeSensitivity() { return this.dealerHedgeSensitivity; }
  async getDealerHedgeState() { return this.dealerHedgeState; }
  async getOptionsPositioning() { return this.optionsPositioning; }
  async getKeyLevels() { return this.keyLevels; }
  async getTradingScenarios() { return this.tradingScenarios; }
  async getDealerHedgeStressScenarios() { return this.dealerHedgeStressScenarios; }
  async getOptionsData() { return this.optionsData; }
  async getDealerHedgingFlow() { return this.dealerHedgingFlow; }
  getOptionsLastUpdated() { return this.optionsLastUpdated; }

  updateFromDeribitSummary(summary: OptionsSummaryUpdate, spotPrice: number): void {
    console.log("[Storage][IncomingSummary]", {
      totalGex: summary.totalGex,
      gammaFlip: summary.gammaFlip,
      totalVanna: summary.totalVanna,
      totalCharm: summary.totalCharm,
    });
    if (!this.isAnalyticsReady()) {
      this.bootstrapShellFromDeribitSummary(summary, spotPrice);
      if (!this.isAnalyticsReady()) return;
    }
    const liveSensitivitySource = summary.source === "LIVE_DERIBIT" ? "LIVE_DERIBIT" : undefined;
    this.dealerHedgeSensitivity = summary.dealerHedgeSensitivity ?? buildDealerHedgeSensitivity({
      source: liveSensitivitySource,
      totalGex: summary.totalGex,
      liveVannaExposure: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveVannaExposure : null,
      liveVannaGrossAbsExposure: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveVannaGrossAbsExposure : null,
      liveVannaDirectionalRatio: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveVannaDirectionalRatio : null,
      liveVannaValidRows: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveVannaValidRows : null,
      liveVannaTotalEligibleRows: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveVannaTotalEligibleRows : null,
      liveCharmExposure: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveCharmExposure : null,
      liveCharmGrossAbsExposure: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveCharmGrossAbsExposure : null,
      liveCharmDirectionalRatio: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveCharmDirectionalRatio : null,
      liveCharmValidRows: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveCharmValidRows : null,
      liveCharmTotalEligibleRows: liveSensitivitySource === "LIVE_DERIBIT" ? summary.liveCharmTotalEligibleRows : null,
    });
    this.dealerHedgeStressScenarios = summary.dealerHedgeStressScenarios ?? buildDealerHedgeStressScenarios({
      spotPrice,
      sensitivity: this.dealerHedgeSensitivity,
    });
    this.dealerHedgeState = summary.dealerHedgeState ?? buildDealerHedgeState({
      source: this.dealerHedgeSensitivity.source,
      sensitivity: this.dealerHedgeSensitivity,
      standardizedStress: this.dealerHedgeStressScenarios,
      structuralPressure: summary.dealerHedgingFlowMap
        ? {
            score: summary.dealerFlowScore ?? null,
            bias: summary.dealerHedgingFlowMap.hedgingFlowDirection,
            intensity:
              summary.dealerHedgingFlowMap.hedgingFlowStrength === "EXTREME"
                ? "HIGH"
                : summary.dealerHedgingFlowMap.hedgingFlowStrength,
            accelerationRisk: summary.dealerHedgingFlowMap.hedgingAccelerationRisk,
            triggerZone: summary.dealerHedgingFlowMap.hedgingTriggerZone,
            stressScore: summary.hedgingStressScore ?? null,
          }
        : null,
    });
    let updated = false;
    const ms = this.marketState;
    const op = this.optionsPositioning;
    const kl = this.keyLevels;
    if (!ms || !op || !kl) return;

    const gex = summary.totalGex;
    const flip = summary.gammaFlip;
    const callWall = summary.callWall;
    const putWall = summary.putWall;

    if (gex != null && !Number.isNaN(gex)) {
      console.log(`[Storage][UpdatingGEX] gex=${gex} regime=${gex > 0 ? "LONG GAMMA" : "SHORT GAMMA"}`);
      this.marketState = {
        ...ms,
        totalGex: gex,
        gammaRegime: gex > 0 ? "LONG GAMMA" : "SHORT GAMMA",
        timestamp: new Date(),
      };
      updated = true;
      console.log(`[Storage][UpdatedMarketState] totalGex=${this.marketState.totalGex}`);
    }
    const transitionPct = GAMMA_OPERATIONAL_CONFIG.transitionWidthBps / 10000;
    const flipValid = flip != null && Number.isFinite(flip) && flip > 0;
    const msAfterGex = this.marketState ?? ms;
    if (flipValid) {
      this.marketState = {
        ...msAfterGex,
        gammaFlip: flip,
        distanceToFlip: Math.abs(((flip - spotPrice) / spotPrice) * 100),
        transitionZoneStart: flip * (1 - transitionPct),
        transitionZoneEnd: flip * (1 + transitionPct),
        timestamp: new Date(),
      };
      updated = true;
    } else {
      this.marketState = {
        ...msAfterGex,
        gammaFlip: null,
        distanceToFlip: null,
        transitionZoneStart: null,
        transitionZoneEnd: null,
        timestamp: new Date(),
      };
      updated = true;
    }
    const msFinal = this.marketState ?? msAfterGex;
    console.log("[GammaFlipTrace][Storage]", {
      incomingFlip: flip,
      flipValid,
      storedGammaFlip: msFinal.gammaFlip,
      storedDistanceToFlip: msFinal.distanceToFlip,
      storedTransitionZoneStart: msFinal.transitionZoneStart,
      storedTransitionZoneEnd: msFinal.transitionZoneEnd,
    });
    if (callWall != null && callWall > 0 && putWall != null && putWall > 0) {
      this.optionsPositioning = {
        ...op,
        callWall,
        putWall,
        dealerPivot: Math.round((callWall + putWall) / 2),
        timestamp: new Date(),
      } as OptionsPositioning & {
        activeCallWall?: number;
        activePutWall?: number;
        activeGammaZoneHigh?: number;
        activeGammaZoneLow?: number;
      };
      const ext = this.optionsPositioning as any;
      if (summary.activeCallWall != null && summary.activeCallWall > 0) ext.activeCallWall = summary.activeCallWall;
      if (summary.activePutWall != null && summary.activePutWall > 0) ext.activePutWall = summary.activePutWall;
      if (summary.activeGammaZoneHigh != null && summary.activeGammaZoneHigh > 0) ext.activeGammaZoneHigh = summary.activeGammaZoneHigh;
      if (summary.activeGammaZoneLow != null && summary.activeGammaZoneLow > 0) ext.activeGammaZoneLow = summary.activeGammaZoneLow;
      updated = true;
    }
    if (summary.gammaMagnets && summary.gammaMagnets.length > 0) {
      const zones = summary.shortGammaZones;
      const firstZone = zones?.[0];
      const klCurrent = this.keyLevels ?? kl;
      this.keyLevels = {
        ...klCurrent,
        gammaMagnets: summary.gammaMagnets,
        shortGammaPocketStart: firstZone?.startStrike ?? klCurrent.shortGammaPocketStart,
        shortGammaPocketEnd: firstZone?.endStrike ?? klCurrent.shortGammaPocketEnd,
        timestamp: new Date(),
      };
      updated = true;
    }

    if (summary.totalVanna != null || summary.totalCharm != null || summary.liveVannaExposure != null || summary.liveCharmExposure != null) {
      const prev = this.dealerExposure;
      const liveVannaExposure = summary.liveVannaExposure ?? summary.totalVanna ?? null;
      const liveVannaGrossAbsExposure = summary.liveVannaGrossAbsExposure ?? null;
      const liveVannaDirectionalRatio = summary.liveVannaDirectionalRatio ?? null;
      const liveVannaValidRows = summary.liveVannaValidRows ?? null;
      const liveVannaTotalEligibleRows = summary.liveVannaTotalEligibleRows ?? null;
      const liveVannaCallSignedContribution = summary.liveVannaCallSignedContribution ?? null;
      const liveVannaPutSignedContribution = summary.liveVannaPutSignedContribution ?? null;
      const liveCharmExposure = summary.liveCharmExposure ?? summary.totalCharm ?? null;
      const liveCharmGrossAbsExposure = summary.liveCharmGrossAbsExposure ?? null;
      const liveCharmDirectionalRatio = summary.liveCharmDirectionalRatio ?? null;
      const liveCharmValidRows = summary.liveCharmValidRows ?? null;
      const liveCharmTotalEligibleRows = summary.liveCharmTotalEligibleRows ?? null;
      const liveCharmCallSignedContribution = summary.liveCharmCallSignedContribution ?? null;
      const liveCharmPutSignedContribution = summary.liveCharmPutSignedContribution ?? null;
      const heuristicVannaScore = null;
      const heuristicCharmScore = null;
      const gammaPressure = prev?.gammaPressure ?? "+0.00";
      const gammaConcentration = prev?.gammaConcentration ?? 0;

      this.dealerExposure = {
        id: prev?.id ?? 1,
        liveVannaExposure,
        liveVannaGrossAbsExposure,
        liveVannaDirectionalRatio,
        liveVannaValidRows,
        liveVannaTotalEligibleRows,
        liveVannaCallSignedContribution,
        liveVannaPutSignedContribution,
        liveCharmExposure,
        liveCharmGrossAbsExposure,
        liveCharmDirectionalRatio,
        liveCharmValidRows,
        liveCharmTotalEligibleRows,
        liveCharmCallSignedContribution,
        liveCharmPutSignedContribution,
        heuristicVannaScore,
        heuristicCharmScore,
        vannaExposure: compatibilityExposure(liveVannaExposure, heuristicVannaScore),
        vannaBias: biasFromLiveOrHeuristic(liveVannaExposure, heuristicVannaScore),
        charmExposure: compatibilityExposure(liveCharmExposure, heuristicCharmScore),
        charmBias: biasFromLiveOrHeuristic(liveCharmExposure, heuristicCharmScore),
        gammaPressure,
        gammaConcentration,
        timestamp: new Date()
      };

      const now = new Date().toISOString();
      console.log(
        `[DealerExposure][Update] ts=${now} liveVanna=${String(liveVannaExposure)} liveCharm=${String(liveCharmExposure)}`
      );
      this.dealerHedgingFlow = {
        id: prev?.id ?? 1,
        hedgeFlowBias: null,
        hedgeFlowIntensity: null,
        accelerationRisk: null,
        flowTriggerUp: null,
        flowTriggerDown: null,
        timestamp: new Date(),
      };
      updated = true;
    } else if (this.dealerExposure) {
      const prev = this.dealerExposure;
      const hasExplicitLiveExposure = prev.liveVannaExposure != null || prev.liveCharmExposure != null;
      if (hasExplicitLiveExposure) {
        this.dealerExposure = {
          ...prev,
          liveVannaExposure: null,
          liveVannaGrossAbsExposure: null,
          liveVannaDirectionalRatio: null,
          liveVannaValidRows: null,
          liveVannaTotalEligibleRows: null,
          liveVannaCallSignedContribution: null,
          liveVannaPutSignedContribution: null,
          liveCharmExposure: null,
          liveCharmGrossAbsExposure: null,
          liveCharmDirectionalRatio: null,
          liveCharmValidRows: null,
          liveCharmTotalEligibleRows: null,
          liveCharmCallSignedContribution: null,
          liveCharmPutSignedContribution: null,
          heuristicVannaScore: null,
          heuristicCharmScore: null,
          vannaExposure: null,
          charmExposure: null,
          vannaBias: null,
          charmBias: "NEUTRAL",
          timestamp: new Date(),
        };
        this.dealerHedgingFlow = {
          id: prev?.id ?? 1,
          hedgeFlowBias: null,
          hedgeFlowIntensity: null,
          accelerationRisk: null,
          flowTriggerUp: null,
          flowTriggerDown: null,
          timestamp: new Date(),
        };
        updated = true;
      }
    }

    if (updated) {
      this.optionsLastUpdated = Date.now();
    }
  }
}

export const storage = new MemStorage();
