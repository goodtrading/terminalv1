import { z } from "zod";
import { storage } from "./storage";
import { MarketDataGateway, tickerSchema } from "./market-gateway";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { OrderBookGateway } from "./orderbook-gateway";
import { runLiquiditySweepEngine } from "./lib/liquiditySweepEngine";
import { computeGammaAccelerationZones } from "./lib/gammaAccelerationZones";
import { runAbsorptionEngine, buildInactiveAbsorptionSignal, normalizeAbsorptionSignal, type AbsorptionSignal } from "./lib/absorptionEngine";
import { getDeribitOptionsSnapshot, enrichOptionsWithOINotional } from "./lib/deribitOptionsSnapshot";
import { computeGravityMap } from "./lib/gravityMapEngine";
import { updateTimeline, getTimeline, getTimelineSummary } from "./lib/stateTimeline";
import { computeStateCoherence } from "./lib/stateCoherence";
import { getOrderBook, isBinanceHealthy } from "./services/orderbookService";
import { computeFeedState } from "./lib/feedState";

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
  priceSource: z.string().optional(),
  orderbookSource: z.string().optional(),
  optionsSource: z.string().optional(),
  isBinancePriceHealthy: z.boolean().optional(),
  isCoinbasePriceHealthy: z.boolean().optional(),
  isBinanceOrderbookHealthy: z.boolean().optional(),
  isCoinbaseOrderbookHealthy: z.boolean().optional(),
  isDeribitOptionsHealthy: z.boolean().optional(),
  isOrderbookFallbackActive: z.boolean().optional(),
  isPriceFallbackActive: z.boolean().optional(),
});

export type TerminalState = z.infer<typeof terminalStateSchema>;

const STALE_THRESHOLD_MS = 10000; // 10 seconds

