import assert from "node:assert/strict";
import test from "node:test";
import { createGoodTradingAccountContextCoordinator } from "./GoodTradingAccountContext";
import { bindPaperOwner, getPaperOwner, resetPaperOwnerForTests } from "../lib/paperOwnerContext";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("starts idle and binds an authenticated user exactly once", async () => {
  let calls = 0;
  const coordinator = createGoodTradingAccountContextCoordinator(async () => {
    calls += 1;
    return "GT-A";
  });
  assert.equal(coordinator.getState().status, "idle");
  await coordinator.bind(10);
  assert.deepEqual(coordinator.getState(), { accountUid: "GT-A", status: "ready", ownerUserId: 10, generation: 1, error: null });
  assert.equal(calls, 1);
});

test("stale A response cannot overwrite B context", async () => {
  const a = deferred<string>();
  const b = deferred<string>();
  let call = 0;
  const coordinator = createGoodTradingAccountContextCoordinator(() => ++call === 1 ? a.promise : b.promise);
  const aBind = coordinator.bind(10);
  const bBind = coordinator.bind(20);
  b.resolve("GT-B");
  await bBind;
  a.resolve("GT-A");
  await aBind;
  assert.equal(coordinator.getState().accountUid, "GT-B");
  assert.equal(coordinator.getState().ownerUserId, 20);
  assert.equal(coordinator.getState().status, "ready");
});

test("logout invalidates context and stale same-user response", async () => {
  const response = deferred<string>();
  const coordinator = createGoodTradingAccountContextCoordinator(() => response.promise);
  const pending = coordinator.bind(10);
  const generation = coordinator.getState().generation;
  coordinator.invalidate();
  response.resolve("GT-A");
  await pending;
  assert.equal(coordinator.getState().accountUid, null);
  assert.equal(coordinator.getState().ownerUserId, null);
  assert.equal(coordinator.getState().status, "idle");
  assert.ok(coordinator.getState().generation > generation);
});

test("same-user relogin keeps durable UID but uses a new generation", async () => {
  const coordinator = createGoodTradingAccountContextCoordinator(async () => "GT-A");
  await coordinator.bind(10);
  const firstGeneration = coordinator.getState().generation;
  coordinator.invalidate();
  await coordinator.bind(10);
  assert.equal(coordinator.getState().accountUid, "GT-A");
  assert.equal(coordinator.getState().ownerUserId, 10);
  assert.ok(coordinator.getState().generation > firstGeneration);
});

test("account context owner agrees with the authenticated Paper owner", async () => {
  resetPaperOwnerForTests();
  bindPaperOwner(10);
  const coordinator = createGoodTradingAccountContextCoordinator(async () => "GT-A");
  await coordinator.bind(10);
  assert.equal(coordinator.getState().ownerUserId, getPaperOwner()?.userId);
  resetPaperOwnerForTests();
});

test("bootstrap failure remains unavailable and does not create a fallback UID", async () => {
  const coordinator = createGoodTradingAccountContextCoordinator(async () => { throw new Error("NETWORK"); });
  await coordinator.bind(10);
  assert.equal(coordinator.getState().status, "error");
  assert.equal(coordinator.getState().accountUid, null);
});
