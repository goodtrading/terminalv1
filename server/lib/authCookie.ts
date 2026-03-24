import type { CookieOptions, Response } from "express";

/** Must match middleware + client expectations (httpOnly; not readable from JS). */
export const AUTH_COOKIE_NAME = "token";

/** Align with default JWT TTL in server/lib/jwt.ts (7 days). */
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function authCookieBase(): Pick<CookieOptions, "httpOnly" | "secure" | "sameSite" | "path"> {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };
}

export function getAuthCookieOptions(): CookieOptions {
  return {
    ...authCookieBase(),
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, authCookieBase());
}
