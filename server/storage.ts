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
    data.forEach(d => {
      const distancePct = Math.abs(d.strike - spotPrice) / spotPrice;
      const spotWeight = Math.max(0.15, 1 - distancePct * 10);
      rawGammaPressure += d.gamma * d.open_interest * spotWeight;
    });

    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const gammaPressureValue = totalAbsGamma > 0 ? (rawGammaPressure / totalAbsGamma) : 0;
    const normalizedPressure = Math.tanh(gammaPressureValue / 10000); // Adjusted divisor to prevent saturation
    
    const totalOI = data.reduce((acc, d) => acc + d.open_interest, 0);
    const totalGammaExp = data.reduce((acc, d) => acc + (d.gamma * d.open_interest), 0);
    const concentration = totalAbsGamma > 0 ? Math.abs(totalGammaExp) / totalAbsGamma : 0;

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

    // DEALER HEDGING FLOW CALCULATION
    const hedgeFlowBias = (ms.gammaRegime === "LONG GAMMA") 
      ? (de.vannaBias === "BULLISH" || de.charmBias === "BULLISH" ? "BUYING" : "NEUTRAL")
      : (de.vannaBias === "BEARISH" || de.charmBias === "BEARISH" ? "SELLING" : "NEUTRAL");

    const flowIntensityScore = Math.abs(de.vannaExposure) + Math.abs(de.charmExposure);
    const hedgeFlowIntensity = flowIntensityScore > 1.0 ? "HIGH" : flowIntensityScore > 0.4 ? "MEDIUM" : "LOW";

    const accelerationRisk = (ms.gammaRegime === "SHORT GAMMA" && (de.vannaBias === "BEARISH" || de.charmBias === "BEARISH")) ? "HIGH" : "LOW";

    const flowTriggerUp = [op.dealerPivot, ms.gammaFlip, op.callWall]
      .filter(l => l > spotPrice)
      .sort((a, b) => a - b)[0] || op.callWall;

    const flowTriggerDown = [op.dealerPivot, ms.gammaFlip, op.putWall]
      .filter(l => l < spotPrice)
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
