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
  magnets: z.array(z.number()).nullable(),
  shortGammaPockets: z.array(z.object({ start: z.number(), end: z.number() })).nullable(),
  vannaBias: z.enum(["BULLISH", "BEARISH"]).nullable(),
  charmBias: z.enum(["BULLISH", "BEARISH"]).nullable()
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

  static async getSummary(options: NormalizedOption[]): Promise<OptionsSummary> {
    try {
      if (options.length === 0) {
        return {
          totalGex: null, gammaState: null, gammaFlip: null,
          callWall: null, putWall: null, magnets: null,
          shortGammaPockets: null, vannaBias: null, charmBias: null,
          gammaByStrike: [], oiByStrike: []
        };
      }

      let totalGex = 0, callWall = 0, putWall = 0, maxCallOi = 0, maxPutOi = 0;
      const strikeMap = new Map<number, { gex: number, oi: number }>();

      options.forEach(opt => {
        // Global GEX
        if (opt.gammaExposure) totalGex += opt.gammaExposure;

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

      return {
        totalGex: totalGex || null,
        gammaState: totalGex >= 0 ? "LONG GAMMA" : "SHORT GAMMA",
        gammaFlip: null, 
        callWall: callWall || null, 
        putWall: putWall || null,
        gammaByStrike,
        oiByStrike,
        magnets: null, 
        shortGammaPockets: null, 
        vannaBias: null, 
        charmBias: null
      };
    } catch (e) {
      return {
        totalGex: null, gammaState: null, gammaFlip: null,
        callWall: null, putWall: null, magnets: null,
        shortGammaPockets: null, vannaBias: null, charmBias: null,
        gammaByStrike: [], oiByStrike: []
      };
    }
  }
}
