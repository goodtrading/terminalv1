import {
  getCredentialsForUser,
  getFirstConnectedConnectionForUser,
} from "../exchanges/bingx/bingxCredentialStore";
import {
  getGoodTradingAccountByUserId,
} from "../accounts/goodTradingAccountRepository";
import {
  getIntentByLogicalOrderUid,
  listAttemptsForIntent,
} from "../orders/goodTradingOrderIntentRepository";
import {
  readBingXSubmissionSources,
  type BingXReconciliationSource,
  type BingXSubmissionObservation,
  type BingXSubmissionReadResults,
} from "../exchanges/bingx/bingxSubmissionReconciliationReader";

export type ReconciliationStatus = "MATCHED" | "CONFLICT" | "NO_MATCH_IN_OBSERVED_WINDOW" | "UNRESOLVED";
export type ReconciliationResult = Readonly<{
  status: ReconciliationStatus;
  logicalOrderUid?: string;
  brokerClientOrderId?: string;
  sources: BingXReconciliationSource[];
  observations: BingXSubmissionObservation[];
  sourceStatuses: Readonly<Record<BingXReconciliationSource, "loaded" | "failed">>;
  absenceProven: false;
  retryAuthorized: false;
  errorCodes?: string[];
}>;

type DurableSubmissionInput = Readonly<{
  logicalOrderUid: string;
  brokerClientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
}>;
type ReadSources = () => Promise<BingXSubmissionReadResults>;

function canonicalDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function sameDecimal(a: string, b: string): boolean {
  return canonicalDecimal(a) === canonicalDecimal(b);
}

function sameSymbol(observed: string, expected: string): boolean {
  return observed.trim().toUpperCase().replace(/_/g, "-") === expected.trim().toUpperCase().replace(/_/g, "-");
}

function sourceStatuses(read: BingXSubmissionReadResults) {
  return {
    OPEN_ORDERS: read.OPEN_ORDERS.status,
    ORDER_HISTORY: read.ORDER_HISTORY.status,
    FILL_HISTORY: read.FILL_HISTORY.status,
  } as const;
}

export async function reconcileBingXSubmission(input: {
  durable: DurableSubmissionInput;
  read: ReadSources;
}): Promise<ReconciliationResult> {
  const read = await input.read();
  const statuses = sourceStatuses(read);
  const failed = Object.values(read).filter((source) => source.status === "failed");
  const observations = Object.values(read).flatMap((source) => source.observations);
  const matchingIds = observations.filter((observation) => observation.clientOrderId === input.durable.brokerClientOrderId);
  const sources = Array.from(new Set(matchingIds.map((observation) => observation.source)));
  const errorCodes = failed.map((source) => source.errorCode).filter((code): code is string => !!code);

  if (failed.length > 0) {
    return { status: "UNRESOLVED", logicalOrderUid: input.durable.logicalOrderUid, brokerClientOrderId: input.durable.brokerClientOrderId, sources, observations: matchingIds, sourceStatuses: statuses, absenceProven: false, retryAuthorized: false, ...(errorCodes.length ? { errorCodes } : {}) };
  }
  if (matchingIds.length === 0) {
    return { status: "NO_MATCH_IN_OBSERVED_WINDOW", logicalOrderUid: input.durable.logicalOrderUid, brokerClientOrderId: input.durable.brokerClientOrderId, sources: [], observations: [], sourceStatuses: statuses, absenceProven: false, retryAuthorized: false };
  }

  const conflict = matchingIds.some((observation) =>
    (observation.symbol !== undefined && !sameSymbol(observation.symbol, input.durable.symbol)) ||
    (observation.side !== undefined && observation.side.toLowerCase() !== input.durable.side) ||
    (observation.quantity !== undefined && !sameDecimal(observation.quantity, input.durable.quantity)) ||
    (observation.price !== undefined && !sameDecimal(observation.price, input.durable.price)),
  );
  return {
    status: conflict ? "CONFLICT" : "MATCHED",
    logicalOrderUid: input.durable.logicalOrderUid,
    brokerClientOrderId: input.durable.brokerClientOrderId,
    sources,
    observations: matchingIds,
    sourceStatuses: statuses,
    absenceProven: false,
    retryAuthorized: false,
  };
}

export async function reconcileBingXSubmissionForUser(
  userId: number,
  logicalOrderUid: string,
  dependencies: {
    getIntent?: typeof getIntentByLogicalOrderUid;
    listAttempts?: typeof listAttemptsForIntent;
    getAccount?: typeof getGoodTradingAccountByUserId;
    getConnection?: typeof getFirstConnectedConnectionForUser;
    getCredentials?: typeof getCredentialsForUser;
    readSources?: typeof readBingXSubmissionSources;
  } = {},
): Promise<ReconciliationResult> {
  const intent = await (dependencies.getIntent ?? getIntentByLogicalOrderUid)(logicalOrderUid);
  const attempts = intent ? await (dependencies.listAttempts ?? listAttemptsForIntent)(logicalOrderUid) : [];
  const attempt = attempts.find((candidate) => candidate.attemptNumber === 1);
  const baseStatuses = { OPEN_ORDERS: "loaded", ORDER_HISTORY: "loaded", FILL_HISTORY: "loaded" } as const;
  if (!intent || !attempt || !["RECONCILIATION_REQUIRED", "SUBMISSION_RESPONSE_OBSERVED"].includes(attempt.transportState)) {
    return { status: "UNRESOLVED", logicalOrderUid, sources: [], observations: [], sourceStatuses: baseStatuses, absenceProven: false, retryAuthorized: false };
  }
  const account = await (dependencies.getAccount ?? getGoodTradingAccountByUserId)(userId);
  if (!account || account.accountUid !== intent.goodTradingAccountUid) {
    return { status: "UNRESOLVED", logicalOrderUid, brokerClientOrderId: attempt.brokerClientOrderId, sources: [], observations: [], sourceStatuses: baseStatuses, absenceProven: false, retryAuthorized: false, errorCodes: ["ACCOUNT_CONTEXT_MISMATCH"] };
  }
  const connection = (dependencies.getConnection ?? getFirstConnectedConnectionForUser)(userId);
  const credentials = connection ? (dependencies.getCredentials ?? getCredentialsForUser)(connection.id, userId) : undefined;
  if (!connection || !credentials) {
    return { status: "UNRESOLVED", logicalOrderUid, brokerClientOrderId: attempt.brokerClientOrderId, sources: [], observations: [], sourceStatuses: baseStatuses, absenceProven: false, retryAuthorized: false, errorCodes: ["BINGX_READ_CONTEXT_UNAVAILABLE"] };
  }
  const readSources: ReadSources = dependencies.readSources
    ? () => dependencies.readSources!(credentials, intent.sourceNativeSymbol)
    : () => readBingXSubmissionSources(credentials, intent.sourceNativeSymbol);
  return reconcileBingXSubmission({
    durable: { logicalOrderUid, brokerClientOrderId: attempt.brokerClientOrderId, symbol: intent.sourceNativeSymbol, side: intent.requestedSide, quantity: intent.resolvedQuantity, price: intent.limitPrice },
    read: readSources,
  });
}
