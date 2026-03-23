import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, "hex");
    const got = scryptSync(plain, salt, SCRYPT_KEYLEN);
    if (expected.length !== got.length) return false;
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}
