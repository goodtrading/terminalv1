/**
 * Knowledge acquisition routes — admin/internal only.
 * NEVER mutates Brain registry. Compact proposal fields only.
 */
import type { Express, Request, Response } from "express";
import {
  extractTranscriptRequestSchema,
  proposalReviewInputSchema,
} from "@shared/goodTradingAiExtractor";
import { requireExtractorAccess } from "../ai/goodTradingAi/extractor/access";
import { extractorRateLimit } from "../ai/goodTradingAi/extractor/rateLimit";
import { isGoodTradingAiExtractorEnabled } from "../ai/goodTradingAi/extractor/features";
import { runKnowledgeExtraction } from "../ai/goodTradingAi/extractor/runExtraction";
import {
  applyProposalReview,
  getProposal,
  inboxStats,
  listJobs,
  listProposals,
  listReviews,
} from "../ai/goodTradingAi/extractor/store";

function userOf(req: Request) {
  return req.saasUser ?? req.user;
}

export function registerExtractorRoutes(app: Express): void {
  const base = "/api/internal/ai/extractor";
  const guards = [requireExtractorAccess, extractorRateLimit];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiExtractorEnabled(),
      stats: inboxStats(),
      note: "Knowledge Acquisition — propuestas para revisión humana. No escribe al Brain automáticamente.",
    });
  });

  app.post(`${base}/extract`, ...guards, (req: Request, res: Response) => {
    const parsed = extractTranscriptRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        code: "INVALID_REQUEST",
        message: "Transcript inválido (mín. 20 / máx. 50000 caracteres).",
      });
      return;
    }
    const started = Date.now();
    const result = runKnowledgeExtraction(parsed.data);
    res.json({
      job: result.job,
      proposals: result.proposals,
      segmentCount: result.segmentCount,
      candidateCount: result.candidateCount,
      durationMs: Date.now() - started,
      autoAppliedToBrain: false,
    });
  });

  app.get(`${base}/inbox`, ...guards, (req: Request, res: Response) => {
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const allowed = new Set(["PENDING", "ACCEPTED", "EDITED", "MERGED", "REJECTED"]);
    const status =
      statusRaw && allowed.has(statusRaw)
        ? (statusRaw as import("@shared/goodTradingAiExtractor").ProposalStatus)
        : undefined;
    const proposals = listProposals(status ? { status } : undefined);
    res.json({ proposals, stats: inboxStats() });
  });

  app.get(`${base}/proposals/:id`, ...guards, (req: Request, res: Response) => {
    const p = getProposal(String(req.params.id));
    if (!p) {
      res.status(404).json({ code: "PROPOSAL_NOT_FOUND", message: "Propuesta no encontrada." });
      return;
    }
    res.json({ proposal: p });
  });

  app.post(`${base}/review`, ...guards, (req: Request, res: Response) => {
    const parsed = proposalReviewInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_REQUEST", message: "Review inválida." });
      return;
    }
    if (parsed.data.decision === "MERGE" && !parsed.data.mergeTargetId?.trim()) {
      res.status(400).json({
        code: "INVALID_REQUEST",
        message: "MERGE requiere mergeTargetId.",
      });
      return;
    }
    if (
      parsed.data.decision === "EDIT" &&
      !parsed.data.editedStatement?.trim() &&
      !parsed.data.editedTitle?.trim()
    ) {
      res.status(400).json({
        code: "INVALID_REQUEST",
        message: "EDIT requiere editedTitle o editedStatement.",
      });
      return;
    }

    const user = userOf(req);
    if (!user?.id) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required." });
      return;
    }

    try {
      const { review, proposal } = applyProposalReview({
        input: parsed.data,
        reviewedByUserId: Number(user.id),
        reviewedByEmail: typeof user.email === "string" ? user.email : undefined,
      });
      res.json({
        review,
        proposal,
        autoAppliedToBrain: false,
        note: "Decisión registrada. El Brain/registry no se modifica automáticamente.",
      });
    } catch (err) {
      if (err instanceof Error && err.message === "PROPOSAL_NOT_FOUND") {
        res.status(404).json({ code: "PROPOSAL_NOT_FOUND", message: "Propuesta no encontrada." });
        return;
      }
      res.status(500).json({ code: "REVIEW_ERROR", message: "No se pudo registrar la review." });
    }
  });

  app.get(`${base}/jobs`, ...guards, (_req: Request, res: Response) => {
    res.json({ jobs: listJobs().slice(0, 100) });
  });

  app.get(`${base}/reviews`, ...guards, (_req: Request, res: Response) => {
    res.json({ reviews: listReviews().slice(0, 200) });
  });
}
