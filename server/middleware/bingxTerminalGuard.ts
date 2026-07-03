import type { Request, Response, NextFunction } from "express";
import { verifyBingxTerminalAccess } from "../services/exchanges/bingx/bingxAccessService";

function resolveUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? Math.floor(id) : null;
}

declare global {
  namespace Express {
    interface Request {
      bingxTerminalAccess?: {
        userId: number;
        planSlug?: string;
        planName?: string;
      };
    }
  }
}

/**
 * Requires `requireSaasAuth` to run first.
 * Validates active terminal subscription (fail-closed).
 */
export async function requireBingxTerminalPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = resolveUserId(req);
  const result = await verifyBingxTerminalAccess(userId);
  if (!result.ok) {
    res.status(result.status).json({
      success: false,
      code: result.code,
      message: result.message,
    });
    return;
  }
  req.bingxTerminalAccess = {
    userId: result.userId,
    planSlug: result.planSlug,
    planName: result.planName,
  };
  next();
}
