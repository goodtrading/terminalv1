import { z } from "zod";
import { gtInstrumentRefSchema, gtMarketTypeSchema, gtVenueIdSchema } from "./venue";

export const gtExecutionModeSchema = z.enum(["read_only", "paper", "live"]);
export type GTExecutionMode = z.infer<typeof gtExecutionModeSchema>;

export const gtExecutionRouteSchema = z.object({
  chartInstrument: gtInstrumentRefSchema,
  executionInstrument: gtInstrumentRefSchema,
  venue: gtVenueIdSchema,
  executionMarketType: gtMarketTypeSchema,
  mode: gtExecutionModeSchema,
  liveTradingEnabled: z.boolean(),
  accountId: z.string().trim().min(1).max(128).optional(),
  adapterName: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type GTExecutionRoute = z.infer<typeof gtExecutionRouteSchema>;
