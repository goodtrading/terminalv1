import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Nautilus Paper path uses a Paper simulation context, not the live default", () => {
  const ticket = read("client/src/components/terminal/execution/PaperOrderTicket.tsx");
  const adapter = read("client/src/lib/nautilusPaperMarketAdapter.ts");
  const port = read("client/src/lib/paperExecutionPort.ts");

  assert.match(adapter, /NautilusPaperSimulationContext/);
  assert.match(ticket, /NAUTILUS_PAPER_SIMULATION_CONTEXT/);
  assert.doesNotMatch(ticket, /executionContext:\s*DEFAULT_TERMINAL_EXECUTION_CONTEXT/);
  assert.doesNotMatch(port, /return input\.executionContext \?\? DEFAULT_TERMINAL_EXECUTION_CONTEXT/);
});

test("Nautilus Paper simulation context identifies Paper without requiring a broker", () => {
  const adapter = read("client/src/lib/nautilusPaperMarketAdapter.ts");
  const canonical = adapter.slice(
    adapter.indexOf("export type NautilusPaperSimulationContext"),
    adapter.indexOf("export type NautilusPaperMarketOrderIntent"),
  );
  assert.match(canonical, /executionDomain:\s*"paper"/);
  assert.doesNotMatch(canonical, /executionExchange:\s*"bingx"/);
});
