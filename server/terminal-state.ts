import { z } from "zod";

import { storage } from "./storage";

import { MarketDataGateway, tickerSchema } from "./market-gateway";

import { DeribitOptionsGateway } from "./deribit-gateway";

import { OrderBookGateway } from "./orderbook-gateway";

import { runLiquiditySweepEngine } from "./lib/liquiditySweepEngine";

import { computeGammaAccelerationZones, deriveGammaAccelLifecycle } from "./lib/gammaAccelerationZones";

import { runAbsorptionEngine, buildInactiveAbsorptionSignal, normalizeAbsorptionSignal, type AbsorptionSignal } from "./lib/absorptionEngine";

import { getDeribitOptionsSnapshot, enrichOptionsWithOINotional } from "./lib/deribitOptionsSnapshot";

import { computeGravityMap } from "./lib/gravityMapEngine";

import { updateTimeline, getTimeline, getTimelineSummary } from "./lib/stateTimeline";

import { computeStateCoherence } from "./lib/stateCoherence";

import { getOrderBook } from "./services/orderbookService";

import { detectShortGammaPockets, type ShortGammaPocketsSignal } from "./lib/shortGammaPocketEngine";



export const terminalStateSchema = z.object({

  market: z.any(),

  exposure: z.any(),

  positioning: z.any(),

  levels: z.any(),

  scenarios: z.array(z.any()),

  ticker: tickerSchema.nullable(),

  tickerStatus: z.enum(["fresh", "stale", "unavailable"]),

  timestamp: z.number(),

  optionsLastUpdated: z.number().optional(),

  options: z.any().optional(),

  gravityMap: z.any().optional(),

  timeline: z.array(z.any()).optional(),

  timelineSummary: z.any().optional(),

  coherence: z.any().optional(),

  shortGammaPockets: z.any().optional(),

});



export type TerminalState = z.infer<typeof terminalStateSchema>;



const STALE_THRESHOLD_MS = 10000; // 10 seconds

// Terminal state is polled frequently by the UI.

// Suppress verbose console.log noise (do not affect functionality).

const DEBUG_TERMINAL_STATE_ENGINE = false;

let terminalStateLogSuppressionDepth = 0;



let lastTerminalSpotSample: { price: number; t: number } | null = null;



function computeSpotVelocityPctForAccel(spot: number, now: number): number {

  if (!Number.isFinite(spot) || spot <= 0) return 0;

  if (!lastTerminalSpotSample) {

    lastTerminalSpotSample = { price: spot, t: now };

    return 0;

  }

  const dt = now - lastTerminalSpotSample.t;

  if (dt < 80 || dt > 120_000) {

    lastTerminalSpotSample = { price: spot, t: now };

    return 0;

  }

  const v = (spot - lastTerminalSpotSample.price) / lastTerminalSpotSample.price;

  lastTerminalSpotSample = { price: spot, t: now };

  return v;

}

const originalTerminalStateConsoleLog = console.log;

function suppressTerminalStateConsoleLog() {

  terminalStateLogSuppressionDepth++;

  if (terminalStateLogSuppressionDepth === 1) {

    console.log = () => {};

  }

}

function restoreTerminalStateConsoleLog() {

  terminalStateLogSuppressionDepth = Math.max(0, terminalStateLogSuppressionDepth - 1);

  if (terminalStateLogSuppressionDepth === 0) {

    console.log = originalTerminalStateConsoleLog;

  }

}



