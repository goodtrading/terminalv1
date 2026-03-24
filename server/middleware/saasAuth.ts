import type { Request, Response, NextFunction } from "express";
import { describeJwtSecretSource } from "../config/authConfig";
import { AUTH_COOKIE_NAME } from "../lib/authCookie";
import { verifyUserToken, verifyUserTokenDebug } from "../lib/jwt";
import { dbRoleToApiRole, isAdminRole } from "../lib/userRoles";
import { findUserById, userMayAuthenticate } from "../services/userService";

declare global {
  namespace Express {
    interface Request {
      saasUser?: { id: number; email: string; role: string };
    }
  }
}

/** @param label — optional middleware name for log prefix (e.g. optionalSaasAuth). */
function extractToken(req: Request, label?: string): string | null {
  const logP = `[saasAuth/extractToken${label ? `/${label}` : ""}]`;
  console.log(logP, "AUTH_COOKIE_NAME:", AUTH_COOKIE_NAME);
  console.log(logP, "REQ COOKIES:", req.cookies);

  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  const cookieOk = typeof cookieToken === "string" && cookieToken.trim().length > 0;
  console.log(
    logP,
    "COOKIE TOKEN FOUND:",
    cookieOk,
    cookieOk ? `(len=${cookieToken!.trim().length})` : "",
  );

  const auth = req.headers.authorization;
  const bearerPresent =
    typeof auth === "string" && auth.startsWith("Bearer ") && auth.slice("Bearer ".length).trim().length > 0;
  console.log(logP, "BEARER FOUND:", bearerPresent);

  if (cookieOk) {
    console.log(logP, "USING_TOKEN_SOURCE: cookie");
    return cookieToken!.trim();
  }

  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const bearerToken = auth.slice("Bearer ".length).trim();
    if (bearerToken.length > 0) {
      console.log(logP, "USING_TOKEN_SOURCE: bearer");
      return bearerToken;
    }
  }

  console.log(logP, "USING_TOKEN_SOURCE: none");
  return null;
}

export async function optionalSaasAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.saasUser = undefined;
  const token = extractToken(req, "optionalSaasAuth");
  if (!token) {
    console.log("[saasAuth/optionalSaasAuth] no token — skipping verify, req.saasUser unset");
    next();
    return;
  }
  console.log(
    "[saasAuth/optionalSaasAuth] token preview:",
    `${token.slice(0, 12)}…`,
    "len=",
    token.length,
    "| jwtSecretSource:",
    describeJwtSecretSource(),
  );

  try {
    const dbg = verifyUserTokenDebug(token);
    if (!dbg.payload) {
      console.error(
        "[saasAuth/optionalSaasAuth] JWT VERIFY FAILED:",
        dbg.error,
        "| jwtSecretSource:",
        describeJwtSecretSource(),
      );
      next();
      return;
    }
    console.log("[saasAuth/optionalSaasAuth] JWT PAYLOAD OK:", {
      sub: dbg.payload.sub,
      email: dbg.payload.email,
      role: dbg.payload.role,
      exp: dbg.payload.exp,
    });

    const user = await findUserById(dbg.payload.sub);
    if (!user) {
      console.error(
        "[saasAuth/optionalSaasAuth] USER ROW MISSING for sub:",
        dbg.payload.sub,
        "(JWT ok but findUserById returned nothing)",
      );
      next();
      return;
    }
    req.saasUser = { id: user.id, email: user.email, role: dbRoleToApiRole(user.role) };
    console.log("[saasAuth/optionalSaasAuth] req.saasUser SET:", req.saasUser);
  } catch (err) {
    console.error("[saasAuth/optionalSaasAuth] unexpected error:", err);
    next();
    return;
  }
  next();
}

export async function requireSaasAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  const payload = verifyUserToken(token);
  if (!payload) {
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }
  const user = await findUserById(payload.sub);
  if (!user || !userMayAuthenticate(user)) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  req.saasUser = { id: user.id, email: user.email, role: dbRoleToApiRole(user.role) };
  next();
}

export async function requireSaasAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  const payload = verifyUserToken(token);
  if (!payload) {
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }
  const user = await findUserById(payload.sub);
  if (!user || !userMayAuthenticate(user)) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  if (!isAdminRole(user.role)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  req.saasUser = { id: user.id, email: user.email, role: dbRoleToApiRole(user.role) };
  next();
}
