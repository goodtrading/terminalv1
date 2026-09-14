import {
  createOrderEvent,
  type OrderEvent,
  type OrderIdentity,
} from "../../../../shared/orderLifecycle";
import {
  createOrderEventRecord,
  createOrderEventStream,
  type CanonicalOrderEventRecord,
  type OrderEventStream,
} from "../../../../shared/orderEventStream";
import type { EconomicFillRecord } from "../../../../shared/economicFill";
import { buildBingXOrderIdentity, orderScopesEqual } from "./bingxOrderIdentityAdapter";

export const BINGX_FILL_EVENT_POLICY = "BINGX_FILL_EVENT_V1";
const SOURCE_ENDPOINT = "/openApi/swap/v2/trade/allFillOrders";

type FillEventFailure = Readonly<{
  ok: false;
  code:
    | "ORDER_REFERENCE_REQUIRED"
    | "ORDER_SCOPE_MISMATCH"
    | "ORDER_IDENTITY_INVALID";
  message: string;
}>;

type FillEventSuccess = Readonly<{
  ok: true;
  record: CanonicalOrderEventRecord;
}>;

export type BingXFillOrderEventResult = FillEventSuccess | FillEventFailure;

function deterministicEventId(executionId: string): string {
  return `${BINGX_FILL_EVENT_POLICY}:${executionId}`;
}

export function adaptBingXFillToOrderEvent(
  fill: EconomicFillRecord,
): BingXFillOrderEventResult {
  const venueOrderId = fill.orderReferences?.venueOrderId?.trim();
  if (!venueOrderId) {
    return { ok: false, code: "ORDER_REFERENCE_REQUIRED", message: "EconomicFill venueOrderId is required for BingX order event scope" };
  }
  const order = buildBingXOrderIdentity({
    account: fill.accountIdentity,
    market: fill.marketIdentity,
    brokerOrderId: venueOrderId,
    clientOrderId: fill.orderReferences?.clientOrderId,
  });
  if (!order.ok) return { ok: false, code: "ORDER_IDENTITY_INVALID", message: order.message };
  if (!orderScopesEqual(order.identity, fill)) {
    return { ok: false, code: "ORDER_SCOPE_MISMATCH", message: "EconomicFill account/market scope does not match order identity" };
  }

  const event: OrderEvent = createOrderEvent({
    eventId: deterministicEventId(fill.executionId),
    orderIdentity: order.identity,
    eventType: "FILL",
    eventTime: fill.eventTime,
    executionReference: {
      executionId: fill.executionId,
      venueOrderId,
      eventTime: fill.eventTime,
      receiveTime: fill.receiveTime ?? null,
    },
    provenance: {
      source: "BINGX_ACCOUNT_READ_ONLY",
      broker: "BINGX",
      account: fill.accountIdentity,
      market: fill.marketIdentity,
      venueOrderId,
      canonicalOrderId: order.identity.canonicalOrderId,
      upstream: {
        endpoint: SOURCE_ENDPOINT,
        evidenceOrigin: "EXECUTION_EVENT",
        eventIdPolicy: BINGX_FILL_EVENT_POLICY,
        executionId: fill.executionId,
        executionFacts: {
          side: fill.side,
          quantity: fill.quantity,
          price: fill.price,
          fee: fill.fee,
        },
      },
    },
  });
  return {
    ok: true,
    record: createOrderEventRecord({
      event,
      evidence: {
        origin: "EXECUTION_EVENT",
        quality: "CONFIRMED",
        eventIdOrigin: "DETERMINISTIC_DERIVED",
        derivationPolicy: BINGX_FILL_EVENT_POLICY,
        sourceReference: fill.executionId,
      },
    }),
  };
}

export function createBingXFillEventStream(
  orderIdentity: OrderIdentity,
  records: readonly CanonicalOrderEventRecord[],
): OrderEventStream {
  const stream = createOrderEventStream({
    orderIdentity,
    records,
    completeness: "PARTIAL",
    provenance: {
      source: "BINGX_ACCOUNT_READ_ONLY",
      broker: "BINGX",
      orderIdentity,
      eventIdPolicies: [BINGX_FILL_EVENT_POLICY],
    },
  });
  const firstFacts = new Map<string, string>();
  const conflictingEventIds = new Set<string>();
  for (const record of records) {
    const eventId = record.event.eventId;
    const upstream = record.event.provenance.upstream;
    const facts = upstream && typeof upstream === "object"
      ? (upstream as { executionFacts?: unknown }).executionFacts
      : undefined;
    const serialized = JSON.stringify(facts);
    const previous = firstFacts.get(eventId);
    if (previous === undefined) firstFacts.set(eventId, serialized);
    else if (previous !== serialized) conflictingEventIds.add(eventId);
  }
  if (conflictingEventIds.size === 0) return stream;
  const additional = Array.from(conflictingEventIds).sort();
  const existing = new Set(stream.consistency.conflictingEventIds);
  for (const eventId of additional) existing.add(eventId);
  const conflicts = Array.from(existing).sort();
  const issues = stream.consistency.issues.includes("CONFLICTING_EVENT")
    ? stream.consistency.issues
    : [...stream.consistency.issues, "CONFLICTING_EVENT" as const];
  return {
    ...stream,
    quality: "PARTIAL",
    consistency: {
      ...stream.consistency,
      issues,
      conflictingEventIds: conflicts,
    },
  };
}
