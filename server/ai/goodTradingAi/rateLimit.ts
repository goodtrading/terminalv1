/**
 * In-memory rate limiter for GoodTrading AI chat.
 *
 * TODO(distributed): replace with Redis / shared store for multi-instance production.
 * Current behaviour is single-instance / local-dev only.
 */
import type { Request, Response, NextFunction } from "express";
import { SAFE_AI_ERROR_MESSAGES } from "@shared/goodTradingAi";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export const AI_CHAT_RATE_MAX = 10;
export const AI_CHAT_RATE_WINDOW_MS = 60_000;

function resolveUserKey(req: Request): string {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw != null) {
    const id = Number(raw);
    if (Number.isFinite(id)) return `u:${Math.floor(id)}`;
  }
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  return `ip:${ip}`;
}

export function aiChatRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = `ai.chat:${resolveUserKey(req)}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + AI_CHAT_RATE_WINDOW_MS });
    next();
    return;
  }

  if (existing.count >= AI_CHAT_RATE_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      code: "RATE_LIMITED",
      error: "RATE_LIMITED",
      message: SAFE_AI_ERROR_MESSAGES.RATE_LIMITED,
    });
    return;
  }

  existing.count += 1;
  next();
}

/** Test helper — reset in-memory buckets. */
export function resetAiChatRateLimitsForTests(): void {
  buckets.clear();
}
