import { z } from "zod";
import { gtInstrumentRefSchema, timestampMsSchema } from "./venue";

export const gtTradeAggressorSideSchema = z.enum(["BUY", "SELL", "UNKNOWN"]);
export type GTTradeAggressorSide = z.infer<typeof gtTradeAggressorSideSchema>;

export const gtTradeSchema = z.object({
  instrument: gtInstrumentRefSchema,
  price: z.number().finite().positive(),
  quantity: z.number().finite().positive(),
  aggressorSide: gtTradeAggressorSideSchema,
  exchangeTimestamp: timestampMsSchema,
  receivedTimestamp: timestampMsSchema,
  tradeId: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type GTTrade = z.infer<typeof gtTradeSchema>;

export const gtQuoteSchema = z.object({
  instrument: gtInstrumentRefSchema,
  bidPrice: z.number().finite().nonnegative(),
  bidSize: z.number().finite().nonnegative(),
  askPrice: z.number().finite().nonnegative(),
  askSize: z.number().finite().nonnegative(),
  exchangeTimestamp: timestampMsSchema,
  receivedTimestamp: timestampMsSchema,
  sequence: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type GTQuote = z.infer<typeof gtQuoteSchema>;

export const gtCandleSchema = z.object({
  instrument: gtInstrumentRefSchema,
  timeframe: z.string().trim().min(1).max(32),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: z.number().finite().nonnegative(),
  openTimestamp: timestampMsSchema,
  closeTimestamp: timestampMsSchema,
  metadata: z.record(z.unknown()).optional(),
});
export type GTCandle = z.infer<typeof gtCandleSchema>;

export const gtBookLevelSchema = z.object({
  price: z.number().finite().nonnegative(),
  quantity: z.number().finite().nonnegative(),
});
export type GTBookLevel = z.infer<typeof gtBookLevelSchema>;

export const gtBookSideSchema = z.enum(["bid", "ask"]);
export type GTBookSide = z.infer<typeof gtBookSideSchema>;

export const gtBookDeltaActionSchema = z.enum(["insert", "update", "delete"]);
export type GTBookDeltaAction = z.infer<typeof gtBookDeltaActionSchema>;

export const gtBookDeltaSchema = z.object({
  instrument: gtInstrumentRefSchema,
  side: gtBookSideSchema,
  price: z.number().finite().nonnegative(),
  quantity: z.number().finite().nonnegative(),
  action: gtBookDeltaActionSchema,
  sequence: z.number().int().nonnegative().optional(),
  exchangeTimestamp: timestampMsSchema,
  receivedTimestamp: timestampMsSchema,
  metadata: z.record(z.unknown()).optional(),
});
export type GTBookDelta = z.infer<typeof gtBookDeltaSchema>;

export const gtBookSnapshotSchema = z.object({
  instrument: gtInstrumentRefSchema,
  bids: z.array(gtBookLevelSchema),
  asks: z.array(gtBookLevelSchema),
  sequence: z.number().int().nonnegative().optional(),
  exchangeTimestamp: timestampMsSchema,
  receivedTimestamp: timestampMsSchema,
  metadata: z.record(z.unknown()).optional(),
});
export type GTBookSnapshot = z.infer<typeof gtBookSnapshotSchema>;
