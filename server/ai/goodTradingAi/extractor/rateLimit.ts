import type { Request, Response, NextFunction } from "express";

const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX = 30;

export function extractorRateLimit(req: Request, res: Response, next: NextFunction): void {
  const user = req.saasUser ?? req.user;
  const key = user?.id != null ? `u:${user.id}` : `ip:${req.ip ?? "unknown"}`;
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || now > cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }
  cur.count += 1;
  if (cur.count > MAX) {
    res.status(429).json({
      code: "RATE_LIMITED",
      message: "Demasiadas solicitudes al Knowledge Inbox.",
    });
    return;
  }
  next();
}

export function resetExtractorRateLimitsForTests(): void {
  hits.clear();
}
