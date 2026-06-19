/**
 * Mobile terminal access service tests.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  __setMobileTerminalAccessResolverForTests,
  verifyMobileTerminalAccess,
} from "./mobileTerminalAccessService";

afterEach(() => {
  __setMobileTerminalAccessResolverForTests(null);
});

test("admin access allowed without subscription row", async () => {
  __setMobileTerminalAccessResolverForTests(async () => ({
    allowed: false,
    reason: "admin",
  }));
  const r = await verifyMobileTerminalAccess(1);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.capabilities.terminal_mobile_access, true);
});
