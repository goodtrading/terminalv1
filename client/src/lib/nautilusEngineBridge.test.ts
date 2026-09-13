import assert from "node:assert/strict";
import test from "node:test";

import {
  createNautilusEngineBridge,
  EXPECTED_NAUTILUS_VERSION,
  NautilusEngineCommandError,
} from "./nautilusEngineBridge";

test("nautilus engine bridge invokes exact Tauri commands with no args", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge = createNautilusEngineBridge({
    isTauriRuntime: () => true,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      switch (command) {
        case "nautilus_engine_start":
        case "nautilus_engine_status":
        case "nautilus_engine_stop":
          return { state: "HEALTHY", pid: 1234, service: "daemon" } as T;
        case "nautilus_engine_ping":
          return { pong: true } as T;
        case "nautilus_engine_version":
          return {
            protocolVersion: 1,
            nautilusVersion: EXPECTED_NAUTILUS_VERSION,
            pythonVersion: "3.12.10",
            pid: 1234,
          } as T;
        default:
          throw new Error(`unexpected command ${command}`);
      }
    },
  });

  await bridge.status();
  await bridge.start();
  await bridge.ping();
  await bridge.version();
  await bridge.stop();

  assert.deepEqual(calls, [
    { command: "nautilus_engine_status", args: undefined },
    { command: "nautilus_engine_start", args: undefined },
    { command: "nautilus_engine_ping", args: undefined },
    { command: "nautilus_engine_version", args: undefined },
    { command: "nautilus_engine_stop", args: undefined },
  ]);
});

test("nautilus engine bridge rejects outside Tauri without invoking native IPC", async () => {
  let invoked = false;
  const bridge = createNautilusEngineBridge({
    isTauriRuntime: () => false,
    invoke: async () => {
      invoked = true;
      return { state: "STOPPED" } as never;
    },
  });

  await assert.rejects(bridge.status(), (error: unknown) => {
    assert.ok(error instanceof NautilusEngineCommandError);
    assert.equal((error as NautilusEngineCommandError).category, "TRANSPORT");
    assert.equal((error as NautilusEngineCommandError).code, "native_unavailable");
    return true;
  });
  assert.equal(invoked, false);
});

test("nautilus engine bridge preserves structured native errors and normalizes malformed rejections", async () => {
  const structuredBridge = createNautilusEngineBridge({
    isTauriRuntime: () => true,
    invoke: async () => {
      throw {
        category: "ENGINE",
        code: "daemon_not_running",
        message: "nautilus daemon is not running",
        details: { pid: null },
      };
    },
  });

  await assert.rejects(structuredBridge.status(), (error: unknown) => {
    assert.ok(error instanceof NautilusEngineCommandError);
    const typed = error as NautilusEngineCommandError;
    assert.equal(typed.category, "ENGINE");
    assert.equal(typed.code, "daemon_not_running");
    assert.equal(typed.message, "nautilus daemon is not running");
    assert.deepEqual(typed.details, { pid: null });
    return true;
  });

  const malformedBridge = createNautilusEngineBridge({
    isTauriRuntime: () => true,
    invoke: async () => {
      throw 42;
    },
  });

  await assert.rejects(malformedBridge.status(), (error: unknown) => {
    assert.ok(error instanceof NautilusEngineCommandError);
    const typed = error as NautilusEngineCommandError;
    assert.equal(typed.category, "PROTOCOL");
    assert.equal(typed.code, "malformed_native_rejection");
    return true;
  });
});
