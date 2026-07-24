import crypto from "crypto";

/** Pseudonymize exchange IDs for client / AI-safe surfaces. Never reversible without salt. */
export function pseudonymizeId(
  kind: "account" | "order" | "fill" | "position" | "connection",
  raw: string,
  userSalt: string,
): string {
  const h = crypto
    .createHmac("sha256", `gt-bingx-${kind}:${userSalt}`)
    .update(String(raw))
    .digest("hex")
    .slice(0, 24);
  return `${kind}_${h}`;
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 6)}****${trimmed.slice(-4)}`;
}

const SECRET_KEYS = [
  "apiSecret",
  "apiKey",
  "secret",
  "signature",
  "encryptedApiKey",
  "encryptedApiSecret",
  "authorization",
  "password",
];

export function redactValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase();
  if (SECRET_KEYS.some((s) => k.includes(s.toLowerCase()))) {
    return "[REDACTED]";
  }
  if (typeof value === "string" && value.length > 8 && /secret|sign/i.test(k)) {
    return "[REDACTED]";
  }
  return value;
}

export function redactForLog(input: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (input == null) return input;
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((v) => redactForLog(v, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactValue(k, typeof v === "object" ? redactForLog(v, depth + 1) : v);
    }
    return out;
  }
  return input;
}
