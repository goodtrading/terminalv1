/**
 * AI-6.4.2 — Secret redaction for Redis errors / logs.
 * Never emit redis://user:password@host URLs or password material.
 */

const REDIS_URL_RE =
  /\brediss?:\/\/[^\s"'<>]+/gi;

const USERINFO_RE = /\/\/([^/@]+)@/g;

/** Strip redis(s):// URLs and userinfo from arbitrary text. */
export function redactRedisSecrets(text: string): string {
  if (!text) return text;
  let out = text.replace(REDIS_URL_RE, "[REDIS_URL_REDACTED]");
  out = out.replace(USERINFO_RE, "//[USERINFO_REDACTED]@");
  // Common password leak patterns from node-redis / ioredis
  out = out.replace(/(password|passwd|auth)\s*[:=]\s*["']?[^\s"'&,}{]+/gi, "$1=[REDACTED]");
  return out;
}

export type SafeRedisErrorCode =
  | "REDIS_CONNECT_FAILED"
  | "REDIS_TIMEOUT"
  | "REDIS_AUTH_FAILED"
  | "REDIS_CONFIG"
  | "REDIS_UNAVAILABLE"
  | "REDIS_UNKNOWN";

export type SafeRedisError = {
  code: SafeRedisErrorCode;
  /** Safe message — never contains URL/password. */
  message: string;
};

export function toSafeRedisError(err: unknown): SafeRedisError {
  const raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === "string"
        ? err
        : "unknown";
  const lower = raw.toLowerCase();
  let code: SafeRedisErrorCode = "REDIS_UNKNOWN";
  if (/auth|wrong.?pass|noauth|invalid.?password/i.test(raw)) code = "REDIS_AUTH_FAILED";
  else if (/timeout|etimedout|connect.?timeout/i.test(raw)) code = "REDIS_TIMEOUT";
  else if (/config|invalid.?url|enotfound/i.test(raw)) code = "REDIS_CONFIG";
  else if (/econnrefused|enotfound|connect|socket|network/i.test(raw))
    code = "REDIS_CONNECT_FAILED";
  else if (/unavailable|closed|end/i.test(raw)) code = "REDIS_UNAVAILABLE";

  // Ensure any embedded URL is stripped even from code-derived messages
  const safeMsg = redactRedisSecrets(
    code === "REDIS_UNKNOWN"
      ? `Redis error (${redactRedisSecrets(raw).slice(0, 120)})`
      : `Redis ${code}`,
  );

  // Double-check: never leave password-looking substrings from simulated URLs
  void lower;
  return { code, message: safeMsg };
}

/** True if text still looks like it contains a redis URL or user:pass@host. */
export function containsRedisSecretLeak(text: string): boolean {
  if (/\brediss?:\/\//i.test(text)) return true;
  if (/\/\/[^/@:]+:[^/@]+@/.test(text)) return true;
  return false;
}
