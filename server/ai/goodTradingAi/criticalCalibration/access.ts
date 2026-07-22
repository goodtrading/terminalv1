import type { Request, Response, NextFunction } from "express";
import { requireSaasAuth } from "../../../middleware/saasAuth";
import { isAdminRole } from "../../../lib/userRoles";
import { isGoodTradingAiCriticalCalibrationEnabled } from "./features";
import { randomUUID } from "node:crypto";

export function requireCriticalCalibrationAccess(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
  res.setHeader("x-request-id", requestId);
  if (!isGoodTradingAiCriticalCalibrationEnabled()) {
    res.status(403).json({ code: "CRITICAL_CALIBRATION_DISABLED", message: "Critical Calibration Lab disabled.", requestId });
    return;
  }
  void requireSaasAuth(req, res, (err?: unknown) => {
    if (err) { next(err); return; }
    if (res.headersSent) return;
    const user = req.saasUser ?? req.user;
    if (!user) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required.", requestId });
      return;
    }
    if (!isAdminRole(user.role)) {
      res.status(403).json({ code: "CRITICAL_CALIBRATION_FORBIDDEN", message: "Admin only.", requestId });
      return;
    }
    next();
  });
}
