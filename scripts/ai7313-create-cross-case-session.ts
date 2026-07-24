/**
 * AI-7.3.13 — Create durable HUMAN cross-case session (5 Q, 0 answers) + initial backup.
 * Usage: railway run -s TERMINAL -- npx tsx scripts/ai7313-create-cross-case-session.ts
 * Never answers for Ignacio. Never runs distillation.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { assessStorageHealth } from "../server/ai/goodTradingAi/durableCalibration/health";
import { getDurableRepos } from "../server/ai/goodTradingAi/durableCalibration/factory";
import { exportCalibrationBackup } from "../server/ai/goodTradingAi/durableCalibration/backup";
import {
  startCrossCaseValidationSession,
  CROSS_CASE_SESSION_LABEL,
  assertNoForbiddenBlindFields,
} from "../server/ai/goodTradingAi/knowledgeDistillation/crossCaseValidation";
import {
  getBlindPacket,
  revealAfterCalibrationSubmit,
  getSessionProgress,
} from "../server/ai/goodTradingAi/criticalCalibration/sessionService";
import { getCriticalCalibrationMemory } from "../server/ai/goodTradingAi/criticalCalibration/memoryStore";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "../server/ai/goodTradingAi/knowledgeDistillation/features";
import { isGoodTradingAiCriticalCalibrationEnabled } from "../server/ai/goodTradingAi/criticalCalibration/features";
import { isGoodTradingAiKnowledgeEvolutionEnabled } from "../server/ai/goodTradingAi/knowledgeEvolution/features";
import { isGoodTradingAiKnowledgeProvenanceEnabled } from "../server/ai/goodTradingAi/knowledgeProvenance/features";
import type { ChallengeItem } from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";

function redact(id: string): string {
  return id.length <= 12 ? id.slice(0, 4) + "…" : id.slice(0, 8) + "…" + id.slice(-4);
}

async function main() {
  const health = await assessStorageHealth({ priorHumanLossSuspected: true });
  if (!health.repositoryDurable || health.status !== "DURABLE_READY") {
    console.log(JSON.stringify({ ok: false, code: "NOT_DURABLE", health }));
    process.exit(1);
  }
  const repos = await getDurableRepos();
  const runIds = await repos.knowledgeDistillation.listRunIds();
  const sourceRunId = runIds.find((id) => id.includes("strict")) ?? runIds[runIds.length - 1];
  if (!sourceRunId) {
    console.log(JSON.stringify({ ok: false, code: "NO_SOURCE_RUN" }));
    process.exit(1);
  }
  const sourceRun = await repos.knowledgeDistillation.getRun(sourceRunId);
  const fpBefore = (sourceRun as { sourceFingerprint?: string } | null)?.sourceFingerprint;
  const audits = repos.knowledgeDistillation.listIndependentEvidenceAudits
    ? await repos.knowledgeDistillation.listIndependentEvidenceAudits(sourceRunId)
    : [];
  const allAudits = audits.length
    ? audits
    : repos.knowledgeDistillation.listIndependentEvidenceAudits
      ? await repos.knowledgeDistillation.listIndependentEvidenceAudits()
      : [];
  const audit = allAudits[allAudits.length - 1] as IndependentEvidenceAudit | undefined;
  if (!audit || audit.schema !== "DistillationIndependentEvidenceAudit/v1") {
    console.log(JSON.stringify({ ok: false, code: "NO_IE_AUDIT" }));
    process.exit(1);
  }

  // Avoid duplicate open cross-case sessions
  const existing = await repos.criticalCalibration.listSessions();
  const dup = existing.find(
    (s) =>
      s.kind === "HUMAN" &&
      !s.archived &&
      (s.roundKind === "CROSS_CASE_VALIDATION" ||
        (s.label ?? "").includes("Cross-Case Validation 5")),
  );
  if (dup) {
    const progress = getSessionProgress(dup.id);
    console.log(
      JSON.stringify({
        ok: true,
        reusedExisting: true,
        sessionIdRedacted: redact(dup.id),
        questionCount: dup.questionIds.length,
        answeredCount: progress.answeredCount,
        revealedCount: progress.revealedCount,
        status: progress.status,
        sourceAuditId: redact(dup.sourceAuditId ?? audit.id),
        sourceRunId: redact(dup.sourceRunId ?? sourceRunId),
      }),
    );
    return;
  }

  const challenges = ((sourceRun as { challenges?: ChallengeItem[] } | null)?.challenges ??
    []) as ChallengeItem[];
  const priorQs = await repos.criticalCalibration.listQuestions();
  const started = startCrossCaseValidationSession({
    audit,
    challenges,
    sourceRunId,
    priorPrompts: priorQs.map((q) => q.prompt),
    label: CROSS_CASE_SESSION_LABEL,
    repositoryDurable: true,
  });

  await repos.criticalCalibration.saveSession(started.session);
  const memQs = getCriticalCalibrationMemory().listQuestions();
  const merged = [
    ...priorQs.filter((q) => !started.session.questionIds.includes(q.id)),
    ...started.session.questionIds
      .map((id) => memQs.find((q) => q.id === id)!)
      .filter(Boolean),
  ];
  await repos.criticalCalibration.saveQuestionQueue(merged);

  // Blindness check
  const firstQ = started.session.questionIds[0]!;
  const blind = getBlindPacket(started.session.id, firstQ);
  assertNoForbiddenBlindFields(blind as unknown as Record<string, unknown>);
  let revealBlocked = false;
  try {
    revealAfterCalibrationSubmit(started.session.id, firstQ);
  } catch (e) {
    revealBlocked = String((e as Error).message).includes("ANSWER_REQUIRED_BEFORE_REVEAL");
  }

  // Initial backup outside git
  const backup = await exportCalibrationBackup();
  const payload = JSON.stringify(backup);
  const checksum = createHash("sha256").update(payload).digest("hex");
  const dir = join(homedir(), ".goodtrading-private", "calibration-backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `ai7313-cross-case-initial-${Date.now()}.json`);
  writeFileSync(file, payload, "utf8");

  const fpAfter = (
    await repos.knowledgeDistillation.getRun(sourceRunId)
  ) as { sourceFingerprint?: string } | null;
  const progress = getSessionProgress(started.session.id);

  const relationDistribution = started.drafts.reduce(
    (acc, d) => {
      acc[d.relationToOriginal] = (acc[d.relationToOriginal] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(
    JSON.stringify({
      ok: true,
      fase: "AI-7.3.13",
      sessionIdRedacted: redact(started.session.id),
      fingerprintPartial: (fpBefore ?? "").slice(0, 12),
      fingerprintUnchanged: fpBefore === fpAfter?.sourceFingerprint,
      questionCount: started.questionCount,
      answeredCount: progress.answeredCount,
      revealedCount: progress.revealedCount,
      status: progress.status,
      label: started.session.label,
      sourceAuditId: redact(audit.id),
      sourceRunId: redact(sourceRunId),
      challengeIds: audit.challengeAudit.challengeIds,
      hypothesisKinds: started.hypotheses.map((h) => h.kind),
      relationDistribution,
      neutrality: started.drafts.map((d) => d.neutralityClass),
      variedDimensions: started.drafts.map((d) => d.variedDimensions),
      blindness: {
        firstPacketKeys: Object.keys(blind),
        revealBlocked409: revealBlocked,
        noPriorAnswer: !("previousHumanAnswer" in blind),
        noEngine: !("engineOutcome" in blind),
        noHypothesis: !("targetHypothesisId" in blind),
      },
      backup: {
        version: backup.version,
        checksumSha256Partial: checksum.slice(0, 16),
        pathHint: "~/.goodtrading-private/calibration-backups/ai7313-cross-case-initial-*.json",
        mentorEligible: backup.mentorEligible,
        brainMutate: backup.brainMutate,
      },
      flags: {
        kd: isGoodTradingAiKnowledgeDistillationEnabled(),
        cc: isGoodTradingAiCriticalCalibrationEnabled(),
        ke: isGoodTradingAiKnowledgeEvolutionEnabled(),
        kp: isGoodTradingAiKnowledgeProvenanceEnabled(),
      },
      storage: {
        status: health.status,
        repositoryDurable: health.repositoryDurable,
      },
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
      autoReveal: false,
      distillationSkipped: true,
      note: "Ignacio must answer 5/5 manually. Do not distill until complete.",
    }),
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
