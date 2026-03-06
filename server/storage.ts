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

    // Fixed Vanna Sensitivity: Accumulate raw, normalize by OI, clamp range
    const vanna = calculateVanna(data, spotPrice);
    const charm = calculateCharm(data, spotPrice);
    
    const totalOI = data.reduce((acc, d) => acc + d.open_interest, 0);
    const totalGammaExp = data.reduce((acc, d) => acc + (d.gamma * d.open_interest), 0);
    const rawPressure = totalOI > 0 ? (totalGammaExp / totalOI) * spotPrice : 0;
    const normalizedPressure = Math.tanh(rawPressure / 1000000);
    
    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma * d.open_interest), 0);
    const concentration = totalAbsGamma > 0 ? Math.abs(totalGammaExp) / totalAbsGamma : 0;

    const de: DealerExposure = {
      id: 1,
      vannaExposure: vanna,
      vannaBias: vanna > 0.05 ? "BULLISH" : vanna < -0.05 ? "BEARISH" : "NEUTRAL",
      charmExposure: charm,
      charmBias: Math.abs(charm) < 0.01 ? "NEUTRAL" : (charm > 0 ? "BULLISH" : "BEARISH"),
      gammaPressure: (normalizedPressure >= 0 ? "+" : "") + normalizedPressure.toFixed(2),
      gammaConcentration: concentration,
      timestamp: new Date()
    };
    this.dealerExposure = de;

    this.tradingScenarios = generateDynamicScenarios(ms, op, kl, de);

    const formatVal = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

    console.log("=== DEALER FLOW AUDIT ===");
    console.log(`Vanna Exposure: ${formatVal(vanna)}`);
    console.log(`Vanna Bias: ${de.vannaBias}`);
    console.log(`Charm Exposure: ${formatVal(charm)}`);
    console.log(`Charm Bias: ${de.charmBias}`);
    console.log(`Gamma Pressure: ${de.gammaPressure}`);
    console.log(`Gamma Concentration: ${concentration > 0.6 ? "HIGH" : concentration > 0.3 ? "MEDIUM" : "LOW"} (${concentration.toFixed(2)})`);
    console.log(`Method Used: Enhanced Vanna Sensitivity (Spot/Time Weighted)`);
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
