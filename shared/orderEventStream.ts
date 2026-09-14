import {
  compareOrderEvents,
  orderEventIdentityKey,
  type OrderEvent,
  type OrderIdentity,
} from "./orderLifecycle";

export type OrderEventEvidenceOrigin = "NATIVE_EVENT" | "EXECUTION_EVENT" | "SNAPSHOT_DERIVED";
export type OrderEventEvidenceQuality = "CONFIRMED" | "PARTIAL";
export type OrderEventIdOrigin = "NATIVE" | "DETERMINISTIC_DERIVED";

export type OrderEventEvidence = Readonly<{
  origin: OrderEventEvidenceOrigin;
  quality: OrderEventEvidenceQuality;
  eventIdOrigin: OrderEventIdOrigin;
  derivationPolicy?: string;
  nativeEventId?: string;
  nativeSequence?: number | string | null;
  sourceReference?: string;
}>;

export type CanonicalOrderEventRecord = Readonly<{
  event: OrderEvent;
  evidence: OrderEventEvidence;
}>;

export type OrderEventStreamQuality = "CONFIRMED" | "PARTIAL" | "UNKNOWN";
export type OrderEventStreamCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type OrderEventOrderingQuality = "DETERMINISTIC" | "PARTIAL" | "UNKNOWN";
export type OrderEventStreamIssue =
  | "EVENT_SCOPE_MISMATCH"
  | "DUPLICATE_EVENT"
  | "CONFLICTING_EVENT"
  | "ORDERING_EVIDENCE_GAP"
  | "MISSING_EVENT_ID"
  | "MISSING_EVENT_TIME"
  | "STATUS_EVIDENCE_GAP";

export type OrderEventStreamConsistency = Readonly<{
  issues: readonly OrderEventStreamIssue[];
  duplicateEventIds: readonly string[];
  conflictingEventIds: readonly string[];
}>;

export type OrderEventStreamProvenance = Readonly<{
  source: string;
  runtime?: string;
  broker?: string;
  orderIdentity?: OrderIdentity;
  sourceSnapshotId?: string | number;
  sourceRangeStart?: number | string | null;
  sourceRangeEnd?: number | string | null;
  sourceCursor?: string;
  eventIdPolicies?: readonly string[];
}>;

export type OrderEventStream = Readonly<{
  orderIdentity: OrderIdentity;
  events: readonly CanonicalOrderEventRecord[];
  quality: OrderEventStreamQuality;
  completeness: OrderEventStreamCompleteness;
  ordering: OrderEventOrderingQuality;
  consistency: OrderEventStreamConsistency;
  provenance: OrderEventStreamProvenance;
}>;

export type CreateOrderEventStreamInput = Readonly<{
  orderIdentity: OrderIdentity;
  records: readonly CanonicalOrderEventRecord[];
  completeness: OrderEventStreamCompleteness;
  provenance: OrderEventStreamProvenance;
}>;

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

function sameIdentity(a: OrderIdentity, b: OrderIdentity): boolean {
  return a.account.accountId === b.account.accountId
    && a.account.broker === b.account.broker
    && a.account.environment === b.account.environment
    && a.market.instrument === b.market.instrument
    && a.market.venue === b.market.venue
    && a.market.marketType === b.market.marketType
    && a.canonicalOrderId === b.canonicalOrderId;
}

function materialEventShape(event: OrderEvent): unknown {
  return {
    identity: {
      account: event.orderIdentity.account,
      market: event.orderIdentity.market,
      canonicalOrderId: event.orderIdentity.canonicalOrderId,
      clientOrderId: event.orderIdentity.clientOrderId,
      venueOrderId: event.orderIdentity.venueOrderId,
    },
    eventType: event.eventType,
    eventTime: event.eventTime,
    receiveTime: event.receiveTime,
    sourceSequence: event.sourceSequence,
    statusBefore: event.statusBefore,
    statusAfter: event.statusAfter,
    executionReference: event.executionReference,
    reason: event.reason,
  };
}

export function orderEventsMateriallyEqual(a: OrderEvent, b: OrderEvent): boolean {
  return JSON.stringify(materialEventShape(a)) === JSON.stringify(materialEventShape(b));
}

