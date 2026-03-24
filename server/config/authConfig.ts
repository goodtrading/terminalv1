/** Re-export — sign/verify use the same getJwtSecret from ../lib/jwt. */
export { getJwtSecret } from "../lib/jwt";

/** For diagnostics only: resolution order matches getJwtSecret (SAAS → JWT → dev). */
export function describeJwtSecretSource(): string {
  const saas = process.env.SAAS_JWT_SECRET?.trim();
  const jwt = process.env.JWT_SECRET?.trim();
  if (saas && saas.length > 0) {
    return jwt && jwt.length > 0
      ? "SAAS_JWT_SECRET (preferred; JWT_SECRET also set)"
      : "SAAS_JWT_SECRET";
  }
  if (jwt && jwt.length > 0) return "JWT_SECRET";
  return "dev-secret (getJwtSecret fallback)";
}
