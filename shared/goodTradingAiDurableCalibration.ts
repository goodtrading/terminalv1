/**
 * AI-7.3.9 — Durable Calibration Storage contracts.
 * No secrets. No Brain mutation. Redis is NOT an answer authority.
 */
import { z } from "zod";

export const REVIEW_REPOSITORY_MODES = ["file", "postgres", "volume"] as const;
export type ReviewRepositoryMode = (typeof REVIEW_REPOSITORY_MODES)[number];

export const STORAGE_HEALTH_STATUSES = [
  "DURABLE_READY",
  "DURABLE_DEGRADED",
  "UNSAFE_EPHEMERAL",
  "UNAVAILABLE",
] as const;
export type StorageHealthStatus = (typeof STORAGE_HEALTH_STATUSES)[number];

export const LOSS_CLASSIFICATIONS = [
  "EPHEMERAL_FILESYSTEM_DATA_LOSS",
  "REPOSITORY_CONFIGURATION_ERROR",
  "UNKNOWN",
] as const;
export type LossClassification = (typeof LOSS_CLASSIFICATIONS)[number];

export const RECOVERY_OUTCOMES = ["RECOVERED", "PARTIALLY_RECOVERED", "NOT_RECOVERABLE"] as const;
export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number];

export const INFRA_CLASSIFICATIONS = [
  "PREFERRED_EXISTING_POSTGRES",
  "ACCEPTABLE_RAILWAY_VOLUME_SINGLE_INSTANCE",
  "UNSAFE_EPHEMERAL_FILESYSTEM",
  "REQUIRES_NEW_INFRASTRUCTURE",
] as const;
export type InfraClassification = (typeof INFRA_CLASSIFICATIONS)[number];

export const reviewRepositoryModeSchema = z.enum(REVIEW_REPOSITORY_MODES);
export const storageHealthStatusSchema = z.enum(STORAGE_HEALTH_STATUSES);

export const storageHealthReportSchema = z
  .object({
    status: storageHealthStatusSchema,
    mode: reviewRepositoryModeSchema,
    durableRequired: z.boolean(),
    repositoryDurable: z.boolean(),
    repositoryWritable: z.boolean(),
    repositoryReadable: z.boolean(),
    postgresAvailable: z.boolean(),
    volumePathConfigured: z.boolean(),
    ephemeralFilesystemAuthority: z.boolean(),
    humanSessionsAllowed: z.boolean(),
    technicalOnlyNonDurable: z.boolean(),
    distillationAllowed: z.boolean(),
    infraClassification: z.enum(INFRA_CLASSIFICATIONS),
    lossClassification: z.enum(LOSS_CLASSIFICATIONS).nullable(),
    evidence: z.array(z.string()).max(40),
    mentorEligible: z.literal(false),
    brainMutate: z.literal(false),
  })
  .strict();

export type StorageHealthReport = z.infer<typeof storageHealthReportSchema>;

export const CALIBRATION_SESSION_BACKUP_VERSION = "CalibrationSessionBackup/v1" as const;

export const calibrationSessionBackupSchema = z
  .object({
    version: z.literal(CALIBRATION_SESSION_BACKUP_VERSION),
    exportedAtMs: z.number().int().nonnegative(),
    sourceMode: reviewRepositoryModeSchema,
    sanitized: z.literal(true),
    sessions: z.array(z.record(z.unknown())).max(500),
    observations: z.array(z.record(z.unknown())).max(20000),
    proposals: z.array(z.record(z.unknown())).max(5000),
    humanReviewSessions: z.array(z.record(z.unknown())).max(500).optional(),
    humanReviewAnswers: z.array(z.record(z.unknown())).max(20000).optional(),
    distillationRuns: z.array(z.record(z.unknown())).max(200).optional(),
    distillationProposals: z.array(z.record(z.unknown())).max(5000).optional(),
    notes: z.array(z.string()).max(40).optional(),
    mentorEligible: z.literal(false),
    brainMutate: z.literal(false),
    autoApply: z.literal(false),
  })
  .strict();

export type CalibrationSessionBackup = z.infer<typeof calibrationSessionBackupSchema>;

export const importBackupOptionsSchema = z
  .object({
    dryRun: z.boolean().default(true),
    maxSessions: z.number().int().positive().max(500).default(200),
    maxObservations: z.number().int().positive().max(20000).default(5000),
    allowOverwrite: z.literal(false).default(false),
    allowTechnicalToHumanPromotion: z.literal(false).default(false),
  })
  .strict();

export type ImportBackupOptions = z.infer<typeof importBackupOptionsSchema>;

export const strictDistillationRunBodySchema = z
  .object({
    sourceSessionIds: z.array(z.string().min(1).max(128)).min(1).max(50),
    dryRun: z.boolean().optional().default(false),
    persist: z.boolean().optional().default(true),
    duplicatePolicy: z.enum(["REJECT", "ALLOW_NEW_RUN"]).optional().default("ALLOW_NEW_RUN"),
    fingerprint: z.string().min(8).max(128).optional(),
    /** Default independent-evidence-v1 (AI-7.3.12). document-v1 is legacy opt-in. */
    analysisVersion: z.enum(["document-v1", "independent-evidence-v1"]).optional(),
  })
  .strict();

export type StrictDistillationRunBody = z.infer<typeof strictDistillationRunBodySchema>;
