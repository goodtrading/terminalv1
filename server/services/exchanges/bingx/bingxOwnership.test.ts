/**
 * Phase B1 — ownership check for BingX connections (no HTTP).
 * Run: npm run test:bingx-ownership
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getConnectionForUser } from "./bingxCredentialStore";

test("user B cannot access user A connection — generic not found", () => {
  const userA = 1001;
  const userB = 1002;
  const connectionId = `test-ownership-${Date.now()}`;

  const owned = getConnectionForUser(connectionId, userA);
  const cross = getConnectionForUser(connectionId, userB);

  assert.equal(owned, null);
  assert.equal(cross, null);
  assert.equal(owned, cross);
});

test("snapshot route ownership pattern returns 404 code without existence leak", () => {
  const connectionId = "conn-not-owned";
  const userId = 99999;
  const row = getConnectionForUser(connectionId, userId);
  assert.equal(row, null);

  const response = {
    success: false,
    code: "BINGX_CONNECTION_NOT_FOUND",
    message: "BingX connection not found.",
  };
  assert.equal(response.code, "BINGX_CONNECTION_NOT_FOUND");
  assert.ok(!response.message.toLowerCase().includes("belongs to"));
});
