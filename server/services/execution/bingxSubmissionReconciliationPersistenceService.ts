import { randomUUID } from "node:crypto";
import { reconcileBingXSubmissionForUser, type ReconciliationResult } from "./bingxSubmissionReconciliationService";
import {
  claimReconciliationAttempt,
  completeReconciliationConflict,
  completeReconciliationNoMatch,
  completeReconciliationUnresolved,
  getReconciliationRunByAttemptAndKey,
  persistMatchedReconciliation,
} from "../orders/goodTradingOrderReconciliationRepository";
import { getIntentByLogicalOrderUid, listAttemptsForIntent } from "../orders/goodTradingOrderIntentRepository";
import { getGoodTradingAccountByUserId } from "../accounts/goodTradingAccountRepository";
import { createBrokerIdentity, type BrokerIdentity, type BrokerObservationSnapshot } from "../../../shared/durableOrderReconciliation";

export type DurableReconciliationConsumptionResult = Readonly<ReconciliationResult & { durableRunId?: string }>;
type DurableRun = Readonly<{ id: string; runStatus: string; result?: string | null }>;
type Dependencies = {
  runKey?: string;
  getIntent?: typeof getIntentByLogicalOrderUid;
  listAttempts?: typeof listAttemptsForIntent;
  getAccount?: typeof getGoodTradingAccountByUserId;
  existingRun?: (attemptId: string, runKey: string) => Promise<DurableRun | null>;
  claim?: typeof claimReconciliationAttempt;
  reconcile?: typeof reconcileBingXSubmissionForUser;
  persist?: (kind: ReconciliationResult["status"], result: ReconciliationResult, runId: string) => Promise<{ id: string; result: string }>;
};

function normalizeRun(row: Record<string, unknown> | null): DurableRun | null { return row ? { id: String(row.id), runStatus: String(row.runStatus ?? row.run_status), result: row.result == null ? null : String(row.result) } : null; }

function completedResult(run: DurableRun, logicalOrderUid: string): DurableReconciliationConsumptionResult {
  const status = run.result as ReconciliationResult["status"];
  if (!["MATCHED", "CONFLICT", "NO_MATCH_IN_OBSERVED_WINDOW", "UNRESOLVED"].includes(status)) throw new Error("INVALID_COMPLETED_RECONCILIATION_RESULT");
  return { status, logicalOrderUid, durableRunId: run.id, sources: [], observations: [], sourceStatuses: { OPEN_ORDERS: "loaded", ORDER_HISTORY: "loaded", FILL_HISTORY: "loaded" }, absenceProven: false, retryAuthorized: false };
}

function identitiesFor(result: ReconciliationResult): BrokerIdentity[] {
  const identities: BrokerIdentity[] = [];
  for (const observation of result.observations) {
    if (observation.clientOrderId) identities.push(createBrokerIdentity({ kind: "CLIENT_ORDER_ID", value: observation.clientOrderId }));
    if (observation.brokerOrderId && observation.brokerOrderIdPrecisionTrusted) identities.push(createBrokerIdentity({ kind: "TRUSTED_BROKER_ORDER_ID", value: observation.brokerOrderId, precisionTrusted: true }));
    if (observation.executionId) identities.push(createBrokerIdentity({ kind: "EXECUTION_ID", value: observation.executionId }));
  }
  return Array.from(new Map(identities.map(identity => [`${identity.kind}:${identity.value}`, identity])).values());
}

function toSnapshot(observation: ReconciliationResult["observations"][number]): BrokerObservationSnapshot {
  return { source: observation.source, clientOrderId: observation.clientOrderId, brokerOrderId: observation.brokerOrderId, brokerOrderIdPrecisionTrusted: observation.brokerOrderIdPrecisionTrusted, symbol: observation.symbol ?? "UNKNOWN", side: observation.side, quantity: observation.quantity, price: observation.price, rawBrokerStatus: observation.rawStatus, sourceTimestamp: observation.sourceTimestamp ? new Date(observation.sourceTimestamp) : undefined, observedAt: new Date(observation.observedAt) };
}

