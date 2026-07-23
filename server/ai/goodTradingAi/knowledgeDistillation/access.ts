import type { Request, Response, NextFunction } from "express";
import { requireSaasAuth } from "../../../middleware/saasAuth";
import { isAdminRole } from "../../../lib/userRoles";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "./features";
import { randomUUID } from "node:crypto";

export function requireKnowledgeDistillationAccess(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
  res.setHeader("x-request-id", requestId);
  if (!isGoodTradingAiKnowledgeDistillationEnabled()) {
    res.status(403).json({
      code: "KNOWLEDGE_DISTILLATION_DISABLED",
      message: "Knowledge Distillation Lab disabled.",
      requestId,
    });
    return;
  }
  void requireSaasAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (res.headersSent) return;
    const user = req.saasUser ?? req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required.", requestId });
      return;
    }
    if (!isAdminRole(user.role)) {
      res.status(403).json({ code: "KNOWLEDGE_DISTILLATION_FORBIDDEN", message: "Admin only.", requestId });
      return;
    }
    next();
  });
}