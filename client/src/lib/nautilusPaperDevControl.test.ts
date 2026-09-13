import assert from "node:assert/strict";
import test from "node:test";
import {
  createNautilusPaperDevControl,
  installNautilusPaperDevControl,
  shouldExposeNautilusPaperControl,
  shouldInstallNautilusPaperDevControl,
} from "./nautilusPaperDevControl";

test("Nautilus dev control installs only for DEV Tauri runtime", () => {
  assert.equal(shouldInstallNautilusPaperDevControl(true, true), true);
  assert.equal(shouldInstallNautilusPaperDevControl(true, false), false);
  assert.equal(shouldInstallNautilusPaperDevControl(false, true), false);
});

test("Nautilus Paper control is exposed for production Tauri only", () => {
  assert.equal(shouldExposeNautilusPaperControl(false, true), true);
  assert.equal(shouldExposeNautilusPaperControl(true, true), true);
  assert.equal(shouldExposeNautilusPaperControl(true, false), false);
  assert.equal(shouldExposeNautilusPaperControl(false, false), false);
});

test("desktop dev control exposes reads and no submit/cancel operations", async () => {
  const calls: string[] = [];
  const control = createNautilusPaperDevControl({
    setBackend: (backend) => {
      calls.push(`backend:${backend}`);
      return backend;
    },
    activate: async () => {
      calls.push("activate");
      return { backend: "nautilus", availability: "AVAILABLE", engine: "RUNNING", simulation: "RUNNING" };
    },
    deactivate: async () => {
      calls.push("deactivate");
      return { backend: "nautilus", availability: "UNAVAILABLE", engine: "STOPPED", simulation: "STOPPED" };
    },
    getState: () => ({ backend: "legacy", availability: "AVAILABLE", engine: "UNKNOWN", simulation: "UNKNOWN" }),
    getPosition: async () => { calls.push("position"); return { side: "LONG" }; },
    getAccount: async () => { calls.push("account"); return { accountId: "SIM-001" }; },
  });

  assert.deepEqual(Object.keys(control).sort(), ["activate", "deactivate", "getAccount", "getPosition", "status"]);
  assert.deepEqual(await control.activate(), { backend: "nautilus", availability: "AVAILABLE", engine: "RUNNING", simulation: "RUNNING" });
  assert.deepEqual(await control.deactivate(), { backend: "legacy", availability: "AVAILABLE", engine: "UNKNOWN", simulation: "UNKNOWN" });
  await control.getPosition();
  await control.getAccount();
  assert.deepEqual(calls, ["backend:nautilus", "activate", "deactivate", "backend:legacy", "position", "account"]);
});

test("install has no lifecycle side effects and is idempotent", () => {
  const target = {} as Window;
  installNautilusPaperDevControl({ dev: true, tauri: true, target });
  const first = target.__GT_NAUTILUS_PAPER_DEV__;
  installNautilusPaperDevControl({ dev: true, tauri: true, target });
  assert.ok(first);
  assert.ok(target.__GT_NAUTILUS_PAPER_DEV__);
  assert.notEqual(first, undefined);
});

test("install does not expose the control in web dev or production", () => {
  const webTarget = {} as Window;
  const productionTarget = {} as Window;
  installNautilusPaperDevControl({ dev: true, tauri: false, target: webTarget });
  installNautilusPaperDevControl({ dev: false, tauri: true, target: productionTarget });
  assert.equal(webTarget.__GT_NAUTILUS_PAPER_DEV__, undefined);
  assert.equal(productionTarget.__GT_NAUTILUS_PAPER_DEV__, undefined);
});
