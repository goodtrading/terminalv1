import { z } from "zod";
import fs from "fs";
import path from "path";

// Simple CSV parser to avoid external dependency issues
function parseCsv(content: string): any[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => 
    h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );
  
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.trim();
    });
    results.push(row);
  }
  return results;
}

export const normalizedOptionSchema = z.object({
  strike: z.number(),
  expiry: z.string(),
  optionType: z.enum(["call", "put"]),
  openInterest: z.number(),
  gammaExposure: z.number().optional(),
  vannaExposure: z.number().optional(),
  charmExposure: z.number().optional()
});

export const optionsSummarySchema = z.object({
  totalGex: z.number().nullable(),
  gammaState: z.enum(["LONG GAMMA", "SHORT GAMMA"]).nullable(),
  gammaFlip: z.number().nullable(),
  callWall: z.number().nullable(),
  putWall: z.number().nullable(),
  gammaByStrike: z.array(z.object({ strike: z.number(), gex: z.number() })).optional(),
  oiByStrike: z.array(z.object({ strike: z.number(), oi: z.number() })).optional(),
  gammaCurve: z.array(z.object({ strike: z.number(), cumulativeGamma: z.number() })).optional(),
  gammaMagnets: z.array(z.number()).optional(),
  shortGammaZones: z.array(z.object({ startStrike: z.number(), endStrike: z.number() })).optional(),
  magnets: z.array(z.number()).nullable(),
  shortGammaPockets: z.array(z.object({ start: z.number(), end: z.number() })).nullable(),
  vannaBias: z.enum(["BULLISH", "BEARISH"]).nullable(),
  charmBias: z.enum(["BULLISH", "BEARISH"]).nullable(),
  dealerGammaState: z.enum(["LONG_GAMMA", "SHORT_GAMMA"]).nullable(),
  dealerHedgeDirection: z.string().nullable(),
  volatilityRegime: z.enum(["HIGH_VOL", "LOW_VOL", "TRANSITION"]).nullable(),
  dealerFlowScore: z.number().nullable(),
  gammaSlopeByStrike: z.array(z.object({ strike: z.number(), slope: z.number() })).optional(),
  gammaAccelerationByStrike: z.array(z.object({ strike: z.number(), acceleration: z.number() })).optional(),
  gammaCliffs: z.array(z.object({ strike: z.number(), strength: z.number() })).optional(),
  gammaWallStrength: z.array(z.object({ strike: z.number(), strengthScore: z.number() })).optional(),
  hedgingSpeedScore: z.number().optional(),
  hedgingStressScore: z.number().optional(),
  cascadeRisk: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  pinningStrength: z.number().optional(),
  dealerFlowUrgency: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  marketRegime: z.object({
    dealerRegime: z.enum(["LONG_GAMMA", "SHORT_GAMMA", "TRANSITION"]),
    liquidityPressure: z.enum(["PINNING", "NEUTRAL", "EXPANSION", "CASCADE_RISK"]),
    volatilityState: z.enum(["COMPRESSING", "NORMAL", "EXPANDING"]),
    tradeBias: z.enum(["LONG", "SHORT", "MEAN_REVERSION", "NEUTRAL"]),
    regimeConfidence: z.number()
  }).optional(),
  dealerTrapEngine: z.object({
    trapZones: z.array(z.object({
      startPrice: z.number(),
      endPrice: z.number(),
      trapType: z.enum(["BREAKOUT_TRAP", "BREAKDOWN_TRAP", "FALSE_EXPANSION", "MAGNET_FADE", "TRANSITION_FAKEOUT"]),
      misleadingDirection: z.enum(["UP", "DOWN"]),
      expectedDealerReaction: z.enum(["BUY_DIPS", "SELL_RALLIES", "BUY_BREAKOUT", "SELL_WEAKNESS"]),
      expectedOutcome: z.enum(["FAILED_BREAKOUT", "FAILED_BREAKDOWN", "MEAN_REVERSION", "VOLATILITY_FADE"]),
      confidence: z.number()
    })),
    currentTrapRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    activeTrapContext: z.object({
      trapType: z.enum(["BREAKOUT_TRAP", "BREAKDOWN_TRAP", "FALSE_EXPANSION", "MAGNET_FADE", "TRANSITION_FAKEOUT"]),
      misleadingDirection: z.enum(["UP", "DOWN"]),
      expectedOutcome: z.enum(["FAILED_BREAKOUT", "FAILED_BREAKDOWN", "MEAN_REVERSION", "VOLATILITY_FADE"]),
      confidence: z.number()
    }).nullable()
  }).optional(),
  tradingPlaybook: z.object({
    currentPlaybook: z.object({
      regime: z.string(),
      expectedBehavior: z.string(),
      volatilityRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
      directionalBias: z.enum(["LONG", "SHORT", "NEUTRAL"]),
      strategyType: z.enum(["FADE_EXTREMES", "MOMENTUM_BREAKOUT", "RANGE_SCALPING", "LIQUIDITY_SWEEP_REVERSAL", "VOLATILITY_EXPANSION"])
    }),
    tradeZones: z.object({
      longZones: z.array(z.object({ start: z.number(), end: z.number() })),
      shortZones: z.array(z.object({ start: z.number(), end: z.number() }))
    }),
    invalidationLevel: z.number(),
    regimeShiftTrigger: z.string()
  }).optional(),
  liquidationConfluence: z.object({
    zones: z.array(z.object({
      startPrice: z.number(),
      endPrice: z.number(),
      gammaLevel: z.number(),
      liquidationCluster: z.number(),
      confluenceScore: z.number()
    })),
    squeezeProbability: z.number(),
    liquidationSweepRisk: z.enum(["LOW", "MEDIUM", "HIGH"])
  }).optional(),
  backtestResults: z.object({
    pinningAccuracy: z.number(),
    expansionAccuracy: z.number(),
    cascadeAccuracy: z.number(),
    meanMoveAfterExpansion: z.number(),
    meanMoveAfterPinning: z.number()
  }).optional(),
  reactionZones: z.array(z.object({
    startStrike: z.number(),
    endStrike: z.number(),
    zoneType: z.enum(["PINNING", "TRANSITION", "EXPANSION", "SQUEEZE_RISK"]),
    dealerReaction: z.enum(["BUY_DIPS", "SELL_RALLIES", "BUY_BREAKOUT", "SELL_WEAKNESS"]),
    expectedBehavior: z.enum(["MEAN_REVERSION", "VOLATILITY_EXPANSION", "ACCELERATION_UP", "ACCELERATION_DOWN"]),
    volatilityRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    tradeBias: z.enum(["LONG", "SHORT", "NEUTRAL"])
  })).optional(),
  gammaCurveEngine: z.object({
    gammaSlope: z.number(),
    gammaCliffs: z.array(z.object({ strike: z.number(), strength: z.number() })),
    dealerSensitivity: z.enum(["LOW", "MEDIUM", "HIGH"]),
    gammaRegimeBand: z.enum(["DEEP_LONG_GAMMA", "LONG_GAMMA_SUPPORT", "TRANSITION", "SHORT_GAMMA_RISK", "DEEP_SHORT_GAMMA"])
  }).optional(),
  volatilityExpansionDetector: z.object({
    volExpansionState: z.enum(["COMPRESSING", "PRE_BREAKOUT", "EXPANDING"]),
    expansionDirection: z.enum(["UP", "DOWN", "NEUTRAL"]),
    expansionProbability: z.number(),
    playbookShiftSuggested: z.boolean(),
    suggestedPlaybook: z.enum(["RANGE_SCALPING", "FADE_EXTREMES", "MOMENTUM_BREAKOUT", "VOLATILITY_EXPANSION", "LIQUIDITY_SWEEP_REVERSAL"]),
    expansionTriggerZone: z.object({ start: z.number(), end: z.number() }).nullable()
  }).optional(),
  institutionalBiasEngine: z.object({
    institutionalBias: z.enum(["BULLISH_COMPRESSION", "BEARISH_COMPRESSION", "BULLISH_EXPANSION", "BEARISH_EXPANSION", "FRAGILE_TRANSITION", "SQUEEZE_SETUP", "NEUTRAL_CHOP"]),
    biasConfidence: z.number(),
    biasDrivers: z.array(z.string()),
    biasInvalidation: z.string(),
    biasHorizon: z.enum(["INTRADAY", "SWING", "EVENT_DRIVEN"])
  }).optional(),
  tradeDecisionEngine: z.object({
    tradeState: z.enum(["EXECUTE", "PREPARE", "WAIT", "AVOID"]),
    tradeDirection: z.enum(["LONG", "SHORT", "NEUTRAL"]),
    entryCondition: z.string(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
    positionSizeSuggestion: z.enum(["FULL", "REDUCED", "PROBE_ONLY", "NO_TRADE"]),
    executionReason: z.array(z.string())
  }).optional(),
  liquidityCascadeEngine: z.object({
    cascadeRisk: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME"]),
    cascadeDirection: z.enum(["UP", "DOWN", "TWO_SIDED", "NONE"]),
    cascadeTrigger: z.string(),
    liquidationPocket: z.string(),
    cascadeDrivers: z.array(z.string())
  }).optional(),
  squeezeProbabilityEngine: z.object({
    squeezeProbability: z.number(),
    squeezeDirection: z.enum(["UP", "DOWN", "NONE"]),
    squeezeType: z.enum(["SHORT_SQUEEZE", "LONG_SQUEEZE", "GAMMA_SQUEEZE", "NONE"]),
    squeezeTrigger: z.string(),
    squeezeTarget: z.string(),
    squeezeDrivers: z.array(z.string())
  }).optional(),
  marketModeEngine: z.object({
    marketMode: z.enum(["GAMMA_PIN", "MEAN_REVERSION", "VOL_EXPANSION", "SQUEEZE_RISK", "CASCADE_RISK", "FRAGILE_TRANSITION"]),
    marketModeConfidence: z.number(),
    marketModeReason: z.array(z.string())
  }).optional(),
  dealerHedgingFlowMap: z.object({
    hedgingFlowDirection: z.enum(["BUYING", "SELLING", "NEUTRAL"]),
    hedgingFlowStrength: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME"]),
    hedgingAccelerationRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    hedgingTriggerZone: z.string(),
    hedgingFlowSummary: z.array(z.string())
  }).optional(),
  liquiditySweepDetector: z.object({
    sweepRisk: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME"]),
    sweepDirection: z.enum(["UP", "DOWN", "TWO_SIDED", "NONE"]),
    sweepTrigger: z.string(),
    sweepTargetZone: z.string(),
    sweepSummary: z.array(z.string())
  }).optional(),
  dominantExpiry: z.string().nullable().optional(),
  source: z.enum(["LIVE_DERIBIT", "CSV_FALLBACK"]).optional()
});

export type NormalizedOption = z.infer<typeof normalizedOptionSchema>;
export type OptionsSummary = z.infer<typeof optionsSummarySchema>;

export type IngestionResult = {
  options: NormalizedOption[];
  source: "LIVE_DERIBIT" | "CSV_FALLBACK";
};

export class DeribitOptionsGateway {
  private static DATA_DIR = path.join(process.cwd(), "attached_assets");
  private static observations: any[] = [];
  private static DERIBIT_API = "https://www.deribit.com/api/v2/public";
  private static liveCache: { data: NormalizedOption[]; timestamp: number } | null = null;
  private static CACHE_TTL_MS = 30000;

  private static recordObservation(spotPrice: number | undefined, zones: any[], cascadeRisk: string) {
    if (!spotPrice) return;
    const activeZone = zones.find(z => spotPrice >= z.startStrike && spotPrice <= z.endStrike);
    if (!activeZone) return;

    this.observations.push({
      timestamp: Date.now(),
      priceAtEntry: spotPrice,
      zoneType: activeZone.zoneType,
      expectedBehavior: activeZone.expectedBehavior,
      cascadeRisk,
      prices: { '30m': null, '1h': null, '4h': null }
    });

    if (this.observations.length > 1000) this.observations.shift();

    const now = Date.now();
    this.observations.forEach(obs => {
      if (!obs.prices['30m'] && now - obs.timestamp >= 30 * 60 * 1000) obs.prices['30m'] = spotPrice;
      if (!obs.prices['1h'] && now - obs.timestamp >= 60 * 60 * 1000) obs.prices['1h'] = spotPrice;
      if (!obs.prices['4h'] && now - obs.timestamp >= 240 * 60 * 1000) obs.prices['4h'] = spotPrice;
    });
  }

  private static getBacktestMetrics() {
    const completed = this.observations.filter(o => o.prices['30m']);
    if (completed.length === 0) {
      return { pinningAccuracy: 0, expansionAccuracy: 0, cascadeAccuracy: 0, meanMoveAfterExpansion: 0, meanMoveAfterPinning: 0 };
    }

    let pinningHits = 0, pinningTotal = 0;
    let expansionHits = 0, expansionTotal = 0;
    let cascadeHits = 0, cascadeTotal = 0;
    let expMoves: number[] = [], pinMoves: number[] = [];

    completed.forEach(o => {
      const move = Math.abs((o.prices['30m'] || o.priceAtEntry) - o.priceAtEntry) / o.priceAtEntry;
      
      if (o.zoneType === "PINNING") {
        pinningTotal++;
        if (move < 0.005) pinningHits++;
        pinMoves.push(move);
      }
      if (o.zoneType === "EXPANSION") {
        expansionTotal++;
        if (move > 0.01) expansionHits++;
        expMoves.push(move);
      }
      if (o.cascadeRisk === "HIGH") {
        cascadeTotal++;
        if (move > 0.02) cascadeHits++;
      }
    });

    return {
      pinningAccuracy: pinningTotal > 0 ? pinningHits / pinningTotal : 0,
      expansionAccuracy: expansionTotal > 0 ? expansionHits / expansionTotal : 0,
      cascadeAccuracy: cascadeTotal > 0 ? cascadeHits / cascadeTotal : 0,
      meanMoveAfterExpansion: expMoves.length > 0 ? expMoves.reduce((a,b) => a+b, 0) / expMoves.length : 0,
      meanMoveAfterPinning: pinMoves.length > 0 ? pinMoves.reduce((a,b) => a+b, 0) / pinMoves.length : 0
    };
  }

  private static normalizeHeader(header: string): string {
    return header.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  static async ingestLatestCSV(): Promise<NormalizedOption[]> {
    try {
      if (!fs.existsSync(this.DATA_DIR)) return [];
      
      const files = fs.readdirSync(this.DATA_DIR).filter(f => f.endsWith(".csv"));
      if (files.length === 0) return [];
      
      const latestFile = path.join(this.DATA_DIR, files.sort().reverse()[0]);
      const content = fs.readFileSync(latestFile, "utf-8");
      
      const records = parseCsv(content);

      let validCount = 0;
      let rejectedCount = 0;

      const normalizedRecords = records.map((row: any, index: number) => {
        try {
          // Mapping for "Abrir" / "Open Interest"
          const oiValue = row["abrir"] || row["openinterest"] || row["open_interest"] || "0";
          const openInterest = parseFloat(oiValue.replace(/,/g, ''));
          
          const strikeValue = row["strike"] || row["huelga"] || "0";
          const strike = parseFloat(strikeValue.replace(/,/g, ''));

          let optionType = (row["optiontype"] || row["tipo"] || "").toLowerCase();
          const instrument = (row["instrumento"] || row["instrument"] || "").toUpperCase();

          if (!optionType && instrument) {
            if (instrument.endsWith("-C") || instrument.includes("-CALL-")) optionType = "call";
            else if (instrument.endsWith("-P") || instrument.includes("-PUT-")) optionType = "put";
          }

          let expiry = row["expiry"] || row["expiration"] || row["vencimiento"] || "";
          if (!expiry && instrument) {
            const parts = instrument.split('-');
            if (parts.length >= 2) expiry = parts[1];
          }

          if (isNaN(strike) || !expiry || !["call", "put"].includes(optionType) || isNaN(openInterest)) {
            rejectedCount++;
            return null;
          }

          const normalized = normalizedOptionSchema.parse({
            strike,
            expiry,
            optionType: optionType as "call" | "put",
            openInterest,
            gammaExposure: row["gamma"] ? parseFloat(row["gamma"]) : undefined,
            vannaExposure: row["vanna"] ? parseFloat(row["vanna"]) : undefined,
            charmExposure: row["charm"] ? parseFloat(row["charm"]) : undefined
          });

          validCount++;
          return normalized;
        } catch (e) {
          rejectedCount++;
          return null;
        }
      }).filter((r: any): r is NormalizedOption => r !== null);

      console.log(`[DeribitGateway] CSV Valid rows: ${validCount}, Rejected: ${rejectedCount}`);
      return normalizedRecords;
    } catch (e) {
      console.error("[DeribitGateway] CSV ingestion error:", e);
      return [];
    }
  }

  static async fetchLiveDeribit(): Promise<NormalizedOption[]> {
    if (this.liveCache && Date.now() - this.liveCache.timestamp < this.CACHE_TTL_MS) {
      return this.liveCache.data;
    }

    const url = `${this.DERIBIT_API}/get_book_summary_by_currency?currency=BTC&kind=option`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Deribit API ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      if (!json.result || !Array.isArray(json.result)) {
        throw new Error("Deribit API: invalid response shape");
      }

      const options: NormalizedOption[] = [];
      let parsed = 0;
      let skipped = 0;

      for (const item of json.result) {
        try {
          const instrumentName: string = item.instrument_name || "";
          const parts = instrumentName.split("-");
          if (parts.length < 4) { skipped++; continue; }

          const expiry = parts[1];
          const strike = parseFloat(parts[2]);
          const typeChar = parts[3];
          if (isNaN(strike) || (typeChar !== "C" && typeChar !== "P")) { skipped++; continue; }

          const optionType = typeChar === "C" ? "call" : "put";
          const openInterest = item.open_interest || 0;
          if (openInterest <= 0) { skipped++; continue; }

          const underlyingPrice = item.underlying_price || item.mark_price || 0;
          const markIv = item.mark_iv ? item.mark_iv / 100 : 0.5;

          let gammaExposure: number | undefined;
          let vannaExposure: number | undefined;
          let charmExposure: number | undefined;

          if (underlyingPrice > 0 && strike > 0) {
            const moneyness = Math.log(underlyingPrice / strike);
            const dteMatch = expiry.match(/(\d+)/);
            const roughDte = dteMatch ? Math.max(1, parseInt(dteMatch[0])) : 30;
            const T = roughDte / 365;
            const sqrtT = Math.sqrt(T);
            const sigma = markIv > 0 ? markIv : 0.5;

            const d1 = (moneyness + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
            const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

            const rawGamma = nd1 / (underlyingPrice * sigma * sqrtT);
            const dealerSign = optionType === "call" ? 1 : -1;
            gammaExposure = dealerSign * rawGamma * openInterest * underlyingPrice * underlyingPrice * 0.01;

            const dVannaDvol = d1 * nd1 / sigma;
            vannaExposure = dealerSign * dVannaDvol * openInterest * underlyingPrice * 0.01;

            const charmVal = -nd1 * (2 * 0.02 * T - d1 * sigma * sqrtT) / (2 * T * sigma * sqrtT);
            charmExposure = dealerSign * charmVal * openInterest * 100;
          }

          options.push({
            strike,
            expiry,
            optionType,
            openInterest,
            gammaExposure,
            vannaExposure,
            charmExposure
          });
          parsed++;
        } catch {
          skipped++;
        }
      }

      console.log(`[DeribitGateway] Live API: ${parsed} options parsed, ${skipped} skipped from ${json.result.length} instruments`);

      this.liveCache = { data: options, timestamp: Date.now() };
      return options;
    } catch (e: any) {
      clearTimeout(timeout);
      console.error(`[DeribitGateway] Live API failed: ${e.message}`);
      throw e;
    }
  }

  static async ingestOptions(): Promise<IngestionResult> {
    try {
      const liveData = await this.fetchLiveDeribit();
      if (liveData.length > 0) {
        return { options: liveData, source: "LIVE_DERIBIT" };
      }
    } catch (e: any) {
      console.log(`[DeribitGateway] Live fetch failed, falling back to CSV: ${e.message}`);
    }

    const csvData = await this.ingestLatestCSV();
    return { options: csvData, source: "CSV_FALLBACK" };
  }

  static async getSummary(options: NormalizedOption[], spotPrice?: number, source?: "LIVE_DERIBIT" | "CSV_FALLBACK"): Promise<OptionsSummary> {
    const dataSource = source || "CSV_FALLBACK";
    try {
      if (options.length === 0) {
        const fallbackPlaybook = {
          currentPlaybook: {
            regime: "TRANSITION" as const,
            expectedBehavior: "Insufficient options data — awaiting data source",
            volatilityRisk: "MEDIUM" as const,
            directionalBias: "NEUTRAL" as const,
            strategyType: "RANGE_SCALPING" as const
          },
          tradeZones: { longZones: [] as {start: number, end: number}[], shortZones: [] as {start: number, end: number}[] },
          invalidationLevel: spotPrice ? spotPrice * 0.95 : 0,
          regimeShiftTrigger: "Options data ingestion required"
        };
        return {
          totalGex: null, gammaState: null, gammaFlip: null,
          callWall: null, putWall: null, magnets: null,
          shortGammaPockets: null, vannaBias: null, charmBias: null,
          gammaByStrike: [], oiByStrike: [], gammaCurve: [], gammaMagnets: [], shortGammaZones: [],
          dealerGammaState: null, dealerHedgeDirection: null, volatilityRegime: null, dealerFlowScore: null,
          tradingPlaybook: fallbackPlaybook,
          gammaCurveEngine: {
            gammaSlope: 0,
            gammaCliffs: [] as { strike: number, strength: number }[],
            dealerSensitivity: "MEDIUM" as const,
            gammaRegimeBand: "TRANSITION" as const
          },
          volatilityExpansionDetector: {
            volExpansionState: "PRE_BREAKOUT" as const,
            expansionDirection: "NEUTRAL" as const,
            expansionProbability: 0.5,
            playbookShiftSuggested: false,
            suggestedPlaybook: "RANGE_SCALPING" as const,
            expansionTriggerZone: null
          },
          institutionalBiasEngine: {
            institutionalBias: "NEUTRAL_CHOP" as const,
            biasConfidence: 50,
            biasDrivers: ["Insufficient data", "Awaiting options ingestion", "No signal alignment"],
            biasInvalidation: "Bias will update once live options data is available",
            biasHorizon: "INTRADAY" as const
          },
          tradeDecisionEngine: {
            tradeState: "WAIT" as const,
            tradeDirection: "NEUTRAL" as const,
            entryCondition: "Awaiting options data ingestion",
            riskLevel: "MEDIUM" as const,
            positionSizeSuggestion: "NO_TRADE" as const,
            executionReason: ["Insufficient data", "No signal alignment"]
          },
          liquidityCascadeEngine: {
            cascadeRisk: "LOW" as const,
            cascadeDirection: "NONE" as const,
            cascadeTrigger: "Awaiting options data ingestion",
            liquidationPocket: "--",
            cascadeDrivers: ["Insufficient data", "Awaiting options ingestion", "No signal alignment"]
          },
          squeezeProbabilityEngine: {
            squeezeProbability: 0,
            squeezeDirection: "NONE" as const,
            squeezeType: "NONE" as const,
            squeezeTrigger: "Awaiting options data ingestion",
            squeezeTarget: "--",
            squeezeDrivers: ["Insufficient data", "Awaiting options ingestion", "No signal alignment"]
          },
          marketModeEngine: {
            marketMode: "FRAGILE_TRANSITION" as const,
            marketModeConfidence: 0,
            marketModeReason: ["Insufficient data", "Awaiting options ingestion"]
          },
          dealerHedgingFlowMap: {
            hedgingFlowDirection: "NEUTRAL" as const,
            hedgingFlowStrength: "LOW" as const,
            hedgingAccelerationRisk: "LOW" as const,
            hedgingTriggerZone: "Awaiting options data ingestion",
            hedgingFlowSummary: ["Insufficient data", "Awaiting options ingestion"]
          },
          dominantExpiry: null,
          source: dataSource
        };
      }

      let totalGex = 0, callWall = 0, putWall = 0, maxCallOi = 0, maxPutOi = 0;
      let totalVanna = 0, totalCharm = 0;
      const strikeMap = new Map<number, { gex: number, oi: number }>();
      const expiryOiMap = new Map<string, number>();

      options.forEach(opt => {
        if (opt.expiry && opt.openInterest > 0) {
          expiryOiMap.set(opt.expiry, (expiryOiMap.get(opt.expiry) || 0) + opt.openInterest);
        }
        // Global GEX
        if (opt.gammaExposure) totalGex += opt.gammaExposure;
        if (opt.vannaExposure) totalVanna += opt.vannaExposure;
        if (opt.charmExposure) totalCharm += opt.charmExposure;

        // Strike aggregation
        const existing = strikeMap.get(opt.strike) || { gex: 0, oi: 0 };
        existing.gex += (opt.gammaExposure || 0);
        existing.oi += (opt.openInterest || 0);
        strikeMap.set(opt.strike, existing);

        // Wall detection
        if (opt.optionType === "call" && opt.openInterest > maxCallOi) {
          maxCallOi = opt.openInterest;
          callWall = opt.strike;
        } else if (opt.optionType === "put" && opt.openInterest > maxPutOi) {
          maxPutOi = opt.openInterest;
          putWall = opt.strike;
        }
      });

      const gammaByStrike = Array.from(strikeMap.entries())
        .map(([strike, data]) => ({ strike, gex: data.gex }))
        .sort((a, b) => a.strike - b.strike);

      const oiByStrike = Array.from(strikeMap.entries())
        .map(([strike, data]) => ({ strike, oi: data.oi }))
        .sort((a, b) => a.strike - b.strike);

      // 1. Gamma Curve Calculation
      let runningTotal = 0;
      const gammaCurve = gammaByStrike.map(s => {
        runningTotal += s.gex;
        return { strike: s.strike, cumulativeGamma: runningTotal };
      });

      // 2. Gamma Flip Calculation
      let gammaFlip = null;
      for (let i = 0; i < gammaCurve.length - 1; i++) {
        const current = gammaCurve[i];
        const next = gammaCurve[i + 1];
        if ((current.cumulativeGamma <= 0 && next.cumulativeGamma > 0) || 
            (current.cumulativeGamma >= 0 && next.cumulativeGamma < 0)) {
          gammaFlip = current.strike + (next.strike - current.strike) * 
            (Math.abs(current.cumulativeGamma) / (Math.abs(current.cumulativeGamma) + Math.abs(next.cumulativeGamma)));
          break;
        }
      }

      // 3. Gamma Magnets (Top 3 highest positive gamma)
      const gammaMagnets = [...gammaByStrike]
        .filter(s => s.gex > 0)
        .sort((a, b) => b.gex - a.gex)
        .slice(0, 3)
        .map(s => s.strike);

      // 4. Short Gamma Pockets
      const shortGammaZones: { startStrike: number, endStrike: number }[] = [];
      const threshold = -1000000; 
      let currentZone: { startStrike: number, endStrike: number } | null = null;

      gammaByStrike.forEach(s => {
        if (s.gex < threshold) {
          if (!currentZone) {
            currentZone = { startStrike: s.strike, endStrike: s.strike };
          } else {
            currentZone.endStrike = s.strike;
          }
        } else {
          if (currentZone) {
            shortGammaZones.push(currentZone);
            currentZone = null;
          }
        }
      });
      if (currentZone) shortGammaZones.push(currentZone);

      // --- Gamma Gradient Engine ---
      const gammaSlopeByStrike: { strike: number, slope: number }[] = [];
      const gammaAccelerationByStrike: { strike: number, acceleration: number }[] = [];
      const gammaCliffs: { strike: number, strength: number }[] = [];
      const gammaWallStrength: { strike: number, strengthScore: number }[] = [];

      for (let i = 0; i < gammaByStrike.length; i++) {
        const curr = gammaByStrike[i];
        const prev = i > 0 ? gammaByStrike[i - 1] : null;
        const next = i < gammaByStrike.length - 1 ? gammaByStrike[i + 1] : null;

        // 1. Gamma Slope (dGEX / dStrike)
        if (prev) {
          const dGex = curr.gex - prev.gex;
          const dStrike = curr.strike - prev.strike;
          const slope = dStrike !== 0 ? dGex / dStrike : 0;
          gammaSlopeByStrike.push({ strike: curr.strike, slope });

          // 3. Gamma Cliffs (Threshold-based slope detection)
          const cliffThreshold = 5000; // Normalized strength threshold
          if (Math.abs(slope) > cliffThreshold) {
            gammaCliffs.push({ strike: curr.strike, strength: slope });
          }
        }

        // 2. Gamma Acceleration (d²GEX / dStrike²)
        if (prev && next) {
          const dStrike1 = curr.strike - prev.strike;
          const dStrike2 = next.strike - curr.strike;
          const slope1 = dStrike1 !== 0 ? (curr.gex - prev.gex) / dStrike1 : 0;
          const slope2 = dStrike2 !== 0 ? (next.gex - curr.gex) / dStrike2 : 0;
          const acceleration = (dStrike1 + dStrike2) !== 0 ? (slope2 - slope1) / ((dStrike1 + dStrike2) / 2) : 0;
          gammaAccelerationByStrike.push({ strike: curr.strike, acceleration });
        }

        // 4. Gamma Wall Strength (Concentration at magnets/walls)
        const isWall = curr.strike === callWall || curr.strike === putWall || gammaMagnets.includes(curr.strike);
        if (isWall) {
          const localGex = Math.abs(curr.gex);
          const totalAbsGex = options.reduce((sum, opt) => sum + Math.abs(opt.gammaExposure || 0), 0);
          const strengthScore = totalAbsGex > 0 ? localGex / totalAbsGex : 0;
          gammaWallStrength.push({ strike: curr.strike, strengthScore });
        }
      }

      // --- Gamma Curve Engine ---
      let gammaSlope = 0;
      const engineCliffs: { strike: number, strength: number }[] = [];
      let dealerSensitivity: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
      let gammaRegimeBand: "DEEP_LONG_GAMMA" | "LONG_GAMMA_SUPPORT" | "TRANSITION" | "SHORT_GAMMA_RISK" | "DEEP_SHORT_GAMMA" = "TRANSITION";

      if (spotPrice && gammaByStrike.length > 0) {
        const nearbyStrikes = gammaSlopeByStrike
          .filter(s => Math.abs(s.strike - spotPrice) <= 3000)
          .sort((a, b) => Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice));

        if (nearbyStrikes.length > 0) {
          const weights = nearbyStrikes.map((s, i) => 1 / (1 + Math.abs(s.strike - spotPrice) / 1000));
          const totalWeight = weights.reduce((a, b) => a + b, 0);
          gammaSlope = nearbyStrikes.reduce((sum, s, i) => sum + s.slope * weights[i], 0) / (totalWeight || 1);
        }

        gammaCliffs.forEach(c => {
          engineCliffs.push({ strike: c.strike, strength: c.strength });
        });

        const nearCliff = engineCliffs.some(c => Math.abs(c.strike - spotPrice) <= 2000);
        const nearShortGamma = shortGammaZones.some(z => spotPrice >= z.startStrike - 1000 && spotPrice <= z.endStrike + 1000);
        const nearMagnet = gammaMagnets.some(m => Math.abs(spotPrice - m) <= 1500);
        const slopeIsSteep = Math.abs(gammaSlope) > 3000;
        const slopeIsFlat = Math.abs(gammaSlope) < 500;

        if (slopeIsSteep && (nearCliff || nearShortGamma)) {
          dealerSensitivity = "HIGH";
        } else if (slopeIsFlat && nearMagnet && !nearShortGamma) {
          dealerSensitivity = "LOW";
        } else {
          dealerSensitivity = "MEDIUM";
        }

        const distToFlip = gammaFlip ? (spotPrice - gammaFlip) / spotPrice : 0;
        const localGex = gammaByStrike
          .filter(s => Math.abs(s.strike - spotPrice) <= 2000)
          .reduce((sum, s) => sum + s.gex, 0);

        if (distToFlip > 0.08 && localGex > 0) {
          gammaRegimeBand = "DEEP_LONG_GAMMA";
        } else if (distToFlip > 0.02 && localGex > 0) {
          gammaRegimeBand = "LONG_GAMMA_SUPPORT";
        } else if (Math.abs(distToFlip) <= 0.02 || slopeIsFlat) {
          gammaRegimeBand = "TRANSITION";
        } else if (distToFlip < -0.02 && localGex < 0) {
          gammaRegimeBand = "SHORT_GAMMA_RISK";
        } else if (distToFlip < -0.08 && nearCliff) {
          gammaRegimeBand = "DEEP_SHORT_GAMMA";
        }
      }

      const gammaCurveEngine = {
        gammaSlope,
        gammaCliffs: engineCliffs,
        dealerSensitivity,
        gammaRegimeBand
      };

      // --- Advanced Hedging Dynamics ---
      const dealerGammaState = totalGex >= 0 ? "LONG_GAMMA" : "SHORT_GAMMA";
      let dealerHedgeDirection = "NEUTRAL";
      
      if (spotPrice && gammaFlip) {
        if (dealerGammaState === "SHORT_GAMMA") {
          dealerHedgeDirection = spotPrice > gammaFlip ? "BUY TO HEDGE (Rising Price)" : "SELL TO HEDGE (Falling Price)";
        } else {
          dealerHedgeDirection = spotPrice > gammaFlip ? "SELL VOLATILITY (Rising Price)" : "BUY DIPS (Falling Price)";
        }
      }

      let volatilityRegime: "HIGH_VOL" | "LOW_VOL" | "TRANSITION" = "TRANSITION";
      if (dealerGammaState === "LONG_GAMMA") volatilityRegime = "LOW_VOL";
      else if (dealerGammaState === "SHORT_GAMMA") volatilityRegime = "HIGH_VOL";

      // Normalized dealer flow score (-1 to +1)
      const gexScore = Math.tanh(totalGex / 10000000); 
      const vannaScore = Math.tanh(totalVanna / 5000000);
      const charmScore = Math.tanh(totalCharm / 2000000);
      const dealerFlowScore = (gexScore + vannaScore + charmScore) / 3;

      // --- Dealer Reaction Map ---
      const reactionZones: any[] = [];
      const strikes = gammaByStrike.map(s => s.strike);
      
      if (strikes.length > 0) {
        const minStrike = Math.min(...strikes);
        const maxStrike = Math.max(...strikes);
        const step = 1000;

        for (let s = minStrike; s < maxStrike; s += step) {
          const zoneStart = s;
          const zoneEnd = s + step;
          const midPoint = (zoneStart + zoneEnd) / 2;
          
          let zoneType: "PINNING" | "TRANSITION" | "EXPANSION" | "SQUEEZE_RISK" = "TRANSITION";
          let dealerReaction: "BUY_DIPS" | "SELL_RALLIES" | "BUY_BREAKOUT" | "SELL_WEAKNESS" = "SELL_RALLIES";
          let expectedBehavior: "MEAN_REVERSION" | "VOLATILITY_EXPANSION" | "ACCELERATION_UP" | "ACCELERATION_DOWN" = "MEAN_REVERSION";
          let volatilityRisk: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
          let tradeBias: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";

          const isNearMagnet = gammaMagnets.some(m => Math.abs(midPoint - m) <= step);
          const isNearFlip = gammaFlip ? Math.abs(midPoint - gammaFlip) <= step : false;
          const isInShortPocket = shortGammaZones.some(z => midPoint >= z.startStrike && midPoint <= z.endStrike);

          if (isNearMagnet && dealerGammaState === "LONG_GAMMA") {
            zoneType = "PINNING";
            dealerReaction = "BUY_DIPS";
            expectedBehavior = "MEAN_REVERSION";
            volatilityRisk = "LOW";
            tradeBias = totalVanna > 0 ? "LONG" : "NEUTRAL";
          } else if (isInShortPocket || (gammaFlip && midPoint < gammaFlip && dealerGammaState === "SHORT_GAMMA")) {
            zoneType = "EXPANSION";
            dealerReaction = "SELL_WEAKNESS";
            expectedBehavior = "VOLATILITY_EXPANSION";
            volatilityRisk = "HIGH";
            tradeBias = "SHORT";
          } else if (isNearFlip) {
            zoneType = "TRANSITION";
            dealerReaction = "BUY_BREAKOUT";
            expectedBehavior = "VOLATILITY_EXPANSION";
            volatilityRisk = "MEDIUM";
            tradeBias = "NEUTRAL";
          } else if (midPoint > callWall) {
            zoneType = "SQUEEZE_RISK";
            dealerReaction = "BUY_BREAKOUT";
            expectedBehavior = "ACCELERATION_UP";
            volatilityRisk = "HIGH";
            tradeBias = "LONG";
          }

          // Tilt based on vanna/charm
          if (totalVanna > 1000000 && tradeBias === "NEUTRAL") tradeBias = "LONG";
          if (totalCharm < -1000000 && expectedBehavior === "MEAN_REVERSION") expectedBehavior = "VOLATILITY_EXPANSION";

          reactionZones.push({
            startStrike: zoneStart,
            endStrike: zoneEnd,
            zoneType,
            dealerReaction,
            expectedBehavior,
            volatilityRisk,
            tradeBias
          });
        }
      }

      // --- Delta Hedging Speed Engine ---
      let hedgingSpeedScore = 0;
      let hedgingStressScore = 0;
      let cascadeRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
      let pinningStrength = 0;
      let dealerFlowUrgency: "LOW" | "MEDIUM" | "HIGH" = "LOW";

      if (spotPrice) {
        // 1. Hedging Speed Score
        const localSlope = gammaSlopeByStrike.find(s => Math.abs(s.strike - spotPrice) <= 1000)?.slope || 0;
        hedgingSpeedScore = Math.min(1, Math.abs(localSlope) / 10000);

        // 2. Hedging Stress Score
        const distToFlip = gammaFlip ? Math.abs(spotPrice - gammaFlip) : 10000;
        const flipStress = Math.max(0, 1 - distToFlip / 5000);
        const inShortZone = shortGammaZones.some(z => spotPrice >= z.startStrike && spotPrice <= z.endStrike);
        const shortZoneStress = inShortZone ? 0.5 : 0;
        const cliffStress = (gammaCliffs.find(c => Math.abs(c.strike - spotPrice) <= 2000)?.strength || 0) / 10000;
        
        hedgingStressScore = Math.min(1, (flipStress + shortZoneStress + Math.abs(cliffStress) + (Math.abs(totalVanna) / 10000000)) / 2);

        // 3. Cascade Risk
        if ((inShortZone && Math.abs(cliffStress) > 0.3) || (localSlope < -5000 && (totalVanna < 0 || totalCharm < 0))) {
          cascadeRisk = "HIGH";
        } else if (inShortZone || Math.abs(localSlope) > 3000) {
          cascadeRisk = "MEDIUM";
        }

        // 4. Pinning Strength
        const nearMagnet = gammaMagnets.some(m => Math.abs(spotPrice - m) <= 1000);
        const wallStrength = (gammaWallStrength.find(w => Math.abs(w.strike - spotPrice) <= 1000)?.strengthScore || 0);
        pinningStrength = Math.min(1, (nearMagnet ? 0.4 : 0) + (wallStrength * 2) + (dealerGammaState === "LONG_GAMMA" ? 0.3 : 0));
        if (inShortZone) pinningStrength *= 0.2;

        // 5. Dealer Flow Urgency
        const totalStress = hedgingSpeedScore + hedgingStressScore;
        if (totalStress > 1.2) dealerFlowUrgency = "HIGH";
        else if (totalStress > 0.6) dealerFlowUrgency = "MEDIUM";
      }

      // --- Backtesting Engine ---
      DeribitOptionsGateway.recordObservation(spotPrice, reactionZones, (cascadeRisk as string));
      const backtestResults = DeribitOptionsGateway.getBacktestMetrics();

      // --- Liquidation Confluence Engine ---
      const perpLiquidationClusters = [
        { price: (spotPrice || 60000) * 1.02, volume: 5000000 },
        { price: (spotPrice || 60000) * 0.98, volume: 8000000 }
      ];
      const fundingRate = 0.0001;
      const oiChange = 0.05;

      const confluenceZones: any[] = [];
      if (spotPrice) {
        gammaMagnets?.forEach(m => {
          const cluster = perpLiquidationClusters.find(c => Math.abs(c.price - m) < 500);
          if (cluster) {
            confluenceZones.push({
              startPrice: Math.min(m, cluster.price) - 100,
              endPrice: Math.max(m, cluster.price) + 100,
              gammaLevel: m,
              liquidationCluster: cluster.volume,
              confluenceScore: Math.min(1, (cluster.volume / 10000000) + (Math.abs(oiChange) * 5))
            });
          }
        });
      }

      const squeezeProbability = Math.min(1, (Math.abs(dealerFlowScore || 0) * 0.5) + (Math.abs(oiChange) * 2) + (fundingRate > 0 ? 0.1 : 0));
      let liquidationSweepRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
      if (squeezeProbability > 0.7 || cascadeRisk === "HIGH") liquidationSweepRisk = "HIGH";
      else if (squeezeProbability > 0.4 || cascadeRisk === "MEDIUM") liquidationSweepRisk = "MEDIUM";

      const liquidationConfluence = {
        zones: confluenceZones,
        squeezeProbability,
        liquidationSweepRisk
      };

      // --- Market Regime Engine ---
      let dealerRegime: "LONG_GAMMA" | "SHORT_GAMMA" | "TRANSITION" = "TRANSITION";
      const gexThreshold = 1000000;
      if (totalGex > gexThreshold) dealerRegime = "LONG_GAMMA";
      else if (totalGex < -gexThreshold) dealerRegime = "SHORT_GAMMA";
      else if (spotPrice && gammaFlip && Math.abs(spotPrice - gammaFlip) < 2000) dealerRegime = "TRANSITION";

      let liquidityPressure: "PINNING" | "NEUTRAL" | "EXPANSION" | "CASCADE_RISK" = "NEUTRAL";
      if (cascadeRisk === "HIGH") liquidityPressure = "CASCADE_RISK";
      else if (pinningStrength > 0.7) liquidityPressure = "PINNING";
      else if (hedgingStressScore > 0.6) liquidityPressure = "EXPANSION";

      let volatilityState: "COMPRESSING" | "NORMAL" | "EXPANDING" = "NORMAL";
      if (dealerRegime === "LONG_GAMMA") volatilityState = "COMPRESSING";
      else if (dealerRegime === "SHORT_GAMMA" || cascadeRisk === "HIGH") volatilityState = "EXPANDING";

      let tradeBias: "LONG" | "SHORT" | "MEAN_REVERSION" | "NEUTRAL" = "NEUTRAL";
      if (dealerRegime === "LONG_GAMMA" && pinningStrength > 0.6) tradeBias = "MEAN_REVERSION";
      else if (totalVanna > 0 && dealerRegime === "LONG_GAMMA") tradeBias = "LONG";
      else if (totalVanna < 0 && dealerRegime === "SHORT_GAMMA") tradeBias = "SHORT";

      // Confidence score based on signal alignment
      let alignmentCount = 0;
      if (dealerRegime === "LONG_GAMMA" && volatilityState === "COMPRESSING") alignmentCount++;
      if (dealerRegime === "SHORT_GAMMA" && volatilityState === "EXPANDING") alignmentCount++;
      if (liquidityPressure === "CASCADE_RISK" && volatilityState === "EXPANDING") alignmentCount++;
      if (liquidityPressure === "PINNING" && tradeBias === "MEAN_REVERSION") alignmentCount++;
      const regimeConfidence = Math.min(100, 40 + (alignmentCount * 20));

      const marketRegime = {
        dealerRegime,
        liquidityPressure,
        volatilityState,
        tradeBias,
        regimeConfidence
      };

      // --- Dealer Trap Engine ---
      const trapZones: any[] = [];
      let currentTrapRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
      let activeTrapContext = null;

      if (spotPrice) {
        // 1. Breakout Trap / Magnet Fade (LONG_GAMMA + Pinning)
        if (dealerRegime === "LONG_GAMMA" && pinningStrength > 0.6) {
          gammaMagnets?.forEach(m => {
            trapZones.push({
              startPrice: m - 500,
              endPrice: m + 1500,
              trapType: "BREAKOUT_TRAP",
              misleadingDirection: "UP",
              expectedDealerReaction: "SELL_RALLIES",
              expectedOutcome: "FAILED_BREAKOUT",
              confidence: Math.min(100, pinningStrength * 100)
            });
          });
        }

        // 2. Transition Fakeout (Mixed signals + low confidence)
        if (dealerRegime === "TRANSITION" && regimeConfidence < 60 && gammaFlip) {
          trapZones.push({
            startPrice: gammaFlip - 1000,
            endPrice: gammaFlip + 1000,
            trapType: "TRANSITION_FAKEOUT",
            misleadingDirection: Math.random() > 0.5 ? "UP" : "DOWN",
            expectedDealerReaction: "BUY_DIPS",
            expectedOutcome: "MEAN_REVERSION",
            confidence: 100 - regimeConfidence
          });
        }

        // 3. False Expansion (Short Gamma + Low Cascade Risk)
        if (dealerRegime === "SHORT_GAMMA" && cascadeRisk === "LOW") {
          shortGammaZones?.forEach(z => {
            trapZones.push({
              startPrice: z.startStrike - 1000,
              endPrice: z.endStrike + 1000,
              trapType: "FALSE_EXPANSION",
              misleadingDirection: "DOWN",
              expectedDealerReaction: "BUY_DIPS",
              expectedOutcome: "VOLATILITY_FADE",
              confidence: 70
            });
          });
        }

        // 4. Wall Rejection Traps
        if (callWall) {
          trapZones.push({
            startPrice: callWall - 500,
            endPrice: callWall + 1000,
            trapType: "BREAKOUT_TRAP",
            misleadingDirection: "UP",
            expectedDealerReaction: "SELL_RALLIES",
            expectedOutcome: "FAILED_BREAKOUT",
            confidence: 75
          });
        }

        // Active context detection
        const activeTrap = trapZones.find(tz => spotPrice >= tz.startPrice && spotPrice <= tz.endPrice);
        if (activeTrap) {
          activeTrapContext = {
            trapType: activeTrap.trapType,
            misleadingDirection: activeTrap.misleadingDirection,
            expectedOutcome: activeTrap.expectedOutcome,
            confidence: activeTrap.confidence
          };
          if (activeTrap.confidence > 80) currentTrapRisk = "HIGH";
          else if (activeTrap.confidence > 50) currentTrapRisk = "MEDIUM";
        }
      }

      const dealerTrapEngine = {
        trapZones,
        currentTrapRisk,
        activeTrapContext
      };

      // --- Trading Playbook Engine ---
      let strategyType: "FADE_EXTREMES" | "MOMENTUM_BREAKOUT" | "RANGE_SCALPING" | "LIQUIDITY_SWEEP_REVERSAL" | "VOLATILITY_EXPANSION" = "RANGE_SCALPING";
      let directionalBias: "LONG" | "SHORT" | "NEUTRAL" = tradeBias as any || "NEUTRAL";
      let expectedBehavior = "Sideways consolidation with institutional absorption";
      let volatilityRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";

      if (dealerRegime === "LONG_GAMMA") {
        strategyType = pinningStrength > 0.6 ? "RANGE_SCALPING" : "FADE_EXTREMES";
        expectedBehavior = "Mean reversion around high-liquidity magnets";
        volatilityRisk = "LOW";
      } else if (dealerRegime === "SHORT_GAMMA") {
        strategyType = (cascadeRisk as string) === "HIGH" ? "VOLATILITY_EXPANSION" : "MOMENTUM_BREAKOUT";
        expectedBehavior = "Directional acceleration fueled by dealer hedging";
        volatilityRisk = "HIGH";
      } else if (dealerRegime === "TRANSITION") {
        strategyType = "LIQUIDITY_SWEEP_REVERSAL";
        expectedBehavior = "Volatility spikes followed by sharp reversals at key levels";
        volatilityRisk = "MEDIUM";
      }

      const longZones: {start: number, end: number}[] = [];
      const shortZones: {start: number, end: number}[] = [];

      if (putWall && spotPrice) {
        longZones.push({ start: putWall - 1000, end: putWall + 500 });
      }
      if (callWall && spotPrice) {
        shortZones.push({ start: callWall - 500, end: callWall + 1000 });
      }

      gammaMagnets?.forEach(m => {
        if (m < (spotPrice || 0)) longZones.push({ start: m - 500, end: m + 500 });
        else shortZones.push({ start: m - 500, end: m + 500 });
      });

      const invalidationLevel = gammaFlip || (spotPrice ? spotPrice * 0.95 : 0);
      const regimeShiftTrigger = dealerRegime === "LONG_GAMMA" ? "Price break below Gamma Flip" : "Volatility compression and GEX returning to positive";

      const tradingPlaybook = {
        currentPlaybook: {
          regime: dealerRegime,
          expectedBehavior,
          volatilityRisk,
          directionalBias,
          strategyType
        },
        tradeZones: {
          longZones,
          shortZones
        },
        invalidationLevel,
        regimeShiftTrigger
      };

      // --- Volatility Expansion Detector ---
      let volExpansionState: "COMPRESSING" | "PRE_BREAKOUT" | "EXPANDING" = "PRE_BREAKOUT";
      let expansionDirection: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
      let expansionProbability = 0.5;
      let playbookShiftSuggested = false;
      let suggestedPlaybook: "RANGE_SCALPING" | "FADE_EXTREMES" | "MOMENTUM_BREAKOUT" | "VOLATILITY_EXPANSION" | "LIQUIDITY_SWEEP_REVERSAL" = strategyType;
      let expansionTriggerZone: { start: number, end: number } | null = null;

      // 1. volExpansionState
      if (dealerRegime === "LONG_GAMMA" && pinningStrength > 0.5 && cascadeRisk === "LOW") {
        volExpansionState = "COMPRESSING";
      } else if (dealerRegime === "SHORT_GAMMA" || cascadeRisk === "HIGH" || (hedgingStressScore > 0.7 && liquidityPressure === "CASCADE_RISK")) {
        volExpansionState = "EXPANDING";
      } else {
        volExpansionState = "PRE_BREAKOUT";
      }

      // 2. expansionDirection — uses tradeBias, trapZones, shortGammaZones, liquidityPressure
      if (volExpansionState !== "COMPRESSING") {
        const trapBias = activeTrapContext?.misleadingDirection;
        const shortGammaBelow = shortGammaZones.some(z => spotPrice ? spotPrice > z.endStrike : false);
        const shortGammaAbove = shortGammaZones.some(z => spotPrice ? spotPrice < z.startStrike : false);

        if (tradeBias === "LONG" || (tradeBias === "MEAN_REVERSION" && totalVanna > 0)) {
          expansionDirection = "UP";
        } else if (tradeBias === "SHORT") {
          expansionDirection = "DOWN";
        }

        if (liquidityPressure === "CASCADE_RISK" && expansionDirection === "NEUTRAL") {
          expansionDirection = tradeBias === "SHORT" ? "DOWN" : (tradeBias === "LONG" ? "UP" : "DOWN");
        } else if (liquidityPressure === "EXPANSION" && expansionDirection === "NEUTRAL") {
          expansionDirection = totalVanna > 0 ? "UP" : "DOWN";
        }

        if (trapBias === "UP" && activeTrapContext && activeTrapContext.confidence > 70) {
          expansionDirection = "DOWN";
        } else if (trapBias === "DOWN" && activeTrapContext && activeTrapContext.confidence > 70) {
          expansionDirection = "UP";
        }

        if (shortGammaBelow && !shortGammaAbove && expansionDirection === "NEUTRAL") {
          expansionDirection = "DOWN";
        } else if (shortGammaAbove && !shortGammaBelow && expansionDirection === "NEUTRAL") {
          expansionDirection = "UP";
        }
      }

      // 3. expansionProbability — cascadeRisk, hedgingStressScore, proximity to shortGammaZones, regimeConfidence drop
      let expProb = 0.2;
      if (cascadeRisk === "HIGH") expProb += 0.25;
      else if (cascadeRisk === "MEDIUM") expProb += 0.12;
      expProb += hedgingStressScore * 0.25;
      if (spotPrice && shortGammaZones.length > 0) {
        const minDistToShort = Math.min(...shortGammaZones.map(z =>
          Math.min(Math.abs(spotPrice - z.startStrike), Math.abs(spotPrice - z.endStrike))
        ));
        const proximityBoost = Math.max(0, 1 - minDistToShort / 3000) * 0.2;
        expProb += proximityBoost;
      }
      if (regimeConfidence < 60) expProb += (60 - regimeConfidence) / 100 * 0.2;
      if (volExpansionState === "EXPANDING") expProb += 0.15;
      else if (volExpansionState === "PRE_BREAKOUT") expProb += 0.05;
      if (pinningStrength > 0.7) expProb -= 0.15;
      if (dealerRegime === "LONG_GAMMA" && cascadeRisk === "LOW") expProb -= 0.1;
      expansionProbability = Math.max(0, Math.min(1, expProb));

      // 4. playbookShiftSuggested — true when EXPANDING or probability > 0.65
      playbookShiftSuggested = volExpansionState === "EXPANDING" || expansionProbability > 0.65;

      // 5. suggestedPlaybook
      if (volExpansionState === "EXPANDING") {
        suggestedPlaybook = cascadeRisk === "HIGH" ? "VOLATILITY_EXPANSION" : "MOMENTUM_BREAKOUT";
      } else if (volExpansionState === "COMPRESSING") {
        suggestedPlaybook = pinningStrength > 0.7 ? "RANGE_SCALPING" : "FADE_EXTREMES";
      } else if (expansionProbability > 0.65) {
        suggestedPlaybook = "LIQUIDITY_SWEEP_REVERSAL";
      }

      // 6. expansionTriggerZone — shortGammaZones, trapZones, gammaMagnets, gammaFlip proximity
      if (spotPrice) {
        const candidateZones: { start: number, end: number, dist: number }[] = [];

        shortGammaZones.forEach(z => {
          const dist = Math.min(Math.abs(spotPrice - z.startStrike), Math.abs(spotPrice - z.endStrike));
          candidateZones.push({ start: z.startStrike, end: z.endStrike, dist });
        });

        trapZones.forEach((tz: any) => {
          const dist = Math.min(Math.abs(spotPrice - tz.startPrice), Math.abs(spotPrice - tz.endPrice));
          candidateZones.push({ start: tz.startPrice, end: tz.endPrice, dist });
        });

        gammaMagnets?.forEach(m => {
          const dist = Math.abs(spotPrice - m);
          candidateZones.push({ start: m - 500, end: m + 500, dist });
        });

        if (gammaFlip) {
          const dist = Math.abs(spotPrice - gammaFlip);
          candidateZones.push({ start: gammaFlip - 500, end: gammaFlip + 500, dist });
        }

        candidateZones.sort((a, b) => a.dist - b.dist);
        if (candidateZones.length > 0) {
          expansionTriggerZone = { start: candidateZones[0].start, end: candidateZones[0].end };
        }
      }

      const volatilityExpansionDetector = {
        volExpansionState,
        expansionDirection,
        expansionProbability,
        playbookShiftSuggested,
        suggestedPlaybook,
        expansionTriggerZone
      };

      // --- Institutional Bias Engine ---
      type BiasType = "BULLISH_COMPRESSION" | "BEARISH_COMPRESSION" | "BULLISH_EXPANSION" | "BEARISH_EXPANSION" | "FRAGILE_TRANSITION" | "SQUEEZE_SETUP" | "NEUTRAL_CHOP";
      let institutionalBias: BiasType = "NEUTRAL_CHOP";
      const biasDrivers: string[] = [];

      const isLongGamma = dealerRegime === "LONG_GAMMA";
      const isShortGamma = dealerRegime === "SHORT_GAMMA";
      const isTransition = dealerRegime === "TRANSITION" || gammaRegimeBand === "TRANSITION";
      const isExpanding = volExpansionState === "EXPANDING";
      const isCompressing = volExpansionState === "COMPRESSING";
      const highExpProb = expansionProbability > 0.65;
      const highSensitivity = dealerSensitivity === "HIGH";
      const nearCliffs = engineCliffs.some(c => spotPrice ? Math.abs(c.strike - spotPrice) <= 2000 : false);

      if (highExpProb && nearCliffs && highSensitivity) {
        institutionalBias = "SQUEEZE_SETUP";
        biasDrivers.push("High expansion probability");
        biasDrivers.push("Gamma cliff near spot");
        biasDrivers.push("Dealer sensitivity elevated");
        if (isShortGamma) biasDrivers.push("Short gamma regime");
        if (cascadeRisk === "HIGH") biasDrivers.push("Cascade risk elevated");
      } else if (isLongGamma && isCompressing && cascadeRisk === "LOW" && pinningStrength > 0.5) {
        if (tradeBias === "LONG" || tradeBias === "MEAN_REVERSION") {
          institutionalBias = "BULLISH_COMPRESSION";
          biasDrivers.push("Long gamma regime");
          biasDrivers.push("Volatility compressing");
          biasDrivers.push("Strong pinning near magnets");
          if (tradeBias === "LONG") biasDrivers.push("Upside trade bias");
        } else if (tradeBias === "SHORT") {
          institutionalBias = "BEARISH_COMPRESSION";
          biasDrivers.push("Long gamma support present");
          biasDrivers.push("Directional pressure tilts lower");
          biasDrivers.push("Volatility compressing");
        } else {
          institutionalBias = "BULLISH_COMPRESSION";
          biasDrivers.push("Long gamma regime");
          biasDrivers.push("Low cascade risk");
          biasDrivers.push("Pinning strength active");
        }
      } else if (isShortGamma && isExpanding) {
        if (expansionDirection === "UP") {
          institutionalBias = "BULLISH_EXPANSION";
          biasDrivers.push("Short gamma regime");
          biasDrivers.push("Upside expansion detected");
          biasDrivers.push("Dealer hedging accelerates rallies");
          if (cascadeRisk !== "LOW") biasDrivers.push(`Cascade risk: ${cascadeRisk}`);
        } else {
          institutionalBias = "BEARISH_EXPANSION";
          biasDrivers.push("Short gamma regime");
          biasDrivers.push("Downside expansion conditions");
          if (cascadeRisk === "HIGH") biasDrivers.push("Cascade risk elevated");
          if (liquidityPressure === "CASCADE_RISK") biasDrivers.push("Liquidity pressure critical");
        }
      } else if (isTransition) {
        institutionalBias = "FRAGILE_TRANSITION";
        biasDrivers.push("Gamma regime in transition");
        biasDrivers.push("Mixed signal alignment");
        if (regimeConfidence < 60) biasDrivers.push("Low regime confidence");
        if (gammaRegimeBand === "TRANSITION") biasDrivers.push("Near gamma flip level");
      } else {
        institutionalBias = "NEUTRAL_CHOP";
        biasDrivers.push("No strong directional signal");
        biasDrivers.push("Mixed gamma and flow conditions");
        if (Math.abs(gammaSlope) < 500) biasDrivers.push("Flat gamma curve");
      }

      while (biasDrivers.length < 3) biasDrivers.push("Standard market conditions");
      if (biasDrivers.length > 5) biasDrivers.length = 5;

      let biasConfidence = regimeConfidence;
      if (dealerSensitivity === "HIGH") biasConfidence += 10;
      else if (dealerSensitivity === "LOW") biasConfidence -= 5;
      if (expansionProbability > 0.7) biasConfidence += 10;
      else if (expansionProbability < 0.3) biasConfidence -= 5;

      const gammaAligned = (isLongGamma && isCompressing) || (isShortGamma && isExpanding);
      const playbookAligned = !playbookShiftSuggested;
      if (gammaAligned) biasConfidence += 10;
      if (playbookAligned) biasConfidence += 5;
      if (!gammaAligned && !playbookAligned) biasConfidence -= 10;
      biasConfidence = Math.max(0, Math.min(100, biasConfidence));

      let biasInvalidation = "";
      if (institutionalBias.includes("COMPRESSION")) {
        biasInvalidation = `Bias invalidates if GEX turns negative and expansion probability rises above 0.65`;
      } else if (institutionalBias.includes("EXPANSION")) {
        biasInvalidation = `Bias invalidates if GEX returns positive and expansion probability drops below 0.40`;
      } else if (institutionalBias === "SQUEEZE_SETUP") {
        biasInvalidation = `Bias invalidates if dealer sensitivity drops to LOW and gamma cliffs move away from spot`;
      } else if (institutionalBias === "FRAGILE_TRANSITION") {
        biasInvalidation = `Bias invalidates if regime confidence rises above 70 and gamma regime stabilizes`;
      } else {
        biasInvalidation = `Bias invalidates on clear directional signal alignment across gamma, flow, and volatility`;
      }

      let biasHorizon: "INTRADAY" | "SWING" | "EVENT_DRIVEN" = "INTRADAY";
      if (institutionalBias === "SQUEEZE_SETUP" || institutionalBias.includes("EXPANSION")) {
        biasHorizon = "EVENT_DRIVEN";
      } else if (gammaRegimeBand === "DEEP_LONG_GAMMA" || gammaRegimeBand === "DEEP_SHORT_GAMMA" || gammaRegimeBand === "LONG_GAMMA_SUPPORT") {
        biasHorizon = "SWING";
      }

      const institutionalBiasEngine = {
        institutionalBias,
        biasConfidence,
        biasDrivers,
        biasInvalidation,
        biasHorizon
      };

      // --- Trade Decision Engine ---
      type TradeStateType = "EXECUTE" | "PREPARE" | "WAIT" | "AVOID";
      type TradeDirType = "LONG" | "SHORT" | "NEUTRAL";
      type RiskType = "LOW" | "MEDIUM" | "HIGH";
      type SizeType = "FULL" | "REDUCED" | "PROBE_ONLY" | "NO_TRADE";

      let tradeState: TradeStateType = "WAIT";
      let tradeDirection: TradeDirType = "NEUTRAL";
      let entryCondition = "";
      let riskLevel: RiskType = "MEDIUM";
      let positionSizeSuggestion: SizeType = "PROBE_ONLY";
      const executionReason: string[] = [];

      // Derive tradeDirection from bias + expansion + tradeBias
      if (institutionalBias.includes("BULLISH")) {
        tradeDirection = "LONG";
      } else if (institutionalBias.includes("BEARISH")) {
        tradeDirection = "SHORT";
      } else if (expansionDirection === "UP" && tradeBias === "LONG") {
        tradeDirection = "LONG";
      } else if (expansionDirection === "DOWN" && tradeBias === "SHORT") {
        tradeDirection = "SHORT";
      }

      // Derive riskLevel
      const highRiskSignals = [
        isExpanding,
        currentTrapRisk === "HIGH",
        highSensitivity,
        cascadeRisk === "HIGH",
        volatilityState === "EXPANSION"
      ].filter(Boolean).length;

      const lowRiskSignals = [
        isCompressing,
        pinningStrength > 0.6,
        cascadeRisk === "LOW",
        dealerSensitivity === "LOW",
        isLongGamma
      ].filter(Boolean).length;

      if (highRiskSignals >= 3) riskLevel = "HIGH";
      else if (lowRiskSignals >= 3) riskLevel = "LOW";
      else riskLevel = "MEDIUM";

      // Derive tradeState
      const biasAligned = institutionalBias !== "NEUTRAL_CHOP" && institutionalBias !== "FRAGILE_TRANSITION";
      const directionAligned = tradeDirection !== "NEUTRAL";
      const trapBlocking = currentTrapRisk === "HIGH";
      const structureUnfavorable = trapBlocking && riskLevel === "HIGH";

      if (structureUnfavorable) {
        tradeState = "AVOID";
      } else if (biasAligned && directionAligned && biasConfidence >= 65 && !trapBlocking) {
        tradeState = "EXECUTE";
      } else if (biasAligned && directionAligned && biasConfidence >= 40) {
        tradeState = "PREPARE";
      } else {
        tradeState = "WAIT";
      }

      // Derive positionSizeSuggestion
      if (tradeState === "AVOID") {
        positionSizeSuggestion = "NO_TRADE";
      } else if (tradeState === "EXECUTE" && biasConfidence >= 75 && riskLevel !== "HIGH") {
        positionSizeSuggestion = "FULL";
      } else if (tradeState === "EXECUTE" || (tradeState === "PREPARE" && riskLevel !== "HIGH")) {
        positionSizeSuggestion = "REDUCED";
      } else {
        positionSizeSuggestion = "PROBE_ONLY";
      }

      // Derive entryCondition based on direction + key levels
      const dealerPivot = gammaFlip || 0;
      const nearestMagnet = gammaMagnets && gammaMagnets.length > 0 && spotPrice
        ? gammaMagnets.reduce((closest, m) => Math.abs(m - spotPrice) < Math.abs(closest - spotPrice) ? m : closest, gammaMagnets[0])
        : null;

      if (tradeDirection === "SHORT") {
        if (dealerPivot && spotPrice && spotPrice > dealerPivot) {
          entryCondition = `Break below dealer pivot at ${Math.round(dealerPivot).toLocaleString()}`;
        } else if (callWall) {
          entryCondition = `Reject ${Math.round(callWall).toLocaleString()} call wall`;
        } else {
          entryCondition = "Confirm downside momentum below current range";
        }
      } else if (tradeDirection === "LONG") {
        if (putWall) {
          entryCondition = `Hold above ${Math.round(putWall).toLocaleString()} put wall`;
        } else if (nearestMagnet) {
          entryCondition = `Reclaim gamma magnet at ${Math.round(nearestMagnet).toLocaleString()}`;
        } else {
          entryCondition = "Confirm upside momentum above current range";
        }
      } else {
        entryCondition = "Wait for directional signal alignment";
      }

      // Build executionReason
      if (institutionalBias !== "NEUTRAL_CHOP") {
        executionReason.push(`${institutionalBias.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())} bias`);
      }
      if (isShortGamma) executionReason.push("Short gamma regime");
      else if (isLongGamma) executionReason.push("Long gamma regime");
      if (riskLevel === "HIGH") executionReason.push("High volatility risk");
      else if (riskLevel === "LOW") executionReason.push("Low volatility environment");
      if (entryCondition) executionReason.push(entryCondition);
      if (trapBlocking) executionReason.push("Dealer trap risk blocking");
      while (executionReason.length < 2) executionReason.push("Standard market conditions");
      if (executionReason.length > 4) executionReason.length = 4;

      const tradeDecisionEngine = {
        tradeState,
        tradeDirection,
        entryCondition,
        riskLevel,
        positionSizeSuggestion,
        executionReason
      };

      // --- Liquidity Cascade Engine ---
      type CascadeRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
      type CascadeDirType = "UP" | "DOWN" | "TWO_SIDED" | "NONE";

      let lcCascadeRisk: CascadeRiskLevel = "LOW";
      let cascadeDirection: CascadeDirType = "NONE";
      let cascadeTrigger = "";
      let liquidationPocket = "--";
      const cascadeDrivers: string[] = [];

      const cliffsBelow = engineCliffs.filter(c => spotPrice ? c.strike < spotPrice && Math.abs(c.strike - spotPrice) <= 5000 : false);
      const cliffsAbove = engineCliffs.filter(c => spotPrice ? c.strike > spotPrice && Math.abs(c.strike - spotPrice) <= 5000 : false);
      const hasNearbyCliffsBelow = cliffsBelow.length > 0;
      const hasNearbyCliffsAbove = cliffsAbove.length > 0;

      let cascadeScore = 0;
      if (isShortGamma) cascadeScore += 2;
      if (gammaRegimeBand === "SHORT_GAMMA_RISK" || gammaRegimeBand === "DEEP_SHORT_GAMMA") cascadeScore += 2;
      if (dealerSensitivity === "HIGH") cascadeScore += 2;
      else if (dealerSensitivity === "MEDIUM") cascadeScore += 1;
      if (hasNearbyCliffsBelow || hasNearbyCliffsAbove) cascadeScore += 2;
      if (expansionProbability > 0.7) cascadeScore += 2;
      else if (expansionProbability > 0.5) cascadeScore += 1;
      if (cascadeRisk === "HIGH") cascadeScore += 2;
      else if (cascadeRisk === "MEDIUM") cascadeScore += 1;
      if (isCompressing && pinningStrength > 0.6) cascadeScore -= 3;

      if (cascadeScore >= 10) lcCascadeRisk = "EXTREME";
      else if (cascadeScore >= 7) lcCascadeRisk = "HIGH";
      else if (cascadeScore >= 4) lcCascadeRisk = "MEDIUM";
      else lcCascadeRisk = "LOW";

      if (isCompressing && isLongGamma) {
        cascadeDirection = "NONE";
      } else if (isTransition && isExpanding) {
        cascadeDirection = "TWO_SIDED";
      } else if (institutionalBias.includes("BEARISH") || (expansionDirection === "DOWN" && isShortGamma)) {
        cascadeDirection = "DOWN";
      } else if (institutionalBias.includes("BULLISH") || (expansionDirection === "UP" && isShortGamma)) {
        cascadeDirection = "UP";
      } else if (isExpanding) {
        cascadeDirection = "TWO_SIDED";
      }

      const formatK = (p: number) => p >= 1000 ? `${(p / 1000).toFixed(1)}k` : `${p}`;

      if (cascadeDirection === "DOWN" || cascadeDirection === "TWO_SIDED") {
        if (gammaFlip && spotPrice && spotPrice > gammaFlip) {
          cascadeTrigger = `Break below dealer pivot at ${formatK(gammaFlip)}`;
        } else if (putWall) {
          cascadeTrigger = `Loss of put wall support at ${formatK(putWall)}`;
        } else if (gammaMagnets && gammaMagnets.length > 0) {
          const belowMagnets = gammaMagnets.filter(m => spotPrice ? m < spotPrice : false).sort((a, b) => b - a);
          if (belowMagnets.length > 0) {
            cascadeTrigger = `Loss of gamma magnet support at ${formatK(belowMagnets[0])}`;
          } else {
            cascadeTrigger = "Break below current support structure";
          }
        } else {
          cascadeTrigger = "Break below current support structure";
        }
      } else if (cascadeDirection === "UP") {
        if (callWall) {
          cascadeTrigger = `Break above call wall at ${formatK(callWall)}`;
        } else if (gammaMagnets && gammaMagnets.length > 0) {
          const aboveMagnets = gammaMagnets.filter(m => spotPrice ? m > spotPrice : false).sort((a, b) => a - b);
          if (aboveMagnets.length > 0) {
            cascadeTrigger = `Reclaim gamma magnet at ${formatK(aboveMagnets[0])}`;
          } else {
            cascadeTrigger = "Break above current resistance structure";
          }
        } else {
          cascadeTrigger = "Break above current resistance structure";
        }
      } else {
        cascadeTrigger = "No cascade trigger — compression dominant";
      }

      if (spotPrice && (hasNearbyCliffsBelow || hasNearbyCliffsAbove)) {
        const targetCliffs = cascadeDirection === "UP" ? cliffsAbove : cliffsBelow.length > 0 ? cliffsBelow : cliffsAbove;
        if (targetCliffs.length > 0) {
          const sorted = [...targetCliffs].sort((a, b) => Math.abs(a.strength) - Math.abs(b.strength));
          const strongest = sorted[sorted.length - 1];
          const pocketStart = strongest.strike - 500;
          const pocketEnd = strongest.strike + 500;
          liquidationPocket = `${formatK(pocketStart)} – ${formatK(pocketEnd)}`;
        }
      } else if (spotPrice) {
        if (cascadeDirection === "DOWN" && putWall) {
          liquidationPocket = `${formatK(putWall - 1000)} – ${formatK(putWall)}`;
        } else if (cascadeDirection === "UP" && callWall) {
          liquidationPocket = `${formatK(callWall)} – ${formatK(callWall + 1000)}`;
        }
      }

      if (isShortGamma) cascadeDrivers.push("Short gamma regime");
      else if (isLongGamma) cascadeDrivers.push("Long gamma regime");
      if (hasNearbyCliffsBelow) cascadeDrivers.push("Gamma cliff below spot");
      if (hasNearbyCliffsAbove) cascadeDrivers.push("Gamma cliff above spot");
      if (highSensitivity) cascadeDrivers.push("Dealer sensitivity elevated");
      if (expansionProbability > 0.5) cascadeDrivers.push("Expansion probability rising");
      if (cascadeRisk === "HIGH") cascadeDrivers.push("Hedging cascade risk high");
      if (isExpanding) cascadeDrivers.push("Volatility expanding");
      if (isCompressing && pinningStrength > 0.5) cascadeDrivers.push("Compression and pinning suppressing cascade");
      while (cascadeDrivers.length < 3) cascadeDrivers.push("Standard market conditions");
      if (cascadeDrivers.length > 5) cascadeDrivers.length = 5;

      const liquidityCascadeEngine = {
        cascadeRisk: lcCascadeRisk,
        cascadeDirection,
        cascadeTrigger,
        liquidationPocket,
        cascadeDrivers
      };

      // --- Squeeze Probability Engine ---
      let sqProb = 10;
      if (lcCascadeRisk === "EXTREME") sqProb += 30;
      else if (lcCascadeRisk === "HIGH") sqProb += 20;
      else if (lcCascadeRisk === "MEDIUM") sqProb += 10;
      if (dealerSensitivity === "HIGH") sqProb += 15;
      else if (dealerSensitivity === "MEDIUM") sqProb += 5;
      if (expansionProbability > 0.7) sqProb += 15;
      else if (expansionProbability > 0.5) sqProb += 8;
      if (nearCliffs) sqProb += 10;
      if (isShortGamma) sqProb += 10;
      if (isCompressing && pinningStrength > 0.6) sqProb -= 20;
      if (isLongGamma && cascadeRisk === "LOW") sqProb -= 10;
      const sqProbFinal = Math.max(0, Math.min(100, sqProb));

      type SqDirType = "UP" | "DOWN" | "NONE";
      type SqType = "SHORT_SQUEEZE" | "LONG_SQUEEZE" | "GAMMA_SQUEEZE" | "NONE";

      let squeezeDirection: SqDirType = "NONE";
      let squeezeType: SqType = "NONE";

      if (sqProbFinal >= 30) {
        if (isShortGamma && (cascadeDirection === "UP" || expansionDirection === "UP")) {
          squeezeDirection = "UP";
          squeezeType = "SHORT_SQUEEZE";
        } else if (cascadeDirection === "DOWN" || expansionDirection === "DOWN") {
          squeezeDirection = "DOWN";
          squeezeType = "LONG_SQUEEZE";
        } else if (nearCliffs && highSensitivity) {
          squeezeDirection = cascadeDirection === "UP" ? "UP" : cascadeDirection === "DOWN" ? "DOWN" : "UP";
          squeezeType = "GAMMA_SQUEEZE";
        } else if (cascadeDirection === "TWO_SIDED") {
          squeezeDirection = tradeDirection === "LONG" ? "UP" : tradeDirection === "SHORT" ? "DOWN" : "UP";
          squeezeType = "GAMMA_SQUEEZE";
        }
      }

      let squeezeTrigger = "";
      let squeezeTarget = "--";

      if (squeezeDirection === "UP") {
        if (gammaMagnets && gammaMagnets.length > 0 && spotPrice) {
          const aboveMagnets = gammaMagnets.filter(m => m > spotPrice).sort((a, b) => a - b);
          if (aboveMagnets.length > 0) {
            squeezeTrigger = `Break above gamma magnet at ${formatK(aboveMagnets[0])}`;
          } else {
            squeezeTrigger = gammaFlip && spotPrice < gammaFlip ? `Reclaim dealer pivot at ${formatK(gammaFlip)}` : "Break above current resistance";
          }
        } else {
          squeezeTrigger = callWall ? `Break above call wall at ${formatK(callWall)}` : "Break above current resistance";
        }
        if (callWall) {
          squeezeTarget = `${formatK(callWall)} – ${formatK(callWall + 1000)}`;
        } else if (cliffsAbove.length > 0) {
          const nearest = cliffsAbove.sort((a, b) => a.strike - b.strike)[0];
          squeezeTarget = `${formatK(nearest.strike)} – ${formatK(nearest.strike + 1000)}`;
        }
      } else if (squeezeDirection === "DOWN") {
        if (putWall) {
          squeezeTrigger = `Loss of put wall support at ${formatK(putWall)}`;
        } else if (gammaFlip && spotPrice && spotPrice > gammaFlip) {
          squeezeTrigger = `Break below dealer pivot at ${formatK(gammaFlip)}`;
        } else {
          squeezeTrigger = "Break below current support structure";
        }
        if (cliffsBelow.length > 0) {
          const nearest = cliffsBelow.sort((a, b) => b.strike - a.strike)[0];
          squeezeTarget = `${formatK(nearest.strike - 500)} – ${formatK(nearest.strike + 500)}`;
        } else if (putWall) {
          squeezeTarget = `${formatK(putWall - 1000)} – ${formatK(putWall)}`;
        }
      } else {
        squeezeTrigger = "No squeeze trigger — compression dominant";
      }

      const squeezeDrivers: string[] = [];
      if (isShortGamma) squeezeDrivers.push("Short gamma regime");
      else if (isLongGamma) squeezeDrivers.push("Long gamma regime");
      if (lcCascadeRisk === "HIGH" || lcCascadeRisk === "EXTREME") squeezeDrivers.push("Cascade risk elevated");
      if (highSensitivity) squeezeDrivers.push("Dealer sensitivity high");
      if (expansionProbability > 0.5) squeezeDrivers.push("Expansion probability rising");
      if (nearCliffs) squeezeDrivers.push("Near gamma cliff zone");
      if (isCompressing && pinningStrength > 0.5) squeezeDrivers.push("Pinning suppressing squeeze");
      while (squeezeDrivers.length < 3) squeezeDrivers.push("Standard market conditions");
      if (squeezeDrivers.length > 5) squeezeDrivers.length = 5;

      const squeezeProbabilityEngine = {
        squeezeProbability: sqProbFinal,
        squeezeDirection,
        squeezeType,
        squeezeTrigger,
        squeezeTarget,
        squeezeDrivers
      };

      // === MARKET MODE ENGINE (Engine #18) ===
      const mmIsLongGamma = totalGex >= 0;
      const mmIsShortGamma = totalGex < 0;
      const mmRegBand = gammaCurveEngine?.gammaRegimeBand || "TRANSITION";
      const mmLcRisk = liquidityCascadeEngine?.cascadeRisk || "LOW";
      const mmSqProb = squeezeProbabilityEngine?.squeezeProbability ?? 0;
      const mmSqType = squeezeProbabilityEngine?.squeezeType || "NONE";
      const mmExpProb = volatilityExpansionDetector?.expansionProbability ?? 0.5;
      const mmExpState = volatilityExpansionDetector?.volExpansionState || "PRE_BREAKOUT";
      const mmInstBias = institutionalBiasEngine?.institutionalBias || "NEUTRAL_CHOP";
      const mmBiasConf = institutionalBiasEngine?.biasConfidence ?? 50;
      const mmDSens = gammaCurveEngine?.dealerSensitivity || "MEDIUM";
      const mmTState = tradeDecisionEngine?.tradeState || "WAIT";
      const mmPlaybook = tradingPlaybook?.currentPlaybook?.strategyType || "RANGE_SCALPING";

      type MarketMode = "GAMMA_PIN" | "MEAN_REVERSION" | "VOL_EXPANSION" | "SQUEEZE_RISK" | "CASCADE_RISK" | "FRAGILE_TRANSITION";
      let marketMode: MarketMode = "FRAGILE_TRANSITION";
      let marketModeConfidence = 0;
      const marketModeReason: string[] = [];

      const scores: Record<MarketMode, number> = {
        GAMMA_PIN: 0,
        MEAN_REVERSION: 0,
        VOL_EXPANSION: 0,
        SQUEEZE_RISK: 0,
        CASCADE_RISK: 0,
        FRAGILE_TRANSITION: 0
      };

      if (mmLcRisk === "EXTREME") { scores.CASCADE_RISK += 50; }
      else if (mmLcRisk === "HIGH") { scores.CASCADE_RISK += 35; }
      else if (mmLcRisk === "MEDIUM") { scores.CASCADE_RISK += 10; }

      if (mmSqProb > 70) { scores.SQUEEZE_RISK += 40; }
      else if (mmSqProb > 50) { scores.SQUEEZE_RISK += 25; }
      else if (mmSqProb > 30) { scores.SQUEEZE_RISK += 10; }
      if (mmSqType !== "NONE") { scores.SQUEEZE_RISK += 10; }

      if (mmIsLongGamma && pinningStrength > 0.6 && mmExpProb < 0.4) {
        scores.GAMMA_PIN += 35;
      }
      if (pinningStrength > 0.7) { scores.GAMMA_PIN += 15; }
      if (mmRegBand === "DEEP_LONG_GAMMA") { scores.GAMMA_PIN += 10; }
      if (mmPlaybook === "RANGE_SCALPING" && mmIsLongGamma) { scores.GAMMA_PIN += 5; }

      if (mmIsLongGamma && (mmPlaybook === "FADE_EXTREMES" || mmPlaybook === "RANGE_SCALPING")) {
        scores.MEAN_REVERSION += 25;
      }
      if (mmRegBand === "LONG_GAMMA_SUPPORT" || mmRegBand === "DEEP_LONG_GAMMA") {
        scores.MEAN_REVERSION += 10;
      }
      if (mmIsLongGamma && mmExpProb < 0.35) { scores.MEAN_REVERSION += 10; }
      if (pinningStrength > 0.4 && pinningStrength <= 0.6) { scores.MEAN_REVERSION += 5; }

      if (mmIsShortGamma) { scores.VOL_EXPANSION += 20; }
      if (mmExpState === "EXPANDING") { scores.VOL_EXPANSION += 25; }
      else if (mmExpState === "PRE_BREAKOUT" && mmExpProb > 0.5) { scores.VOL_EXPANSION += 15; }
      if (mmExpProb > 0.6) { scores.VOL_EXPANSION += 10; }
      if (mmRegBand === "SHORT_GAMMA_RISK" || mmRegBand === "DEEP_SHORT_GAMMA") { scores.VOL_EXPANSION += 10; }
      if (mmDSens === "HIGH") { scores.VOL_EXPANSION += 5; }
      if (mmPlaybook === "VOLATILITY_EXPANSION" || mmPlaybook === "MOMENTUM_BREAKOUT") { scores.VOL_EXPANSION += 10; }

      if (mmRegBand === "TRANSITION") { scores.FRAGILE_TRANSITION += 20; }
      if (mmInstBias === "FRAGILE_TRANSITION") { scores.FRAGILE_TRANSITION += 15; }
      if (mmTState === "WAIT" || mmTState === "AVOID") { scores.FRAGILE_TRANSITION += 5; }

      const sortedModes = (Object.entries(scores) as [MarketMode, number][])
        .sort((a, b) => b[1] - a[1]);
      marketMode = sortedModes[0][0];
      const topScore = sortedModes[0][1];
      const secondScore = sortedModes[1]?.[1] || 0;

      const separation = topScore - secondScore;
      let confBase = Math.min(100, mmBiasConf * 0.4 + topScore * 0.8 + separation * 0.5);
      if (mmDSens === "HIGH") confBase += 5;
      if (mmSqProb > 50 && marketMode === "SQUEEZE_RISK") confBase += 5;
      if (mmExpProb > 0.6 && marketMode === "VOL_EXPANSION") confBase += 5;
      marketModeConfidence = Math.round(Math.min(100, Math.max(0, confBase)));

      if (marketMode === "GAMMA_PIN") {
        if (pinningStrength > 0.7) marketModeReason.push("Strong pinning detected");
        if (mmIsLongGamma) marketModeReason.push("Long gamma regime");
        if (mmExpProb < 0.4) marketModeReason.push("Low expansion probability");
        if (mmRegBand === "DEEP_LONG_GAMMA") marketModeReason.push("Deep long gamma band");
      } else if (marketMode === "MEAN_REVERSION") {
        if (mmIsLongGamma) marketModeReason.push("Long gamma regime");
        if (mmPlaybook === "FADE_EXTREMES") marketModeReason.push("Fade-extremes playbook active");
        else if (mmPlaybook === "RANGE_SCALPING") marketModeReason.push("Range-scalping conditions");
        if (pinningStrength > 0.3) marketModeReason.push("Moderate pinning supports reversion");
      } else if (marketMode === "VOL_EXPANSION") {
        if (mmIsShortGamma) marketModeReason.push("Short gamma regime");
        if (mmExpState === "EXPANDING") marketModeReason.push("Volatility expanding");
        else if (mmExpProb > 0.5) marketModeReason.push("Expansion probability elevated");
        if (mmDSens === "HIGH") marketModeReason.push("Dealer sensitivity high");
        if (mmRegBand === "DEEP_SHORT_GAMMA") marketModeReason.push("Deep short gamma band");
      } else if (marketMode === "SQUEEZE_RISK") {
        if (mmSqProb > 50) marketModeReason.push(`Squeeze probability ${mmSqProb.toFixed(0)}%`);
        if (mmSqType !== "NONE") marketModeReason.push(`${mmSqType.replace(/_/g, " ").toLowerCase()} setup`);
        if (mmIsShortGamma) marketModeReason.push("Short gamma amplifies squeeze");
      } else if (marketMode === "CASCADE_RISK") {
        marketModeReason.push(`Cascade risk ${mmLcRisk.toLowerCase()}`);
        if (mmIsShortGamma) marketModeReason.push("Short gamma accelerates cascades");
        if (mmDSens === "HIGH") marketModeReason.push("Dealer sensitivity high");
      } else if (marketMode === "FRAGILE_TRANSITION") {
        if (mmRegBand === "TRANSITION") marketModeReason.push("Between gamma regimes");
        if (mmInstBias === "FRAGILE_TRANSITION") marketModeReason.push("Institutional bias fragile");
        if (mmTState === "WAIT") marketModeReason.push("Trade state: waiting for clarity");
        else if (mmTState === "AVOID") marketModeReason.push("Trade state: avoid");
      }
      while (marketModeReason.length < 2) marketModeReason.push("Standard market conditions");
      if (marketModeReason.length > 4) marketModeReason.length = 4;

      const marketModeEngine = { marketMode, marketModeConfidence, marketModeReason };

      // ═══ ENGINE #19: Dealer Hedging Flow Map ═══
      const dhfIsLongGamma = dealerGammaState === "LONG_GAMMA";
      const dhfIsShortGamma = dealerGammaState === "SHORT_GAMMA";
      const dhfSpot = spotPrice || 0;
      const dhfDPivot = dealerPivot || 0;
      const dhfExpDir = volatilityExpansionDetector?.expansionDirection || "NEUTRAL";
      const dhfExpProb = volatilityExpansionDetector?.expansionProbability ?? 0.5;
      const dhfCascade = liquidityCascadeEngine?.cascadeRisk || "LOW";
      const dhfSqProb = squeezeProbabilityEngine?.squeezeProbability ?? 0;
      const dhfDSens = gammaCurveEngine?.dealerSensitivity || "MEDIUM";
      const dhfGSlope = gammaCurveEngine?.gammaSlope ?? 0;
      const dhfInstBias = institutionalBiasEngine?.institutionalBias || "NEUTRAL_CHOP";
      const dhfTDir = tradeDecisionEngine?.tradeDirection || "NEUTRAL";
      const dhfPlaybook = tradingPlaybook?.currentPlaybook?.strategyType || "RANGE_SCALPING";
      const dhfCW = callWall || 0;
      const dhfPW = putWall || 0;
      const dhfMagnets = gammaMagnets?.map((m: any) => typeof m === "number" ? m : m?.strike).filter(Boolean) || [];
      const dhfCliffs = gammaCurveEngine?.gammaCliffs || [];

      let hedgingFlowDirection: "BUYING" | "SELLING" | "NEUTRAL" = "NEUTRAL";
      if (dhfIsLongGamma) {
        if (dhfSpot < dhfDPivot) hedgingFlowDirection = "BUYING";
        else if (dhfSpot > dhfDPivot) hedgingFlowDirection = "SELLING";
        else hedgingFlowDirection = "NEUTRAL";
      } else if (dhfIsShortGamma) {
        if (dhfExpDir === "DOWN" || dhfTDir === "SHORT") hedgingFlowDirection = "SELLING";
        else if (dhfExpDir === "UP" || dhfTDir === "LONG") hedgingFlowDirection = "BUYING";
        else hedgingFlowDirection = "NEUTRAL";
      }
      if (dhfInstBias === "BULLISH_ACCUMULATION" && hedgingFlowDirection === "NEUTRAL") hedgingFlowDirection = "BUYING";
      if (dhfInstBias === "BEARISH_DISTRIBUTION" && hedgingFlowDirection === "NEUTRAL") hedgingFlowDirection = "SELLING";

      let dhfStrengthScore = 0;
      if (dhfDSens === "HIGH") dhfStrengthScore += 2;
      else if (dhfDSens === "MEDIUM") dhfStrengthScore += 1;
      if (Math.abs(dhfGSlope) > 2000) dhfStrengthScore += 2;
      else if (Math.abs(dhfGSlope) > 1000) dhfStrengthScore += 1;
      if (dhfExpProb > 0.8) dhfStrengthScore += 2;
      else if (dhfExpProb > 0.5) dhfStrengthScore += 1;
      if (dhfCascade === "HIGH" || dhfCascade === "EXTREME") dhfStrengthScore += 2;
      else if (dhfCascade === "MEDIUM") dhfStrengthScore += 1;
      if (dhfSqProb > 60) dhfStrengthScore += 2;
      else if (dhfSqProb > 30) dhfStrengthScore += 1;
      let hedgingFlowStrength: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" =
        dhfStrengthScore >= 8 ? "EXTREME" : dhfStrengthScore >= 5 ? "HIGH" : dhfStrengthScore >= 3 ? "MEDIUM" : "LOW";

      let hedgingAccelerationRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
      if (dhfIsShortGamma && (dhfDSens === "HIGH" || dhfCascade === "HIGH" || dhfCascade === "EXTREME" || dhfExpProb > 0.7)) {
        hedgingAccelerationRisk = "HIGH";
      } else if (dhfIsShortGamma || (dhfDSens === "HIGH" && dhfExpProb > 0.5)) {
        hedgingAccelerationRisk = "MEDIUM";
      } else if (dhfIsLongGamma) {
        hedgingAccelerationRisk = "LOW";
      }

      let hedgingTriggerZone = "--";
      if (dhfIsLongGamma) {
        if (dhfSpot > dhfDPivot && dhfCW > 0) hedgingTriggerZone = `Near call wall at ${(dhfCW / 1000).toFixed(dhfCW % 1000 === 0 ? 0 : 1)}k`;
        else if (dhfSpot < dhfDPivot && dhfPW > 0) hedgingTriggerZone = `Near put wall at ${(dhfPW / 1000).toFixed(dhfPW % 1000 === 0 ? 0 : 1)}k`;
        else if (dhfDPivot > 0) hedgingTriggerZone = `Around dealer pivot at ${(dhfDPivot / 1000).toFixed(dhfDPivot % 1000 === 0 ? 0 : 1)}k`;
      } else if (dhfIsShortGamma) {
        const nearCliff = dhfCliffs
          .filter((c: any) => c.strike)
          .sort((a: any, b: any) => Math.abs(a.strike - dhfSpot) - Math.abs(b.strike - dhfSpot))[0];
        if (nearCliff) {
          const cliffDir = nearCliff.strike > dhfSpot ? "above" : "below";
          hedgingTriggerZone = `Gamma cliff ${cliffDir} spot at ${(nearCliff.strike / 1000).toFixed(nearCliff.strike % 1000 === 0 ? 0 : 1)}k`;
        } else if (dhfPW > 0 && hedgingFlowDirection === "SELLING") {
          hedgingTriggerZone = `Loss of put wall support at ${(dhfPW / 1000).toFixed(dhfPW % 1000 === 0 ? 0 : 1)}k`;
        } else if (dhfCW > 0 && hedgingFlowDirection === "BUYING") {
          hedgingTriggerZone = `Break above call wall at ${(dhfCW / 1000).toFixed(dhfCW % 1000 === 0 ? 0 : 1)}k`;
        } else {
          hedgingTriggerZone = "Short gamma zone — all strikes active";
        }
      } else {
        if (dhfDPivot > 0) hedgingTriggerZone = `Around dealer pivot at ${(dhfDPivot / 1000).toFixed(dhfDPivot % 1000 === 0 ? 0 : 1)}k`;
      }

      const hedgingFlowSummary: string[] = [];
      if (dhfIsLongGamma) {
        if (hedgingFlowDirection === "BUYING") {
          hedgingFlowSummary.push("Dealers likely buy dips");
          hedgingFlowSummary.push("Hedging flow may stabilize price");
        } else if (hedgingFlowDirection === "SELLING") {
          hedgingFlowSummary.push("Dealers likely sell rallies");
          hedgingFlowSummary.push("Hedging flow caps upside");
        } else {
          hedgingFlowSummary.push("Dealers balanced near pivot");
          hedgingFlowSummary.push("Hedging flow supports range-bound action");
        }
      } else if (dhfIsShortGamma) {
        if (hedgingFlowDirection === "SELLING") {
          hedgingFlowSummary.push("Dealers likely sell weakness");
          hedgingFlowSummary.push("Hedging flow may accelerate downside");
        } else if (hedgingFlowDirection === "BUYING") {
          hedgingFlowSummary.push("Dealers likely chase upside");
          hedgingFlowSummary.push("Hedging flow may accelerate rally");
        } else {
          hedgingFlowSummary.push("Dealers reactive in both directions");
          hedgingFlowSummary.push("Short gamma amplifies any move");
        }
      } else {
        hedgingFlowSummary.push("Dealer hedging direction unclear");
        hedgingFlowSummary.push("Transitional regime — mixed flow signals");
      }
      if (hedgingAccelerationRisk === "HIGH") hedgingFlowSummary.push("Acceleration risk elevated");
      else if (hedgingFlowStrength === "EXTREME") hedgingFlowSummary.push("Extreme hedging pressure detected");
      if (hedgingFlowSummary.length > 4) hedgingFlowSummary.length = 4;

      const dealerHedgingFlowMap = { hedgingFlowDirection, hedgingFlowStrength, hedgingAccelerationRisk, hedgingTriggerZone, hedgingFlowSummary };

      let dominantExpiry: string | null = null;
      if (expiryOiMap.size > 0) {
        const now = new Date();
        const entries = [...expiryOiMap.entries()]
          .map(([exp, oi]) => ({ exp, oi, date: new Date(exp) }))
          .filter(e => !isNaN(e.date.getTime()) && e.date > now)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        const nearestSignificant = entries.find(e => e.oi > 0);
        const largestOi = entries.length > 0 ? entries.reduce((max, e) => e.oi > max.oi ? e : max, entries[0]) : null;
        const chosen = nearestSignificant || largestOi;
        if (chosen) {
          const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
          const d = chosen.date;
          dominantExpiry = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
        }
      }

      return {
        totalGex: totalGex || 0,
        gammaState: totalGex >= 0 ? "LONG GAMMA" : "SHORT GAMMA",
        gammaFlip: gammaFlip || 0, 
        callWall: callWall || 0, 
        putWall: putWall || 0,
        gammaByStrike,
        oiByStrike,
        gammaCurve,
        gammaMagnets,
        shortGammaPockets: shortGammaZones.map(z => ({ start: z.startStrike, end: z.endStrike })),
        vannaBias: totalVanna >= 0 ? "BULLISH" : "BEARISH",
        charmBias: totalCharm >= 0 ? "BULLISH" : "BEARISH",
        dealerGammaState,
        dealerHedgeDirection,
        volatilityRegime,
        dealerFlowScore,
        gammaSlopeByStrike,
        gammaAccelerationByStrike,
        gammaCliffs,
        gammaWallStrength,
        hedgingSpeedScore,
        hedgingStressScore,
        cascadeRisk: (cascadeRisk as string),
        pinningStrength,
        dealerFlowUrgency,
        backtestResults,
        liquidationConfluence,
        marketRegime,
        dealerTrapEngine,
        tradingPlaybook,
        reactionZones,
        gammaCurveEngine,
        volatilityExpansionDetector,
        institutionalBiasEngine,
        tradeDecisionEngine,
        liquidityCascadeEngine,
        squeezeProbabilityEngine,
        marketModeEngine,
        dealerHedgingFlowMap,
        dominantExpiry,
        source: dataSource
      };
    } catch (e) {
      console.error("[DeribitGateway] Summary error:", e);
      return {
        totalGex: 0, gammaState: "LONG GAMMA", gammaFlip: 0,
        callWall: 0, putWall: 0, magnets: [],
        shortGammaPockets: [], vannaBias: "NEUTRAL", charmBias: "NEUTRAL",
        gammaByStrike: [], oiByStrike: [], gammaCurve: [], gammaMagnets: [], shortGammaZones: [],
        dealerGammaState: "LONG_GAMMA", dealerHedgeDirection: "NEUTRAL", volatilityRegime: "TRANSITION", dealerFlowScore: 0,
        tradingPlaybook: {
          currentPlaybook: {
            regime: "TRANSITION",
            expectedBehavior: "Analytics engine error — using fallback",
            volatilityRisk: "MEDIUM",
            directionalBias: "NEUTRAL",
            strategyType: "RANGE_SCALPING"
          },
          tradeZones: { longZones: [], shortZones: [] },
          invalidationLevel: spotPrice ? spotPrice * 0.95 : 0,
          regimeShiftTrigger: "Engine recovery required"
        },
        gammaCurveEngine: {
          gammaSlope: 0,
          gammaCliffs: [],
          dealerSensitivity: "MEDIUM",
          gammaRegimeBand: "TRANSITION"
        },
        volatilityExpansionDetector: {
          volExpansionState: "PRE_BREAKOUT",
          expansionDirection: "NEUTRAL",
          expansionProbability: 0.5,
          playbookShiftSuggested: false,
          suggestedPlaybook: "RANGE_SCALPING",
          expansionTriggerZone: null
        },
        institutionalBiasEngine: {
          institutionalBias: "NEUTRAL_CHOP",
          biasConfidence: 50,
          biasDrivers: ["Analytics engine error", "Using fallback values", "No signal alignment"],
          biasInvalidation: "Bias will update once analytics engine recovers",
          biasHorizon: "INTRADAY"
        },
        tradeDecisionEngine: {
          tradeState: "WAIT",
          tradeDirection: "NEUTRAL",
          entryCondition: "Analytics engine recovery required",
          riskLevel: "MEDIUM",
          positionSizeSuggestion: "NO_TRADE",
          executionReason: ["Analytics engine error", "No signal alignment"]
        },
        liquidityCascadeEngine: {
          cascadeRisk: "LOW",
          cascadeDirection: "NONE",
          cascadeTrigger: "Analytics engine recovery required",
          liquidationPocket: "--",
          cascadeDrivers: ["Analytics engine error", "Using fallback values", "No signal alignment"]
        },
        squeezeProbabilityEngine: {
          squeezeProbability: 0,
          squeezeDirection: "NONE",
          squeezeType: "NONE",
          squeezeTrigger: "Analytics engine recovery required",
          squeezeTarget: "--",
          squeezeDrivers: ["Analytics engine error", "Using fallback values", "No signal alignment"]
        },
        marketModeEngine: {
          marketMode: "FRAGILE_TRANSITION",
          marketModeConfidence: 0,
          marketModeReason: ["Analytics engine error", "Using fallback values"]
        },
        dealerHedgingFlowMap: {
          hedgingFlowDirection: "NEUTRAL",
          hedgingFlowStrength: "LOW",
          hedgingAccelerationRisk: "LOW",
          hedgingTriggerZone: "Analytics engine recovery required",
          hedgingFlowSummary: ["Analytics engine error", "Using fallback values"]
        },
        dominantExpiry: null,
        source: dataSource
      } as any;
    }
  }
}