async function persistDefault(result: ReconciliationResult, runId: string, accountIdentity: string, attemptId: string, intentId: string): Promise<void> {
  const metadata = { sourceStatuses: result.sourceStatuses, sourceErrorCodes: result.errorCodes ?? [], queryWindowMetadata: { sources: result.sources } };
  if (result.status === "MATCHED") {
    if (!result.observations.length) throw new Error("MATCHED_REQUIRES_OBSERVATION");
    await persistMatchedReconciliation({ runId, brokerAccountIdentity: accountIdentity, identities: identitiesFor(result), attemptId, intentId, snapshot: toSnapshot(result.observations[0]), snapshots: result.observations.slice(1).map(toSnapshot) });
  } else if (result.status === "CONFLICT") {
    await completeReconciliationConflict(runId, { ...metadata, conflictReasons: ["CORROBORATING_EVIDENCE_CONFLICT"] });
  } else if (result.status === "NO_MATCH_IN_OBSERVED_WINDOW") {
    await completeReconciliationNoMatch(runId, metadata);
  } else {
    await completeReconciliationUnresolved(runId, metadata);
  }
}

export async function consumeBingXSubmissionReconciliation(userId: number, logicalOrderUid: string, dependencies: Dependencies = {}): Promise<DurableReconciliationConsumptionResult> {
  const runKey = dependencies.runKey ?? `reconciliation-${randomUUID()}`;
  let attemptId = "UNRESOLVED";
  let intentId = logicalOrderUid;
  let accountIdentity = "UNRESOLVED";
  let run: DurableRun | null = null;
  if (!dependencies.persist) {
    const intent = await (dependencies.getIntent ?? getIntentByLogicalOrderUid)(logicalOrderUid);
    const attempts = intent ? await (dependencies.listAttempts ?? listAttemptsForIntent)(logicalOrderUid) : [];
    const attempt = attempts.find(candidate => candidate.attemptNumber === 1);
    if (!intent || !attempt || !["UNKNOWN_SUBMISSION_OUTCOME", "RECONCILIATION_REQUIRED", "SUBMISSION_RESPONSE_OBSERVED"].includes(attempt.transportState)) throw new Error("RECONCILIATION_NOT_ELIGIBLE");
    attemptId = attempt.attemptId; intentId = logicalOrderUid;
    const account = await (dependencies.getAccount ?? getGoodTradingAccountByUserId)(userId); if (!account || account.accountUid !== intent.goodTradingAccountUid) throw new Error("ACCOUNT_CONTEXT_MISMATCH"); accountIdentity = account.accountUid;
    run = normalizeRun(await (dependencies.existingRun ?? getReconciliationRunByAttemptAndKey)(attemptId, runKey) as Record<string, unknown> | null);
    if (!run) { const claimed = await (dependencies.claim ?? claimReconciliationAttempt)(attemptId, runKey, intentId, logicalOrderUid); run = normalizeRun(claimed.run as Record<string, unknown>); }
    if (!run) throw new Error("RECONCILIATION_RUN_SETUP_FAILED");
    if (run.runStatus === "COMPLETED") return completedResult(run, logicalOrderUid);
  }
  const result = dependencies.reconcile ? await dependencies.reconcile(userId, logicalOrderUid) : await reconcileBingXSubmissionForUser(userId, logicalOrderUid);
  const durableRunId = run?.id ?? `RUN-${randomUUID()}`;
  try {
    if (dependencies.persist) await dependencies.persist(result.status, result, durableRunId);
    else await persistDefault(result, durableRunId, accountIdentity, attemptId, intentId);
  } catch (error) { throw Object.assign(new Error("RECONCILIATION_PERSISTENCE_FAILED", { cause: error }), { code: "RECONCILIATION_PERSISTENCE_FAILED" }); }
  return { ...result, durableRunId };
}
