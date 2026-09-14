import {
  createOrderEvent,
  createOrderIdentity,
  createOrderIntent,
  createOrderState,
  type OrderEvent,
  type OrderIdentity,
  type OrderIntent,
  type OrderState,
  type OrderTerminalReason,
} from "../../shared/orderLifecycle";
import {
  createOrderEventStream,
  createOrderEventRecord,
  type CanonicalOrderEventRecord,
  type OrderEventStream,
} from "../../shared/orderEventStream";
import type { ExecutionMarketIdentity } from "../../shared/marketTruth";
import type { AccountIdentity } from "../../shared/portfolioState";

export type NautilusInstrumentSnapshotInput = Readonly<{
  venue: string;
  marketType: string;
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  exchangeNativeSymbol?: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type NautilusOrderIntentSnapshotInput = Readonly<{
  clientOrderId: string;
  instrument: NautilusInstrumentSnapshotInput;
  side: string;
  orderType: string;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  timeInForce: string;
  reduceOnly: boolean;
  postOnly: boolean;
  strategyId?: string;
  playbookId?: string;
  setupId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type NautilusOrderStateSnapshotInput = Readonly<{
  clientOrderId: string;
  venueOrderId?: string;
  instrument: NautilusInstrumentSnapshotInput;
  side: string;
  orderType: string;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  price?: string;
  triggerPrice?: string;
  protectionType?: "STOP_LOSS" | "TAKE_PROFIT";
  averageFillPrice?: string;
  status: string;
  reason?: string;
  timestamps: Readonly<{
    createdAt?: number;
    updatedAt?: number;
    submittedAt?: number;
    acceptedAt?: number;
    rejectedAt?: number;
    firstFillAt?: number;
    lastFillAt?: number;
    canceledAt?: number;
    completedAt?: number;
    expiredAt?: number;
  }>;
  metadata?: Readonly<Record<string, unknown>>;
  snapshotId?: string | number;
}>;

export type NautilusFillSnapshotInput = Readonly<{
  fillId: string;
  clientOrderId: string;
  venueOrderId?: string;
  instrument: NautilusInstrumentSnapshotInput;
  side: string;
  price: string;
  quantity: string;
  timestamp: number;
}>;

export type NautilusOrderLifecycleAdapterInput = Readonly<{
  accountIdentity: AccountIdentity;
  intentSnapshot: NautilusOrderIntentSnapshotInput;
  orderSnapshot: NautilusOrderStateSnapshotInput;
  fills?: readonly NautilusFillSnapshotInput[];
  expectedMarket?: ExecutionMarketIdentity;
}>;

export type NautilusOrderLifecycleAdapterResult = Readonly<{
  state: OrderState;
  eventStream: OrderEventStream;
}>;

const SOURCE = "NAUTILUS_PAPER";
const RUNTIME = "nautilus-simulation";
const SNAPSHOT_EVENT_POLICY = "NAUTILUS_SNAPSHOT_EVENT_V1";
const FILL_EVENT_POLICY = "NAUTILUS_FILL_EVENT_V1";

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clone(item)])) as T;
}

function requiredText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
}

function finiteNumber(value: string | number | undefined, field: string): number {
  if (value === undefined) throw new Error(`${field} is required`);
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`${field} must be finite`);
  return result;
}

function optionalNumber(value: string | number | undefined, field: string): number | null {
  if (value === undefined) return null;
  return finiteNumber(value, field);
}

function marketFrom(input: NautilusInstrumentSnapshotInput): ExecutionMarketIdentity {
  requiredText(input.symbol, "instrument.symbol");
  requiredText(input.venue, "instrument.venue");
  requiredText(input.marketType, "instrument.marketType");
  const marketType = input.marketType.toLowerCase();
  if (marketType === "spot") return { instrument: input.symbol, venue: input.venue, marketType: "Spot" };
  if (marketType === "perpetual" || marketType === "perp") return { instrument: input.symbol, venue: input.venue, marketType: "Perpetual" };
  throw new Error(`unsupported market type: ${input.marketType}`);
}

function sameMarket(a: ExecutionMarketIdentity, b: ExecutionMarketIdentity): boolean {
  return a.instrument === b.instrument && a.venue === b.venue && a.marketType === b.marketType;
}

