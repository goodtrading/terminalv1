/**
 * Ensures saas_subscriptions.user_id and saas_payments.user_id reference public.users(id),
 * not saas_users. Idempotent: skips if FK to users already exists.
 *
 * Usage: npx tsx scripts/repoint-saas-fks-to-users.ts
 *    or: npm run db:fix:saas-fk-users
 */
import "dotenv/config";
import pg from "pg";

function qIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function fkOnColumn(
  pool: pg.Pool,
  tableName: string,
  columnName: string,
): Promise<{ conname: string; refTable: string }[]> {
  const { rows } = await pool.query<{ conname: string; ref_table: string }>(
    `
    SELECT c.conname AS conname, ref.relname AS ref_table
    FROM pg_constraint c
    JOIN pg_class tbl ON tbl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE tbl.relname = $1
      AND ns.nspname = 'public'
      AND c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = c.conkey[1]
          AND a.attname = $2
      )
    `,
    [tableName, columnName],
  );
  return rows.map((r) => ({ conname: r.conname, refTable: r.ref_table }));
}

async function ensureUserIdFkToUsers(
  pool: pg.Pool,
  tableName: string,
  constraintName: string,
  columnName: string,
): Promise<void> {
  const fks = await fkOnColumn(pool, tableName, columnName);
  const pointsToUsers = fks.some((f) => f.refTable === "users");
  if (pointsToUsers) {
    console.log(`[db:fix:saas-fk-users] ${tableName}.${columnName} already references users — skip`);
    return;
  }

  for (const f of fks) {
    console.log(`[db:fix:saas-fk-users] DROP ${tableName} constraint ${f.conname} (was -> ${f.refTable})`);
    await pool.query(`ALTER TABLE ${qIdent(tableName)} DROP CONSTRAINT ${qIdent(f.conname)}`);
  }

  await pool.query(
    `ALTER TABLE ${qIdent(tableName)} DROP CONSTRAINT IF EXISTS ${qIdent(constraintName)}`,
  );

  console.log(`[db:fix:saas-fk-users] ADD ${constraintName} on ${tableName}(${columnName}) -> users(id)`);
  await pool.query(`
    ALTER TABLE ${qIdent(tableName)}
    ADD CONSTRAINT ${qIdent(constraintName)}
    FOREIGN KEY (${qIdent(columnName)})
    REFERENCES users (id)
    ON DELETE CASCADE
  `);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    await ensureUserIdFkToUsers(pool, "saas_subscriptions", "saas_subscriptions_user_id_fkey", "user_id");
    await ensureUserIdFkToUsers(pool, "saas_payments", "saas_payments_user_id_fkey", "user_id");
    console.log("[db:fix:saas-fk-users] OK");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("[db:fix:saas-fk-users] FAILED:", e);
  process.exit(1);
});
