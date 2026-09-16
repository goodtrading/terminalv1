import {
  createEconomicFill,
  economicFillIdentityKey,
  type EconomicFillRecord,
} from "../../../shared/economicFill";
import {
  createOrderEvent,
  createOrderIdentity,
  createOrderIntent,
  createOrderState,
  type OrderEventType,
  type OrderState,
} from "../../../shared/orderLifecycle";
import {
  createOrderEventRecord,
  createOrderEventStream,
  type CanonicalOrderEventRecord,
  type OrderEventStream,
} from "../../../shared/orderEventStream";
import type { DurableGoodTradingOrderIntent, DurableSubmissionAttempt } from "../../../shared/durableOrderIntent";
import type { AccountEnvironment } from "../../../shared/portfolioState";

export type DurableBrokerEvidenceSnapshot = Readonly<{
  id: string;
  brokerObjectId: string;
  classification: "GT_LINKED" | "BROKER_OBSERVED_ONLY";
  brokerAccountIdentity: string;
  source: "OPEN_ORDERS" | "ORDER_HISTORY" | "FILL_HISTORY";
  clientOrderId: string | null;
  brokerOrderId: string | null;
  brokerOrderIdPrecisionTrusted: boolean;
  executionId: string | null;
  symbol: string;
  side: string | null;
  quantity: string | null;
  price: string | null;
  rawBrokerStatus: string | null;
  sourceTimestamp: Date | null;
  observedAt: Date;
}>;

export type GoodTradingN7LifecycleComposition = Readonly<{
  state: OrderState;
  eventStream: OrderEventStream;
  economicFills: readonly EconomicFillRecord[];
  economicFillIdentityKeys: readonly string[];
}>;

type Input = Readonly<{
  intent: DurableGoodTradingOrderIntent;
  attempt: DurableSubmissionAttempt;
  brokerObjectId: string;
  snapshots: readonly DurableBrokerEvidenceSnapshot[];
}>;

function positiveNumber(value: string, field: string): number {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || /^0(?:\.0+)?$/.test(value)) throw new Error(`${field} must be a positive decimal`);
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`${field} must be finite and positive`);
  return result;
}

function dateMs(value: Date | null, field: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() < 0) throw new Error(`${field} is required`);
  return value.getTime();
}

function statusMapping(raw: string | null): { status: OrderState["status"]; eventType: OrderEventType } {
  const status = raw?.toUpperCase();
  if (status === "NEW" || status === "OPEN" || status === "ACCEPTED") return { status: "ACCEPTED", eventType: "ORDER_ACCEPTED" };
  if (status === "FILLED") return { status: "FILLED", eventType: "ORDER_FILLED" };
  if (status === "PARTIALLY_FILLED" || status === "PARTIAL_FILLED") return { status: "PARTIALLY_FILLED", eventType: "PARTIAL_FILL" };
  if (status === "CANCELED" || status === "CANCELLED") return { status: "CANCELED", eventType: "ORDER_CANCELED" };
  if (status === "REJECTED") return { status: "REJECTED", eventType: "ORDER_REJECTED" };
  if (status === "EXPIRED") return { status: "EXPIRED", eventType: "ORDER_EXPIRED" };
  throw new Error(`unsupported broker status: ${raw ?? "null"}`);
}

function lifecycleSnapshots(snapshots: readonly DurableBrokerEvidenceSnapshot[]): DurableBrokerEvidenceSnapshot[] {
  const ordered = [...snapshots].sort((a, b) => dateMs(a.sourceTimestamp, "sourceTimestamp") - dateMs(b.sourceTimestamp, "sourceTimestamp") || dateMs(a.observedAt, "observedAt") - dateMs(b.observedAt, "observedAt") || a.id.localeCompare(b.id));
  const result: DurableBrokerEvidenceSnapshot[] = [];
  let lastStatus: OrderState["status"] | undefined;
  let terminal = false;
  for (const snapshot of ordered) {
    const mapped = statusMapping(snapshot.rawBrokerStatus);
    if (terminal) continue;
    if (mapped.status === lastStatus) continue;
    result.push(snapshot);
    lastStatus = mapped.status;
    terminal = mapped.status === "FILLED" || mapped.status === "CANCELED" || mapped.status === "REJECTED" || mapped.status === "EXPIRED";
  }
  return result;
}

function uniqueEconomicFills(fills: readonly EconomicFillRecord[]): EconomicFillRecord[] {
  const byIdentity = new Map<string, EconomicFillRecord>();
  for (const fill of fills) {
    const key = economicFillIdentityKey(fill);
    const previous = byIdentity.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(fill)) throw new Error("ECONOMIC_FILL_CONFLICT");
    byIdentity.set(key, fill);
  }
  return Array.from(byIdentity.values());
}

