import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60_000;
const MAX = 40;
const hits = new Map<string, { count: number; resetAt: number }>();

export function marketSnapshotRateLimit(req: Request, res: Response, next: NextFunction): void {
  const user = req.saasUser ?? req.user;
  const key = user ? `u:${user.id}` : `ip:${req.ip || "unknown"}`;
  const now = Date.now();
  let row = hits.get(key);
  if (!row || now >= row.resetAt) {
    row = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(key, row);
  }
  row.count += 1;
  if (row.count > MAX) {
    res.status(429).json({
      code: "MARKET_SNAPSHOT_RATE_LIMIT",
      message: "Demasiadas solicitudes de Market Snapshot.",
    });
    return;
  }
  next();
}

export function resetMarketSnapshotRateLimitsForTests(): void {
  hits.clear();
}
