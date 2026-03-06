import { 
  marketState, dealerExposure, optionsPositioning, keyLevels, tradingScenarios, optionsData,
  type MarketState, type DealerExposure, type OptionsPositioning, type KeyLevels, type TradingScenario, type OptionData
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
  recomputeAll(csvPath: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private marketState: MarketState | undefined;
  private dealerExposure: DealerExposure | undefined;
  private optionsPositioning: OptionsPositioning | undefined;
  private keyLevels: KeyLevels | undefined;
  private tradingScenarios: TradingScenario[] = [];
  private optionsData: OptionData[] = [];

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

    // Advanced Dealer Flow Methodology
    const vanna = calculateVanna(data, spotPrice);
    const charm = calculateCharm(data);
    
    // Gamma Concentration: % of total absolute gamma within ±5% of spot
    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const nearSpotGamma = data.filter(d => Math.abs(d.strike - spotPrice) / spotPrice <= 0.05)
      .reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const concentration = totalAbsGamma > 0 ? (nearSpotGamma / totalAbsGamma) * 100 : 0;

    // Gamma Pressure: abs(totalGex) / totalOpenInterest
    const totalOI = data.reduce((acc, d) => acc + d.open_interest, 0);
    const pressureValue = totalOI > 0 ? Math.abs(totalGex) / totalOI : 0;
    
    let pressureLabel: "LOW" | "MODERATE" | "HIGH" | "EXTREME" = "LOW";
    if (pressureValue > 500000) pressureLabel = "EXTREME";
    else if (pressureValue > 200000) pressureLabel = "HIGH";
    else if (pressureValue > 50000) pressureLabel = "MODERATE";

    const de: DealerExposure = {
      id: 1,
      vannaExposure: vanna,
      vannaBias: vanna > 0 ? "BULLISH" : vanna < 0 ? "BEARISH" : "NEUTRAL",
      charmExposure: charm,
      charmBias: charm > 0 ? "BULLISH" : charm < 0 ? "BEARISH" : "NEUTRAL",
      gammaPressure: pressureLabel,
      gammaConcentration: Math.round(concentration),
      timestamp: new Date()
    };
    this.dealerExposure = de;

    this.tradingScenarios = generateDynamicScenarios(ms, op, kl, de);

    console.log("=== DEALER FLOW AUDIT ===");
    console.log(`Vanna Exposure: ${vanna.toFixed(2)} (Method: Gamma * Distance * IV)`);
    console.log(`Vanna Bias: ${de.vannaBias}`);
    console.log(`Charm Exposure: ${(charm / 1e6).toFixed(2)}M (Method: Gamma-weighted decay)`);
    console.log(`Charm Bias: ${de.charmBias}`);
    console.log(`Gamma Pressure: ${pressureLabel} (Ratio: ${pressureValue.toFixed(0)})`);
    console.log(`Gamma Concentration: ${concentration.toFixed(2)}% (Range: ±5%)`);
    console.log("=========================");
  }

  async getMarketState() { return this.marketState; }
  async getDealerExposure() { return this.dealerExposure; }
  async getOptionsPositioning() { return this.optionsPositioning; }
  async getKeyLevels() { return this.keyLevels; }
  async getTradingScenarios() { return this.tradingScenarios; }
  async getOptionsData() { return this.optionsData; }
}

export const storage = new MemStorage();
