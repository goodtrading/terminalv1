/**
 * AI-7.2 — Holdout mechanism (first-run preservation).
 * Holdout cases are isolated from calibration adjustments.
 * Does NOT require Ignacio completion to exist.
 */
import { createHash } from "node:crypto";
import { listHoldoutCases } from "./reviewCases";

export type HoldoutSnapshot = {
  version: "ai-7.2";
  capturedAtMs: number;
  caseIds: string[];
  fingerprint: string;
  note: string;
};

/** Stable fingerprint of holdout set for first-run preservation. */
export function computeHoldoutFingerprint(caseIds: string[] = listHoldoutCases().map((c) => c.id)): string {
  const sorted = [...caseIds].sort();
  return createHash("sha256").update(sorted.join("|")).digest("hex");
}

export function createHoldoutSnapshot(nowMs = Date.now()): HoldoutSnapshot {
  const caseIds = listHoldoutCases().map((c) => c.id).sort();
  return {
    version: "ai-7.2",
    capturedAtMs: nowMs,
    caseIds,
    fingerprint: computeHoldoutFingerprint(caseIds),
    note: "Holdout isolated from calibration adjustments; first-run preservation.",
  };
}

/**
 * If a prior snapshot exists, verify fingerprint unchanged.
 * Returns ok=false if holdout set drifted (would invalidate isolation).
 */
export function verifyHoldoutPreservation(
  prior: HoldoutSnapshot | null,
  currentIds: string[] = listHoldoutCases().map((c) => c.id),
): { ok: boolean; reason: string; currentFingerprint: string } {
  const currentFingerprint = computeHoldoutFingerprint(currentIds);
  if (!prior) {
    return { ok: true, reason: "no_prior_snapshot", currentFingerprint };
  }
  if (prior.fingerprint !== currentFingerprint) {
    return {
      ok: false,
      reason: "holdout_fingerprint_drift",
      currentFingerprint,
    };
  }
  return { ok: true, reason: "preserved", currentFingerprint };
}
