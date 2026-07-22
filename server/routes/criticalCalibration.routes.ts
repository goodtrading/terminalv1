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
} from "../ai/goodTradingAi/criticalCalibration/sessionService";
import { evaluateDecisionGraph } from "../ai/goodTradingAi/decision/decisionGraphEngine";
import { retrieveKnowledge } from "../ai/goodTradingAi/knowledge/retrieve";

const reviewBodySchema = z.object({ scenario: syntheticScenarioSchema, engineOutcome: decisionPathOutcomeSchema.nullable().optional(), humanOutcome: decisionPathOutcomeSchema.nullable().optional() }).strict();

export function registerCriticalCalibrationRoutes(app: Express): void {
  const base = "/api/internal/ai/critical-calibration";
  const guards = [requireCriticalCalibrationAccess];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({ enabled: isGoodTradingAiCriticalCalibrationEnabled(), mentorEligible: false, openAi: false, chatLiveWiring: false, note: "AI-7.3 Critical Calibration Lab — synthetic, never mutates Brain." });
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
    res.json({ ...batch, mentorEligible: false, realMarketData: false });
  });

  app.post(`${base}/questions/active-learning`, ...guards, (req: Request, res: Response) => {
    const seed = typeof req.body?.seed === "string" ? req.body.seed : "73001";
    const queue = buildActiveLearningQueue({ seed, scenarioCount: typeof req.body?.scenarioCount === "number" ? req.body.scenarioCount : 120 });
    getCriticalCalibrationMemory().saveQuestionQueue(queue.questions);
    res.json({ questions: queue.questions, count: queue.questions.length, mentorEligible: false });
  });

  app.post(`${base}/sessions/start`, ...guards, (req: Request, res: Response) => {
    const started = startCriticalCalibrationSession({
      seed: typeof req.body?.seed === "string" ? req.body.seed : "73001",
      initialQuestionCount: typeof req.body?.initialQuestionCount === "number" ? req.body.initialQuestionCount : 15,
    });
    for (const q of started.blindQuestions) assertBlindPacketSafe(q);
    res.json({
      sessionId: started.session.id,
      questionCount: started.blindQuestions.length,
      blindQuestions: started.blindQuestions,
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
    });
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

  app.post(`${base}/sessions/:id/answers`, ...guards, (req: Request, res: Response) => {
    try {
      const obs = submitCalibrationAnswer({
        sessionId: req.params.id,
        questionId: String(req.body?.questionId ?? ""),
        humanNote: String(req.body?.humanNote ?? ""),
        confidence: req.body?.confidence,
      });
      res.json({ observation: obs, mentorEligible: false, revealed: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      res.status(400).json({ code: msg, mentorEligible: false });
    }
  });

  app.post(`${base}/sessions/:id/questions/:qid/reveal`, ...guards, (req: Request, res: Response) => {
    try {
      const revealed = revealAfterCalibrationSubmit(req.params.id, req.params.qid);
      res.json({ ...revealed, mentorEligible: false, brainMutated: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      const status = msg === "ANSWER_REQUIRED_BEFORE_REVEAL" ? 409 : 400;
      res.status(status).json({ code: msg, mentorEligible: false });
    }
  });

}