import type { Request, Response, NextFunction } from "express";
import { requireSaasAuth } from "../../../../middleware/saasAuth";
import { isAdminRole } from "../../../../lib/userRoles";
import { isGoodTradingAiDecisionReviewEnabled } from "./features";
import { randomUUID } from "node:crypto";

/**
 * Blind human review access:
 * 1) GOODTRADING_AI_DECISION_REVIEW_ENABLED
 * 2) requireSaasAuth
 * 3) admin role
 */
export function requireDecisionReviewAccess(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
  res.setHeader("x-request-id", requestId);

  if (!isGoodTradingAiDecisionReviewEnabled()) {
    res.status(403).json({
      code: "DECISION_REVIEW_DISABLED",
      message: "Human Methodology Review está deshabilitado.",
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
      res.status(401).json({
        code: "UNAUTHENTICATED",
        message: "Authentication required.",
        requestId,
      });
      return;
    }

    if (!isAdminRole(user.role)) {
      res.status(403).json({
        code: "DECISION_REVIEW_FORBIDDEN",
        message: "Human Methodology Review es solo para administradores internos.",
        requestId,
      });
      return;
    }

    next();
  });
}
