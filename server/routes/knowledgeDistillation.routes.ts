/**
 * AI-7.3.4 Knowledge Distillation routes (admin). Flag default OFF. No OpenAI. No Brain mutate.
 */
import type { Express, Request, Response } from "express";
import { requireKnowledgeDistillationAccess } from "../ai/goodTradingAi/knowledgeDistillation/access";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "../ai/goodTradingAi/knowledgeDistillation/features";
import { getKnowledgeDistillationMemory } from "../ai/goodTradingAi/knowledgeDistillation/memoryStore";
import { buildChallenges } from "../ai/goodTradingAi/knowledgeDistillation/challengeEngine";
import {
  runLegacyKnowledgeDistillationAllAvailable,
  runStrictKnowledgeDistillation,
} from "../ai/goodTradingAi/knowledgeDistillation/strictRun";
import { assessStorageHealth } from "../ai/goodTradingAi/durableCalibration/health";
import { getDurableRepos } from "../ai/goodTradingAi/durableCalibration/factory";
import { getCriticalCalibrationMemory } from "../ai/goodTradingAi/criticalCalibration/memoryStore";
import {
  getIndependentEvidenceAuditMemory,
  runIndependentEvidenceAudit,
} from "../ai/goodTradingAi/knowledgeDistillation/independentEvidence";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";

