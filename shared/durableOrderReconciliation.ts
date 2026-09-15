import { randomUUID } from "node:crypto";

export type ReconciliationRunStatus = "STARTED" | "COMPLETED";
export type ReconciliationResult = "MATCHED" | "CONFLICT" | "NO_MATCH_IN_OBSERVED_WINDOW" | "UNRESOLVED";
export type BrokerObservationClassification = "GT_LINKED" | "BROKER_OBSERVED_ONLY";
export type ReliableBrokerIdentityKind = "CLIENT_ORDER_ID" | "TRUSTED_BROKER_ORDER_ID" | "EXECUTION_ID";
export type ReconciliationSource = "OPEN_ORDERS" | "ORDER_HISTORY" | "FILL_HISTORY";

export type BrokerIdentity = Readonly<{
  kind: ReliableBrokerIdentityKind;
  value: string;
  precisionTrusted?: boolean;
}>;

export type BrokerObservationSnapshot = Readonly<{
  source: ReconciliationSource;
  clientOrderId?: string;
  brokerOrderId?: string;
  brokerOrderIdPrecisionTrusted: boolean;
  executionId?: string;
  symbol: string;
  side?: string;
  quantity?: string;
  price?: string;
  rawBrokerStatus?: string;
  sourceTimestamp?: Date;
  observedAt: Date;
}>;

export type ReconciliationRunInput = Readonly<{
  id?: string;
  attemptId: string;
  intentId: string;
  logicalOrderUid: string;
  runKey: string;
  queriedSources: ReconciliationSource[];
  absenceProven?: boolean;
  retryAuthorized?: boolean;
  startedAt?: Date;
}>;

export function createBrokerIdentity(input: BrokerIdentity): BrokerIdentity {
  if (!Object.values(["CLIENT_ORDER_ID", "TRUSTED_BROKER_ORDER_ID", "EXECUTION_ID"] as const).includes(input.kind)) throw new Error("identity kind is invalid");
  if (typeof input.value !== "string" || input.value.length === 0) throw new Error("identity value is required");
  if (input.kind === "TRUSTED_BROKER_ORDER_ID" && input.precisionTrusted !== true) throw new Error("trusted broker order identity requires precisionTrusted=true");
  return { kind: input.kind, value: input.value, precisionTrusted: input.kind === "TRUSTED_BROKER_ORDER_ID" ? true : input.precisionTrusted ?? true };
}

export function createReconciliationRunInput(input: ReconciliationRunInput): ReconciliationRunInput & { id: string; absenceProven: false; retryAuthorized: false; startedAt: Date } {
  if (!input.attemptId || !input.intentId || !input.logicalOrderUid || !input.runKey) throw new Error("reconciliation run identity is required");
  if (input.absenceProven === true || input.retryAuthorized === true) throw new Error("V1 reconciliation safety flags must be false");
  return { ...input, id: input.id ?? `GT-RECON-${randomUUID()}`, absenceProven: false, retryAuthorized: false, startedAt: input.startedAt ?? new Date() };
}
