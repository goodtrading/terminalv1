/**
 * AI-7.3.13 — Dump redacted Independent Evidence Audit metadata (no answer text).
 * Usage: railway run -s TERMINAL -- npx tsx scripts/ai7313-dump-audit-meta.ts
 */
import { getDurableRepos } from "../server/ai/goodTradingAi/durableCalibration/factory";
import { assessStorageHealth } from "../server/ai/goodTradingAi/durableCalibration/health";
import { getCriticalCalibrationMemory } from "../server/ai/goodTradingAi/criticalCalibration/memoryStore";

function redactId(id: string | undefined | null): string | null {
  if (!id) return null;
  if (id.length <= 12) return id.slice(0, 4) + "…";
  return id.slice(0, 8) + "…" + id.slice(-4);
}

async function main() {
  const health = await assessStorageHealth({ priorHumanLossSuspected: true });
  const repos = await getDurableRepos();
  const runIds = await repos.knowledgeDistillation.listRunIds();
  const target = runIds.find((id) => id.includes("strict")) ?? runIds[runIds.length - 1];
  if (!target) {
    console.log(JSON.stringify({ ok: false, code: "NO_SOURCE_RUN" }));
    process.exit(1);
  }
  const sourceRun = await repos.knowledgeDistillation.getRun(target);
  const audits = repos.knowledgeDistillation.listIndependentEvidenceAudits
    ? await repos.knowledgeDistillation.listIndependentEvidenceAudits()
    : [];
  const audit = audits[audits.length - 1] as Record<string, unknown> | undefined;
  if (!audit) {
    console.log(JSON.stringify({ ok: false, code: "NO_AUDIT" }));
    process.exit(1);
  }

  const challenges = ((sourceRun as { challenges?: Array<Record<string, unknown>> })?.challenges ?? []) as Array<
    Record<string, unknown>
  >;
  const challengeIds = ((audit.challengeAudit as { challengeIds?: string[] })?.challengeIds ?? []) as string[];
  const picked = challengeIds.map((id) => {
    const c = challenges.find((x) => x.id === id) ?? { id };
    return {
      id: c.id,
      kind: c.kind,
      relatedLenses: c.relatedLenses,
      discriminationScore: c.discriminationScore,
      // Prompt length only — never print full challenge prompt with prior human claim text if any
      promptLen: typeof c.prompt === "string" ? (c.prompt as string).length : 0,
      promptPreview:
        typeof c.prompt === "string"
          ? String(c.prompt)
              .replace(/"[^"]{20,}"/g, '"…"')
              .slice(0, 180)
          : null,
      hypothesisA: typeof c.hypothesisA === "string" ? String(c.hypothesisA).slice(0, 80) : null,
      hypothesisB: typeof c.hypothesisB === "string" ? String(c.hypothesisB).slice(0, 80) : null,
      targetClusterId: c.targetClusterId ?? null,
      neverAnswers: c.neverAnswers === true,
    };
  });

  const gaps = ((audit.gapAudit as Array<Record<string, unknown>>) ?? []).slice(0, 3).map((g) => ({
    id: g.id,
    subject: g.subject,
    classification: g.classification,
    severity: g.severity,
    detailLen: typeof g.detail === "string" ? (g.detail as string).length : 0,
  }));

  const proposals = ((audit.proposalAudit as Array<Record<string, unknown>>) ?? []).map((p) => ({
    proposalId: redactId(String(p.proposalId ?? "")),
    classification: p.classification,
    documentSupportCount: p.documentSupportCount,
    decisionUnitSupportCount: p.decisionUnitSupportCount,
    independentCaseSupportCount: p.independentCaseSupportCount,
    sameCaseInflationDetected: p.sameCaseInflationDetected,
    remainsValidAfterAudit: p.remainsValidAfterAudit,
    statusUnchanged: p.statusUnchanged,
  }));

  const clusters = ((audit.clusterAudit as Array<Record<string, unknown>>) ?? []).slice(0, 20).map((c) => ({
    id: c.id,
    supportClass: c.supportClass,
    decisionUnitMemberCount: c.decisionUnitMemberCount,
    independentCaseCount: c.independentCaseCount,
    crossCaseSupportCount: c.crossCaseSupportCount,
    lenses: c.lenses,
  }));

  const supportByClass: Record<string, number> = {};
  for (const c of (audit.clusterAudit as Array<Record<string, unknown>>) ?? []) {
    const k = String(c.supportClass ?? "?");
    supportByClass[k] = (supportByClass[k] ?? 0) + 1;
  }

  // Existing HUMAN sessions (redacted)
  const mem = getCriticalCalibrationMemory();
  let sessions = await repos.criticalCalibration.listSessions();
  if (!sessions.length) sessions = mem.listSessions();
  const humanSessions = sessions
    .filter((s) => s.kind === "HUMAN")
    .map((s) => ({
      id: redactId(s.id),
      label: s.label ?? null,
      questionCount: s.questionIds.length,
      archived: s.archived,
      answeredApprox: undefined as number | undefined,
    }));

  // Sample first-session question prompts (length + hash only) to avoid duplicate wording
  const qIds = sessions.find((s) => s.kind === "HUMAN" && s.questionIds.length >= 15)?.questionIds ?? [];
  const allQ = [...mem.listQuestions(), ...(await (repos.criticalCalibration.listQuestions?.() ?? Promise.resolve([])))];
  const priorPrompts = qIds.slice(0, 15).map((id) => {
    const q = allQ.find((x) => x.id === id);
    return {
      id: redactId(id),
      type: q?.questionType ?? null,
      lenses: q?.relatedLenses ?? [],
      promptLen: q?.prompt?.length ?? 0,
      promptHead: q?.prompt ? q.prompt.slice(0, 90) : null,
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        health: {
          status: (health as { status?: string }).status,
          repositoryDurable: health.repositoryDurable,
          distillationAllowed: health.distillationAllowed,
        },
        sourceRunId: redactId(target),
        fingerprintPartial: String((sourceRun as { sourceFingerprint?: string })?.sourceFingerprint ?? "").slice(0, 12),
        auditId: redactId(String(audit.id ?? "")),
        schema: audit.schema,
        analysisVersionHint: "independent-evidence-v1",
        decisionUnitCount: audit.decisionUnitCount,
        documentObservationCount: audit.documentObservationCount,
        independentSupportMetrics: audit.independentSupportMetrics,
        conflictAudit: audit.conflictAudit,
        utility: (audit.utilityReassessment as { auditedClass?: string })?.auditedClass,
        containsAnswerText: audit.containsAnswerText,
        mentorEligible: audit.mentorEligible,
        brainMutate: audit.brainMutate,
        autoApply: audit.autoApply,
        challengeIds,
        pickedChallenges: picked,
        priorityGaps: gaps,
        proposals,
        clusterSupportByClass: supportByClass,
        sampleClusters: clusters,
        humanSessions,
        priorPromptSamples: priorPrompts,
        compressedProposalTitles: ((sourceRun as { compressedProposals?: Array<{ id: string; title: string; status: string }> })
          ?.compressedProposals ?? []).map((p) => ({
          id: redactId(p.id),
          titleHead: p.title.slice(0, 60),
          status: p.status,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
