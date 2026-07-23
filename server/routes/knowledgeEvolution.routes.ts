/**
 * AI-7.3.5 Knowledge Evolution routes (admin). Flag default OFF. No OpenAI. No Brain mutate.
 */
import type { Express, Request, Response } from "express";
import { requireKnowledgeEvolutionAccess } from "../ai/goodTradingAi/knowledgeEvolution/access";
import { isGoodTradingAiKnowledgeEvolutionEnabled } from "../ai/goodTradingAi/knowledgeEvolution/features";
import { runKnowledgeEvolution } from "../ai/goodTradingAi/knowledgeEvolution/pipeline";
import { getKnowledgeEvolutionMemory } from "../ai/goodTradingAi/knowledgeEvolution/memoryStore";
import { applySessionFeedback } from "../ai/goodTradingAi/knowledgeEvolution/feedbackLoop";
import { analyzeAllSessions } from "../ai/goodTradingAi/knowledgeDistillation/sessionAnalyzer";

export function registerKnowledgeEvolutionRoutes(app: Express): void {
  const base = "/api/internal/ai/knowledge-evolution";
  const guards = [requireKnowledgeEvolutionAccess];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiKnowledgeEvolutionEnabled(),
      mentorEligible: false,
      openAi: false,
      brainMutate: false,
      autoApply: false,
      realMarketData: false,
      note: "AI-7.3.5 Knowledge Evolution — living measurement only; PENDING proposals; never mutates Brain.",
    });
  });

  app.post(`${base}/run`, ...guards, (_req: Request, res: Response) => {
    const result = runKnowledgeEvolution({ persist: true });
    res.json({ result, mentorEligible: false, brainMutate: false, autoApply: false });
  });

  app.get(`${base}/latest`, ...guards, (_req: Request, res: Response) => {
    res.json({ result: getKnowledgeEvolutionMemory().latestRun(), mentorEligible: false, brainMutate: false });
  });

  app.get(`${base}/rules`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ rules: latest?.rules ?? getKnowledgeEvolutionMemory().loadRegistry(), mentorEligible: false });
  });

  app.get(`${base}/dependencies`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ graph: latest?.dependencyGraph ?? { edges: [], cyclesBroken: 0, mentorEligible: false }, mentorEligible: false });
  });

  app.get(`${base}/timeline`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ timeline: latest?.timeline ?? getKnowledgeEvolutionMemory().loadTimeline(), mentorEligible: false });
  });

  app.get(`${base}/volatility`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ volatilities: latest?.volatilities ?? [], mentorEligible: false });
  });

  app.get(`${base}/stability`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({
      stabilities: latest?.stabilities ?? [],
      report: latest?.stabilityReport ?? null,
      mentorEligible: false,
    });
  });

  app.get(`${base}/health`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ health: latest?.health ?? null, mentorEligible: false });
  });

  app.get(`${base}/obsolete`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ obsolete: latest?.obsolete ?? [], neverDelete: true, mentorEligible: false });
  });

  app.get(`${base}/keystone`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ keystones: latest?.keystones ?? [], mentorEligible: false });
  });

  app.get(`${base}/adaptive-priority`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeEvolutionMemory().latestRun();
    res.json({ priority: latest?.adaptivePriority ?? [], mentorEligible: false });
  });

  app.get(`${base}/proposals`, ...guards, (_req: Request, res: Response) => {
    const proposals = getKnowledgeEvolutionMemory().listProposals();
    res.json({
      proposals,
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
      schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
    });
  });

  app.post(`${base}/feedback`, ...guards, (_req: Request, res: Response) => {
    const observations = analyzeAllSessions();
    const out = applySessionFeedback({ observations, persist: true });
    res.json({
      health: out.health,
      result: out.result,
      brainMutate: false,
      autoApply: false,
      mentorEligible: false,
    });
  });
}