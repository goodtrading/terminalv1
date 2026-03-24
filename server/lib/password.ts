import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import bcrypt from "bcrypt";

const SCRYPT_KEYLEN = 64;
const BCRYPT_ROUNDS = 10;

function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Synchronous scrypt hash for legacy-only paths if needed */
export function hashPasswordScryptLegacy(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    if (isBcryptHash(stored)) {
      return bcrypt.compareSync(plain, stored);
    }
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
