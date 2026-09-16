import { consumeBingXSubmissionReconciliation } from "./bingxSubmissionReconciliationPersistenceService";
import { getLatestCompletedReconciliationForAttempt, listRecoveryCandidates, claimReconciliationAttempt, getReconciliationRunByAttemptAndKey } from "../orders/goodTradingOrderReconciliationRepository";
import { getIntentByLogicalOrderUid, markReconciliationRequired, markUnknownSubmissionOutcome } from "../orders/goodTradingOrderIntentRepository";

export type RecoveryCandidate = Readonly<{ attemptId: string; intentId: string; logicalOrderUid: string; userId: number; transportState: string; startedAt: Date | null }>;
export type CompletedRecoveryRun = Readonly<{ id: string; result: string; completedAt: Date }>;
export type RecoverySummary = Readonly<{ scanned: number; promoted: number; consumed: number; skipped: number; failed: number }>;

type Deps = {
  now?: Date;
  listCandidates?: (cutoff: Date, limit: number) => Promise<RecoveryCandidate[]>;
  getIntent?: typeof getIntentByLogicalOrderUid;
  markUnknown?: (logicalOrderUid: string, evidence: { errorCode: string; errorClass: string }) => Promise<unknown>;
  markRequired?: (logicalOrderUid: string) => Promise<unknown>;
  latestCompleted?: (attemptId: string) => Promise<CompletedRecoveryRun | null>;
  consume?: typeof consumeBingXSubmissionReconciliation;
  claim?: typeof claimReconciliationAttempt;
  existingRun?: (attemptId: string, runKey: string) => Promise<Record<string, unknown> | null>;
};

type CandidateOutcome = Readonly<{ promoted: boolean; status: "consumed" | "skipped" | "failed" }>;

export function recoveryGenerationKey(attemptId: string, latest: { id: string } | null): string {
  return `recovery:${attemptId}:${latest?.id ?? "INITIAL"}`;
}

async function waitForCompletedRun(attemptId: string, runKey: string, existingRun?: (attemptId: string, runKey: string) => Promise<Record<string, unknown> | null>): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const run = await (existingRun ?? getReconciliationRunByAttemptAndKey)(attemptId, runKey);
    if (run && String(run.run_status ?? run.runStatus) === "COMPLETED") return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function processCandidate(candidate: RecoveryCandidate, cutoff: Date, deps: Deps): Promise<CandidateOutcome> {
  let promoted = false;
  try {
    if (candidate.transportState === "SUBMISSION_STARTED") {
      await (deps.markUnknown ?? ((uid, evidence) => markUnknownSubmissionOutcome(uid, evidence)))(candidate.intentId, { errorCode: "CRASH_RECOVERY_STALE_SUBMISSION", errorClass: "CRASH_RECOVERY" });
      await (deps.markRequired ?? markReconciliationRequired)(candidate.intentId);
      promoted = true;
    } else if (candidate.transportState === "UNKNOWN_SUBMISSION_OUTCOME") {
      await (deps.markRequired ?? markReconciliationRequired)(candidate.intentId);
      promoted = true;
    }
    const latest = await (deps.latestCompleted ?? getLatestCompletedReconciliationForAttempt)(candidate.attemptId);
    if (latest && ["MATCHED", "CONFLICT"].includes(latest.result)) return { promoted, status: "skipped" };
    if (latest && ["NO_MATCH_IN_OBSERVED_WINDOW", "UNRESOLVED"].includes(latest.result) && latest.completedAt.getTime() >= cutoff.getTime()) return { promoted, status: "skipped" };
    const intent = await (deps.getIntent ?? getIntentByLogicalOrderUid)(candidate.logicalOrderUid);
    if (!intent) throw new Error("RECOVERY_INTENT_NOT_FOUND");
    const runKey = recoveryGenerationKey(candidate.attemptId, latest);
    const claim = await (deps.claim ?? claimReconciliationAttempt)(candidate.attemptId, runKey, candidate.intentId, candidate.logicalOrderUid);
    if (!claim.claimed) return { promoted, status: (await waitForCompletedRun(candidate.attemptId, runKey, deps.existingRun)) ? "skipped" : "failed" };
    await (deps.consume ?? consumeBingXSubmissionReconciliation)(candidate.userId, candidate.logicalOrderUid, { runKey });
    return { promoted, status: "consumed" };
  } catch {
    return { promoted, status: "failed" };
  }
}

export async function runBingXCrashRecoverySweep(deps: Deps = {}): Promise<RecoverySummary> {
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - 60_000);
  const candidates = (await (deps.listCandidates ?? (async (date, limit) => (await listRecoveryCandidates(date, limit)) as RecoveryCandidate[]))(cutoff, 25)).slice(0, 25);
  const summary = { scanned: candidates.length, promoted: 0, consumed: 0, skipped: 0, failed: 0 };
  const outcomes = await Promise.all(candidates.map(candidate => processCandidate(candidate, cutoff, deps)));
  for (const outcome of outcomes) {
    if (outcome.promoted) summary.promoted++;
    if (outcome.status === "consumed") summary.consumed++;
    else if (outcome.status === "skipped") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}
