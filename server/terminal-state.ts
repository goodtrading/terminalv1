import { z } from "zod";
import { storage } from "./storage";
import { MarketDataGateway, tickerSchema } from "./market-gateway";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { OrderBookGateway } from "./orderbook-gateway";
import { runLiquiditySweepEngine } from "./lib/liquiditySweepEngine";

export const terminalStateSchema = z.object({
  market: z.any(),
  exposure: z.any(),
  positioning: z.any(),
  levels: z.any(),
  scenarios: z.array(z.any()),
  ticker: tickerSchema.nullable(),
  tickerStatus: z.enum(["fresh", "stale", "unavailable"]),
  timestamp: z.number()
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
        liveHeatmap = await OrderBookGateway.getLiquidityHeatmap(cachedTicker.price);
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

  const enrichedPositioning = positioning ? { ...positioning, tradingPlaybook: livePlaybook, volatilityExpansionDetector: liveVolExpansion, gammaCurveEngine: liveGammaCurve, institutionalBiasEngine: liveInstitutionalBias, tradeDecisionEngine: liveTradeDecision, liquidityCascadeEngine: liveLiquidityCascade, squeezeProbabilityEngine: liveSqueezeProbability, marketModeEngine: liveMarketMode, dealerHedgingFlowMap: liveDealerHedgingFlowMap, liquiditySweepDetector: liveSweepDetector, liquidityHeatmap: liveHeatmap, dominantExpiry: liveDominantExpiry, optionsSource } : positioning;

  // Read from in-memory cache ONLY (deterministic latency, no side effects)
  const ticker = MarketDataGateway.getCachedTicker();
  const now = Date.now();
  
  let tickerStatus: "fresh" | "stale" | "unavailable" = "unavailable";
  if (ticker) {
    const age = now - ticker.timestamp;
    tickerStatus = age < STALE_THRESHOLD_MS ? "fresh" : "stale";
  }

  return {
    market,
    exposure,
    positioning: enrichedPositioning,
    levels,
    scenarios,
    ticker,
    tickerStatus,
    timestamp: now
  };
}
