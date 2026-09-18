import assert from "node:assert/strict";

export type NautilusPaperOrderEventEvidence = Readonly<{
  eventId: string;
  eventType: string;
  tsEventNs: string;
  tsInitNs: string;
  environment: "PAPER";
  source: "NAUTILUS_PAPER";
  clientOrderId?: string;
  venueOrderId?: string;
  tradeId?: string;
  positionId?: string;
  side?: string;
  orderType?: string;
  quantity?: string;
  price?: string;
  triggerPrice?: string;
  liquiditySide?: string;
  reduceOnly?: boolean;
  reduceOnlySource: "EVENT_FACTUAL" | "ORDER_FACTUAL" | "NOT_AVAILABLE";
  tags: string[];
  tagsSource: "EVENT_FACTUAL" | "ORDER_FACTUAL" | "NOT_AVAILABLE";
  contingencyType?: string;
  orderListId?: string | null;
  linkedOrderIds: string[];
  parentOrderId?: string | null;
  reason?: string | null;
}>;

const INTEGER = /^[0-9]+$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const EVENT_TYPES = new Set(["OrderInitialized", "OrderSubmitted", "OrderAccepted", "OrderFilled", "OrderCanceled"]);

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`INVALID_${field}`);
  return value;
}

function optionalNullableText(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  if (typeof value !== "string" || value.trim() === "") throw new Error(`INVALID_${field}`);
  return value;
}

function exactDecimal(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field);
  if (text !== undefined && !DECIMAL.test(text)) throw new Error(`INVALID_${field}`);
  return text;
}

export function validateNautilusPaperOrderEventEvidence(input: unknown): NautilusPaperOrderEventEvidence {
  assert(input && typeof input === "object", "INVALID_EVENT");
  const value = input as Record<string, unknown>;
  const eventId = optionalText(value.eventId, "eventId");
  const eventType = optionalText(value.eventType, "eventType");
  const tsEventNs = optionalText(value.tsEventNs, "tsEventNs");
  const tsInitNs = optionalText(value.tsInitNs, "tsInitNs");
  if (!eventId || !eventType || !tsEventNs || !tsInitNs) throw new Error("REQUIRED_EVENT_FIELDS");
  if (!EVENT_TYPES.has(eventType)) throw new Error(`UNSUPPORTED_EVENT_TYPE:${eventType}`);
  if (!INTEGER.test(tsEventNs) || !INTEGER.test(tsInitNs)) throw new Error("INVALID_EVENT_TIMESTAMP");
  if (value.environment !== "PAPER" || value.source !== "NAUTILUS_PAPER") throw new Error("PROVENANCE_NOT_NAUTILUS_PAPER");
  const reduceOnlySource = value.reduceOnlySource;
  const tagsSource = value.tagsSource;
  if (!["EVENT_FACTUAL", "ORDER_FACTUAL", "NOT_AVAILABLE"].includes(String(reduceOnlySource))) throw new Error("INVALID_REDUCE_ONLY_SOURCE");
  if (!["EVENT_FACTUAL", "ORDER_FACTUAL", "NOT_AVAILABLE"].includes(String(tagsSource))) throw new Error("INVALID_TAGS_SOURCE");
  if (value.reduceOnly !== undefined && typeof value.reduceOnly !== "boolean") throw new Error("INVALID_REDUCE_ONLY");
  if (!Array.isArray(value.tags) || !value.tags.every((item) => typeof item === "string")) throw new Error("INVALID_TAGS");
  if (!Array.isArray(value.linkedOrderIds) || !value.linkedOrderIds.every((item) => typeof item === "string")) throw new Error("INVALID_LINKED_ORDER_IDS");
  return {
    eventId, eventType, tsEventNs, tsInitNs, environment: "PAPER", source: "NAUTILUS_PAPER",
    clientOrderId: optionalText(value.clientOrderId, "clientOrderId"),
    venueOrderId: optionalText(value.venueOrderId, "venueOrderId"),
    tradeId: optionalText(value.tradeId, "tradeId"),
    positionId: optionalText(value.positionId, "positionId"),
    side: optionalText(value.side, "side"),
    orderType: optionalText(value.orderType, "orderType"),
    quantity: exactDecimal(value.quantity, "quantity"),
    price: exactDecimal(value.price, "price"),
    triggerPrice: exactDecimal(value.triggerPrice, "triggerPrice"),
    liquiditySide: optionalText(value.liquiditySide, "liquiditySide"),
    reduceOnly: value.reduceOnly as boolean | undefined,
    reduceOnlySource: reduceOnlySource as NautilusPaperOrderEventEvidence["reduceOnlySource"],
    tags: [...(value.tags as string[])],
    tagsSource: tagsSource as NautilusPaperOrderEventEvidence["tagsSource"],
    contingencyType: optionalText(value.contingencyType, "contingencyType"),
    orderListId: optionalNullableText(value.orderListId, "orderListId"),
    linkedOrderIds: [...(value.linkedOrderIds as string[])],
    parentOrderId: optionalNullableText(value.parentOrderId, "parentOrderId"),
    reason: optionalNullableText(value.reason, "reason"),
  };
}
