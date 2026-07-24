/**
 * AI-7.3.12 — Persist Independent Evidence Audit against existing productive run.
 * Does NOT re-run productive distillation. Append-only audit only.
 *
 * Usage (Railway): railway run -s TERMINAL -- npx tsx scripts/ai7312-persist-independent-evidence-audit.ts
 */
import { getDurableRepos } from "../server/ai/goodTradingAi/durableCalibration/factory";
import { assessStorageHealth } from "../server/ai/goodTradingAi/durableCalibration/health";
import { getCriticalCalibrationMemory } from "../server/ai/goodTradingAi/criticalCalibration/memoryStore";
import { runIndependentEvidenceAudit } from "../server/ai/goodTradingAi/knowledgeDistillation/independentEvidence";
import { getIndependentEvidenceAuditMemory } from "../server/ai/goodTradingAi/knowledgeDistillation/independentEvidence/memoryStore";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "../server/ai/goodTradingAi/knowledgeDistillation/features";
import { isGoodTradingAiKnowledgeEvolutionEnabled } from "../server/ai/goodTradingAi/knowledgeEvolution/features";
import { isGoodTradingAiKnowledgeProvenanceEnabled } from "../server/ai/goodTradingAi/knowledgeProvenance/features";

async function main() {
  const health = await assessStorageHealth({ priorHumanLossSuspected: true });
  const repos = await getDurableRepos();
  const runIds = await repos.knowledgeDistillation.listRunIds();
  const target =
    runIds.find((id) => id.includes("strict")) ?? runIds[runIds.length - 1];
  if (!target) {
    console.log(JSON.stringify({ ok: false, code: "NO_SOURCE_RUN" }));
    process.exit(1);
  }
  const sourceRun = await repos.knowledgeDistillation.getRun(target);
  if (!sourceRun) {
    console.log(JSON.stringify({ ok: false, code: "SOURCE_RUN_NOT_FOUND", target }));
    process.exit(1);
  }
  const fp = (sourceRun as { sourceFingerprint?: string }).sourceFingerprint;
  const sessionIds = ((sourceRun as { sourceSessionIds?: string[] }).sourceSessionIds ?? []) as string[];
  const store = getCriticalCalibrationMemory();
  // Prefer durable CC observations if available
  let raw = sessionIds.length
    ? (
        await Promise.all(
          sessionIds.map(async (id) => repos.criticalCalibration.listObservations(id)),
        )
      ).flat()
    : await repos.criticalCalibration.listObservations();
  if (!raw.length) {
    raw = sessionIds.length
      ? sessionIds.flatMap((id) => store.listObservations(id))
      : store.listObservations();
  }

  const audit = runIndependentEvidenceAudit({
    sourceRunId: target,
    sourceFingerprint: fp,
    rawObservations: raw,
    sourceRun,
    auditId: `ieu_audit_${Date.now()}`,
  });

  getIndependentEvidenceAuditMemory().saveAudit(audit);
  let persisted = false;
  let persistError: string | undefined;
  try {
    if (repos.knowledgeDistillation.saveIndependentEvidenceAudit) {
      await repos.knowledgeDistillation.saveIndependentEvidenceAudit(audit);
      persisted = true;
    } else {
      persistError = "SAVE_AUDIT_NOT_IMPLEMENTED";
    }
  } catch (e) {
    persistError = e instanceof Error ? e.message : "PERSIST_FAILED";
  }

  // Integrity: original run still present, fingerprint unchanged
  const reloaded = await repos.knowledgeDistillation.getRun(target);
  const fpAfter = (reloaded as { sourceFingerprint?: string } | null)?.sourceFingerprint;

  console.log(
    JSON.stringify({
      ok: true,
      fase: "AI-7.3.12",
      sourceRunIdRedacted: target.slice(0, 8) + "…" + target.slice(-4),
      fingerprintPartial: (fp ?? "").slice(0, 12),
      fingerprintUnchanged: fp === fpAfter,
      documentObservationCount: audit.documentObservationCount,
      decisionUnitCount: audit.decisionUnitCount,
      independentSupportMetrics: audit.independentSupportMetrics,
      conflictAudit: audit.conflictAudit,
      utility: audit.utilityReassessment.auditedClass,
      originalUtilityHint: "DISTILLATION_USEFUL",
      proposalAuditClasses: audit.proposalAudit.map((p) => p.classification),
      gapCount: audit.gapAudit.length,
      challengeAudit: audit.challengeAudit,
      sampleSafety: audit.confidenceAudit.sampleSafety,
      hasMature: audit.confidenceAudit.hasMature,
      containsAnswerText: audit.containsAnswerText,
      brainMutate: audit.brainMutate,
      autoApply: audit.autoApply,
      mentorEligible: audit.mentorEligible,
      persisted,
      persistError,
      storage: {
        repositoryDurable: health.repositoryDurable,
        distillationAllowed: health.distillationAllowed,
      },
      flags: {
        kd: isGoodTradingAiKnowledgeDistillationEnabled(),
        ke: isGoodTradingAiKnowledgeEvolutionEnabled(),
        kp: isGoodTradingAiKnowledgeProvenanceEnabled(),
      },
    }),
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
