/**
 * AI-8.1 / AI-8.1.1 — Read-only Decision Context diagnostic APIs.
 * Auth + user isolation. Sanitized. No trading / no AI apply / no journal edit.
 */
import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import {
  getTradeDecision,
  listTradeDecisionsForUser,
  listTradeDecisionsForAccount,
  isDecisionContextRecorderEnabled,
  canCaptureDecisionContext,
  isUnsafeNonDurableDecisionContextStore,
  UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
  getDecisionContextRepositoryMode,
  DECISION_CONTEXT_UI_BADGES,
  canUseDecisionContextForMentor,
  canUseDecisionContextForLearning,
  canMutateBrainFromDecisionContext,
  canAutoApplyDecisionContext,
} from "../ai/goodTradingAi/decisionContext";
import { assessDecisionContextStorageHealth } from "../ai/goodTradingAi/decisionContext/health";
import {
  assertExportSanitized,
  buildTradeDecisionExport,
} from "../ai/goodTradingAi/decisionContext/export";
import { getCachedSnapshot } from "../integrations/bingx/account";
import { pseudonymizeId } from "../integrations/bingx/account/redact";

function resolveRequestUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function requireUserId(req: Request, res: Response): number | null {
  const id = resolveRequestUserId(req);
  if (id != null) return id;
  res.status(401).json({
    success: false,
    code: "DECISION_CONTEXT_UNAUTHORIZED",
    message: "You must be logged in to view Decision Context records.",
  });
  return null;
}

