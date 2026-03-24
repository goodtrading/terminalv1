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

export interface VerifyUserTokenDebugResult {
  payload: JwtPayload | null;
  /** Set when payload is null — diagnostic only, do not expose to clients. */
  error?: string;
}

/** Same rules as verifyUserToken but returns a failure reason for server logs. */
export function verifyUserTokenDebug(token: string): VerifyUserTokenDebugResult {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { payload: null, error: "bad_segment_count" };
    const [header, body, sig] = parts;
    const secret = getJwtSecret();
    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const got = b64urlDecode(sig);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return { payload: null, error: "bad_signature_or_wrong_secret" };
    }
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as JwtPayload;
    if (typeof payload.sub !== "number") return { payload: null, error: "bad_payload_sub" };
    if (!payload.email) return { payload: null, error: "bad_payload_email" };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return { payload: null, error: "expired" };
    return { payload };
  } catch (e) {
    return {
      payload: null,
      error: e instanceof Error ? `exception:${e.message}` : "exception",
    };
  }
}

export function verifyUserToken(token: string): JwtPayload | null {
  return verifyUserTokenDebug(token).payload;
}
