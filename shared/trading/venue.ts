import { z } from "zod";

export const timestampMsSchema = z.number().finite().int().nonnegative();
export type TimestampMs = z.infer<typeof timestampMsSchema>;

export const gtVenueIdSchema = z.string().trim().min(1).max(128);
export type GTVenueId = z.infer<typeof gtVenueIdSchema>;

export const gtMarketTypeSchema = z.enum(["spot", "perpetual", "future", "option"]);
export type GTMarketType = z.infer<typeof gtMarketTypeSchema>;

export const gtInstrumentRefSchema = z.object({
  venue: gtVenueIdSchema,
  marketType: gtMarketTypeSchema,
  symbol: z.string().trim().min(1).max(128),
  baseAsset: z.string().trim().min(1).max(64),
  quoteAsset: z.string().trim().min(1).max(64),
  exchangeNativeSymbol: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type GTInstrumentRef = z.infer<typeof gtInstrumentRefSchema>;

export const gtInstrumentIdSchema = z.string().trim().min(1).max(256);
export type GTInstrumentId = z.infer<typeof gtInstrumentIdSchema>;

export function makeGTInstrumentId(ref: Pick<GTInstrumentRef, "venue" | "marketType" | "symbol" | "exchangeNativeSymbol">): GTInstrumentId {
  return [ref.venue, ref.marketType, ref.exchangeNativeSymbol ?? ref.symbol]
    .map((part) => encodeURIComponent(part))
    .join("::");
}
