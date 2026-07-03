/**
 * B1.2 — persisted ownership (temp storage, fake credentials, no BingX HTTP).
 */
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  __setBingxStorageFileForTests,
  deleteConnectionForUser,
  getConnectionForUser,
  listConnectionsForUser,
  saveConnectionForUser,
} from "./bingxCredentialStore";
import { resolveConnectionCapability } from "./bingxConnectionCapability";
import { getBingXReadOnlySnapshot } from "./bingxReadOnlyService";

const USER_A = 9001;
const USER_B = 9002;
const TEST_ENC_KEY = "b1-test-encryption-key-32chars!!";

let tempFile = "";

beforeEach(() => {
  tempFile = path.join(os.tmpdir(), `bingx-ownership-${Date.now()}.json`);
  fs.writeFileSync(tempFile, JSON.stringify({ connections: [] }), "utf8");
  __setBingxStorageFileForTests(tempFile);
  process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY = TEST_ENC_KEY;
});

afterEach(() => {
  __setBingxStorageFileForTests(null);
  if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  delete process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY;
});

function fakeCapability() {
  return resolveConnectionCapability({
    tradePermission: "denied",
    withdrawPermission: "not_detected",
  });
}

test("user A owns connection; user B cannot access snapshot metadata", async () => {
  const saved = saveConnectionForUser({
    userId: USER_A,
    credentials: { apiKey: "fake-read-key-a", apiSecret: "fake-read-secret-a" },
    label: "Test Read-Only",
    status: "connected",
    lastHealth: "healthy",
    capability: fakeCapability(),
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;

  const connId = saved.connection.id;
  const maskedId = `${connId.slice(0, 6)}…${connId.slice(-4)}`;

  const listA = listConnectionsForUser(USER_A);
  assert.equal(listA.length, 1);
  assert.equal(listA[0]!.id, connId);

  const listB = listConnectionsForUser(USER_B);
  assert.equal(listB.length, 0);

  assert.equal(getConnectionForUser(connId, USER_B), null);

  const snapB = await getBingXReadOnlySnapshot(connId, USER_B);
  assert.ok(snapB.error);
  assert.equal(snapB.error?.code, "BINGX_CONNECTION_NOT_FOUND");
  assert.ok(!snapB.account?.equityUsdt);
  assert.equal(snapB.positions.length, 0);

  const removed = deleteConnectionForUser(connId, USER_B);
  assert.equal(removed, false);
  assert.equal(getConnectionForUser(connId, USER_A)?.id, connId);

  // redacted evidence shape only
  assert.ok(maskedId.includes("…"));
});
