import { z } from "zod";
import { storage } from "./storage";
import { MarketDataGateway, tickerSchema } from "./market-gateway";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { OrderBookGateway } from "./orderbook-gateway";
import { LiquidityVacuumEngine } from "./engine/liquidityVacuum";

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

  // ═══ ENGINE #20: Liquidity Sweep Detector ═══
  let liveSweepDetector: any = null;
  try {
    const spot = MarketDataGateway.getCachedTicker()?.price || 0;
    const heatZones: any[] = liveHeatmap?.liquidityHeatZones || [];
    const liqPressure = liveHeatmap?.liquidityPressure || "BALANCED";
    const mMode = liveMarketMode?.marketMode || "FRAGILE_TRANSITION";
    const mConf = liveMarketMode?.marketModeConfidence ?? 0;
    const dhfDir = liveDealerHedgingFlowMap?.hedgingFlowDirection || "NEUTRAL";
    const dhfStr = liveDealerHedgingFlowMap?.hedgingFlowStrength || "LOW";
    const dhfAccel = liveDealerHedgingFlowMap?.hedgingAccelerationRisk || "LOW";
    const lcRisk = liveLiquidityCascade?.cascadeRisk || "LOW";
    const lcDir = liveLiquidityCascade?.cascadeDirection || "NONE";
    const sqProb = liveSqueezeProbability?.squeezeProbability ?? 0;
    const sqDir = liveSqueezeProbability?.squeezeDirection || "NONE";
    const instBias = liveInstitutionalBias?.institutionalBias || "NEUTRAL_CHOP";
    const tDir = liveTradeDecision?.tradeDirection || "NEUTRAL";
    const dPivot = positioning?.dealerPivot || 0;
    const cw = positioning?.callWall || 0;
    const pw = positioning?.putWall || 0;
    const fmtK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p));

    const nearRange = spot * 0.015;
    const bidZonesNear = heatZones.filter(z => z.side === "BID" && spot - ((z.priceStart + z.priceEnd) / 2) <= nearRange && spot > (z.priceStart + z.priceEnd) / 2);
    const askZonesNear = heatZones.filter(z => z.side === "ASK" && ((z.priceStart + z.priceEnd) / 2) - spot <= nearRange && spot < (z.priceStart + z.priceEnd) / 2);
    const bidIntensity = bidZonesNear.reduce((s: number, z: any) => s + z.intensity, 0);
    const askIntensity = askZonesNear.reduce((s: number, z: any) => s + z.intensity, 0);
    const hasBidNear = bidZonesNear.length > 0;
    const hasAskNear = askZonesNear.length > 0;

    let riskScore = 0;
    if (hasBidNear || hasAskNear) riskScore += 1;
    if (bidIntensity > 0.5 || askIntensity > 0.5) riskScore += 1;
    if (lcRisk === "HIGH" || lcRisk === "EXTREME") riskScore += 2;
    else if (lcRisk === "MEDIUM") riskScore += 1;
    if (sqProb > 50) riskScore += 2;
    else if (sqProb > 25) riskScore += 1;
    if (dhfAccel === "HIGH") riskScore += 2;
    else if (dhfAccel === "MEDIUM") riskScore += 1;
    if (mMode === "VOL_EXPANSION" || mMode === "CASCADE_RISK" || mMode === "SQUEEZE_RISK") riskScore += 1;
    if (dhfStr === "EXTREME" || dhfStr === "HIGH") riskScore += 1;
    const isLongGamma = liveGammaCurve?.gammaRegimeBand === "DEEP_LONG_GAMMA" || liveGammaCurve?.gammaRegimeBand === "LONG_GAMMA_SUPPORT";
    if (isLongGamma && mMode === "GAMMA_PIN") riskScore = Math.max(0, riskScore - 2);

    const sweepRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" =
      riskScore >= 9 ? "EXTREME" : riskScore >= 6 ? "HIGH" : riskScore >= 3 ? "MEDIUM" : "LOW";

    let sweepDirection: "UP" | "DOWN" | "TWO_SIDED" | "NONE" = "NONE";
    if (sweepRisk === "LOW") {
      sweepDirection = "NONE";
    } else {
      let upScore = 0, downScore = 0;
      if (hasAskNear) upScore += 1;
      if (hasBidNear) downScore += 1;
      if (dhfDir === "BUYING") upScore += 1;
      if (dhfDir === "SELLING") downScore += 1;
      if (tDir === "LONG") upScore += 1;
      if (tDir === "SHORT") downScore += 1;
      if (sqDir === "UP") upScore += 1;
      if (sqDir === "DOWN") downScore += 1;
      if (lcDir === "UP" || lcDir === "UPSIDE") upScore += 1;
      if (lcDir === "DOWN" || lcDir === "DOWNSIDE") downScore += 1;
      if (instBias === "BULLISH_ACCUMULATION") upScore += 1;
      if (instBias === "BEARISH_DISTRIBUTION") downScore += 1;
      if (liqPressure === "ASK_HEAVY") upScore += 1;
      if (liqPressure === "BID_HEAVY") downScore += 1;

      if (upScore >= 3 && upScore > downScore + 1) sweepDirection = "UP";
      else if (downScore >= 3 && downScore > upScore + 1) sweepDirection = "DOWN";
      else if (upScore >= 2 && downScore >= 2) sweepDirection = "TWO_SIDED";
      else if (upScore > downScore) sweepDirection = "UP";
      else if (downScore > upScore) sweepDirection = "DOWN";
      else sweepDirection = "TWO_SIDED";
    }

    let sweepTrigger = "--";
    if (sweepDirection === "UP" && hasAskNear) {
      sweepTrigger = "Break above near ask liquidity";
    } else if (sweepDirection === "UP" && dPivot > 0 && spot < dPivot) {
      sweepTrigger = `Reclaim dealer pivot at ${fmtK(dPivot)} into upside sweep`;
    } else if (sweepDirection === "DOWN" && hasBidNear) {
      sweepTrigger = "Loss of bid support below spot";
    } else if (sweepDirection === "DOWN" && pw > 0) {
      sweepTrigger = `Loss of put wall support at ${fmtK(pw)}`;
    } else if (sweepDirection === "TWO_SIDED") {
      sweepTrigger = "Liquidity stacked both sides — directional break triggers sweep";
    } else if (sweepDirection !== "NONE") {
      sweepTrigger = sweepDirection === "UP" ? `Break above ${fmtK(cw || spot * 1.01)}` : `Break below ${fmtK(pw || spot * 0.99)}`;
    }

    let sweepTargetZone = "--";
    if (sweepDirection === "UP" && askZonesNear.length > 0) {
      const sorted = askZonesNear.sort((a: any, b: any) => b.intensity - a.intensity);
      const target = sorted[0];
      sweepTargetZone = `${fmtK(target.priceStart)} – ${fmtK(target.priceEnd)}`;
    } else if (sweepDirection === "DOWN" && bidZonesNear.length > 0) {
      const sorted = bidZonesNear.sort((a: any, b: any) => b.intensity - a.intensity);
      const target = sorted[0];
      sweepTargetZone = `${fmtK(target.priceStart)} – ${fmtK(target.priceEnd)}`;
    } else if (sweepDirection === "UP") {
      sweepTargetZone = `${fmtK(spot)} – ${fmtK(spot * 1.015)}`;
    } else if (sweepDirection === "DOWN") {
      sweepTargetZone = `${fmtK(spot * 0.985)} – ${fmtK(spot)}`;
    } else if (sweepDirection === "TWO_SIDED") {
      sweepTargetZone = `${fmtK(spot * 0.985)} – ${fmtK(spot * 1.015)}`;
    }

    const sweepSummary: string[] = [];
    if (hasAskNear) sweepSummary.push("Ask liquidity stacked above spot");
    if (hasBidNear) sweepSummary.push("Bid liquidity visible below spot");
    if (dhfDir === "BUYING" && dhfStr !== "LOW") sweepSummary.push("Hedging flow may support upside");
    else if (dhfDir === "SELLING" && dhfStr !== "LOW") sweepSummary.push("Hedging flow may pressure downside");
    if (sqProb > 40) sweepSummary.push(`Squeeze probability ${sqProb}% adds sweep momentum`);
    if (lcRisk === "HIGH" || lcRisk === "EXTREME") sweepSummary.push("Cascade risk amplifies sweep potential");
    if (isLongGamma && sweepRisk !== "HIGH" && sweepRisk !== "EXTREME") sweepSummary.push("Long gamma dampens sweep acceleration");
    if (sweepDirection === "UP" && askZonesNear.length > 0) {
      const topAsk = askZonesNear.sort((a: any, b: any) => b.intensity - a.intensity)[0];
      sweepSummary.push(`Sweep likely if price breaks ${fmtK((topAsk.priceStart + topAsk.priceEnd) / 2)}`);
    } else if (sweepDirection === "DOWN" && bidZonesNear.length > 0) {
      const topBid = bidZonesNear.sort((a: any, b: any) => b.intensity - a.intensity)[0];
      sweepSummary.push(`Sweep likely if price loses ${fmtK((topBid.priceStart + topBid.priceEnd) / 2)}`);
    }
    while (sweepSummary.length < 3) sweepSummary.push("Monitor for directional catalyst");
    if (sweepSummary.length > 5) sweepSummary.length = 5;

    liveSweepDetector = { sweepRisk, sweepDirection, sweepTrigger, sweepTargetZone, sweepSummary };
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