function sameScope(a: OrderIdentity, b: OrderIdentity): boolean {
  return a.account.accountId === b.account.accountId
    && a.account.broker === b.account.broker
    && a.account.environment === b.account.environment
    && sameMarket(a.market, b.market)
    && a.canonicalOrderId === b.canonicalOrderId;
}

function mapSide(value: string): "BUY" | "SELL" {
  if (value === "BUY" || value === "SELL") return value;
  throw new Error(`unsupported order side: ${value}`);
}

function mapOrderType(value: string): "MARKET" | "LIMIT" | "STOP_MARKET" {
  if (value === "MARKET" || value === "LIMIT" || value === "STOP_MARKET") return value;
  throw new Error(`unsupported order type: ${value}`);
}

function mapStatus(value: string): OrderState["status"] {
  const supported = ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "FILLED", "CANCEL_PENDING", "CANCELED", "REJECTED", "EXPIRED"] as const;
  if ((supported as readonly string[]).includes(value)) return value as OrderState["status"];
  throw new Error(`unsupported order status: ${value}`);
}

function mapTif(value: string): "GTC" {
  if (value === "GTC") return value;
  throw new Error(`unsupported timeInForce: ${value}`);
}

function terminalReason(reason: string | undefined): OrderTerminalReason | undefined {
  if (reason === undefined) return undefined;
  requiredText(reason, "reason");
  return { message: reason, source: SOURCE };
}

function provenance(
  account: AccountIdentity,
  market: ExecutionMarketIdentity,
  intent: NautilusOrderIntentSnapshotInput,
  state: NautilusOrderStateSnapshotInput,
): OrderState["provenance"] {
  return {
    source: SOURCE,
    runtime: RUNTIME,
    broker: account.broker,
    account,
    market,
    canonicalOrderId: state.clientOrderId,
    clientOrderId: state.clientOrderId,
    ...(state.venueOrderId !== undefined ? { venueOrderId: state.venueOrderId } : {}),
    nativeStatus: state.status,
    nativeOrderType: state.orderType,
    ...(state.snapshotId !== undefined ? { sourceSnapshotId: state.snapshotId } : {}),
    upstream: {
      intentMetadata: clone(intent.metadata),
      orderMetadata: clone(state.metadata),
      protectionType: state.protectionType,
      instrumentMetadata: clone(state.instrument.metadata),
    },
  };
}

function eventProvenance(
  account: AccountIdentity,
  market: ExecutionMarketIdentity,
  state: NautilusOrderStateSnapshotInput,
  extra: Record<string, unknown> = {},
): OrderEvent["provenance"] {
  return {
    source: SOURCE,
    runtime: RUNTIME,
    broker: account.broker,
    account,
    market,
    canonicalOrderId: state.clientOrderId,
    clientOrderId: state.clientOrderId,
    ...(state.venueOrderId !== undefined ? { venueOrderId: state.venueOrderId } : {}),
    nativeStatus: state.status,
    nativeOrderType: state.orderType,
    ...(state.snapshotId !== undefined ? { sourceSnapshotId: state.snapshotId } : {}),
    ...extra,
  };
}

function snapshotRecord(
  type: "ORDER_CREATED" | "ORDER_SUBMITTED" | "ORDER_ACCEPTED" | "ORDER_CANCELED",
  timestamp: number,
  identity: OrderIdentity,
  account: AccountIdentity,
  state: NautilusOrderStateSnapshotInput,
): CanonicalOrderEventRecord {
  const eventId = `nautilus-snapshot:${identity.canonicalOrderId}:${type}:${timestamp}`;
  return createOrderEventRecord({
    event: createOrderEvent({
      eventId,
      orderIdentity: identity,
      eventType: type,
      eventTime: timestamp,
      statusAfter: mapStatus(state.status),
      provenance: eventProvenance(account, identity.market, state, { sourceSnapshotId: state.snapshotId }),
    }),
    evidence: {
      origin: "SNAPSHOT_DERIVED",
      quality: "PARTIAL",
      eventIdOrigin: "DETERMINISTIC_DERIVED",
      derivationPolicy: SNAPSHOT_EVENT_POLICY,
      sourceReference: state.snapshotId === undefined ? undefined : String(state.snapshotId),
    },
  });
}

