import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "@shared/schema";
import { hashPassword } from "../lib/password";

export type OnboardingStatus =
  | "pending_approval"
  | "approved_to_pay"
  | "pending_payment_review"
  | "active"
  | "inactive"
  | "rejected";

const ONBOARDING_TO_STATUS: Record<OnboardingStatus, string> = {
  pending_approval: "pending",
  approved_to_pay: "approved_to_pay",
  pending_payment_review: "pending_payment_review",
  active: "active",
  inactive: "inactive",
  rejected: "rejected",
};

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
  const inserted = await db!
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash,
      fullName,
      role,
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
  const rows = await db!.update(users).set({ role }).where(eq(users.id, userId)).returning();
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
  const status = ONBOARDING_TO_STATUS[onboardingStatus];
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
    if (existing.role === "admin" && existing.status !== "active") {
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
