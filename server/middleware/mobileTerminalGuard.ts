import type { Request, Response, NextFunction } from "express";
import { verifyMobileTerminalAccess } from "../services/mobile/mobileTerminalAccessService";

function resolveUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? Math.floor(id) : null;
}

declare global {
  namespace Express {
    interface Request {
      mobileTerminalAccess?: {
        userId: number;
        planSlug?: string;
        planName?: string;
        capabilities: {
          terminal_mobile_access: boolean;
        };
      };
    }
  }
}

/**
 * Requires `requireSaasAuth` to run first.
 * Validates active terminal subscription (fail-closed).
 */
export async function requireMobileTerminalPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = resolveUserId(req);
  const result = await verifyMobileTerminalAccess(userId);
  if (!result.ok) {
    res.status(result.status).json({
      status: "error",
      error: {
        code: result.code,
        message: result.message,
      },
    });
    return;
  }
  req.mobileTerminalAccess = {
    userId: result.userId,
    planSlug: result.planSlug,
    planName: result.planName,
    capabilities: result.capabilities,
  };
  next();
}
