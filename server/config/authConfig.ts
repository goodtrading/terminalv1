/**
 * Single secret for sign + verify. Prefer JWT_SECRET in env; SAAS_JWT_SECRET is a legacy alias only.
 * If both are set, JWT_SECRET wins — keep them identical in Railway to avoid rotation bugs.
 */
export function getJwtSecret(): string {
  const explicitJwt = process.env.JWT_SECRET?.trim();
  const legacySaas = process.env.SAAS_JWT_SECRET?.trim();
  const s = explicitJwt || legacySaas;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[SaaS] JWT_SECRET not set; using insecure development fallback — set JWT_SECRET for production",
    );
    return "dev-insecure-jwt-secret-min-16chars";
  }
  throw new Error(
    "JWT_SECRET (or SAAS_JWT_SECRET) must be set to a string of at least 16 characters",
  );
}

/** For diagnostics only: which env key supplies the secret (sign + verify use the same). */
export function describeJwtSecretSource(): string {
  const explicitJwt = process.env.JWT_SECRET?.trim();
  const legacySaas = process.env.SAAS_JWT_SECRET?.trim();
  if (explicitJwt && explicitJwt.length >= 16) {
    return legacySaas && legacySaas.length >= 16
      ? "JWT_SECRET (SAAS_JWT_SECRET also set but ignored for signing/verify)"
      : "JWT_SECRET";
  }
  if (legacySaas && legacySaas.length >= 16) return "SAAS_JWT_SECRET";
  if (process.env.NODE_ENV === "development") return "dev-fallback (JWT_SECRET unset)";
  return "none (would throw on getJwtSecret)";
}
