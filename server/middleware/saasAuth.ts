import type { Request, Response, NextFunction } from "express";
import { verifyUserToken } from "../lib/jwt";
import { findUserById } from "../services/userService";

declare global {
  namespace Express {
    interface Request {
      saasUser?: { id: number; email: string; role: string };
    }
  }
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

export async function optionalSaasAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.saasUser = undefined;
  const token = extractBearer(req);
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
  const token = extractBearer(req);
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
  if (!user || !user.isActive) {
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
  const token = extractBearer(req);
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
  if (!user || !user.isActive) {
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
