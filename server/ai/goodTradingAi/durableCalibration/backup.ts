/**
 * AI-7.3.9 — CalibrationSessionBackup v1 export/import (sanitized, no overwrite, no TECHNICAL→HUMAN).
 */
import {
  CALIBRATION_SESSION_BACKUP_VERSION,
  calibrationSessionBackupSchema,
  importBackupOptionsSchema,
  type CalibrationSessionBackup,
  type ImportBackupOptions,
} from "@shared/goodTradingAiDurableCalibration";
import { getDurableRepos } from "./factory";
import { getReviewRepositoryMode } from "./config";

function sanitizeSession(s: Record<string, unknown>): Record<string, unknown> {
  const out = { ...s };
  delete out.rawSecrets;
  delete out.connectionString;
  return out;
}

function sanitizeObservation(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o };
  delete out.apiKey;
  delete out.token;
  delete out.password;
  return out;
}

export async function exportCalibrationBackup(): Promise<CalibrationSessionBackup> {
  const repos = await getDurableRepos();
  const sessions = (await repos.criticalCalibration.listSessions()).map((s) =>
    sanitizeSession(s as unknown as Record<string, unknown>),
  );
  const observations = (await repos.criticalCalibration.listObservations()).map((o) =>
    sanitizeObservation(o as unknown as Record<string, unknown>),
  );
  const proposals = (await repos.criticalCalibration.listProposals()).map(
    (p) => p as unknown as Record<string, unknown>,
  );
  const humanReviewSessions = (await repos.humanReview.listSessions()).map((s) =>
    sanitizeSession(s as unknown as Record<string, unknown>),
  );
  const humanReviewAnswers: Record<string, unknown>[] = [];
  for (const s of await repos.humanReview.listSessions()) {
    for (const a of await repos.humanReview.getAnswersForSession(s.id)) {
      humanReviewAnswers.push(sanitizeObservation(a as unknown as Record<string, unknown>));
    }
  }
  const runIds = await repos.knowledgeDistillation.listRunIds();
  const distillationRuns: Record<string, unknown>[] = [];
  for (const id of runIds.slice(-50)) {
    const run = await repos.knowledgeDistillation.getRun(id);
    if (run) distillationRuns.push({ id, ...(run as unknown as Record<string, unknown>) });
  }
  const distillationProposals = (await repos.knowledgeDistillation.listProposals()).map(
    (p) => p as unknown as Record<string, unknown>,
  );

  return calibrationSessionBackupSchema.parse({
    version: CALIBRATION_SESSION_BACKUP_VERSION,
    exportedAtMs: Date.now(),
    sourceMode: getReviewRepositoryMode(),
    sanitized: true,
    sessions,
    observations,
    proposals,
    humanReviewSessions,
    humanReviewAnswers,
    distillationRuns,
    distillationProposals,
    notes: ["AI-7.3.9 backup — brainMutate=false"],
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
  });
}

export type ImportBackupResult = {
  dryRun: boolean;
  importedSessions: number;
  importedObservations: number;
  skippedExisting: number;
  rejectedTechnicalToHuman: number;
  errors: string[];
  mentorEligible: false;
  brainMutate: false;
};

export async function importCalibrationBackup(
  raw: unknown,
  options?: Partial<ImportBackupOptions>,
): Promise<ImportBackupResult> {
  const opts = importBackupOptionsSchema.parse({
    dryRun: options?.dryRun ?? true,
    maxSessions: options?.maxSessions ?? 200,
    maxObservations: options?.maxObservations ?? 5000,
    allowOverwrite: false,
    allowTechnicalToHumanPromotion: false,
  });
  const backup = calibrationSessionBackupSchema.parse(raw);
  const repos = await getDurableRepos();
  const errors: string[] = [];
  let importedSessions = 0;
  let importedObservations = 0;
  let skippedExisting = 0;
  let rejectedTechnicalToHuman = 0;

  const sessions = backup.sessions.slice(0, opts.maxSessions);
  for (const s of sessions) {
    const id = String(s.id ?? "");
    if (!id) {
      errors.push("SESSION_MISSING_ID");
      continue;
    }
    const existing = await repos.criticalCalibration.getSession(id);
    if (existing) {
      skippedExisting += 1;
      if (existing.kind === "TECHNICAL" && s.kind === "HUMAN") {
        rejectedTechnicalToHuman += 1;
      }
      continue;
    }
    if (!opts.dryRun) {
      await repos.criticalCalibration.saveSession(s as never);
      repos.ccMemory.saveSession(s as never);
    }
    importedSessions += 1;
  }

  const observations = backup.observations.slice(0, opts.maxObservations);
  for (const o of observations) {
    const id = String(o.id ?? "");
    if (!id) {
      errors.push("OBSERVATION_MISSING_ID");
      continue;
    }
    const existingList = await repos.criticalCalibration.listObservations(
      typeof o.sessionId === "string" ? o.sessionId : undefined,
    );
    if (existingList.some((x) => x.id === id)) {
      skippedExisting += 1;
      continue;
    }
    if (!opts.dryRun) {
      await repos.criticalCalibration.saveObservation(o as never);
      repos.ccMemory.saveObservation(o as never);
    }
    importedObservations += 1;
  }

  return {
    dryRun: opts.dryRun,
    importedSessions,
    importedObservations,
    skippedExisting,
    rejectedTechnicalToHuman,
    errors: errors.slice(0, 40),
    mentorEligible: false,
    brainMutate: false,
  };
}