export function registerKnowledgeDistillationRoutes(app: Express): void {
  const base = "/api/internal/ai/knowledge-distillation";
  const guards = [requireKnowledgeDistillationAccess];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiKnowledgeDistillationEnabled(),
      mentorEligible: false,
      openAi: false,
      brainMutate: false,
      autoApply: false,
      realMarketData: false,
      note: "AI-7.3.4 Knowledge Distillation — deterministic, PENDING proposals only, never mutates Brain.",
    });
  });

  app.post(`${base}/run`, ...guards, async (_req: Request, res: Response) => {
    const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
    if (storage.durableRequired && !storage.distillationAllowed) {
      res.status(503).json({
        code: "DISTILLATION_REQUIRES_DURABLE_STORAGE",
        storage,
        warning: "EMPTY_BODY_RUN_BLOCKED_UNTIL_DURABLE",
        mentorEligible: false,
        brainMutate: false,
      });
      return;
    }
    const out = runLegacyKnowledgeDistillationAllAvailable();
    res.json({
      ...out,
      storage,
      warning: out.warning,
    });
  });

  app.post(`${base}/runs`, ...guards, async (req: Request, res: Response) => {
    try {
      const out = await runStrictKnowledgeDistillation(req.body ?? {});
      res.json({ ...out });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      const status =
        msg === "DISTILLATION_REQUIRES_DURABLE_STORAGE" || msg === "UNSAFE_EPHEMERAL_STORAGE"
          ? 503
          : msg.startsWith("SESSION_") || msg === "NO_OBSERVATIONS_FOR_SESSIONS" || msg === "FINGERPRINT_MISMATCH" || msg === "DUPLICATE_DISTILLATION_RUN"
            ? 400
            : 400;
      res.status(status).json({ code: msg, mentorEligible: false, brainMutate: false });
    }
  });

  app.get(`${base}/latest`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeDistillationMemory().latestRun();
    res.json({ result: latest, mentorEligible: false, brainMutate: false });
  });

  app.get(`${base}/heatmaps`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeDistillationMemory().latestRun();
    res.json({
      conflict: latest?.conflictHeatmap ?? null,
      coverage: latest?.coverageHeatmap ?? null,
      mentorEligible: false,
    });
  });

  app.get(`${base}/gaps`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeDistillationMemory().latestRun();
    res.json({ gaps: latest?.gaps ?? [], mentorEligible: false });
  });

  app.get(`${base}/adaptive-queue`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeDistillationMemory().latestRun();
    res.json({ queue: latest?.adaptiveQueue ?? [], mentorEligible: false });
  });

  app.get(`${base}/challenges`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeDistillationMemory().latestRun();
    if (latest) {
      res.json({
        challenges: latest.challenges,
        scores: latest.challengeScores,
        mentorEligible: false,
        neverAnswers: true,
      });
      return;
    }
    res.json({
      challenges: buildChallenges({
        clusters: [],
        confidences: [],
        conflicts: { cells: [], totalConflicts: 0, mentorEligible: false },
      }),
      scores: [],
      mentorEligible: false,
      neverAnswers: true,
    });
  });

  app.get(`${base}/proposals`, ...guards, (_req: Request, res: Response) => {
    const proposals = getKnowledgeDistillationMemory().listProposals();
    res.json({
      proposals,
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
      schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
    });
  });

  app.get(`${base}/evolution`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeDistillationMemory().latestRun();
    res.json({
      report: latest?.evolution ?? null,
      mentorEligible: false,
      brainMutated: false,
      openAi: false,
    });
  });

  app.get(`${base}/independent-evidence-audit`, ...guards, async (req: Request, res: Response) => {
    try {
      const mem = getIndependentEvidenceAuditMemory();
      const sourceRunId = typeof req.query.sourceRunId === "string" ? req.query.sourceRunId : undefined;
      const latest = sourceRunId
        ? mem.listAuditsForRun(sourceRunId).slice(-1)[0] ?? null
        : mem.latest();
      let durableLatest: IndependentEvidenceAudit | null = null;
      try {
        const repos = await getDurableRepos();
        if (repos.knowledgeDistillation.listIndependentEvidenceAudits) {
          const list = await repos.knowledgeDistillation.listIndependentEvidenceAudits(sourceRunId);
          durableLatest = list[list.length - 1] ?? null;
        }
      } catch {
        // local memory fallback
      }
      const audit = durableLatest ?? latest;
      res.json({
        audit,
        mentorEligible: false,
        brainMutate: false,
        autoApply: false,
        containsAnswerText: false,
      });
    } catch (e) {
      res.status(500).json({
        code: e instanceof Error ? e.message : "AUDIT_FETCH_FAILED",
        mentorEligible: false,
      });
    }
  });

  app.post(`${base}/independent-evidence-audit`, ...guards, async (req: Request, res: Response) => {
    try {
      const sourceRunId =
        typeof req.body?.sourceRunId === "string" ? req.body.sourceRunId : undefined;
      const repos = await getDurableRepos();
      const runIds = await repos.knowledgeDistillation.listRunIds();
      const runId = sourceRunId ?? runIds[runIds.length - 1];
      if (!runId) {
        res.status(404).json({ code: "NO_SOURCE_RUN", mentorEligible: false });
        return;
      }
      const sourceRun = await repos.knowledgeDistillation.getRun(runId);
      if (!sourceRun) {
        res.status(404).json({ code: "SOURCE_RUN_NOT_FOUND", mentorEligible: false });
        return;
      }
      const sourceSessionIds =
        ((sourceRun as { sourceSessionIds?: string[] }).sourceSessionIds ?? []) as string[];
      const store = getCriticalCalibrationMemory();
      const raw =
        sourceSessionIds.length > 0
          ? sourceSessionIds.flatMap((id) => store.listObservations(id))
          : store.listObservations();
      const audit = runIndependentEvidenceAudit({
        sourceRunId: runId,
        sourceFingerprint: (sourceRun as { sourceFingerprint?: string }).sourceFingerprint,
        rawObservations: raw,
        sourceRun,
      });
      getIndependentEvidenceAuditMemory().saveAudit(audit);
      let persisted = false;
      let persistError: string | undefined;
      try {
        if (repos.knowledgeDistillation.saveIndependentEvidenceAudit) {
          await repos.knowledgeDistillation.saveIndependentEvidenceAudit(audit);
          persisted = true;
        }
      } catch (e) {
        persistError = e instanceof Error ? e.message : "PERSIST_FAILED";
      }
      res.json({
        audit,
        persisted,
        persistError,
        mentorEligible: false,
        brainMutate: false,
        autoApply: false,
        originalRunUnchanged: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AUDIT_FAILED";
      res.status(msg === "AUDIT_APPEND_ONLY_REFUSES_OVERWRITE" ? 409 : 400).json({
        code: msg,
        mentorEligible: false,
        brainMutate: false,
      });
    }
  });
}
