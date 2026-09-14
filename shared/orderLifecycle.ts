import type { AccountIdentity } from "./portfolioState";
import type { ExecutionMarketIdentity } from "./marketTruth";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP_MARKET";
export type OrderTimeInForce = "GTC";

export type OrderStatus =
  | "CREATED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_PENDING"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";

export type OrderEventType =
  | "ORDER_CREATED"
  | "ORDER_SUBMITTED"
  | "ORDER_ACCEPTED"
  | "FILL"
  | "PARTIAL_FILL"
  | "ORDER_FILLED"
  | "CANCEL_REQUESTED"
  | "ORDER_CANCELED"
  | "ORDER_REJECTED"
  | "ORDER_EXPIRED"
  | "REPLACE_REQUESTED"
  | "ORDER_REPLACED"
  | "TRIGGERED";

export type OrderSyncQuality = "CONFIRMED" | "PARTIAL" | "STALE" | "UNKNOWN" | "DISCONNECTED";

export type OrderIdentity = Readonly<{
  account: AccountIdentity;
  market: ExecutionMarketIdentity;
  canonicalOrderId: string;
  clientOrderId?: string;
  venueOrderId?: string;
}>;

export type OrderIntent = Readonly<{
  account: AccountIdentity;
  market: ExecutionMarketIdentity;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice: number | null;
  triggerPrice: number | null;
  timeInForce: OrderTimeInForce;
  reduceOnly: boolean;
  postOnly: boolean;
  sourceMetadata?: Readonly<Record<string, unknown>>;
}>;

export type OrderExecutionReference = Readonly<{
  executionId: string;
  clientOrderId?: string;
  venueOrderId?: string;
  eventTime?: number | null;
  receiveTime?: number | null;
}>;

export type OrderRelationType = "REPLACES" | "REPLACED_BY";
export type OrderRelationReference = Readonly<{
  relationType: OrderRelationType;
  canonicalOrderId: string;
}>;

export type OrderTerminalReason = Readonly<{
  code?: string;
  message?: string;
  source?: string;
}>;

export type OrderTimestamps = Readonly<{
  createdAt?: number | null;
  submittedAt?: number | null;
  acceptedAt?: number | null;
  updatedAt?: number | null;
  canceledAt?: number | null;
  completedAt?: number | null;
}>;

export type OrderProvenance = Readonly<{
  source: string;
  runtime?: string;
  broker?: string;
  account?: AccountIdentity;
  market?: ExecutionMarketIdentity;
  clientOrderId?: string;
  venueOrderId?: string;
  canonicalOrderId?: string;
  nativeStatus?: string;
  nativeOrderType?: string;
  sourceSnapshotId?: string | number;
  upstream?: unknown;
}>;

export type OrderState = Readonly<{
  identity: OrderIdentity;
  intent: OrderIntent;
  status: OrderStatus;
  requestedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice: number | null;
  timestamps: OrderTimestamps;
  terminalReason?: OrderTerminalReason;
  executionReferences: readonly OrderExecutionReference[];
  relationships: readonly OrderRelationReference[];
  syncQuality: OrderSyncQuality;
  provenance: OrderProvenance;
}>;

export type OrderEvent = Readonly<{
  eventId: string;
  orderIdentity: OrderIdentity;
  eventType: OrderEventType;
  eventTime: number;
  receiveTime?: number | null;
  sourceSequence?: number | string | null;
  statusBefore?: OrderStatus;
  statusAfter?: OrderStatus;
  executionReference?: OrderExecutionReference;
  reason?: OrderTerminalReason;
  provenance: OrderProvenance;
}>;

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

