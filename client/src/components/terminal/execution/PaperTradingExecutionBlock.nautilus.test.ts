import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "client/src/components/terminal/execution/PaperTradingExecutionBlock.tsx"),
  "utf8",
);

test("Paper execution UI exposes the existing Legacy/Nautilus backend control", () => {
  assert.match(source, /Execution engine/);
  assert.match(source, />\s*Legacy\s*</);
  assert.match(source, />\s*Nautilus\s*</);
  assert.match(source, /createNautilusPaperDevControl/);
  assert.match(source, /isTauriRuntime/);
});

test("Paper remains the workspace while backend selection stays separate", () => {
  assert.match(source, /mode=\{isPaperWorkspace \? "paper" : "live"\}/);
  assert.match(source, /backend === \"legacy\"/);
  assert.match(source, /backend === \"nautilus\"/);
});