function scope(input: Input): void {
  if (input.attempt.intentId !== input.intent.logicalOrderUid) throw new Error("GT_ATTEMPT_INTENT_SCOPE_MISMATCH");
  if (!input.attempt.brokerOrderId) throw new Error("BROKER_ORDER_ID_REQUIRED");
  if (!input.snapshots.length) throw new Error("BROKER_EVIDENCE_REQUIRED");
  for (const snapshot of input.snapshots) {
    if (snapshot.brokerObjectId !== input.brokerObjectId) throw new Error("BROKER_EVIDENCE_SCOPE_MISMATCH");
    if (snapshot.classification !== "GT_LINKED") throw new Error("BROKER_EVIDENCE_NOT_GT_LINKED");
    if (snapshot.brokerAccountIdentity !== input.intent.goodTradingAccountUid) throw new Error("BROKER_EVIDENCE_ACCOUNT_SCOPE_MISMATCH");
    if (snapshot.clientOrderId !== null && snapshot.clientOrderId !== input.attempt.brokerClientOrderId) throw new Error("BROKER_EVIDENCE_CLIENT_SCOPE_MISMATCH");
    if (snapshot.brokerOrderId !== null && snapshot.brokerOrderId !== input.attempt.brokerOrderId) throw new Error("BROKER_EVIDENCE_ORDER_SCOPE_MISMATCH");
    if (snapshot.brokerOrderIdPrecisionTrusted !== true) throw new Error("BROKER_ORDER_ID_PRECISION_UNTRUSTED");
    if (snapshot.symbol !== input.intent.sourceNativeSymbol) throw new Error("BROKER_EVIDENCE_SYMBOL_MISMATCH");
  }
}

function eventRecord(input: Input, snapshot: DurableBrokerEvidenceSnapshot, identity: ReturnType<typeof createOrderIdentity>): CanonicalOrderEventRecord {
  const mapped = statusMapping(snapshot.rawBrokerStatus);
  const eventTime = dateMs(snapshot.sourceTimestamp, "sourceTimestamp");
  return createOrderEventRecord({
    event: createOrderEvent({
      eventId: `goodtrading-broker-snapshot:${snapshot.id}`,
      orderIdentity: identity,
      eventType: mapped.eventType,
      eventTime,
      receiveTime: dateMs(snapshot.observedAt, "observedAt"),
      statusAfter: mapped.status,
      provenance: {
        source: "GOODTRADING_BROKER_OBSERVATION",
        runtime: "durable-postgres",
        broker: input.intent.executionBroker,
        clientOrderId: input.attempt.brokerClientOrderId,
        venueOrderId: input.attempt.brokerOrderId!,
        canonicalOrderId: input.intent.logicalOrderUid,
        nativeStatus: snapshot.rawBrokerStatus ?? undefined,
        sourceSnapshotId: snapshot.id,
        upstream: { source: snapshot.source, brokerObjectId: snapshot.brokerObjectId },
      },
    }),
    evidence: {
      origin: "SNAPSHOT_DERIVED",
      quality: "PARTIAL",
      eventIdOrigin: "DETERMINISTIC_DERIVED",
      derivationPolicy: "GOODTRADING_BROKER_SNAPSHOT_EVENT_V1",
      sourceReference: snapshot.id,
    },
  });
}

function economicFill(input: Input, snapshot: DurableBrokerEvidenceSnapshot): EconomicFillRecord | null {
  if (snapshot.executionId === null) return null;
  if (!snapshot.side || !snapshot.quantity || !snapshot.price) throw new Error("ECONOMIC_FILL_FACTS_INCOMPLETE");
  const eventTime = dateMs(snapshot.sourceTimestamp, "sourceTimestamp");
  return createEconomicFill({
    executionId: snapshot.executionId,
    accountIdentity: { accountId: input.intent.goodTradingAccountUid, broker: input.intent.executionBroker, environment: input.intent.executionEnvironment as AccountEnvironment, baseCurrency: input.intent.canonicalSettlementAsset },
    marketIdentity: { instrument: input.intent.executionMarketInstrument, venue: input.intent.executionMarketVenue, marketType: input.intent.executionMarketType },
    side: snapshot.side.toUpperCase() as "BUY" | "SELL",
    quantity: positiveNumber(snapshot.quantity, "quantity"),
    price: positiveNumber(snapshot.price, "price"),
    eventTime,
    receiveTime: dateMs(snapshot.observedAt, "observedAt"),
    orderReferences: { clientOrderId: input.attempt.brokerClientOrderId, venueOrderId: input.attempt.brokerOrderId! },
    provenance: { source: "GOODTRADING_BROKER_OBSERVATION", executionId: snapshot.executionId, clientOrderId: input.attempt.brokerClientOrderId, venueOrderId: input.attempt.brokerOrderId!, tradeId: snapshot.executionId, upstreamEventType: snapshot.rawBrokerStatus ?? undefined, upstreamTimestamp: eventTime },
  });
}

