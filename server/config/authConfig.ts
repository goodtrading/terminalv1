export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET || process.env.SAAS_JWT_SECRET;
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