function capInt(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function resolveAccountId(userId: number, connectionId: string | undefined): string | null {
  if (!connectionId) return null;
  const snap = getCachedSnapshot(userId, connectionId);
  if (snap?.accountId) return snap.accountId;
  return pseudonymizeId("account", connectionId, `u${userId}`);
}

export function registerDecisionContextRoutes(app: Express): void {
  const base = "/api/account/decision-context";
  const guards = [requireSaasAuth];

  app.get(`${base}/status`, ...guards, async (_req: Request, res: Response) => {
    const health = await assessDecisionContextStorageHealth();
    res.json({
      success: true,
      enabled: isDecisionContextRecorderEnabled(),
      canCapture: canCaptureDecisionContext(),
      repositoryMode: getDecisionContextRepositoryMode(),
      storageHealth: health.status,
      storage: health,
      badges: [...DECISION_CONTEXT_UI_BADGES, health.status],
      mentorEligible: canUseDecisionContextForMentor(),
      learning: canUseDecisionContextForLearning(),
      brainMutate: canMutateBrainFromDecisionContext(),
      autoApply: canAutoApplyDecisionContext(),
      unsafeNonDurable: isUnsafeNonDurableDecisionContextStore(),
      code: isUnsafeNonDurableDecisionContextStore()
        ? UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE
        : null,
      note: "AI-8.1.1 Decision Context Recorder — record only. Not connected to AI.",
    });
  });

  app.get(`${base}/health`, ...guards, async (_req: Request, res: Response) => {
    const health = await assessDecisionContextStorageHealth();
    res.json({
      success: true,
      ...health,
      badges: [...DECISION_CONTEXT_UI_BADGES, health.status],
    });
  });

  app.get(`${base}/decisions`, ...guards, async (req: Request, res: Response) => {
    const userId = requireUserId(req, res);
    if (userId == null) return;
    if (!isDecisionContextRecorderEnabled()) {
      res.status(403).json({
        success: false,
        code: "DECISION_CONTEXT_DISABLED",
        message: "Decision Context Recorder is disabled.",
        storageHealth: "RECORDER_DISABLED",
      });
      return;
    }
    if (isUnsafeNonDurableDecisionContextStore()) {
      res.status(503).json({
        success: false,
        code: UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
        message: "Unsafe non-durable Decision Context store in production.",
        storageHealth: "UNSAFE_MEMORY",
      });
      return;
    }
    const limit = capInt(req.query.limit, 30, 100);
    const connectionId =
      typeof req.query.connectionId === "string"
        ? req.query.connectionId.trim()
        : "";
    const accountId = resolveAccountId(userId, connectionId || undefined);
    try {
      const decisions = accountId
        ? await listTradeDecisionsForAccount(userId, accountId, limit)
        : await listTradeDecisionsForUser(userId, limit);
      const health = await assessDecisionContextStorageHealth();
      res.json({
        success: true,
        decisions,
        badges: [...DECISION_CONTEXT_UI_BADGES, health.status],
        storageHealth: health.status,
        mentorEligible: false,
        learning: false,
        brainMutate: false,
        autoApply: false,
      });
    } catch (err) {
      res.status(503).json({
        success: false,
        code: err instanceof Error ? err.message.slice(0, 80) : "DECISION_CONTEXT_ERROR",
        message: "Failed to list TradeDecisions.",
      });
    }
  });

  app.get(
    `${base}/decisions/:decisionId`,
    ...guards,
    async (req: Request, res: Response) => {
      const userId = requireUserId(req, res);
      if (userId == null) return;
      const decisionId = String(req.params.decisionId ?? "").trim();
      const decision = await getTradeDecision(decisionId);
      if (!decision || decision.userId !== userId) {
        res.status(404).json({
          success: false,
          code: "DECISION_NOT_FOUND",
          message: "TradeDecision not found.",
        });
        return;
      }
      const health = await assessDecisionContextStorageHealth();
      res.json({
        success: true,
        decision,
        badges: [...DECISION_CONTEXT_UI_BADGES, health.status],
        storageHealth: health.status,
        mentorEligible: false,
        learning: false,
        brainMutate: false,
        autoApply: false,
      });
    },
  );

  app.get(
    `${base}/decisions/:decisionId/journal`,
    ...guards,
    async (req: Request, res: Response) => {
      const userId = requireUserId(req, res);
      if (userId == null) return;
      const decisionId = String(req.params.decisionId ?? "").trim();
      const decision = await getTradeDecision(decisionId);
      if (!decision || decision.userId !== userId) {
        res.status(404).json({
          success: false,
          code: "DECISION_NOT_FOUND",
          message: "TradeDecision not found.",
        });
        return;
      }
      res.json({
        success: true,
        journal: decision.journal,
        timeline: decision.timeline,
        badges: DECISION_CONTEXT_UI_BADGES,
        mentorEligible: false,
        learning: false,
        brainMutate: false,
        autoApply: false,
      });
    },
  );

  app.get(
    `${base}/decisions/:decisionId/timeline`,
    ...guards,
    async (req: Request, res: Response) => {
      const userId = requireUserId(req, res);
      if (userId == null) return;
      const decisionId = String(req.params.decisionId ?? "").trim();
      const decision = await getTradeDecision(decisionId);
      if (!decision || decision.userId !== userId) {
        res.status(404).json({
          success: false,
          code: "DECISION_NOT_FOUND",
          message: "TradeDecision not found.",
        });
        return;
      }
      res.json({
        success: true,
        timeline: decision.timeline,
        badges: DECISION_CONTEXT_UI_BADGES,
        mentorEligible: false,
        learning: false,
        brainMutate: false,
        autoApply: false,
      });
    },
  );

  app.get(
    `${base}/decisions/:decisionId/export`,
    ...guards,
    async (req: Request, res: Response) => {
      const userId = requireUserId(req, res);
      if (userId == null) return;
      const decisionId = String(req.params.decisionId ?? "").trim();
      const decision = await getTradeDecision(decisionId);
      if (!decision || decision.userId !== userId) {
        res.status(404).json({
          success: false,
          code: "DECISION_NOT_FOUND",
          message: "TradeDecision not found.",
        });
        return;
      }
      try {
        const exportDoc = buildTradeDecisionExport(decision);
        assertExportSanitized(exportDoc);
        res.json({
          success: true,
          export: exportDoc,
          badges: DECISION_CONTEXT_UI_BADGES,
          mentorEligible: false,
          learning: false,
          brainMutate: false,
          autoApply: false,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          code: err instanceof Error ? err.message.slice(0, 80) : "EXPORT_FAILED",
          message: "Export failed sanitization.",
        });
      }
    },
  );
}
