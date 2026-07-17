import type { Request, Response, NextFunction } from "express";
import { requireSaasAuth } from "../../../middleware/saasAuth";
import { isAdminRole } from "../../../lib/userRoles";
import { isGoodTradingAiCalibrationEnabled } from "./features";
import { randomUUID } from "node:crypto";

/**
 * Internal calibration access:
 * 1) GOODTRADING_AI_CALIBRATION_ENABLED must be true (server)
 * 2) requireSaasAuth
 * 3) admin role via existing isAdminRole (server-validated session)
 *
 * Does NOT trust client email, localStorage, query params, or custom headers.
 */
export function requireCalibrationAccess(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID();
  res.setHeader("x-request-id", requestId);

  if (!isGoodTradingAiCalibrationEnabled()) {
    res.status(403).json({
      code: "CALIBRATION_DISABLED",
      message: "Calibration Lab está deshabilitado.",
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
        code: "CALIBRATION_FORBIDDEN",
        message: "Calibration Lab es solo para administradores internos.",
        requestId,
      });
      return;
    }

    (req as Request & { calibrationRequestId?: string }).calibrationRequestId = requestId;
    next();
  });
}
