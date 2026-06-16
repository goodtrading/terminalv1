import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(req: Request, scope: string): string {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return `${scope}:${ip}`;
}

/** Simple in-memory rate limiter for auth endpoints. */
export function authRateLimit(scope: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientKey(req, scope);
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (existing.count >= max) {
      res.status(429).json({ error: "RATE_LIMITED", message: "Demasiados intentos. Probá más tarde." });
      return;
    }
    existing.count += 1;
    next();
  };
}
