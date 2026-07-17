import type { Express, Request, Response } from "express";
import { requireCalibrationAccess } from "../ai/goodTradingAi/calibration/access";
import { calibrationRateLimit } from "../ai/goodTradingAi/calibration/rateLimit";
import {
  CALIBRATION_CASES,
  calibrationCaseDistribution,
  getCalibrationCaseById,
  listCalibrationCases,
} from "../ai/goodTradingAi/calibration/cases";
import { buildCurrentAiResponseForCase } from "../ai/goodTradingAi/calibration/responseSnapshot";
import { createOrUpdateReview } from "../ai/goodTradingAi/calibration/reviews";
import {
  exportStoreJson,
  getDraft,
  getProposal,
  getReview,
  getReviewByCaseId,
  listProposals,
  listReviews,
  saveDraft,
  upsertProposal,
} from "../ai/goodTradingAi/calibration/store";
import { computeCalibrationMetrics } from "../ai/goodTradingAi/calibration/metrics";
import { listApprovedGoldenCases, tryCreateGoldenFromReview } from "../ai/goodTradingAi/calibration/golden";
import { isGoodTradingAiCalibrationEnabled } from "../ai/goodTradingAi/calibration/features";
import { getKnowledgeRegistryVersion } from "../ai/goodTradingAi/calibration/registryVersion";
import { z } from "zod";

function userOf(req: Request) {
  return req.saasUser ?? req.user;
}

export function registerCalibrationRoutes(app: Express): void {
  const base = "/api/internal/ai/calibration";
  const guards = [requireCalibrationAccess, calibrationRateLimit];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiCalibrationEnabled(),
      caseCount: CALIBRATION_CASES.length,
      distribution: calibrationCaseDistribution(),
      registryVersion: getKnowledgeRegistryVersion(),
      goldenCount: listApprovedGoldenCases().length,
      note: "Uso interno — Metodología GoodTrading. No modifica el registry al revisar.",
    });
  });

  app.get(`${base}/cases`, ...guards, (req: Request, res: Response) => {
    const domainRaw = typeof req.query.domain === "string" ? req.query.domain : undefined;
    const allowed = new Set([
      "constitution",
      "liquidity",
      "order_flow",
      "gamma",
      "delta_cvd_oi",
      "execution_risk",
      "compound_setup",
    ]);
    const domain =
      domainRaw && allowed.has(domainRaw)
        ? (domainRaw as import("@shared/goodTradingAiCalibration").CalibrationDomain)
        : undefined;
    const cases = listCalibrationCases(domain ? { domain } : undefined);
    res.json({ cases, distribution: calibrationCaseDistribution() });
  });

  app.get(`${base}/cases/:id`, ...guards, (req: Request, res: Response) => {
    const c = getCalibrationCaseById(req.params.id);
    if (!c) {
      res.status(404).json({ code: "CASE_NOT_FOUND", message: "Caso no encontrado." });
      return;
    }
    const review = getReviewByCaseId(c.id);
    res.json({ case: c, review: review ?? null });
  });

  app.get(`${base}/cases/:id/ai-response`, ...guards, (req: Request, res: Response) => {
    const c = getCalibrationCaseById(req.params.id);
    if (!c) {
      res.status(404).json({ code: "CASE_NOT_FOUND", message: "Caso no encontrado." });
      return;
    }
    const snapshot = buildCurrentAiResponseForCase(c);
    res.json({ caseId: c.id, ai: snapshot });
  });

  app.post(`${base}/reviews`, ...guards, (req: Request, res: Response) => {
    try {
      const user = userOf(req)!;
      const review = createOrUpdateReview({
        input: req.body,
        userId: Number(user.id),
        userEmail: user.email,
      });
      res.json({ review, proposals: listProposals().filter((p) => p.reviewId === review.id) });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? "PROVIDER_ERROR";
      res.status(code === "INVALID_REQUEST" ? 400 : 500).json({
        code,
        message: "No se pudo guardar la revisión.",
      });
    }
  });

  app.get(`${base}/reviews`, ...guards, (_req: Request, res: Response) => {
    res.json({ reviews: listReviews() });
  });

  app.get(`${base}/reviews/:id`, ...guards, (req: Request, res: Response) => {
    const r = getReview(req.params.id);
    if (!r) {
      res.status(404).json({ code: "REVIEW_NOT_FOUND", message: "Revisión no encontrada." });
      return;
    }
    res.json({ review: r });
  });

  app.get(`${base}/proposals`, ...guards, (_req: Request, res: Response) => {
    res.json({ proposals: listProposals() });
  });

  app.get(`${base}/proposals/:id`, ...guards, (req: Request, res: Response) => {
    const p = getProposal(req.params.id);
    if (!p) {
      res.status(404).json({ code: "PROPOSAL_NOT_FOUND", message: "Proposal no encontrada." });
      return;
    }
    res.json({ proposal: p });
  });

  app.post(`${base}/proposals/:id/status`, ...guards, (req: Request, res: Response) => {
    const schema = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_REQUEST", message: "Status inválido." });
      return;
    }
    const p = getProposal(req.params.id);
    if (!p) {
      res.status(404).json({ code: "PROPOSAL_NOT_FOUND", message: "Proposal no encontrada." });
      return;
    }
    // HTTP must NEVER apply patches — only status for offline CLI.
    const updated = upsertProposal({ ...p, status: parsed.data.status });
    res.json({
      proposal: updated,
      note: "Apply solo vía CLI offline: npm run goodtrading-ai:calibration:apply -- --proposal <id> --dry-run",
    });
  });

  app.get(`${base}/metrics`, ...guards, (_req: Request, res: Response) => {
    res.json({ metrics: computeCalibrationMetrics() });
  });

  app.get(`${base}/golden`, ...guards, (_req: Request, res: Response) => {
    res.json({ goldenCases: listApprovedGoldenCases() });
  });

  app.post(`${base}/golden/from-review/:reviewId`, ...guards, (req: Request, res: Response) => {
    const r = getReview(req.params.reviewId);
    if (!r) {
      res.status(404).json({ code: "REVIEW_NOT_FOUND", message: "Revisión no encontrada." });
      return;
    }
    const g = tryCreateGoldenFromReview(r);
    if (!g) {
      res.status(400).json({
        code: "GOLDEN_NOT_ELIGIBLE",
        message: "Solo revisiones APPROVED con respuesta de Ignacio generan Golden Cases.",
      });
      return;
    }
    res.json({ goldenCase: g });
  });

  app.post(`${base}/drafts`, ...guards, (req: Request, res: Response) => {
    const schema = z
      .object({
        caseId: z.string().min(1).max(80),
        draft: z.record(z.unknown()),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_REQUEST", message: "Draft inválido." });
      return;
    }
    const user = userOf(req)!;
    saveDraft(Number(user.id), parsed.data.caseId, parsed.data.draft);
    res.json({ ok: true });
  });

  app.get(`${base}/drafts/:caseId`, ...guards, (req: Request, res: Response) => {
    const user = userOf(req)!;
    res.json({ draft: getDraft(Number(user.id), req.params.caseId) ?? null });
  });

  app.get(`${base}/export`, ...guards, (_req: Request, res: Response) => {
    // Structured export — no tokens/keys/full corpus
    res.type("application/json").send(exportStoreJson());
  });
}
