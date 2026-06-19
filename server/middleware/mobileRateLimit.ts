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

export type MobileRateLimitOptions = {
  scope: string;
  max: number;
  windowMs: number;
  code?: string;
};

function applyRateLimitHeaders(res: Response, max: number, remaining: number, resetAt: number): void {
  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

export function mobileRateLimit(options: MobileRateLimitOptions) {
  const { scope, max, windowMs, code = "MOBILE_RATE_LIMITED" } = options;
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = resolveUserId(req);
    const key = [scope, userId != null ? `u:${userId}` : `ip:${clientIp(req)}`].join(":");

    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      buckets.set(key, { count: 1, resetAt });
      applyRateLimitHeaders(res, max, max - 1, resetAt);
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      applyRateLimitHeaders(res, max, 0, existing.resetAt);
      res.status(429).json({
        status: "error",
        error: {
          code,
          message: "Too many mobile API requests. Please wait and try again.",
          retryAfterSec,
        },
      });
      return;
    }

    existing.count += 1;
    applyRateLimitHeaders(res, max, max - existing.count, existing.resetAt);
    next();
  };
}

/** Test helper — reset in-memory buckets. */
export function resetMobileRateLimitsForTests(): void {
  buckets.clear();
}