export function composeGoodTradingN7Lifecycle(input: Input): GoodTradingN7LifecycleComposition {
  scope(input);
  if (input.intent.timeInForce !== "GTC") throw new Error("N7_REQUIRES_EXPLICIT_GTC");
  if (input.intent.postOnly === null || input.intent.reduceOnly === null) throw new Error("N7_REQUIRES_EXPLICIT_FLAGS");
  const identity = createOrderIdentity({
    account: { accountId: input.intent.goodTradingAccountUid, broker: input.intent.executionBroker, environment: input.intent.executionEnvironment as AccountEnvironment, baseCurrency: input.intent.canonicalSettlementAsset },
    market: { instrument: input.intent.executionMarketInstrument, venue: input.intent.executionMarketVenue, marketType: input.intent.executionMarketType },
    canonicalOrderId: input.intent.logicalOrderUid,
    clientOrderId: input.attempt.brokerClientOrderId,
    venueOrderId: input.attempt.brokerOrderId!,
  });
  const orderIntent = createOrderIntent({
    account: identity.account, market: identity.market, side: input.intent.requestedSide.toUpperCase() as "BUY" | "SELL", orderType: "LIMIT", quantity: positiveNumber(input.intent.resolvedQuantity, "resolvedQuantity"), limitPrice: positiveNumber(input.intent.limitPrice, "limitPrice"), triggerPrice: null, timeInForce: input.intent.timeInForce === "GTC" ? "GTC" : "GTC", reduceOnly: input.intent.reduceOnly ?? false, postOnly: input.intent.postOnly ?? false,
  });
  const ordered = lifecycleSnapshots(input.snapshots);
  const latest = ordered[ordered.length - 1]!;
  const mapped = statusMapping(latest.rawBrokerStatus);
  if (mapped.status === "PARTIALLY_FILLED") throw new Error("PARTIAL_FILL_FACTS_INCOMPLETE");
  const requested = positiveNumber(input.intent.resolvedQuantity, "resolvedQuantity");
  const state = createOrderState({ identity, intent: orderIntent, status: mapped.status, requestedQuantity: requested, filledQuantity: mapped.status === "FILLED" ? requested : 0, remainingQuantity: mapped.status === "FILLED" ? 0 : requested, averageFillPrice: mapped.status === "FILLED" && latest.price ? positiveNumber(latest.price, "price") : null, timestamps: { updatedAt: dateMs(latest.observedAt, "observedAt") }, executionReferences: [], relationships: [], syncQuality: "PARTIAL", provenance: { source: "GOODTRADING_BROKER_OBSERVATION", runtime: "durable-postgres", broker: input.intent.executionBroker, account: identity.account, market: identity.market, canonicalOrderId: identity.canonicalOrderId, clientOrderId: identity.clientOrderId, venueOrderId: identity.venueOrderId, nativeStatus: latest.rawBrokerStatus ?? undefined, sourceSnapshotId: latest.id } });
  const records = ordered.map(snapshot => eventRecord(input, snapshot, identity));
  const stream = createOrderEventStream({ orderIdentity: identity, records, completeness: "PARTIAL", provenance: { source: "GOODTRADING_BROKER_OBSERVATION", runtime: "durable-postgres", broker: input.intent.executionBroker, orderIdentity: identity, sourceRangeStart: records[0]?.event.eventTime, sourceRangeEnd: records.at(-1)?.event.eventTime, eventIdPolicies: ["GOODTRADING_BROKER_SNAPSHOT_EVENT_V1"] } });
  const fills = uniqueEconomicFills([...input.snapshots].sort((a, b) => dateMs(a.observedAt, "observedAt") - dateMs(b.observedAt, "observedAt") || a.id.localeCompare(b.id)).map(snapshot => economicFill(input, snapshot)).filter((fill): fill is EconomicFillRecord => fill !== null));
  return { state, eventStream: stream, economicFills: fills, economicFillIdentityKeys: fills.map(economicFillIdentityKey) };
}
