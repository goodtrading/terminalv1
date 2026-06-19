/**
 * Deep legacy contract test for GET /api/mobile/state adapter shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeTerminalStateFixture } from "./fixtures";
import {
  legacyContractShape,
  normalizeLegacyMobileContract,
} from "./legacyMobileContract.normalizer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_SHAPE_PATH = join(__dirname, "legacyMobileContract.shape.json");

test("legacy adapter deep contract matches golden shape", async () => {
  const { adaptTerminalStateForMobile } = await import("../../../mobile-adapter");
  const ts = makeTerminalStateFixture();
  const mobile = adaptTerminalStateForMobile(ts);
  const normalized = normalizeLegacyMobileContract(
    mobile as unknown as Record<string, unknown>,
  );
  const shape = legacyContractShape(normalized);
  const golden = JSON.parse(readFileSync(GOLDEN_SHAPE_PATH, "utf8"));
  assert.deepEqual(shape, golden);
});

test("legacy adapter normalized payload is stable across calls", async () => {
  const { adaptTerminalStateForMobile } = await import("../../../mobile-adapter");
  const ts = makeTerminalStateFixture();
  const a = normalizeLegacyMobileContract(
    adaptTerminalStateForMobile(ts) as unknown as Record<string, unknown>,
  );
  const b = normalizeLegacyMobileContract(
    adaptTerminalStateForMobile(ts) as unknown as Record<string, unknown>,
  );
  assert.deepEqual(a, b);
});
