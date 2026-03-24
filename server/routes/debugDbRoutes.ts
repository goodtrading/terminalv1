import type { Express, Request, Response } from "express";
import { pool } from "../db";

/**
 * Temporary diagnostics: inspect real Postgres constraint + columns for `users`.
 * Remove after fixing `users_role_check` / role inserts.
 */
export function registerDebugDbRoutes(app: Express): void {
  app.get("/api/debug/users-role-check", async (_req: Request, res: Response) => {
    if (!pool) {
      res.status(503).json({ error: "NO_DATABASE_URL", rows: [] });
      return;
    }
    try {
      const r = await pool.query(`
        SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND conname = 'users_role_check';
      `);
      res.json({ rows: r.rows });
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error("[debug/users-role-check]", e);
      res.status(500).json({ error: err?.message ?? String(e), rows: [] });
    }
  });

  app.get("/api/debug/users-columns", async (_req: Request, res: Response) => {
    if (!pool) {
      res.status(503).json({ error: "NO_DATABASE_URL", rows: [] });
      return;
    }
    try {
      const r = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `);
      res.json({ rows: r.rows });
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error("[debug/users-columns]", e);
      res.status(500).json({ error: err?.message ?? String(e), rows: [] });
    }
  });
}