export async function getTerminalState(): Promise<TerminalState> {
  // Aggregated quantitative state from DB (fast read)
  const [market, exposure, positioning, levels, scenarios] = await Promise.all([
    storage.getMarketState(),
    storage.getDealerExposure(),
    storage.getOptionsPositioning(),
    storage.getKeyLevels(),
    storage.getTradingScenarios()
  ]);

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
  try {
    const { options: rawOptions, source } = await DeribitOptionsGateway.ingestOptions();
    const cachedTicker = MarketDataGateway.getCachedTicker();
    const summary = await DeribitOptionsGateway.getSummary(rawOptions, cachedTicker?.price, source);
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
          gammaFlip: market?.gammaFlip ?? null,
          gammaMagnets: levels?.gammaMagnets ?? [],
        };
        liveHeatmap = await OrderBookGateway.getLiquidityHeatmap(cachedTicker.price, gammaContext);
        const accZones = computeGammaAccelerationZones({
          spotPrice: cachedTicker.price,
          gammaFlip: market?.gammaFlip ?? null,
          gammaMagnets: levels?.gammaMagnets ?? [],
          liquidityHeatZones: liveHeatmap?.liquidityHeatZones ?? [],
          liquidityVacuum: liveHeatmap?.liquidityVacuum ?? null,
        });
        console.log("[GammaAccel] computed zones count=", accZones.length);
        console.log("[GammaAccel] first zones=", accZones.slice(0, 3));
        if (liveHeatmap) {
          liveHeatmap.gammaAccelerationZones = accZones;
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
        gammaFlip: market?.gammaFlip ?? null,
        accelZones: (liveHeatmap as any).gammaAccelerationZones ?? [],
      });
      if (result && typeof result === "object" && result.signal != null) {
        absorption = normalizeAbsorptionSignal(result.signal);
        console.log("[Absorption] engine_run=true fallback=false status=" + absorption.status + " side=" + absorption.side + " confidence=" + absorption.confidence);
      } else {
        absorption = buildInactiveAbsorptionSignal("Absorption engine returned no result");
        console.log("[Absorption] engine_run=true fallback=true reason=\"Absorption engine returned no result\"");
      }
    } catch (absErr) {
      absorption = buildInactiveAbsorptionSignal("Absorption engine error");
      console.warn("[TerminalState] Absorption engine failed:", absErr);
      console.log("[Absorption] engine_run=true fallback=true reason=\"Absorption engine error\"");
    }
  } else {
    const reason = !spotPrice ? "Missing spot price" : "Missing heatmap context";
    absorption = buildInactiveAbsorptionSignal(reason);
    console.log("[Absorption] engine_run=false fallback=true reason=\"" + reason + "\"");
  }
  console.log("[Absorption] final status=" + absorption.status + " side=" + absorption.side + " confidence=" + absorption.confidence);

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
  console.log("[TerminalState] optionsSnapshot exists=" + !!optionsSnapshot + " strikes=" + (optionsSnapshot?.strikes?.length ?? 0));
  const spot = ticker?.price ?? (optionsSnapshot as any)?.spot ?? 0;
  if (spot > 0 && optionsSnapshot?.strikes?.length) {
    optionsSnapshot = enrichOptionsWithOINotional(
      optionsSnapshot,
      spot,
      positioning?.callWall ?? null,
      positioning?.putWall ?? null,
      1
    );
    console.log("[TerminalState] after enrich options.strikes=" + (optionsSnapshot?.strikes?.length ?? 0));
  }

  console.log("[TerminalState OI+Gravity] spot=" + spot + " strikes=" + (optionsSnapshot?.strikes?.length ?? 0) +
    " primaryOiCluster=" + (optionsSnapshot as any)?.primaryOiCluster +
    " primaryOiClusterUsd=" + (optionsSnapshot as any)?.primaryOiClusterUsd +
    " callWallUsd=" + (optionsSnapshot as any)?.callWallUsd +
    " putWallUsd=" + (optionsSnapshot as any)?.putWallUsd);

  let gravityMap: ReturnType<typeof computeGravityMap> | null = null;
  try {
    if (spot > 0 && optionsSnapshot?.strikes?.length) {
      gravityMap = computeGravityMap({
        spotPrice: spot,
        gammaFlip: market?.gammaFlip ?? optionsSnapshot?.gammaFlip ?? null,
        transitionZoneStart: market?.transitionZoneStart ?? null,
        transitionZoneEnd: market?.transitionZoneEnd ?? null,
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
      console.log("[TerminalState OI+Gravity] gravityMap INACTIVE: " + reason);
    }
    console.log("[TerminalState OI+Gravity] gravityMap.status=" + gravityMap?.status + " primaryMagnet=" + (gravityMap?.primaryMagnet?.price ?? "null") + " summary=" + (gravityMap?.summary ?? ""));
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

  const heatmapSource = (liveHeatmap as any)?.heatmapSummary?.source;
  const feedState = computeFeedState({
    tickerSource: ticker?.source,
    heatmapSource: heatmapSource && heatmapSource !== "UNAVAILABLE" ? heatmapSource : undefined,
    optionsSourceRaw: optionsSource ?? undefined,
    isBinanceOrderbookHealthy: isBinanceHealthy(),
    optionsStrikeCount: (optionsSnapshot as any)?.strikes?.length ?? 0,
    hasHeatmapData: !!liveHeatmap?.liquidityHeatZones?.length,
  });
  const priceSource = feedState.priceSource === "binance" ? "binance" : feedState.priceSource === "coinbase" ? "coinbase" : (ticker?.source ?? "none");
  const orderbookSource = feedState.orderbookSource === "binance" ? "Binance" : feedState.orderbookSource === "coinbase" ? "Coinbase" : (heatmapSource ?? "none");
  const optionsSourceOut = feedState.optionsSource === "deribit" ? "deribit" : "none";
  if (process.env.NODE_ENV === "development") {
    console.log("[TerminalState feed] price=" + priceSource + " orderbook=" + orderbookSource + " options=" + optionsSourceOut + " obFallback=" + feedState.isOrderbookFallbackActive);
  }
  if (enrichedPositioning?.liquidityHeatmap) {
    const hm = enrichedPositioning.liquidityHeatmap as { liquidityHeatZones?: unknown[]; gammaAccelerationZones?: unknown[] };
    console.log("[TerminalState] /api/terminal/state heatmap: liquidityHeatZones count=" + (hm.liquidityHeatZones?.length ?? 0) + ", gammaAccelerationZones count=" + (hm.gammaAccelerationZones?.length ?? 0));
  }

  const hasAbsorption = enrichedPositioning && typeof (enrichedPositioning as any).absorption === "object";
  console.log("[TerminalState] response positioning.absorption exists=" + hasAbsorption + (hasAbsorption ? " status=" + (enrichedPositioning as any).absorption?.status : ""));

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
  console.log("[Timeline Debug] entries=" + timeline.length);

  const enrichedOptionsSnapshot = optionsSnapshot;
  const strikesArray = Array.isArray(enrichedOptionsSnapshot?.strikes) ? enrichedOptionsSnapshot.strikes : [];
  const finalOptions = {
    asOf: enrichedOptionsSnapshot?.asOf ?? null,
    spot: enrichedOptionsSnapshot?.spot ?? ticker?.price ?? null,
    totalGex: enrichedOptionsSnapshot?.totalGex ?? 0,
    gammaRegime: enrichedOptionsSnapshot?.gammaRegime ?? "NEUTRAL",
    gammaFlip: enrichedOptionsSnapshot?.gammaFlip ?? null,
    topMagnets: Array.isArray(enrichedOptionsSnapshot?.topMagnets) ? enrichedOptionsSnapshot.topMagnets : [],
    strikeCount: strikesArray.length,
    strikes: strikesArray,
    primaryOiCluster: (enrichedOptionsSnapshot as any)?.primaryOiCluster ?? null,
    primaryOiClusterUsd: (enrichedOptionsSnapshot as any)?.primaryOiClusterUsd ?? null,
    callWallUsd: (enrichedOptionsSnapshot as any)?.callWallUsd ?? null,
    putWallUsd: (enrichedOptionsSnapshot as any)?.putWallUsd ?? null,
    callWall: positioning?.callWall ?? null,
    putWall: positioning?.putWall ?? null,
  };
  console.log("[TerminalState final options keys]", Object.keys(finalOptions));
  console.log("[TerminalState final options sample]", {
    hasSpot: finalOptions.spot != null,
    hasStrikes: Array.isArray(finalOptions.strikes),
    strikesLength: finalOptions.strikes.length,
    primaryOiCluster: finalOptions.primaryOiCluster,
    callWallUsd: finalOptions.callWallUsd,
    putWallUsd: finalOptions.putWallUsd,
  });

  return {
    market,
    exposure,
    positioning: enrichedPositioning,
    levels,
    scenarios,
    ticker,
    tickerStatus,
    timestamp: now,
    optionsLastUpdated,
    options: finalOptions,
    gravityMap,
    timeline,
    timelineSummary,
    coherence,
    priceSource: feedState.priceSource,
    orderbookSource: feedState.orderbookSource === "binance" ? "Binance" : feedState.orderbookSource === "coinbase" ? "Coinbase" : "none",
    optionsSource: optionsSourceOut,
    isBinancePriceHealthy: feedState.isBinancePriceHealthy,
    isCoinbasePriceHealthy: feedState.isCoinbasePriceHealthy,
    isBinanceOrderbookHealthy: feedState.isBinanceOrderbookHealthy,
    isCoinbaseOrderbookHealthy: feedState.isCoinbaseOrderbookHealthy,
    isDeribitOptionsHealthy: feedState.isDeribitOptionsHealthy,
    isOrderbookFallbackActive: feedState.isOrderbookFallbackActive,
    isPriceFallbackActive: feedState.isPriceFallbackActive,
  };
}
