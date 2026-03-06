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
    const csvPath = path.resolve(process.cwd(), "attached_assets", "deribit_options.csv");
    this.recomputeAll(csvPath).catch(err => {
      console.error("Critical: Analytics engine failed to initialize:", err.message);
    });
  }

  async recomputeAll(csvPath: string) {
    const data = parseOptionsCSV(csvPath);
    const spotPrice = 70245; 
    
    const totalGex = calculateGEX(data, spotPrice);
    const flip = findGammaFlip(data);
    const vanna = calculateVanna(data, spotPrice);
    const charm = calculateCharm(data);
    const walls = detectWalls(data);
    const levels = calculateKeyLevels(data, spotPrice);
    const accel = calculateAcceleration(data, spotPrice);

    const newMarketState: MarketState = {
      id: 1,
      gammaRegime: totalGex > 0 ? "LONG GAMMA" : "SHORT GAMMA",
      totalGex,
      gammaFlip: flip,
      distanceToFlip: Math.abs(((flip - spotPrice) / spotPrice) * 100),
      transitionZoneStart: flip * 0.995,
      transitionZoneEnd: flip * 1.005,
      gammaAcceleration: accel,
      timestamp: new Date()
    };
    this.marketState = newMarketState;

    // Gamma Concentration: % of total absolute gamma within 5% of spot
    const nearSpotGamma = data.filter(d => Math.abs(d.strike - spotPrice) / spotPrice < 0.05)
      .reduce((acc, d) => acc + Math.abs(d.gamma), 0);
    const totalAbsGamma = data.reduce((acc, d) => acc + Math.abs(d.gamma), 0);
    const concentration = totalAbsGamma > 0 ? (nearSpotGamma / totalAbsGamma) * 100 : 0;

    const newDealerExposure: DealerExposure = {
      id: 1,
      vannaExposure: vanna,
      vannaBias: vanna > 0 ? "BULLISH" : "BEARISH",
      charmExposure: charm,
      charmBias: charm > 0 ? "BULLISH" : "BEARISH",
      gammaPressure: Math.abs(totalGex) > 2e9 ? "EXTREME" : Math.abs(totalGex) > 1e9 ? "HIGH" : "NORMAL",
      gammaConcentration: Math.round(concentration),
      timestamp: new Date()
    };
    this.dealerExposure = newDealerExposure;

    const newOptionsPositioning: OptionsPositioning = {
      id: 1,
      callWall: walls.callWall,
      putWall: walls.putWall,
      oiConcentration: walls.oiConcentration,
      dealerPivot: Math.round(walls.dealerPivot),
      timestamp: new Date()
    };
    this.optionsPositioning = newOptionsPositioning;

    const newKeyLevels: KeyLevels = {
      id: 1,
      gammaMagnets: levels.gammaMagnets,
      shortGammaPocketStart: levels.shortGammaPocketStart,
      shortGammaPocketEnd: levels.shortGammaPocketEnd,
      deepRiskPocketStart: levels.deepRiskPocketStart,
      deepRiskPocketEnd: levels.deepRiskPocketEnd,
      timestamp: new Date()
    };
    this.keyLevels = newKeyLevels;

    this.tradingScenarios = generateDynamicScenarios(
      newMarketState,
      newOptionsPositioning,
      newKeyLevels,
      newDealerExposure
    );
  }

  async getMarketState() { return this.marketState; }
  async getDealerExposure() { return this.dealerExposure; }
  async getOptionsPositioning() { return this.optionsPositioning; }
  async getKeyLevels() { return this.keyLevels; }
  async getTradingScenarios() { return this.tradingScenarios; }
  async getOptionsData() { return this.optionsData; }
}

export const storage = new MemStorage();
