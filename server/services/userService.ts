import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "@shared/schema";
import { getUsersDbRoleAdmin, getUsersDbRoleUser } from "../config/usersDbRoles";
import { hashPassword } from "../lib/password";
import { apiRoleToDbRole, isAdminRole } from "../lib/userRoles";

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

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.SAAS_ADMIN_EMAIL;
  const password = process.env.SAAS_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await findUserByEmail(email);
  if (existing) {
    if (isAdminRole(existing.role) && existing.status !== "active") {
      await db!
        .update(users)
        .set({ status: "active" })
        .where(eq(users.id, existing.id));
    }
    return;
  }
  await createUser(email, password, "admin");
  console.log("[SaaS] Bootstrap admin user created:", email.toLowerCase().trim());
}
