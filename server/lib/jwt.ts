import { createHmac, timingSafeEqual } from "crypto";

/** Single source for sign + verify. SAAS_JWT_SECRET first so login and /me always match. */
export function getJwtSecret(): string {
  return (
    process.env.SAAS_JWT_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "dev-secret"
  );
}

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

function normalizeSub(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
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
    const parsed = JSON.parse(b64urlDecode(body).toString("utf8")) as Record<string, unknown>;
    const sub = normalizeSub(parsed.sub);
    if (sub === null) return { payload: null, error: "bad_payload_sub" };
    const email = parsed.email;
    if (typeof email !== "string" || !email) return { payload: null, error: "bad_payload_email" };
    const role = parsed.role;
    if (typeof role !== "string" || !role) return { payload: null, error: "bad_payload_role" };
    const iat = typeof parsed.iat === "number" ? parsed.iat : Number(parsed.iat);
    const exp = typeof parsed.exp === "number" ? parsed.exp : Number(parsed.exp);
    if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
      return { payload: null, error: "bad_payload_iat_exp" };
    }
    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) return { payload: null, error: "expired" };
    const payload: JwtPayload = { sub, email, role, iat, exp };
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
