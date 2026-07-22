/**
 * AI-7.2 — Human Methodology Review routes (admin). Default flag OFF.
 * NOT wired to /api/ai/chat. No OpenAI.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { decisionPathOutcomeSchema, decisionQualityCategorySchema } from "@shared/goodTradingAiDecisionGraph";
import { humanConfidenceSchema } from "@shared/goodTradingAiHumanReview";
import { requireDecisionReviewAccess } from "../ai/goodTradingAi/decision/humanReview/access";
import { isGoodTradingAiDecisionReviewEnabled } from "../ai/goodTradingAi/decision/humanReview/features";
import {
  startBlindSession,
  submitHumanAnswer,
  revealAfterSubmit,
  buildSessionReport,
} from "../ai/goodTradingAi/decision/humanReview/sessionService";
import {
  getHumanDecisionReviewRepository,
} from "../ai/goodTradingAi/decision/humanReview/repository";
import { buildDecisionMethodologyReviewPacket } from "../ai/goodTradingAi/decision/humanReview/packet";
import { HUMAN_REVIEW_CASES, getHumanReviewCase } from "../ai/goodTradingAi/decision/humanReview/reviewCases";
import { toBlindCaseView } from "../ai/goodTradingAi/decision/humanReview/biasControls";
import { groupProposalsByTaxonomy, groupProposalsBySuggestedAction } from "../ai/goodTradingAi/decision/humanReview/proposals";

const answerBodySchema = z
  .object({
    reviewCaseId: z.string().min(3).max(80),
    primaryOutcome: decisionPathOutcomeSchema,
    quality: decisionQualityCategorySchema.optional(),
    requiredConfirmations: z.array(z.string().min(1).max(160)).max(12).optional(),
    triggeredInvalidations: z.array(z.string().min(1).max(160)).max(12).optional(),
    confidence: humanConfidenceSchema,
    notes: z.string().max(1200).optional(),
    insufficientEvidence: z.boolean(),
    ambiguousReading: z.boolean(),
  })
  .strict();

export function registerDecisionHumanReviewRoutes(app: Express): void {
  const base = "/api/internal/ai/decision-human-review";
  const guards = [requireDecisionReviewAccess];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiDecisionReviewEnabled(),
      mentorEligible: false,
      openAi: false,
      chatLiveWiring: false,
      caseCount: HUMAN_REVIEW_CASES.length,
      holdoutCount: HUMAN_REVIEW_CASES.filter((c) => c.holdout).length,
      note: "AI-7.2 Human Methodology Review — blind, educational, not Mentor-live.",
    });
  });

  app.post(`${base}/sessions`, ...guards, (req: Request, res: Response) => {
    const seed = typeof req.body?.seed === "string" ? req.body.seed : undefined;
    const excludeHoldout = req.body?.excludeHoldout === true;
    const maxCases =
      typeof req.body?.maxCases === "number" && Number.isFinite(req.body.maxCases)
        ? Math.floor(req.body.maxCases)
        : undefined;
    const started = startBlindSession({ seed, excludeHoldout, maxCases });
    res.status(201).json({
      sessionId: started.session.id,
      createdAtMs: started.session.createdAtMs,
      cases: started.cases,
      excludeHoldout,
      maxCases: maxCases ?? null,
      mentorEligible: false,
    });
  });

  app.get(`${base}/sessions/:id`, ...guards, (req: Request, res: Response) => {
    const r = getHumanDecisionReviewRepository();
    const session = r.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ code: "SESSION_NOT_FOUND", mentorEligible: false });
      return;
    }
    const cases = session.caseOrder.map((id, orderIndex) => {
      const c = getHumanReviewCase(id);
      if (!c) return null;
      return toBlindCaseView(c, orderIndex);
    }).filter(Boolean);
    res.json({
      sessionId: session.id,
      createdAtMs: session.createdAtMs,
      cases,
      mentorEligible: false,
    });
  });

  app.post(`${base}/sessions/:id/answers`, ...guards, (req: Request, res: Response) => {
    const parsed = answerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "INVALID_REQUEST",
        message: parsed.error.issues[0]?.message ?? "invalid body",
        mentorEligible: false,
      });
      return;
    }
    try {
      const answer = submitHumanAnswer(req.params.id, parsed.data);
      res.status(201).json({
        ok: true,
        reviewCaseId: answer.reviewCaseId,
        revision: answer.revision,
        answerHash: answer.answerHash,
        revealed: false,
        mentorEligible: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SUBMIT_FAILED";
      const code = msg === "SESSION_NOT_FOUND" ? 404 : 400;
      res.status(code).json({ code: msg, mentorEligible: false });
    }
  });

  app.post(`${base}/sessions/:id/reveal/:caseId`, ...guards, (req: Request, res: Response) => {
    try {
      const revealed = revealAfterSubmit(req.params.id, req.params.caseId);
      res.json({ ...revealed, mentorEligible: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "REVEAL_FAILED";
      const status =
        msg === "SESSION_NOT_FOUND" || msg === "CASE_NOT_FOUND"
          ? 404
          : msg === "ANSWER_REQUIRED_BEFORE_REVEAL"
            ? 409
            : 400;
      res.status(status).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/sessions/:id/report`, ...guards, (req: Request, res: Response) => {
    try {
      const built = buildSessionReport(req.params.id);
      res.json({ ...built, mentorEligible: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "REPORT_FAILED";
      res.status(msg === "SESSION_NOT_FOUND" ? 404 : 400).json({ code: msg, mentorEligible: false });
    }
  });

  app.get(`${base}/proposals`, ...guards, (_req: Request, res: Response) => {
    const proposals = getHumanDecisionReviewRepository().listProposals();
    res.json({
      proposals,
      byTaxonomy: groupProposalsByTaxonomy(proposals),
      bySuggestedAction: groupProposalsBySuggestedAction(proposals),
      autoApplyFromUi: false,
      mentorEligible: false,
    });
  });

  app.get(`${base}/packet`, ...guards, (req: Request, res: Response) => {
    const includeAnswers = req.query.includeAnswers === "1" || req.query.includeAnswers === "true";
    const r = getHumanDecisionReviewRepository();
    const packet = buildDecisionMethodologyReviewPacket({
      proposals: r.listProposals(),
      holdout: r.loadHoldoutSnapshot(),
      includeAnswers,
      answers: includeAnswers
        ? r.listSessions().flatMap((s) => r.getAnswersForSession(s.id))
        : undefined,
    });
    res.json({ packet, mentorEligible: false });
  });
}
