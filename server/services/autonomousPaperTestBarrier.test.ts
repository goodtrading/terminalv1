import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { awaitAutonomousPaperBarrier } from "./autonomousPaperTestBarrier";

test("autonomous PAPER barrier is inert unless explicitly armed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "gt-n13b-barrier-"));
  const previousRoot = process.env.GT_N13B_BARRIER_ROOT;
  const previousNames = process.env.GT_N13B_BARRIER_NAMES;
  try {
    delete process.env.GT_N13B_BARRIER_ROOT;
    delete process.env.GT_N13B_BARRIER_NAMES;
    await awaitAutonomousPaperBarrier("AFTER_INTENT_CREATED");
    process.env.GT_N13B_BARRIER_ROOT = root;
    process.env.GT_N13B_BARRIER_NAMES = "AFTER_INTENT_CREATED";
    const waiting = awaitAutonomousPaperBarrier("AFTER_INTENT_CREATED");
    await new Promise((resolve) => setTimeout(resolve, 25));
    await writeFile(path.join(root, "release-AFTER_INTENT_CREATED"), "release\n");
    await waiting;
    const reached = JSON.parse(await readFile(path.join(root, "reached-AFTER_INTENT_CREATED.json"), "utf8")) as Record<string, unknown>;
    assert.equal(reached.name, "AFTER_INTENT_CREATED");
  } finally {
    if (previousRoot === undefined) delete process.env.GT_N13B_BARRIER_ROOT; else process.env.GT_N13B_BARRIER_ROOT = previousRoot;
    if (previousNames === undefined) delete process.env.GT_N13B_BARRIER_NAMES; else process.env.GT_N13B_BARRIER_NAMES = previousNames;
    await rm(root, { recursive: true, force: true });
  }
});
