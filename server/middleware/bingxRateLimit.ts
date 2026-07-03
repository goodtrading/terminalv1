import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function resolveUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? Math.floor(id) : null;
}

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export type BingxRateLimitOptions = {
  scope: string;
  max: number;
  windowMs: number;
};

export function bingxRateLimit(options: BingxRateLimitOptions) {
  const { scope, max, windowMs } = options;
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = resolveUserId(req);
    const connectionId =
      typeof req.query.connectionId === "string" ? req.query.connectionId.trim() : "";
    const key = [
      scope,
      userId != null ? `u:${userId}` : `ip:${clientIp(req)}`,
      connectionId ? `c:${connectionId}` : "",
    ]
      .filter(Boolean)
      .join(":");

    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        success: false,
        code: "BINGX_RATE_LIMITED",
        message: "Too many BingX requests. Please wait and try again.",
        retryAfterSec,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

/** Test helper — reset in-memory buckets. */
export function resetBingxRateLimitsForTests(): void {
  buckets.clear();
}
