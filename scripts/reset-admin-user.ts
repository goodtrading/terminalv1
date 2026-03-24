import { eq } from "drizzle-orm";
import { getUsersDbRoleAdmin } from "../server/config/usersDbRoles";
import { resolveUserFullName } from "../server/services/userService";
import { db, pool } from "../server/db";
import { users } from "../shared/schema";
import { hashPassword } from "../server/lib/password";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function requireArg(flag: string): string {
  const value = parseArg(flag)?.trim();
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return value;
}

async function main() {
  if (!db) {
    throw new Error("DATABASE_UNAVAILABLE: DATABASE_URL is not configured.");
  }

  const email = requireArg("--email").toLowerCase();
  const password = requireArg("--password");
  const fullName = requireArg("--full-name");

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const existingUser = existing[0];

  if (existingUser) {
    const updated = await db
      .update(users)
      .set({
        passwordHash,
        role: "admin",
        status: "active",
        fullName: fullName || existingUser.fullName,
      })
      .where(eq(users.id, existingUser.id))
      .returning();

    console.log(`[admin-reset] Updated existing admin user: ${updated[0]?.email}`);
  } else {
    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName: fullNameResolved,
        role: roleDb,
        status: "active",
      })
      .returning();

    console.log(`[admin-reset] Created new admin user: ${inserted[0]?.email}`);
  }

  console.log(`[admin-reset] full_name: ${fullName}`);
}

main()
  .catch((err) => {
    console.error("[admin-reset] Failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end();
  });