function validateEvidence(evidence: OrderEventEvidence): void {
  if (!["NATIVE_EVENT", "EXECUTION_EVENT", "SNAPSHOT_DERIVED"].includes(evidence.origin)) throw new Error("invalid evidence origin");
  if (!["CONFIRMED", "PARTIAL"].includes(evidence.quality)) throw new Error("invalid evidence quality");
  if (evidence.eventIdOrigin === "NATIVE") {
    if (typeof evidence.nativeEventId !== "string" || evidence.nativeEventId.trim() === "") throw new Error("nativeEventId is required for NATIVE event identity");
    if (evidence.derivationPolicy !== undefined) throw new Error("derivationPolicy is not allowed for NATIVE event identity");
  } else if (evidence.eventIdOrigin === "DETERMINISTIC_DERIVED") {
    if (typeof evidence.derivationPolicy !== "string" || evidence.derivationPolicy.trim() === "") throw new Error("derivationPolicy is required for DETERMINISTIC_DERIVED event identity");
  } else {
    throw new Error("invalid eventIdOrigin");
  }
  if (evidence.nativeSequence != null && typeof evidence.nativeSequence !== "number" && typeof evidence.nativeSequence !== "string") throw new Error("nativeSequence must be number or string");
}

export function createOrderEventRecord(input: CanonicalOrderEventRecord): CanonicalOrderEventRecord {
  if (!input?.event || !input.evidence) throw new Error("event and evidence are required");
  validateEvidence(input.evidence);
  return clone(input);
}

function comparableSequence(value: number | string | null | undefined): boolean {
  return value != null;
}

function hasCausalOrderingGap(events: readonly CanonicalOrderEventRecord[]): boolean {
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (events[i]!.event.eventTime === events[j]!.event.eventTime
        && !comparableSequence(events[i]!.event.sourceSequence)
        && !comparableSequence(events[j]!.event.sourceSequence)) return true;
    }
  }
  return false;
}

function classifyOrdering(events: readonly CanonicalOrderEventRecord[]): OrderEventOrderingQuality {
  if (events.length === 0) return "UNKNOWN";
  return hasCausalOrderingGap(events) ? "PARTIAL" : "DETERMINISTIC";
}

function compareRecord(a: CanonicalOrderEventRecord, b: CanonicalOrderEventRecord): number {
  return compareOrderEvents(a.event, b.event);
}

function classifyQuality(
  records: readonly CanonicalOrderEventRecord[],
  completeness: OrderEventStreamCompleteness,
  ordering: OrderEventOrderingQuality,
  consistency: OrderEventStreamConsistency,
): OrderEventStreamQuality {
  if (records.length === 0 || completeness === "UNKNOWN" || ordering === "UNKNOWN") return "UNKNOWN";
  if (completeness === "PARTIAL" || ordering === "PARTIAL" || consistency.issues.length > 0 || records.some((record) => record.evidence.quality === "PARTIAL")) return "PARTIAL";
  return "CONFIRMED";
}

export function createOrderEventStream(input: CreateOrderEventStreamInput): OrderEventStream {
  if (!input?.orderIdentity || !Array.isArray(input.records)) throw new Error("orderIdentity and records are required");
  if (!["COMPLETE", "PARTIAL", "UNKNOWN"].includes(input.completeness)) throw new Error("invalid completeness");
  const records = input.records.map(createOrderEventRecord);
  for (const record of records) {
    if (!sameIdentity(input.orderIdentity, record.event.orderIdentity)) throw new Error("event scope mismatch");
  }

  const events = [...records].sort(compareRecord);
  const duplicateEventIds = new Set<string>();
  const conflictingEventIds = new Set<string>();
  const firstByIdentity = new Map<string, OrderEvent>();
  for (const record of events) {
    const key = orderEventIdentityKey(record.event);
    const first = firstByIdentity.get(key);
    if (!first) {
      firstByIdentity.set(key, record.event);
      continue;
    }
    if (orderEventsMateriallyEqual(first, record.event)) duplicateEventIds.add(record.event.eventId);
    else conflictingEventIds.add(record.event.eventId);
  }

  const duplicateIds = Array.from(duplicateEventIds).sort((a, b) => a.localeCompare(b));
  const conflictingIds = Array.from(conflictingEventIds).sort((a, b) => a.localeCompare(b));
  const issues = [
    ...(duplicateIds.length ? ["DUPLICATE_EVENT" as const] : []),
    ...(conflictingIds.length ? ["CONFLICTING_EVENT" as const] : []),
  ];
  const consistency: OrderEventStreamConsistency = {
    issues,
    duplicateEventIds: duplicateIds,
    conflictingEventIds: conflictingIds,
  };
  const ordering = classifyOrdering(events);
  const finalConsistency: OrderEventStreamConsistency = ordering === "PARTIAL"
    ? { ...consistency, issues: [...consistency.issues, "ORDERING_EVIDENCE_GAP"] }
    : consistency;
  const provenance = clone(input.provenance);
  const result: OrderEventStream = {
    orderIdentity: clone(input.orderIdentity),
    events: clone(events),
    quality: classifyQuality(events, input.completeness, ordering, finalConsistency),
    completeness: input.completeness,
    ordering,
    consistency: finalConsistency,
    provenance,
  };
  return result;
}
