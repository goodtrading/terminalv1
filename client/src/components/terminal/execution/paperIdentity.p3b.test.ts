import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";

const root = path.resolve(process.cwd(), "client/src/components/terminal/execution");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Paper client payload uses Paper identity and no external execution exchange", () => {
  const source = read("PaperOrderTicket.tsx");
  assert.match(source, /paperExecutionPort\.submitOrder/);
  assert.match(source, /executionContext:\s*NAUTILUS_PAPER_SIMULATION_CONTEXT/);
  assert.doesNotMatch(source, /executionExchange:\s*"bingx"/);
});

test("Paper validation and submit state do not require BingX", () => {
  assert.doesNotMatch(read("paperTicketSubmitState.ts"), /executionExchange\s*!==\s*"bingx"/);
  assert.doesNotMatch(read("paperTicketValidation.ts"), /Only BingX|executionExchange\s*!==\s*"bingx"/);
});

test("Paper UI does not present BingX as its execution venue", () => {
  const strip = read("ExecutionVenueStrip.tsx");
  assert.match(strip, /mode\s*===\s*"paper"/);
  assert.match(strip, /"Paper Perpetual"/);
  assert.match(strip, /:\s*`BingX Perpetual/);
  assert.doesNotMatch(read("PaperTradingExecutionBlock.tsx"), /Simulated BingX Perpetual/);
  assert.doesNotMatch(read("PaperOrderTicket.tsx"), /Simulated BingX Perpetual/);
});
