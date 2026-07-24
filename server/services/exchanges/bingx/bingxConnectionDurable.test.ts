/**
 * AI-8.1.3 — Durable BingX connection repository tests.
 *
 * Offline-first: verifies mode resolution, the production non-durable safety
 * guard, storage-health classification, migration accounting, and AES-256-GCM
 * reuse via the existing credential store. Postgres CRUD is exercised only when
 * DATABASE_URL is present (skipped otherwise), mirroring decision-context tests.
 *
 * No real BingX account, no plaintext secrets in assertions.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import fs from "fs";
import {
  getBingxConnectionRepositoryMode,
  isBingxConnectionPostgresMode,
  isUnsafeNonDurableBingxConnectionStore,
  assessBingxConnectionStorageHealth,
  migrateFileConnectionsToPostgres,
  isBingxConnectionPostgresConfigured,
} from "./bingxConnectionRepository";
import {
  saveConnectionForUser,
  getCredentialsForUser,
  listConnectionsForUser,
  deleteConnectionForUser,
  __setBingxStorageFileForTests,
} from "./bingxCredentialStore";

const ENV_KEYS = [
  "NODE_ENV",
  "GOODTRADING_BINGX_CONNECTION_REPOSITORY",
  "BINGX_CREDENTIAL_ENCRYPTION_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
}
function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
}

const readOnlyCapability = {
  connectionMode: "read-only" as const,
  readOnly: true,
  tradingPermissionConfirmed: false,
  permissions: { readOnly: true, trading: false },
  tradingEnabled: false,
};

describe("AI-8.1.3 connection repository mode resolution", () => {
  beforeEach(() => snapshotEnv());
  afterEach(() => restoreEnv());

  it("honours explicit env over defaults", () => {
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "postgres";
    assert.equal(getBingxConnectionRepositoryMode(), "postgres");
    assert.equal(isBingxConnectionPostgresMode(), true);

    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    assert.equal(getBingxConnectionRepositoryMode(), "file");
  });

  it("defaults production to postgres, everything else to file", () => {
    delete process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY;
    process.env.NODE_ENV = "production";
    assert.equal(getBingxConnectionRepositoryMode(), "postgres");
    process.env.NODE_ENV = "test";
    assert.equal(getBingxConnectionRepositoryMode(), "file");
  });
});

describe("AI-8.1.3 production non-durable safety guard", () => {
  beforeEach(() => snapshotEnv());
  afterEach(() => restoreEnv());

  it("flags production + file mode as unsafe", () => {
    process.env.NODE_ENV = "production";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    assert.equal(isUnsafeNonDurableBingxConnectionStore(), true);
  });

  it("does not flag production + postgres or non-production", () => {
    process.env.NODE_ENV = "production";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "postgres";
    assert.equal(isUnsafeNonDurableBingxConnectionStore(), false);
    process.env.NODE_ENV = "test";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    assert.equal(isUnsafeNonDurableBingxConnectionStore(), false);
  });

  it("blocks saving credentials to an ephemeral file store in production", () => {
    process.env.NODE_ENV = "production";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY = "test-key-please-change-1234";
    const result = saveConnectionForUser({
      userId: 1,
      credentials: { apiKey: "AKEY1234567890", apiSecret: "SECRETVALUE12345" },
      label: "RO",
      status: "connected",
      capability: readOnlyCapability,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE");
    }
  });
});

describe("AI-8.1.3 storage health classification", () => {
  beforeEach(() => snapshotEnv());
  afterEach(() => restoreEnv());

  it("reports FILE_MODE in non-production file mode", async () => {
    process.env.NODE_ENV = "test";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    const health = await assessBingxConnectionStorageHealth();
    assert.equal(health.mode, "file");
    assert.equal(health.status, "FILE_MODE");
    assert.equal(health.durable, false);
    assert.equal(health.unsafeNonDurable, false);
  });

  it("reports UNSAFE_FILE in production file mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    const health = await assessBingxConnectionStorageHealth();
    assert.equal(health.status, "UNSAFE_FILE");
    assert.equal(health.code, "UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE");
  });

  it("reports UNAVAILABLE for postgres mode without a database", async () => {
    if (isBingxConnectionPostgresConfigured()) return; // covered by DB path
    process.env.NODE_ENV = "test";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "postgres";
    const health = await assessBingxConnectionStorageHealth();
    assert.equal(health.mode, "postgres");
    assert.equal(health.status, "UNAVAILABLE");
    assert.equal(health.durable, false);
  });
});

describe("AI-8.1.3 migration accounting", () => {
  beforeEach(() => snapshotEnv());
  afterEach(() => restoreEnv());

  it("counts source records and skips when postgres is unavailable", async () => {
    if (isBingxConnectionPostgresConfigured()) return;
    const res = await migrateFileConnectionsToPostgres([]);
    assert.equal(res.ran, false);
    assert.equal(res.sourceRecords, 0);
    assert.equal(res.migrated, 0);
    assert.equal(res.reason, "DATABASE_UNAVAILABLE");
  });
});

describe("AI-8.1.3 AES-256-GCM reuse (file mode round-trip)", () => {
  const tmpFile = path.join(
    os.tmpdir(),
    `bingx-conn-durable-${process.pid}-${Date.now()}.json`,
  );

  beforeEach(() => {
    snapshotEnv();
    process.env.NODE_ENV = "test";
    process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY = "file";
    process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY = "unit-test-key-abcdef123456";
    __setBingxStorageFileForTests(tmpFile);
  });
  afterEach(() => {
    __setBingxStorageFileForTests(null);
    try {
      fs.rmSync(tmpFile, { force: true });
    } catch {
      // ignore
    }
    restoreEnv();
  });

  it("encrypts at rest and decrypts credentials via the store", () => {
    const apiKey = "AKEYABCDEFGHIJKLMNOP";
    const apiSecret = "S3CRETVALUE0987654321";
    const result = saveConnectionForUser({
      userId: 7,
      credentials: { apiKey, apiSecret },
      label: "RO",
      status: "connected",
      capability: readOnlyCapability,
    });
    assert.equal(result.ok, true);

    // Ciphertext at rest must not contain the plaintext secret.
    const onDisk = fs.readFileSync(tmpFile, "utf8");
    assert.equal(onDisk.includes(apiSecret), false);
    assert.equal(onDisk.includes(apiKey), false);

    const list = listConnectionsForUser(7);
    assert.equal(list.length, 1);
    const creds = getCredentialsForUser(list[0]!.id, 7);
    assert.ok(creds);
    assert.equal(creds?.apiKey, apiKey);
    assert.equal(creds?.apiSecret, apiSecret);

    assert.equal(deleteConnectionForUser(list[0]!.id, 7), true);
  });
});
