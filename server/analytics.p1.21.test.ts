import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { calculateKeyLevels, findGammaFlip, parseOptionsCSV } from "./analytics";
import { MarketDataGateway } from "./market-gateway";
import { MemStorage } from "./storage";

const NOW_MS = Date.UTC(2026, 7, 30, 8, 0, 0);
const SPOT = 65_000;

function writeCsv(rows: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "p1-21-analytics-"));
  const file = join(dir, "fixture.csv");
  writeFileSync(
    file,
    [
      "instrument,gamma,open_interest,iv_bid,iv_ask",
      ...rows,
    ].join("\n"),
    "utf8",
  );
  return file;
}

function makeStorage(): MemStorage {
  return Object.create(MemStorage.prototype) as MemStorage;
}

async function withPinnedSpot<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = MarketDataGateway.getCachedTicker;
  (MarketDataGateway as any).getCachedTicker = () => ({ price: SPOT });
  try {
    return await fn();
  } finally {
    (MarketDataGateway as any).getCachedTicker = original;
  }
}

const positiveRows = [
  "BTC-27SEP26-64000-C,0.00001,100,50,50",
  "BTC-27SEP26-65000-P,0.00002,120,50,50",
  "BTC-27SEP26-66000-C,0.00003,80,50,50",
];

const multiStrikeRows = [
  "BTC-27SEP26-63000-C,0.00004,250,50,50",
  "BTC-27SEP26-65000-P,0.00005,300,50,50",
  "BTC-27SEP26-67000-C,0.00006,150,50,50",
  "BTC-25DEC26-70000-P,0.00007,200,50,50",
];

const zeroRows = [
  "BTC-27SEP26-64000-C,0,100,50,50",
  "BTC-27SEP26-65000-P,0,120,50,50",
];

const highRows = [
  "BTC-27SEP26-65000-C,0.0005,500000,50,50",
  "BTC-27SEP26-66000-P,0.0007,750000,50,50",
  "BTC-25DEC26-70000-C,0.001,1000000,50,50",
];

function assertUnavailable(levels: ReturnType<typeof calculateKeyLevels>, flip: number) {
  assert.equal(levels.shortGammaPocketStart, null);
  assert.equal(levels.shortGammaPocketEnd, null);
  assert.equal(levels.deepRiskPocketStart, null);
  assert.equal(levels.deepRiskPocketEnd, null);
  assert.notEqual(levels.shortGammaPocketStart, flip - 1000);
  assert.notEqual(levels.shortGammaPocketEnd, flip - 200);
}

test("P1.21 bootstrap short gamma pocket stays unavailable for unsigned positive GEX rows", () => {
  const data = parseOptionsCSV(writeCsv(positiveRows), NOW_MS);
  const levels = calculateKeyLevels(data, SPOT);
  const flip = findGammaFlip(data);

  assert.deepEqual(levels.gammaMagnets, []);
  assertUnavailable(levels, flip);
});

test("P1.21 bootstrap short gamma pocket stays unavailable across multiple positive strikes", () => {
  const data = parseOptionsCSV(writeCsv(multiStrikeRows), NOW_MS);
  const levels = calculateKeyLevels(data, SPOT);
  const flip = findGammaFlip(data);

  assert.deepEqual(levels.gammaMagnets, []);
  assertUnavailable(levels, flip);
});

test("P1.21 bootstrap short gamma pocket stays unavailable with zero gamma rows", () => {
  const data = parseOptionsCSV(writeCsv(zeroRows), NOW_MS);
  const levels = calculateKeyLevels(data, SPOT);
  const flip = findGammaFlip(data);

  assert.deepEqual(levels.gammaMagnets, []);
  assertUnavailable(levels, flip);
});

test("P1.21 bootstrap short gamma pocket stays unavailable even at very high positive gamma and OI", () => {
  const data = parseOptionsCSV(writeCsv(highRows), NOW_MS);
  const levels = calculateKeyLevels(data, SPOT);
  const flip = findGammaFlip(data);

  assert.deepEqual(levels.gammaMagnets, []);
  assertUnavailable(levels, flip);
});

test("P1.21 bootstrap short gamma pocket propagates as unavailable through storage", async () => {
  const storage = makeStorage();
  await withPinnedSpot(() => storage.recomputeAll(writeCsv(positiveRows)));
  const keyLevels = await storage.getKeyLevels();

  assert.deepEqual(keyLevels?.gammaMagnets, []);
  assert.equal(keyLevels?.shortGammaPocketStart, null);
  assert.equal(keyLevels?.shortGammaPocketEnd, null);
  assert.equal(keyLevels?.deepRiskPocketStart, null);
  assert.equal(keyLevels?.deepRiskPocketEnd, null);
});