function fillRecord(
  fill: NautilusFillSnapshotInput,
  identity: OrderIdentity,
  account: AccountIdentity,
  state: NautilusOrderStateSnapshotInput,
): CanonicalOrderEventRecord {
  requiredText(fill.fillId, "fill.fillId");
  const eventId = `nautilus-fill:${fill.fillId}`;
  const executionReference = {
    executionId: fill.fillId,
    clientOrderId: fill.clientOrderId,
    ...(fill.venueOrderId === undefined ? {} : { venueOrderId: fill.venueOrderId }),
    eventTime: fill.timestamp,
  };
  return createOrderEventRecord({
    event: createOrderEvent({
      eventId,
      orderIdentity: identity,
      eventType: "FILL",
      eventTime: fill.timestamp,
      executionReference,
      provenance: eventProvenance(account, identity.market, state, {
        sourceReference: fill.fillId,
        fillId: fill.fillId,
        fillSide: fill.side,
      }),
    }),
    evidence: {
      origin: "EXECUTION_EVENT",
      quality: "CONFIRMED",
      eventIdOrigin: "DETERMINISTIC_DERIVED",
      derivationPolicy: FILL_EVENT_POLICY,
      sourceReference: fill.fillId,
    },
  });
}

export function adaptNautilusOrderLifecycle(input: NautilusOrderLifecycleAdapterInput): NautilusOrderLifecycleAdapterResult {
  if (!input?.accountIdentity || !input.intentSnapshot || !input.orderSnapshot) throw new Error("accountIdentity, intentSnapshot and orderSnapshot are required");
  const intentSource = input.intentSnapshot;
  const stateSource = input.orderSnapshot;
  const intentMarket = marketFrom(intentSource.instrument);
  const stateMarket = marketFrom(stateSource.instrument);
  if (!sameMarket(intentMarket, stateMarket)) throw new Error("intent and order market mismatch");
  if (input.expectedMarket && !sameMarket(input.expectedMarket, stateMarket)) throw new Error("expected market mismatch");
  if (intentSource.clientOrderId !== stateSource.clientOrderId) throw new Error("intent and order clientOrderId mismatch");

  const canonicalOrderId = stateSource.clientOrderId;
  const identity = createOrderIdentity({
    account: clone(input.accountIdentity),
    market: stateMarket,
    canonicalOrderId,
    clientOrderId: stateSource.clientOrderId,
    ...(stateSource.venueOrderId === undefined ? {} : { venueOrderId: stateSource.venueOrderId }),
  });
  const orderType = mapOrderType(intentSource.orderType);
  if (stateSource.orderType !== intentSource.orderType) throw new Error("intent and order orderType mismatch");
  const side = mapSide(intentSource.side);
  if (stateSource.side !== intentSource.side) throw new Error("intent and order side mismatch");
  const quantity = finiteNumber(intentSource.quantity, "intent.quantity");
  if (stateSource.quantity !== intentSource.quantity) throw new Error("intent and order quantity mismatch");
  const intent: OrderIntent = createOrderIntent({
    account: clone(input.accountIdentity),
    market: stateMarket,
    side,
    orderType,
    quantity,
    limitPrice: orderType === "LIMIT" ? finiteNumber(intentSource.price, "intent.price") : null,
    triggerPrice: orderType === "STOP_MARKET" ? finiteNumber(intentSource.triggerPrice, "intent.triggerPrice") : null,
    timeInForce: mapTif(intentSource.timeInForce),
    reduceOnly: intentSource.reduceOnly,
    postOnly: intentSource.postOnly,
    sourceMetadata: {
      ...(intentSource.metadata === undefined ? {} : { metadata: clone(intentSource.metadata) }),
      ...(intentSource.strategyId === undefined ? {} : { strategyId: intentSource.strategyId }),
      ...(intentSource.playbookId === undefined ? {} : { playbookId: intentSource.playbookId }),
      ...(intentSource.setupId === undefined ? {} : { setupId: intentSource.setupId }),
      ...(stateSource.protectionType === undefined ? {} : { protectionType: stateSource.protectionType }),
    },
  });
  if (orderType === "MARKET" && stateSource.price !== undefined) throw new Error("MARKET snapshot cannot have price");
  if (orderType === "LIMIT" && stateSource.price !== intentSource.price) throw new Error("state and intent price mismatch");
  if (orderType === "STOP_MARKET" && stateSource.triggerPrice !== intentSource.triggerPrice) throw new Error("state and intent triggerPrice mismatch");

  const status = mapStatus(stateSource.status);
  const timestamps = {
    ...(stateSource.timestamps.createdAt === undefined ? {} : { createdAt: stateSource.timestamps.createdAt }),
    ...(stateSource.timestamps.submittedAt === undefined ? {} : { submittedAt: stateSource.timestamps.submittedAt }),
    ...(stateSource.timestamps.acceptedAt === undefined ? {} : { acceptedAt: stateSource.timestamps.acceptedAt }),
    ...(stateSource.timestamps.updatedAt === undefined ? {} : { updatedAt: stateSource.timestamps.updatedAt }),
    ...(stateSource.timestamps.canceledAt === undefined ? {} : { canceledAt: stateSource.timestamps.canceledAt }),
  };
  const state = createOrderState({
    identity,
    intent,
    status,
    requestedQuantity: finiteNumber(stateSource.quantity, "order.quantity"),
    filledQuantity: finiteNumber(stateSource.filledQuantity, "order.filledQuantity"),
    remainingQuantity: finiteNumber(stateSource.remainingQuantity, "order.remainingQuantity"),
    averageFillPrice: optionalNumber(stateSource.averageFillPrice, "order.averageFillPrice"),
    timestamps,
    terminalReason: terminalReason(stateSource.reason),
    executionReferences: [],
    relationships: [],
    syncQuality: "CONFIRMED",
    provenance: provenance(input.accountIdentity, stateMarket, intentSource, stateSource),
  });

  const records: CanonicalOrderEventRecord[] = [];
  const snapshotEvents: Array<readonly ["ORDER_CREATED" | "ORDER_SUBMITTED" | "ORDER_ACCEPTED" | "ORDER_CANCELED", number | undefined]> = [
    ["ORDER_CREATED", stateSource.timestamps.createdAt],
    ["ORDER_SUBMITTED", stateSource.timestamps.submittedAt],
    ["ORDER_ACCEPTED", stateSource.timestamps.acceptedAt],
    ["ORDER_CANCELED", stateSource.timestamps.canceledAt],
  ];
  for (const [type, timestamp] of snapshotEvents) if (timestamp !== undefined) records.push(snapshotRecord(type, timestamp, identity, input.accountIdentity, stateSource));
  for (const fill of input.fills ?? []) {
    if (fill.clientOrderId !== stateSource.clientOrderId) throw new Error("fill belongs to another clientOrderId");
    const fillMarket = marketFrom(fill.instrument);
    if (!sameMarket(fillMarket, stateMarket)) throw new Error("fill market mismatch");
    if (fill.venueOrderId !== undefined && stateSource.venueOrderId !== undefined && fill.venueOrderId !== stateSource.venueOrderId) throw new Error("fill venueOrderId mismatch");
    mapSide(fill.side);
    finiteNumber(fill.price, "fill.price");
    finiteNumber(fill.quantity, "fill.quantity");
    finiteNumber(fill.timestamp, "fill.timestamp");
    records.push(fillRecord(fill, identity, input.accountIdentity, stateSource));
  }
  const eventStream = createOrderEventStream({
    orderIdentity: identity,
    records,
    completeness: "PARTIAL",
    provenance: {
      source: SOURCE,
      runtime: RUNTIME,
      broker: input.accountIdentity.broker,
      orderIdentity: identity,
      ...(stateSource.snapshotId === undefined ? {} : { sourceSnapshotId: stateSource.snapshotId }),
      eventIdPolicies: [SNAPSHOT_EVENT_POLICY, FILL_EVENT_POLICY],
    },
  });
  return { state: clone(state), eventStream: clone(eventStream) };
}

export const adaptNautilusOrderSnapshot = adaptNautilusOrderLifecycle;
