/**
 * AI-7 — Internal Decision Graph routes (admin). Default flag OFF.
 * NOT wired to /api/ai/chat live snapshot.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireDecisionGraphAccess } from "../ai/goodTradingAi/decision/access";
import {
  describeLimitPolicy,
  evaluateDecisionGraph,
  isGoodTradingAiDecisionGraphEnabled,
  listDecisionGraphTemplates,
} from "../ai/goodTradingAi/decision";
import { knowledgeRegistry } from "../ai/goodTradingAi/knowledge/registry";
import { retrieveKnowledge } from "../ai/goodTradingAi/knowledge/retrieve";
import { marketSnapshotSchema } from "@shared/goodTradingAiMarket";
import { validateMarketSnapshot } from "../ai/goodTradingAi/market/snapshotValidator";
import { registerKnownDecisionGraph } from "../ai/goodTradingAi/decisionContext";

const evaluateBodySchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
    scenarioLabel: z.string().trim().max(120).optional(),
    templateId: z.string().trim().max(80).optional(),
    forceUntrusted: z.boolean().optional(),
    knowledgeIds: z.array(z.string().min(1).max(80)).max(24).optional(),
    /** Optional validated snapshot — rejected if invalid. */
    marketSnapshot: marketSnapshotSchema.optional(),
  })
  .strict();

export function registerDecisionGraphRoutes(app: Express): void {
  const base = "/api/internal/ai/decision-graph";
  const guards = [requireDecisionGraphAccess];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiDecisionGraphEnabled(),
      mentorEligible: false,
      openAiBuildsGraph: false,
      chatLiveWiring: false,
      limits: describeLimitPolicy(),
      note: "AI-7/7.1 Decision Graph — deterministic, educational, not Mentor-live.",
      redisPerformanceSemantics: "HIGH remains warning; performancePassed never true for HIGH",
    });
  });

  app.get(`${base}/templates`, ...guards, (_req: Request, res: Response) => {
    res.json({
      templates: listDecisionGraphTemplates(),
      mentorEligible: false,
    });
  });

  app.post(`${base}/evaluate`, ...guards, (req: Request, res: Response) => {
    const parsed = evaluateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "INVALID_REQUEST",
        message: parsed.error.issues[0]?.message ?? "invalid body",
      });
      return;
    }
    const body = parsed.data;
    let snapshot = body.marketSnapshot;
    if (snapshot) {
      const v = validateMarketSnapshot(snapshot);
      if (!v.ok) {
        res.status(400).json({
          code: "INVALID_SNAPSHOT",
          message: "MarketSnapshot inválido — solo snapshots validados.",
          issues: v.issues.slice(0, 5),
        });
        return;
      }
      snapshot = v.snapshot;
    }

    let entries =
      body.knowledgeIds
        ?.map((id) => knowledgeRegistry.getById(id))
        .filter((e): e is NonNullable<typeof e> => !!e) ?? [];
    if (entries.length === 0) {
      const retrieved = retrieveKnowledge({ query: body.question, maxResults: 8 });
      entries = retrieved.matches.map((m) => m.entry).slice(0, 12);
    }

    const result = evaluateDecisionGraph({
      question: body.question,
      scenarioLabel: body.scenarioLabel,
      templateId: body.templateId,
      forceUntrusted: body.forceUntrusted,
      knowledgeEntries: entries,
      marketSnapshot: snapshot ?? null,
    });

    if (!result.ok || !result.clientSafe) {
      res.status(422).json({
        code: "DECISION_GRAPH_INVALID",
        issues: result.issues,
        mentorEligible: false,
      });
      return;
    }

    // Never return full internal graph to client — clientSafe only (+ limited admin debug fields)
    // AI-8.1 passive ref registry — summaries only; does not create a new graph for recorder
    registerKnownDecisionGraph(result.clientSafe, {
      evaluatedAtMs: result.graph?.evaluatedAtMs ?? Date.now(),
    });
    res.json({
      ok: true,
      durationMs: result.durationMs,
      decisionGraph: result.clientSafe,
      debug: {
        templateId: result.graph?.templateId,
        nodeCount: result.graph?.nodes.length ?? 0,
        pathCount: result.graph?.paths.length ?? 0,
        quality: result.graph?.quality,
        contextTrust: result.graph?.contextTrust,
      },
      mentorEligible: false,
    });
  });
}
