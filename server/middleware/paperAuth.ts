import type { Request, Response } from "express";
import type { AuthTokenDiagnostic } from "./saasAuth";

export function isPaperApiRoute(req: Request): boolean {
  const raw = req.originalUrl ?? req.url ?? req.path ?? "";
  return raw.includes("/api/paper");
}

export function paperRequestRoute(req: Request): string {
  return (req.originalUrl ?? req.url ?? req.path ?? "").split("?")[0];
}

export function logPaperAuthBackend(
  req: Request,
  diagnostic: Partial<AuthTokenDiagnostic>,
  extra?: Record<string, unknown>,
): void {
  console.log("[Paper Auth Backend]", {
    route: paperRequestRoute(req),
    method: req.method,
    hasCookie: diagnostic.hasCookie ?? false,
    hasBearer: diagnostic.hasBearer ?? false,
    userResolved: diagnostic.userResolved ?? false,
    userIdPresent: diagnostic.userIdPresent ?? false,
    tokenSource: diagnostic.tokenSource ?? "none",
    failureReason: diagnostic.failureReason ?? null,
    ...extra,
  });
}

/** Same id resolution as BingX handlers: saasUser first, then req.user mirror. */
export function resolvePaperUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const userId = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(userId) ? userId : null;
}

export type PaperAuthFailureCode =
  | "PAPER_401_REQUIRE_SAAS_AUTH"
  | "PAPER_401_INVALID_TOKEN"
  | "PAPER_401_REQUIRE_USER_ID"
  | "PAPER_401_NO_USER";

export function paperAuthFailureCode(
  req: Request,
  diagnostic: AuthTokenDiagnostic,
  userId: number | null,
): PaperAuthFailureCode {
  if (userId == null) {
    if (reqHasAnyUser(req)) {
      return "PAPER_401_REQUIRE_USER_ID";
    }
    const invalidJwt =
      diagnostic.bearerJwtVerified === false &&
      diagnostic.hasBearer === true &&
      (diagnostic.failureReason === "bearer_jwt_invalid" ||
        diagnostic.failureReason === "bearer_user_missing");
    const cookieInvalid =
      diagnostic.cookieJwtVerified === false &&
      diagnostic.hasCookie === true &&
      (diagnostic.failureReason === "cookie_jwt_invalid" ||
        diagnostic.failureReason === "cookie_user_missing");
    if (
      diagnostic.failureReason === "bearer_jwt_invalid" ||
      diagnostic.failureReason === "cookie_jwt_invalid" ||
      invalidJwt ||
      cookieInvalid
    ) {
      return "PAPER_401_INVALID_TOKEN";
    }
    if (diagnostic.tokenCandidatesCount === 0 || diagnostic.failureReason === "no_token") {
      return "PAPER_401_REQUIRE_SAAS_AUTH";
    }
    return "PAPER_401_NO_USER";
  }
  return "PAPER_401_REQUIRE_USER_ID";
}

function reqHasAnyUser(req: Request): boolean {
  return req.saasUser != null || req.user != null;
}

export function respondPaperUnauthorized(
  req: Request,
  res: Response,
  code: PaperAuthFailureCode,
  diagnostic?: Partial<AuthTokenDiagnostic>,
): void {
  logPaperAuthBackend(req, diagnostic ?? {}, { paperAuthCode: code });
  const messages: Record<PaperAuthFailureCode, string> = {
    PAPER_401_REQUIRE_SAAS_AUTH: "Authentication required for paper trading.",
    PAPER_401_INVALID_TOKEN: "Session expired. Please sign in again.",
    PAPER_401_REQUIRE_USER_ID: "Authentication required for paper trading.",
    PAPER_401_NO_USER: "Authentication required for paper trading.",
  };
  res.status(401).json({
    success: false,
    code,
    message: messages[code],
  });
}

/**
 * Requires requireSaasAuth to have run first.
 * Returns userId or sends 401 with a specific PAPER_401_* code.
 */
export function requirePaperUserId(
  req: Request,
  res: Response,
  diagnostic?: AuthTokenDiagnostic,
): number | null {
  const userId = resolvePaperUserId(req);
  if (userId != null) {
    return userId;
  }

  const code = diagnostic
    ? paperAuthFailureCode(req, diagnostic, null)
    : req.saasUser == null && req.user == null
      ? "PAPER_401_REQUIRE_SAAS_AUTH"
      : "PAPER_401_REQUIRE_USER_ID";

  respondPaperUnauthorized(req, res, code, diagnostic);
  return null;
}
