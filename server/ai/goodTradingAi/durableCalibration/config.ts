/**
 * AI-7.3.9 — Review repository mode / durability env (no secrets logged).
 */
import type { ReviewRepositoryMode } from "@shared/goodTradingAiDurableCalibration";
import { reviewRepositoryModeSchema } from "@shared/goodTradingAiDurableCalibration";

export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export function getReviewRepositoryMode(): ReviewRepositoryMode {
  const raw = process.env.GOODTRADING_AI_REVIEW_REPOSITORY?.trim().toLowerCase();
  if (!raw) return "file";
  const parsed = reviewRepositoryModeSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`INVALID_REVIEW_REPOSITORY_MODE:${raw}`);
  return parsed.data;
}

export function isReviewDurableRequired(): boolean {
  const explicit = process.env.GOODTRADING_AI_REVIEW_DURABLE_REQUIRED;
  if (explicit != null && explicit.trim() !== "") {
    return envBool("GOODTRADING_AI_REVIEW_DURABLE_REQUIRED", false);
  }
  const prod = process.env.NODE_ENV === "production";
  const cc = envBool("GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED", false);
  const hr = envBool("GOODTRADING_AI_DECISION_REVIEW_ENABLED", false);
  return prod && (cc || hr);
}

export function getReviewVolumePath(): string | null {
  const p = process.env.GOODTRADING_AI_REVIEW_VOLUME_PATH?.trim();
  return p || null;
}

export function isPostgresUrlConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function resolveDurableRootDirs(mode: ReviewRepositoryMode): {
  humanReviewDir: string | null;
  criticalCalibrationDir: string | null;
  knowledgeDistillationDir: string | null;
} {
  if (mode === "volume") {
    const root = getReviewVolumePath();
    if (!root) {
      return { humanReviewDir: null, criticalCalibrationDir: null, knowledgeDistillationDir: null };
    }
    const base = root.replace(/[/\\]+$/, "");
    return {
      humanReviewDir: `${base}/human-decision-review`,
      criticalCalibrationDir: `${base}/critical-calibration`,
      knowledgeDistillationDir: `${base}/knowledge-distillation`,
    };
  }
  return {
    humanReviewDir: process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR?.trim() || null,
    criticalCalibrationDir: process.env.GOODTRADING_AI_CRITICAL_CALIBRATION_DIR?.trim() || null,
    knowledgeDistillationDir: process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_DIR?.trim() || null,
  };
}
