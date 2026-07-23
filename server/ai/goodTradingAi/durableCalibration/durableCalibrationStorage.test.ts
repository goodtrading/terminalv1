/**
 * AI-7.3.9 — Durable calibration storage suite.
 * Never creates real HUMAN production sessions for Ignacio.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assessStorageHealth,
  assertHumanSessionsAllowed,
} from "./health";
import { resetDurableReposForTests, getDurableRepos } from "./factory";
import {
  exportCalibrationBackup,
  importCalibrationBackup,
} from "./backup";
import { attemptLegitimateRecovery } from "./recovery";
import { resetCriticalCalibrationMemoryForTests } from "../criticalCalibration/memoryStore";
import { startCriticalCalibrationSession } from "../criticalCalibration/sessionService";

const PREV: Record<string, string | undefined> = {};

function setEnv(k: string, v: string | undefined) {
  if (!(k in PREV)) PREV[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

function restoreEnv() {
  for (const [k, v] of Object.entries(PREV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(PREV)) delete PREV[k];
}

describe("AI-7.3.9 durable calibration storage", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gt-ai739-"));
    resetDurableReposForTests();
    resetCriticalCalibrationMemoryForTests(join(dir, "cc"));
    setEnv("NODE_ENV", "test");
    setEnv("GOODTRADING_AI_REVIEW_REPOSITORY", "file");
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "false");
    setEnv("GOODTRADING_AI_CRITICAL_CALIBRATION_DIR", join(dir, "cc"));
    setEnv("GOODTRADING_AI_HUMAN_REVIEW_DIR", join(dir, "hr"));
    setEnv("GOODTRADING_AI_KNOWLEDGE_DISTILLATION_DIR", join(dir, "kd"));
    delete process.env.GOODTRADING_AI_REVIEW_VOLUME_PATH;
  });

  afterEach(() => {
    restoreEnv();
    resetDurableReposForTests();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("file mode without durable required is usable locally", async () => {
    const h = await assessStorageHealth();
    assert.equal(h.mode, "file");
    assert.equal(h.humanSessionsAllowed, true);
    assert.equal(h.ephemeralFilesystemAuthority, false);
  });

  it("file mode + durable required → UNSAFE_EPHEMERAL and blocks HUMAN", async () => {
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "true");
    setEnv("GOODTRADING_AI_REVIEW_REPOSITORY", "file");
    const h = await assessStorageHealth({ priorHumanLossSuspected: true });
    assert.equal(h.status, "UNSAFE_EPHEMERAL");
    assert.equal(h.humanSessionsAllowed, false);
    assert.equal(h.distillationAllowed, false);
    assert.equal(h.lossClassification, "EPHEMERAL_FILESYSTEM_DATA_LOSS");
    assert.throws(() => assertHumanSessionsAllowed(h), /UNSAFE_EPHEMERAL_STORAGE/);
  });

  it("volume mode with configured path → DURABLE_READY", async () => {
    const vol = join(dir, "volume");
    setEnv("GOODTRADING_AI_REVIEW_REPOSITORY", "volume");
    setEnv("GOODTRADING_AI_REVIEW_VOLUME_PATH", vol);
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "true");
    resetDurableReposForTests();
    const h = await assessStorageHealth();
    assert.equal(h.status, "DURABLE_READY");
    assert.equal(h.repositoryDurable, true);
    assert.equal(h.repositoryWritable, true);
    assert.equal(h.repositoryReadable, true);
    assert.equal(h.humanSessionsAllowed, true);
    assert.equal(h.distillationAllowed, true);
    assert.equal(h.infraClassification, "ACCEPTABLE_RAILWAY_VOLUME_SINGLE_INSTANCE");
  });

  it("persists TECHNICAL session across repo instances (volume)", async () => {
    const vol = join(dir, "volume2");
    setEnv("GOODTRADING_AI_REVIEW_REPOSITORY", "volume");
    setEnv("GOODTRADING_AI_REVIEW_VOLUME_PATH", vol);
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "true");
    setEnv("GOODTRADING_AI_CRITICAL_CALIBRATION_DIR", join(vol, "critical-calibration"));
    resetDurableReposForTests();
    resetCriticalCalibrationMemoryForTests(join(vol, "critical-calibration"));
    const repos1 = await getDurableRepos(true);
    const started = startCriticalCalibrationSession({
      seed: "ai739",
      initialQuestionCount: 2,
      kind: "TECHNICAL",
      label: "tech-persistence-probe",
    });
    await repos1.criticalCalibration.saveSession(started.session);
    const id = started.session.id;
    resetDurableReposForTests();
    resetCriticalCalibrationMemoryForTests(join(vol, "critical-calibration-b"));
    setEnv("GOODTRADING_AI_CRITICAL_CALIBRATION_DIR", join(vol, "critical-calibration"));
    const repos2 = await getDurableRepos(true);
    const loaded = await repos2.criticalCalibration.getSession(id);
    assert.ok(loaded);
    assert.equal(loaded!.kind, "TECHNICAL");
    assert.equal(loaded!.id, id);
  });

  it("export/import dry-run no overwrite and no TECHNICAL→HUMAN", async () => {
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "false");
    const repos = await getDurableRepos(true);
    const session = {
      id: "tech-export-import-fixture",
      seed: "fixture",
      questionIds: ["q1", "q2"],
      createdAtMs: Date.now(),
      mentorEligible: false as const,
      brainMutate: false as const,
      autoApply: false as const,
      appendOnly: true as const,
      version: "critical-calibration/v1" as const,
      kind: "TECHNICAL" as const,
      revealedQuestionIds: [] as string[],
      deferredQuestionIds: [] as string[],
      archived: false,
      label: "export-import-fixture",
    };
    await repos.criticalCalibration.saveSession(session as never);
    repos.ccMemory.saveSession(session as never);
    const backup = await exportCalibrationBackup();
    assert.equal(backup.version, "CalibrationSessionBackup/v1");
    assert.equal(backup.sanitized, true);
    assert.equal(backup.brainMutate, false);
    assert.ok(backup.sessions.length >= 1);

    // Fresh empty store for import
    const emptyDir = join(dir, "import-target");
    setEnv("GOODTRADING_AI_CRITICAL_CALIBRATION_DIR", emptyDir);
    resetDurableReposForTests();
    resetCriticalCalibrationMemoryForTests(emptyDir);
    const repos2 = await getDurableRepos(true);
    const dry = await importCalibrationBackup(backup, { dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.ok(dry.importedSessions >= 1);
    const applied = await importCalibrationBackup(backup, { dryRun: false });
    assert.ok(applied.importedSessions >= 1);
    const loaded = await repos2.criticalCalibration.getSession(session.id);
    assert.equal(loaded?.kind, "TECHNICAL");

    const promoted = {
      ...backup,
      sessions: backup.sessions.map((x) => ({ ...x, kind: "HUMAN" })),
    };
    const blocked = await importCalibrationBackup(promoted, { dryRun: false });
    assert.ok(blocked.skippedExisting >= 1);
    const still = await repos2.criticalCalibration.getSession(session.id);
    assert.equal(still?.kind, "TECHNICAL");
  });

  it("no silent memory fallback when durable required and volume missing", async () => {
    setEnv("GOODTRADING_AI_REVIEW_REPOSITORY", "volume");
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "true");
    delete process.env.GOODTRADING_AI_REVIEW_VOLUME_PATH;
    const h = await assessStorageHealth();
    assert.notEqual(h.status, "DURABLE_READY");
    assert.equal(h.humanSessionsAllowed, false);
    assert.equal(h.distillationAllowed, false);
  });

  it("recovery does not invent answers → NOT_RECOVERABLE when empty", async () => {
    const r = await attemptLegitimateRecovery();
    assert.equal(r.inventRecovery, false);
    assert.equal(r.brainMutate, false);
    assert.ok(["NOT_RECOVERABLE", "PARTIALLY_RECOVERED", "RECOVERED"].includes(r.outcome));
    if (r.humanSessionsFound === 0 && r.humanObservationsFound === 0) {
      assert.equal(r.outcome, "NOT_RECOVERABLE");
    }
    assert.ok(r.sourcesChecked.includes("engine-golden-excluded"));
    assert.ok(r.sourcesChecked.includes("redis-telemetry-excluded"));
  });

  it("volume path configured enables durable probe under volume root", async () => {
    const vol = join(dir, "vol-safe");
    setEnv("GOODTRADING_AI_REVIEW_REPOSITORY", "volume");
    setEnv("GOODTRADING_AI_REVIEW_VOLUME_PATH", vol);
    setEnv("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", "true");
    const h = await assessStorageHealth();
    assert.equal(h.volumePathConfigured, true);
    assert.ok(existsSync(join(vol, "critical-calibration")) || h.repositoryWritable);
  });
});
