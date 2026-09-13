import type { CorsOptions } from "cors";
import type { RequestHandler } from "express";
import { getAllowedCorsOrigins } from "./runtimeEnv";

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  return origin !== "null" && origin !== "*" && allowedOrigins.includes(origin);
}

/** CORS alone cannot stop credentialed simple-form writes with SameSite=None. */
export function createBrowserWriteOriginGuard(): RequestHandler {
  const allowedOrigins = getAllowedCorsOrigins();
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("Origin");
    if ((origin && !isAllowedOrigin(origin, allowedOrigins)) ||
        (!origin && req.get("Sec-Fetch-Site") === "cross-site")) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }
    // Native clients/webhooks without browser Origin metadata remain supported.
    next();
  };
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedCorsOrigins();
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }
      console.warn("[cors] blocked origin:", origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    optionsSuccessStatus: 204,
    maxAge: 86_400,
  };
}
