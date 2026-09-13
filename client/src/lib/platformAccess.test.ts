import test from "node:test";
import assert from "node:assert/strict";
import {
  getTerminalRedirect,
  resolvePlatformUser,
  shouldBypassSaasDisabledGate,
} from "./platformAccess";

test("dev active mock resolves to authenticated active access", () => {
  const user = resolvePlatformUser(
    { authenticated: false, accessAllowed: false, emailVerified: false },
    "active",
  );

  assert.equal(user.isAuthenticated, true);
  assert.equal(user.hasActiveSubscription, true);
  assert.equal(user.emailVerified, true);
  assert.equal(getTerminalRedirect(user), "/terminal");
});

test("dev visitor mock stays unauthenticated", () => {
  const user = resolvePlatformUser(
    { authenticated: true, accessAllowed: true, emailVerified: true },
    "visitor",
  );

  assert.equal(user.isAuthenticated, false);
  assert.equal(user.hasActiveSubscription, false);
  assert.equal(user.emailVerified, false);
  assert.equal(getTerminalRedirect(user), "/login");
});

test("dev logged-in-no-plan mock stays authenticated without active access", () => {
  const user = resolvePlatformUser(
    { authenticated: false, accessAllowed: false, emailVerified: true },
    "logged_in",
  );

  assert.equal(user.isAuthenticated, true);
  assert.equal(user.hasActiveSubscription, false);
  assert.equal(user.emailVerified, true);
  assert.equal(getTerminalRedirect(user), "/pricing");
});

test("dev active mock bypasses SaaS-disabled gate only in development", () => {
  assert.equal(shouldBypassSaasDisabledGate("active", true), true);
  assert.equal(shouldBypassSaasDisabledGate("active", false), false);
});

test("non-active dev mock never bypasses SaaS-disabled gate", () => {
  assert.equal(shouldBypassSaasDisabledGate("visitor", true), false);
  assert.equal(shouldBypassSaasDisabledGate("logged_in", true), false);
  assert.equal(shouldBypassSaasDisabledGate("off", true), false);
});

test("real auth still uses the real session path when mock access is off", () => {
  const user = resolvePlatformUser(
    { authenticated: true, accessAllowed: false, emailVerified: true },
    "off",
  );

  assert.equal(user.isAuthenticated, true);
  assert.equal(user.hasActiveSubscription, false);
  assert.equal(user.emailVerified, true);
  assert.equal(getTerminalRedirect(user), "/pricing");
});
