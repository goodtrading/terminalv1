import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, type User } from "@shared/schema";
import { hashPassword } from "../lib/password";

function requireDb() {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
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
): Promise<User> {
  requireDb();
  const passwordHash = hashPassword(password);
  const inserted = await db!
    .insert(users)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      isActive: role === "admin",
      onboardingStatus: role === "admin" ? "active" : "pending_approval",
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
  const rows = await db!
    .update(users)
    .set({ isActive })
    .where(eq(users.id, userId))
    .returning();
  return rows[0];
}

export async function setUserOnboardingStatus(
  userId: number,
  onboardingStatus:
    | "pending_approval"
    | "approved_to_pay"
    | "pending_payment_review"
    | "active"
    | "inactive"
    | "rejected",
): Promise<User | undefined> {
  requireDb();
  const rows = await db!
    .update(users)
    .set({ onboardingStatus })
    .where(eq(users.id, userId))
    .returning();
  return rows[0];
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.SAAS_ADMIN_EMAIL;
  const password = process.env.SAAS_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.role === "admin" && existing.onboardingStatus !== "active") {
      await setUserOnboardingStatus(existing.id, "active");
    }
    return;
  }
  await createUser(email, password, "admin");
  console.log("[SaaS] Bootstrap admin user created:", email.toLowerCase().trim());
}
