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

    // Advanced Dealer Flow Recalibration
    const vanna = calculateVanna(data, spotPrice);
    const charm = calculateCharm(data, spotPrice);
    
    // Gamma Concentration: % of total absolute gamma within ±5% of spot
    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const nearSpotGamma = data.filter(d => Math.abs(d.strike - spotPrice) / spotPrice <= 0.05)
      .reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const concentration = totalAbsGamma > 0 ? (nearSpotGamma / totalAbsGamma) * 100 : 0;

    // Gamma Pressure: Abs Total GEX / Total OI normalized by Local Concentration
    const totalOI = data.reduce((acc, d) => acc + d.open_interest, 0);
    const rawRatio = totalOI > 0 ? Math.abs(totalGex) / totalOI : 0;
    const normalizedPressure = rawRatio * (concentration / 100);
    
    let pressureLabel: "LOW" | "MODERATE" | "HIGH" | "EXTREME" = "LOW";
    if (normalizedPressure > 400000) pressureLabel = "EXTREME";
    else if (normalizedPressure > 150000) pressureLabel = "HIGH";
    else if (normalizedPressure > 50000) pressureLabel = "MODERATE";

    const vannaBias = Math.abs(vanna) < 100 ? "NEUTRAL" : (vanna > 0 ? "BULLISH" : "BEARISH");
    const charmBias = Math.abs(charm) < 100 ? "NEUTRAL" : (charm > 0 ? "BULLISH" : "BEARISH");

    const de: DealerExposure = {
      id: 1,
      vannaExposure: vanna,
      vannaBias: vannaBias,
      charmExposure: charm,
      charmBias: charmBias,
      gammaPressure: pressureLabel,
      gammaConcentration: Math.round(concentration),
      timestamp: new Date()
    };
    this.dealerExposure = de;

    this.tradingScenarios = generateDynamicScenarios(ms, op, kl, de);

    const formatVanna = (v: number) => {
      if (Math.abs(v) < 100) return "NEAR ZERO";
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
      return v.toFixed(2);
    };

    const formatCharm = (v: number) => {
      if (Math.abs(v) < 100) return "NEAR ZERO";
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
      return v.toFixed(2);
    };

    console.log("=== DEALER FLOW AUDIT ===");
    console.log(`Vanna Exposure: ${formatVanna(vanna)}`);
    console.log(`Vanna Bias: ${de.vannaBias}`);
    console.log(`Charm Exposure: ${formatCharm(charm)}`);
    console.log(`Charm Bias: ${de.charmBias}`);
    console.log(`Gamma Pressure: ${pressureLabel} (Metric: ${normalizedPressure.toFixed(0)})`);
    console.log(`Gamma Concentration: ${concentration.toFixed(2)}% (±5% Spot)`);
    console.log(`Method Used: Institutional Approximation (Spot-Strike-IV-DTE)`);
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
