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
  reactionZones: z.array(z.object({
    startStrike: z.number(),
    endStrike: z.number(),
    zoneType: z.enum(["PINNING", "TRANSITION", "EXPANSION", "SQUEEZE_RISK"]),
    dealerReaction: z.enum(["BUY_DIPS", "SELL_RALLIES", "BUY_BREAKOUT", "SELL_WEAKNESS"]),
    expectedBehavior: z.enum(["MEAN_REVERSION", "VOLATILITY_EXPANSION", "ACCELERATION_UP", "ACCELERATION_DOWN"]),
    volatilityRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
    tradeBias: z.enum(["LONG", "SHORT", "NEUTRAL"])
  })).optional()
});

export type NormalizedOption = z.infer<typeof normalizedOptionSchema>;
export type OptionsSummary = z.infer<typeof optionsSummarySchema>;

export class DeribitOptionsGateway {
  private static DATA_DIR = path.join(process.cwd(), "attached_assets");

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
        return {
          totalGex: null, gammaState: null, gammaFlip: null,
          callWall: null, putWall: null, magnets: null,
          shortGammaPockets: null, vannaBias: null, charmBias: null,
          gammaByStrike: [], oiByStrike: [], gammaCurve: [], gammaMagnets: [], shortGammaZones: [],
          dealerGammaState: null, dealerHedgeDirection: null, volatilityRegime: null, dealerFlowScore: null
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

      return {
        totalGex: totalGex || null,
        gammaState: totalGex >= 0 ? "LONG GAMMA" : "SHORT GAMMA",
        gammaFlip: gammaFlip || null, 
        callWall: callWall || null, 
        putWall: putWall || null,
        gammaByStrike,
        oiByStrike,
        gammaCurve,
        gammaFlip,
        gammaMagnets,
        shortGammaZones,
        magnets: gammaMagnets, 
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
        reactionZones
      };
    } catch (e) {
      return {
        totalGex: null, gammaState: null, gammaFlip: null,
        callWall: null, putWall: null, magnets: null,
        shortGammaPockets: null, vannaBias: null, charmBias: null,
        gammaByStrike: [], oiByStrike: [], gammaCurve: [], gammaMagnets: [], shortGammaZones: [],
        dealerGammaState: null, dealerHedgeDirection: null, volatilityRegime: null, dealerFlowScore: null
      };
    }
  }
}
