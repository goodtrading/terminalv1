import { randomUUID } from "node:crypto";
import { pool } from "../../db";

export type GoodTradingAccountRecord = Readonly<{
  id: number;
  accountUid: string;
  userId: number;
  createdAt: Date;
}>;

const DDL = `
CREATE TABLE IF NOT EXISTS goodtrading_accounts (
  id serial PRIMARY KEY,
  account_uid text NOT NULL UNIQUE,
  user_id integer NOT NULL UNIQUE REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
`;

let schemaReady: Promise<void> | null = null;

function requirePool() {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  return pool;
}

function mapRow(row: Record<string, unknown>): GoodTradingAccountRecord {
  if (
    typeof row.id !== "number" ||
    typeof row.account_uid !== "string" ||
    typeof row.user_id !== "number" ||
    !(row.created_at instanceof Date)
  ) {
    throw new Error("INVALID_GOODTRADING_ACCOUNT_ROW");
  }
  return {
    id: row.id,
    accountUid: row.account_uid,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

export async function ensureGoodTradingAccountSchema(): Promise<void> {
  const database = requirePool();
  if (!schemaReady) schemaReady = database.query(DDL).then(() => undefined);
  await schemaReady;
}

export async function getGoodTradingAccountByUserId(
  userId: number,
): Promise<GoodTradingAccountRecord | null> {
  const database = requirePool();
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("INVALID_USER_ID");
  await ensureGoodTradingAccountSchema();
  const result = await database.query(
    `SELECT id, account_uid, user_id, created_at
       FROM goodtrading_accounts
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function getGoodTradingAccountByAccountUid(
  accountUid: string,
): Promise<GoodTradingAccountRecord | null> {
  const database = requirePool();
  const normalized = accountUid.trim();
  if (!normalized) throw new Error("INVALID_ACCOUNT_UID");
  await ensureGoodTradingAccountSchema();
  const result = await database.query(
    `SELECT id, account_uid, user_id, created_at
       FROM goodtrading_accounts
      WHERE account_uid = $1
      LIMIT 1`,
    [normalized],
  );
  return result.rows[0] ? mapRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function ensureGoodTradingAccountForUser(
  userId: number,
): Promise<GoodTradingAccountRecord> {
  const database = requirePool();
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("INVALID_USER_ID");
  await ensureGoodTradingAccountSchema();

  const user = await database.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (!user.rows[0]) throw new Error("USER_NOT_FOUND_IN_USERS_TABLE");

  const accountUid = `GT-${randomUUID()}`;
  await database.query(
    `INSERT INTO goodtrading_accounts (account_uid, user_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [accountUid, userId],
  );

  const account = await getGoodTradingAccountByUserId(userId);
  if (!account) throw new Error("GOODTRADING_ACCOUNT_PROVISIONING_FAILED");
  return account;
}
