import type { Request, Response, NextFunction } from "express";
import { describeJwtSecretSource } from "../config/authConfig";
import { AUTH_COOKIE_NAME } from "../lib/authCookie";
import { verifyUserTokenDebug } from "../lib/jwt";
import { dbRoleToApiRole, isAdminRole } from "../lib/userRoles";
import { findUserById, userMayAuthenticate } from "../services/userService";

console.log("[saasAuth] middleware version: multi-token fallback active");

declare global {
  namespace Express {
    interface Request {
      saasUser?: SaasAuthUser;
      /** Mirror of saasUser for handlers that still read req.user */
      user?: SaasAuthUser;
    }
  }
}

function attachAuthUser(req: Request, user: SaasAuthUser): void {
  req.saasUser = user;
  req.user = user;
}

export type SaasAuthUser = { id: number; email: string; role: string };

type SaasAuthTestResolver = (req: Request) => Promise<SaasAuthUser | null> | SaasAuthUser | null;
let saasAuthTestResolver: SaasAuthTestResolver | null = null;

/** Test seam — bypass JWT resolution in integration tests. */
export function __setSaasAuthResolverForTests(resolver: SaasAuthTestResolver | null): void {
  saasAuthTestResolver = resolver;
}

export type AuthTokenDiagnostic = {
  hasCookie: boolean;
  hasBearer: boolean;
  tokenCandidatesCount: number;
  bearerJwtVerified: boolean;
  cookieJwtVerified: boolean;
  bearerUserFound: boolean;
  cookieUserFound: boolean;
  userResolved: boolean;
  userIdPresent: boolean;
  tokenSource: "bearer" | "cookie" | "none";
  failureReason?: string;
  jwtSecretSource: string;
};

function requestRoute(req: Request): string {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "";
  return raw.split("?")[0];
}

function isBingxApiRoute(req: Request): boolean {
  const route = requestRoute(req);
  return route.includes("/api/bingx") || route.includes("/api/live");
}

function isPaperApiRoute(req: Request): boolean {
  return requestRoute(req).includes("/api/paper");
}

function hasBearerHeader(req: Request): boolean {
  const auth = req.headers.authorization;
  return (
    typeof auth === "string" &&
    auth.startsWith("Bearer ") &&
    auth.slice("Bearer ".length).trim().length > 0
  );
}

function hasAuthCookie(req: Request): boolean {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  return typeof cookieToken === "string" && cookieToken.trim().length > 0;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
  const t = auth.slice("Bearer ".length).trim();
  return t.length > 0 ? t : null;
}

function getCookieToken(req: Request): string | null {
  const raw = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/** Bearer first, then httpOnly cookie. */
function collectAuthTokens(req: Request): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const push = (t: string | null) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    tokens.push(t);
  };
  push(getBearerToken(req));
  push(getCookieToken(req));
  return tokens;
}

async function probeSingleToken(
  token: string,
  kind: "bearer" | "cookie",
): Promise<{
  jwtVerified: boolean;
  userFound: boolean;
  user: SaasAuthUser | null;
  jwtError?: string;
  blockedByMayAuthenticate: boolean;
}> {
  const dbg = verifyUserTokenDebug(token);
  if (!dbg.payload) {
    return {
      jwtVerified: false,
      userFound: false,
      user: null,
      jwtError: dbg.error,
      blockedByMayAuthenticate: false,
    };
  }
  const row = await findUserById(dbg.payload.sub);
  if (!row) {
    return {
      jwtVerified: true,
      userFound: false,
      user: null,
      blockedByMayAuthenticate: false,
    };
  }
  const user: SaasAuthUser = {
    id: row.id,
    email: row.email,
    role: dbRoleToApiRole(row.role),
  };
  return {
    jwtVerified: true,
    userFound: true,
    user,
    blockedByMayAuthenticate: !userMayAuthenticate(row),
  };
}

/** Safe per-token probe (no secrets in logs). */
export async function diagnoseAuthTokens(req: Request): Promise<AuthTokenDiagnostic> {
  const hasCookie = hasAuthCookie(req);
  const hasBearer = hasBearerHeader(req);
  const tokens = collectAuthTokens(req);
  const bearerToken = getBearerToken(req);
  const cookieToken = getCookieToken(req);

  let bearerJwtVerified = false;
  let cookieJwtVerified = false;
  let bearerUserFound = false;
  let cookieUserFound = false;

  if (bearerToken) {
    const p = await probeSingleToken(bearerToken, "bearer");
    bearerJwtVerified = p.jwtVerified;
    bearerUserFound = p.userFound;
  }
  if (cookieToken) {
    const p = await probeSingleToken(cookieToken, "cookie");
    cookieJwtVerified = p.jwtVerified;
    cookieUserFound = p.userFound;
  }

  return {
    hasCookie,
    hasBearer,
    tokenCandidatesCount: tokens.length,
    bearerJwtVerified,
    cookieJwtVerified,
    bearerUserFound,
    cookieUserFound,
    userResolved: false,
    userIdPresent: false,
    tokenSource: "none",
    jwtSecretSource: describeJwtSecretSource(),
  };
}

