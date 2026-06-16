import { createHash, randomBytes, randomInt } from "crypto";

function pepper(): string {
  return process.env.SAAS_JWT_SECRET ?? process.env.JWT_SECRET ?? "dev-secret";
}

export function hashAuthSecret(value: string): string {
  return createHash("sha256").update(`${pepper()}:${value}`).digest("hex");
}

export function verifyAuthSecret(value: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const got = hashAuthSecret(value);
  return got.length === storedHash.length && got === storedHash;
}

/** Six-digit numeric verification code. */
export function generateVerificationCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/** URL-safe reset token (plain text sent by email; only hash stored). */
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function verificationExpiryMs(): number {
  const minutes = Number(process.env.AUTH_VERIFICATION_TTL_MINUTES ?? 15);
  return minutes * 60 * 1000;
}

export function passwordResetExpiryMs(): number {
  const minutes = Number(process.env.AUTH_RESET_TTL_MINUTES ?? 30);
  return minutes * 60 * 1000;
}
