/**
 * AI-7.3.9 — Storage health assessment for Human Review / CC / KD.
 * Never logs secrets or full answers.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  storageHealthReportSchema,
  type InfraClassification,
  type LossClassification,
  type StorageHealthReport,
  type StorageHealthStatus,
} from "@shared/goodTradingAiDurableCalibration";
import { pool } from "../../../db";
import {
  getReviewRepositoryMode,
  getReviewVolumePath,
  isPostgresUrlConfigured,
  isReviewDurableRequired,
  resolveDurableRootDirs,
} from "./config";

export type ProbeResult = {
  readable: boolean;
  writable: boolean;
  evidence: string[];
};

async function probePostgres(): Promise<ProbeResult> {
  const evidence: string[] = [];
  if (!isPostgresUrlConfigured()) {
    evidence.push("DATABASE_URL absent");
    return { readable: false, writable: false, evidence };
  }
  if (!pool) {
    evidence.push("pg pool null despite DATABASE_URL");
    return { readable: false, writable: false, evidence };
  }
  try {
    await pool.query("SELECT 1 AS ok");
    evidence.push("postgres SELECT 1 ok");
    return { readable: true, writable: true, evidence };
  } catch {
    evidence.push("postgres probe failed");
    return { readable: false, writable: false, evidence };
  }
}

function probeFilesystemPath(root: string, label: string): ProbeResult {
  const evidence: string[] = [];
  try {
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
    const probe = join(root, `.durable-probe-${process.pid}.tmp`);
    writeFileSync(probe, "ok", "utf8");
    const round = readFileSync(probe, "utf8");
    unlinkSync(probe);
    if (round !== "ok") {
      evidence.push(`${label} readback mismatch`);
      return { readable: false, writable: false, evidence };
    }
    evidence.push(`${label} write/read ok`);
    return { readable: true, writable: true, evidence };
  } catch {
    evidence.push(`${label} probe failed`);
    return { readable: false, writable: false, evidence };
  }
}

function classifyInfra(input: {
  mode: ReturnType<typeof getReviewRepositoryMode>;
  postgresOk: boolean;
  volumeConfigured: boolean;
  ephemeralAuthority: boolean;
}): InfraClassification {
  if (input.mode === "postgres" && input.postgresOk) return "PREFERRED_EXISTING_POSTGRES";
  if (input.mode === "volume" && input.volumeConfigured) {
    return "ACCEPTABLE_RAILWAY_VOLUME_SINGLE_INSTANCE";
  }
  if (input.ephemeralAuthority) return "UNSAFE_EPHEMERAL_FILESYSTEM";
  if (isPostgresUrlConfigured()) return "PREFERRED_EXISTING_POSTGRES";
  if (input.volumeConfigured) return "ACCEPTABLE_RAILWAY_VOLUME_SINGLE_INSTANCE";
  return "REQUIRES_NEW_INFRASTRUCTURE";
}

export async function assessStorageHealth(opts?: {
  priorHumanLossSuspected?: boolean;
}): Promise<StorageHealthReport> {
  const mode = getReviewRepositoryMode();
  const durableRequired = isReviewDurableRequired();
  const volumePath = getReviewVolumePath();
  const volumePathConfigured = Boolean(volumePath);
  const dirs = resolveDurableRootDirs(mode);
  const evidence: string[] = [`mode=${mode}`, `durableRequired=${durableRequired}`];

  let repositoryReadable = false;
  let repositoryWritable = false;
  let postgresAvailable = false;
  let ephemeralFilesystemAuthority = false;
  let repositoryDurable = false;
  let lossClassification: LossClassification | null = null;

  if (mode === "postgres") {
    const pg = await probePostgres();
    postgresAvailable = pg.readable && pg.writable;
    repositoryReadable = pg.readable;
    repositoryWritable = pg.writable;
    repositoryDurable = postgresAvailable;
    evidence.push(...pg.evidence);
    if (!postgresAvailable) lossClassification = "REPOSITORY_CONFIGURATION_ERROR";
  } else if (mode === "volume") {
    if (!volumePath || !dirs.criticalCalibrationDir) {
      evidence.push("volume path missing");
      repositoryDurable = false;
      lossClassification = "REPOSITORY_CONFIGURATION_ERROR";
    } else {
      const probe = probeFilesystemPath(dirs.criticalCalibrationDir, "volume");
      repositoryReadable = probe.readable;
      repositoryWritable = probe.writable;
      repositoryDurable = probe.readable && probe.writable;
      evidence.push(...probe.evidence);
      evidence.push("volume mode single-instance only");
    }
  } else {
    const root =
      dirs.criticalCalibrationDir ||
      join(process.cwd(), "server", "storage", "critical-calibration");
    const probe = probeFilesystemPath(root, "file");
    repositoryReadable = probe.readable;
    repositoryWritable = probe.writable;
    evidence.push(...probe.evidence);
    ephemeralFilesystemAuthority = process.env.NODE_ENV === "production" || durableRequired;
    repositoryDurable = false;
    if (ephemeralFilesystemAuthority) {
      evidence.push("file mode without volume is ephemeral authority");
      lossClassification = "EPHEMERAL_FILESYSTEM_DATA_LOSS";
      void opts;
    }
  }

  const infraClassification = classifyInfra({
    mode,
    postgresOk: postgresAvailable || (isPostgresUrlConfigured() && mode !== "file"),
    volumeConfigured: volumePathConfigured,
    ephemeralAuthority: ephemeralFilesystemAuthority || (mode === "file" && durableRequired),
  });

  if (isPostgresUrlConfigured()) {
    evidence.push("DATABASE_URL configured (boolean)");
    if (mode === "file" && durableRequired) {
      evidence.push("recommend PREFERRED_EXISTING_POSTGRES");
    }
  }

  let status: StorageHealthStatus;
  if (!repositoryReadable && !repositoryWritable) status = "UNAVAILABLE";
  else if (mode === "file" && durableRequired) status = "UNSAFE_EPHEMERAL";
  else if (repositoryDurable && repositoryReadable && repositoryWritable) status = "DURABLE_READY";
  else if (repositoryReadable || repositoryWritable) {
    status = durableRequired ? "UNSAFE_EPHEMERAL" : "DURABLE_DEGRADED";
  } else status = "UNAVAILABLE";

  const humanSessionsAllowed =
    status === "DURABLE_READY" || (!durableRequired && status !== "UNAVAILABLE");
  const technicalOnlyNonDurable =
    durableRequired && status !== "DURABLE_READY" && status !== "UNAVAILABLE";
  const distillationAllowed = status === "DURABLE_READY";

  return storageHealthReportSchema.parse({
    status,
    mode,
    durableRequired,
    repositoryDurable,
    repositoryWritable,
    repositoryReadable,
    postgresAvailable: Boolean(process.env.DATABASE_URL?.trim()) && (mode !== "postgres" || repositoryDurable),
    volumePathConfigured,
    ephemeralFilesystemAuthority:
      ephemeralFilesystemAuthority || (mode === "file" && durableRequired),
    humanSessionsAllowed,
    technicalOnlyNonDurable,
    distillationAllowed,
    infraClassification:
      mode === "postgres" && repositoryDurable
        ? "PREFERRED_EXISTING_POSTGRES"
        : mode === "volume" && repositoryDurable
          ? "ACCEPTABLE_RAILWAY_VOLUME_SINGLE_INSTANCE"
          : mode === "file" && durableRequired
            ? "UNSAFE_EPHEMERAL_FILESYSTEM"
            : infraClassification,
    lossClassification,
    evidence: evidence.slice(0, 40),
    mentorEligible: false,
    brainMutate: false,
  });
}

export function assertHumanSessionsAllowed(health: StorageHealthReport): void {
  if (!health.humanSessionsAllowed) throw new Error("UNSAFE_EPHEMERAL_STORAGE");
}

export function assertDistillationAllowed(health: StorageHealthReport): void {
  if (!health.distillationAllowed) throw new Error("DISTILLATION_REQUIRES_DURABLE_STORAGE");
}
