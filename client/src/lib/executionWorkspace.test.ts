import assert from "node:assert/strict";
import test from "node:test";
import {
  getExecutionWorkspace,
  hydrateExecutionWorkspace,
  setExecutionWorkspace,
} from "./executionWorkspace";
import {
  getPaperExecutionBackendState,
  setPaperExecutionBackendState,
} from "./paperExecutionBackendState";

test("execution workspace selects Paper without a broker session", () => {
  setExecutionWorkspace("bingx");
  assert.equal(getExecutionWorkspace(), "bingx");

  setExecutionWorkspace("paper");
  assert.equal(getExecutionWorkspace(), "paper");
});

test("execution workspace selection does not alter its independent backend concept", () => {
  setPaperExecutionBackendState("legacy");
  setExecutionWorkspace("paper");
  assert.equal(getExecutionWorkspace(), "paper");
  assert.equal(getPaperExecutionBackendState(), "legacy");

  setExecutionWorkspace("bingx");
  assert.equal(getExecutionWorkspace(), "bingx");
  setPaperExecutionBackendState("nautilus");
  assert.equal(getPaperExecutionBackendState(), "nautilus");
  assert.equal(getExecutionWorkspace(), "bingx");
});

test("execution workspace persists and rehydrates from its dedicated key", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });

  setExecutionWorkspace("paper");
  assert.equal(values.get("goodtrading.executionWorkspace.v1"), "paper");

  values.set("goodtrading.executionWorkspace.v1", "paper");
  hydrateExecutionWorkspace(false);
  assert.equal(getExecutionWorkspace(), "paper");
});

test("new workspace key takes precedence over legacy Paper session", () => {
  const values = new Map([["goodtrading.executionWorkspace.v1", "bingx"]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  hydrateExecutionWorkspace(true);
  assert.equal(getExecutionWorkspace(), "bingx");
});

test("legacy Paper session migrates one-way into the new workspace key", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  hydrateExecutionWorkspace(true);
  assert.equal(getExecutionWorkspace(), "paper");
  assert.equal(values.get("goodtrading.executionWorkspace.v1"), "paper");
});

test("selecting Paper leaves an existing BingX session unchanged", () => {
  const bingxSession = {
    exchange: "bingx",
    connected: true,
    connectionId: "X",
  } as const;
  const before = { ...bingxSession };

  setExecutionWorkspace("paper");

  assert.deepEqual(bingxSession, before);
  setExecutionWorkspace("bingx");
  assert.equal(bingxSession.connectionId, "X");
});
