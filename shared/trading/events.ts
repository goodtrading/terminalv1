import { z } from "zod";
import { timestampMsSchema } from "./venue";

export const gtTradingEventSourceSchema = z.enum([
  "ui",
  "intelligence",
  "bridge",
  "engine",
  "adapter",
  "market_data",
  "reporting",
]);
export type GTTradingEventSource = z.infer<typeof gtTradingEventSourceSchema>;

export const gtTradingEventTypeSchema = z.enum([
  "market.trade",
  "market.quote",
  "market.candle",
  "market.book_delta",
  "market.book_snapshot",
  "order.created",
  "order.submitted",
  "order.accepted",
  "order.rejected",
  "order.partially_filled",
  "order.filled",
  "order.canceled",
  "position.opened",
  "position.changed",
  "position.closed",
  "account.updated",
  "execution.quality",
]);
export type GTTradingEventType = z.infer<typeof gtTradingEventTypeSchema>;

export interface GTTradingEvent<TPayload = unknown, TEventType extends string = GTTradingEventType> {
  schemaVersion: 1;
  eventId: string;
  eventType: TEventType;
  occurredAt: number;
  source: GTTradingEventSource;
  payload: TPayload;
}

export function createGTTradingEventSchema<TPayloadSchema extends z.ZodTypeAny, TEventTypeSchema extends z.ZodTypeAny = typeof gtTradingEventTypeSchema>(
  payloadSchema: TPayloadSchema,
  eventTypeSchema?: TEventTypeSchema,
) {
  const resolvedEventTypeSchema = eventTypeSchema ?? gtTradingEventTypeSchema;
  return z.object({
    schemaVersion: z.literal(1),
    eventId: z.string().trim().min(1).max(128),
    eventType: resolvedEventTypeSchema,
    occurredAt: timestampMsSchema,
    source: gtTradingEventSourceSchema,
    payload: payloadSchema,
  });
}

export const gtTradingEventEnvelopeSchema = createGTTradingEventSchema(z.unknown());
export type GTTradingEventEnvelope = z.infer<typeof gtTradingEventEnvelopeSchema>;