/**
 * Single resolver for /api/auth/me, optionalSaasAuth, and requireSaasAuth.
 * Tries Bearer then cookie; same JWT verification for each candidate.
 */
export async function resolveAuthenticatedUser(
  req: Request,
  options: { enforceMayAuthenticate?: boolean } = {},
): Promise<{
  user: SaasAuthUser | null;
  tokenSource: "bearer" | "cookie" | "none";
  diagnostic: AuthTokenDiagnostic;
}> {
  const enforceMayAuthenticate = options.enforceMayAuthenticate === true;
  const base = await diagnoseAuthTokens(req);
  const tokens = collectAuthTokens(req);
  const bearerToken = getBearerToken(req);
  const cookieToken = getCookieToken(req);

  if (tokens.length === 0) {
    return {
      user: null,
      tokenSource: "none",
      diagnostic: {
        ...base,
        failureReason: "no_token",
      },
    };
  }

  let failureReason = "all_tokens_invalid";

  for (const token of tokens) {
    const kind: "bearer" | "cookie" =
      bearerToken && token === bearerToken
        ? "bearer"
        : cookieToken && token === cookieToken
          ? "cookie"
          : bearerToken
            ? "bearer"
            : "cookie";

    const p = await probeSingleToken(token, kind);
    if (!p.jwtVerified) {
      failureReason =
        kind === "bearer" ? "bearer_jwt_invalid" : "cookie_jwt_invalid";
      continue;
    }
    if (!p.userFound) {
      failureReason =
        kind === "bearer" ? "bearer_user_missing" : "cookie_user_missing";
      continue;
    }
    if (enforceMayAuthenticate && p.blockedByMayAuthenticate) {
      failureReason = `${kind}_user_blocked`;
      continue;
    }
    if (!p.user) continue;

    return {
      user: p.user,
      tokenSource: kind,
      diagnostic: {
        ...base,
        userResolved: true,
        userIdPresent: Number.isFinite(p.user.id),
        tokenSource: kind,
      },
    };
  }

  return {
    user: null,
    tokenSource: "none",
    diagnostic: {
      ...base,
      failureReason,
    },
  };
}

/** @deprecated Alias — use resolveAuthenticatedUser */
export const resolveSaasUserFromRequest = resolveAuthenticatedUser;

function logPaperAuthBackend(
  req: Request,
  diagnostic: AuthTokenDiagnostic,
  route?: string,
  extra?: Record<string, unknown>,
): void {
  console.log("[Paper Auth Backend]", {
    route: route ?? requestRoute(req),
    method: req.method,
    hasCookie: diagnostic.hasCookie,
    hasBearer: diagnostic.hasBearer,
    userResolved: diagnostic.userResolved,
    userIdPresent: diagnostic.userIdPresent,
    tokenSource: diagnostic.tokenSource,
    failureReason: diagnostic.failureReason ?? null,
    jwtSecretSource: diagnostic.jwtSecretSource,
    ...extra,
  });
}

function logBingXAuthBackend(
  req: Request,
  diagnostic: AuthTokenDiagnostic,
  route?: string,
): void {
  console.log("[BingX Auth Backend]", {
    route: route ?? requestRoute(req),
    hasCookie: diagnostic.hasCookie,
    hasBearer: diagnostic.hasBearer,
    tokenCandidatesCount: diagnostic.tokenCandidatesCount,
    bearerJwtVerified: diagnostic.bearerJwtVerified,
    cookieJwtVerified: diagnostic.cookieJwtVerified,
    bearerUserFound: diagnostic.bearerUserFound,
    cookieUserFound: diagnostic.cookieUserFound,
    userResolved: diagnostic.userResolved,
    userIdPresent: diagnostic.userIdPresent,
    tokenSource: diagnostic.tokenSource,
    failureReason: diagnostic.failureReason ?? null,
    jwtSecretSource: diagnostic.jwtSecretSource,
  });
}

export function logAuthMeDiagnostic(
  req: Request,
  authenticated: boolean,
  userId: number | null,
  tokenSource: "bearer" | "cookie" | "none",
  diagnostic: AuthTokenDiagnostic,
): void {
  console.log("[AuthMe]", {
    hasCookie: diagnostic.hasCookie,
    hasBearer: diagnostic.hasBearer,
    tokenCandidatesCount: diagnostic.tokenCandidatesCount,
    bearerJwtVerified: diagnostic.bearerJwtVerified,
    cookieJwtVerified: diagnostic.cookieJwtVerified,
    bearerUserFound: diagnostic.bearerUserFound,
    cookieUserFound: diagnostic.cookieUserFound,
    authenticated,
    userIdPresent: userId != null && Number.isFinite(userId),
    tokenSource,
    failureReason: diagnostic.failureReason ?? null,
    jwtSecretSource: diagnostic.jwtSecretSource,
  });
}

