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

  static async ingestLatestCSV(): Promise<NormalizedOption[]> {
    try {
      const files = fs.readdirSync(this.DATA_DIR).filter(f => f.endsWith(".csv"));
      if (files.length === 0) return [];
      
      const latestFile = path.join(this.DATA_DIR, files.sort().reverse()[0]);
      const content = fs.readFileSync(latestFile, "utf-8");
      
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      return records.map((row: any, index: number) => {
        try {
          // Mapping "ABRIR" to openInterest as per requirements
          const openInterest = parseFloat(row["ABRIR"] || row["openInterest"] || "0");
          const strike = parseFloat(row["strike"] || row["Strike"] || "0");
          const optionType = (row["optionType"] || row["Type"] || "").toLowerCase();
          const expiry = row["expiry"] || row["Expiration"] || "";

          if (isNaN(strike) || !expiry || !["call", "put"].includes(optionType) || isNaN(openInterest)) {
            console.warn(`[DeribitGateway] Skipping malformed row ${index}:`, row);
            return null;
          }

          return normalizedOptionSchema.parse({
            strike,
            expiry,
            optionType: optionType as "call" | "put",
            openInterest,
            gammaExposure: row["gammaExposure"] ? parseFloat(row["gammaExposure"]) : undefined,
            vannaExposure: row["vannaExposure"] ? parseFloat(row["vannaExposure"]) : undefined,
            charmExposure: row["charmExposure"] ? parseFloat(row["charmExposure"]) : undefined
          });
        } catch (e) {
          console.error(`[DeribitGateway] Validation failed for row ${index}:`, e);
          return null;
        }
      }).filter((r: any): r is NormalizedOption => r !== null);
    } catch (e) {
      console.error("[DeribitGateway] Ingestion error:", e);
      throw e;
    }
  }

  static async getSummary(options: NormalizedOption[]): Promise<OptionsSummary> {
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

    // Basic Summary Computation
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
      gammaFlip: null, // Requires spot price context not present in CSV
      callWall: callWall || null,
      putWall: putWall || null,
      magnets: null, // Requires advanced clustering logic
      shortGammaPockets: null,
      vannaBias: null,
      charmBias: null
    };
  }
}
