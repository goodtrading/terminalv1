import { eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "@shared/schema";
import { getUsersDbRoleAdmin, getUsersDbRoleUser } from "../config/usersDbRoles";
import { hashPassword } from "../lib/password";
import { apiRoleToDbRole, isAdminRole } from "../lib/userRoles";
import {
  generateVerificationCode,
  hashAuthSecret,
  passwordResetExpiryMs,
  verificationExpiryMs,
  verifyAuthSecret,
} from "../lib/authTokens";

export type OnboardingStatus =
  | "pending_approval"
  | "approved_to_pay"
  | "pending_payment_review"
  | "active"
  | "inactive"
  | "rejected";

/** Values allowed by typical `users` status CHECK in production (active | pending | inactive). */
export type DbUserStatus = "active" | "pending" | "inactive";

/** Map admin/API onboarding labels to DB `users.status` literals. */
export function onboardingStatusToDbStatus(onboarding: OnboardingStatus): DbUserStatus {
  switch (onboarding) {
    case "pending_approval":
      return "pending";
    case "approved_to_pay":
    case "pending_payment_review":
    case "active":
      return "active";
    case "inactive":
    case "rejected":
      return "inactive";
    default:
      return "pending";
  }
}

function requireDb() {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
}

/** DB requires non-null full_name; name stays optional in API — fallback to email local part. */
export function resolveUserFullName(email: string, optionalName?: string | null): string {
  const n = typeof optionalName === "string" ? optionalName.trim() : "";
  if (n.length > 0) return n;
  const local = email.split("@")[0]?.trim();
  if (local && local.length > 0) return local;
  return "user";
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  requireDb();
  const rows = await db!.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  return rows[0];
}

export async function findUserById(id: number): Promise<User | undefined> {
  requireDb();
  const rows = await db!.select().from(users).where(eq(users.id, id));
  return rows[0];
}

/** Subscriptions reference `users.id` only — call before inserting into `saas_subscriptions`. */
export async function requireUserIdInUsersTable(userId: number): Promise<void> {
  const u = await findUserById(userId);
  if (!u) throw new Error("USER_NOT_FOUND_IN_USERS_TABLE");
}

export async function createUser(
  email: string,
  password: string,
  role: "user" | "admin" = "user",
  opts?: { fullName?: string | null },
): Promise<User> {
  requireDb();
  const passwordHash = await hashPassword(password);
  const normalizedEmail = email.toLowerCase().trim();
  const fullName = resolveUserFullName(normalizedEmail, opts?.fullName ?? null);
  const status = role === "admin" ? "active" : "pending";
  const roleDb = role === "admin" ? getUsersDbRoleAdmin() : getUsersDbRoleUser();
  const inserted = await db!
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash,
      fullName,
      role: roleDb,
      status,
      emailVerified: role === "admin",
    })
    .returning();
  return inserted[0]!;
}

export async function listUsersForAdmin(): Promise<User[]> {
  requireDb();
  return db!.select().from(users);
}

export async function updateUserRole(
  userId: number,
  role: "user" | "admin",
): Promise<User | undefined> {
  requireDb();
  const roleDb = apiRoleToDbRole(role);
  const rows = await db!.update(users).set({ role: roleDb }).where(eq(users.id, userId)).returning();
  return rows[0];
}

/** Single row update for admin PATCH (status + role in one statement when both provided). */
export async function updateUserAdminPatch(
  userId: number,
  patch: { status?: DbUserStatus; role?: string },
): Promise<User | undefined> {
  requireDb();
  const set: { status?: string; role?: string } = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.role !== undefined) set.role = patch.role;
  if (Object.keys(set).length === 0) {
    return findUserById(userId);
  }
  const rows = await db!.update(users).set(set).where(eq(users.id, userId)).returning();
  return rows[0];
}

export async function setUserActive(userId: number, isActive: boolean): Promise<User | undefined> {
  requireDb();
  const status = isActive ? "active" : "inactive";
  const rows = await db!
    .update(users)
    .set({ status })
    .where(eq(users.id, userId))
    .returning();
  return rows[0];
}

export async function setUserOnboardingStatus(
  userId: number,
  onboardingStatus: OnboardingStatus,
): Promise<User | undefined> {
  requireDb();
  const status = onboardingStatusToDbStatus(onboardingStatus);
  const rows = await db!
    .update(users)
    .set({ status })
    .where(eq(users.id, userId))
    .returning();
  return rows[0];
}

export function userMayAuthenticate(user: User): boolean {
  return user.status !== "inactive" && user.status !== "rejected";
}

/** Existing accounts without explicit flag, or backfilled true, may access terminal flows. */
export function isEmailVerified(user: User): boolean {
  return user.emailVerified === true;
}

export async function setVerificationCode(userId: number, code: string): Promise<void> {
  requireDb();
  const expiresAt = new Date(Date.now() + verificationExpiryMs());
  await db!
    .update(users)
    .set({
      verificationCodeHash: hashAuthSecret(code),
      verificationCodeExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function clearVerificationCode(userId: number): Promise<void> {
  requireDb();
  await db!
    .update(users)
    .set({
      verificationCodeHash: null,
      verificationCodeExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function markEmailVerified(userId: number): Promise<User | undefined> {
  requireDb();
  const rows = await db!
    .update(users)
    .set({
      emailVerified: true,
      verificationCodeHash: null,
      verificationCodeExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return rows[0];
}

export function verificationCodeValid(user: User, code: string): boolean {
  if (!user.verificationCodeHash || !user.verificationCodeExpiresAt) return false;
  if (user.verificationCodeExpiresAt <= new Date()) return false;
  return verifyAuthSecret(code.trim(), user.verificationCodeHash);
}

export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  requireDb();
  const passwordHash = await hashPassword(newPassword);
  await db!
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function setPasswordResetToken(userId: number, plainToken: string): Promise<void> {
  requireDb();
  const expiresAt = new Date(Date.now() + passwordResetExpiryMs());
  await db!
    .update(users)
    .set({
      passwordResetTokenHash: hashAuthSecret(plainToken),
      passwordResetExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function clearPasswordResetToken(userId: number): Promise<void> {
  requireDb();
  await db!
    .update(users)
    .set({
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export function passwordResetTokenValid(user: User, plainToken: string): boolean {
  if (!user.passwordResetTokenHash || !user.passwordResetExpiresAt) return false;
  if (user.passwordResetExpiresAt <= new Date()) return false;
  return verifyAuthSecret(plainToken.trim(), user.passwordResetTokenHash);
}

export async function findUserByValidResetToken(plainToken: string): Promise<User | undefined> {
  requireDb();
  const rows = await db!
    .select()
    .from(users)
    .where(isNotNull(users.passwordResetTokenHash));
  return rows.find((u) => passwordResetTokenValid(u, plainToken));
}

export async function issueVerificationCodeForUser(userId: number): Promise<string> {
  const code = generateVerificationCode();
  await setVerificationCode(userId, code);
  return code;
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.SAAS_ADMIN_EMAIL;
  const password = process.env.SAAS_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await findUserByEmail(email);
  if (existing) {
    if (isAdminRole(existing.role) && existing.status !== "active") {
      await db!
        .update(users)
        .set({ status: "active", emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
    }
    return;
  }
  const admin = await createUser(email, password, "admin");
  await markEmailVerified(admin.id);
  console.log("[SaaS] Bootstrap admin user created:", email.toLowerCase().trim());
}
