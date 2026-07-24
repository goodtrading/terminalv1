/**
 * AI-7.3 — Critical Mentor Calibration routes (admin). Default flag OFF. No OpenAI.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { decisionPathOutcomeSchema } from "@shared/goodTradingAiDecisionGraph";
import { mutationKindSchema, syntheticScenarioSchema } from "@shared/goodTradingAiCriticalCalibration";
import { requireCriticalCalibrationAccess } from "../ai/goodTradingAi/criticalCalibration/access";
import { isGoodTradingAiCriticalCalibrationEnabled } from "../ai/goodTradingAi/criticalCalibration/features";
import { generateScenarios, scenarioToDecisionQuestion } from "../ai/goodTradingAi/criticalCalibration/scenarioGenerator";
import { applyMutation, mutateAll } from "../ai/goodTradingAi/criticalCalibration/mutationEngine";
import { reviewScenario } from "../ai/goodTradingAi/criticalCalibration/criticalReviewer";
import { createProposalsFromReview } from "../ai/goodTradingAi/criticalCalibration/proposalEngine";
import { selectHighInfoQuestions } from "../ai/goodTradingAi/criticalCalibration/questionGenerator";
import { getCriticalCalibrationMemory } from "../ai/goodTradingAi/criticalCalibration/memoryStore";
import { computeCalibrationMetrics } from "../ai/goodTradingAi/criticalCalibration/metrics";
import { buildCriticalCalibrationReport } from "../ai/goodTradingAi/criticalCalibration/report";
import { runCalibrationBatch } from "../ai/goodTradingAi/criticalCalibration/pipeline";
import {
  generateBatchWithMutations,
  buildActiveLearningQueue,
  startCriticalCalibrationSession,
  getBlindPacket,
  submitCalibrationAnswer,
  revealAfterCalibrationSubmit,
  assertBlindPacketSafe,
  summarizeQueue,
  listSessionSummaries,
  resumeCriticalCalibrationSession,
  archiveTechnicalSession,
  getSessionProgress,
} from "../ai/goodTradingAi/criticalCalibration/sessionService";
import {
  calibrationAnswerTypeSchema,
  calibrationObservationKindSchema,
  calibrationPostRevealActionSchema,
  calibrationSessionKindSchema,
} from "@shared/goodTradingAiCriticalCalibration";
import { evaluateDecisionGraph } from "../ai/goodTradingAi/decision/decisionGraphEngine";
import { retrieveKnowledge } from "../ai/goodTradingAi/knowledge/retrieve";
import {
  assessStorageHealth,
  assertHumanSessionsAllowed,
} from "../ai/goodTradingAi/durableCalibration/health";
import { getDurableRepos } from "../ai/goodTradingAi/durableCalibration/factory";
import {
  exportCalibrationBackup,
  importCalibrationBackup,
} from "../ai/goodTradingAi/durableCalibration/backup";
import { attemptLegitimateRecovery } from "../ai/goodTradingAi/durableCalibration/recovery";
import {
  startCrossCaseValidationSession,
  CROSS_CASE_SESSION_LABEL,
} from "../ai/goodTradingAi/knowledgeDistillation/crossCaseValidation";
import type { ChallengeItem } from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";

const reviewBodySchema = z.object({ scenario: syntheticScenarioSchema, engineOutcome: decisionPathOutcomeSchema.nullable().optional(), humanOutcome: decisionPathOutcomeSchema.nullable().optional() }).strict();

export function registerCriticalCalibrationRoutes(app: Express): void {
  const base = "/api/internal/ai/critical-calibration";
  const guards = [requireCriticalCalibrationAccess];

  app.get(`${base}/status`, ...guards, async (_req: Request, res: Response) => {
    const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
    res.json({
      enabled: isGoodTradingAiCriticalCalibrationEnabled(),
      mentorEligible: false,
      openAi: false,
      chatLiveWiring: false,
      note: "AI-7.3 Critical Calibration Lab — synthetic, never mutates Brain.",
      storage,
    });
  });

  app.get(`${base}/storage/health`, ...guards, async (_req: Request, res: Response) => {
    const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
    res.json({ storage, mentorEligible: false, brainMutate: false });
  });

  app.post(`${base}/storage/verify`, ...guards, async (_req: Request, res: Response) => {
    await getDurableRepos();
    const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
    res.json({
      ok: storage.repositoryDurable && storage.repositoryWritable && storage.repositoryReadable,
      storage,
      mentorEligible: false,
      brainMutate: false,
    });
  });

  app.get(`${base}/backup/export`, ...guards, async (_req: Request, res: Response) => {
    await getDurableRepos();
    const backup = await exportCalibrationBackup();
    res.json({ backup, mentorEligible: false, brainMutate: false });
  });

  app.post(`${base}/backup/import`, ...guards, async (req: Request, res: Response) => {
    try {
      await getDurableRepos();
      const result = await importCalibrationBackup(req.body?.backup ?? req.body, {
        dryRun: req.body?.dryRun !== false,
      });
      res.json({ result, mentorEligible: false, brainMutate: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "IMPORT_FAILED";
      res.status(400).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/recovery/attempt`, ...guards, async (_req: Request, res: Response) => {
    const recovery = await attemptLegitimateRecovery();
    res.json({ recovery, mentorEligible: false, brainMutate: false, inventRecovery: false });
  });

  app.post(`${base}/scenarios/generate`, ...guards, (req: Request, res: Response) => {
    const count = typeof req.body?.count === "number" ? Math.min(5000, Math.max(1, req.body.count)) : 24;
    const seed = typeof req.body?.seed === "string" ? req.body.seed : "default";
    res.json({ scenarios: generateScenarios({ count, seed }), mentorEligible: false });
  });

  app.post(`${base}/scenarios/mutate`, ...guards, (req: Request, res: Response) => {
    const scenario = syntheticScenarioSchema.parse(req.body?.scenario);
    const kind = req.body?.kind ? mutationKindSchema.parse(req.body.kind) : undefined;
    res.json({ mutated: kind ? applyMutation(scenario, kind) : mutateAll(scenario), mentorEligible: false });
  });

  app.post(`${base}/review`, ...guards, (req: Request, res: Response) => {
    const body = reviewBodySchema.parse(req.body);
    let engineOutcome = body.engineOutcome ?? null;
    if (body.engineOutcome === undefined) {
      const question = scenarioToDecisionQuestion(body.scenario);
      const knowledgeEntries = retrieveKnowledge({ query: question, maxResults: 6 }).matches.map((m) => m.entry);
      engineOutcome = evaluateDecisionGraph({ question, scenarioLabel: body.scenario.id, knowledgeEntries, marketSnapshot: null, forceUntrusted: true }).clientSafe?.primaryOutcome ?? null;
    }
    res.json({ review: reviewScenario({ scenario: body.scenario, engineOutcome, humanOutcome: body.humanOutcome ?? null }), mentorEligible: false });
  });

  app.post(`${base}/proposals/from-review`, ...guards, (req: Request, res: Response) => {
    const scenario = syntheticScenarioSchema.parse(req.body?.scenario);
    const review = reviewScenario({ scenario, engineOutcome: req.body?.engineOutcome ?? null, humanOutcome: req.body?.humanOutcome ?? null });
    const proposals = createProposalsFromReview(review, scenario);
    const store = getCriticalCalibrationMemory();
    for (const p of proposals) store.saveProposal(p);
    res.json({ proposals, mentorEligible: false });
  });

  app.post(`${base}/proposals/:id/decide`, ...guards, (req: Request, res: Response) => {
    try {
      const status = z.enum(["ACCEPTED", "REJECTED"]).parse(req.body?.status);
      const updated = getCriticalCalibrationMemory().decideProposal(req.params.id, status, typeof req.body?.note === "string" ? req.body.note : undefined);
      if (!updated) { res.status(404).json({ code: "PROPOSAL_NOT_FOUND", mentorEligible: false }); return; }
      res.json({ proposal: updated, mentorEligible: false, brainMutated: false, autoApply: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      if (msg.startsWith("PROPOSAL_SUPPORT_INSUFFICIENT")) {
        res.status(409).json({ code: "PROPOSAL_SUPPORT_INSUFFICIENT", message: msg, mentorEligible: false, brainMutated: false });
        return;
      }
      res.status(400).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/proposals`, ...guards, (_req, res) => res.json({ proposals: getCriticalCalibrationMemory().listProposals(), mentorEligible: false }));
  app.post(`${base}/questions/generate`, ...guards, (req, res) => {
    const scenarios = Array.isArray(req.body?.scenarios) ? req.body.scenarios.map((s: unknown) => syntheticScenarioSchema.parse(s)) : generateScenarios({ count: 40, seed: "qgen" });
    const questions = selectHighInfoQuestions({ scenarios, limit: 20 });
    getCriticalCalibrationMemory().saveQuestionQueue(questions);
    res.json({ questions, mentorEligible: false });
  });
  app.get(`${base}/questions`, ...guards, (_req, res) => res.json({ questions: getCriticalCalibrationMemory().listQuestions(), mentorEligible: false }));
  app.post(`${base}/batch`, ...guards, (req, res) => {
    const batch = runCalibrationBatch({ seed: typeof req.body?.seed === "string" ? req.body.seed : "batch", count: typeof req.body?.count === "number" ? req.body.count : 24, humanOutcomes: req.body?.humanOutcomes });
    res.json({ ...batch, mentorEligible: false, brainMutated: false });
  });
  app.get(`${base}/report`, ...guards, (_req, res) => {
    const store = getCriticalCalibrationMemory();
    const scenarios = generateScenarios({ count: 12, seed: store.listRuns()[0]?.seed ?? "report" });
    const reviews = scenarios.map((s) => reviewScenario({ scenario: s, engineOutcome: "HYPOTHESIS_OPEN" }));
    const proposals = store.listProposals();
    const metrics = computeCalibrationMetrics({ reviews, proposals, scenarios });
    const questions = store.listQuestions().length ? store.listQuestions() : selectHighInfoQuestions({ scenarios });
    res.json({ report: buildCriticalCalibrationReport({ reviews, proposals, scenarios, metrics, questions }), mentorEligible: false, brainMutated: false });
  });
  app.get(`${base}/metrics`, ...guards, (_req, res) => {
    const scenarios = generateScenarios({ count: 8, seed: "metrics" });
    const reviews = scenarios.map((s) => reviewScenario({ scenario: s, engineOutcome: null }));
    res.json({ metrics: computeCalibrationMetrics({ reviews, proposals: getCriticalCalibrationMemory().listProposals(), scenarios }), mentorEligible: false });
  });
  app.post(`${base}/batch/generate`, ...guards, (req: Request, res: Response) => {
    const seed = typeof req.body?.seed === "string" ? req.body.seed : "73001";
    const scenarioCount = typeof req.body?.scenarioCount === "number" ? Math.min(500, Math.max(1, req.body.scenarioCount)) : 120;
    const mutationDepth = typeof req.body?.mutationDepth === "number" ? req.body.mutationDepth : 1;
    const maxMutationsPerBase = typeof req.body?.maxMutationsPerBase === "number" ? req.body.maxMutationsPerBase : 3;
    const batch = generateBatchWithMutations({ seed, scenarioCount, mutationDepth, maxMutationsPerBase });
    res.json({
      seed: batch.seed,
      scenarioCount: batch.scenarioCount,
      expandedCount: batch.expandedCount,
      mutationDepth: batch.mutationDepth,
      maxMutationsPerBase: batch.maxMutationsPerBase,
      realMarketData: false,
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
      synthetic: true,
      warning: "SYNTHETIC_ONLY_NO_LIVE_MARKET_DATA",
    });
  });

  app.post(`${base}/questions/active-learning`, ...guards, (req: Request, res: Response) => {
    const seed = typeof req.body?.seed === "string" ? req.body.seed : "73001";
    const queue = buildActiveLearningQueue({ seed, scenarioCount: typeof req.body?.scenarioCount === "number" ? req.body.scenarioCount : 120 });
    getCriticalCalibrationMemory().saveQuestionQueue(queue.questions);
    res.json({
      count: queue.questions.length,
      summary: summarizeQueue(queue.questions),
      mentorEligible: false,
      realMarketData: false,
    });
  });

  app.post(`${base}/sessions/start`, ...guards, async (req: Request, res: Response) => {
    try {
      const repos = await getDurableRepos();
      const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
      const kind = req.body?.kind != null ? calibrationSessionKindSchema.parse(req.body.kind) : "HUMAN";
      if (kind === "HUMAN") {
        assertHumanSessionsAllowed(storage);
      } else if (!storage.humanSessionsAllowed && !storage.technicalOnlyNonDurable && storage.status === "UNAVAILABLE") {
        res.status(503).json({ code: "STORAGE_UNAVAILABLE", storage, mentorEligible: false });
        return;
      }
      const started = startCriticalCalibrationSession({
        seed: typeof req.body?.seed === "string" ? req.body.seed : "73001",
        initialQuestionCount: typeof req.body?.initialQuestionCount === "number" ? req.body.initialQuestionCount : 15,
        kind,
        label: typeof req.body?.label === "string" ? req.body.label : undefined,
      });
      await repos.criticalCalibration.saveSession(started.session);
      for (const q of started.blindQuestions) assertBlindPacketSafe(q);
      res.json({
        sessionId: started.session.id,
        questionCount: started.blindQuestions.length,
        blindQuestions: started.blindQuestions,
        progress: getSessionProgress(started.session.id),
        mentorEligible: false,
        brainMutate: false,
        autoApply: false,
        realMarketData: false,
        storage,
        nonDurable: !storage.repositoryDurable,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      const status = msg === "UNSAFE_EPHEMERAL_STORAGE" ? 503 : 400;
      const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
      res.status(status).json({ code: msg, storage, mentorEligible: false, brainMutate: false });
    }
  });

  /** AI-7.3.13 — exactly 5 blind cross-case questions from Independent Evidence Audit. Never auto-answers. */
  app.post(`${base}/sessions/start-cross-case`, ...guards, async (req: Request, res: Response) => {
    try {
      const repos = await getDurableRepos();
      const storage = await assessStorageHealth({ priorHumanLossSuspected: true });
      assertHumanSessionsAllowed(storage);
      const audits = repos.knowledgeDistillation.listIndependentEvidenceAudits
        ? await repos.knowledgeDistillation.listIndependentEvidenceAudits()
        : [];
      const auditId = typeof req.body?.sourceAuditId === "string" ? req.body.sourceAuditId : undefined;
      const audit =
        (auditId ? audits.find((a) => a.id === auditId) : undefined) ??
        audits[audits.length - 1];
      if (!audit || audit.schema !== "DistillationIndependentEvidenceAudit/v1") {
        res.status(404).json({ code: "SOURCE_AUDIT_NOT_FOUND", mentorEligible: false });
        return;
      }
      const runIds = await repos.knowledgeDistillation.listRunIds();
      const sourceRunId =
        (typeof req.body?.sourceRunId === "string" ? req.body.sourceRunId : undefined) ??
        audit.sourceRunId ??
        runIds.find((id) => id.includes("strict")) ??
        runIds[runIds.length - 1];
      if (!sourceRunId) {
        res.status(404).json({ code: "NO_SOURCE_RUN", mentorEligible: false });
        return;
      }
      const sourceRun = await repos.knowledgeDistillation.getRun(sourceRunId);
      const challenges = ((sourceRun as { challenges?: ChallengeItem[] } | null)?.challenges ??
        []) as ChallengeItem[];
      const priorQs = await repos.criticalCalibration.listQuestions();
      const started = startCrossCaseValidationSession({
        audit: audit as IndependentEvidenceAudit,
        challenges,
        sourceRunId,
        priorPrompts: priorQs.map((q) => q.prompt),
        label:
          typeof req.body?.label === "string" ? req.body.label : CROSS_CASE_SESSION_LABEL,
        repositoryDurable: storage.repositoryDurable,
      });
      await repos.criticalCalibration.saveSession(started.session);
      await repos.criticalCalibration.saveQuestionQueue([
        ...(await repos.criticalCalibration.listQuestions()).filter(
          (q) => !started.session.questionIds.includes(q.id),
        ),
        ...started.session.questionIds
          .map((id) => getCriticalCalibrationMemory().listQuestions().find((q) => q.id === id)!)
          .filter(Boolean),
      ]);
      for (const q of started.blindQuestions) assertBlindPacketSafe(q);
      res.json({
        sessionId: started.session.id,
        questionCount: started.questionCount,
        answeredCount: 0,
        blindQuestions: started.blindQuestions,
        sourceAuditId: started.session.sourceAuditId,
        sourceRunId: started.session.sourceRunId,
        relationDistribution: started.drafts.reduce(
          (acc, d) => {
            acc[d.relationToOriginal] = (acc[d.relationToOriginal] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        progress: getSessionProgress(started.session.id),
        mentorEligible: false,
        brainMutate: false,
        autoApply: false,
        autoReveal: false,
        realMarketData: false,
        excludeTechnical: true,
        excludeHoldout: true,
        repositoryDurable: storage.repositoryDurable,
        storage,
        label: started.session.label,
        /** Hypotheses never returned in blind payload — ids only for admin linkage. */
        hypothesisIds: started.hypotheses.map((h) => h.id),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      const status = msg === "UNSAFE_EPHEMERAL_STORAGE" ? 503 : 400;
      res.status(status).json({ code: msg, mentorEligible: false, brainMutate: false });
    }
  });

  app.get(`${base}/sessions/:id/questions/:qid/blind`, ...guards, (req: Request, res: Response) => {
    try {
      const packet = getBlindPacket(req.params.id, req.params.qid);
      assertBlindPacketSafe(packet);
      res.json({ packet, mentorEligible: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      res.status(msg === "SESSION_NOT_FOUND" ? 404 : 400).json({ code: msg, mentorEligible: false });
    }
  });

  app.post(`${base}/sessions/:id/answers`, ...guards, async (req: Request, res: Response) => {
    try {
      const repos = await getDurableRepos();
      const obs = submitCalibrationAnswer({
        sessionId: req.params.id,
        questionId: String(req.body?.questionId ?? ""),
        humanNote: typeof req.body?.humanNote === "string" ? req.body.humanNote : undefined,
        answerText: typeof req.body?.answerText === "string" ? req.body.answerText : undefined,
        answerType: req.body?.answerType != null ? calibrationAnswerTypeSchema.parse(req.body.answerType) : undefined,
        conditions: Array.isArray(req.body?.conditions) ? req.body.conditions : undefined,
        minimumConfirmations: Array.isArray(req.body?.minimumConfirmations) ? req.body.minimumConfirmations : undefined,
        invalidations: Array.isArray(req.body?.invalidations) ? req.body.invalidations : undefined,
        confidence: req.body?.confidence,
        observationKind: req.body?.observationKind != null ? calibrationObservationKindSchema.parse(req.body.observationKind) : undefined,
        revisionOf: typeof req.body?.revisionOf === "string" ? req.body.revisionOf : undefined,
        postRevealAction: req.body?.postRevealAction != null ? calibrationPostRevealActionSchema.parse(req.body.postRevealAction) : undefined,
      });
      await repos.criticalCalibration.saveObservation(obs);
      const session = repos.ccMemory.getSession(req.params.id);
      if (session) await repos.criticalCalibration.saveSession(session);
      res.json({
        observation: obs,
        progress: getSessionProgress(req.params.id),
        mentorEligible: false,
        revealed: false,
        brainMutate: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      res.status(400).json({ code: msg, mentorEligible: false });
    }
  });

  app.post(`${base}/sessions/:id/questions/:qid/reveal`, ...guards, (req: Request, res: Response) => {
    try {
      const revealed = revealAfterCalibrationSubmit(req.params.id, req.params.qid);
      res.json({ ...revealed, progress: getSessionProgress(req.params.id), mentorEligible: false, brainMutated: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      const status = msg === "ANSWER_REQUIRED_BEFORE_REVEAL" ? 409 : 400;
      res.status(status).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/sessions`, ...guards, (_req: Request, res: Response) => {
    res.json({ sessions: listSessionSummaries(), mentorEligible: false });
  });

  app.get(`${base}/sessions/:id`, ...guards, (req: Request, res: Response) => {
    try {
      const resumed = resumeCriticalCalibrationSession(req.params.id);
      res.json({ ...resumed, mentorEligible: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      res.status(msg === "SESSION_NOT_FOUND" ? 404 : 400).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/sessions/:id/progress`, ...guards, (req: Request, res: Response) => {
    try {
      res.json({ progress: getSessionProgress(req.params.id), mentorEligible: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      res.status(msg === "SESSION_NOT_FOUND" ? 404 : 400).json({ code: msg, mentorEligible: false });
    }
  });

  app.post(`${base}/sessions/:id/archive`, ...guards, (req: Request, res: Response) => {
    try {
      const progress = archiveTechnicalSession(req.params.id);
      res.json({ progress, mentorEligible: false, brainMutate: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      res.status(msg === "SESSION_NOT_FOUND" ? 404 : 400).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/questions/summary`, ...guards, (_req: Request, res: Response) => {
    const questions = getCriticalCalibrationMemory().listQuestions();
    res.json({ summary: summarizeQueue(questions), mentorEligible: false });
  });

}