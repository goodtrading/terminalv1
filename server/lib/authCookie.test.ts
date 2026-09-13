import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthCookieOptions } from "./authCookie";

test("production auth cookie is cross-site credential compatible and protected", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const options = getAuthCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "none");
  assert.equal(options.path, "/");
  assert.equal(options.domain, undefined);
  assert.equal(options.maxAge, 7 * 24 * 60 * 60 * 1000);
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
});
