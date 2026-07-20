import type { Request, Response, NextFunction } from "express";
import { requireSaasAuth } from "../../../middleware/saasAuth";
import { isAdminRole } from "../../../lib/userRoles";
import { isGoodTradingAiExtractorEnabled } from "./features";
import { randomUUID } from "node:crypto";

/**
 * Internal Knowledge Inbox access:
 * 1) GOODTRADING_AI_EXTRACTOR_ENABLED
 * 2) requireSaasAuth
 * 3) admin role
 */
export function requireExtractorAccess(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
  res.setHeader("x-request-id", requestId);

  if (!isGoodTradingAiExtractorEnabled()) {
    res.status(403).json({
      code: "EXTRACTOR_DISABLED",
      message: "Knowledge Inbox está deshabilitado.",
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
        code: "EXTRACTOR_FORBIDDEN",
        message: "Knowledge Inbox es solo para administradores internos.",
        requestId,
      });
      return;
    }

    (req as Request & { extractorRequestId?: string }).extractorRequestId = requestId;
    next();
  });
}
