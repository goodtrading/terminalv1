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
  volatilityExpansionDetector: z.object({
    volExpansionState: z.enum(["COMPRESSING", "PRE_BREAKOUT", "EXPANDING"]),
    expansionDirection: z.enum(["UP", "DOWN", "NEUTRAL"]),
    expansionProbability: z.number(),
    playbookShiftSuggested: z.boolean(),
    suggestedPlaybook: z.enum(["RANGE_SCALPING", "FADE_EXTREMES", "MOMENTUM_BREAKOUT", "VOLATILITY_EXPANSION", "LIQUIDITY_SWEEP_REVERSAL"]),
    expansionTriggerZone: z.object({ start: z.number(), end: z.number() }).nullable()
  }).optional()
});

export type NormalizedOption = z.infer<typeof normalizedOptionSchema>;
export type OptionsSummary = z.infer<typeof optionsSummarySchema>;

export class DeribitOptionsGateway {
  private static DATA_DIR = path.join(process.cwd(), "attached_assets");
  private static observations: any[] = [];

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

      console.log(`[DeribitGateway] Valid rows: ${validCount}, Rejected: ${rejectedCount}`);
      return normalizedRecords;
    } catch (e) {
      console.error("[DeribitGateway] Ingestion error:", e);
      return [];
    }
  }

  static async getSummary(options: NormalizedOption[], spotPrice?: number): Promise<OptionsSummary> {
    try {
      if (options.length === 0) {
        const fallbackPlaybook = {
          currentPlaybook: {
            regime: "TRANSITION" as const,
            expectedBehavior: "Insufficient options data — awaiting CSV ingestion",
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
          tradingPlaybook: fallbackPlaybook
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
        reactionZones
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
        }
      } as any;
    }
  }
}