function requiredText(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} is required`);
  return value;
}

function finiteNonNegative(value: number | null | undefined, name: string): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error(`${name} must be finite and non-negative`);
}

function validateIdentity(value: OrderIdentity): void {
  if (!value?.account || !value.market) throw new Error("account and market are required");
  requiredText(value.account.accountId, "account.accountId");
  requiredText(value.account.broker, "account.broker");
  requiredText(value.market.instrument, "market.instrument");
  requiredText(value.market.venue, "market.venue");
  if (value.market.marketType !== "Spot" && value.market.marketType !== "Perpetual") throw new Error("market.marketType is invalid");
  requiredText(value.canonicalOrderId, "canonicalOrderId");
  if (value.clientOrderId != null) requiredText(value.clientOrderId, "clientOrderId");
  if (value.venueOrderId != null) requiredText(value.venueOrderId, "venueOrderId");
}

function sameScope(a: { account: AccountIdentity; market: ExecutionMarketIdentity }, b: { account: AccountIdentity; market: ExecutionMarketIdentity }): boolean {
  return a.account.accountId === b.account.accountId
    && a.account.broker === b.account.broker
    && a.account.environment === b.account.environment
    && a.market.instrument === b.market.instrument
    && a.market.venue === b.market.venue
    && a.market.marketType === b.market.marketType;
}

export function createOrderIdentity(input: OrderIdentity): OrderIdentity {
  validateIdentity(input);
  return clone(input);
}

export function createOrderIntent(input: OrderIntent): OrderIntent {
  if (!input?.account || !input.market) throw new Error("account and market are required");
  requiredText(input.account.accountId, "account.accountId");
  requiredText(input.market.instrument, "market.instrument");
  requiredText(input.market.venue, "market.venue");
  if (input.market.marketType !== "Spot" && input.market.marketType !== "Perpetual") throw new Error("market.marketType is invalid");
  if (input.side !== "BUY" && input.side !== "SELL") throw new Error("side is invalid");
  if (!["MARKET", "LIMIT", "STOP_MARKET"].includes(input.orderType)) throw new Error("orderType is invalid");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("quantity must be finite and positive");
  if (input.timeInForce !== "GTC") throw new Error("timeInForce must be GTC");
  if (typeof input.reduceOnly !== "boolean" || typeof input.postOnly !== "boolean") throw new Error("reduceOnly and postOnly are required booleans");
  if (input.orderType === "MARKET" && input.limitPrice != null) throw new Error("MARKET cannot have limitPrice");
  if (input.orderType === "LIMIT" && (!Number.isFinite(input.limitPrice) || input.limitPrice <= 0)) throw new Error("LIMIT requires positive limitPrice");
  if (input.orderType === "STOP_MARKET" && (!Number.isFinite(input.triggerPrice) || input.triggerPrice <= 0)) throw new Error("STOP_MARKET requires positive triggerPrice");
  if (input.orderType !== "STOP_MARKET" && input.triggerPrice != null) throw new Error(`${input.orderType} cannot have triggerPrice`);
  if (input.orderType === "STOP_MARKET" && input.reduceOnly !== true) throw new Error("STOP_MARKET requires reduceOnly for canonical PAPER");
  if (input.sourceMetadata !== undefined) clone(input.sourceMetadata);
  return clone(input);
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === "FILLED" || status === "CANCELED" || status === "REJECTED" || status === "EXPIRED";
}

export function createOrderState(input: OrderState): OrderState {
  validateIdentity(input.identity);
  createOrderIntent(input.intent);
  if (!sameScope(input.identity, input.intent)) throw new Error("identity and intent scope must match");
  if (!Number.isFinite(input.requestedQuantity) || input.requestedQuantity <= 0) throw new Error("requestedQuantity must be finite and positive");
  if (!Number.isFinite(input.filledQuantity) || input.filledQuantity < 0) throw new Error("filledQuantity must be finite and non-negative");
  if (!Number.isFinite(input.remainingQuantity) || input.remainingQuantity < 0) throw new Error("remainingQuantity must be finite and non-negative");
  if (input.filledQuantity > input.requestedQuantity || input.remainingQuantity > input.requestedQuantity || input.filledQuantity + input.remainingQuantity !== input.requestedQuantity) throw new Error("requestedQuantity must equal filledQuantity + remainingQuantity");
  if (input.status === "FILLED" && (input.filledQuantity !== input.requestedQuantity || input.remainingQuantity !== 0)) throw new Error("FILLED requires complete quantity");
  if (input.status === "PARTIALLY_FILLED" && (input.filledQuantity <= 0 || input.remainingQuantity <= 0)) throw new Error("PARTIALLY_FILLED requires filled and remaining quantity");
  if (input.averageFillPrice != null && (!Number.isFinite(input.averageFillPrice) || input.averageFillPrice <= 0)) throw new Error("averageFillPrice must be positive when present");
  for (const timestamp of Object.values(input.timestamps)) finiteNonNegative(timestamp, "timestamp");
  for (const reference of input.executionReferences) requiredText(reference.executionId, "executionId");
  for (const relation of input.relationships) { if (!["REPLACES", "REPLACED_BY"].includes(relation.relationType)) throw new Error("relationType is invalid"); requiredText(relation.canonicalOrderId, "relationship.canonicalOrderId"); }
  return clone(input);
}

export function createOrderEvent(input: OrderEvent): OrderEvent {
  requiredText(input.eventId, "eventId");
  validateIdentity(input.orderIdentity);
  if (!Number.isFinite(input.eventTime) || input.eventTime < 0) throw new Error("eventTime must be finite and non-negative");
  finiteNonNegative(input.receiveTime, "receiveTime");
  if (typeof input.sourceSequence === "number" && (!Number.isFinite(input.sourceSequence) || input.sourceSequence < 0)) throw new Error("sourceSequence must be non-negative");
  if (typeof input.sourceSequence !== "number" && typeof input.sourceSequence !== "string" && input.sourceSequence != null) throw new Error("sourceSequence must be number or string");
  if (input.executionReference) requiredText(input.executionReference.executionId, "executionId");
  return clone(input);
}

export function orderEventIdentityKey(event: OrderEvent): string {
  const identity = event.orderIdentity;
  return [identity.account.accountId, identity.account.broker, identity.account.environment, identity.market.instrument, identity.market.venue, identity.market.marketType, identity.canonicalOrderId, event.eventId].join("|");
}

function compareSequence(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function compareOrderEvents(a: OrderEvent, b: OrderEvent): number {
  const byTime = a.eventTime - b.eventTime;
  if (byTime !== 0) return byTime;
  if (a.sourceSequence != null && b.sourceSequence == null) return -1;
  if (a.sourceSequence == null && b.sourceSequence != null) return 1;
  if (a.sourceSequence != null && b.sourceSequence != null) {
    const bySequence = compareSequence(a.sourceSequence, b.sourceSequence);
    if (bySequence !== 0) return bySequence;
  }
  return a.eventId.localeCompare(b.eventId);
}
