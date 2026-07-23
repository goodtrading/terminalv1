/**
 * AI-7.3.6 Knowledge Provenance routes (admin). Flag default OFF. No OpenAI. No Brain mutate.
 */
import type { Express, Request, Response } from "express";
import { requireKnowledgeProvenanceAccess } from "../ai/goodTradingAi/knowledgeProvenance/access";
import { isGoodTradingAiKnowledgeProvenanceEnabled } from "../ai/goodTradingAi/knowledgeProvenance/features";
import { runKnowledgeProvenance } from "../ai/goodTradingAi/knowledgeProvenance/pipeline";
import { getKnowledgeProvenanceMemory } from "../ai/goodTradingAi/knowledgeProvenance/memoryStore";
import { queryProvenance } from "../ai/goodTradingAi/knowledgeProvenance/provenanceQueries";
import { listRationalesForRule } from "../ai/goodTradingAi/knowledgeProvenance/rationaleStore";
import { timelineForRule } from "../ai/goodTradingAi/knowledgeProvenance/knowledgeTimeline";
import { impactForRule } from "../ai/goodTradingAi/knowledgeProvenance/impactTrace";
import { stableRuleIdSchema } from "@shared/goodTradingAiKnowledgeProvenance";

export function registerKnowledgeProvenanceRoutes(app: Express): void {
  const base = "/api/internal/ai/knowledge-provenance";
  const guards = [requireKnowledgeProvenanceAccess];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiKnowledgeProvenanceEnabled(),
      mentorEligible: false,
      openAi: false,
      brainMutate: false,
      autoApply: false,
      realMarketData: false,
      note: "AI-7.3.6 Knowledge Provenance — append-only audit trail; PENDING context only; never mutates Brain.",
    });
  });

  app.post(`${base}/run`, ...guards, (_req: Request, res: Response) => {
    const result = runKnowledgeProvenance({ persist: true });
    res.json({ result, mentorEligible: false, brainMutate: false, autoApply: false });
  });

  app.get(`${base}/latest`, ...guards, (_req: Request, res: Response) => {
    res.json({ result: getKnowledgeProvenanceMemory().latestRun(), mentorEligible: false, brainMutate: false });
  });

  app.get(`${base}/registry`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeProvenanceMemory().latestRun();
    res.json({
      registry: latest?.registry ?? getKnowledgeProvenanceMemory().loadRegistry(),
      mentorEligible: false,
    });
  });

  app.get(`${base}/timeline`, ...guards, (req: Request, res: Response) => {
    const latest = getKnowledgeProvenanceMemory().latestRun();
    const events = latest?.events ?? getKnowledgeProvenanceMemory().loadEvents();
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : undefined;
    if (ruleId) {
      const parsed = stableRuleIdSchema.safeParse(ruleId);
      if (!parsed.success) {
        res.status(400).json({ code: "INVALID_RULE_ID", message: "Stable RULE_* id required." });
        return;
      }
      res.json({ ruleId: parsed.data, timeline: timelineForRule(events, parsed.data), mentorEligible: false });
      return;
    }
    res.json({ timelines: latest?.timelines ?? {}, mentorEligible: false });
  });

  app.get(`${base}/lineage`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeProvenanceMemory().latestRun();
    res.json({
      lineage: latest?.lineage ?? { edges: [], cyclesBroken: 0, mentorEligible: false },
      mentorEligible: false,
    });
  });

  app.get(`${base}/rationale`, ...guards, (req: Request, res: Response) => {
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : "";
    const parsed = stableRuleIdSchema.safeParse(ruleId);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_RULE_ID", message: "Stable RULE_* id required." });
      return;
    }
    const events = getKnowledgeProvenanceMemory().latestRun()?.events ?? getKnowledgeProvenanceMemory().loadEvents();
    res.json({
      ruleId: parsed.data,
      rationales: listRationalesForRule(events, parsed.data),
      mentorEligible: false,
      neverEdit: true,
    });
  });

  app.get(`${base}/impact`, ...guards, (req: Request, res: Response) => {
    const latest = getKnowledgeProvenanceMemory().latestRun();
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : undefined;
    if (ruleId) {
      const parsed = stableRuleIdSchema.safeParse(ruleId);
      if (!parsed.success) {
        res.status(400).json({ code: "INVALID_RULE_ID", message: "Stable RULE_* id required." });
        return;
      }
      res.json({
        impact: impactForRule(latest?.impactTraces ?? [], parsed.data),
        mentorEligible: false,
      });
      return;
    }
    res.json({ impactTraces: latest?.impactTraces ?? [], mentorEligible: false });
  });

  app.get(`${base}/query`, ...guards, (req: Request, res: Response) => {
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : "";
    const parsed = stableRuleIdSchema.safeParse(ruleId);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_RULE_ID", message: "Stable RULE_* id required." });
      return;
    }
    const mem = getKnowledgeProvenanceMemory();
    const latest = mem.latestRun();
    const registry = latest?.registry ?? mem.loadRegistry();
    const events = latest?.events ?? mem.loadEvents();
    const lineage = latest?.lineage ?? { edges: [], cyclesBroken: 0, mentorEligible: false as const };
    res.json({
      result: queryProvenance({ ruleId: parsed.data, registry, events, lineage }),
      mentorEligible: false,
    });
  });

  app.get(`${base}/proposal-context`, ...guards, (_req: Request, res: Response) => {
    const latest = getKnowledgeProvenanceMemory().latestRun();
    res.json({
      contexts: latest?.proposalContexts ?? [],
      autoApply: false,
      brainMutate: false,
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
      mentorEligible: false,
    });
  });

  app.get(`${base}/related-rules`, ...guards, (req: Request, res: Response) => {
    const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : "";
    const parsed = stableRuleIdSchema.safeParse(ruleId);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_RULE_ID", message: "Stable RULE_* id required." });
      return;
    }
    const latest = getKnowledgeProvenanceMemory().latestRun();
    const lineage = latest?.lineage ?? { edges: [], cyclesBroken: 0, mentorEligible: false as const };
    const related = lineage.edges
      .filter((e) => e.fromRuleId === parsed.data || e.toRuleId === parsed.data)
      .map((e) => ({
        relation: e.relation,
        otherRuleId: e.fromRuleId === parsed.data ? e.toRuleId : e.fromRuleId,
      }));
    res.json({ ruleId: parsed.data, related, mentorEligible: false });
  });
}