import { readFileSync } from "fs";
import path from "path";
import { pool } from "../db";

let migrationPromise: Promise<void> | null = null;

/** Applies non-destructive auth column migration once per process. */
export function ensureAuthSchemaMigration(): Promise<void> {
  if (!pool) return Promise.resolve();
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const sqlPath = path.resolve(process.cwd(), "migrations/0002_auth_email_verification.sql");
    const sql = readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.info("[auth-migration] auth columns ensured (0002_auth_email_verification)");
  })().catch((err) => {
    migrationPromise = null;
    console.error("[auth-migration] failed:", err);
    throw err;
  });

  return migrationPromise;
}
