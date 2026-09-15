import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPaperOwnerCurrent,
  bindPaperOwner,
  capturePaperOwner,
  enablePaperOwnershipEnforcement,
  getPaperOwner,
  invalidatePaperOwner,
  resetPaperOwnerForTests,
} from "./paperOwnerContext";

test.beforeEach(() => {
  resetPaperOwnerForTests();
  enablePaperOwnershipEnforcement();
});

test("starts unauthenticated and binds only a factual positive user id", () => {
  assert.equal(getPaperOwner(), null);
  assert.throws(() => bindPaperOwner(0), /PAPER_OWNER_USER_ID_INVALID/);
  const owner = bindPaperOwner(17);
  assert.deepEqual(owner, { userId: 17, generation: 1 });
  assert.deepEqual(capturePaperOwner(), owner);
});

test("logout invalidates the owner and its generation", () => {
  const owner = bindPaperOwner(17);
  invalidatePaperOwner();
  assert.equal(getPaperOwner(), null);
  assert.throws(() => assertPaperOwnerCurrent(owner), /PAPER_OWNER_GENERATION_STALE/);
  assert.throws(() => capturePaperOwner(), /PAPER_OWNER_NOT_BOUND/);
});

test("A to B and same-user relogin always receive new generations", () => {
  const first = bindPaperOwner(17);
  invalidatePaperOwner();
  const second = bindPaperOwner(42);
  assert.notEqual(first.generation, second.generation);
  assert.throws(() => assertPaperOwnerCurrent(first), /PAPER_OWNER_GENERATION_STALE/);
  invalidatePaperOwner();
  const relogin = bindPaperOwner(17);
  assert.notEqual(first.generation, relogin.generation);
});

test("current generation accepts its own response", () => {
  const owner = bindPaperOwner(17);
  assert.doesNotThrow(() => assertPaperOwnerCurrent(owner));
});
