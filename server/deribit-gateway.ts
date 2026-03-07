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
          source: dataSource
        };
      }

      let totalGex = 0, callWall = 0, putWall = 0, maxCallOi = 0, maxPutOi = 0;
      let totalVanna = 0, totalCharm = 0;
      const strikeMap = new Map<number, { gex: number, oi: number }>();

      options.forEach(opt => {
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
        source: dataSource
      } as any;
    }
  }
}
