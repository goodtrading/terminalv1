import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export const CALIBRATION_RATE_MAX = 60;
export const CALIBRATION_RATE_WINDOW_MS = 60_000;

export function calibrationRateLimit(req: Request, res: Response, next: NextFunction): void {
  const uid = req.saasUser?.id ?? req.user?.id ?? "anon";
  const key = `calib:${uid}`;
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + CALIBRATION_RATE_WINDOW_MS });
    next();
    return;
  }
  if (existing.count >= CALIBRATION_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({
      code: "RATE_LIMITED",
      message: "Demasiadas solicitudes al Calibration Lab.",
    });
    return;
  }
  existing.count += 1;
  next();
}

export function resetCalibrationRateLimitsForTests(): void {
  buckets.clear();
}
