import type { BingXReconciliationSource, BingXSubmissionObservation, BingXSubmissionReadResults } from "../exchanges/bingx/bingxSubmissionReconciliationReader";
import { createBrokerIdentity, type BrokerIdentity, type BrokerObservationSnapshot } from "../../../shared/durableOrderReconciliation";
import { findOrCreateBrokerObjectByReliableIdentities, recordBrokerObservationIfNew } from "../orders/goodTradingOrderReconciliationRepository";
import { getAttemptByAccountAndBrokerClientOrderId } from "../orders/goodTradingOrderIntentRepository";

export type ExternalObservationSummary = Readonly<{ scanned: number; persisted: number; deduped: number; rejected: number; insufficientIdentity: number; knownGtMatches: number; sourceFailures: string[] }>;
type ObjectRef = Readonly<{ id: string; classification: "BROKER_OBSERVED_ONLY" | "GT_LINKED" }>;
type Deps = {
  brokerAccountIdentity: string;
  read: () => Promise<BingXSubmissionReadResults>;
  findOrCreate?: (input: { brokerAccountIdentity: string; identities: BrokerIdentity[]; classification: "BROKER_OBSERVED_ONLY" }) => Promise<ObjectRef>;
  recordIfNew?: (input: { brokerObjectId: string; snapshot: BrokerObservationSnapshot }) => Promise<boolean>;
  lookupKnownClientOrderId?: (clientOrderId: string) => Promise<unknown | null>;
};

function identitiesFor(o: BingXSubmissionObservation): BrokerIdentity[] {
  const result: BrokerIdentity[] = [];
  if (o.clientOrderId) result.push(createBrokerIdentity({ kind: "CLIENT_ORDER_ID", value: o.clientOrderId }));
  if (o.brokerOrderId && o.brokerOrderIdPrecisionTrusted) result.push(createBrokerIdentity({ kind: "TRUSTED_BROKER_ORDER_ID", value: o.brokerOrderId, precisionTrusted: true }));
  if (o.executionId) result.push(createBrokerIdentity({ kind: "EXECUTION_ID", value: o.executionId }));
  return result;
}
function snapshot(o: BingXSubmissionObservation): BrokerObservationSnapshot {
  return { source: o.source, clientOrderId: o.clientOrderId, brokerOrderId: o.brokerOrderId, brokerOrderIdPrecisionTrusted: o.brokerOrderIdPrecisionTrusted, symbol: o.symbol ?? "UNKNOWN", side: o.side, quantity: o.quantity, price: o.price, feeAmount: o.feeAmount, feeAsset: o.feeAsset, feeConflict: o.feeConflict, rawBrokerStatus: o.rawStatus, sourceTimestamp: o.sourceTimestamp ? new Date(o.sourceTimestamp) : undefined, observedAt: new Date(o.observedAt) };
}

export async function observeBingXBrokerObjects(deps: Deps): Promise<ExternalObservationSummary> {
  let read: BingXSubmissionReadResults;
  try { read = await deps.read(); } catch (error) { return { scanned: 0, persisted: 0, deduped: 0, rejected: 0, insufficientIdentity: 0, knownGtMatches: 0, sourceFailures: [`READ_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`] }; }
  const knownLookup = deps.lookupKnownClientOrderId ?? ((clientOrderId: string) => getAttemptByAccountAndBrokerClientOrderId(deps.brokerAccountIdentity, clientOrderId));
  const summary = { scanned: 0, persisted: 0, deduped: 0, rejected: 0, insufficientIdentity: 0, knownGtMatches: 0, sourceFailures: [] as string[] };
  for (const source of Object.keys(read) as BingXReconciliationSource[]) {
    const result = read[source];
    if (result.status === "failed") { summary.sourceFailures.push(`${source}:${result.errorCode ?? "BINGX_SOURCE_FAILED"}`); continue; }
    for (const observation of result.observations) {
      summary.scanned++;
      try {
        const identities = identitiesFor(observation);
        if (!identities.length) { summary.rejected++; summary.insufficientIdentity++; continue; }
        if (observation.clientOrderId && await knownLookup(observation.clientOrderId)) { summary.knownGtMatches++; continue; }
        const object = await (deps.findOrCreate ?? findOrCreateBrokerObjectByReliableIdentities)({ brokerAccountIdentity: deps.brokerAccountIdentity, identities, classification: "BROKER_OBSERVED_ONLY" });
        const inserted = await (deps.recordIfNew ?? recordBrokerObservationIfNew)({ brokerObjectId: object.id, snapshot: snapshot(observation) });
        if (inserted) summary.persisted++; else summary.deduped++;
      } catch (error) {
        summary.sourceFailures.push(`${source}:${error instanceof Error ? error.message : "OBSERVATION_PERSISTENCE_FAILED"}`);
      }
    }
  }
  return summary;
}
