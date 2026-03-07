import { z } from "zod";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

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
  magnets: z.array(z.number()).nullable(),
  shortGammaPockets: z.array(z.object({ start: z.number(), end: z.number() })).nullable(),
  vannaBias: z.enum(["BULLISH", "BEARISH"]).nullable(),
  charmBias: z.enum(["BULLISH", "BEARISH"]).nullable()
});

export type NormalizedOption = z.infer<typeof normalizedOptionSchema>;
export type OptionsSummary = z.infer<typeof optionsSummarySchema>;

export class DeribitOptionsGateway {
  private static DATA_DIR = path.join(process.cwd(), "attached_assets");

  private static normalizeHeader(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  static async ingestLatestCSV(): Promise<NormalizedOption[]> {
    try {
      if (!fs.existsSync(this.DATA_DIR)) {
        console.warn(`[DeribitGateway] Data directory not found: ${this.DATA_DIR}`);
        return [];
      }

      const files = fs.readdirSync(this.DATA_DIR).filter(f => f.endsWith(".csv"));
      if (files.length === 0) return [];
      
      const latestFile = path.join(this.DATA_DIR, files.sort().reverse()[0]);
      console.log(`[DeribitGateway] Ingesting: ${latestFile}`);
      const content = fs.readFileSync(latestFile, "utf-8");
      
      const records = parse(content, {
        columns: (header: string[]) => {
          const normalized = header.map(this.normalizeHeader);
          console.log(`[DeribitGateway] Headers detected:`, header);
          console.log(`[DeribitGateway] Headers normalized:`, normalized);
          return normalized;
        },
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });

      let validCount = 0;
      let rejectedCount = 0;

      const normalizedRecords = records.map((row: any, index: number) => {
        try {
          // Robust mapping for "Abrir" / "Open Interest"
          const oiValue = row["abrir"] || row["openinterest"] || row["open_interest"] || "0";
          const openInterest = parseFloat(oiValue.replace(/,/g, ''));
          
          // Strike mapping
          const strikeValue = row["strike"] || row["huelga"] || "0";
          const strike = parseFloat(strikeValue.replace(/,/g, ''));

          // Option Type mapping (from instrument name if needed)
          let optionType = (row["optiontype"] || row["tipo"] || "").toLowerCase();
          const instrument = (row["instrumento"] || row["instrument"] || "").toUpperCase();

          if (!optionType && instrument) {
            if (instrument.endsWith("-C") || instrument.includes("-CALL-")) optionType = "call";
            else if (instrument.endsWith("-P") || instrument.includes("-PUT-")) optionType = "put";
          }

          // Expiry mapping
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
            gammaExposure: row["gamma"] || row["gamma_exposure"] ? parseFloat(row["gamma"] || row["gamma_exposure"]) : undefined,
            vannaExposure: row["vanna"] || row["vanna_exposure"] ? parseFloat(row["vanna"] || row["vanna_exposure"]) : undefined,
            charmExposure: row["charm"] || row["charm_exposure"] ? parseFloat(row["charm"] || row["charm_exposure"]) : undefined
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
      return []; // Graceful failure
    }
  }

  static async getSummary(options: NormalizedOption[]): Promise<OptionsSummary> {
    try {
      if (options.length === 0) {
        return {
          totalGex: null,
          gammaState: null,
          gammaFlip: null,
          callWall: null,
          putWall: null,
          magnets: null,
          shortGammaPockets: null,
          vannaBias: null,
          charmBias: null
        };
      }

      let totalGex = 0;
      let callWall = 0;
      let putWall = 0;
      let maxCallOi = 0;
      let maxPutOi = 0;

      options.forEach(opt => {
        if (opt.gammaExposure) totalGex += opt.gammaExposure;
        
        if (opt.optionType === "call") {
          if (opt.openInterest > maxCallOi) {
            maxCallOi = opt.openInterest;
            callWall = opt.strike;
          }
        } else {
          if (opt.openInterest > maxPutOi) {
            maxPutOi = opt.openInterest;
            putWall = opt.strike;
          }
        }
      });

      return {
        totalGex: totalGex || null,
        gammaState: totalGex >= 0 ? "LONG GAMMA" : "SHORT GAMMA",
        gammaFlip: null,
        callWall: callWall || null,
        putWall: putWall || null,
        magnets: null,
        shortGammaPockets: null,
        vannaBias: null,
        charmBias: null
      };
    } catch (e) {
      console.error("[DeribitGateway] Summary error:", e);
      return {
        totalGex: null,
        gammaState: null,
        gammaFlip: null,
        callWall: null,
        putWall: null,
        magnets: null,
        shortGammaPockets: null,
        vannaBias: null,
        charmBias: null
      };
    }
  }
}
