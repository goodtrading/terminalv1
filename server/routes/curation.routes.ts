/**
 * Knowledge curation routes — admin/internal only.
 * NEVER mutates Brain registry. Compact issue fields only.
 */
import type { Express, Request, Response } from "express";
import {
  curationReviewInputSchema,
  runCurationScanRequestSchema,
} from "@shared/goodTradingAiCuration";
import { requireCurationAccess } from "../ai/goodTradingAi/curation/access";
import { curationRateLimit } from "../ai/goodTradingAi/curation/rateLimit";
import { isGoodTradingAiCurationEnabled } from "../ai/goodTradingAi/curation/features";
import { runCurationScan } from "../ai/goodTradingAi/curation/runCurationScan";
import {
  applyCurationReview,
  curationQueueStats,
  getIssue,
  getLastHealth,
  listIssues,
  listReviews,
  listVersions,
  appendVersions,
} from "../ai/goodTradingAi/curation/curationStore";
import { appendVersionEvent } from "../ai/goodTradingAi/curation/versioning";
import { knowledgeRegistry } from "../ai/goodTradingAi/knowledge/registry";

function userOf(req: Request) {
  return req.saasUser ?? req.user;
}

export function registerCurationRoutes(app: Express): void {
  const base = "/api/internal/ai/curation";
  const guards = [requireCurationAccess, curationRateLimit];

  app.get(`${base}/status`, ...guards, (_req: Request, res: Response) => {
    res.json({
      enabled: isGoodTradingAiCurationEnabled(),
      stats: curationQueueStats(),
      health: getLastHealth(),
      entryCount: knowledgeRegistry.count(),
      note: "Knowledge Curation — sugerencias para revisión humana. No escribe al Brain automáticamente.",
    });
  });

  app.post(`${base}/scan`, ...guards, (req: Request, res: Response) => {
    const parsed = runCurationScanRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        code: "INVALID_REQUEST",
        message: "Payload de scan inválido.",
      });
      return;
    }
    const result = runCurationScan(parsed.data);
    res.json({
      metrics: result.metrics,
      issueCount: result.issueCount,
      issues: result.issues.slice(0, 100),
      stats: curationQueueStats(),
      durationMs: result.durationMs,
      autoAppliedToBrain: false as const,
    });
  });

  app.get(`${base}/health`, ...guards, (_req: Request, res: Response) => {
    const health = getLastHealth();
    if (!health) {
      res.status(404).json({
        code: "NO_HEALTH_SCAN",
        message: "Ejecutá POST /scan primero.",
      });
      return;
    }
    res.json({ health, stats: curationQueueStats() });
  });

  app.get(`${base}/queue`, ...guards, (req: Request, res: Response) => {
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const kindRaw = typeof req.query.kind === "string" ? req.query.kind : undefined;
    const allowedStatus = new Set(["PENDING", "ACCEPTED", "EDITED", "MERGED", "IGNORED"]);
    const status =
      statusRaw && allowedStatus.has(statusRaw)
        ? (statusRaw as import("@shared/goodTradingAiCuration").CurationIssueStatus)
        : undefined;
    const issues = listIssues({ status, kind: kindRaw });
    res.json({
      issues: issues.slice(0, 200),
      stats: curationQueueStats(),
      health: getLastHealth(),
    });
  });

  app.get(`${base}/issues/:id`, ...guards, (req: Request, res: Response) => {
    const issue = getIssue(String(req.params.id));
    if (!issue) {
      res.status(404).json({ code: "ISSUE_NOT_FOUND", message: "Issue no encontrado." });
      return;
    }
    res.json({ issue });
  });

  app.post(`${base}/review`, ...guards, (req: Request, res: Response) => {
    const parsed = curationReviewInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ code: "INVALID_REQUEST", message: "Review inválido." });
      return;
    }
    const user = userOf(req);
    try {
      const result = applyCurationReview({
        input: parsed.data,
        reviewedByUserId: user!.id,
        reviewedByEmail: user!.email,
      });
      // Optional version note on MERGE/ACCEPT — still no Brain write
      if (parsed.data.decision === "MERGE" && parsed.data.mergeKeepId) {
        const keep = knowledgeRegistry.getById(parsed.data.mergeKeepId);
        if (keep) {
          appendVersions([
            appendVersionEvent({
              entryId: keep.id,
              editor: user!.email || `user:${user!.id}`,
              reason: parsed.data.notes || "Merge aprobado en curation (pendiente apply editorial).",
              fromVersion: keep.version,
              toVersion: keep.version,
              diffSummary: `Review MERGE keep=${parsed.data.mergeKeepId} drop=${parsed.data.mergeDropId ?? "?"}`,
            }),
          ]);
        }
      }
      res.json({
        review: result.review,
        issue: result.issue,
        autoAppliedToBrain: false as const,
        stats: curationQueueStats(),
      });
    } catch (e) {
      if (e instanceof Error && e.message === "ISSUE_NOT_FOUND") {
        res.status(404).json({ code: "ISSUE_NOT_FOUND", message: "Issue no encontrado." });
        return;
      }
      throw e;
    }
  });

  app.get(`${base}/versions`, ...guards, (req: Request, res: Response) => {
    const entryId = typeof req.query.entryId === "string" ? req.query.entryId : undefined;
    const versions = listVersions(entryId).slice(0, 200);
    res.json({ versions, count: versions.length });
  });

  app.get(`${base}/reviews`, ...guards, (_req: Request, res: Response) => {
    res.json({ reviews: listReviews().slice(0, 100) });
  });
}
