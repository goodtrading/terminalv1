import { 
  marketState, dealerExposure, optionsPositioning, keyLevels, tradingScenarios, optionsData, dealerHedgingFlow,
  type MarketState, type DealerExposure, type OptionsPositioning, type KeyLevels, type TradingScenario, type OptionData, type DealerHedgingFlow
} from "@shared/schema";
import { parseOptionsCSV, calculateGEX, findGammaFlip, calculateVanna, calculateCharm, detectWalls, calculateKeyLevels, calculateAcceleration } from "./analytics";
import { generateDynamicScenarios } from "./scenarios";
import path from "path";

export interface IStorage {
  getMarketState(): Promise<MarketState | undefined>;
  getDealerExposure(): Promise<DealerExposure | undefined>;
  getOptionsPositioning(): Promise<OptionsPositioning | undefined>;
  getKeyLevels(): Promise<KeyLevels | undefined>;
  getTradingScenarios(): Promise<TradingScenario[]>;
  getOptionsData(): Promise<OptionData[]>;
  getDealerHedgingFlow(): Promise<DealerHedgingFlow | undefined>;
  recomputeAll(csvPath: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private marketState: MarketState | undefined;
  private dealerExposure: DealerExposure | undefined;
  private optionsPositioning: OptionsPositioning | undefined;
  private keyLevels: KeyLevels | undefined;
  private tradingScenarios: TradingScenario[] = [];
  private optionsData: OptionData[] = [];
  private dealerHedgingFlow: DealerHedgingFlow | undefined;

  constructor() {
    const csvPath = path.resolve(process.cwd(), "data", "deribit_options.csv");
    this.recomputeAll(csvPath).catch(err => console.error("Critical: Analytics initialization failed:", err.message));
  }

  async recomputeAll(csvPath: string) {
    const data = parseOptionsCSV(csvPath);
    const spotPrice = 68250; 
    
    const totalGex = calculateGEX(data, spotPrice);
    const flip = findGammaFlip(data);
    const walls = detectWalls(data);
    const levels = calculateKeyLevels(data, spotPrice);
    const accel = calculateAcceleration(data, spotPrice);

    const ms: MarketState = {
      id: 1,
      gammaRegime: totalGex >= 0 ? "LONG GAMMA" : "SHORT GAMMA",
      totalGex,
      gammaFlip: flip,
      distanceToFlip: Math.abs(((flip - spotPrice) / spotPrice) * 100),
      transitionZoneStart: flip * 0.995,
      transitionZoneEnd: flip * 1.005,
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
    const vanna = calculateVanna(data, spotPrice);
    const charm = calculateCharm(data, spotPrice);
    
    let rawGammaPressure = 0;
    let totalSpotWeight = 0;
    let contributingStrikes = 0;

    data.forEach(d => {
      const distancePct = Math.abs(d.strike - spotPrice) / spotPrice;
      const spotWeight = Math.max(0.15, 1 - distancePct * 10);
      rawGammaPressure += d.gamma * d.open_interest * spotWeight;
      totalSpotWeight += spotWeight;
      contributingStrikes++;
    });

    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const gammaPressureValue = totalAbsGamma > 0 ? (rawGammaPressure / totalAbsGamma) : 0;
    const normalizedPressure = Math.tanh(gammaPressureValue * 1.5); // Adjusted multiplier for better sensitivity without saturation
    
    // Removed temporary debug logging
    // Gamma Concentration (Proximity-Weighted)
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
      vannaExposure: vanna,
      vannaBias: vanna > 0.05 ? "BULLISH" : vanna < -0.05 ? "BEARISH" : "NEUTRAL",
      charmExposure: charm,
      charmBias: charm > 0.05 ? "BULLISH" : charm < -0.05 ? "BEARISH" : "NEUTRAL",
      gammaPressure: (normalizedPressure >= 0 ? "+" : "") + normalizedPressure.toFixed(2),
      gammaConcentration: concentration,
      timestamp: new Date()
    };
    this.dealerExposure = de;

    // DEALER HEDGING FLOW V2 (Institutional Model)
    let flowScore = 0;
    
    // 1. Gamma Regime Base
    const isLongGamma = ms.gammaRegime === "LONG GAMMA";
    flowScore += isLongGamma ? 1 : -1;

    // 2. Vanna/Charm Interaction (Scoring)
    // Thresholds: Strong > 0.5, Mild > 0.1
    const vannaAbs = Math.abs(de.vannaExposure);
    const charmAbs = Math.abs(de.charmExposure);
    
    if (de.vannaBias === "BULLISH") flowScore += vannaAbs > 0.5 ? 2 : 1;
    if (de.vannaBias === "BEARISH") flowScore -= vannaAbs > 0.5 ? 2 : 1;
    
    if (de.charmBias === "BULLISH") flowScore += charmAbs > 0.5 ? 2 : 1;
    if (de.charmBias === "BEARISH") flowScore -= charmAbs > 0.5 ? 2 : 1;

    // 3. Dealer Pivot Logic
    const isAbovePivot = spotPrice > op.dealerPivot;
    flowScore += isAbovePivot ? 1 : -1;

    // 4. Transition Zone Logic
    const isInsideTransition = spotPrice >= ms.transitionZoneStart && spotPrice <= ms.transitionZoneEnd;
    if (isInsideTransition) {
      flowScore *= 0.5;
    }

    // Map Score to Bias
    const hedgeFlowBias = flowScore >= 2 ? "BUYING" : flowScore <= -2 ? "SELLING" : "NEUTRAL";

    // 5. Intensity Logic
    const totalExposure = vannaAbs + charmAbs;
    const distToFlip = Math.abs(spotPrice - ms.gammaFlip) / spotPrice;
    const distToPivot = Math.abs(spotPrice - op.dealerPivot) / spotPrice;
    
    let intensityScore = 0;
    if (totalExposure > 1.0) intensityScore += 2;
    else if (totalExposure > 0.4) intensityScore += 1;
    
    if (distToFlip < 0.01) intensityScore += 1; // Near flip
    if (distToPivot < 0.005) intensityScore += 1; // Near pivot
    
    const hedgeFlowIntensity = intensityScore >= 3 ? "HIGH" : intensityScore >= 1 ? "MEDIUM" : "LOW";

    // 6. Acceleration Risk Refinement
    const strongAlignment = (de.vannaBias === de.charmBias) && (vannaAbs + charmAbs > 0.8);
    const accelerationRisk = (!isLongGamma || (spotPrice < ms.gammaFlip * 1.01 && !isLongGamma) || strongAlignment) ? "HIGH" : "LOW";

    // 7. Trigger Selection Refinement
    const flowTriggerUp = [op.dealerPivot, ms.gammaFlip, ms.transitionZoneEnd, op.callWall]
      .filter(l => l > spotPrice + 10) // Small buffer
      .sort((a, b) => a - b)[0] || op.callWall;

    const flowTriggerDown = [op.dealerPivot, ms.gammaFlip, ms.transitionZoneStart, op.putWall]
      .filter(l => l < spotPrice - 10) // Small buffer
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

    this.tradingScenarios = generateDynamicScenarios(ms, op, kl, de);

    const formatVal = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

    console.log("=== DEALER FLOW AUDIT ===");
    console.log(`Vanna Exposure: ${formatVal(vanna)}`);
    console.log(`Vanna Bias: ${de.vannaBias}`);
    console.log(`Charm Exposure: ${formatVal(charm)}`);
    console.log(`Charm Bias: ${de.charmBias}`);
    console.log(`Gamma Pressure: ${de.gammaPressure}`);
    console.log(`Gamma Concentration: ${concentration > 0.6 ? "HIGH" : concentration > 0.3 ? "MEDIUM" : "LOW"} (${concentration.toFixed(2)})`);
    console.log(`Method Used: Enhanced Flow Sensitivity (Spot/Time Weighted)`);
    console.log("=========================");
  }

  async getMarketState() { return this.marketState; }
  async getDealerExposure() { return this.dealerExposure; }
  async getOptionsPositioning() { return this.optionsPositioning; }
  async getKeyLevels() { return this.keyLevels; }
  async getTradingScenarios() { return this.tradingScenarios; }
  async getOptionsData() { return this.optionsData; }
  async getDealerHedgingFlow() { return this.dealerHedgingFlow; }
}

export const storage = new MemStorage();
