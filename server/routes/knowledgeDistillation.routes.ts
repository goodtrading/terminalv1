/**
 * AI-7.3.4 Knowledge Distillation routes (admin). Flag default OFF. No OpenAI. No Brain mutate.
 */
import type { Express, Request, Response } from "express";
import { requireKnowledgeDistillationAccess } from "../ai/goodTradingAi/knowledgeDistillation/access";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "../ai/goodTradingAi/knowledgeDistillation/features";
import { runKnowledgeDistillation } from "../ai/goodTradingAi/knowledgeDistillation/pipeline";
import { getKnowledgeDistillationMemory } from "../ai/goodTradingAi/knowledgeDistillation/memoryStore";
import { buildChallenges } from "../ai/goodTradingAi/knowledgeDistillation/challengeEngine";

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

  app.post(`${base}/run`, ...guards, (_req: Request, res: Response) => {
    const result = runKnowledgeDistillation({ persist: true });
    res.json({
      result,
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
    });
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
}