export async function getTerminalState(): Promise<TerminalState> {

  const __suppressLogs = !DEBUG_TERMINAL_STATE_ENGINE;

  if (__suppressLogs) suppressTerminalStateConsoleLog();



  try {

    console.log('=== LOG 1 - TERMINAL SOURCE DEBUG ===');

    console.log('[TERMINAL STATE] Getting raw data from storage...');

    

    // Aggregated quantitative state from DB (fast read)

    const [market, exposure, positioning, levels, scenarios] = await Promise.all([

      storage.getMarketState(),

      storage.getDealerExposure(),

      storage.getOptionsPositioning(),

      storage.getKeyLevels(),

      storage.getTradingScenarios()

    ]);

    

    console.log('[TERMINAL STATE] RAW DATA RECEIVED:', {

      market_exists: !!market,

      market_keys: market ? Object.keys(market) : [],

      exposure_exists: !!exposure,

      exposure_keys: exposure ? Object.keys(exposure) : [],

      positioning_exists: !!positioning,

      positioning_keys: positioning ? Object.keys(positioning) : [],

      levels_exists: !!levels,

      levels_keys: levels ? Object.keys(levels) : [],

      scenarios_exists: !!scenarios,

      scenarios_keys: scenarios ? Object.keys(scenarios) : []

    });

    

    console.log('[TERMINAL STATE] CRITICAL FIELDS DEBUG:', {

      'positioning.scenarioEngine': (positioning as any)?.scenarioEngine,

      'positioning.scenarioEngine_exists': !!((positioning as any)?.scenarioEngine),

      'positioning.scenarioEngine_keys': (positioning as any)?.scenarioEngine ? Object.keys((positioning as any).scenarioEngine) : [],

      'levels.gammaMagnets': levels?.gammaMagnets,

      'levels.shortGammaPocketStart': levels?.shortGammaPocketStart,

      'levels.shortGammaPocketEnd': levels?.shortGammaPocketEnd,

      'positioning.callWall': positioning?.callWall,

      'positioning.putWall': positioning?.putWall,

      'positioning.dealerPivot': positioning?.dealerPivot

    });



    const gammaFlipValid =

      market?.gammaFlip != null &&

      Number.isFinite(market.gammaFlip) &&

      market.gammaFlip > 0;

    const gammaFlipForEngines = gammaFlipValid ? market.gammaFlip : null;

    const transitionZoneStartForEngines =

      gammaFlipValid && (market as any).transitionZoneStart > 0 ? (market as any).transitionZoneStart : null;

    const transitionZoneEndForEngines =

      gammaFlipValid && (market as any).transitionZoneEnd > 0 ? (market as any).transitionZoneEnd : null;



    // UI convention: when flip is missing, expose null so blocks/labels hide correctly.

    const marketForClient = market

      ? {

          ...market,

          gammaFlip: gammaFlipForEngines,

          distanceToFlip: gammaFlipValid ? market.distanceToFlip : null,

          transitionZoneStart: transitionZoneStartForEngines,

          transitionZoneEnd: transitionZoneEndForEngines,

        }

      : market;



  let livePlaybook = null;

  let liveVolExpansion = null;

  let liveGammaCurve = null;

  let liveInstitutionalBias = null;

  let liveTradeDecision = null;

  let liveLiquidityCascade = null;

  let liveSqueezeProbability = null;

  let liveMarketMode = null;

  let liveDealerHedgingFlowMap = null;

  let liveHeatmap = null;

  let liveDominantExpiry: string | null = null;

  let optionsSource: string | null = null;

  let deribitSummaryExtras: {

    gammaFlipGlobal: number | null;

    gammaFlipGlobalSource?: "fresh_snapshot" | "none" | "legacy_structural_live";

    gammaFlipGlobalDebug?: {

      staleSnapshotFlip: number | null;

      staleSnapshotSpot: number | null;

      legacyLiveSpotFlip: number | null;

      legacyAtFileSpotFlip: number | null;

      legacyCrossings?: number[];

      gammaFlipStructuralLive?: number | null;

      reason: string;

    } | null;

    gammaFlipBroad: number | null;

    gammaFlipLocal: number | null;

    gammaRegimeLocal: "LONG GAMMA" | "SHORT GAMMA" | null;

    localTransitionZoneStart: number | null;

    localTransitionZoneEnd: number | null;

    localFlipReason: string | null;

    gammaFlipOperationalLegacy: number | null;

  } | null = null;

  try {

    const { options: rawOptions, source } = await DeribitOptionsGateway.ingestOptions();

    const cachedTicker = MarketDataGateway.getCachedTicker();

    const summary = await DeribitOptionsGateway.getSummary(rawOptions, cachedTicker?.price, source);

    deribitSummaryExtras = {

      gammaFlipGlobal: summary.gammaFlipGlobal ?? null,

      gammaFlipGlobalSource: summary.gammaFlipGlobalSource,

      gammaFlipGlobalDebug: summary.gammaFlipGlobalDebug ?? null,

      gammaFlipBroad: summary.gammaFlipBroad ?? null,

      gammaFlipLocal: summary.gammaFlipLocal ?? null,

      gammaRegimeLocal: summary.gammaRegimeLocal ?? null,

      localTransitionZoneStart: summary.localTransitionZoneStart ?? null,

      localTransitionZoneEnd: summary.localTransitionZoneEnd ?? null,

      localFlipReason: summary.localFlipReason ?? null,

      gammaFlipOperationalLegacy: summary.gammaFlipOperationalLegacy ?? null,

    };

    livePlaybook = summary.tradingPlaybook || null;

    liveVolExpansion = summary.volatilityExpansionDetector || null;

    liveGammaCurve = summary.gammaCurveEngine || null;

    liveInstitutionalBias = summary.institutionalBiasEngine || null;

    liveTradeDecision = summary.tradeDecisionEngine || null;

    liveLiquidityCascade = summary.liquidityCascadeEngine || null;

    liveSqueezeProbability = summary.squeezeProbabilityEngine || null;

    liveMarketMode = summary.marketModeEngine || null;

    liveDealerHedgingFlowMap = summary.dealerHedgingFlowMap || null;

    optionsSource = summary.source || source;

    liveDominantExpiry = (summary as any).dominantExpiry || null;



    if (cachedTicker?.price) {

      try {

        const gammaContext = {

          gammaFlip: gammaFlipForEngines,

          gammaMagnets: levels?.gammaMagnets ?? [],

        };

        liveHeatmap = await OrderBookGateway.getLiquidityHeatmap(cachedTicker.price, gammaContext);

        const spotVel = computeSpotVelocityPctForAccel(cachedTicker.price, Date.now());

        const accZones = computeGammaAccelerationZones({

          spotPrice: cachedTicker.price,

          gammaFlip: gammaFlipForEngines,

          gammaMagnets: levels?.gammaMagnets ?? [],

          liquidityHeatZones: liveHeatmap?.liquidityHeatZones ?? [],

          liquidityVacuum: liveHeatmap?.liquidityVacuum ?? null,

          spotVelocityPct: spotVel,

        });

        DEBUG_TERMINAL_STATE_ENGINE && console.log("[GammaAccel] computed zones count=", accZones.length);

        DEBUG_TERMINAL_STATE_ENGINE && console.log("[GammaAccel] first zones=", accZones.slice(0, 3));

        if (liveHeatmap) {

          liveHeatmap.gammaAccelerationZones = accZones;

          liveHeatmap.gammaAccelerationLifecycle = deriveGammaAccelLifecycle(accZones, spotVel);

        }

      } catch (heatErr) {

        console.warn("[TerminalState] Heatmap injection failed:", heatErr);

      }

    }

  } catch (e) {

    console.error("[TerminalState] Options injection failed:", e);

  }



  // ═══ ENGINE #20: Institutional Liquidity Sweep (lib/liquiditySweepEngine) ═══

  let liveSweepDetector: any = null;

  try {

    const spot = MarketDataGateway.getCachedTicker()?.price || 0;

    const heatZones = liveHeatmap?.liquidityHeatZones ?? [];

    const { output } = runLiquiditySweepEngine({

      spot,

      heatZones,

      liquidityPressure: liveHeatmap?.liquidityPressure ?? "BALANCED",

      heatmapSummary: liveHeatmap?.heatmapSummary,

      vacuum: liveHeatmap?.liquidityVacuum,

      dealerPivot: positioning?.dealerPivot ?? 0,

      callWall: positioning?.callWall ?? 0,

      putWall: positioning?.putWall ?? 0,

      marketMode: liveMarketMode?.marketMode,

      marketModeConfidence: liveMarketMode?.marketModeConfidence,

      dealerFlowDirection: liveDealerHedgingFlowMap?.hedgingFlowDirection,

      dealerFlowStrength: liveDealerHedgingFlowMap?.hedgingFlowStrength,

      dealerFlowAccel: liveDealerHedgingFlowMap?.hedgingAccelerationRisk,

      cascadeRisk: liveLiquidityCascade?.cascadeRisk,

      cascadeDirection: liveLiquidityCascade?.cascadeDirection,

      squeezeProbability: liveSqueezeProbability?.squeezeProbability,

      squeezeDirection: liveSqueezeProbability?.squeezeDirection,

      gammaRegimeBand: liveGammaCurve?.gammaRegimeBand,

      institutionalBias: liveInstitutionalBias?.institutionalBias,

      tradeDirection: liveTradeDecision?.tradeDirection,

    });

    liveSweepDetector = output;

  } catch (sweepErr) {

    console.warn("[TerminalState] Sweep detector failed:", sweepErr);

    liveSweepDetector = {

      sweepRisk: "LOW", sweepDirection: "NONE", sweepTrigger: "--", sweepTargetZone: "--",

      sweepSummary: ["Sweep detector error", "Using fallback values"]

    };

  }



  let absorption: AbsorptionSignal = buildInactiveAbsorptionSignal("Absorption engine not run");

  const spotPrice = MarketDataGateway.getCachedTicker()?.price;

  if (spotPrice && liveHeatmap) {

    try {

      const ob = getOrderBook();

      const bids = (ob?.bids ?? []).map((b: { price: number; size: number }) => ({ price: b.price, size: b.size }));

      const asks = (ob?.asks ?? []).map((a: { price: number; size: number }) => ({ price: a.price, size: a.size }));

      const result = runAbsorptionEngine({

        spotPrice,

        bids,

        asks,

        heatZones: liveHeatmap.liquidityHeatZones ?? [],

        sweepDetector: liveSweepDetector,

        callWall: positioning?.callWall ?? null,

        putWall: positioning?.putWall ?? null,

        gammaMagnets: levels?.gammaMagnets ?? [],

        gammaFlip: gammaFlipForEngines,

        accelZones: (liveHeatmap as any).gammaAccelerationZones ?? [],

      });

      if (result && typeof result === "object" && result.signal != null) {

        absorption = normalizeAbsorptionSignal(result.signal);

        DEBUG_TERMINAL_STATE_ENGINE && console.log("[Absorption] engine_run=true fallback=false status=" + absorption.status + " side=" + absorption.side + " confidence=" + absorption.confidence);

      } else {

        absorption = buildInactiveAbsorptionSignal("Absorption engine returned no result");

        DEBUG_TERMINAL_STATE_ENGINE && console.log("[Absorption] engine_run=true fallback=true reason=\"Absorption engine returned no result\"");

      }

    } catch (absErr) {

      absorption = buildInactiveAbsorptionSignal("Absorption engine error");

      console.warn("[TerminalState] Absorption engine failed:", absErr);

      DEBUG_TERMINAL_STATE_ENGINE && console.log("[Absorption] engine_run=true fallback=true reason=\"Absorption engine error\"");

    }

  } else {

    const reason = !spotPrice ? "Missing spot price" : "Missing heatmap context";

    absorption = buildInactiveAbsorptionSignal(reason);

    DEBUG_TERMINAL_STATE_ENGINE && console.log("[Absorption] engine_run=false fallback=true reason=\"" + reason + "\"");

  }

  DEBUG_TERMINAL_STATE_ENGINE && console.log("[Absorption] final status=" + absorption.status + " side=" + absorption.side + " confidence=" + absorption.confidence);



  const enrichedPositioning = positioning

    ? { ...positioning, tradingPlaybook: livePlaybook, volatilityExpansionDetector: liveVolExpansion, gammaCurveEngine: liveGammaCurve, institutionalBiasEngine: liveInstitutionalBias, tradeDecisionEngine: liveTradeDecision, liquidityCascadeEngine: liveLiquidityCascade, squeezeProbabilityEngine: liveSqueezeProbability, marketModeEngine: liveMarketMode, dealerHedgingFlowMap: liveDealerHedgingFlowMap, liquiditySweepDetector: liveSweepDetector, liquidityHeatmap: liveHeatmap, dominantExpiry: liveDominantExpiry, optionsSource, absorption }

    : { absorption };



  // Read from in-memory cache ONLY (deterministic latency, no side effects)

  const ticker = MarketDataGateway.getCachedTicker();

  const now = Date.now();

  

  let tickerStatus: "fresh" | "stale" | "unavailable" = "unavailable";

  if (ticker) {

    const age = now - ticker.timestamp;

    tickerStatus = age < STALE_THRESHOLD_MS ? "fresh" : "stale";

  }



  const optionsLastUpdated = storage.getOptionsLastUpdated();

  let optionsSnapshot = getDeribitOptionsSnapshot();

  DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState] optionsSnapshot exists=" + !!optionsSnapshot + " strikes=" + (optionsSnapshot?.strikes?.length ?? 0));

  const spot = ticker?.price ?? (optionsSnapshot as any)?.spot ?? 0;

  if (spot > 0 && optionsSnapshot?.strikes?.length) {

    optionsSnapshot = enrichOptionsWithOINotional(

      optionsSnapshot,

      spot,

      positioning?.callWall ?? null,

      positioning?.putWall ?? null,

      1

    );

    DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState] after enrich options.strikes=" + (optionsSnapshot?.strikes?.length ?? 0));

  }



  DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState OI+Gravity] spot=" + spot + " strikes=" + (optionsSnapshot?.strikes?.length ?? 0) +

    " primaryOiCluster=" + (optionsSnapshot as any)?.primaryOiCluster +

    " primaryOiClusterUsd=" + (optionsSnapshot as any)?.primaryOiClusterUsd +

    " callWallUsd=" + (optionsSnapshot as any)?.callWallUsd +

    " putWallUsd=" + (optionsSnapshot as any)?.putWallUsd);



  let gravityMap: ReturnType<typeof computeGravityMap> | null = null;

  try {

    if (spot > 0 && optionsSnapshot?.strikes?.length) {

      gravityMap = computeGravityMap({

        spotPrice: spot,

        gammaFlip: gammaFlipForEngines,

        transitionZoneStart: transitionZoneStartForEngines,

        transitionZoneEnd: transitionZoneEndForEngines,

        gammaMagnets: levels?.gammaMagnets ?? [],

        shortGammaPocketStart: levels?.shortGammaPocketStart ?? null,

        shortGammaPocketEnd: levels?.shortGammaPocketEnd ?? null,

        callWall: positioning?.callWall ?? null,

        putWall: positioning?.putWall ?? null,

        dealerPivot: positioning?.dealerPivot ?? null,

        strikes: optionsSnapshot.strikes,

        liquidityHeatZones: liveHeatmap?.liquidityHeatZones ?? [],

        dealerFlowDirection: liveDealerHedgingFlowMap?.hedgingFlowDirection,

        liquidityPressure: liveHeatmap?.liquidityPressure,

        gammaAccelerationZones: (liveHeatmap as any)?.gammaAccelerationZones ?? [],

        topMagnets: optionsSnapshot?.topMagnets ?? [],

      });

    } else {

      const reason = spot <= 0 ? "Missing spot" : !optionsSnapshot?.strikes?.length ? "No strike data" : "Insufficient context";

      gravityMap = {

        status: "INACTIVE",

        primaryMagnet: null,

        secondaryMagnet: null,

        repulsionZones: [],

        accelerationZones: [],

        bias: "NEUTRAL",

        summary: reason,

      };

      DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState OI+Gravity] gravityMap INACTIVE: " + reason);

    }

    DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState OI+Gravity] gravityMap.status=" + gravityMap?.status + " primaryMagnet=" + (gravityMap?.primaryMagnet?.price ?? "null") + " summary=" + (gravityMap?.summary ?? ""));

  } catch (gmErr) {

    console.warn("[TerminalState] Gravity map failed:", gmErr);

    gravityMap = {

      status: "INACTIVE",

      primaryMagnet: null,

      secondaryMagnet: null,

      repulsionZones: [],

      accelerationZones: [],

      bias: "NEUTRAL",

      summary: "Gravity map engine error",

    };

  }



  const posOut = enrichedPositioning as { liquidityHeatmap?: { liquidityHeatZones?: unknown[]; gammaAccelerationZones?: unknown[] } } | null;

  if (posOut?.liquidityHeatmap) {

    const hm = posOut.liquidityHeatmap;

    DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState] /api/terminal/state heatmap: liquidityHeatZones count=" + (hm.liquidityHeatZones?.length ?? 0) + ", gammaAccelerationZones count=" + (hm.gammaAccelerationZones?.length ?? 0));

  }



  const hasAbsorption = enrichedPositioning && typeof (enrichedPositioning as any).absorption === "object";

  DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState] response positioning.absorption exists=" + hasAbsorption + (hasAbsorption ? " status=" + (enrichedPositioning as any).absorption?.status : ""));



  // ── State timeline & coherence (meta-layer) ─────────────────────────────

  const playbook = livePlaybook as any;

  const playbookState = playbook?.state ?? playbook?.playbookState ?? null;

  const playbookBias = (playbook?.directionalBias ??

    playbook?.bias ??

    "NEUTRAL") as "LONG" | "SHORT" | "NEUTRAL";

  const playbookConfidence =

    typeof playbook?.confidence === "number" ? playbook.confidence : null;



  const optionsGammaRegime = (optionsSnapshot as any)?.gammaRegime ?? null;

  const optionsRegimeQuality = (market as any)?.optionsRegimeQuality ?? null;

  const optionsMagnetBias = (market as any)?.optionsMagnetBias ?? null;

  const marketGammaRegime = (market as any)?.gammaRegime ?? null;



  const absorptionStatus = (enrichedPositioning as any)?.absorption?.status ?? null;

  const absorptionSide = (enrichedPositioning as any)?.absorption?.side ?? null;



  // pressureState / defenseHealth / resolutionState are not yet first-class in terminal-state;

  // wire through from absorption signal if present, otherwise null.

  const pressureState = (enrichedPositioning as any)?.absorption?.pressureState ?? null;

  const defenseHealth = (enrichedPositioning as any)?.absorption?.defenseHealth ?? null;

  const resolutionState = (enrichedPositioning as any)?.absorption?.resolutionState ?? null;



  updateTimeline({

    spot: ticker?.price ?? null,

    optionsGammaRegime,

    optionsRegimeQuality,

    optionsMagnetBias,

    marketGammaRegime,

    absorptionStatus,

    absorptionSide,

    pressureState,

    defenseHealth,

    resolutionState,

    playbookState,

    playbookBias,

    playbookConfidence,

    now,

  });



  const timeline = getTimeline();

  const timelineSummary = getTimelineSummary();

  const coherence = computeStateCoherence(timeline);

  DEBUG_TERMINAL_STATE_ENGINE && console.log("[Timeline Debug] entries=" + timeline.length);



  const enrichedOptionsSnapshot = optionsSnapshot;

  const strikesArray = Array.isArray(enrichedOptionsSnapshot?.strikes) ? enrichedOptionsSnapshot.strikes : [];

  // ── Short Gamma Pockets Detection ─────────────────────────────────────
  let shortGammaPockets: ShortGammaPocketsSignal | null = null;
  try {
    const spot = ticker?.price ?? enrichedOptionsSnapshot?.spot ?? 0;
    if (spot > 0) {
      shortGammaPockets = detectShortGammaPockets({
        spotPrice: spot,
        gammaRegime: (marketForClient?.gammaRegime as "LONG GAMMA" | "SHORT GAMMA" | "NEUTRAL" | null) ?? null,
        gammaFlip: gammaFlipForEngines,
        transitionZoneStart: transitionZoneStartForEngines,
        transitionZoneEnd: transitionZoneEndForEngines,
        gammaMagnets: levels?.gammaMagnets ?? [],
        callWall: positioning?.callWall ?? null,
        putWall: positioning?.putWall ?? null,
        shortGammaPocketStart: levels?.shortGammaPocketStart ?? null,
        shortGammaPocketEnd: levels?.shortGammaPocketEnd ?? null,
        marketMode: liveMarketMode?.marketMode,
        marketModeConfidence: liveMarketMode?.marketModeConfidence,
        expansionProbability: liveVolExpansion?.expansionProbability,
      });
      DEBUG_TERMINAL_STATE_ENGINE && console.log("[ShortGammaPockets] status=" + shortGammaPockets.status + " summary=" + shortGammaPockets.summary);
    }
  } catch (sgpErr) {
    console.warn("[TerminalState] Short gamma pockets detection failed:", sgpErr);
    shortGammaPockets = {
      status: "NONE",
      nearest: null,
      pockets: [],
      summary: "Short gamma pockets detection error",
    };
  }

  const finalOptions = {

    asOf: enrichedOptionsSnapshot?.asOf ?? null,

    spot: enrichedOptionsSnapshot?.spot ?? ticker?.price ?? null,

    totalGex: marketForClient?.totalGex ?? enrichedOptionsSnapshot?.totalGex ?? 0,

    gammaRegime: marketForClient?.gammaRegime ?? enrichedOptionsSnapshot?.gammaRegime ?? "NEUTRAL",

    gammaFlip: marketForClient?.gammaFlip ?? null,

    gammaFlipGlobal: deribitSummaryExtras?.gammaFlipGlobal ?? null,

    gammaFlipGlobalSource: deribitSummaryExtras?.gammaFlipGlobalSource ?? "none",

    gammaFlipGlobalDebug: deribitSummaryExtras?.gammaFlipGlobalDebug ?? null,

    gammaFlipBroad: deribitSummaryExtras?.gammaFlipBroad ?? null,

    gammaFlipLocal: deribitSummaryExtras?.gammaFlipLocal ?? null,

    gammaRegimeLocal: deribitSummaryExtras?.gammaRegimeLocal ?? null,

    localTransitionZoneStart: deribitSummaryExtras?.localTransitionZoneStart ?? null,

    localTransitionZoneEnd: deribitSummaryExtras?.localTransitionZoneEnd ?? null,

    localFlipReason: deribitSummaryExtras?.localFlipReason ?? null,

    gammaFlipOperationalLegacy: deribitSummaryExtras?.gammaFlipOperationalLegacy ?? null,

    topMagnets: Array.isArray(enrichedOptionsSnapshot?.topMagnets) ? enrichedOptionsSnapshot.topMagnets : [],

    strikeCount: strikesArray.length,

    strikes: strikesArray,

    primaryOiCluster: (enrichedOptionsSnapshot as any)?.primaryOiCluster ?? null,

    primaryOiClusterUsd: (enrichedOptionsSnapshot as any)?.primaryOiClusterUsd ?? null,

    callWallUsd: (enrichedOptionsSnapshot as any)?.callWallUsd ?? null,

    putWallUsd: (enrichedOptionsSnapshot as any)?.putWallUsd ?? null,

    callWall: positioning?.callWall ?? null,

    putWall: positioning?.putWall ?? null,

    shortGammaPockets,

  };

  console.log(`[TerminalState][FinalOptions] totalGex=${finalOptions.totalGex} marketForClient.totalGex=${marketForClient?.totalGex} enrichedOptionsSnapshot.totalGex=${enrichedOptionsSnapshot?.totalGex}`);



  console.warn("[GammaFlipTrace][TerminalState]", {

    storageMarketGammaFlip: market?.gammaFlip ?? null,

    marketForClientGammaFlip: marketForClient?.gammaFlip ?? null,

    optionsSnapshotGammaFlip: enrichedOptionsSnapshot?.gammaFlip ?? null,

    finalOptionsGammaFlip: finalOptions.gammaFlip ?? null,

    source: optionsSource ?? "unknown",

  });

  console.warn("[TerminalStateLocalGamma]", {

    optionsGammaFlip: finalOptions.gammaFlip ?? null,

    gammaFlipGlobal: finalOptions.gammaFlipGlobal ?? null,

    gammaFlipBroad: finalOptions.gammaFlipBroad ?? null,

    gammaFlipLocal: finalOptions.gammaFlipLocal ?? null,

    gammaRegimeLocal: finalOptions.gammaRegimeLocal ?? null,

    localTransitionZoneStart: finalOptions.localTransitionZoneStart ?? null,

    localTransitionZoneEnd: finalOptions.localTransitionZoneEnd ?? null,

    localFlipReason: finalOptions.localFlipReason ?? null,

  });

  DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState final options keys]", Object.keys(finalOptions));

  DEBUG_TERMINAL_STATE_ENGINE && console.log("[TerminalState final options sample]", {

    hasSpot: finalOptions.spot != null,

    hasStrikes: Array.isArray(finalOptions.strikes),

    strikesLength: finalOptions.strikes.length,

    primaryOiCluster: finalOptions.primaryOiCluster,

    callWallUsd: finalOptions.callWallUsd,

    putWallUsd: finalOptions.putWallUsd,

  });



    return {

      market: marketForClient,

      exposure,

      positioning: enrichedPositioning,

      levels,

      scenarios,

      ticker,

      tickerStatus,

      timestamp: now,

      optionsLastUpdated,

      options: finalOptions,
      shortGammaPockets,

      gravityMap,

      timeline,

      timelineSummary,

      coherence,

    };

  } finally {

    if (__suppressLogs) restoreTerminalStateConsoleLog();

  }

}

