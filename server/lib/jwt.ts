import { createHmac, timingSafeEqual } from "crypto";
import { getJwtSecret } from "../config/authConfig";

function b64url(data: string | Buffer): string {
  return Buffer.from(typeof data === "string" ? data : data)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export function signUserToken(
  user: { id: number; email: string; role: string },
  ttlSeconds = 60 * 60 * 24 * 7,
): string {
  const secret = getJwtSecret();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  const sigB64 = b64url(sig);
  return `${header}.${body}.${sigB64}`;
}

export function verifyUserToken(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const secret = getJwtSecret();
    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const got = b64urlDecode(sig);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return null;
    }
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as JwtPayload;
    if (typeof payload.sub !== "number" || !payload.email) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
