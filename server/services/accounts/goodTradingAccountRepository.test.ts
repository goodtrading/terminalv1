import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../../db";
import {
  ensureGoodTradingAccountSchema,
  ensureGoodTradingAccountForUser,
  getGoodTradingAccountByAccountUid,
  getGoodTradingAccountByUserId,
  type GoodTradingAccountRecord,
} from "./goodTradingAccountRepository";

const describePostgres = pool ? describe : describe.skip;

async function createTestUser(): Promise<number> {
  const result = await pool!.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`n83d0a-v2-${randomUUID()}@example.test`, "n83d0a-v2-test-hash", "N8.3D0A-V2 test user"],
  );
  return Number(result.rows[0].id);
}

async function cleanupOwnRecords(userIds: number[]): Promise<void> {
  if (!pool || userIds.length === 0) return;
  await pool.query("DELETE FROM goodtrading_accounts WHERE user_id = ANY($1::int[])", [userIds]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [userIds]);
}

async function countAccountsForUsers(userIds: number[]): Promise<number> {
  const result = await pool!.query(
    "SELECT count(*)::int AS count FROM goodtrading_accounts WHERE user_id = ANY($1::int[])",
    [userIds],
  );
  return result.rows[0].count;
}

describePostgres("GoodTrading account durable identity", () => {
  it("creates one account per user and keeps ensure idempotent", async () => {
    await ensureGoodTradingAccountSchema();
    const userId = await createTestUser();
    try {
      const created = await ensureGoodTradingAccountForUser(userId);
      assert.match(created.accountUid, /^GT-[0-9a-f-]{36}$/);
      assert.equal(created.userId, userId);

      const again = await ensureGoodTradingAccountForUser(userId);
      assert.deepEqual(again, created);
      assert.equal(await countAccountsForUsers([userId]), 1);
    } finally {
      await cleanupOwnRecords([userId]);
    }
  });

  it("proves persisted GT-UUID readback from Postgres by user and UID", async () => {
    const userId = await createTestUser();
    try {
      const created = await ensureGoodTradingAccountForUser(userId);
      const raw = await pool!.query(
        `SELECT id, account_uid, user_id, created_at
           FROM goodtrading_accounts
          WHERE user_id = $1`,
        [userId],
      );
      assert.equal(raw.rowCount, 1);
      assert.equal(raw.rows[0].account_uid, created.accountUid);
      assert.equal(raw.rows[0].user_id, userId);
      assert.match(raw.rows[0].account_uid, /^GT-[0-9a-f-]{36}$/);

      const byUser = await getGoodTradingAccountByUserId(userId);
      const byUid = await getGoodTradingAccountByAccountUid(created.accountUid);
      assert.deepEqual(byUser, created);
      assert.deepEqual(byUid, created);
    } finally {
      await cleanupOwnRecords([userId]);
    }
  });

  it("isolates two users to two distinct stable accounts", async () => {
    const userIds = [await createTestUser(), await createTestUser()];
    try {
      const [first, second] = await Promise.all(userIds.map(ensureGoodTradingAccountForUser));
      assert.notEqual(first.accountUid, second.accountUid);
      assert.equal(first.userId, userIds[0]);
      assert.equal(second.userId, userIds[1]);
      assert.equal((await getGoodTradingAccountByUserId(userIds[0]))?.accountUid, first.accountUid);
      assert.equal((await getGoodTradingAccountByUserId(userIds[1]))?.accountUid, second.accountUid);
      assert.equal(await countAccountsForUsers(userIds), 2);
    } finally {
      await cleanupOwnRecords(userIds);
    }
  });

  it("remains one-account-only under concurrent provisioning", async () => {
    const userId = await createTestUser();
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => ensureGoodTradingAccountForUser(userId)),
      );
      assert.equal(new Set(results.map((record) => record.accountUid)).size, 1);
      assert.equal(new Set(results.map((record) => record.id)).size, 1);
      assert.equal(await countAccountsForUsers([userId]), 1);
    } finally {
      await cleanupOwnRecords([userId]);
    }
  });

  it("enforces user_id and account_uid uniqueness in Postgres", async () => {
    const userIds = [await createTestUser(), await createTestUser()];
    try {
      const first = await ensureGoodTradingAccountForUser(userIds[0]);
      await assert.rejects(
        () => pool!.query(
          "INSERT INTO goodtrading_accounts (account_uid, user_id) VALUES ($1, $2)",
          [`GT-${randomUUID()}`, userIds[0]],
        ),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );
      await assert.rejects(
        () => pool!.query(
          "INSERT INTO goodtrading_accounts (account_uid, user_id) VALUES ($1, $2)",
          [first.accountUid, userIds[1]],
        ),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );
    } finally {
      await cleanupOwnRecords(userIds);
    }
  });

  it("enforces the user FK and prevents orphan deletion", async () => {
    const userId = await createTestUser();
    try {
      await assert.rejects(
        () => pool!.query(
          "INSERT INTO goodtrading_accounts (account_uid, user_id) VALUES ($1, $2)",
          [`GT-${randomUUID()}`, 2147483647],
        ),
        (error: unknown) => (error as { code?: string }).code === "23503",
      );
      await ensureGoodTradingAccountForUser(userId);
      await assert.rejects(
        () => pool!.query("DELETE FROM users WHERE id = $1", [userId]),
        (error: unknown) => (error as { code?: string }).code === "23503",
      );
    } finally {
      await cleanupOwnRecords([userId]);
    }
  });

  it("does not create an account when getByUserId is called", async () => {
    const userId = await createTestUser();
    try {
      assert.equal(await getGoodTradingAccountByUserId(userId), null);
      assert.equal(await countAccountsForUsers([userId]), 0);
    } finally {
      await cleanupOwnRecords([userId]);
    }
  });

  it("rejects nonexistent users before provisioning", async () => {
    const missingUserId = 2147483647;
    await assert.rejects(
      () => ensureGoodTradingAccountForUser(missingUserId),
      /USER_NOT_FOUND_IN_USERS_TABLE/,
    );
    assert.equal(await countAccountsForUsers([missingUserId]), 0);
  });
});

function assertRecordShape(record: GoodTradingAccountRecord): void {
  assert.equal(typeof record.id, "number");
  assert.equal(typeof record.userId, "number");
  assert.equal(typeof record.accountUid, "string");
  assert.ok(record.createdAt instanceof Date);
}

void assertRecordShape;
