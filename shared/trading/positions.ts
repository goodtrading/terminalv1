import { z } from "zod";
import { gtInstrumentRefSchema, timestampMsSchema } from "./venue";

export const gtPositionSideSchema = z.enum(["LONG", "SHORT", "FLAT"]);
export type GTPositionSide = z.infer<typeof gtPositionSideSchema>;

const gtPositionBaseSchema = z.object({
  instrument: gtInstrumentRefSchema,
  side: gtPositionSideSchema,
  quantity: z.number().finite().nonnegative(),
  averageEntryPrice: z.number().finite().positive().optional(),
  markPrice: z.number().finite().positive().optional(),
  realizedPnl: z.number().finite(),
  unrealizedPnl: z.number().finite(),
  openedAt: timestampMsSchema.optional(),
  updatedAt: timestampMsSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const gtPositionSchema = gtPositionBaseSchema.superRefine((position: z.infer<typeof gtPositionBaseSchema>, ctx) => {
  if (position.side === "FLAT" && position.quantity !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "FLAT position must have zero quantity" });
  }
  if (position.side !== "FLAT" && position.quantity <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "LONG/SHORT position must have positive quantity" });
  }
});
export type GTPosition = z.infer<typeof gtPositionSchema>;

export const gtPositionEventTypeSchema = z.enum(["OPENED", "INCREASED", "REDUCED", "FLIPPED", "CLOSED", "UPDATED"]);
export type GTPositionEventType = z.infer<typeof gtPositionEventTypeSchema>;

export const gtPositionEventSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  eventType: gtPositionEventTypeSchema,
  occurredAt: timestampMsSchema,
  position: gtPositionSchema,
  metadata: z.record(z.unknown()).optional(),
});
export type GTPositionEvent = z.infer<typeof gtPositionEventSchema>;
