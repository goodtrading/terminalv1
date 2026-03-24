import type { Request, Response, NextFunction } from "express";
import { AUTH_COOKIE_NAME } from "../lib/authCookie";
import { verifyUserToken } from "../lib/jwt";
import { findUserById, userMayAuthenticate } from "../services/userService";

declare global {
  namespace Express {
    interface Request {
      saasUser?: { id: number; email: string; role: string };
    }
  }
}

function extractToken(req: Request): string | null {
  console.log("TOKEN FROM COOKIE:", req.cookies);

  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const bearerToken = auth.slice("Bearer ".length).trim();
    if (bearerToken.length > 0) return bearerToken;
  }

  return null;
}

export async function optionalSaasAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.saasUser = undefined;
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }
  const payload = verifyUserToken(token);
  if (!payload) {
    next();
    return;
  }
  const user = await findUserById(payload.sub);
  if (!user) {
    next();
    return;
  }
  req.saasUser = { id: user.id, email: user.email, role: user.role };
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
  req.saasUser = { id: user.id, email: user.email, role: user.role };
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
  if (user.role !== "admin") {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  req.saasUser = { id: user.id, email: user.email, role: user.role };
  next();
}
