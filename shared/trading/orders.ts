import { z } from "zod";
import { gtInstrumentRefSchema, timestampMsSchema } from "./venue";

export const gtOrderSideSchema = z.enum(["BUY", "SELL"]);
export type GTOrderSide = z.infer<typeof gtOrderSideSchema>;

export const gtOrderTypeSchema = z.enum([
  "MARKET",
  "LIMIT",
  "STOP_MARKET",
  "STOP_LIMIT",
  "MARKET_IF_TOUCHED",
  "LIMIT_IF_TOUCHED",
  "TRAILING_STOP",
]);
export type GTOrderType = z.infer<typeof gtOrderTypeSchema>;

export const gtTimeInForceSchema = z.enum(["GTC", "IOC", "FOK", "GTD", "DAY"]);
export type GTTimeInForce = z.infer<typeof gtTimeInForceSchema>;

export const gtOrderRelationSchema = z.enum(["TP", "SL", "OCO", "BRACKET"]);
export type GTOrderRelation = z.infer<typeof gtOrderRelationSchema>;

export const gtOrderAttachedLegSchema = z.object({
  relation: gtOrderRelationSchema,
  clientOrderId: z.string().trim().min(1).max(128).optional(),
  quantity: z.number().finite().positive().optional(),
  price: z.number().finite().positive().optional(),
  triggerPrice: z.number().finite().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type GTOrderAttachedLeg = z.infer<typeof gtOrderAttachedLegSchema>;

const gtOrderIntentBaseSchema = z.object({
  clientOrderId: z.string().trim().min(1).max(128),
  instrument: gtInstrumentRefSchema,
  side: gtOrderSideSchema,
  orderType: gtOrderTypeSchema,
  quantity: z.number().finite().positive(),
  price: z.number().finite().positive().optional(),
  triggerPrice: z.number().finite().positive().optional(),
  trailingDistance: z.number().finite().positive().optional(),
  timeInForce: gtTimeInForceSchema.optional(),
  reduceOnly: z.boolean().optional(),
  postOnly: z.boolean().optional(),
  strategyId: z.string().trim().min(1).max(128).optional(),
  playbookId: z.string().trim().min(1).max(128).optional(),
  setupId: z.string().trim().min(1).max(128).optional(),
  attachedOrders: z.array(gtOrderAttachedLegSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const gtOrderIntentSchema = gtOrderIntentBaseSchema.superRefine((order, ctx) => {
  const needsPrice = order.orderType === "LIMIT" || order.orderType === "STOP_LIMIT" || order.orderType === "LIMIT_IF_TOUCHED";
  const needsTrigger = order.orderType === "STOP_MARKET" || order.orderType === "STOP_LIMIT" || order.orderType === "MARKET_IF_TOUCHED";
  const needsTrail = order.orderType === "TRAILING_STOP";

  if (needsPrice && order.price == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: `${order.orderType} requires price` });
  }
  if (!needsPrice && order.price != null && order.orderType === "MARKET") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "MARKET order does not use limit price" });
  }
  if (needsTrigger && order.triggerPrice == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["triggerPrice"], message: `${order.orderType} requires triggerPrice` });
  }
  if (needsTrail && order.trailingDistance == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trailingDistance"], message: "TRAILING_STOP requires trailingDistance" });
  }
});
export type GTOrderIntent = z.infer<typeof gtOrderIntentSchema>;

export const gtOrderLifecycleStateSchema = z.enum([
  "CREATED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCEL_PENDING",
  "CANCELED",
  "EXPIRED",
]);
export type GTOrderLifecycleState = z.infer<typeof gtOrderLifecycleStateSchema>;

export const gtOrderTimestampsSchema = z.object({
  createdAt: timestampMsSchema,
  updatedAt: timestampMsSchema,
  submittedAt: timestampMsSchema.optional(),
  acceptedAt: timestampMsSchema.optional(),
  firstFillAt: timestampMsSchema.optional(),
  lastFillAt: timestampMsSchema.optional(),
  canceledAt: timestampMsSchema.optional(),
  expiredAt: timestampMsSchema.optional(),
  rejectedAt: timestampMsSchema.optional(),
  completedAt: timestampMsSchema.optional(),
});
export type GTOrderTimestamps = z.infer<typeof gtOrderTimestampsSchema>;

const gtOrderStateBaseSchema = z.object({
  clientOrderId: z.string().trim().min(1).max(128),
  venueOrderId: z.string().trim().min(1).max(128).optional(),
  instrument: gtInstrumentRefSchema,
  side: gtOrderSideSchema,
  orderType: gtOrderTypeSchema,
  quantity: z.number().finite().positive(),
  filledQuantity: z.number().finite().nonnegative(),
  remainingQuantity: z.number().finite().nonnegative(),
  averageFillPrice: z.number().finite().positive().optional(),
  status: gtOrderLifecycleStateSchema,
  reason: z.string().trim().min(1).max(512).optional(),
  timestamps: gtOrderTimestampsSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const gtOrderStateSchema = gtOrderStateBaseSchema.superRefine((state: z.infer<typeof gtOrderStateBaseSchema>, ctx) => {
  if (state.filledQuantity > state.quantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["filledQuantity"], message: "filledQuantity cannot exceed quantity" });
  }
  if (state.remainingQuantity > state.quantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["remainingQuantity"], message: "remainingQuantity cannot exceed quantity" });
  }
  const delta = Math.abs(state.quantity - state.filledQuantity - state.remainingQuantity);
  if (delta > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["remainingQuantity"], message: "filledQuantity + remainingQuantity must equal quantity" });
  }
});
export type GTOrderState = z.infer<typeof gtOrderStateSchema>;

const gtOrderEventBaseSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  eventType: gtOrderLifecycleStateSchema,
  occurredAt: timestampMsSchema,
  clientOrderId: z.string().trim().min(1).max(128),
  venueOrderId: z.string().trim().min(1).max(128).optional(),
  instrument: gtInstrumentRefSchema,
  side: gtOrderSideSchema,
  orderType: gtOrderTypeSchema,
  quantity: z.number().finite().positive(),
  filledQuantity: z.number().finite().nonnegative(),
  remainingQuantity: z.number().finite().nonnegative(),
  averageFillPrice: z.number().finite().positive().optional(),
  reason: z.string().trim().min(1).max(512).optional(),
  timestamps: gtOrderTimestampsSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const gtOrderEventSchema = gtOrderEventBaseSchema.superRefine((event: z.infer<typeof gtOrderEventBaseSchema>, ctx) => {
  if (event.filledQuantity > event.quantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["filledQuantity"], message: "filledQuantity cannot exceed quantity" });
  }
  if (event.remainingQuantity > event.quantity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["remainingQuantity"], message: "remainingQuantity cannot exceed quantity" });
  }
  const delta = Math.abs(event.quantity - event.filledQuantity - event.remainingQuantity);
  if (delta > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["remainingQuantity"], message: "filledQuantity + remainingQuantity must equal quantity" });
  }
});
export type GTOrderEvent = z.infer<typeof gtOrderEventSchema>;