export async function optionalSaasAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.saasUser = undefined;
  const { user } = await resolveAuthenticatedUser(req, {
    enforceMayAuthenticate: false,
  });
  if (user) attachAuthUser(req, user);
  next();
}

function saasUnauthorized(
  res: Response,
  legacyCode: "UNAUTHORIZED" | "INVALID_TOKEN",
  bingxCode?: string,
  failureReason?: string,
): void {
  const message =
    legacyCode === "INVALID_TOKEN"
      ? "Session expired. Please sign in again."
      : "You must be logged in to manage exchange connections.";
  const responseCode = bingxCode ?? legacyCode;
  if (bingxCode) {
    console.log("[BingX Auth Backend] 401 response", {
      bingxCode,
      failureReason: failureReason ?? null,
    });
  }
  res.status(401).json({
    success: false,
    code: responseCode,
    message,
    error: legacyCode,
    failureReason: failureReason ?? undefined,
  });
}

export async function requireSaasAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (saasAuthTestResolver) {
    const user = await saasAuthTestResolver(req);
    if (!user) {
      saasUnauthorized(res, "UNAUTHORIZED", undefined, "no_token");
      return;
    }
    attachAuthUser(req, user);
    next();
    return;
  }

  const route = requestRoute(req);
  const { user, tokenSource, diagnostic } = await resolveAuthenticatedUser(req, {
    enforceMayAuthenticate: false,
  });

  if (!user) {
    const out: AuthTokenDiagnostic = {
      ...diagnostic,
      userResolved: false,
      userIdPresent: false,
      tokenSource: "none",
    };
    const invalidJwt =
      diagnostic.failureReason === "bearer_jwt_invalid" ||
      diagnostic.failureReason === "cookie_jwt_invalid" ||
      (diagnostic.hasBearer &&
        !diagnostic.bearerJwtVerified &&
        diagnostic.failureReason !== "no_token") ||
      (diagnostic.hasCookie &&
        !diagnostic.cookieJwtVerified &&
        diagnostic.failureReason !== "no_token");

    if (isPaperApiRoute(req)) {
      logPaperAuthBackend(req, out, route, {
        paperAuthCode: invalidJwt
          ? "PAPER_401_INVALID_TOKEN"
          : diagnostic.tokenCandidatesCount === 0
            ? "PAPER_401_REQUIRE_SAAS_AUTH"
            : "PAPER_401_NO_USER",
      });
      const paperCode = invalidJwt
        ? "PAPER_401_INVALID_TOKEN"
        : diagnostic.tokenCandidatesCount === 0
          ? "PAPER_401_REQUIRE_SAAS_AUTH"
          : "PAPER_401_NO_USER";
      res.status(401).json({
        success: false,
        code: paperCode,
        message: invalidJwt
          ? "Session expired. Please sign in again."
          : "Authentication required for paper trading.",
        failureReason: diagnostic.failureReason ?? undefined,
      });
      return;
    }

    if (isBingxApiRoute(req)) {
      logBingXAuthBackend(req, out, route);
    }
    const legacyCode = invalidJwt ? "INVALID_TOKEN" : "UNAUTHORIZED";
    const bingxCode = isBingxApiRoute(req)
      ? invalidJwt
        ? "BINGX_401_REQUIRE_SAAS_AUTH_INVALID_TOKEN"
        : "BINGX_401_REQUIRE_SAAS_AUTH"
      : undefined;
    saasUnauthorized(
      res,
      legacyCode,
      bingxCode,
      diagnostic.failureReason,
    );
    return;
  }

  attachAuthUser(req, user);
  if (isPaperApiRoute(req)) {
    logPaperAuthBackend(
      req,
      {
        ...diagnostic,
        userResolved: true,
        userIdPresent: true,
        tokenSource,
      },
      route,
    );
  } else if (isBingxApiRoute(req)) {
    logBingXAuthBackend(req, {
      ...diagnostic,
      userResolved: true,
      userIdPresent: true,
      tokenSource,
    }, route);
  }
  next();
}

export async function requireSaasAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const logPrefix = "[admin-auth]";
  const route = requestRoute(req);
  console.log(logPrefix, "route:", route);
  
  const { user, diagnostic } = await resolveAuthenticatedUser(req, {
    enforceMayAuthenticate: true,
  });
  
  console.log(logPrefix, "session/user exists:", !!user);
  if (user) {
    console.log(logPrefix, "userId:", user.id);
    console.log(logPrefix, "role:", user.role);
  } else {
    console.log(logPrefix, "failureReason:", diagnostic.failureReason);
  }
  
  if (!user) {
    console.log(logPrefix, "allowed: false (no user)");
    saasUnauthorized(res, "UNAUTHORIZED");
    return;
  }
  
  const isAdmin = isAdminRole(user.role);
  console.log(logPrefix, "isAdmin:", isAdmin);
  
  if (!isAdmin) {
    console.log(logPrefix, "allowed: false (not admin)");
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  
  console.log(logPrefix, "allowed: true");
  attachAuthUser(req, user);
  next();
}
