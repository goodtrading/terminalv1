import { 
  marketState, dealerExposure, optionsPositioning, keyLevels, tradingScenarios, optionsData,
  type MarketState, type DealerExposure, type OptionsPositioning, type KeyLevels, type TradingScenario, type OptionData,
  type insertMarketStateSchema, type insertDealerExposureSchema, type insertOptionsPositioningSchema, type insertKeyLevelsSchema, type insertTradingScenariosSchema, type insertOptionsDataSchema
} from "@shared/schema";

export interface IStorage {
  getMarketState(): Promise<MarketState | undefined>;
  getDealerExposure(): Promise<DealerExposure | undefined>;
  getOptionsPositioning(): Promise<OptionsPositioning | undefined>;
  getKeyLevels(): Promise<KeyLevels | undefined>;
  getTradingScenarios(): Promise<TradingScenario[]>;
  getOptionsData(): Promise<OptionData[]>;
  
  updateMarketState(data: any): Promise<MarketState>;
  updateDealerExposure(data: any): Promise<DealerExposure>;
  updateOptionsPositioning(data: any): Promise<OptionsPositioning>;
  updateKeyLevels(data: any): Promise<KeyLevels>;
  updateTradingScenarios(data: any[]): Promise<TradingScenario[]>;
  saveOptionsData(data: any[]): Promise<OptionData[]>;
}

export class MemStorage implements IStorage {
  private marketState: MarketState | undefined;
  private dealerExposure: DealerExposure | undefined;
  private optionsPositioning: OptionsPositioning | undefined;
  private keyLevels: KeyLevels | undefined;
  private tradingScenarios: TradingScenario[] = [];
  private optionsData: OptionData[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    this.marketState = {
      id: 1,
      gammaRegime: "LONG GAMMA",
      totalGex: 2.05e9,
      gammaFlip: 69450,
      distanceToFlip: 2.04,
      transitionZoneStart: 69100,
      transitionZoneEnd: 69700,
      gammaAcceleration: "HIGH",
      timestamp: new Date()
    };

    this.dealerExposure = {
      id: 1,
      vannaExposure: 212e6,
      vannaBias: "BULLISH",
      charmExposure: -38.1e9,
      charmBias: "BULLISH",
      gammaPressure: "HIGH",
      gammaConcentration: 72,
      timestamp: new Date()
    };

    this.optionsPositioning = {
      id: 1,
      callWall: 72000,
      putWall: 68000,
      oiConcentration: 70000,
      dealerPivot: 70000,
      timestamp: new Date()
    };

    this.keyLevels = {
      id: 1,
      gammaMagnets: [70000, 72000, 73000],
      shortGammaPocketStart: 68400,
      shortGammaPocketEnd: 69100,
      deepRiskPocketStart: 62900,
      deepRiskPocketEnd: 63200,
      timestamp: new Date()
    };

    this.tradingScenarios = [
      {
        id: 1,
        type: "BASE",
        probability: 60,
        thesis: "Mean Reversion toward 72k magnet",
        levels: ["70k", "72k", "73k"],
        confirmation: ["absorption at 70k", "delta divergence"],
        invalidation: "acceptance below 69.1k",
        timestamp: new Date()
      },
      {
        id: 2,
        type: "ALT",
        probability: 25,
        thesis: "Liquidity sweep below 69k then recovery",
        levels: ["69k", "71k"],
        confirmation: ["v-reversal", "orderflow absorption"],
        invalidation: "acceptance below 68.5k",
        timestamp: new Date()
      },
      {
        id: 3,
        type: "VOL",
        probability: 15,
        thesis: "Breakdown into short gamma expansion",
        levels: ["68k", "65k"],
        confirmation: ["vanna squeeze", "increasing volatility"],
        invalidation: "recovery above 70k",
        timestamp: new Date()
      }
    ];
  }

  async getMarketState() { return this.marketState; }
  async getDealerExposure() { return this.dealerExposure; }
  async getOptionsPositioning() { return this.optionsPositioning; }
  async getKeyLevels() { return this.keyLevels; }
  async getTradingScenarios() { return this.tradingScenarios; }
  async getOptionsData() { return this.optionsData; }

  async updateMarketState(data: any) {
    this.marketState = { ...data, id: 1, timestamp: new Date() };
    return this.marketState;
  }
  async updateDealerExposure(data: any) {
    this.dealerExposure = { ...data, id: 1, timestamp: new Date() };
    return this.dealerExposure;
  }
  async updateOptionsPositioning(data: any) {
    this.optionsPositioning = { ...data, id: 1, timestamp: new Date() };
    return this.optionsPositioning;
  }
  async updateKeyLevels(data: any) {
    this.keyLevels = { ...data, id: 1, timestamp: new Date() };
    return this.keyLevels;
  }
  async updateTradingScenarios(data: any[]) {
    this.tradingScenarios = data.map((d, i) => ({ ...d, id: i + 1, timestamp: new Date() }));
    return this.tradingScenarios;
  }
  async saveOptionsData(data: any[]) {
    this.optionsData = data.map((d, i) => ({ ...d, id: i + 1, timestamp: new Date() }));
    return this.optionsData;
  }
}

export const storage = new MemStorage();
